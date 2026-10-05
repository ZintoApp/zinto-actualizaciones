import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { ensureDentalBusinessType } from './business-type';
import { getPool } from '../../db';
import { getDentalBookingPolicy } from '../../services/dental-booking-policy-service';
import { getDentalReminderOptions } from '../../services/dental-reminder-configuration';
import { resolveDentalReminderTimezone, DentalReminderTimezoneError } from '../../services/dental-reminder-timezone';
import { validateDentalReminderDeliverySettings } from '../../../shared/types/dental-reminder-types';
import { reminderBatchSchema, batchDeliverySettings, type ReminderBatchInput, type ReminderBatchOptions } from '../../../shared/types/dental-reminder-batches';
import { createDentalBatchRepository, type BatchRow } from '../../services/dental-batch-repository';
import { nextBatchTime, batchTargetDate } from '../../services/dental-batch-time';
import { getZonedDateTimeParts } from '../../../shared/utils/agent-schedule';

const router = Router();
const repository = createDentalBatchRepository(getPool);
class BatchError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const idSchema = z.coerce.number().int().positive();
const versionSchema = z.number().int().positive();
const expose = (row: BatchRow) => ({ ...row.config, id: row.id, state: row.state, timezone: row.timezone,
  nextRunAt: row.next_run_at?.toISOString() ?? null, version: row.version, latestRunStatus: row.latest_run_status ?? null });
