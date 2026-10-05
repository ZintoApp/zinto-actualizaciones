import { z } from 'zod';
import {
  createDefaultCustomCssSettings,
  createDefaultCustomJsSettings,
  coerceCustomJsSettings,
  type CustomCssSettings,
  type CustomJsSettings,
} from './customization-settings';
import {
  landingPageContentSchema,
  landingSocialLinksSchema,
  normalizeLandingPageContent,
  urlOrPathSchema,
  type LandingPageContent,
  type LandingSocialLinks,
} from './landing-page-content';

export const FRONTEND_WEBSITE_SETTINGS_KEY = 'frontend_website_settings';
export const FRONTEND_WEBSITE_MEDIA_LIBRARY_KEY = 'frontend_website_media_library';

export { urlOrPathSchema } from './landing-page-content';

export const frontendWebsiteAssetTypeSchema = z.enum([
  'image',
  'video',
  'audio',
  'document',
  'font',
  'icon',
]);

export const frontendWebsiteIdentifiableLinkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: urlOrPathSchema,
  openInNewTab: z.boolean().optional(),
});

export const frontendWebsiteHeaderSchema = z.object({
  logoAssetId: z.string().optional(),
  faviconAssetId: z.string().optional(),
  siteNameOverride: z.string().optional(),
  showThemeToggle: z.boolean(),
  showLanguageSwitcher: z.boolean(),
  navLinks: z.array(frontendWebsiteIdentifiableLinkSchema),
  ctaButton: z
    .object({
      label: z.string().min(1),
      href: urlOrPathSchema,
      openInNewTab: z.boolean().optional(),
    })
    .optional(),
});

export const frontendWebsiteSectionVisibilitySchema = z.object({
  hero: z.boolean(),
  features: z.boolean(),
  socialProof: z.boolean(),
  pricing: z.boolean(),
  testimonials: z.boolean(),
  faq: z.boolean(),
  cta: z.boolean(),
});

export const frontendWebsiteSeoSchema = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(320).optional(),
  keywords: z.string().max(500).optional(),
  ogTitle: z.string().max(70).optional(),
  ogDescription: z.string().max(320).optional(),
  ogImageAssetId: z.string().optional(),
  twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
});

export const frontendWebsiteFaqItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const frontendWebsiteFaqBlockSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  items: z.array(frontendWebsiteFaqItemSchema),
});

export const frontendWebsitePricingPlanSchema = z.object({
  id: z.string().min(1),
  /** Stable link to `/api/plans/public` subscription plan — used for card matching on the landing page. */
  subscriptionPlanId: z.number().int().positive(),
  /** Optional display name override; falls back to the subscription plan name when omitted. */
  name: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()),
  ctaText: z.string().min(1),
  ctaHref: urlOrPathSchema,
  highlighted: z.boolean().optional(),
});

export const frontendWebsitePricingBlockSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  plans: z.array(frontendWebsitePricingPlanSchema),
});

export const frontendWebsiteLocaleContentSchema = z.object({
  homepage: landingPageContentSchema,
  seo: frontendWebsiteSeoSchema.optional(),
  faq: frontendWebsiteFaqBlockSchema.optional(),
  pricing: frontendWebsitePricingBlockSchema.optional(),
});

export const frontendWebsiteFooterSchema = z.object({
  showSocialLinks: z.boolean(),
  socialLinks: landingSocialLinksSchema,
  legalPageIds: z.array(z.string()),
  customLinks: z.array(frontendWebsiteIdentifiableLinkSchema),
});

export const frontendWebsitePageReferenceSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['legal', 'custom']),
  href: urlOrPathSchema.optional(),
  enabled: z.boolean().optional(),
});

export const frontendWebsitePageTypeSchema = z.enum(['legal', 'custom']);

export const frontendWebsitePageSeoSchema = z.object({
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(320).optional(),
  metaKeywords: z.string().max(500).optional(),
  ogTitle: z.string().max(70).optional(),
  ogDescription: z.string().max(320).optional(),
  ogImageAssetId: z.string().optional(),
  faviconAssetId: z.string().optional(),
  twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
});

export const frontendWebsitePageLocaleContentSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  seo: frontendWebsitePageSeoSchema.optional(),
});

export const frontendWebsiteManagedPageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  type: frontendWebsitePageTypeSchema,
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  showInNav: z.boolean().optional(),
  localizedContent: z.record(z.string(), frontendWebsitePageLocaleContentSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/** Root slugs reserved by the application router — managed pages cannot use these. */
export const FRONTEND_WEBSITE_RESERVED_SLUGS = [
  'auth',
  'login',
  'register',
  'dashboard',
  'admin',
  'settings',
  'profile',
  'logout',
  'inbox',
  'flows',
  'contacts',
  'calendar',
  'analytics',
  'campaigns',
  'pipeline',
  'pages',
  'users',
  'billing',
  'integrations',
  'reports',
  'templates',
  'webhooks',
  'payment',
  'forgot-password',
  'reset-password',
  'signup',
  'affiliate-apply',
  'become-partner',
  'accept-invitation',
  'landing',
  'access-denied',
  'tasks',
  'my-calendar',
  'call-logs',
  'captured-data',
  'erp',
  'restaurant',
  'email',
] as const;

export const frontendWebsiteCustomCssSchema = z.object({
  enabled: z.boolean(),
  css: z.string(),
  lastModified: z.string(),
});

export const frontendWebsiteCustomJsSchema = z.object({
  enabled: z.boolean(),
  js: z.string(),
  lastModified: z.string(),
});

export const frontendWebsiteSettingsSchema = z.object({
  header: frontendWebsiteHeaderSchema,
  sectionVisibility: frontendWebsiteSectionVisibilitySchema,
  localizedContent: z.record(z.string(), frontendWebsiteLocaleContentSchema),
  footer: frontendWebsiteFooterSchema,
  pages: z.array(frontendWebsiteManagedPageSchema),
  pageReferences: z.array(frontendWebsitePageReferenceSchema),
  customCss: frontendWebsiteCustomCssSchema,
  customJs: frontendWebsiteCustomJsSchema,
  updatedAt: z.string().optional(),
});

export const frontendWebsiteSettingsPayloadSchema = frontendWebsiteSettingsSchema.omit({
  updatedAt: true,
});

export const frontendWebsiteMediaAssetSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  path: z.string().min(1),
  url: z.string().min(1),
  alt: z.string().optional(),
  title: z.string().optional(),
  assetType: frontendWebsiteAssetTypeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const frontendWebsiteMediaLibrarySchema = z.object({
  assets: z.array(frontendWebsiteMediaAssetSchema),
  updatedAt: z.string().optional(),
});

export type FrontendWebsiteIdentifiableLink = z.infer<typeof frontendWebsiteIdentifiableLinkSchema>;
export type FrontendWebsiteHeader = z.infer<typeof frontendWebsiteHeaderSchema>;
export type FrontendWebsiteSectionVisibility = z.infer<typeof frontendWebsiteSectionVisibilitySchema>;
export type FrontendWebsiteSeo = z.infer<typeof frontendWebsiteSeoSchema>;
export type FrontendWebsiteFaqItem = z.infer<typeof frontendWebsiteFaqItemSchema>;
export type FrontendWebsiteFaqBlock = z.infer<typeof frontendWebsiteFaqBlockSchema>;
export type FrontendWebsitePricingPlan = z.infer<typeof frontendWebsitePricingPlanSchema>;
export type FrontendWebsitePricingBlock = z.infer<typeof frontendWebsitePricingBlockSchema>;
export type FrontendWebsiteLocaleContent = z.infer<typeof frontendWebsiteLocaleContentSchema>;
export type FrontendWebsiteFooter = z.infer<typeof frontendWebsiteFooterSchema>;
export type FrontendWebsitePageReference = z.infer<typeof frontendWebsitePageReferenceSchema>;
export type FrontendWebsitePageType = z.infer<typeof frontendWebsitePageTypeSchema>;
export type FrontendWebsitePageSeo = z.infer<typeof frontendWebsitePageSeoSchema>;
export type FrontendWebsitePageLocaleContent = z.infer<typeof frontendWebsitePageLocaleContentSchema>;
export type FrontendWebsiteManagedPage = z.infer<typeof frontendWebsiteManagedPageSchema>;
export type FrontendWebsiteSettings = z.infer<typeof frontendWebsiteSettingsSchema>;
export type FrontendWebsiteSettingsPayload = z.infer<typeof frontendWebsiteSettingsPayloadSchema>;
export type FrontendWebsiteMediaAsset = z.infer<typeof frontendWebsiteMediaAssetSchema>;
export type FrontendWebsiteMediaLibrary = z.infer<typeof frontendWebsiteMediaLibrarySchema>;
export type FrontendWebsiteAssetType = z.infer<typeof frontendWebsiteAssetTypeSchema>;
export type PublicFrontendWebsiteMediaAsset = Omit<FrontendWebsiteMediaAsset, 'path'>;

export type PublicFrontendWebsiteHeader = {
  logoUrl?: string;
  faviconUrl?: string;
  siteName: string;
  showThemeToggle: boolean;
  showLanguageSwitcher: boolean;
  navLinks: FrontendWebsiteIdentifiableLink[];
  ctaButton?: {
    label: string;
    href: string;
    openInNewTab?: boolean;
  };
};

export type PublicFrontendWebsiteHomepage = Omit<
  LandingPageContent,
  'heroImageAssetId' | 'socialLinks'
> & {
  heroImageUrl?: string;
};

export type PublicFrontendWebsiteSeo = FrontendWebsiteSeo & {
  ogImageUrl?: string;
};

export type PublicFrontendWebsiteSettings = {
  locale: string;
  header: PublicFrontendWebsiteHeader;
  sectionVisibility: FrontendWebsiteSectionVisibility;
  content: {
    homepage: PublicFrontendWebsiteHomepage;
    seo?: PublicFrontendWebsiteSeo;
    faq?: FrontendWebsiteFaqBlock;
    pricing?: FrontendWebsitePricingBlock;
  };
  footer: FrontendWebsiteFooter;
  pageReferences: FrontendWebsitePageReference[];
  customCss: CustomCssSettings;
  customJs: CustomJsSettings;
};

export type PublicFrontendWebsiteResponse = {
  published: boolean;
  locale: string;
  requestedLocale: string | null;
  defaultLocale: string;
  availableLocales: string[];
  languages: Array<{ code: string; name: string; isDefault: boolean }>;
  config: PublicFrontendWebsiteSettings;
  media: PublicFrontendWebsiteMediaAsset[];
};

export type PublicFrontendWebsitePageSeo = FrontendWebsitePageSeo & {
  ogImageUrl?: string;
  faviconUrl?: string;
};

export type PublicFrontendWebsiteManagedPage = {
  id: string;
  slug: string;
  type: FrontendWebsitePageType;
  locale: string;
  title: string;
  content: string;
  seo?: PublicFrontendWebsitePageSeo;
};

export type PublicFrontendWebsitePageSite = {
  header: PublicFrontendWebsiteHeader;
  footer: FrontendWebsiteFooter;
  pageReferences: FrontendWebsitePageReference[];
  customCss: CustomCssSettings;
  customJs: CustomJsSettings;
  landingSeo?: PublicFrontendWebsiteSeo;
  homepage: PublicFrontendWebsiteHomepage;
};

export type PublicFrontendWebsitePageResponse = {
  published: boolean;
  locale: string;
  requestedLocale: string | null;
  defaultLocale: string;
  availableLocales: string[];
  languages: Array<{ code: string; name: string; isDefault: boolean }>;
  page: PublicFrontendWebsiteManagedPage;
  site: PublicFrontendWebsitePageSite;
  media: PublicFrontendWebsiteMediaAsset[];
};

export type LegacyLandingAppSettings = {
  heroTitle?: unknown;
  heroSubtitle?: unknown;
  featuresTitle?: unknown;
  featuresSubtitle?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function coerceIdentifiableLinks(
  value: unknown,
  fallback: FrontendWebsiteIdentifiableLink[]
): FrontendWebsiteIdentifiableLink[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => frontendWebsiteIdentifiableLinkSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function coercePageReferences(
  value: unknown,
  fallback: FrontendWebsitePageReference[]
): FrontendWebsitePageReference[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => frontendWebsitePageReferenceSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function coerceManagedPages(
  value: unknown,
  fallback: FrontendWebsiteManagedPage[]
): FrontendWebsiteManagedPage[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => frontendWebsiteManagedPageSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

/** Single-segment, lowercase, URL-safe slug pattern for managed public pages. */
export const FRONTEND_WEBSITE_MANAGED_PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyFrontendWebsitePageTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export function normalizeFrontendWebsiteManagedPageSlug(input: string): string {
  return slugifyFrontendWebsitePageTitle(input.replace(/\//g, '-'));
}

export function isValidFrontendWebsiteManagedPageSlug(slug: string): boolean {
  const trimmed = slug.trim();
  if (!trimmed || trimmed.includes('/')) {
    return false;
  }
  return FRONTEND_WEBSITE_MANAGED_PAGE_SLUG_PATTERN.test(trimmed.toLowerCase());
}

export function describeInvalidFrontendWebsiteManagedPageSlug(slug: string): string {
  if (!slug.trim()) {
    return 'Slug is required';
  }
  if (slug.includes('/')) {
    return 'Slug must be a single path segment (no "/" characters)';
  }
  if (!FRONTEND_WEBSITE_MANAGED_PAGE_SLUG_PATTERN.test(slug.toLowerCase())) {
    return 'Slug must be lowercase and contain only letters, numbers, and hyphens';
  }
  return 'Invalid slug';
}

export function normalizeManagedPagesForSave(
  pages: FrontendWebsiteManagedPage[]
): FrontendWebsiteManagedPage[] {
  return pages.map((page) => {
    const defaultTitle =
      page.localizedContent[Object.keys(page.localizedContent)[0]]?.title ?? '';
    const rawSlug = page.slug.trim() || defaultTitle;
    const slug = normalizeFrontendWebsiteManagedPageSlug(rawSlug);
    return slug === page.slug ? page : { ...page, slug };
  });
}

export function derivePageReferencesFromManagedPages(
  pages: FrontendWebsiteManagedPage[],
  locale: string
): FrontendWebsitePageReference[] {
  return pages.map((page) => {
    const localeContent =
      page.localizedContent[locale] ?? Object.values(page.localizedContent)[0];
    const title = localeContent?.title ?? page.slug;
    return {
      id: page.id,
      slug: page.slug,
      title,
      type: page.type,
      href: `/${page.slug}`,
      enabled: page.enabled !== false,
    };
  });
}

export function extractFrontendWebsiteMediaUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const pattern = /\/uploads\/frontend-website\/[^"'\s)]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    urls.push(match[0].split('?')[0]);
  }
  return urls;
}

export function findFrontendWebsiteAssetIdsByUrls(
  urls: string[],
  mediaLibrary: FrontendWebsiteMediaLibrary
): string[] {
  const normalizedUrls = new Set(urls.map((url) => url.split('?')[0]));
  return mediaLibrary.assets
    .filter((asset) => normalizedUrls.has(asset.url.split('?')[0]))
    .map((asset) => asset.id);
}

function coerceSocialLinkField(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const parsed = landingSocialLinksSchema.shape.twitter.safeParse(value.trim());
  return parsed.success ? parsed.data : '';
}

function coerceSocialLinks(value: unknown, fallback: LandingSocialLinks): LandingSocialLinks {
  if (!isRecord(value)) {
    return fallback;
  }

  if (!('twitter' in value || 'linkedin' in value || 'facebook' in value)) {
    return fallback;
  }

  return {
    twitter: coerceSocialLinkField(value.twitter),
    linkedin: coerceSocialLinkField(value.linkedin),
    facebook: coerceSocialLinkField(value.facebook),
  };
}

function coerceCustomCss(value: unknown, lastModified?: string): CustomCssSettings {
  if (!isRecord(value)) {
    return createDefaultCustomCssSettings(lastModified);
  }

  return {
    enabled: coerceBoolean(value.enabled, false),
    css: typeof value.css === 'string' ? value.css : '',
    lastModified:
      typeof value.lastModified === 'string' ? value.lastModified : lastModified ?? new Date().toISOString(),
  };
}

function coerceFrontendWebsitePricingBlock(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.plans)) {
    return value;
  }

  return {
    ...value,
    plans: value.plans.map((plan) => {
      if (!isRecord(plan)) {
        return plan;
      }

      const subscriptionPlanId =
        typeof plan.subscriptionPlanId === 'number' && plan.subscriptionPlanId > 0
          ? plan.subscriptionPlanId
          : typeof plan.id === 'number' && plan.id > 0
            ? plan.id
            : undefined;

      if (!subscriptionPlanId) {
        return plan;
      }

      const { price: _price, period: _period, ...rest } = plan;
      return {
        ...rest,
        subscriptionPlanId,
        name: typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim() : undefined,
      };
    }),
  };
}

function coerceLocaleContent(
  value: unknown,
  appName: string,
  mediaLibrary?: FrontendWebsiteMediaLibrary
): FrontendWebsiteLocaleContent | null {
  if (!isRecord(value)) {
    return null;
  }

  const homepage = normalizeLandingPageContent(value.homepage, { appName, mediaLibrary });
  const localeContent: FrontendWebsiteLocaleContent = { homepage };

  if (value.seo !== undefined) {
    const seo = frontendWebsiteSeoSchema.safeParse(value.seo);
    if (seo.success) {
      localeContent.seo = seo.data;
    }
  }

  if (value.faq !== undefined) {
    const faq = frontendWebsiteFaqBlockSchema.safeParse(value.faq);
    if (faq.success) {
      localeContent.faq = faq.data;
    }
  }

  if (value.pricing !== undefined) {
    const pricing = frontendWebsitePricingBlockSchema.safeParse(
      coerceFrontendWebsitePricingBlock(value.pricing)
    );
    if (pricing.success) {
      localeContent.pricing = pricing.data;
    }
  }

  return localeContent;
}

export function createDefaultFrontendWebsiteHeader(): FrontendWebsiteHeader {
  return {
    logoAssetId: undefined,
    faviconAssetId: undefined,
    siteNameOverride: undefined,
    showThemeToggle: true,
    showLanguageSwitcher: true,
    navLinks: [],
    ctaButton: undefined,
  };
}

export function createDefaultFrontendWebsiteSectionVisibility(): FrontendWebsiteSectionVisibility {
  return {
    hero: true,
    features: true,
    socialProof: true,
    pricing: true,
    testimonials: true,
    faq: false,
    cta: true,
  };
}

export function createDefaultFrontendWebsiteFooter(): FrontendWebsiteFooter {
  return {
    showSocialLinks: true,
    socialLinks: {
      twitter: '',
      linkedin: '',
      facebook: '',
    },
    legalPageIds: [],
    customLinks: [],
  };
}

export function createDefaultFrontendWebsiteLocaleContent(
  appName = 'BotHive'
): FrontendWebsiteLocaleContent {
  return {
    homepage: normalizeLandingPageContent(undefined, { appName }),
  };
}

export function createDefaultFrontendWebsiteSettings(
  appName = 'BotHive',
  defaultLocale = 'en'
): FrontendWebsiteSettings {
  const now = new Date().toISOString();

  return {
    header: createDefaultFrontendWebsiteHeader(),
    sectionVisibility: createDefaultFrontendWebsiteSectionVisibility(),
    localizedContent: {
      [defaultLocale]: createDefaultFrontendWebsiteLocaleContent(appName),
    },
    footer: createDefaultFrontendWebsiteFooter(),
    pages: [],
    pageReferences: [],
    customCss: createDefaultCustomCssSettings(now),
    customJs: createDefaultCustomJsSettings(now),
    updatedAt: now,
  };
}

export function createDefaultFrontendWebsiteMediaLibrary(): FrontendWebsiteMediaLibrary {
  return {
    assets: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeFrontendWebsiteSettings(
  value: unknown,
  options: {
    appName?: string;
    defaultLocale?: string;
    updatedAt?: string;
    mediaLibrary?: FrontendWebsiteMediaLibrary;
  } = {}
): FrontendWebsiteSettings {
  const appName = options.appName ?? 'BotHive';
  const defaultLocale = options.defaultLocale ?? 'en';
  const defaults = createDefaultFrontendWebsiteSettings(appName, defaultLocale);
  const source = isRecord(value) ? value : {};

  const headerSource = isRecord(source.header) ? source.header : {};
  const header: FrontendWebsiteHeader = {
    logoAssetId:
      typeof headerSource.logoAssetId === 'string' ? headerSource.logoAssetId : defaults.header.logoAssetId,
    faviconAssetId:
      typeof headerSource.faviconAssetId === 'string'
        ? headerSource.faviconAssetId
        : defaults.header.faviconAssetId,
    siteNameOverride:
      typeof headerSource.siteNameOverride === 'string'
        ? headerSource.siteNameOverride
        : defaults.header.siteNameOverride,
    showThemeToggle: coerceBoolean(headerSource.showThemeToggle, defaults.header.showThemeToggle),
    showLanguageSwitcher: coerceBoolean(
      headerSource.showLanguageSwitcher,
      defaults.header.showLanguageSwitcher
    ),
    navLinks: coerceIdentifiableLinks(headerSource.navLinks, defaults.header.navLinks),
    ctaButton: frontendWebsiteHeaderSchema.shape.ctaButton.safeParse(headerSource.ctaButton).success
      ? frontendWebsiteHeaderSchema.shape.ctaButton.parse(headerSource.ctaButton)
      : defaults.header.ctaButton,
  };

  const visibilitySource = isRecord(source.sectionVisibility) ? source.sectionVisibility : {};
  const sectionVisibility: FrontendWebsiteSectionVisibility = {
    hero: coerceBoolean(visibilitySource.hero, defaults.sectionVisibility.hero),
    features: coerceBoolean(visibilitySource.features, defaults.sectionVisibility.features),
    socialProof: coerceBoolean(visibilitySource.socialProof, defaults.sectionVisibility.socialProof),
    pricing: coerceBoolean(visibilitySource.pricing, defaults.sectionVisibility.pricing),
    testimonials: coerceBoolean(visibilitySource.testimonials, defaults.sectionVisibility.testimonials),
    faq: coerceBoolean(visibilitySource.faq, defaults.sectionVisibility.faq),
    cta: coerceBoolean(visibilitySource.cta, defaults.sectionVisibility.cta),
  };

  const localizedContent: Record<string, FrontendWebsiteLocaleContent> = { ...defaults.localizedContent };
  if (isRecord(source.localizedContent)) {
    for (const [locale, content] of Object.entries(source.localizedContent)) {
      const normalizedLocale = coerceLocaleContent(content, appName, options.mediaLibrary);
      if (normalizedLocale) {
        localizedContent[locale] = normalizedLocale;
      }
    }
  }

  const footerSource = isRecord(source.footer) ? source.footer : {};
  const footer: FrontendWebsiteFooter = {
    showSocialLinks: coerceBoolean(footerSource.showSocialLinks, defaults.footer.showSocialLinks),
    socialLinks: coerceSocialLinks(footerSource.socialLinks, defaults.footer.socialLinks),
    legalPageIds: Array.isArray(footerSource.legalPageIds)
      ? footerSource.legalPageIds.filter((id): id is string => typeof id === 'string')
      : defaults.footer.legalPageIds,
    customLinks: coerceIdentifiableLinks(footerSource.customLinks, defaults.footer.customLinks),
  };

  for (const locale of Object.keys(localizedContent)) {
    localizedContent[locale] = {
      ...localizedContent[locale],
      homepage: {
        ...localizedContent[locale].homepage,
        socialLinks: { ...footer.socialLinks },
      },
    };
  }

  const updatedAt =
    typeof source.updatedAt === 'string'
      ? source.updatedAt
      : options.updatedAt ?? defaults.updatedAt;

  const pages = coerceManagedPages(source.pages, defaults.pages);
  const pageReferences =
    pages.length > 0
      ? derivePageReferencesFromManagedPages(pages, defaultLocale)
      : coercePageReferences(source.pageReferences, defaults.pageReferences);

  return {
    header,
    sectionVisibility,
    localizedContent,
    footer,
    pages,
    pageReferences,
    customCss: coerceCustomCss(source.customCss, updatedAt),
    customJs: coerceCustomJsSettings(source.customJs, updatedAt),
    updatedAt,
  };
}

export function normalizeFrontendWebsiteMediaLibrary(
  value: unknown,
  options: { updatedAt?: string } = {}
): FrontendWebsiteMediaLibrary {
  const defaults = createDefaultFrontendWebsiteMediaLibrary();
  const source = isRecord(value) ? value : {};

  const assets = Array.isArray(source.assets)
    ? source.assets
        .map((item) => frontendWebsiteMediaAssetSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : defaults.assets;

  return {
    assets,
    updatedAt:
      typeof source.updatedAt === 'string'
        ? source.updatedAt
        : options.updatedAt ?? defaults.updatedAt,
  };
}

export function buildFrontendWebsiteSettingsFromLegacyKeys(
  legacy: LegacyLandingAppSettings,
  options: { appName?: string; defaultLocale?: string } = {}
): FrontendWebsiteSettings {
  const appName = options.appName ?? 'BotHive';
  const defaultLocale = options.defaultLocale ?? 'en';
  const settings = createDefaultFrontendWebsiteSettings(appName, defaultLocale);
  const homepage = settings.localizedContent[defaultLocale].homepage;

  const overrides: Partial<LandingPageContent> = {};
  if (typeof legacy.heroTitle === 'string' && legacy.heroTitle.trim()) {
    overrides.heroTitle = legacy.heroTitle.trim();
  }
  if (typeof legacy.heroSubtitle === 'string' && legacy.heroSubtitle.trim()) {
    overrides.heroSubtitle = legacy.heroSubtitle.trim();
  }
  if (typeof legacy.featuresTitle === 'string' && legacy.featuresTitle.trim()) {
    overrides.featuresSectionTitle = legacy.featuresTitle.trim();
  }
  if (typeof legacy.featuresSubtitle === 'string' && legacy.featuresSubtitle.trim()) {
    overrides.featuresSectionSubtitle = legacy.featuresSubtitle.trim();
  }

  settings.localizedContent[defaultLocale] = {
    homepage: normalizeLandingPageContent(homepage, { appName, overrides }),
  };

  return settings;
}

export function collectReferencedFrontendWebsiteAssetIds(
  settings: FrontendWebsiteSettings,
  mediaLibrary?: FrontendWebsiteMediaLibrary
): Set<string> {
  const referenced = new Set<string>();

  if (settings.header.logoAssetId) {
    referenced.add(settings.header.logoAssetId);
  }
  if (settings.header.faviconAssetId) {
    referenced.add(settings.header.faviconAssetId);
  }

  for (const localeContent of Object.values(settings.localizedContent)) {
    if (localeContent.seo?.ogImageAssetId) {
      referenced.add(localeContent.seo.ogImageAssetId);
    }
    if (localeContent.homepage.heroImageAssetId) {
      referenced.add(localeContent.homepage.heroImageAssetId);
    }
  }

  for (const page of settings.pages) {
    for (const localeContent of Object.values(page.localizedContent)) {
      if (localeContent.seo?.ogImageAssetId) {
        referenced.add(localeContent.seo.ogImageAssetId);
      }
      if (localeContent.seo?.faviconAssetId) {
        referenced.add(localeContent.seo.faviconAssetId);
      }
      if (mediaLibrary && localeContent.content) {
        const embeddedUrls = extractFrontendWebsiteMediaUrlsFromHtml(localeContent.content);
        const embeddedIds = findFrontendWebsiteAssetIdsByUrls(embeddedUrls, mediaLibrary);
        for (const assetId of embeddedIds) {
          referenced.add(assetId);
        }
      }
    }
  }

  return referenced;
}

export function validateFrontendWebsiteAssetReferences(
  settings: FrontendWebsiteSettingsPayload,
  mediaLibrary: FrontendWebsiteMediaLibrary
): { valid: boolean; missingAssetIds: string[] } {
  const availableAssetIds = new Set(mediaLibrary.assets.map((asset) => asset.id));
  const referencedAssetIds = collectReferencedFrontendWebsiteAssetIds(
    {
      ...settings,
      updatedAt: new Date().toISOString(),
    },
    mediaLibrary
  );
  const missingAssetIds = [...referencedAssetIds].filter((assetId) => !availableAssetIds.has(assetId));

  return {
    valid: missingAssetIds.length === 0,
    missingAssetIds,
  };
}

export function validateFrontendWebsiteManagedPages(
  settings: FrontendWebsiteSettingsPayload,
  defaultLocale: string
): {
  valid: boolean;
  duplicatePageIds: string[];
  duplicateSlugs: string[];
  reservedSlugs: string[];
  invalidSlugs: Array<{ pageId: string; slug: string; message: string }>;
  missingDefaultLocaleContent: string[];
} {
  const pageIds = new Set<string>();
  const slugs = new Set<string>();
  const duplicatePageIds: string[] = [];
  const duplicateSlugs: string[] = [];
  const reservedSlugs: string[] = [];
  const invalidSlugs: Array<{ pageId: string; slug: string; message: string }> = [];
  const missingDefaultLocaleContent: string[] = [];
  const reserved = new Set(FRONTEND_WEBSITE_RESERVED_SLUGS.map((slug) => slug.toLowerCase()));
  const normalizedDefaultLocale = defaultLocale.toLowerCase();

  for (const page of settings.pages) {
    if (pageIds.has(page.id)) {
      duplicatePageIds.push(page.id);
    } else {
      pageIds.add(page.id);
    }

    const normalizedSlug = page.slug.trim().toLowerCase();

    if (page.enabled !== false && !isValidFrontendWebsiteManagedPageSlug(page.slug)) {
      invalidSlugs.push({
        pageId: page.id,
        slug: page.slug,
        message: describeInvalidFrontendWebsiteManagedPageSlug(page.slug),
      });
    }

    if (normalizedSlug && slugs.has(normalizedSlug)) {
      duplicateSlugs.push(page.slug);
    } else if (normalizedSlug) {
      slugs.add(normalizedSlug);
    }

    if (normalizedSlug && reserved.has(normalizedSlug)) {
      reservedSlugs.push(page.slug);
    }

    if (page.enabled !== false && !page.localizedContent[normalizedDefaultLocale]) {
      missingDefaultLocaleContent.push(page.id);
    }
  }

  return {
    valid:
      duplicatePageIds.length === 0 &&
      duplicateSlugs.length === 0 &&
      reservedSlugs.length === 0 &&
      invalidSlugs.length === 0 &&
      missingDefaultLocaleContent.length === 0,
    duplicatePageIds,
    duplicateSlugs,
    reservedSlugs,
    invalidSlugs,
    missingDefaultLocaleContent,
  };
}

export function validateFrontendWebsiteLegalPageReferences(
  settings: FrontendWebsiteSettingsPayload
): { valid: boolean; missingPageIds: string[] } {
  const pageIds = new Set(
    settings.pages.length > 0
      ? settings.pages.map((page) => page.id)
      : settings.pageReferences.map((page) => page.id)
  );
  const missingPageIds = settings.footer.legalPageIds.filter((pageId) => !pageIds.has(pageId));

  return {
    valid: missingPageIds.length === 0,
    missingPageIds,
  };
}

export function validateFrontendWebsitePricingPlanReferences(
  settings: FrontendWebsiteSettingsPayload,
  validSubscriptionPlanIds: number[]
): {
  valid: boolean;
  invalidReferences: Array<{
    locale: string;
    planIndex: number;
    planOverlayId: string;
    subscriptionPlanId: number;
  }>;
} {
  const validIds = new Set(validSubscriptionPlanIds);
  const invalidReferences: Array<{
    locale: string;
    planIndex: number;
    planOverlayId: string;
    subscriptionPlanId: number;
  }> = [];

  for (const [locale, content] of Object.entries(settings.localizedContent)) {
    const pricingPlans = content.pricing?.plans;
    if (!pricingPlans) {
      continue;
    }

    pricingPlans.forEach((plan, planIndex) => {
      if (!validIds.has(plan.subscriptionPlanId)) {
        invalidReferences.push({
          locale,
          planIndex,
          planOverlayId: plan.id,
          subscriptionPlanId: plan.subscriptionPlanId,
        });
      }
    });
  }

  return {
    valid: invalidReferences.length === 0,
    invalidReferences,
  };
}

export function findFrontendWebsitePageBySlug(
  settings: FrontendWebsiteSettings,
  slug: string
): FrontendWebsiteManagedPage | undefined {
  const normalizedSlug = slug.toLowerCase();
  return settings.pages.find(
    (page) => page.slug.toLowerCase() === normalizedSlug && page.enabled !== false
  );
}

function isPopulatedPageLocaleContent(
  content: FrontendWebsitePageLocaleContent | undefined
): content is FrontendWebsitePageLocaleContent {
  return Boolean(content?.title.trim()) && Boolean(content?.content.trim());
}

function getPopulatedPageLocaleContent(
  page: FrontendWebsiteManagedPage,
  locale: string
): FrontendWebsitePageLocaleContent | undefined {
  const normalizedLocale = locale.trim().toLowerCase();
  return isPopulatedPageLocaleContent(page.localizedContent[normalizedLocale])
    ? page.localizedContent[normalizedLocale]
    : undefined;
}

export function resolveFrontendWebsitePageLocaleContent(
  page: FrontendWebsiteManagedPage,
  requestedLang: string | undefined,
  defaultLanguageCode: string,
  availableLanguageCodes: string[]
): { locale: string; content: FrontendWebsitePageLocaleContent } {
  const normalizedRequest = requestedLang?.trim().toLowerCase();
  const defaultCode = defaultLanguageCode.trim().toLowerCase();

  if (normalizedRequest) {
    const requestedContent = getPopulatedPageLocaleContent(page, normalizedRequest);
    if (requestedContent) {
      return {
        locale: normalizedRequest,
        content: requestedContent,
      };
    }
  }

  const defaultContent = getPopulatedPageLocaleContent(page, defaultCode);
  if (defaultContent) {
    return {
      locale: defaultCode,
      content: defaultContent,
    };
  }

  const firstAvailable = availableLanguageCodes
    .map((code) => code.trim().toLowerCase())
    .find((code) => getPopulatedPageLocaleContent(page, code));
  if (firstAvailable) {
    return {
      locale: firstAvailable,
      content: page.localizedContent[firstAvailable],
    };
  }

  const firstPopulatedLocale = Object.keys(page.localizedContent).find((locale) =>
    isPopulatedPageLocaleContent(page.localizedContent[locale])
  );
  if (firstPopulatedLocale) {
    return {
      locale: firstPopulatedLocale,
      content: page.localizedContent[firstPopulatedLocale],
    };
  }

  return {
    locale: defaultCode || 'en',
    content: {
      title: page.slug,
      content: '',
    },
  };
}

export function resolveFrontendWebsiteLocaleContent(
  settings: FrontendWebsiteSettings,
  requestedLang: string | undefined,
  defaultLanguageCode: string,
  availableLanguageCodes: string[]
): { locale: string; content: FrontendWebsiteLocaleContent } {
  const available = new Set(availableLanguageCodes);
  const normalizedRequest = requestedLang?.trim().toLowerCase();

  if (normalizedRequest && settings.localizedContent[normalizedRequest]) {
    return {
      locale: normalizedRequest,
      content: settings.localizedContent[normalizedRequest],
    };
  }

  const defaultCode = defaultLanguageCode.trim().toLowerCase();
  if (settings.localizedContent[defaultCode]) {
    return {
      locale: defaultCode,
      content: settings.localizedContent[defaultCode],
    };
  }

  const firstAvailable = availableLanguageCodes.find((code) => settings.localizedContent[code]);
  if (firstAvailable) {
    return {
      locale: firstAvailable,
      content: settings.localizedContent[firstAvailable],
    };
  }

  const firstLocale = Object.keys(settings.localizedContent)[0];
  if (firstLocale) {
    return {
      locale: firstLocale,
      content: settings.localizedContent[firstLocale],
    };
  }

  const fallbackContent = createDefaultFrontendWebsiteLocaleContent();
  return {
    locale: defaultCode || 'en',
    content: fallbackContent,
  };
}

export function sanitizePublicFrontendWebsiteMediaAsset(
  asset: FrontendWebsiteMediaAsset
): PublicFrontendWebsiteMediaAsset {
  const { path: _path, ...publicAsset } = asset;
  return publicAsset;
}

export function buildPublicFrontendWebsiteSettings(
  settings: FrontendWebsiteSettings,
  options: {
    locale: string;
    content: FrontendWebsiteLocaleContent;
    branding: {
      appName: string;
      logoUrl?: string;
      faviconUrl?: string;
    };
    mediaLibrary: FrontendWebsiteMediaLibrary;
  }
): PublicFrontendWebsiteSettings {
  const resolveAssetUrl = (assetId?: string): string | undefined => {
    if (!assetId) {
      return undefined;
    }

    const asset = options.mediaLibrary.assets.find((item) => item.id === assetId);
    return asset?.url;
  };

  const logoUrl = resolveAssetUrl(settings.header.logoAssetId) ?? options.branding.logoUrl;
  const faviconUrl = resolveAssetUrl(settings.header.faviconAssetId) ?? options.branding.faviconUrl;
  const siteName = settings.header.siteNameOverride?.trim() || options.branding.appName;

  const ogImageUrl = options.content.seo?.ogImageAssetId
    ? resolveAssetUrl(options.content.seo.ogImageAssetId)
    : undefined;

  const heroImageUrl = options.content.homepage.heroImageAssetId
    ? resolveAssetUrl(options.content.homepage.heroImageAssetId)
    : undefined;

  const {
    heroImageAssetId: _heroImageAssetId,
    socialLinks: _socialLinks,
    ...homepageWithoutAssetId
  } = options.content.homepage;
  const validPageIds = new Set(
    settings.pages.length > 0
      ? settings.pages.filter((page) => page.enabled !== false).map((page) => page.id)
      : settings.pageReferences.map((page) => page.id)
  );

  const pageReferences =
    settings.pages.length > 0
      ? derivePageReferencesFromManagedPages(
          settings.pages.filter((page) => page.enabled !== false),
          options.locale
        )
      : settings.pageReferences.filter((page) => page.enabled !== false);

  return {
    locale: options.locale,
    header: {
      logoUrl,
      faviconUrl,
      siteName,
      showThemeToggle: settings.header.showThemeToggle,
      showLanguageSwitcher: settings.header.showLanguageSwitcher,
      navLinks: settings.header.navLinks,
      ctaButton: settings.header.ctaButton,
    },
    sectionVisibility: settings.sectionVisibility,
    content: {
      homepage: {
        ...homepageWithoutAssetId,
        heroImageUrl,
      },
      seo: options.content.seo
        ? {
            ...options.content.seo,
            ogImageUrl,
          }
        : undefined,
      faq: options.content.faq,
      pricing: options.content.pricing,
    },
    footer: {
      ...settings.footer,
      legalPageIds: settings.footer.legalPageIds.filter((pageId) => validPageIds.has(pageId)),
    },
    pageReferences,
    customCss: settings.customCss.enabled
      ? {
          enabled: true,
          css: settings.customCss.css,
          lastModified: settings.customCss.lastModified,
        }
      : {
          enabled: false,
          css: '',
          lastModified: settings.customCss.lastModified,
        },
    customJs: settings.customJs.enabled
      ? {
          enabled: true,
          js: settings.customJs.js,
          lastModified: settings.customJs.lastModified,
        }
      : {
          enabled: false,
          js: '',
          lastModified: settings.customJs.lastModified,
        },
  };
}

export function validateFrontendWebsiteLocaleKeys(
  settings: FrontendWebsiteSettingsPayload,
  allowedLocaleCodes: string[]
): { valid: boolean; invalidLocales: string[] } {
  const allowed = new Set(allowedLocaleCodes.map((code) => code.toLowerCase()));
  const invalidLocales = [
    ...Object.keys(settings.localizedContent).filter(
      (locale) => !allowed.has(locale.toLowerCase())
    ),
    ...settings.pages.flatMap((page) =>
      Object.keys(page.localizedContent).filter((locale) => !allowed.has(locale.toLowerCase()))
    ),
  ].filter((locale, index, arr) => arr.indexOf(locale) === index);

  return {
    valid: invalidLocales.length === 0,
    invalidLocales,
  };
}

export function buildPublicFrontendWebsitePage(
  page: FrontendWebsiteManagedPage,
  options: {
    locale: string;
    content: FrontendWebsitePageLocaleContent;
    mediaLibrary: FrontendWebsiteMediaLibrary;
  }
): PublicFrontendWebsiteManagedPage {
  const resolveAssetUrl = (assetId?: string): string | undefined => {
    if (!assetId) {
      return undefined;
    }
    const asset = options.mediaLibrary.assets.find((item) => item.id === assetId);
    return asset?.url;
  };

  const ogImageUrl = options.content.seo?.ogImageAssetId
    ? resolveAssetUrl(options.content.seo.ogImageAssetId)
    : undefined;
  const faviconUrl = options.content.seo?.faviconAssetId
    ? resolveAssetUrl(options.content.seo.faviconAssetId)
    : undefined;

  return {
    id: page.id,
    slug: page.slug,
    type: page.type,
    locale: options.locale,
    title: options.content.title,
    content: options.content.content,
    seo: options.content.seo
      ? {
          ...options.content.seo,
          ogImageUrl,
          faviconUrl,
        }
      : undefined,
  };
}

export type FrontendWebsitePageTemplateKey =
  | 'privacy-policy'
  | 'terms-of-service'
  | 'about'
  | 'contact';

export const FRONTEND_WEBSITE_PAGE_TEMPLATES: Record<
  FrontendWebsitePageTemplateKey,
  {
    slug: string;
    type: FrontendWebsitePageType;
    title: string;
    content: string;
    seo: FrontendWebsitePageSeo;
  }
> = {
  'privacy-policy': {
    slug: 'privacy-policy',
    type: 'legal',
    title: 'Privacy Policy',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">Privacy Policy</h1>
    <p>Effective Date: ${new Date().toLocaleDateString()}</p>
    <p>This Privacy Policy describes how we collect, use, and share information when you interact with our services.</p>
    <h2>1. Information We Collect</h2>
    <p>We may collect business information, account details, message content, and customer contact details when consent is given.</p>
    <h2>2. How We Use Your Information</h2>
    <p>We use collected information to provide, operate, and maintain our services and improve user experience.</p>
    <h2>3. Contact</h2>
    <p>If you have questions about this policy, contact us at <a href="mailto:support@example.com">support@example.com</a>.</p>
  </div>`,
    seo: {
      metaTitle: 'Privacy Policy',
      metaDescription: 'Learn how we collect, use, and protect your personal information.',
      metaKeywords: 'privacy policy, data protection, personal information',
      ogTitle: 'Privacy Policy',
      ogDescription: 'Learn how we collect, use, and protect your personal information.',
      twitterCard: 'summary_large_image',
    },
  },
  'terms-of-service': {
    slug: 'terms',
    type: 'legal',
    title: 'Terms of Service',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">Terms of Service</h1>
    <p>Effective Date: ${new Date().toLocaleDateString()}</p>
    <p>By using our services, you agree to these terms.</p>
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing and using our services, you accept and agree to be bound by these terms.</p>
    <h2>2. User Responsibilities</h2>
    <p>You agree to use the service only for legitimate business purposes and comply with applicable laws.</p>
    <h2>3. Contact</h2>
    <p>For questions about these terms, contact us at <a href="mailto:legal@example.com">legal@example.com</a>.</p>
  </div>`,
    seo: {
      metaTitle: 'Terms of Service',
      metaDescription: 'Read our terms of service including user responsibilities and service guidelines.',
      metaKeywords: 'terms of service, user agreement, service terms',
      ogTitle: 'Terms of Service',
      ogDescription: 'Read our terms of service including user responsibilities and service guidelines.',
      twitterCard: 'summary_large_image',
    },
  },
  about: {
    slug: 'about',
    type: 'custom',
    title: 'About Us',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">About Us</h1>
    <p>Welcome — we help businesses connect with their customers through seamless communication.</p>
    <h2>Our Mission</h2>
    <p>We empower businesses to build better customer relationships and improved business outcomes.</p>
    <h2>Contact</h2>
    <p>Email: <a href="mailto:info@example.com">info@example.com</a></p>
  </div>`,
    seo: {
      metaTitle: 'About Us',
      metaDescription: 'Learn about our company and how we help businesses succeed.',
      metaKeywords: 'about us, company, mission',
      ogTitle: 'About Us',
      ogDescription: 'Learn about our company and how we help businesses succeed.',
      twitterCard: 'summary_large_image',
    },
  },
  contact: {
    slug: 'contact',
    type: 'custom',
    title: 'Contact',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">Contact Us</h1>
    <p>We would love to hear from you. Reach out using the details below.</p>
    <h2>Email</h2>
    <p><a href="mailto:support@example.com">support@example.com</a></p>
    <h2>Phone</h2>
    <p>+1 (555) 123-4567</p>
    <h2>Address</h2>
    <p>123 Business Street, City, State 12345</p>
  </div>`,
    seo: {
      metaTitle: 'Contact Us',
      metaDescription: 'Get in touch with our team for support, sales, or general inquiries.',
      metaKeywords: 'contact, support, sales',
      ogTitle: 'Contact Us',
      ogDescription: 'Get in touch with our team for support, sales, or general inquiries.',
      twitterCard: 'summary_large_image',
    },
  },
};

export function createManagedPageFromTemplate(
  templateKey: FrontendWebsitePageTemplateKey,
  locale: string
): FrontendWebsiteManagedPage {
  const template = FRONTEND_WEBSITE_PAGE_TEMPLATES[templateKey];
  const now = new Date().toISOString();
  return {
    id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    slug: template.slug,
    type: template.type,
    enabled: true,
    sortOrder: 0,
    showInNav: false,
    localizedContent: {
      [locale]: {
        title: template.title,
        content: template.content,
        seo: { ...template.seo },
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyManagedPage(locale: string): FrontendWebsiteManagedPage {
  const now = new Date().toISOString();
  return {
    id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    slug: '',
    type: 'custom',
    enabled: true,
    sortOrder: 0,
    showInNav: false,
    localizedContent: {
      [locale]: {
        title: '',
        content: '',
        seo: {},
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}
