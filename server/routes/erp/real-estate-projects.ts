import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage, ErpValidationError } from '../../storage';
import { requireAnyPermission } from '../../middleware';
import { resolveContactViewScope } from '../../../shared/contact-access';
import { validateCustomFieldRecordValues } from '../../utils/product-custom-field-values';
import { realEstateProjectSchema, updateRealEstateProjectSchema, realEstateBuildingSchema, realEstateFloorSchema } from '../../../shared/real-estate-projects';

const router=Router();
const id=z.coerce.number().int().positive();
const read=['view_real_estate_projects','manage_real_estate_projects'];
router.get('/projects',requireAnyPermission(read),async(req,res,next)=>{
  try {
    const search=z.string().max(250).parse(req.query.search??'');
    const limit=z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
    const offset=z.coerce.number().int().min(0).default(0).parse(req.query.offset);
    const companyId=res.locals.companyId;
    const rows=await getPool().query(`SELECT p.id,p.name,p.code,p.location,p.description,p.status,p.handover_date,p.images,p.version,
      count(a.id)::int total_units, count(a.id) FILTER(WHERE a.status='available')::int available_units,
      count(a.id) FILTER(WHERE a.status='reserved')::int reserved_units, count(a.id) FILTER(WHERE a.status='sold')::int sold_units,
      count(a.id) FILTER(WHERE a.status='blocked')::int blocked_units
      FROM real_estate_projects p LEFT JOIN real_estate_assets a ON a.project_id=p.id AND a.company_id=p.company_id
      WHERE p.company_id=$1 AND (p.name ILIKE $2 OR p.code ILIKE $2) GROUP BY p.id ORDER BY p.updated_at DESC,p.id DESC LIMIT $3 OFFSET $4`,[companyId,`%${search}%`,limit,offset]);
    const count=await getPool().query('SELECT count(*)::int total FROM real_estate_projects WHERE company_id=$1 AND (name ILIKE $2 OR code ILIKE $2)',[companyId,`%${search}%`]);
    res.json({data:rows.rows,total:count.rows[0].total});
  }catch(error){next(error);}
});

router.get('/hierarchy',requireAnyPermission([...read,'view_real_estate_units','manage_real_estate_units']),async(_req,res,next)=>{
  try {
    const companyId=res.locals.companyId;
    const projects=await getPool().query("SELECT id,name,code FROM real_estate_projects WHERE company_id=$1 AND status<>'archived' ORDER BY name",[companyId]);
    const buildings=await getPool().query('SELECT id,name,code,project_id FROM real_estate_buildings WHERE company_id=$1 ORDER BY sort_order,name',[companyId]);
    const floors=await getPool().query('SELECT id,name,level,building_id FROM real_estate_floors WHERE company_id=$1 ORDER BY level DESC',[companyId]);
    res.json({projects:projects.rows,buildings:buildings.rows,floors:floors.rows});
  }catch(error){next(error);}
});

router.get('/projects/:id',requireAnyPermission(read),async(req,res,next)=>{
  try {
    const projectId=id.parse(req.params.id),companyId=res.locals.companyId;
    const result=await getPool().query('SELECT * FROM real_estate_projects WHERE company_id=$1 AND id=$2',[companyId,projectId]);
    if(!result.rowCount){res.status(404).json({error:'Project not found'});return;}
    const project=result.rows[0];
    let developer=null;
    if(project.developer_contact_id){
      const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
      const accessible=scope?await storage.getAccessibleContactIds([project.developer_contact_id],{companyId,userId:req.user!.id,contactScope:scope}):[];
      if(!accessible.length)project.developer_contact_id=null;else developer=await storage.getContact(project.developer_contact_id);
    }
    const buildings=await getPool().query('SELECT id,name,code,project_id FROM real_estate_buildings WHERE company_id=$1 AND project_id=$2 ORDER BY sort_order,name',[companyId,projectId]);
    const floors=await getPool().query('SELECT f.id,f.name,f.level,f.building_id FROM real_estate_floors f JOIN real_estate_buildings b ON b.id=f.building_id AND b.company_id=f.company_id WHERE f.company_id=$1 AND b.project_id=$2 ORDER BY f.level DESC',[companyId,projectId]);
    res.json({data:project,buildings:buildings.rows,floors:floors.rows,developer:developer?{id:developer.id,name:developer.name,email:developer.email,customFields:developer.customFields}:null});
  }catch(error){next(error);}
});

