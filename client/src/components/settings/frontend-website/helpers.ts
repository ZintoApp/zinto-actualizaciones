import {
  collectReferencedFrontendWebsiteAssetIds,
  createDefaultFrontendWebsiteLocaleContent,
  createDefaultFrontendWebsiteSettings,
  createEmptyManagedPage,
  createManagedPageFromTemplate,
  frontendWebsiteSettingsPayloadSchema,
  normalizeFrontendWebsiteMediaLibrary,
  normalizeFrontendWebsiteSettings,
  normalizeManagedPagesForSave,
  slugifyFrontendWebsitePageTitle,
  normalizeFrontendWebsiteManagedPageSlug,
  validateFrontendWebsiteAssetReferences,
  validateFrontendWebsiteLegalPageReferences,
  validateFrontendWebsiteLocaleKeys,
  validateFrontendWebsiteManagedPages,
  validateFrontendWebsitePricingPlanReferences,
  type FrontendWebsiteFaqBlock,
  type FrontendWebsiteFaqItem,
  type FrontendWebsiteIdentifiableLink,
  type FrontendWebsiteManagedPage,
  type FrontendWebsiteMediaAsset,
  type FrontendWebsiteMediaLibrary,
  type FrontendWebsitePageReference,
  type FrontendWebsitePricingBlock,
  type FrontendWebsitePricingPlan,
  type FrontendWebsiteSectionVisibility,
  type FrontendWebsiteSeo,
  type FrontendWebsiteSettings,
  type FrontendWebsiteSettingsPayload,
} from '@shared/frontend-website-settings';
import type { LandingFooterLink } from '@shared/landing-page-content';
import type { ParseImageUploadResponse } from '@/components/ui/image-upload-dialog';

export const FRONTEND_WEBSITE_SETTINGS_QUERY_KEY = ['/api/admin/settings/frontend-website'] as const;

export const FRONTEND_WEBSITE_MEDIA_UPLOAD_URL = '/api/admin/settings/frontend-website/media';

export const FRONTEND_WEBSITE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

export const FRONTEND_WEBSITE_SUPPORTED_FORMATS_HINT =
  'Supported formats: JPEG, PNG, GIF, WebP, SVG, ICO (max 10MB)';

export function parseFrontendWebsiteUploadResponse(response: unknown): ReturnType<ParseImageUploadResponse> {
  const parsed = response as {
    asset?: { url: string; id: string; alt?: string; title?: string };
    message?: string;
    error?: string;
  };

  if (parsed.asset?.url) {
    return {
      success: true,
      url: parsed.asset.url,
      altText: parsed.asset.alt,
      title: parsed.asset.title,
      rawResponse: response,
    };
  }

  return {
    success: false,
    error: parsed.error || parsed.message || 'Upload failed',
    rawResponse: response,
  };
}

export function extractUploadedAsset(rawResponse: unknown): FrontendWebsiteMediaAsset | null {
  const parsed = rawResponse as { asset?: FrontendWebsiteMediaAsset };
  return parsed.asset ?? null;
}

export function syncLegacyHomepageSectionVisibility(
  draft: FrontendWebsiteSettings,
  visibility: FrontendWebsiteSectionVisibility
): FrontendWebsiteSettings {
  const localizedContent = { ...draft.localizedContent };

  for (const [locale, content] of Object.entries(localizedContent)) {
    localizedContent[locale] = {
      ...content,
      homepage: {
        ...content.homepage,
        showPricingSection: visibility.pricing,
        showTestimonialsSection: visibility.testimonials,
      },
    };
  }

  return {
    ...draft,
    sectionVisibility: visibility,
    localizedContent,
  };
}

export function ensureLocaleContent(
  draft: FrontendWebsiteSettings,
  locale: string,
  appName: string
): FrontendWebsiteSettings {
  if (draft.localizedContent[locale]) {
    return draft;
  }

  return {
    ...draft,
    localizedContent: {
      ...draft.localizedContent,
      [locale]: createDefaultFrontendWebsiteLocaleContent(appName),
    },
  };
}

function isUntouchedFooterLinkDraft(link: LandingFooterLink): boolean {
  const labelEmpty = link.label.trim() === '';
  const href = link.href.trim();
  const hrefEmptyOrPlaceholder = href === '' || href === '#';
  return labelEmpty && hrefEmptyOrPlaceholder;
}

