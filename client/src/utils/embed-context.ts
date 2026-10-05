/**
 * Utility functions for managing embed context across the application
 */

const EMBED_STORAGE_KEY = 'bothive_embed_context';
const EMBED_PARAM = 'embed';

/**
 * Check if the current page is in an embedded context
 */
export function isEmbeddedContext(): boolean {

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get(EMBED_PARAM) === 'true') {
    return true;
  }


  try {
    if (window.self !== window.top) {
      return true;
    }
  } catch (e) {

    return true;
  }


  const stored = sessionStorage.getItem(EMBED_STORAGE_KEY);
  return stored === 'true';
}

/**
 * Initialize and persist embed context
 */
export function initializeEmbedContext(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const hasEmbedParam = urlParams.get(EMBED_PARAM) === 'true';
  
  let isInIframe = false;
  try {
    isInIframe = window.self !== window.top;
  } catch (e) {

    isInIframe = true;
  }

  if (hasEmbedParam || isInIframe) {
    sessionStorage.setItem(EMBED_STORAGE_KEY, 'true');
    document.body.classList.add('embedded-context');
    

    document.cookie = `${EMBED_STORAGE_KEY}=true; path=/; max-age=${24 * 60 * 60}; SameSite=Lax`;
    

    if (!hasEmbedParam && isInIframe) {
      const newUrl = preserveEmbedParam(window.location.href);
      if (newUrl !== window.location.href) {
        window.history.replaceState({}, '', newUrl);
      }
    }
    

    if (isInIframe && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'app-loaded' }, '*');
      } catch (e) {

      }
    }
  } else {

    sessionStorage.removeItem(EMBED_STORAGE_KEY);
    document.body.classList.remove('embedded-context');

    document.cookie = `${EMBED_STORAGE_KEY}=; path=/; max-age=0`;
  }
}

/**
 * Get the embed parameter to append to URLs
 */
export function getEmbedParam(): string {
  return isEmbeddedContext() ? '?embed=true' : '';
}

/**
 * Append embed parameter to a URL if in embedded context
 */
export function preserveEmbedParam(url: string): string {
  if (!isEmbeddedContext()) {
    return url;
  }

  try {
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set(EMBED_PARAM, 'true');
    return urlObj.toString();
  } catch (e) {

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${EMBED_PARAM}=true`;
  }
}

/**
 * Get embed query string for relative URLs
 */
export function getEmbedQueryString(): string {
  return isEmbeddedContext() ? `?${EMBED_PARAM}=true` : '';
}

