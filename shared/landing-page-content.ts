import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isValidUrlOrPath(value: string): boolean {
  if (value === '') {
    return true;
  }

  if (value.startsWith('/') || value.startsWith('#')) {
    return true;
  }

  return isValidAbsoluteHttpUrl(value);
}

export const urlOrPathSchema = z.string().refine(isValidUrlOrPath, {
  message: 'Must be a valid URL or path',
});

const nonEmptyUrlOrPathSchema = urlOrPathSchema.refine((value) => value.trim().length > 0, {
  message: 'Must be a non-empty URL or path',
});

const absoluteHttpUrlOrEmptySchema = z.string().refine(
  (value) => value === '' || isValidAbsoluteHttpUrl(value),
  { message: 'Must be a valid HTTP(S) URL or empty' }
);

export const landingStatSchema = z.object({
  value: nonEmptyString,
  label: nonEmptyString,
});

export const landingFeatureSchema = z.object({
  title: nonEmptyString,
  description: nonEmptyString,
  icon: nonEmptyString,
});

export const landingTestimonialSchema = z.object({
  name: nonEmptyString,
  company: nonEmptyString,
  text: nonEmptyString,
  rating: z.number().min(1).max(5),
});

export const landingFooterLinkSchema = z.object({
  label: nonEmptyString,
  href: nonEmptyUrlOrPathSchema,
});

export const landingFooterLinksSchema = z.object({
  product: z.array(landingFooterLinkSchema),
  company: z.array(landingFooterLinkSchema),
  support: z.array(landingFooterLinkSchema),
});

export const landingSocialLinksSchema = z.object({
  twitter: absoluteHttpUrlOrEmptySchema,
  linkedin: absoluteHttpUrlOrEmptySchema,
  facebook: absoluteHttpUrlOrEmptySchema,
});

export const landingTrustBadgesSchema = z.object({
  enterpriseSecurity: nonEmptyString,
  uptime: nonEmptyString,
  soc2Compliant: nonEmptyString,
});

export const landingHeroPreviewFallbackSchema = z.object({
  dashboardLabel: nonEmptyString,
  analyticsTitle: nonEmptyString,
  message1Channel: nonEmptyString,
  message1Text: nonEmptyString,
  message1Time: nonEmptyString,
  message2Channel: nonEmptyString,
  message2Text: nonEmptyString,
  message2Time: nonEmptyString,
});

export const landingPageContentSchema = z.object({
  heroTitle: nonEmptyString,
  heroSubtitle: nonEmptyString,
  heroCTAPrimaryText: nonEmptyString,
  heroCTAPrimaryHref: nonEmptyUrlOrPathSchema,
  heroCTASecondaryText: nonEmptyString,
  heroCTASecondaryHref: nonEmptyUrlOrPathSchema,
  heroPreviewFallback: landingHeroPreviewFallbackSchema,
  heroImageAssetId: z.preprocess(
    (value) => (value === null || value === '' ? undefined : value),
    z.string().min(1).optional()
  ),
  showHeroImage: z.boolean(),
  heroTrustBusinessesText: nonEmptyString,
  heroTrustRatingText: nonEmptyString,
  demoPlaceholderText: nonEmptyString,
  featuresSectionTitle: nonEmptyString,
  featuresSectionSubtitle: nonEmptyString,
  socialProofTitle: nonEmptyString,
  socialProofSubtitle: nonEmptyString,
  testimonialsSectionTitle: nonEmptyString,
  ctaTitle: nonEmptyString,
  ctaSubtitle: nonEmptyString,
  ctaPrimaryText: nonEmptyString,
  ctaPrimaryHref: nonEmptyUrlOrPathSchema,
  ctaSecondaryText: nonEmptyString,
  ctaSecondaryHref: nonEmptyUrlOrPathSchema,
  trustBadges: landingTrustBadgesSchema,
  stats: z.array(landingStatSchema),
  features: z.array(landingFeatureSchema),
  testimonials: z.array(landingTestimonialSchema),
  showPricingSection: z.boolean(),
  showTestimonialsSection: z.boolean(),
  footerDescription: nonEmptyString,
  footerProductHeading: nonEmptyString,
  footerCompanyHeading: nonEmptyString,
  footerSupportHeading: nonEmptyString,
  copyrightText: nonEmptyString,
  legalLinks: z.array(landingFooterLinkSchema),
  socialLinks: landingSocialLinksSchema,
  footerLinks: landingFooterLinksSchema,
});

