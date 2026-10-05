import type { PoolClient } from 'pg';
import { getPool } from '../../db';
import { storage, ErpValidationError } from '../../storage';
import { validateCustomFieldRecordValues } from '../../utils/product-custom-field-values';
import { createRealEstateAssetSchema, realEstateListSchema, type RealEstateAsset } from '../../../shared/real-estate-contracts';
import { resolveContactViewScope } from '../../../shared/contact-access';

const columns = {
  kind: 'kind', code: 'code', name: 'name', projectId: 'project_id', buildingId: 'building_id', floorId: 'floor_id',
  propertyTypeId: 'property_type_id', location: 'location', address: 'address', description: 'description',
  bedrooms: 'bedrooms', bathrooms: 'bathrooms', area: 'area', areaMeasure: 'area_measure',
  ownershipMode: 'ownership_mode', status: 'status', listingPurpose: 'listing_purpose',
  salePrice: 'sale_price', rentalPrice: 'rental_price', currency: 'currency', assignedAgentId: 'assigned_agent_id',
  sellerContactId: 'seller_contact_id',
  images: 'images', customFields: 'custom_fields',
} as const;

async function validateReferences(client: PoolClient, companyId: number, value: ReturnType<typeof createRealEstateAssetSchema.parse>, existing?:any) {
  const currency = await client.query('SELECT 1 FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true', [companyId, value.currency]);
  if (!currency.rowCount) throw new ErpValidationError('Select an active ERP currency');
  if (value.assignedAgentId) {
    const user = await client.query('SELECT 1 FROM users WHERE company_id=$1 AND id=$2 AND active=true', [companyId, value.assignedAgentId]);
    if (!user.rowCount) throw new ErpValidationError('Assigned agent must be an active company user');
  }
  if (value.propertyTypeId) {
    const type = await client.query("SELECT 1 FROM real_estate_taxonomy WHERE company_id=$1 AND id=$2 AND kind='property_type' AND (is_active=true OR id=$3)", [companyId, value.propertyTypeId,existing?.property_type_id??null]);
    if (!type.rowCount) throw new ErpValidationError('Select an active property type');
  }
  if (value.kind === 'unit') {
    const floor = await client.query(`SELECT 1 FROM real_estate_floors f
      JOIN real_estate_buildings b ON b.id=f.building_id AND b.company_id=f.company_id
      WHERE f.company_id=$1 AND f.id=$2 AND b.id=$3 AND b.project_id=$4`,
    [companyId, value.floorId, value.buildingId, value.projectId]);
    if (!floor.rowCount) throw new ErpValidationError('Floor, building, and project must belong to the same inventory hierarchy');
  }
  if (value.tagIds.length) {
    const prior=existing?(await client.query('SELECT taxonomy_id FROM real_estate_asset_tags WHERE company_id=$1 AND asset_id=$2',[companyId,existing.id])).rows.map(row=>row.taxonomy_id):[];
    const tags = await client.query("SELECT id FROM real_estate_taxonomy WHERE company_id=$1 AND id=ANY($2::int[]) AND kind IN('tag','feature') AND (is_active=true OR id=ANY($3::int[]))", [companyId, value.tagIds,prior]);
    if (tags.rowCount !== new Set(value.tagIds).size) throw new ErpValidationError('Select active Real Estate features or tags');
  }
  for (const image of value.images) {
    const media = await client.query('SELECT 1 FROM media_file_ownership WHERE company_id=$1 AND public_url=$2', [companyId,image.url]);
    if (!media.rowCount) throw new ErpValidationError('Select media belonging to this company');
  }
}

