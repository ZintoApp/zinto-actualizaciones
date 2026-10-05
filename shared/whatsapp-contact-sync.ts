export const WHATSAPP_CONTACT_SYNC_ACTIVE_STATUSES = ['queued', 'running'] as const;
export const WHATSAPP_CONTACT_SYNC_TERMINAL_STATUSES = ['completed', 'completed_with_errors', 'failed'] as const;

export type WhatsAppContactSyncStatus =
  | (typeof WHATSAPP_CONTACT_SYNC_ACTIVE_STATUSES)[number]
  | (typeof WHATSAPP_CONTACT_SYNC_TERMINAL_STATUSES)[number];

export interface WhatsAppContactSyncRun {
  id: number;
  status: WhatsAppContactSyncStatus;
  total: number;
  processed: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export function isWhatsAppContactSyncActive(status?: string | null): boolean {
  return status === 'queued' || status === 'running';
}
