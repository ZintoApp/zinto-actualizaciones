import {z} from 'zod';
import {erpMinorUnits} from './erp-carrying-amount';
const amount=z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0);
export const realEstatePaymentPlanSchema=z.object({reservationId:z.number().int().positive(),reservationVersion:z.number().int().positive(),name:z.string().trim().min(1).max(250),saleAmount:amount,catalogItemId:z.number().int().positive(),advanceAccountId:z.number().int().positive(),taxGroupId:z.number().int().positive().nullable().optional(),installments:z.array(z.object({label:z.string().trim().min(1).max(250),dueDate:z.string().date(),amount,milestone:z.string().trim().max(250).optional()})).min(1).max(120),customFields:z.record(z.unknown()).default({}),saleCustomFields:z.record(z.unknown()).default({})}).strict().superRefine((v,ctx)=>{
 if(!/^\d{1,10}(\.\d{1,6})?$/.test(v.saleAmount)||v.installments.some(i=>!/^\d{1,10}(\.\d{1,6})?$/.test(i.amount)))return;
 const cents=(s:string)=>erpMinorUnits(s,6);
 if(v.installments.reduce((sum,i)=>sum+cents(i.amount),0n)!==cents(v.saleAmount))ctx.addIssue({code:'custom',path:['installments'],message:'Installments must total the sale amount'});
});
