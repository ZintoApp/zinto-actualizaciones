import { getDefaultBrandingDocumentTitle } from '@/contexts/branding-context';

export type DocumentMetadataInput = {
  title?: string;
  description?: string;
  keywords?: string;
  faviconUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  twitterCard?: 'summary' | 'summary_large_image';
};

const MANAGED_META_ATTR = 'data-frontend-website-meta';

type ManagedMetaTag = {
  element: HTMLMetaElement | HTMLLinkElement;
  created: boolean;
  originalContent: string | null;
  hadContentAttr: boolean;
};

let managedTags: ManagedMetaTag[] = [];
let savedBrandingTitle: string | null = null;
let savedBrandingFaviconHref: string | null = null;

function findExistingMeta(name: string, property?: string): HTMLMetaElement | null {
  if (property) {
    return document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  }
  return document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
}

function trackManagedElement(element: HTMLMetaElement | HTMLLinkElement, created: boolean) {
  if (managedTags.some((entry) => entry.element === element)) {
    return;
  }

  const originalContent =
    element instanceof HTMLLinkElement
      ? element.getAttribute('href')
      : element.getAttribute('content');

  element.setAttribute(MANAGED_META_ATTR, 'true');
  managedTags.push({
    element,
    created,
    originalContent,
    hadContentAttr: element.hasAttribute('content') || element.hasAttribute('href'),
  });
}

function getOrCreateMeta(name: string, property?: string): HTMLMetaElement {
  let element = findExistingMeta(name, property);
  const created = !element;

  if (!element) {
    element = document.createElement('meta');
    if (property) {
      element.setAttribute('property', property);
    } else {
      element.setAttribute('name', name);
    }
    document.head.appendChild(element);
  }

  trackManagedElement(element, created);
  return element;
}

function getOrCreateLink(rel: string): HTMLLinkElement {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  const created = !element;

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }

  trackManagedElement(element, created);
  return element;
}

function snapshotBrandingDefaults() {
  if (savedBrandingTitle === null) {
    savedBrandingTitle = document.title;
  }
  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (savedBrandingFaviconHref === null && favicon) {
    savedBrandingFaviconHref = favicon.href;
  }
}

export function applyDocumentMetadata(
  metadata: DocumentMetadataInput,
  brandingFallback?: { appName?: string; faviconUrl?: string }
) {
  snapshotBrandingDefaults();

  const title =
    metadata.title?.trim() ||
    metadata.ogTitle?.trim() ||
    (brandingFallback?.appName
      ? getDefaultBrandingDocumentTitle(brandingFallback.appName)
      : savedBrandingTitle || document.title);
  document.title = title;

  const description = metadata.description?.trim() || metadata.ogDescription?.trim();
  if (description) {
    getOrCreateMeta('description').setAttribute('content', description);
  }

  if (metadata.keywords?.trim()) {
    getOrCreateMeta('keywords').setAttribute('content', metadata.keywords.trim());
  }

  const faviconUrl = metadata.faviconUrl || brandingFallback?.faviconUrl;
  if (faviconUrl) {
    const favicon = getOrCreateLink('icon');
    favicon.href = faviconUrl;
  }

  const ogTitle = metadata.ogTitle?.trim() || metadata.title?.trim() || title;
  getOrCreateMeta('og:title', 'og:title').setAttribute('content', ogTitle);

  const ogDescription =
    metadata.ogDescription?.trim() || metadata.description?.trim() || description || '';
  if (ogDescription) {
    getOrCreateMeta('og:description', 'og:description').setAttribute('content', ogDescription);
  }

  if (metadata.ogImageUrl) {
    getOrCreateMeta('og:image', 'og:image').setAttribute('content', metadata.ogImageUrl);
  }

  const twitterCard = metadata.twitterCard || (metadata.ogImageUrl ? 'summary_large_image' : 'summary');
  getOrCreateMeta('twitter:card').setAttribute('content', twitterCard);

  if (ogTitle) {
    getOrCreateMeta('twitter:title').setAttribute('content', ogTitle);
  }
  if (ogDescription) {
    getOrCreateMeta('twitter:description').setAttribute('content', ogDescription);
  }
  if (metadata.ogImageUrl) {
    getOrCreateMeta('twitter:image').setAttribute('content', metadata.ogImageUrl);
  }
}

function restoreManagedElement({
  element,
  created,
  originalContent,
  hadContentAttr,
}: ManagedMetaTag) {
  if (created) {
    element.parentNode?.removeChild(element);
    return;
  }

  if (element instanceof HTMLLinkElement) {
    if (hadContentAttr && originalContent !== null) {
      element.setAttribute('href', originalContent);
    } else {
      element.removeAttribute('href');
    }
  } else if (hadContentAttr) {
    if (originalContent !== null) {
      element.setAttribute('content', originalContent);
    } else {
      element.removeAttribute('content');
    }
  } else {
    element.removeAttribute('content');
  }

  element.removeAttribute(MANAGED_META_ATTR);
}

export function clearDocumentMetadata(brandingFallback?: { appName?: string; faviconUrl?: string }) {
  for (const entry of managedTags) {
    restoreManagedElement(entry);
  }
  managedTags = [];

  if (brandingFallback?.appName) {
    document.title = getDefaultBrandingDocumentTitle(brandingFallback.appName);
  } else if (savedBrandingTitle) {
    document.title = savedBrandingTitle;
  }

  const faviconUrl = brandingFallback?.faviconUrl || savedBrandingFaviconHref;
  if (faviconUrl) {
    const existingFavicon = document.querySelector(
      `link[rel="icon"]:not([${MANAGED_META_ATTR}])`
    ) as HTMLLinkElement | null;
    if (existingFavicon) {
      existingFavicon.href = faviconUrl;
    }
  }
}
