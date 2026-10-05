import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { usePublicFrontendWebsite } from '@/hooks/use-public-frontend-website';
import { usePublicPlans } from '@/hooks/use-public-plans';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';
import {
  buildLandingDocumentMetadata,
  useDocumentMetadata,
} from '@/hooks/use-document-metadata';
import '@/styles/landing.css';
import { Button } from '@/components/ui/button';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingFeatures } from '@/components/landing/LandingFeatures';
import { LandingSocialProof } from '@/components/landing/LandingSocialProof';
import { LandingPricing } from '@/components/landing/LandingPricing';
import { LandingTestimonials } from '@/components/landing/LandingTestimonials';
import { LandingFaq } from '@/components/landing/LandingFaq';
import { LandingCta } from '@/components/landing/LandingCta';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { useLandingCustomization } from '@/components/landing/use-landing-customization';

export default function LandingPage() {
  const { currentLanguage, t } = useTranslation();
  const { branding, isLoading: brandingLoading } = useBranding();
  const lang = currentLanguage?.code;
  const queryClient = useQueryClient();

  const {
    data: websiteData,
    isLoading: configLoading,
    error: configError,
    refetch: refetchConfig,
  } = usePublicFrontendWebsite(lang);

  const {
    plans,
    isLoading: plansLoading,
    error: plansError,
  } = usePublicPlans();

  const config = websiteData?.config;
  useLandingCustomization(config);

  const managedPageSlugs = useMemo(
    () => config?.pageReferences.map((page) => page.slug) ?? [],
    [config?.pageReferences]
  );

  const landingMetadata = useMemo(
    () =>
      config
        ? buildLandingDocumentMetadata(config.content.seo, config.header)
        : null,
    [config]
  );

  useDocumentMetadata({
    metadata: landingMetadata,
    brandingFallback: {
      appName: branding.appName,
      faviconUrl: branding.faviconUrl || config?.header.faviconUrl,
    },
    enabled: !!config,
    brandingReady: !brandingLoading,
  });

  if (configLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">{t('common.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">
            {t('landing.error.load_failed', 'Failed to load page content')}
          </p>
          <Button onClick={() => refetchConfig()} variant="outline">
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      </div>
    );
  }

  const { header, sectionVisibility, content, footer, pageReferences } = config;
  const homepage = content.homepage;

  const showPricing =
    sectionVisibility.pricing && (homepage.showPricingSection ?? true);
  const showTestimonials =
    sectionVisibility.testimonials &&
    homepage.showTestimonialsSection !== false &&
    homepage.testimonials.length > 0;
  const showFaq = sectionVisibility.faq && !!content.faq?.items.length;

  return (
    <div className="min-h-screen bg-background landing-page">
      <LandingHeader header={header} managedPageSlugs={managedPageSlugs} />

      {sectionVisibility.hero && (
        <LandingHero homepage={homepage} />
      )}

      {sectionVisibility.features && <LandingFeatures homepage={homepage} />}

      {sectionVisibility.socialProof && <LandingSocialProof homepage={homepage} />}

      <LandingPricing
        pricingContent={content.pricing}
        plans={plans}
        isLoading={plansLoading}
        error={plansError}
        onRetry={() => queryClient.invalidateQueries({ queryKey: ['/api/plans/public'] })}
        showSection={showPricing}
      />

      {showTestimonials && <LandingTestimonials homepage={homepage} />}

      {showFaq && <LandingFaq faq={content.faq} />}

      {sectionVisibility.cta && <LandingCta homepage={homepage} />}

      <LandingFooter
        header={header}
        homepage={homepage}
        footer={footer}
        pageReferences={pageReferences}
        managedPageSlugs={managedPageSlugs}
      />
    </div>
  );
}
