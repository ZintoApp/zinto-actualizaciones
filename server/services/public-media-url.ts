/** Build absolute URL for paths like `/uploads/...` used by channel media sends. */

export function toFullPublicMediaUrl(mediaUrl: string, overrideBaseUrl?: string): string {
  if (!mediaUrl) return '';

  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    return mediaUrl;
  }

  let baseUrl = overrideBaseUrl || process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;

  if (!baseUrl) {
    const basePort = process.env.PORT || '9000';
    const host = process.env.HOST || 'localhost';

    const isLoopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.localhost');

    const protocol =
      isLoopback ? 'http' : process.env.NODE_ENV === 'production' ? 'https' : 'http';

    const port = basePort;

    if (host === 'localhost' || host === '127.0.0.1') {
      baseUrl = `${protocol}://${host}:${port}`;
    } else {
      baseUrl = `${protocol}://${host}`;
    }
  }

  const normalizedMediaUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;

  return `${baseUrl.replace(/\/$/, '')}${normalizedMediaUrl}`;
}
