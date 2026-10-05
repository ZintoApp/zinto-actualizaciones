export const INBOX_EMBED_PATH = '/inbox/embed';

const COMPANY_SCOPED_INBOX_EMBED_PATH_REGEX = /^\/[^/]+\/inbox\/embed$/;

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function normalizeCompanySlug(companySlug?: string | null): string {
  return (companySlug ?? '').trim().replace(/^\/+|\/+$/g, '');
}

export function buildInboxEmbedPath(companySlug?: string | null): string {
  const normalizedCompanySlug = normalizeCompanySlug(companySlug);

  if (!normalizedCompanySlug) {
    return INBOX_EMBED_PATH;
  }

  return `/${encodeURIComponent(normalizedCompanySlug)}${INBOX_EMBED_PATH}`;
}

export function isEmbeddedInboxMode(pathname: string, embeddedContext: boolean): boolean {
  if (embeddedContext) {
    return true;
  }

  const normalizedPath = normalizePath(pathname);
  return normalizedPath === INBOX_EMBED_PATH || COMPANY_SCOPED_INBOX_EMBED_PATH_REGEX.test(normalizedPath);
}

export function isEmbeddedInboxAccessAllowed(
  pathname: string,
  embeddedContext: boolean,
  inboxEmbeddingEnabled: boolean,
): boolean {
  return !isEmbeddedInboxMode(pathname, embeddedContext) || inboxEmbeddingEnabled;
}

export function buildInboxEmbedUrl(baseUrl: string, companySlug?: string | null): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const embedPath = buildInboxEmbedPath(companySlug);
  return normalizedBaseUrl ? `${normalizedBaseUrl}${embedPath}` : embedPath;
}

export function buildInboxEmbedCode(baseUrl: string, companySlug?: string | null): string {
  const embedUrl = buildInboxEmbedUrl(baseUrl, companySlug);

  return [
    '<iframe',
    `  src="${embedUrl}"`,
    '  title="Inbox"',
    '  width="100%"',
    '  height="700"',
    '  style="width:100%; min-height:700px; border:0;"',
    '  loading="lazy"',
    '></iframe>',
  ].join('\n');
}