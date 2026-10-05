import { createHash } from 'node:crypto';
import { ERP_BUSINESS_TYPE_SETTING_KEY, type ErpBusinessType } from '../../shared/erp-capabilities';
import type { AppSumoEvent } from './appsumo-protocol';

export interface AppSumoSql {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}
export type AppSumoTransaction = <T>(work: (sql: AppSumoSql) => Promise<T>) => Promise<T>;

export class AppSumoRepository {
  constructor(readonly sql: AppSumoSql, readonly transaction: AppSumoTransaction) {}

  async receive(payload: AppSumoEvent) {
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const { rows } = await this.sql.query(`INSERT INTO appsumo_events(fingerprint,license_key,event,payload)
      VALUES ($1,$2,$3,$4) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=excluded.fingerprint RETURNING *`,
      [fingerprint, payload.license_key, payload.event, JSON.stringify(payload)]);
    return rows[0];
  }

  async process(id: number, reconciledStatus?: 'active' | 'inactive' | 'deactivated') {
    try {
      await this.transaction(async tx => {
        // Serialize license lineage changes, including events received before their predecessors.
        await tx.query('SELECT pg_advisory_xact_lock(259, 1)');
        const { rows: [receipt] } = await tx.query('SELECT * FROM appsumo_events WHERE id=$1 FOR UPDATE', [id]);
        if (!receipt || receipt.status === 'processed') return;
        const e = receipt.payload as AppSumoEvent;
        if (e.parent_license_key) throw new Error('AppSumo add-ons are not configured');
        const { rows: [existing] } = await tx.query('SELECT * FROM appsumo_licenses WHERE license_key=$1 FOR UPDATE', [e.license_key]);
        let tier = e.tier ?? existing?.tier;
        if (e.event !== 'purchase' && e.event !== 'deactivate') {
          const { rows: [mapping] } = await tx.query('SELECT p.id FROM appsumo_tiers t JOIN plans p ON p.id=t.plan_id WHERE t.tier=$1 AND p.is_active=true', [tier]);
          if (!mapping) throw new Error('Configure an active Talkzen plan for this AppSumo tier');
        }
        if (existing?.status === 'deactivated' && ['activate','upgrade','downgrade'].includes(e.event) && !reconciledStatus) {
          throw new Error('Reconciliation required before reactivation');
        }
        const { rows: [previousDelivery] } = await tx.query(`SELECT id FROM appsumo_events WHERE license_key=$1 AND event=$2 AND status='processed' AND id<>$3 LIMIT 1`, [e.license_key, e.event, id]);
        if (previousDelivery && !reconciledStatus && !existing?.replacement_key &&
            ((e.event === 'activate' && existing?.status !== 'active') || (e.event === 'deactivate' && existing?.status !== 'deactivated'))) {
          throw new Error('Reconciliation required for repeated lifecycle event');
        }
        const desired = reconciledStatus ?? (e.event === 'purchase' ? 'inactive' : e.event === 'deactivate' ? 'deactivated' : 'active');
        await tx.query(`INSERT INTO appsumo_licenses(license_key,tier,status) VALUES ($1,$2,$3)
          ON CONFLICT(license_key) DO NOTHING`, [e.license_key, tier ?? null, desired]);
        if (e.event === 'upgrade' || e.event === 'downgrade') {
          if (!e.prev_license_key || e.prev_license_key === e.license_key) throw new Error('Missing or invalid previous license key');
          const { rows: [previous] } = await tx.query('SELECT * FROM appsumo_licenses WHERE license_key=$1 FOR UPDATE', [e.prev_license_key]);
          if (!previous) throw new Error('Waiting for previous license webhook');
          if(existing?.company_id && previous.company_id && existing.company_id!==previous.company_id) throw new Error('License ownership conflicts with its previous license; contact support');
          const {rows:cycle}=await tx.query(`WITH RECURSIVE chain AS (
            SELECT license_key,replacement_key FROM appsumo_licenses WHERE license_key=$1
            UNION SELECT l.license_key,l.replacement_key FROM appsumo_licenses l JOIN chain c ON l.license_key=c.replacement_key
          ) SELECT 1 FROM chain WHERE license_key=$2`,[e.license_key,e.prev_license_key]);
          if(cycle.length) throw new Error('Invalid license replacement cycle');
          if (previous.replacement_key && previous.replacement_key !== e.license_key) throw new Error('Conflicting replacement license; reconciliation required');
          // Retain all historical keys. An older upgrade must never steal ownership from its successor.
          await tx.query(`UPDATE appsumo_licenses SET replacement_key=$2,status='superseded',updated_at=now() WHERE license_key=$1`, [e.prev_license_key, e.license_key]);
          await tx.query(`UPDATE appsumo_licenses SET previous_key=$2,company_id=COALESCE(company_id,$3),user_id=COALESCE(user_id,$4),
            tier=$5,updated_at=now() WHERE license_key=$1`, [e.license_key,e.prev_license_key,previous.company_id,previous.user_id,tier]);
        }
        if (e.event !== 'purchase') {
          await tx.query(`UPDATE appsumo_licenses SET status=$2,tier=COALESCE($3,tier),updated_at=now()
            WHERE license_key=$1 AND replacement_key IS NULL`, [e.license_key,desired,tier ?? null]);
        }
        // If an unlinked successor arrived first, propagate ownership to the final key.
        const { rows: [license] } = await tx.query('SELECT * FROM appsumo_licenses WHERE license_key=$1', [e.license_key]);
        if (license.company_id) {
          const { rows: chain } = await tx.query(`WITH RECURSIVE chain AS (
            SELECT *, ARRAY[license_key] AS path FROM appsumo_licenses WHERE license_key=$1
            UNION ALL SELECT l.*, c.path || l.license_key FROM appsumo_licenses l JOIN chain c ON l.license_key=c.replacement_key
              WHERE NOT l.license_key=ANY(c.path)
          ) SELECT * FROM chain WHERE replacement_key IS NULL`, [e.license_key]);
          if (chain[0]) {
            if(chain[0].company_id && chain[0].company_id!==license.company_id) throw new Error('License ownership conflicts with its successor; contact support');
            await tx.query('UPDATE appsumo_licenses SET company_id=$2,user_id=$3 WHERE license_key=$1', [chain[0].license_key,license.company_id,license.user_id]);
            await this.applyCompany(tx, license.company_id, chain[0].license_key);
          }
        }
        await tx.query(`UPDATE appsumo_events SET status='processed',processed_at=now(),error=NULL,attempts=attempts+1 WHERE id=$1`, [id]);
      });
    } catch (error) {
      await this.sql.query(`UPDATE appsumo_events SET status='failed',attempts=attempts+1,error=$2,
        next_attempt_at=now()+interval '1 minute' * LEAST(60,power(2,LEAST(attempts,6))) WHERE id=$1`,
        [id, error instanceof Error ? error.message.slice(0,500) : 'Processing failed']);
      throw error;
    }
  }

