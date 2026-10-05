/**
 * Reconnect handler for WhatsApp (unofficial/official).
 * Extracted for testability: real tests can call executeReconnect with mocked deps.
 */

export interface ReconnectDeps {
  storage: {
    getChannelConnection(connectionId: number): Promise<{ channelType: string } | null>;
    deleteWhatsappAuthState(connectionId: number): Promise<void>;
    updateChannelConnectionStatus(connectionId: number, status: string): Promise<void>;
  };
  whatsAppService: {
    disconnect(connectionId: number, userId: number): Promise<void>;
    connect(connectionId: number, userId: number): Promise<void>;
  };
  path: { join: (...args: string[]) => string };
  fs: { existsSync(p: string): boolean; rmSync(p: string, opts: { recursive: boolean; force: boolean }): void };
}

export type ReconnectResult =
  | { ok: true }
  | { ok: false; status: 404 | 400; error: string };

/**
 * Executes reconnect logic: when forceQR is true for unofficial WhatsApp,
 * disconnects, deletes auth state, removes session dir, updates status, then connects.
 */
export async function executeReconnect(
  connectionId: number,
  userId: number,
  forceQR: boolean,
  deps: ReconnectDeps
): Promise<ReconnectResult> {
  const connection = await deps.storage.getChannelConnection(connectionId);
  if (!connection) {
    return { ok: false, status: 404, error: 'Connection not found' };
  }

  const channelType = connection.channelType;
  if (channelType !== 'whatsapp' && channelType !== 'whatsapp_unofficial' && channelType !== 'whatsapp_official') {
    return { ok: false, status: 400, error: 'Only WhatsApp connections can be reconnected' };
  }

  if (forceQR && (channelType === 'whatsapp' || channelType === 'whatsapp_unofficial')) {
    await deps.whatsAppService.disconnect(connectionId, userId);
    await deps.storage.deleteWhatsappAuthState(connectionId);
    const sessionDir = deps.path.join(process.cwd(), 'whatsapp-sessions', `session-${connectionId}`);
    if (deps.fs.existsSync(sessionDir)) {
      deps.fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    await deps.storage.updateChannelConnectionStatus(connectionId, 'qr_code');
  }

  await deps.whatsAppService.connect(connectionId, userId);
  return { ok: true };
}
