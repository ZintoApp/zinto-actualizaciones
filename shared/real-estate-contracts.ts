import { z } from 'zod';

const nullableText = z.string().trim().max(10000).nullable().optional();
const id = z.number().int().positive();
const money = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/, 'Enter a non-negative monetary amount');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid calendar date');
const image = z.object({ url: z.string().max(2000).refine(value => /^\/media\/|^\/uploads\//.test(value), 'Select a company media file'), alt: z.string().max(250).optional() });

export const realEstateAssetFields = z.object({
  kind: z.enum(['property', 'unit']), code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(250), projectId: id.nullable().optional(),
  buildingId: id.nullable().optional(), floorId: id.nullable().optional(), propertyTypeId: id.nullable().optional(),
  location: nullableText, address: nullableText, description: nullableText,
  bedrooms: z.number().int().min(0).max(1000).nullable().optional(),
  bathrooms: z.number().int().min(0).max(1000).nullable().optional(),
  area: money.nullable().optional(), areaMeasure: z.enum(['sq_ft', 'sq_m']).default('sq_ft'),
  ownershipMode: z.enum(['company_owned', 'managed']).default('company_owned'),
  status: z.enum(['available', 'occupied', 'rented', 'reserved', 'sold', 'blocked', 'archived']).default('available'),
  listingPurpose: z.enum(['rent', 'sale', 'both']).default('rent'),
  salePrice: money.nullable().optional(), rentalPrice: money.nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/), assignedAgentId: id.nullable().optional(),
  sellerContactId: id.nullable().optional(),
  images: z.array(image).max(40).default([]), tagIds: z.array(id).max(100).default([]),
  customFields: z.record(z.unknown()).default({}),
});
export const createRealEstateAssetSchema = realEstateAssetFields.strict().superRefine((value, context) => {
  if (value.kind === 'unit' && (!value.projectId || !value.buildingId || !value.floorId)) {
    context.addIssue({ code: 'custom', path: ['floorId'], message: 'A unit requires a project, building, and floor' });
  }
  if (value.kind === 'property' && (value.projectId || value.buildingId || value.floorId)) {
    context.addIssue({ code: 'custom', path: ['kind'], message: 'Standalone properties do not belong to project inventory' });
  }
});
export const updateRealEstateAssetSchema = realEstateAssetFields.partial().extend({ version: id }).strict();
export type CreateRealEstateAsset = z.infer<typeof createRealEstateAssetSchema>;

export const realEstateListSchema = z.object({
  search: z.string().trim().max(250).optional(),
  status: z.enum(['available','occupied','rented','reserved','sold','blocked','archived']).optional(),
  kind: z.enum(['property','unit']).optional(), projectId: z.coerce.number().int().positive().optional(),
  buildingId: z.coerce.number().int().positive().optional(), floorId: z.coerce.number().int().positive().optional(),
  propertyTypeId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['updated','name','code']).default('updated'),
}).strict();

export const realEstateOwnershipSchema = z.object({
  effectiveFrom: dateKey, effectiveTo: dateKey.nullable().optional(),
  shares: z.array(z.object({ contactId: id, percentage: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/) })).min(1).max(100),
}).strict().superRefine((value, context) => {
  const total = value.shares.reduce((sum, share) => sum + Math.round(Number(share.percentage) * 10000), 0);
  if (total !== 1000000 || value.shares.some(share => Number(share.percentage) <= 0)) {
    context.addIssue({ code: 'custom', path: ['shares'], message: 'Positive ownership shares must total 100%' });
  }
  if (new Set(value.shares.map(share => share.contactId)).size !== value.shares.length) {
    context.addIssue({ code: 'custom', path: ['shares'], message: 'Each owner may appear once' });
  }
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'End date must follow start date' });
  }
});

export type RealEstateAsset = {
  id: number; company_id: number; kind: 'property' | 'unit'; code: string; name: string;
  location: string | null; address: string | null; description: string | null;
  bedrooms: number | null; bathrooms: number | null; area: string | null; area_measure: string;
  property_type_id: number | null; property_type_name?: string | null;
  classifications?:Array<{id:number;kind:string;name:string;color:string|null;is_active:boolean}>;
  project_id: number | null; building_id: number | null; floor_id: number | null;
  ownership_mode: 'company_owned' | 'managed'; listing_purpose: string; status: string;
  sale_price?: string | null; rental_price?: string | null; currency?: string;
  assigned_agent_id: number | null; assigned_agent_name?: string | null;
  seller_contact_id?: number | null;
  images: Array<{ url: string; alt?: string }>; custom_fields: Record<string, unknown>;
  version: number; created_at: string; updated_at: string; tag_ids?: number[];
};
