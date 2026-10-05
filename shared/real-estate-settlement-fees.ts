import {z} from 'zod';
export const settlementFeesSchema=z.object({
 expected:z.string().max(20000),
 fees:z.array(z.object({invoiceId:z.number().int().positive(),amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0)}).strict()).max(50)
 .refine(items=>new Set(items.map(i=>i.invoiceId)).size===items.length,'Select each invoice once'),
}).strict();
export type SettlementFee=z.infer<typeof settlementFeesSchema>['fees'][number];
