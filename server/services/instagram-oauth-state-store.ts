import { createHash, randomBytes } from 'crypto';
import { pool } from '../db';

export interface InstagramOAuthState {
  userId: number;
  companyId: number;
  connectionName: string;
  redirectUri: string;
  appId: string;
}

const hash = (state: string) => createHash('sha256').update(state).digest('hex');

export async function createInstagramOAuthState(data: InstagramOAuthState): Promise<string> {
  await pool.query('DELETE FROM instagram_oauth_states WHERE expires_at <= NOW()');
  const state = randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO instagram_oauth_states
    (state_hash, user_id, company_id, connection_name, redirect_uri, app_id, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')`,
  [hash(state), data.userId, data.companyId, data.connectionName, data.redirectUri, data.appId]);
  return state;
}

export async function consumeInstagramOAuthState(state: string, userId: number, companyId: number): Promise<InstagramOAuthState | null> {
  if (!/^[a-f0-9]{64}$/.test(state)) return null;
  const result = await pool.query(`DELETE FROM instagram_oauth_states
    WHERE state_hash = $1 AND user_id = $2 AND company_id = $3 AND expires_at > NOW()
    RETURNING user_id, company_id, connection_name, redirect_uri, app_id`, [hash(state), userId, companyId]);
  const row = result.rows[0];
  return row ? { userId: row.user_id, companyId: row.company_id, connectionName: row.connection_name,
    redirectUri: row.redirect_uri, appId: row.app_id } : null;
}
