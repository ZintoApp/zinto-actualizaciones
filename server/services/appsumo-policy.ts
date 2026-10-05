import { getPool } from '../db';

export async function appSumoCompanyPolicy(companyId: number | null | undefined) {
  if (!companyId) return { managed: false, suspended: false };
  const { rows: [company] } = await getPool().query('SELECT appsumo_license_key,appsumo_suspended FROM companies WHERE id=$1',[companyId]);
  return { managed:Boolean(company?.appsumo_license_key), suspended:Boolean(company?.appsumo_suspended) };
}
export async function assertAppSumoAccess(companyId: number | null | undefined) {
  if ((await appSumoCompanyPolicy(companyId)).suspended) throw new Error('Company access is suspended because its AppSumo license is inactive.');
}
export async function assertNotAppSumoBilling(companyId: number) {
  if ((await appSumoCompanyPolicy(companyId)).managed) throw new Error('Manage this lifetime plan through AppSumo.');
  const { rows } = await getPool().query('SELECT 1 FROM appsumo_activations WHERE target_company_id=$1 AND consumed_at IS NULL AND expires_at>now()',[companyId]);
  if(rows.length) throw new Error('AppSumo activation is in progress. Finish activation before changing billing.');
}
