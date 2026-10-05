import axios from 'axios';
import { storage } from '../storage';
import { getPool } from '../db';
import { WHATSAPP_ONBOARDING_API_VERSION } from '../../shared/whatsapp-onboarding';
import { patchWhatsAppConnection } from './whatsapp-connection-state';

/** SMB requests can only be made once per onboarding. Ambiguous outcomes are never replayed. */
export async function requestCoexistenceSync(connectionId: number) {
  const lock = await getPool().connect();
  let locked = false;
  try {
    const result = await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [`whatsapp-sync:${connectionId}`]);
    if (!(locked = result.rows[0].locked)) return;
    for (const [prefix, syncType] of [['contact', 'smb_app_state_sync'], ['history', 'history']] as const) {
      const connection = await storage.getChannelConnection(connectionId);
      const data = connection?.connectionData as any;
      if (!connection || data?.signupMode !== 'coexistence' || data.onboardingStatus !== 'ready') return;
      if (prefix === 'history' && !data.historySyncEnabled) continue;
      const status = data[`${prefix}SyncStatus`];
      if (prefix === 'history' && !data.contactSyncRequestId && !['received', 'completed'].includes(data.contactSyncStatus)) return;
      if (data[`${prefix}SyncRequestId`] || ['received', 'syncing', 'completed', 'declined', 'unknown', 'expired'].includes(status)) continue;
      if (status === 'requesting') {
        if (Date.now() - new Date(data[`${prefix}SyncRequestedAt`]).getTime() > 5 * 60_000) {
          await patchWhatsAppConnection(connectionId, { [`${prefix}SyncStatus`]: 'unknown', syncNotice: 'A sync request was interrupted. Its outcome is unknown; do not repeat this one-time request.' });
        }
        continue;
      }
      const started = new Date(data.coexistenceOnboardedAt).getTime();
      if (!Number.isFinite(started) || Date.now() - started >= 24 * 60 * 60_000) {
        await patchWhatsAppConnection(connectionId, { [`${prefix}SyncStatus`]: 'expired', syncNotice: 'The 24-hour synchronization window has expired. Contact support before disconnecting and onboarding again.' });
        continue;
      }
      await patchWhatsAppConnection(connectionId, { [`${prefix}SyncStatus`]: 'requesting', [`${prefix}SyncRequestedAt`]: new Date().toISOString() });
      try {
        const response = await axios.post(`https://graph.facebook.com/${WHATSAPP_ONBOARDING_API_VERSION}/${data.phoneNumberId}/smb_app_data`,
          { messaging_product: 'whatsapp', sync_type: syncType }, { headers: { Authorization: `Bearer ${data.accessToken}` }, timeout: 20_000 });
        if (!response.data?.request_id) throw new Error('No request ID returned');
        const latest = (await storage.getChannelConnection(connectionId))?.connectionData as any;
        await patchWhatsAppConnection(connectionId, {
          [`${prefix}SyncRequestId`]: response.data.request_id,
          // A webhook may already have completed or declined the request.
          [`${prefix}SyncStatus`]: ['received', 'completed', 'declined'].includes(latest?.[`${prefix}SyncStatus`]) ? latest[`${prefix}SyncStatus`] : 'syncing',
        });
      } catch (error: any) {
        const definiteRejection = !!error.response && error.response.status < 500;
        const latest = (await storage.getChannelConnection(connectionId))?.connectionData as any;
        // Signed webhooks can arrive before the request returns or times out.
        if (['received', 'completed', 'declined'].includes(latest?.[`${prefix}SyncStatus`])) continue;
        if (prefix === 'history' && error.response?.data?.error?.code === 2593109) {
          await patchWhatsAppConnection(connectionId, { historySyncStatus: 'declined', syncNotice: 'History sharing was declined in WhatsApp. Your messaging connection remains active.' });
          continue;
        }
        await patchWhatsAppConnection(connectionId, {
          [`${prefix}SyncStatus`]: definiteRejection ? 'failed' : 'unknown',
          syncNotice: definiteRejection ? 'Meta rejected the sync request. Check permissions and retry setup.' : 'Meta did not confirm the one-time sync request. Its outcome is unknown; contact support before retrying.',
        });
        // Preserve contacts-before-history ordering on failure.
        return;
      }
    }
  } finally {
    try {
      if (locked) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`whatsapp-sync:${connectionId}`]);
    } finally { lock.release(); }
  }
}
