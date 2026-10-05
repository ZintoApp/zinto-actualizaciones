import { z } from 'zod';
export const realEstateAppointmentSchema=z.object({
  contactId:z.number().int().positive(),assetId:z.number().int().positive().nullable().optional(),
  agentUserId:z.number().int().positive(),title:z.string().trim().min(1).max(250),
  description:z.string().max(10000).nullable().optional(),location:z.string().max(1000).nullable().optional(),
  date:z.string().date(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes:z.number().int().min(5).max(480),
  appointmentType:z.enum(['viewing','consultation','signing','inspection','handover']),
  status:z.enum(['scheduled','confirmed','completed','cancelled','no_show']).default('scheduled'),
}).strict();
export type RealEstateAppointment={id:number;contact_id:number;title:string;description:string|null;location:string|null;scheduled_at:string;duration_minutes:number;status:string;asset_id:number|null;agent_user_id:number;appointment_type:string;contact_name:string|null;asset_name:string|null;agent_name:string|null;updated_at:string};
