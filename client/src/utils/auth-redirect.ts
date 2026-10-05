type LocationLike = {
  pathname: string;
  search?: string;
  hash?: string;
};

const DEFAULT_ORIGIN = 'http://localhost';

export function getRelativeUrl(url: string, origin = DEFAULT_ORIGIN): string {
  const parsedUrl = new URL(url, origin);
  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

export function getCurrentRelativeUrl(locationLike?: LocationLike): string {
  if (!locationLike) {
    return '/';
  }

  return `${locationLike.pathname}${locationLike.search ?? ''}${locationLike.hash ?? ''}`;
}

export function buildAuthRedirectPath(returnTo: string, authPath = '/auth'): string {
  const params = new URLSearchParams({ returnTo });
  return `${authPath}?${params.toString()}`;
}

export function buildAuthRedirectForLocation(locationLike?: LocationLike, authPath = '/auth'): string {
  return buildAuthRedirectPath(getCurrentRelativeUrl(locationLike), authPath);
}

export function sanitizeReturnTo(returnTo: string | null | undefined, fallback = '/'): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return fallback;
  }

  try {
    return getRelativeUrl(returnTo);
  } catch {
    return fallback;
  }
}