function stripUntouchedFooterLinkDrafts(draft: FrontendWebsiteSettings): FrontendWebsiteSettings {
  const localizedContent = { ...draft.localizedContent };

  for (const [locale, content] of Object.entries(localizedContent)) {
    const homepage = content.homepage;
    localizedContent[locale] = {
      ...content,
      homepage: {
        ...homepage,
        footerLinks: {
          product: homepage.footerLinks.product.filter((link) => !isUntouchedFooterLinkDraft(link)),
          company: homepage.footerLinks.company.filter((link) => !isUntouchedFooterLinkDraft(link)),
          support: homepage.footerLinks.support.filter((link) => !isUntouchedFooterLinkDraft(link)),
        },
      },
    };
  }

  return { ...draft, localizedContent };
}

export function buildSavePayload(draft: FrontendWebsiteSettings): FrontendWebsiteSettingsPayload {
  const normalizedDraft = stripUntouchedFooterLinkDrafts(draft);
  const { updatedAt: _updatedAt, ...payload } = normalizedDraft;
  return {
    ...payload,
    pages: normalizeManagedPagesForSave(payload.pages),
  };
}

export type ValidationFieldErrors = Record<string, string[]>;

export function validateWebsiteDraft(
  draft: FrontendWebsiteSettings,
  mediaLibrary: FrontendWebsiteMediaLibrary,
  activeLocaleCodes: string[],
  defaultLocale = 'en',
  validSubscriptionPlanIds: number[] = []
): ValidationFieldErrors {
  const errors: ValidationFieldErrors = {};
  const payload = buildSavePayload(draft);

  const schemaResult = frontendWebsiteSettingsPayloadSchema.safeParse(payload);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const path = issue.path.join('.') || 'settings';
      errors[path] = [...(errors[path] ?? []), issue.message];
    }
  }

  const localeValidation = validateFrontendWebsiteLocaleKeys(payload, activeLocaleCodes);
  if (!localeValidation.valid) {
    errors['localizedContent'] = [
      ...(errors['localizedContent'] ?? []),
      `Unknown or inactive locale keys: ${localeValidation.invalidLocales.join(', ')}`,
    ];
  }

  const assetValidation = validateFrontendWebsiteAssetReferences(payload, mediaLibrary);
  if (!assetValidation.valid) {
    errors['mediaLibrary'] = [
      ...(errors['mediaLibrary'] ?? []),
      `Missing media assets: ${assetValidation.missingAssetIds.join(', ')}`,
    ];
  }

  const pageValidation = validateFrontendWebsiteLegalPageReferences(payload);
  if (!pageValidation.valid) {
    errors['footer.legalPageIds'] = [
      ...(errors['footer.legalPageIds'] ?? []),
      `Legal page IDs not found in managed pages: ${pageValidation.missingPageIds.join(', ')}`,
    ];
  }

  const managedPageValidation = validateFrontendWebsiteManagedPages(payload, defaultLocale);
  if (!managedPageValidation.valid) {
    if (managedPageValidation.duplicatePageIds.length > 0) {
      errors['pages'] = [
        ...(errors['pages'] ?? []),
        `Duplicate page IDs: ${managedPageValidation.duplicatePageIds.join(', ')}`,
      ];
    }
    if (managedPageValidation.duplicateSlugs.length > 0) {
      errors['pages'] = [
        ...(errors['pages'] ?? []),
        `Duplicate slugs: ${managedPageValidation.duplicateSlugs.join(', ')}`,
      ];
    }
    if (managedPageValidation.reservedSlugs.length > 0) {
      errors['pages'] = [
        ...(errors['pages'] ?? []),
        `Reserved slugs: ${managedPageValidation.reservedSlugs.join(', ')}`,
      ];
    }
    for (const entry of managedPageValidation.invalidSlugs) {
      errors[`pages.${entry.pageId}.slug`] = [
        ...(errors[`pages.${entry.pageId}.slug`] ?? []),
        entry.message,
      ];
    }
    if (managedPageValidation.missingDefaultLocaleContent.length > 0) {
      errors['pages'] = [
        ...(errors['pages'] ?? []),
        `Published pages missing default-locale content: ${managedPageValidation.missingDefaultLocaleContent.join(', ')}`,
      ];
    }
  }

  if (validSubscriptionPlanIds.length > 0) {
    const pricingValidation = validateFrontendWebsitePricingPlanReferences(
      payload,
      validSubscriptionPlanIds
    );
    if (!pricingValidation.valid) {
      for (const reference of pricingValidation.invalidReferences) {
        const path = `localizedContent.${reference.locale}.pricing.plans.${reference.planIndex}.subscriptionPlanId`;
        errors[path] = [
          ...(errors[path] ?? []),
          `Subscription plan ID ${reference.subscriptionPlanId} is not an active public plan`,
        ];
      }
    }
  }

  return errors;
}

