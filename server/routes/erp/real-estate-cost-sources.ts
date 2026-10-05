import {accessibleInvoiceIds,loadAccessibleInvoice} from '../../services/erp/invoice-access';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {storage} from '../../storage';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';
import {Router} from 'express';
import {z} from 'zod';
import {getPool} from '../../db';
import {requireAnyPermission} from '../../middleware';
import {getRealEstateCostSources,changeRealEstateCostSource} from '../../services/erp/real-estate-cost-sources';
const router=Router(),id=z.coerce.number().int().positive(),reason=z.string().trim().min(3).max(1000);
for(const kind of ['property','unit']){
 const section=kind==='unit'?'units':'properties',path=`/${section}/:id/cost-sources`;
 router.get(path,requireAnyPermission([`view_real_estate_${section}`,`manage_real_estate_${section}`]),requireAnyPermission(['view_real_estate_financials']),requireAnyPermission(['view_accounting','manage_accounting']),async(req,res,next)=>{try{
  const assetId=id.parse(req.params.id),c=res.locals.companyId,p=res.locals.permissions;
  const f=z.object({search:z.string().max(100).default(''),asOf:z.string().date().optional()}).strict().parse(req.query);
  const asset=(await getPool().query("SELECT id FROM real_estate_assets WHERE company_id=$1 AND id=$2 AND kind=$3 AND ownership_mode='company_owned'",[c,assetId,kind])).rows[0];
  if(!asset){res.status(404).json({error:'Company-owned asset not found'});return;}
  const asOf=f.asOf??(await getErpCompanyCalendar(c)).today;
  const canReadSales=!!(p.view_real_estate_payment_plans||p.manage_real_estate_payment_plans),scope=resolveContactViewScope(p,req.user!.isSuperAdmin===true);
  const buyers=canReadSales&&scope?(await getPool().query('SELECT DISTINCT buyer_contact_id FROM real_estate_sale_agreements WHERE company_id=$1 AND asset_id=$2',[c,assetId])).rows.map(r=>r.buyer_contact_id):[];
  const allowed=buyers.length?await storage.getAccessibleContactIds(buyers,{companyId:c,userId:req.user!.id,contactScope:scope!}):[];
  res.json(await getRealEstateCostSources(c,assetId,f.search,!!p[`manage_real_estate_${section}`]&&!!p.manage_accounting,asOf,await accessibleInvoiceIds(req),allowed,canReadSales));
 }catch(e){next(e);}});
 router.post(path,requireAnyPermission([`manage_real_estate_${section}`]),requireAnyPermission(['view_real_estate_financials']),requireAnyPermission(['manage_accounting']),async(req,res,next)=>{try{
  const f=z.object({lineId:id,reason,allocationAmount:z.string().regex(/^\d{1,12}(\.\d{1,6})?$/).optional()}).strict().parse(req.body);
  res.status(201).json({data:await changeRealEstateCostSource(res.locals.companyId,req.user!.id,id.parse(req.params.id),kind,f.reason,f.lineId,undefined,async invoiceId=>(!!res.locals.permissions.view_invoices||!!res.locals.permissions.manage_invoices)&&!!await loadAccessibleInvoice(req,invoiceId),f.allocationAmount)});
 }catch(e){next(e);}});
 router.post(`${path}/:sourceId/remove`,requireAnyPermission([`manage_real_estate_${section}`]),requireAnyPermission(['view_real_estate_financials']),requireAnyPermission(['manage_accounting']),async(req,res,next)=>{try{
  const f=z.object({reason}).strict().parse(req.body);
  res.json({data:await changeRealEstateCostSource(res.locals.companyId,req.user!.id,id.parse(req.params.id),kind,f.reason,undefined,id.parse(req.params.sourceId),async invoiceId=>(!!res.locals.permissions.view_invoices||!!res.locals.permissions.manage_invoices)&&!!await loadAccessibleInvoice(req,invoiceId))});
 }catch(e){next(e);}});
}
export default router;
