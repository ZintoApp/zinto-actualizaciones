import { z } from 'zod';
const id=z.number().int().positive();
const money=z.string().regex(/^\d{1,10}(\.\d{1,6})?$/);
export const realEstateLeaseSchema=z.object({
 name:z.string().trim().min(1).max(250),assetId:id,tenantContactId:id,guarantorContactId:id.nullable().optional(),
 startDate:z.string().date(),endDate:z.string().date(),currency:z.string().regex(/^[A-Z]{3}$/),
 rentAmount:money,depositAmount:money.default('0'),dueDay:z.number().int().min(1).max(31).default(1),
 terms:z.record(z.unknown()).default({}),customFields:z.record(z.unknown()).default({}),
}).strict().superRefine((value,ctx)=>{
 if(value.endDate<value.startDate)ctx.addIssue({code:'custom',path:['endDate'],message:'Lease end must follow start'});
 if(value.terms.automaticRent!==undefined&&typeof value.terms.automaticRent!=='boolean')ctx.addIssue({code:'custom',path:['terms','automaticRent'],message:'Choose whether automatic rent is enabled'});
 if(value.terms.automaticRent===true){
  if(Number(value.rentAmount)<=0)ctx.addIssue({code:'custom',path:['rentAmount'],message:'Automatic rent requires a positive monthly amount'});
  if(!Number.isInteger(value.terms.rentCatalogItemId)||Number(value.terms.rentCatalogItemId)<=0)ctx.addIssue({code:'custom',path:['terms','rentCatalogItemId'],message:'Automatic rent requires an ERP Catalog billing item'});
 }
});
export const realEstateMaintenanceSchema=z.object({
 assetId:id,title:z.string().trim().min(1).max(250),description:z.string().max(10000).nullable().optional(),
 priority:z.enum(['low','normal','high','urgent']).default('normal'),
 assignedUserId:id.nullable().optional(),supplierId:id.nullable().optional(),customFields:z.record(z.unknown()).default({}),
}).strict();
export const realEstateInspectionSchema=z.object({
 assetId:id,title:z.string().trim().min(1).max(250),scheduledAt:z.string().datetime().nullable().optional(),
 inspectorUserId:id.nullable().optional(),checklist:z.array(z.object({label:z.string().trim().min(1).max(500),checked:z.boolean()})).max(200).default([]),
 findings:z.array(z.object({description:z.string().trim().min(1).max(2000),severity:z.enum(['minor','major','critical'])})).max(200).default([]),
 customFields:z.record(z.unknown()).default({}),
}).strict();
export const REAL_ESTATE_OPERATION_TRANSITIONS={
 maintenance:{new:['assigned','in_progress','cancelled'],assigned:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]},
 inspections:{scheduled:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]},
 leases:{draft:['active','archived'],active:['terminated','expired'],expired:['archived'],terminated:['archived'],archived:[]},
} as const;
