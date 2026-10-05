import {z} from 'zod';
export const settlementAdjustmentsSchema=z.object({
  expected:z.string().max(20000),
  adjustments:z.array(z.object({
    amount:z.string().regex(/^-?\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)!==0),
    accountId:z.number().int().positive(),reason:z.string().trim().min(1).max(1000),
  }).strict()).max(50),
}).strict();
export type SettlementAdjustment=z.infer<typeof settlementAdjustmentsSchema>['adjustments'][number];
