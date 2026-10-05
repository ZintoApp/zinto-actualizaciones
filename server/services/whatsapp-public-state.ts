/** Customer business tokens are server-only, including legacy connections. */
export function sanitizeWhatsAppConnection<T extends { accessToken?: unknown; connectionData?: unknown }>(connection: T): T {
  const data = { ...(connection.connectionData as Record<string, unknown> || {}) };
  for (const key of ['accessToken', 'access_token', 'appSecret', 'refreshToken', 'encryptedRegistrationPin']) delete data[key];
  return { ...connection, accessToken: undefined, connectionData: data };
}
