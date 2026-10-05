import { getPool } from '../db';
import { storage } from '../storage';
import { broadcastToCompany } from '../utils/websocket';

export async function patchWhatsAppConnection(id: number, patch: Record<string, unknown>, status?: string) {
  await getPool().query(`UPDATE channel_connections SET connection_data = COALESCE(connection_data, '{}'::jsonb) || $2::jsonb,
    status = COALESCE($3, status), updated_at = now() WHERE id = $1`, [id, JSON.stringify(patch), status || null]);
  const connection = await storage.getChannelConnection(id);
  if (connection?.companyId) {
    // Do not broadcast credentials with connection state.
    broadcastToCompany({ type: 'channelConnectionUpdated', data: { id, status: connection.status, ...patch } }, connection.companyId);
  }
  return connection!;
}

export class WhatsAppMessagingPausedError extends Error {
  readonly code = 'WHATSAPP_MESSAGING_PAUSED';
  readonly retryable = true;
  constructor() { super('WhatsApp Cloud API messaging is paused while the Business app reconnects. Try again after reconnection.'); }
}
export function assertWhatsAppMessagingReady(connection: { connectionData?: unknown; status?: string | null }) {
  const data = connection.connectionData as any;
  if (data?.coexistenceStatus === 'offboarded' || data?.coexistenceStatus === 'disconnected' ||
      (data?.onboardingStatus && data.onboardingStatus !== 'ready')) throw new WhatsAppMessagingPausedError();
}

/** Re-evaluate free-form eligibility after reconnection; imports never open a window. */
export async function assertReconnectedWhatsAppWindow(connection: { id: number; companyId: number | null; connectionData?: unknown }, recipient: string) {
  const data = connection.connectionData as any;
  if (data?.signupMode !== 'coexistence' || !data.coexistenceEventAt) return;
  const digits = /^\+?[\d\s()-]+$/.test(recipient) ? recipient.replace(/\D/g, '') : null;
  const { rows: [row] } = await getPool().query(`SELECT MAX(m.created_at) AS inbound_at FROM messages m
    JOIN conversations c ON c.id=m.conversation_id JOIN contacts k ON k.id=c.contact_id
    WHERE c.channel_id=$1 AND c.company_id=$2 AND m.direction='inbound' AND COALESCE(m.is_history_sync,false)=false
      AND (($3::text IS NOT NULL AND regexp_replace(k.phone, '[^0-9]', '', 'g')=$3) OR k.whatsapp_bsuid=$4)
      AND m.created_at >= $5`, [connection.id, connection.companyId, digits, recipient, data.coexistenceOnboardedAt || new Date(0)]);
  if (!row?.inbound_at || Date.now() - new Date(row.inbound_at).getTime() >= 24 * 60 * 60_000) {
    throw new Error('The 24-hour customer service window is closed. Use an approved WhatsApp template to send this message.');
  }
}
