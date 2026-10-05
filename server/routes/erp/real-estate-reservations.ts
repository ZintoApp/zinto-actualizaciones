import {requireRealEstateInvoiceEvidence} from '../../services/erp/real-estate-invoice-evidence-access';
import {stampDentalReminderActivation,validateDentalReminderDeliverySettings} from '../../../shared/types/dental-reminder-types';
import {getDentalReminderOptions} from '../../services/dental-reminder-configuration';
import {Router} from 'express';
import {isInvoiceFinanciallyResolved} from '../../services/erp/invoice-resolution';
import {z} from 'zod';
import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';
import {requireAnyPermission} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {realEstateReservationSchema,realEstateReservationTransitions,realEstateSettingsSchema} from '../../../shared/real-estate-reservations';
import {validateAndNormalizeCustomFieldValues,validateCustomFieldRecordValues} from '../../utils/product-custom-field-values';
import {createReservationReceivable} from '../../services/erp/real-estate-sale-receivables';
import {getInvoicePaymentOptions} from '../../services/erp-invoice-checkout-service';
import {loadAccessibleInvoice} from '../../services/erp/invoice-access';
const router=Router(),id=z.coerce.number().int().positive(),read=['view_real_estate_reservations','manage_real_estate_reservations'];
async function allowedContacts(req:any,res:any,ids:number[]){const scope=resolveContactViewScope(res.locals.permissions,req.user.isSuperAdmin===true);return scope?storage.getAccessibleContactIds(ids,{companyId:res.locals.companyId,userId:req.user.id,contactScope:scope}):[];}
router.get('/settings',requireAnyPermission(['view_real_estate_settings','manage_real_estate_settings','manage_real_estate_reservations']),async(_req,res,next)=>{try{res.json({data:realEstateSettingsSchema.parse((await storage.getCompanySetting(res.locals.companyId,'realEstateSettings'))?.value??{})});}catch(e){next(e);}});
router.put('/settings',requireAnyPermission(['manage_real_estate_settings']),async(req,res,next)=>{try{const previous=realEstateSettingsSchema.parse((await storage.getCompanySetting(res.locals.companyId,'realEstateSettings'))?.value??{});const value=realEstateSettingsSchema.parse({...previous,...req.body});value.automaticReminders=stampDentalReminderActivation(value.automaticReminders,previous.automaticReminders,new Date());const errors=validateDentalReminderDeliverySettings(value.automaticReminders,await getDentalReminderOptions(res.locals.companyId));if(errors.length){res.status(400).json({error:'Invalid reminder delivery settings',details:errors});return;}await storage.saveCompanySetting(res.locals.companyId,'realEstateSettings',value);res.json({data:value});}catch(e){next(e);}});
router.get('/reservations',requireAnyPermission(read),async(req,res,next)=>{
 try{
 const companyId=res.locals.companyId,filters=z.object({search:z.string().max(250).default(''),status:z.enum(['held','confirmed','expired','cancelled','converted']).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query);
 const contacts=(await getPool().query('SELECT DISTINCT buyer_contact_id FROM real_estate_reservations WHERE company_id=$1',[companyId])).rows.map(r=>r.buyer_contact_id),allowed=await allowedContacts(req,res,contacts);
 const args:unknown[]=[companyId,allowed,`%${filters.search}%`],where=['r.company_id=$1','r.buyer_contact_id=ANY($2::int[])',"(a.name ILIKE $3 OR a.code ILIKE $3 OR c.name ILIKE $3)"];
 if(filters.status){args.push(filters.status);where.push(`r.status=$${args.length}`);}
 const joins='FROM real_estate_reservations r JOIN real_estate_assets a ON a.id=r.asset_id AND a.company_id=r.company_id JOIN contacts c ON c.id=r.buyer_contact_id AND c.company_id=r.company_id',predicate=where.join(' AND ');
 const count=(await getPool().query(`SELECT count(*)::int total ${joins} WHERE ${predicate}`,args)).rows[0].total;
 args.push(filters.limit,filters.offset);
 const records=(await getPool().query(`SELECT r.*,a.name asset_name,a.kind asset_kind,c.name buyer_name ${joins} WHERE ${predicate} ORDER BY r.updated_at DESC,r.id DESC LIMIT $${args.length-1} OFFSET $${args.length}`,args)).rows;
 records.forEach(r=>{if(!res.locals.permissions.view_real_estate_financials){delete r.currency;delete r.deposit_amount;}const section=r.asset_kind==='unit'?'units':'properties';if(!res.locals.permissions[`view_real_estate_${section}`]&&!res.locals.permissions[`manage_real_estate_${section}`]){delete r.asset_name;delete r.asset_id;}});
 res.json({data:records,total:count});
 }catch(e){next(e);}
});
router.get('/reservations/:id',requireAnyPermission(read),async(req,res,next)=>{
 try{const companyId=res.locals.companyId,recordId=id.parse(req.params.id),row=(await getPool().query('SELECT r.*,a.name asset_name,a.kind asset_kind,c.name buyer_name,c.custom_fields contact_custom_fields FROM real_estate_reservations r JOIN real_estate_assets a ON a.id=r.asset_id AND a.company_id=r.company_id JOIN contacts c ON c.id=r.buyer_contact_id AND c.company_id=r.company_id WHERE r.company_id=$1 AND r.id=$2',[companyId,recordId])).rows[0];
 if(!row||!(await allowedContacts(req,res,[row.buyer_contact_id])).length){res.status(404).json({error:'Reservation not found'});return;}
 if(!res.locals.permissions.view_real_estate_financials){delete row.currency;delete row.deposit_amount;}
 const section=row.asset_kind==='unit'?'units':'properties';if(!res.locals.permissions[`view_real_estate_${section}`]&&!res.locals.permissions[`manage_real_estate_${section}`]){delete row.asset_id;delete row.asset_name;}
 const activity=(await getPool().query("SELECT action,details,created_at FROM real_estate_activity WHERE company_id=$1 AND entity_type='real_estate_reservation' AND entity_id=$2 ORDER BY created_at DESC LIMIT 50",[companyId,recordId])).rows;
 res.json({data:row,activity});}catch(e){next(e);}
});
router.post('/reservations',requireAnyPermission(['manage_real_estate_reservations']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
 const client=await getPool().connect();
 try{
 const value=realEstateReservationSchema.parse(req.body),companyId=res.locals.companyId;
 if(!(await allowedContacts(req,res,[value.buyerContactId])).length)throw new ErpValidationError('Buyer contact not found','not_found');
 const settings=realEstateSettingsSchema.parse((await storage.getCompanySetting(companyId,'realEstateSettings'))?.value??{});
 await client.query('BEGIN');
 const asset=(await client.query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,value.assetId])).rows[0];
 if(!asset)throw new ErpValidationError('Property not found','not_found');const section=asset.kind==='unit'?'units':'properties';
 if(!res.locals.permissions[`manage_real_estate_${section}`])throw new ErpValidationError('Asset management required');
 if(asset.status!=='available'||asset.listing_purpose==='rent')throw new ErpValidationError('Select an available asset offered for sale');
 if((await client.query("SELECT 1 FROM real_estate_leases WHERE company_id=$1 AND asset_id=$2 AND status='active'",[companyId,asset.id])).rowCount)throw new ErpValidationError('An active lease prevents a reservation');
 if(!(await client.query('SELECT 1 FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[companyId,value.currency])).rowCount)throw new ErpValidationError('Select an active ERP currency');
 value.customFields=validateAndNormalizeCustomFieldValues(await storage.getProductCustomFieldDefinitions(companyId,'real_estate_reservation'),value.customFields,{mode:'create'});
 const row=(await client.query("INSERT INTO real_estate_reservations(company_id,asset_id,buyer_contact_id,expires_at,currency,deposit_amount,custom_fields,created_by)VALUES($1,$2,$3,now()+($4::int*interval '1 hour'),$5,$6,$7,$8)RETURNING *",[companyId,value.assetId,value.buyerContactId,settings.reservationExpiryHours,value.currency,value.depositAmount,JSON.stringify(value.customFields),req.user!.id])).rows[0];
 await client.query("UPDATE real_estate_assets SET status='reserved',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[companyId,asset.id]);
 await client.query("INSERT INTO real_estate_contact_roles(company_id,contact_id,role)VALUES($1,$2,'buyer')ON CONFLICT(company_id,contact_id,role)DO NOTHING",[companyId,value.buyerContactId]);
 await client.query("INSERT INTO real_estate_jobs(company_id,source_key,job_type,payload,run_at)VALUES($1,$2,'reservation_expiry',$3,$4)ON CONFLICT(company_id,source_key)DO NOTHING",[companyId,`reservation_expiry:${row.id}`,JSON.stringify({reservationId:row.id}),row.expires_at]);
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id)VALUES($1,'real_estate_reservation',$2,'created',$3)",[companyId,row.id,req.user!.id]);
 await client.query('COMMIT');res.status(201).json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.get('/reservations/:id/billing',requireAnyPermission(read),requireAnyPermission(['view_invoices','manage_invoices']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),r=(await getPool().query('SELECT buyer_contact_id,status,expires_at FROM real_estate_reservations WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];if(!r||!(await allowedContacts(req,res,[r.buyer_contact_id])).length)throw new ErpValidationError('Reservation not found','not_found');
 const source=(await getPool().query("SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='reservation_deposit' AND source_id=$2",[c,recordId])).rows[0],invoice=source?await loadAccessibleInvoice(req,source.invoice_id):null;
 if(source&&!invoice)throw new ErpValidationError('Reservation invoice not found','not_found');
 res.json({data:invoice,checkoutOptions:invoice&&Number(invoice.amountDue)>0&&['sent','overdue','partially_paid'].includes(invoice.status)?await getInvoicePaymentOptions(invoice,''):[]});
}catch(e){next(e);}});
router.post('/reservations/:id/billing',requireAnyPermission(['manage_real_estate_reservations']),requireAnyPermission(['manage_invoices']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),v=z.object({version:z.number().int().positive(),productId:id,liabilityAccountId:id}).strict().parse(req.body);
 const r=(await getPool().query('SELECT r.buyer_contact_id,a.kind FROM real_estate_reservations r JOIN real_estate_assets a ON a.id=r.asset_id AND a.company_id=r.company_id WHERE r.company_id=$1 AND r.id=$2',[c,recordId])).rows[0];if(!r||!(await allowedContacts(req,res,[r.buyer_contact_id])).length)throw new ErpValidationError('Reservation not found','not_found');if(!res.locals.permissions[`manage_real_estate_${r.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 res.status(201).json({data:await createReservationReceivable(c,req.user!.id,recordId,v.productId,v.liabilityAccountId,v.version,invoiceId=>loadAccessibleInvoice(req,invoiceId,'manage'))});
}catch(e){next(e);}});
router.post('/reservations/:id/billing/send',requireAnyPermission(['manage_real_estate_reservations']),requireAnyPermission(['manage_invoices']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),r=(await getPool().query('SELECT buyer_contact_id,status,expires_at FROM real_estate_reservations WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];if(!r||!(await allowedContacts(req,res,[r.buyer_contact_id])).length)throw new ErpValidationError('Reservation not found','not_found');
 if(!['held','confirmed'].includes(r.status)||new Date(r.expires_at)<=new Date())throw new ErpValidationError('An unexpired reservation is required');const source=(await getPool().query("SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='reservation_deposit' AND source_id=$2",[c,recordId])).rows[0];if(!source)throw new ErpValidationError('Create a reservation invoice first');if(!await loadAccessibleInvoice(req,source.invoice_id,'manage'))throw new ErpValidationError('Reservation invoice not found','not_found');res.json({data:await storage.sendInvoice(source.invoice_id,c,req.user!.id)});
}catch(e){next(e);}});
router.patch('/reservations/:id',requireAnyPermission(['manage_real_estate_reservations']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),v=z.object({version:z.number().int().positive(),depositAmount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/),customFields:z.record(z.unknown())}).strict().parse(req.body);
 await client.query('BEGIN');const row=(await client.query('SELECT * FROM real_estate_reservations WHERE company_id=$1 AND id=$2 FOR UPDATE',[c,recordId])).rows[0];
 if(!row||!(await allowedContacts(req,res,[row.buyer_contact_id])).length)throw new ErpValidationError('Reservation not found','not_found');
 if(row.version!==v.version)throw new ErpValidationError('Record changed. Reload before saving.','version_conflict');
 if(row.status!=='held'||new Date(row.expires_at)<=new Date())throw new ErpValidationError('Only an unexpired hold can be edited');
 const asset=(await client.query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2',[c,row.asset_id])).rows[0];if(!asset||!res.locals.permissions[`manage_real_estate_${asset.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 if((await client.query("SELECT 1 FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='reservation_deposit' AND source_id=$2",[c,recordId])).rowCount)throw new ErpValidationError('Billed reservation terms cannot be edited');
 const custom=validateCustomFieldRecordValues(await storage.getProductCustomFieldDefinitions(c,'real_estate_reservation'),v.customFields,row.custom_fields??{});
 const updated=(await client.query('UPDATE real_estate_reservations SET deposit_amount=$3,custom_fields=$4,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING *',[c,recordId,v.depositAmount,JSON.stringify(custom)])).rows[0];
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_reservation',$2,'updated',$3,$4)",[c,recordId,req.user!.id,JSON.stringify({version:updated.version})]);await client.query('COMMIT');res.json({data:updated});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.post('/reservations/:id/transition',requireAnyPermission(['manage_real_estate_reservations']),async(req,res,next)=>{
 const client=await getPool().connect();
 try{
 const companyId=res.locals.companyId,recordId=id.parse(req.params.id),value=z.object({status:z.enum(['confirmed','cancelled']),version:z.number().int().positive()}).strict().parse(req.body);
 await client.query('BEGIN');const row=(await client.query('SELECT * FROM real_estate_reservations WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,recordId])).rows[0];
 if(!row||!(await allowedContacts(req,res,[row.buyer_contact_id])).length)throw new ErpValidationError('Reservation not found','not_found');
 if(row.version!==value.version)throw new ErpValidationError('Record changed. Reload before saving.','version_conflict');
 if(!(realEstateReservationTransitions as Record<string,readonly string[]>)[row.status]?.includes(value.status))throw new ErpValidationError('Invalid reservation transition');
 const asset=(await client.query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,row.asset_id])).rows[0];
 if(!asset||!res.locals.permissions[`manage_real_estate_${asset.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 if(value.status==='confirmed'&&new Date(row.expires_at)<=new Date())throw new ErpValidationError('Reservation has expired');
 if(value.status==='cancelled'){const sources=(await client.query("SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='reservation_deposit' AND source_id=$2",[companyId,recordId])).rows;await requireRealEstateInvoiceEvidence(req,client,companyId,sources.map(s=>s.invoice_id));for(const source of sources)if(!await isInvoiceFinanciallyResolved(client,companyId,source.invoice_id))throw new ErpValidationError('Resolve the issued reservation invoice and any refund through ERP credit notes before cancellation','reservation_financial_resolution_required');}
 const updated=(await client.query('UPDATE real_estate_reservations SET status=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING *',[companyId,recordId,value.status])).rows[0];
 if(value.status==='cancelled')await client.query("UPDATE real_estate_assets SET status='available',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 AND status='reserved'",[companyId,row.asset_id]);
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_reservation',$2,'status_changed',$3,$4)",[companyId,recordId,req.user!.id,JSON.stringify({from:row.status,to:value.status})]);
 await client.query('COMMIT');res.json({data:updated});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
export default router;