function handler(fn: (companyId: number, req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try { const companyId = await ensureDentalBusinessType(req,res); if (companyId) await fn(companyId,req,res); }
    catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues.map(issue => issue.message).join(' '), details: error.issues });
      if (error instanceof DentalReminderTimezoneError) return res.status(422).json({ success:false,code:error.code,error:error.message });
      if (error instanceof BatchError) return res.status(error.status).json({ success:false,error:error.message });
      console.error('Dental reminder batch request failed', error);
      return res.status(500).json({ success:false,error:'Unable to process reminder schedules. Please retry.' });
    }
  };
}
async function options(companyId: number): Promise<ReminderBatchOptions> {
  const [providers,offices,policy] = await Promise.all([
    getPool().query(`SELECT id,COALESCE(full_name,username) AS name FROM users WHERE company_id=$1 ORDER BY name`,[companyId]),
    getPool().query(`SELECT id,name FROM dental_chairs WHERE company_id=$1 AND is_active=true ORDER BY sort_order,name`,[companyId]),
    getDentalBookingPolicy(companyId),
  ]);
  return { providers:providers.rows,offices:offices.rows,services:policy.bookableCatalog.filter(s=>s.isActive).map(s=>({id:s.id,name:s.label})),
    relativeRemindersEnabled:policy.automaticReminders.enabled };
}
async function validate(companyId: number, input: ReminderBatchInput, savedZone?: string) {
  const currentZone = await resolveDentalReminderTimezone(companyId);
  const timezone = input.mode === 'once' && savedZone ? savedZone : currentZone;
  const [choices,channels] = await Promise.all([options(companyId),getDentalReminderOptions(companyId)]);
  if (input.providerUserId && !choices.providers.some(p=>p.id===input.providerUserId)) throw new BatchError('Provider is unavailable.');
  if (input.chairId && !choices.offices.some(p=>p.id===input.chairId)) throw new BatchError('Office is unavailable.');
  if (input.serviceKey && !choices.services.some(p=>p.id===input.serviceKey)) throw new BatchError('Service is unavailable.');
  const errors = validateDentalReminderDeliverySettings(batchDeliverySettings(input),channels);
  if (errors.length) throw new BatchError(errors.map(e=>e.message).join(' '));
  let nextRunAt: Date;
  try { nextRunAt=nextBatchTime(input,timezone,new Date()); } catch (error) { throw new BatchError((error as Error).message); }
  if (nextRunAt<=new Date()) throw new BatchError('Choose a send time in the future.');
  return {timezone,nextRunAt};
}
const read = requireAnyPermission(['view_dental_schedule','manage_dental_schedule']);
const manage = requireAnyPermission(['manage_dental_schedule']);
router.get('/',read,handler(async(companyId,_req,res)=>{
  const rows = await getPool().query<BatchRow>(`SELECT b.*,
    (SELECT r.status FROM dental_reminder_batch_runs r WHERE r.batch_id=b.id ORDER BY r.id DESC LIMIT 1) AS latest_run_status
    FROM dental_reminder_batches b WHERE b.company_id=$1 ORDER BY b.id DESC`,[companyId]);
  res.json({success:true,data:rows.rows.map(expose)});
}));
router.get('/options',read,handler(async(companyId,_req,res)=>{res.json({success:true,data:await options(companyId)});}));
router.post('/preview',read,handler(async(companyId,req,res)=>{
  const body=z.object({config:reminderBatchSchema,id:idSchema.optional()}).strict().parse(req.body);
  let savedZone: string | undefined;
  if(body.id){
    const saved=(await getPool().query<BatchRow>('SELECT * FROM dental_reminder_batches WHERE company_id=$1 AND id=$2',[companyId,body.id])).rows[0];
    if(!saved) throw new BatchError('Schedule not found.',404);
    if(saved.config.mode==='once') savedZone=saved.timezone;
  }
  const timing=await validate(companyId,body.config,savedZone);
  const date=batchTargetDate(body.config,getZonedDateTimeParts(timing.nextRunAt,timing.timezone).dateKey);
  res.json({success:true,data:{...timing,appointmentDate:date,count:await repository.count(companyId,date,timing.timezone,body.config)}});
}));
router.post('/',manage,handler(async(companyId,req,res)=>{
  const input=reminderBatchSchema.parse(req.body);
  const timing=await validate(companyId,input);
  const result=await getPool().query<BatchRow>(`INSERT INTO dental_reminder_batches(company_id,config,timezone,next_run_at)
    VALUES($1,$2,$3,$4) RETURNING *`,[companyId,JSON.stringify(input),timing.timezone,timing.nextRunAt]);
  res.status(201).json({success:true,data:expose(result.rows[0])});
}));
router.patch('/:id',manage,handler(async(companyId,req,res)=>{
  const id=idSchema.parse(req.params.id);
  const body=z.object({version:versionSchema,config:reminderBatchSchema.optional(),state:z.enum(['active','paused','cancelled']).optional()}).strict()
    .refine(v=>Boolean(v.config)!==Boolean(v.state),'Provide configuration or state.').parse(req.body);
  const row=await repository.transaction(async client=>{
    const previous=(await client.query<BatchRow>('SELECT * FROM dental_reminder_batches WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,id])).rows[0];
    if(!previous) throw new BatchError('Schedule not found.',404);
    if(previous.version!==body.version) throw new BatchError('This schedule changed. Reload it before saving.',409);
    if(previous.state==='cancelled' || (previous.state==='completed' && body.state!=='cancelled')) throw new BatchError('This schedule has finished.',409);
    const config=body.config??previous.config;
    const state=body.state??previous.state;
    let timezone=previous.timezone;
    let next=previous.next_run_at;
    if(body.config || body.state==='active') {
      const timing=await validate(companyId,config,previous.config.mode==='once'?previous.timezone:undefined);
      timezone=timing.timezone; next=timing.nextRunAt;
    }
    if(state==='paused'||state==='cancelled') { next=null; await repository.stopPending(client,companyId,id); }
    return (await client.query<BatchRow>(`UPDATE dental_reminder_batches SET config=$3,state=$4,timezone=$5,next_run_at=$6,
      version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING *`,[companyId,id,JSON.stringify(config),state,timezone,next])).rows[0];
  });
  res.json({success:true,data:expose(row)});
}));
router.delete('/:id',manage,handler(async(companyId,req,res)=>{
  const id=idSchema.parse(req.params.id);
  const {version}=z.object({version:versionSchema}).strict().parse(req.body);
  await repository.transaction(async client=>{
    const row=(await client.query<BatchRow>(
      'SELECT * FROM dental_reminder_batches WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,id])).rows[0];
    if(!row) throw new BatchError('Schedule not found.',404);
    if(row.version!==version) throw new BatchError('This schedule changed. Reload it before deleting.',409);
    if(row.state!=='cancelled') throw new BatchError('Cancel the batch before deleting it.',409);
    // Match the dispatch handoff lock so a send cannot begin between this check and deletion.
    await client.query('SELECT id FROM dental_reminder_batch_runs WHERE company_id=$1 AND batch_id=$2 ORDER BY id FOR UPDATE',[companyId,id]);
    const processing=await client.query(`SELECT d.id FROM dental_reminder_batch_deliveries d
      JOIN dental_reminder_batch_runs r ON r.id=d.run_id AND r.company_id=d.company_id
      WHERE r.company_id=$1 AND r.batch_id=$2 AND d.status='processing' LIMIT 1`,[companyId,id]);
    if(processing.rows.length) throw new BatchError('A delivery is still processing. Wait for it to finish before deleting this batch.',409);
    // The existing foreign keys cascade through runs and deliveries, leaving conversations intact.
    await client.query('DELETE FROM dental_reminder_batches WHERE company_id=$1 AND id=$2',[companyId,id]);
  });
  res.json({success:true,data:{id}});
}));
router.get('/runs',read,handler(async(companyId,_req,res)=>{
  const result=await getPool().query(`SELECT r.id,r.config->>'name' AS name,r.scheduled_for AS "scheduledFor",r.timezone,
    r.appointment_date::text AS "appointmentDate",r.status,count(d.id)::integer AS total,
    count(d.id) FILTER (WHERE d.status='sent')::integer AS sent,
    count(d.id) FILTER (WHERE d.status='failed')::integer AS failed,
    count(d.id) FILTER (WHERE d.status IN ('skipped','cancelled'))::integer AS skipped,
    count(d.id) FILTER (WHERE d.status='unknown')::integer AS unknown,
    count(d.id) FILTER (WHERE d.status IN ('pending','processing'))::integer AS pending
    FROM dental_reminder_batch_runs r LEFT JOIN dental_reminder_batch_deliveries d ON d.run_id=r.id
    WHERE r.company_id=$1 GROUP BY r.id ORDER BY r.id DESC LIMIT 50`,[companyId]);
  res.json({success:true,data:result.rows});
}));
router.get('/runs/:id/deliveries',read,handler(async(companyId,req,res)=>{
  const id=idSchema.parse(req.params.id);
  const offset=z.coerce.number().int().min(0).default(0).parse(req.query.offset);
  const result=await getPool().query(`SELECT d.id,d.appointment_id AS "appointmentId",c.name AS "patientName",d.status,
    d.last_error AS "lastError",d.sent_at AS "sentAt" FROM dental_reminder_batch_deliveries d
    LEFT JOIN contact_appointments a ON a.id=d.appointment_id AND COALESCE(a.company_id,d.company_id)=d.company_id
    LEFT JOIN contacts c ON c.id=a.contact_id AND c.company_id=d.company_id
    WHERE d.company_id=$1 AND d.run_id=$2 ORDER BY d.id LIMIT 100 OFFSET $3`,[companyId,id,offset]);
  res.json({success:true,data:result.rows});
}));
export default router;
