import { randomUUID } from "crypto";
import { storage } from "../storage";

type CalendarAuditAction = 'check_availability' | 'book' | 'cancel' | 'reconcile' | 'retry' | 'auth' | string;

type CalendarAuditEntry = {
  action: CalendarAuditAction;
  userId?: number | null;
  companyId?: number | null;
  traceId?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  latencyMs?: number;
  error?: unknown;
};

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/token|secret|password|authorization|credential/i.test(key)) {
        return [key, '[redacted]'];
      }
      return [key, redact(item)];
    })
  );
}

class CalendarAuditLogger {
  createTraceId(): string {
    return randomUUID();
  }

  async log(entry: CalendarAuditEntry): Promise<void> {
    const traceId = entry.traceId || this.createTraceId();
    const payload = {
      traceId,
      ...(redact(entry.payload || {}) as Record<string, unknown>)
    };
    const result = {
      ...(entry.error ? { error: entry.error instanceof Error ? entry.error.message : String(entry.error) } : {}),
      ...(redact(entry.result || {}) as Record<string, unknown>)
    };

    await storage.appendCalendarAuditLog({
      action: entry.action,
      userId: entry.userId ?? null,
      companyId: entry.companyId ?? null,
      payload,
      result,
      latencyMs: entry.latencyMs
    });

    console.info('[calendar-audit]', JSON.stringify({
      traceId,
      action: entry.action,
      userId: entry.userId ?? null,
      companyId: entry.companyId ?? null,
      latencyMs: entry.latencyMs,
      outcome: entry.error ? 'error' : (entry.result?.success === false ? 'failed' : 'ok')
    }));
  }

  async time<T>(label: CalendarAuditAction, fn: () => Promise<T>, entry: Omit<CalendarAuditEntry, 'action' | 'latencyMs' | 'result' | 'error'> = {}): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      await this.log({
        ...entry,
        action: label,
        latencyMs: Date.now() - start,
        result: typeof result === 'object' && result !== null ? result as Record<string, unknown> : { value: result }
      });
      return result;
    } catch (error) {
      await this.log({
        ...entry,
        action: label,
        latencyMs: Date.now() - start,
        error
      });
      throw error;
    }
  }
}

export const calendarAuditLogger = new CalendarAuditLogger();