  async applyCompany(tx: AppSumoSql, companyId: number, key: string) {
    await tx.query("SELECT set_config('app.appsumo_write','on',true)");
    await tx.query('UPDATE companies SET appsumo_license_key=$2,subscription_start_date=COALESCE(subscription_start_date,now()) WHERE id=$1', [companyId,key]);
  }

  async register(hash: string, data: {companyName:string;companySlug:string;adminUsername:string;passwordHash:string;adminFullName:string;adminEmail:string;whatsappNumber?:string;requireApproval:boolean;businessType?:ErpBusinessType}) {
    return this.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(259,1)');
      const activation=await this.activation(hash,tx,true);
      if(activation.company_id) throw new Error('License already linked. Sign in to its existing company.');
      const {rows:[company]}=await tx.query(`INSERT INTO companies(name,slug,active,whatsapp_number) VALUES($1,$2,$3,$4) RETURNING id`,
        [data.companyName,data.companySlug,!data.requireApproval,data.whatsappNumber]);
      if (data.businessType) await tx.query('INSERT INTO company_settings(company_id,key,value) VALUES($1,$2,$3::jsonb)',
        [company.id,ERP_BUSINESS_TYPE_SETTING_KEY,JSON.stringify(data.businessType)]);
      const {rows:[user]}=await tx.query(`INSERT INTO users(username,password,full_name,email,company_id,role,is_super_admin)
        VALUES($1,$2,$3,$4,$5,'admin',false) RETURNING id`,[data.adminUsername,data.passwordHash,data.adminFullName,data.adminEmail,company.id]);
      await this.claim(tx,hash,company.id,user.id);
      return{companyId:company.id,userId:user.id};
    });
  }

  async activation(hash: string, tx: AppSumoSql = this.sql, lock = false) {
    const { rows: [activation] } = await tx.query(`SELECT a.*,l.status,l.tier,l.company_id,l.user_id,l.replacement_key
      FROM appsumo_activations a JOIN appsumo_licenses l ON l.license_key=a.license_key
      WHERE a.token_hash=$1 AND a.expires_at>now() AND a.consumed_at IS NULL ${lock ? 'FOR UPDATE OF a,l' : ''}`, [hash]);
    if (!activation) throw new Error('Activation expired. Please activate again from AppSumo.');
    if (activation.status !== 'active' || activation.replacement_key) throw new Error('License is not active. Please activate the current license from AppSumo.');
    return activation;
  }

  async claim(tx: AppSumoSql, hash: string, companyId: number, userId: number) {
    const activation = await this.activation(hash,tx,true);
    const {rows:[reserved]} = await tx.query('SELECT pending_company_id FROM appsumo_licenses WHERE license_key=$1',[activation.license_key]);
    if (reserved.pending_company_id && reserved.pending_company_id !== companyId) throw new Error('License is reserved for another company');
    if (activation.company_id && activation.company_id !== companyId) throw new Error('This license is already linked to another company.');
    if (activation.target_company_id && activation.target_company_id !== companyId) throw new Error('Activation is already reserved for another company.');
    const { rows: [other] } = await tx.query('SELECT license_key FROM appsumo_licenses WHERE company_id=$1 AND replacement_key IS NULL', [companyId]);
    if (other && other.license_key !== activation.license_key) throw new Error('This company already has an AppSumo license. Manage its tier on AppSumo.');
    await tx.query('UPDATE appsumo_licenses SET company_id=$2,pending_company_id=NULL,user_id=COALESCE(user_id,$3),updated_at=now() WHERE license_key=$1', [activation.license_key,companyId,userId]);
    await this.applyCompany(tx,companyId,activation.license_key);
    await tx.query('UPDATE appsumo_activations SET consumed_at=now() WHERE token_hash=$1', [hash]);
  }
}
