import { z } from 'zod';
import { realEstateAssetFields } from './real-estate-contracts';

export const realEstateProjectSchema = z.object({
  name: z.string().trim().min(1).max(250), code: z.string().trim().min(1).max(80),
  location: z.string().trim().max(1000).nullable().optional(), description: z.string().max(10000).nullable().optional(),
  developerContactId: z.number().int().positive().nullable().optional(),
  status: z.enum(['planning','construction','completed','archived']).default('planning'),
  handoverDate: z.string().date().nullable().optional(),
  images: realEstateAssetFields.shape.images,
  customFields: realEstateAssetFields.shape.customFields,
}).strict();
export const updateRealEstateProjectSchema = realEstateProjectSchema.partial().extend({ version: z.number().int().positive() }).strict();
export const realEstateBuildingSchema = z.object({ name: z.string().trim().min(1).max(250), code: z.string().trim().min(1).max(80) }).strict();
export const realEstateFloorSchema = z.object({ name: z.string().trim().min(1).max(100), level: z.number().int().min(-100).max(1000) }).strict();

export type RealEstateProject = {
  id:number; name:string; code:string; location:string|null; description:string|null; status:string;
  developer_contact_id:number|null; handover_date:string|null; images:Array<{url:string;alt?:string}>;
  custom_fields:Record<string,unknown>; version:number; total_units:number; available_units:number;
  reserved_units:number; sold_units:number; blocked_units:number;
};
export type RealEstateHierarchy = {
  buildings:Array<{id:number;name:string;code:string;project_id:number}>;
  floors:Array<{id:number;name:string;level:number;building_id:number}>;
};
