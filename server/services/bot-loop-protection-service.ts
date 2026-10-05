import { randomUUID } from 'crypto';
import { getPool } from '../db';

export const BOT_LOOP_DISABLE_REASON = 'bot_loop_rate_limit';
export const BOT_LOOP_DEFAULT_MAX_MESSAGES = 10;
export const BOT_LOOP_DEFAULT_WINDOW_MINUTES = 15;
export const BOT_LOOP_DEFAULT_RECOVERY_ACTION = 'human_reply';

export type BotLoopReservation = {
  reservationId: string;
  conversationId: number;
};

export type BotLoopReservationResult =
  | { protected: false }
  | { protected: true; allowed: true; reservation: BotLoopReservation }
  | { protected: true; allowed: false; limit: number; windowMinutes: number };

function settingBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function settingInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.floor(parsed) : fallback;
}

export function resolveBotLoopConfig(values: ReadonlyMap<string, unknown>): {
  enabled: boolean;
  limit: number;
  windowMinutes: number;
} {
  return {
    enabled: settingBoolean(values.get('bot_loop_protection_enabled'), false),
    limit: settingInteger(values.get('bot_loop_max_messages'), BOT_LOOP_DEFAULT_MAX_MESSAGES, 1, 100),
    windowMinutes: settingInteger(
      values.get('bot_loop_window_minutes'),
      BOT_LOOP_DEFAULT_WINDOW_MINUTES,
      1,
      1440
    ),
  };
}

export async function reserveBotLoopCapacity(params: {
  companyId: number;
  conversationId: number;
  messageCount?: number;
}): Promise<BotLoopReservationResult> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [params.companyId, params.conversationId]);

    const conversationState = await client.query(
      `SELECT bot_disabled, disable_reason FROM conversations
       WHERE id = $1 AND company_id = $2`,
      [params.conversationId, params.companyId]
    );
    if (
      conversationState.rows[0]?.bot_disabled === true &&
      conversationState.rows[0]?.disable_reason === BOT_LOOP_DISABLE_REASON
    ) {
      await client.query('COMMIT');
      return {
        protected: true,
        allowed: false,
        limit: BOT_LOOP_DEFAULT_MAX_MESSAGES,
        windowMinutes: BOT_LOOP_DEFAULT_WINDOW_MINUTES,
      };
    }

    const activeSession = await client.query(
      `SELECT 1 FROM flow_sessions
       WHERE company_id = $1 AND conversation_id = $2
         AND status IN ('active', 'waiting', 'paused')
       LIMIT 1`,
      [params.companyId, params.conversationId]
    );
    if (activeSession.rowCount === 0) {
      await client.query('COMMIT');
      return { protected: false };
    }

    const settings = await client.query(
      `SELECT key, value FROM company_settings
       WHERE company_id = $1 AND key = ANY($2::text[])`,
      [params.companyId, [
        'bot_loop_protection_enabled',
        'bot_loop_max_messages',
        'bot_loop_window_minutes',
      ]]
    );
    const values = new Map<string, unknown>(settings.rows.map((row) => [row.key, row.value]));
    const config = resolveBotLoopConfig(values);
    const enabled = config.enabled;
    if (!enabled) {
      await client.query('COMMIT');
      return { protected: false };
    }

    const limit = config.limit;
    const windowMinutes = config.windowMinutes;
    const messageCount = settingInteger(params.messageCount, 1, 1, 100);

    await client.query(
      `DELETE FROM bot_loop_message_reservations
       WHERE conversation_id = $1 AND expires_at <= NOW()`,
      [params.conversationId]
    );
    const usage = await client.query(
      `SELECT COALESCE(SUM(message_count), 0)::int AS count
       FROM bot_loop_message_reservations
       WHERE company_id = $1 AND conversation_id = $2
         AND expires_at > NOW() AND status IN ('reserved', 'sent')`,
      [params.companyId, params.conversationId]
    );
    const currentCount = Number(usage.rows[0]?.count ?? 0);

    if (currentCount + messageCount > limit) {
      await client.query(
        `UPDATE conversations
         SET bot_disabled = TRUE, disabled_at = NOW(), disable_duration = NULL,
             disable_reason = $3, updated_at = NOW()
         WHERE id = $1 AND company_id = $2`,
        [params.conversationId, params.companyId, BOT_LOOP_DISABLE_REASON]
      );
      await client.query(
        `UPDATE flow_sessions
         SET status = 'abandoned', completed_at = NOW(), updated_at = NOW(),
             last_error_message = 'Automation stopped: message rate limit reached'
         WHERE company_id = $1 AND conversation_id = $2
           AND status IN ('active', 'waiting', 'paused')`,
        [params.companyId, params.conversationId]
      );
      await client.query('COMMIT');
      return { protected: true, allowed: false, limit, windowMinutes };
    }

    const reservationId = randomUUID();
    await client.query(
      `INSERT INTO bot_loop_message_reservations
        (company_id, conversation_id, reservation_id, message_count, status, expires_at)
       VALUES ($1, $2, $3, $4, 'reserved', NOW() + ($5 * INTERVAL '1 minute'))`,
      [params.companyId, params.conversationId, reservationId, messageCount, windowMinutes]
    );
    await client.query('COMMIT');
    return {
      protected: true,
      allowed: true,
      reservation: { reservationId, conversationId: params.conversationId },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function commitBotLoopReservation(reservation: BotLoopReservation): Promise<void> {
  await getPool().query(
    `UPDATE bot_loop_message_reservations
     SET status = 'sent', sent_at = NOW()
     WHERE reservation_id = $1 AND conversation_id = $2`,
    [reservation.reservationId, reservation.conversationId]
  );
}

export async function releaseBotLoopReservation(reservation: BotLoopReservation): Promise<void> {
  await getPool().query(
    `DELETE FROM bot_loop_message_reservations
     WHERE reservation_id = $1 AND conversation_id = $2 AND status = 'reserved'`,
    [reservation.reservationId, reservation.conversationId]
  );
}

export async function clearBotLoopRateHistory(conversationId: number): Promise<void> {
  await getPool().query(
    'DELETE FROM bot_loop_message_reservations WHERE conversation_id = $1',
    [conversationId]
  );
}

export async function resetBotLoopProtectionAfterHumanReply(conversationId: number): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const recovery = await client.query(
      `SELECT cs.value
       FROM conversations c
       LEFT JOIN company_settings cs
         ON cs.company_id = c.company_id AND cs.key = 'bot_loop_recovery_action'
       WHERE c.id = $1`,
      [conversationId]
    );
    const recoveryAction = recovery.rows[0]?.value;
    if (typeof recoveryAction === 'string' && recoveryAction !== BOT_LOOP_DEFAULT_RECOVERY_ACTION) {
      await client.query('COMMIT');
      return false;
    }
    const result = await client.query(
      `UPDATE conversations
       SET bot_disabled = FALSE, disabled_at = NULL, disable_duration = NULL,
           disable_reason = NULL, updated_at = NOW()
       WHERE id = $1 AND bot_disabled = TRUE AND disable_reason = $2
       RETURNING company_id`,
      [conversationId, BOT_LOOP_DISABLE_REASON]
    );
    if (result.rowCount) {
      await client.query('DELETE FROM bot_loop_message_reservations WHERE conversation_id = $1', [conversationId]);
    }
    await client.query('COMMIT');
    return Boolean(result.rowCount);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