export type LandingStat = z.infer<typeof landingStatSchema>;
export type LandingFeature = z.infer<typeof landingFeatureSchema>;
export type LandingTestimonial = z.infer<typeof landingTestimonialSchema>;
export type LandingFooterLink = z.infer<typeof landingFooterLinkSchema>;
export type LandingFooterLinks = z.infer<typeof landingFooterLinksSchema>;
export type LandingSocialLinks = z.infer<typeof landingSocialLinksSchema>;
export type LandingTrustBadges = z.infer<typeof landingTrustBadgesSchema>;
export type LandingHeroPreviewFallback = z.infer<typeof landingHeroPreviewFallbackSchema>;
export type LandingPageContent = z.infer<typeof landingPageContentSchema>;

export type LandingPageMediaLibraryLookup = {
  assets: Array<{ id: string; url: string }>;
};

function coerceHeroImageAssetId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  return value.trim();
}

function coerceLegacyHeroImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.startsWith('/uploads/') ? trimmed : undefined;
}

function resolveLegacyHeroImageAssetId(
  source: Record<string, unknown>,
  mediaLibrary?: LandingPageMediaLibraryLookup
): string | undefined {
  const assetId = coerceHeroImageAssetId(source.heroImageAssetId);
  if (assetId) {
    return assetId;
  }

  const legacyUrl = coerceLegacyHeroImageUrl(source.heroImageUrl);
  if (!legacyUrl || !mediaLibrary) {
    return undefined;
  }

  const normalizedLegacyUrl = legacyUrl.split('?')[0];
  const matchingAsset = mediaLibrary.assets.find((asset) => {
    const normalizedAssetUrl = asset.url.split('?')[0];
    return normalizedAssetUrl === normalizedLegacyUrl || asset.url === legacyUrl;
  });

  return matchingAsset?.id;
}

function coerceSocialUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const parsed = landingSocialLinksSchema.shape.twitter.safeParse(value.trim());
  return parsed.success ? parsed.data : '';
}