export async function listRealEstateAssets(companyId: number, query: unknown, canViewFinancials: boolean) {
  const filters = realEstateListSchema.parse(query);
  const args: unknown[] = [companyId];
  const where = ['a.company_id=$1'];
  const add = (column: string, value: unknown) => { args.push(value); where.push(`${column}=$${args.length}`); };
  if (filters.kind) add('a.kind', filters.kind);
  if (filters.status) add('a.status', filters.status); else where.push("a.status<>'archived'");
  if (filters.projectId) add('a.project_id', filters.projectId);
  if (filters.buildingId) add('a.building_id', filters.buildingId);
  if (filters.floorId) add('a.floor_id', filters.floorId);
  if (filters.propertyTypeId) add('a.property_type_id', filters.propertyTypeId);
  if (filters.search) { args.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`); where.push(`(a.name ILIKE $${args.length} OR a.code ILIKE $${args.length} OR a.location ILIKE $${args.length})`); }
  const predicate = where.join(' AND ');
  const count = await getPool().query(`SELECT count(*)::int AS total FROM real_estate_assets a WHERE ${predicate}`, args);
  const order = { updated: 'a.updated_at DESC, a.id DESC', name: 'a.name, a.id', code: 'a.code, a.id' }[filters.sort];
  const financials = canViewFinancials ? ', a.sale_price,a.rental_price,a.currency' : '';
  const select = `a.id,a.company_id,a.kind,a.code,a.name,a.location,a.address,a.description,
    a.bedrooms,a.bathrooms,a.area,a.area_measure,a.project_id,a.building_id,a.floor_id,a.property_type_id,
    a.ownership_mode,a.status,a.listing_purpose,a.assigned_agent_id,a.images,a.custom_fields,a.version,a.created_at,a.updated_at${financials}`;
  args.push(filters.limit, filters.offset);
  const rows = await getPool().query<RealEstateAsset>(`SELECT ${select}, t.name AS property_type_name,
    COALESCE(u.full_name,u.username) AS assigned_agent_name
    FROM real_estate_assets a LEFT JOIN real_estate_taxonomy t ON t.id=a.property_type_id AND t.company_id=a.company_id
    LEFT JOIN users u ON u.id=a.assigned_agent_id AND u.company_id=a.company_id
    WHERE ${predicate} ORDER BY ${order} LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
  return { data: rows.rows, total: count.rows[0].total, limit: filters.limit, offset: filters.offset };
}

export async function saveRealEstateAsset(companyId: number, userId: number, input: unknown, existingId?: number, version?: number, authority?: {permissions: Record<string,boolean>;isSuperAdmin:boolean}) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let existing: any;
    if (existingId) {
      const result = await client.query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE', [companyId, existingId]);
      existing = result.rows[0];
      if (!existing) throw new ErpValidationError('Property not found', 'not_found');
      if (existing.version !== version) throw new ErpValidationError('This record changed. Reload before saving.', 'version_conflict');
    }
    const prior = existing ? Object.fromEntries(Object.entries(columns).map(([key,column]) => [key,existing[column]])) : {};
    const value = createRealEstateAssetSchema.parse({ ...prior, ...(input as object) });
    if(existing&&Object.prototype.hasOwnProperty.call(input,'ownershipMode')&&value.ownershipMode!==existing.ownership_mode&&
      (await client.query('SELECT 1 FROM real_estate_asset_cost_sources WHERE company_id=$1 AND asset_id=$2 AND removed_at IS NULL LIMIT 1',[companyId,existing.id])).rowCount)
      throw new ErpValidationError('Remove ERP cost attributions before changing the ownership model');
    if (Object.prototype.hasOwnProperty.call(input, 'sellerContactId') && (value.sellerContactId ?? null) !== (existing?.seller_contact_id ?? null)) {
      const scope = authority && resolveContactViewScope(authority.permissions, authority.isSuperAdmin);
      const ids = [...new Set([existing?.seller_contact_id, value.sellerContactId].filter((id): id is number => !!id))];
      const allowed = scope ? await storage.getAccessibleContactIds(ids, {companyId,userId,contactScope:scope}) : [];
      if (!scope || allowed.length !== ids.length) throw new ErpValidationError('Seller contact not found', 'not_found');
    }
    if (existing && value.kind !== existing.kind) throw new ErpValidationError('Asset kind cannot change');
    if (!existing && !['available','occupied','blocked'].includes(value.status)) throw new ErpValidationError('Reserved, rented, and sold status is controlled by contracts');
    if (existing && value.status !== existing.status && (['reserved','rented','sold'].includes(value.status) || ['reserved','rented','sold'].includes(existing.status))) {
      throw new ErpValidationError('Use the associated lease or sale workflow to change this status');
    }
    await validateReferences(client, companyId, value,existing);
    const entity = value.kind === 'unit' ? 'real_estate_unit' : 'real_estate_property';
    const definitions = await storage.getProductCustomFieldDefinitions(companyId, entity);
    value.customFields = validateCustomFieldRecordValues(definitions, value.customFields, existing ? existing.custom_fields ?? {} : undefined);
    const keys = Object.keys(columns) as Array<keyof typeof columns>;
    const args = keys.map(key => key === 'images' || key === 'customFields' ? JSON.stringify(value[key]) : value[key] ?? null);
    let row: RealEstateAsset;
    if (existing) {
      args.push(companyId, existing.id);
      const result = await client.query(`UPDATE real_estate_assets SET ${keys.map((key,index) => `${columns[key]}=$${index+1}`).join(',')},
        version=version+1,updated_at=now() WHERE company_id=$${args.length-1} AND id=$${args.length} RETURNING *`, args);
      row = result.rows[0];
    } else {
      args.push(companyId, userId);
      const result = await client.query(`INSERT INTO real_estate_assets (${keys.map(key => columns[key]).join(',')},company_id,created_by)
        VALUES (${args.map((_,index) => `$${index+1}`).join(',')}) RETURNING *`, args);
      row = result.rows[0];
    }
    if (!existing || Object.prototype.hasOwnProperty.call(input, 'tagIds')) {
      await client.query('DELETE FROM real_estate_asset_tags WHERE company_id=$1 AND asset_id=$2', [companyId,row.id]);
      for (const tagId of new Set(value.tagIds)) await client.query('INSERT INTO real_estate_asset_tags(company_id,asset_id,taxonomy_id) VALUES($1,$2,$3)', [companyId,row.id,tagId]);
    }
    await client.query('INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,$2,$3,$4,$5,$6)',
      [companyId,entity,row.id,existing ? 'updated' : 'created',userId,JSON.stringify({ version: row.version })]);
    await client.query('COMMIT');
    return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