export function getAssetUsageMap(
  settings: FrontendWebsiteSettings,
  mediaLibrary: FrontendWebsiteMediaLibrary
): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  const referenced = collectReferencedFrontendWebsiteAssetIds(settings, mediaLibrary);

  for (const assetId of referenced) {
    const labels: string[] = [];
    if (settings.header.logoAssetId === assetId) labels.push('Header logo');
    if (settings.header.faviconAssetId === assetId) labels.push('Favicon');
    for (const [locale, content] of Object.entries(settings.localizedContent)) {
      if (content.seo?.ogImageAssetId === assetId) labels.push(`SEO OG image (${locale})`);
      if (content.homepage.heroImageAssetId === assetId) labels.push(`Hero image (${locale})`);
    }
    for (const page of settings.pages) {
      for (const [locale, pageContent] of Object.entries(page.localizedContent)) {
        if (pageContent.seo?.ogImageAssetId === assetId) {
          labels.push(`Page OG image (${page.slug}, ${locale})`);
        }
        if (pageContent.seo?.faviconAssetId === assetId) {
          labels.push(`Page favicon (${page.slug}, ${locale})`);
        }
      }
    }
    usage.set(assetId, labels);
  }

  for (const asset of mediaLibrary.assets) {
    if (!usage.has(asset.id)) {
      usage.set(asset.id, []);
    }
  }

  return usage;
}

export function createEmptyNavLink(): FrontendWebsiteIdentifiableLink {
  return {
    id: crypto.randomUUID(),
    label: '',
    href: '/',
    openInNewTab: false,
  };
}

export function ensurePageLocaleContent(
  page: FrontendWebsiteManagedPage,
  locale: string
): FrontendWebsiteManagedPage {
  if (page.localizedContent[locale]) {
    return page;
  }
  return {
    ...page,
    localizedContent: {
      ...page.localizedContent,
      [locale]: {
        title: '',
        content: '',
        seo: {},
      },
    },
  };
}

export {
  createEmptyManagedPage,
  createManagedPageFromTemplate,
  slugifyFrontendWebsitePageTitle,
  normalizeFrontendWebsiteManagedPageSlug,
};

export function createEmptyPageReference(): FrontendWebsitePageReference {
  return {
    id: crypto.randomUUID(),
    slug: '',
    title: '',
    type: 'custom',
    enabled: true,
  };
}

export function createDefaultSeo(): FrontendWebsiteSeo {
  return {
    title: '',
    description: '',
    keywords: '',
    ogTitle: '',
    ogDescription: '',
    ogImageAssetId: undefined,
    twitterCard: 'summary_large_image',
  };
}

export function createEmptyFaqItem(): FrontendWebsiteFaqItem {
  return {
    id: crypto.randomUUID(),
    question: '',
    answer: '',
  };
}

export function createDefaultFaqBlock(): FrontendWebsiteFaqBlock {
  return {
    title: '',
    subtitle: '',
    items: [createEmptyFaqItem()],
  };
}

export function createEmptyPricingPlan(): FrontendWebsitePricingPlan {
  return {
    id: crypto.randomUUID(),
    subscriptionPlanId: 0,
    description: '',
    features: [''],
    ctaText: '',
    ctaHref: '/register',
    highlighted: false,
  };
}

export function createDefaultPricingBlock(): FrontendWebsitePricingBlock {
  return {
    title: '',
    subtitle: '',
    plans: [createEmptyPricingPlan()],
  };
}

export function normalizeWebsiteResponse(
  data: unknown,
  appName: string,
  defaultLocale: string
): { settings: FrontendWebsiteSettings; mediaLibrary: FrontendWebsiteMediaLibrary } {
  const source = data as { settings?: unknown; mediaLibrary?: unknown };
  const mediaLibrary = normalizeFrontendWebsiteMediaLibrary(source.mediaLibrary);
  const settings = normalizeFrontendWebsiteSettings(source.settings, {
    appName,
    defaultLocale,
    mediaLibrary,
  });

  return { settings, mediaLibrary };
}

export function getDefaultWebsiteDraft(appName: string, defaultLocale: string): FrontendWebsiteSettings {
  return createDefaultFrontendWebsiteSettings(appName, defaultLocale);
}