export function createDefaultLandingPageContent(appName = 'BotHive'): LandingPageContent {
  return {
    heroTitle: 'Ready to transform your customer communication?',
    heroSubtitle: `Join thousands of businesses using ${appName} to streamline their customer interactions and boost satisfaction rates.`,
    heroCTAPrimaryText: 'Start Free Trial',
    heroCTAPrimaryHref: '/register',
    heroCTASecondaryText: 'Watch Demo',
    heroCTASecondaryHref: '#demo',
    heroPreviewFallback: {
      dashboardLabel: `${appName} Dashboard`,
      analyticsTitle: 'Message Analytics',
      message1Channel: 'WhatsApp',
      message1Text: 'New customer inquiry',
      message1Time: '2m ago',
      message2Channel: 'Email',
      message2Text: 'Support ticket resolved',
      message2Time: '5m ago',
    },
    showHeroImage: false,
    heroTrustBusinessesText: 'Trusted by 10,000+ businesses',
    heroTrustRatingText: '4.9/5 rating',
    demoPlaceholderText: 'Demo video coming soon',
    featuresSectionTitle: 'Everything you need to manage customer communication',
    featuresSectionSubtitle:
      'Powerful features designed to streamline your workflow and enhance customer relationships',
    socialProofTitle: 'Trusted by businesses worldwide',
    socialProofSubtitle: `Join thousands of companies that trust ${appName} for their customer communication`,
    testimonialsSectionTitle: 'What our customers say',
    ctaTitle: 'Ready to transform your customer communication?',
    ctaSubtitle: `Join thousands of businesses using ${appName} to streamline their customer interactions and boost satisfaction rates.`,
    ctaPrimaryText: 'Start Free Trial',
    ctaPrimaryHref: '/register',
    ctaSecondaryText: 'Sign In',
    ctaSecondaryHref: '/auth',
    trustBadges: {
      enterpriseSecurity: 'Enterprise Security',
      uptime: '99.9% Uptime',
      soc2Compliant: 'SOC 2 Compliant',
    },
    stats: [
      { value: '10,000+', label: 'Active Users' },
      { value: '99.9%', label: 'Uptime' },
      { value: '50M+', label: 'Messages Processed' },
      { value: '24/7', label: 'Support' },
    ],
    features: [
      {
        title: 'Multi-Channel Messaging',
        description:
          'Connect WhatsApp, Email, Facebook, Instagram, and Telegram in one unified inbox. Never miss a customer message again.',
        icon: 'MessageSquare',
      },
      {
        title: 'AI-Powered Automation',
        description:
          'Intelligent chatbots with OpenAI, Claude, and Gemini integration. Automate responses while maintaining human-like conversations.',
        icon: 'Bot',
      },
      {
        title: 'Team Collaboration',
        description:
          'Real-time team inbox with role-based access control. Collaborate seamlessly with your team members.',
        icon: 'Users',
      },
      {
        title: 'Visual Flow Builder',
        description:
          'Drag-and-drop interface to create sophisticated automation workflows and customer journeys without coding.',
        icon: 'Workflow',
      },
      {
        title: 'Advanced Analytics',
        description:
          'Comprehensive insights and reporting to optimize your customer communication and track performance metrics.',
        icon: 'BarChart3',
      },
      {
        title: 'Enterprise Security',
        description:
          'Bank-level security with end-to-end encryption, compliance standards, and data protection for your business.',
        icon: 'Shield',
      },
    ],
    testimonials: [],
    showPricingSection: true,
    showTestimonialsSection: false,
    footerDescription: 'The complete customer communication platform for modern businesses.',
    footerProductHeading: 'Product',
    footerCompanyHeading: 'Company',
    footerSupportHeading: 'Support',
    copyrightText: `© 2025 ${appName}. All rights reserved.`,
    legalLinks: [],
    socialLinks: {
      twitter: '',
      linkedin: '',
      facebook: '',
    },
    footerLinks: {
      product: [
        { label: 'Features', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
      ],
      company: [],
      support: [],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceHeroImageAssetIdFromSource(
  source: Record<string, unknown>,
  mediaLibrary?: LandingPageMediaLibraryLookup
): string | undefined {
  return resolveLegacyHeroImageAssetId(source, mediaLibrary);
}

function coerceStats(value: unknown, fallback: LandingStat[]): LandingStat[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  if (value.length === 0) {
    return [];
  }

  return value
    .map((item) => landingStatSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function coerceFeatures(value: unknown, fallback: LandingFeature[]): LandingFeature[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  if (value.length === 0) {
    return [];
  }

  return value
    .map((item) => landingFeatureSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function coerceTestimonials(
  value: unknown,
  fallback: LandingTestimonial[]
): LandingTestimonial[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const parsed = value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const legacy = landingTestimonialSchema.safeParse({
        name: item.name,
        company: item.company ?? item.role,
        text: item.text ?? item.content,
        rating: item.rating,
      });

      return legacy.success ? legacy.data : null;
    })
    .filter((item): item is LandingTestimonial => item !== null);

  return parsed;
}

function coerceFooterLinks(value: unknown, fallback: LandingFooterLinks): LandingFooterLinks {
  if (!isRecord(value)) {
    return fallback;
  }

  const coerceLinkArray = (
    links: unknown,
    fallbackLinks: LandingFooterLink[]
  ): LandingFooterLink[] => {
    if (!Array.isArray(links)) {
      return fallbackLinks;
    }

    if (links.length === 0) {
      return [];
    }

    return links
      .map((item) => landingFooterLinkSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data);
  };

  return {
    product: coerceLinkArray(value.product, fallback.product),
    company: coerceLinkArray(value.company, fallback.company),
    support: coerceLinkArray(value.support, fallback.support),
  };
}

function coerceSocialLinks(value: unknown, fallback: LandingSocialLinks): LandingSocialLinks {
  if (isRecord(value) && ('twitter' in value || 'linkedin' in value || 'facebook' in value)) {
    return {
      twitter: coerceSocialUrl(value.twitter),
      linkedin: coerceSocialUrl(value.linkedin),
      facebook: coerceSocialUrl(value.facebook),
    };
  }

  if (Array.isArray(value)) {
    const links = { ...fallback };
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      const platform = typeof item.platform === 'string' ? item.platform.toLowerCase() : '';
      const url = coerceSocialUrl(item.url);

      if (platform === 'x' || platform === 'twitter') {
        links.twitter = url;
      } else if (platform === 'linkedin') {
        links.linkedin = url;
      } else if (platform === 'facebook') {
        links.facebook = url;
      }
    }

    return links;
  }

  return fallback;
}

function coerceTrustBadges(value: unknown, fallback: LandingTrustBadges): LandingTrustBadges {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    enterpriseSecurity: coerceString(value.enterpriseSecurity, fallback.enterpriseSecurity),
    uptime: coerceString(value.uptime, fallback.uptime),
    soc2Compliant: coerceString(value.soc2Compliant, fallback.soc2Compliant),
  };
}

function coerceUrlOrPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  const parsed = nonEmptyUrlOrPathSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : fallback;
}

function coerceHeroPreviewFallback(
  value: unknown,
  fallback: LandingHeroPreviewFallback
): LandingHeroPreviewFallback {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    dashboardLabel: coerceString(value.dashboardLabel, fallback.dashboardLabel),
    analyticsTitle: coerceString(value.analyticsTitle, fallback.analyticsTitle),
    message1Channel: coerceString(value.message1Channel, fallback.message1Channel),
    message1Text: coerceString(value.message1Text, fallback.message1Text),
    message1Time: coerceString(value.message1Time, fallback.message1Time),
    message2Channel: coerceString(value.message2Channel, fallback.message2Channel),
    message2Text: coerceString(value.message2Text, fallback.message2Text),
    message2Time: coerceString(value.message2Time, fallback.message2Time),
  };
}

function coerceLegalLinks(value: unknown, fallback: LandingFooterLink[]): LandingFooterLink[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  if (value.length === 0) {
    return [];
  }

  return value
    .map((item) => landingFooterLinkSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function normalizeLandingPageContent(
  value: unknown,
  options: {
    appName?: string;
    overrides?: Partial<LandingPageContent>;
    mediaLibrary?: LandingPageMediaLibraryLookup;
  } = {}
): LandingPageContent {
  const appName = options.appName ?? 'BotHive';
  const defaults = createDefaultLandingPageContent(appName);
  const source = isRecord(value) ? value : {};
  const overrides = options.overrides ?? {};
  const mediaLibrary = options.mediaLibrary;

  const normalized: LandingPageContent = {
    heroTitle: coerceString(source.heroTitle, defaults.heroTitle),
    heroSubtitle: coerceString(source.heroSubtitle, defaults.heroSubtitle),
    heroCTAPrimaryText: coerceString(source.heroCTAPrimaryText, defaults.heroCTAPrimaryText),
    heroCTAPrimaryHref: coerceUrlOrPath(source.heroCTAPrimaryHref, defaults.heroCTAPrimaryHref),
    heroCTASecondaryText: coerceString(source.heroCTASecondaryText, defaults.heroCTASecondaryText),
    heroCTASecondaryHref: coerceUrlOrPath(source.heroCTASecondaryHref, defaults.heroCTASecondaryHref),
    heroPreviewFallback: coerceHeroPreviewFallback(source.heroPreviewFallback, defaults.heroPreviewFallback),
    heroImageAssetId: coerceHeroImageAssetIdFromSource(source, mediaLibrary),
    showHeroImage: coerceBoolean(source.showHeroImage, defaults.showHeroImage),
    heroTrustBusinessesText: coerceString(source.heroTrustBusinessesText, defaults.heroTrustBusinessesText),
    heroTrustRatingText: coerceString(source.heroTrustRatingText, defaults.heroTrustRatingText),
    demoPlaceholderText: coerceString(source.demoPlaceholderText, defaults.demoPlaceholderText),
    featuresSectionTitle: coerceString(source.featuresSectionTitle, defaults.featuresSectionTitle),
    featuresSectionSubtitle: coerceString(source.featuresSectionSubtitle, defaults.featuresSectionSubtitle),
    socialProofTitle: coerceString(source.socialProofTitle, defaults.socialProofTitle),
    socialProofSubtitle: coerceString(source.socialProofSubtitle, defaults.socialProofSubtitle),
    testimonialsSectionTitle: coerceString(
      source.testimonialsSectionTitle,
      defaults.testimonialsSectionTitle
    ),
    ctaTitle: coerceString(source.ctaTitle, defaults.ctaTitle),
    ctaSubtitle: coerceString(source.ctaSubtitle, defaults.ctaSubtitle),
    ctaPrimaryText: coerceString(source.ctaPrimaryText, defaults.ctaPrimaryText),
    ctaPrimaryHref: coerceUrlOrPath(source.ctaPrimaryHref, defaults.ctaPrimaryHref),
    ctaSecondaryText: coerceString(source.ctaSecondaryText, defaults.ctaSecondaryText),
    ctaSecondaryHref: coerceUrlOrPath(source.ctaSecondaryHref, defaults.ctaSecondaryHref),
    trustBadges: coerceTrustBadges(source.trustBadges, defaults.trustBadges),
    stats: coerceStats(source.stats, defaults.stats),
    features: coerceFeatures(source.features, defaults.features),
    testimonials: coerceTestimonials(source.testimonials, defaults.testimonials),
    showPricingSection: coerceBoolean(source.showPricingSection, defaults.showPricingSection),
    showTestimonialsSection: coerceBoolean(
      source.showTestimonialsSection,
      defaults.showTestimonialsSection
    ),
    footerDescription: coerceString(source.footerDescription, defaults.footerDescription),
    footerProductHeading: coerceString(source.footerProductHeading, defaults.footerProductHeading),
    footerCompanyHeading: coerceString(source.footerCompanyHeading, defaults.footerCompanyHeading),
    footerSupportHeading: coerceString(source.footerSupportHeading, defaults.footerSupportHeading),
    copyrightText: coerceString(source.copyrightText, defaults.copyrightText),
    legalLinks: coerceLegalLinks(source.legalLinks, defaults.legalLinks),
    socialLinks: coerceSocialLinks(source.socialLinks, defaults.socialLinks),
    footerLinks: coerceFooterLinks(source.footerLinks, defaults.footerLinks),
  };

  return {
    ...normalized,
    ...overrides,
    trustBadges: overrides.trustBadges
      ? coerceTrustBadges(overrides.trustBadges, normalized.trustBadges)
      : normalized.trustBadges,
    heroPreviewFallback: overrides.heroPreviewFallback
      ? coerceHeroPreviewFallback(overrides.heroPreviewFallback, normalized.heroPreviewFallback)
      : normalized.heroPreviewFallback,
    footerLinks: overrides.footerLinks
      ? coerceFooterLinks(overrides.footerLinks, normalized.footerLinks)
      : normalized.footerLinks,
    socialLinks: overrides.socialLinks
      ? coerceSocialLinks(overrides.socialLinks, normalized.socialLinks)
      : normalized.socialLinks,
    legalLinks: overrides.legalLinks
      ? coerceLegalLinks(overrides.legalLinks, normalized.legalLinks)
      : normalized.legalLinks,
    stats: overrides.stats ?? normalized.stats,
    features: overrides.features ?? normalized.features,
    testimonials: overrides.testimonials ?? normalized.testimonials,
  };
}