for(const method of ['post','patch'] as const){
  router[method](method==='post'?'/projects':'/projects/:id',requireAnyPermission(['manage_real_estate_projects']),async(req,res,next)=>{
    const client=await getPool().connect();
    try {
      const companyId=res.locals.companyId;
      const projectId=method==='patch'?id.parse(req.params.id):undefined;
      const input=method==='patch'?updateRealEstateProjectSchema.parse(req.body):realEstateProjectSchema.parse(req.body);
      await client.query('BEGIN');
      const old=projectId?(await client.query('SELECT * FROM real_estate_projects WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,projectId])).rows[0]:undefined;
      if(projectId&&!old)throw new ErpValidationError('Project not found','not_found');
      if(old&&old.version!==(input as {version:number}).version)throw new ErpValidationError('Project changed. Reload before saving.','version_conflict');
      const columns={name:'name',code:'code',location:'location',description:'description',status:'status',handoverDate:'handover_date',developerContactId:'developer_contact_id',images:'images',customFields:'custom_fields'} as const;
      const prior=old?Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,old[column]])):{};
      const {version,...fields}=input as typeof input & {version?:number};
      const value=realEstateProjectSchema.parse({...prior,...fields});
      if(value.developerContactId){
        const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
        const allowed=scope?await storage.getAccessibleContactIds([value.developerContactId],{companyId,userId:req.user!.id,contactScope:scope}):[];
        if(!allowed.length)throw new ErpValidationError('Developer contact not found');
      }
      for(const image of value.images){
        const owned=await client.query('SELECT 1 FROM media_file_ownership WHERE company_id=$1 AND public_url=$2',[companyId,image.url]);
        if(!owned.rowCount)throw new ErpValidationError('Select company-owned media');
      }
      const definitions=await storage.getProductCustomFieldDefinitions(companyId,'real_estate_project');
      value.customFields=validateCustomFieldRecordValues(definitions,value.customFields,old ? old.custom_fields ?? {} : undefined);
      const keys=Object.keys(columns) as Array<keyof typeof columns>;
      const values:unknown[]=keys.map(key=>['images','customFields'].includes(key)?JSON.stringify(value[key]):value[key]??null);
      values.push(companyId,projectId??req.user!.id);
      const result=old?await client.query(`UPDATE real_estate_projects SET ${keys.map((key,index)=>`${columns[key]}=$${index+1}`).join(',')},version=version+1,updated_at=now() WHERE company_id=$${values.length-1} AND id=$${values.length} RETURNING *`,values)
        :await client.query(`INSERT INTO real_estate_projects(${keys.map(key=>columns[key]).join(',')},company_id,created_by) VALUES(${values.map((_,index)=>`$${index+1}`).join(',')}) RETURNING *`,values);
      await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,'real_estate_project',$2,$3,$4,$5)",[companyId,result.rows[0].id,old?'updated':'created',req.user!.id,JSON.stringify({version:result.rows[0].version})]);
      await client.query('COMMIT');res.status(old?200:201).json({data:result.rows[0]});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });
}

router.post('/projects/:id/buildings',requireAnyPermission(['manage_real_estate_projects']),async(req,res,next)=>{
  try {
    const projectId=id.parse(req.params.id),value=realEstateBuildingSchema.parse(req.body);
    const result=await getPool().query('INSERT INTO real_estate_buildings(company_id,project_id,name,code) SELECT company_id,id,$3,$4 FROM real_estate_projects WHERE company_id=$1 AND id=$2 RETURNING *',[res.locals.companyId,projectId,value.name,value.code]);
    if(!result.rowCount){res.status(404).json({error:'Project not found'});return;}
    res.status(201).json({data:result.rows[0]});
  }catch(error){next(error);}
});
router.post('/buildings/:id/floors',requireAnyPermission(['manage_real_estate_projects']),async(req,res,next)=>{
  try {
    const buildingId=id.parse(req.params.id),value=realEstateFloorSchema.parse(req.body);
    const result=await getPool().query('INSERT INTO real_estate_floors(company_id,building_id,name,level) SELECT company_id,id,$3,$4 FROM real_estate_buildings WHERE company_id=$1 AND id=$2 RETURNING *',[res.locals.companyId,buildingId,value.name,value.level]);
    if(!result.rowCount){res.status(404).json({error:'Building not found'});return;}
    res.status(201).json({data:result.rows[0]});
  }catch(error){next(error);}
});
export default router;
