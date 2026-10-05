import {getDentalReminderOptions} from '../../services/dental-reminder-configuration';
import {getDentalReminderTimezone} from '../../services/dental-reminder-timezone';
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage,ErpValidationError } from '../../storage';
import { requireAnyPermission } from '../../middleware';
import { resolveContactViewScope } from '../../../shared/contact-access';
import { realEstateAppointmentSchema } from '../../../shared/real-estate-schedule';
import { addDaysToDateKey } from '../../../shared/types/dental-schedule-calendar';
import { normalizeTimezone,validateTimezone,parseInZoneToUTC } from '../../utils/timezone';
import { getZonedDateTimeParts,getScheduleBoundsForDay,parseTimeToMinutes } from '../../../shared/utils/agent-schedule';
import {getActiveBreaksForDay,slotIntersectsAnyBreak} from '../../../shared/utils/calendar-breaks';
import {realEstateSettingsSchema} from '../../../shared/real-estate-reservations';

const router=Router(),read=['view_real_estate_schedule','manage_real_estate_schedule'];
async function timezone(companyId:number){
  const setting=await storage.getCompanySetting(companyId,'defaultTimezone');
  const zone=typeof setting?.value==='string'?normalizeTimezone(setting.value):'';
  if(!zone||!validateTimezone(zone))throw new ErpValidationError('Save a valid company timezone in General Settings before using Schedule.');
  return zone;
}
router.get('/schedule/reminder-timezone',requireAnyPermission([...read,'view_real_estate_settings','manage_real_estate_settings']),async(_req,res,next)=>{
  try{res.json(await getDentalReminderTimezone(res.locals.companyId));}catch(e){next(e);}
});
router.get('/schedule/reminder-options',requireAnyPermission([...read,'view_real_estate_settings','manage_real_estate_settings']),async(_req,res,next)=>{
  try{res.json({data:await getDentalReminderOptions(res.locals.companyId)});}catch(e){next(e);}
});
router.get('/schedule/reminder-deliveries',requireAnyPermission(read),async(req,res,next)=>{
  try{
    const companyId=res.locals.companyId,scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    if(!scope){res.json({data:[]});return;}
    const ids=(await getPool().query('SELECT DISTINCT a.contact_id FROM real_estate_appointments e JOIN contact_appointments a ON a.id=e.appointment_id AND a.company_id=e.company_id WHERE e.company_id=$1',[companyId])).rows.map(r=>r.contact_id);
    const allowed=await storage.getAccessibleContactIds(ids,{companyId,userId:req.user!.id,contactScope:scope});
    const rows=(await getPool().query(`SELECT j.appointment_id AS "appointmentId",j.rule_id AS "ruleId",j.status,
      j.scheduled_for AS "scheduledFor",j.sent_at AS "sentAt",j.last_error AS "lastError"
      FROM dental_appointment_reminders j JOIN real_estate_appointments e ON e.appointment_id=j.appointment_id AND e.company_id=j.company_id
      JOIN contact_appointments a ON a.id=e.appointment_id AND a.company_id=e.company_id
      WHERE j.company_id=$1 AND j.domain='real_estate' AND a.contact_id=ANY($2::int[])
      ORDER BY j.updated_at DESC,j.id DESC LIMIT 20`,[companyId,allowed])).rows;
    res.json({data:rows});
  }catch(e){next(e);}
});
router.get('/schedule/context',requireAnyPermission(read),async(_req,res,next)=>{
  try{const zone=await timezone(res.locals.companyId),agents=(await getPool().query('SELECT id,COALESCE(full_name,username) name FROM users WHERE company_id=$1 AND active=true ORDER BY name',[res.locals.companyId])).rows;res.json({timezone:zone,agents});}catch(error){next(error);}
});
router.get('/schedule',requireAnyPermission(read),async(req,res,next)=>{
  try{
    const companyId=res.locals.companyId,zone=await timezone(companyId);
    const value=z.object({from:z.string().date(),to:z.string().date(),agentId:z.coerce.number().int().positive().optional()}).strict().parse(req.query);
    if(value.to<value.from||new Date(value.to).getTime()-new Date(value.from).getTime()>92*86400000)throw new ErpValidationError('Select a date range of at most 93 days');
    const rows=(await getPool().query(`SELECT a.id,a.contact_id,a.title,a.description,a.location,a.scheduled_at,a.duration_minutes,a.status,a.updated_at,
      e.asset_id,e.agent_user_id,e.appointment_type,c.name contact_name,p.name asset_name,COALESCE(u.full_name,u.username) agent_name
      FROM real_estate_appointments e JOIN contact_appointments a ON a.id=e.appointment_id AND a.company_id=e.company_id
      JOIN contacts c ON c.id=a.contact_id AND c.company_id=a.company_id
      JOIN users u ON u.id=e.agent_user_id AND u.company_id=e.company_id
      LEFT JOIN real_estate_assets p ON p.id=e.asset_id AND p.company_id=e.company_id
      WHERE e.company_id=$1 AND a.scheduled_at>=$2 AND a.scheduled_at<$3 AND ($4::int IS NULL OR e.agent_user_id=$4)
      ORDER BY a.scheduled_at,a.id LIMIT 2001`,[companyId,parseInZoneToUTC(`${value.from}T00:00:00`,zone),parseInZoneToUTC(`${addDaysToDateKey(value.to,1)}T00:00:00`,zone),value.agentId??null])).rows;
    if(rows.length>2000)throw new ErpValidationError('Narrow the schedule range or agent filter');
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    const allowed=scope?await storage.getAccessibleContactIds([...new Set(rows.map(row=>row.contact_id))],{companyId,userId:req.user!.id,contactScope:scope}):[];
    // Contact visibility applies to appointment payloads, including title and notes.
    const assetIds=[...new Set(rows.map(row=>row.asset_id).filter(Boolean))];
    const assetKinds=assetIds.length?(await getPool().query('SELECT id,kind FROM real_estate_assets WHERE company_id=$1 AND id=ANY($2::int[])',[companyId,assetIds])).rows:[];
    const data=rows.filter(row=>allowed.includes(row.contact_id)).map(row=>{
      const asset=assetKinds.find(asset=>asset.id===row.asset_id),feature=asset?.kind==='unit'?'units':'properties';
      return asset&&!res.locals.permissions[`view_real_estate_${feature}`]&&!res.locals.permissions[`manage_real_estate_${feature}`]?{...row,asset_id:null,asset_name:null}:row;
    });
    res.json({data,timezone:zone});
  }catch(error){next(error);}
});
for(const method of ['post','patch'] as const){
 router[method](method==='post'?'/schedule':'/schedule/:id',requireAnyPermission(['manage_real_estate_schedule']),async(req,res,next)=>{
  const client=await getPool().connect();
  try{
    const companyId=res.locals.companyId,appointmentId=method==='patch'?z.coerce.number().int().positive().parse(req.params.id):null;
    const body=method==='patch'?realEstateAppointmentSchema.extend({updatedAt:z.string().datetime()}).parse(req.body):realEstateAppointmentSchema.parse(req.body);
    const zone=await timezone(companyId),start=parseInZoneToUTC(`${body.date}T${body.time}:00`,zone),parts=getZonedDateTimeParts(start,zone);
    if(parts.dateKey!==body.date||parts.timeMinutes!==Number(body.time.slice(0,2))*60+Number(body.time.slice(3)))throw new ErpValidationError('This local time does not exist in the company timezone');
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    const allowed=scope?await storage.getAccessibleContactIds([body.contactId],{companyId,userId:req.user!.id,contactScope:scope}):[];
    if(!allowed.length)throw new ErpValidationError('Contact not found');
    await client.query('BEGIN');
    // Serialize booking mutations by company to protect cross-agent asset collisions.
    await client.query('SELECT pg_advisory_xact_lock(78125,$1)',[companyId]);
    if(appointmentId){
      const old=(await client.query('SELECT a.updated_at,a.contact_id FROM contact_appointments a JOIN real_estate_appointments e ON e.appointment_id=a.id AND e.company_id=a.company_id WHERE a.company_id=$1 AND a.id=$2 FOR UPDATE OF a',[companyId,appointmentId])).rows[0];
      if(!old)throw new ErpValidationError('Appointment not found','not_found');
      const oldAllowed=scope?await storage.getAccessibleContactIds([old.contact_id],{companyId,userId:req.user!.id,contactScope:scope}):[];
      if(!oldAllowed.length)throw new ErpValidationError('Appointment not found','not_found');
      if(new Date(old.updated_at).toISOString()!==('updatedAt' in body?body.updatedAt:undefined))throw new ErpValidationError('Appointment changed. Reload before saving.','version_conflict');
    }
    const agent=await client.query('SELECT id FROM users WHERE company_id=$1 AND id=$2 AND active=true',[companyId,body.agentUserId]);
    if(!agent.rowCount)throw new ErpValidationError('Select an active company agent');
    if(body.assetId){
      const asset=(await client.query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2',[companyId,body.assetId])).rows[0];
      if(!asset)throw new ErpValidationError('Property not found');
      const feature=asset.kind==='unit'?'units':'properties';
      if(!res.locals.permissions[`view_real_estate_${feature}`]&&!res.locals.permissions[`manage_real_estate_${feature}`])throw new ErpValidationError('Property access required');
    }
    if(!['cancelled','completed','no_show'].includes(body.status)){
      const availability=await storage.getAgentInboxAvailabilitySettings(body.agentUserId,companyId);
      const settings=realEstateSettingsSchema.parse((await storage.getCompanySetting(companyId,'realEstateSettings'))?.value??{}),buffer=settings.scheduleBufferMinutes;
      if(availability?.isScheduleEnabled){
        const agentZone=availability.timezone||zone,local=getZonedDateTimeParts(start,agentZone),bounds=getScheduleBoundsForDay({...availability,scheduleMode:availability.scheduleMode as 'simple'|'advanced',businessHoursStart:availability.businessHoursStart??'09:00',businessHoursEnd:availability.businessHoursEnd??'17:00'},local.dayIndex);
        if(!bounds||local.timeMinutes-buffer<parseTimeToMinutes(bounds.startTime)||local.timeMinutes+body.durationMinutes+buffer>parseTimeToMinutes(bounds.endTime))throw new ErpValidationError('Appointment is outside agent working hours');
        const day=availability.advancedSettings?.weeklySchedule.find(d=>d.dayIndex===local.dayIndex);
        if(day&&slotIntersectsAnyBreak(local.timeMinutes-buffer,local.timeMinutes+body.durationMinutes+buffer,getActiveBreaksForDay(day)))throw new ErpValidationError('Appointment overlaps an agent break');
      }
      const conflict=await client.query(`SELECT 1 FROM real_estate_appointments e JOIN contact_appointments a ON a.id=e.appointment_id AND a.company_id=e.company_id
        WHERE e.company_id=$1 AND ($2::int IS NULL OR a.id<>$2) AND a.status IN('scheduled','confirmed')
        AND (e.agent_user_id=$3 OR ($4::int IS NOT NULL AND e.asset_id=$4) OR a.contact_id=$5)
        AND a.scheduled_at<$6::timestamp+make_interval(mins=>$7::int+$8::int) AND a.scheduled_at+make_interval(mins=>COALESCE(a.duration_minutes,60)+$8::int)>$6::timestamp LIMIT 1`,[companyId,appointmentId,body.agentUserId,body.assetId??null,body.contactId,start,body.durationMinutes,buffer]);
      if(conflict.rowCount)throw new ErpValidationError('Agent, contact, or property is already booked for this time','version_conflict');
    }
    const args=[companyId,body.contactId,body.title,body.description??null,body.location??null,start,body.durationMinutes,body.status];
    const saved=appointmentId?await client.query('UPDATE contact_appointments SET contact_id=$2,title=$3,description=$4,location=$5,scheduled_at=$6,duration_minutes=$7,status=$8,updated_at=now() WHERE company_id=$1 AND id=$9 RETURNING *',[...args,appointmentId])
      :await client.query("INSERT INTO contact_appointments(company_id,contact_id,title,description,location,scheduled_at,duration_minutes,status,type,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'meeting',$9) RETURNING *",[...args,req.user!.id]);
    const savedId=saved.rows[0].id;
    await client.query('INSERT INTO real_estate_appointments(appointment_id,company_id,asset_id,agent_user_id,appointment_type) VALUES($1,$2,$3,$4,$5) ON CONFLICT(appointment_id) DO UPDATE SET asset_id=EXCLUDED.asset_id,agent_user_id=EXCLUDED.agent_user_id,appointment_type=EXCLUDED.appointment_type',[savedId,companyId,body.assetId??null,body.agentUserId,body.appointmentType]);
    await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,'real_estate_appointment',$2,$3,$4,$5)",[companyId,savedId,appointmentId?'updated':'created',req.user!.id,JSON.stringify({status:body.status})]);
    await client.query('COMMIT');res.status(appointmentId?200:201).json({data:saved.rows[0]});
  }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
 });
}
export default router;
