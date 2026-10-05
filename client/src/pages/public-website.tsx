import React, { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { Loader2 } from 'lucide-react';
import { usePublicFrontendPage } from '@/hooks/use-public-frontend-page';
import { useWebsiteEnabled } from '@/hooks/use-website-enabled';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';
import {
  buildManagedPageDocumentMetadata,
  useDocumentMetadata,
} from '@/hooks/use-document-metadata';
import { useLandingCustomization } from '@/components/landing/use-landing-customization';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingFooter } from '@/components/landing/LandingFooter';
import '@/styles/landing.css';

interface Website {
  id: number;
  title: string;
  slug: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  grapesHtml?: string;
  grapesCss?: string;
  grapesJs?: string;
  customCss?: string;
  customJs?: string;
  customHead?: string;
  favicon?: string;
  googleAnalyticsId?: string;
  facebookPixelId?: string;
  status: string;
  source?: 'company-page';
  content?: string;
}

const APP_ROUTES = [
  'auth', 'login', 'register', 'dashboard', 'admin', 'settings',
  'profile', 'logout', 'inbox', 'flows', 'contacts', 'calendar',
  'analytics', 'campaigns', 'pipeline', 'pages', 'users', 'billing',
  'integrations', 'reports', 'templates', 'webhooks', 'payment',
  'forgot-password', 'reset-password', 'signup', 'affiliate-apply',
  'become-partner', 'accept-invitation', 'landing', 'access-denied',
  'tasks', 'my-calendar', 'call-logs', 'captured-data', 'erp', 'restaurant', 'email',
  'legacy-public',
];

const PublicWebsite: React.FC = () => {
  const [legacyMatch, legacyParams] = useRoute('/legacy-public/:slug');
  const [, rootParams] = useRoute('/:slug');
  const legacyOnly = Boolean(legacyMatch);
  const slug = legacyOnly ? legacyParams?.slug : rootParams?.slug;
  const { currentLanguage } = useTranslation();
  const { branding, isLoading: brandingLoading } = useBranding();
  const { data: websiteSettings, isLoading: websiteEnabledLoading } = useWebsiteEnabled();
  const lang = currentLanguage?.code;
  const frontendWebsiteEnabled = websiteSettings?.enabled === true;

  const [legacyWebsite, setLegacyWebsite] = useState<Website | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<'pending' | 'frontend' | 'legacy' | 'app-route' | 'not-found'>('pending');

  const shouldUseFrontendWebsite = !legacyOnly && frontendWebsiteEnabled;

  const {
    data: frontendPageData,
    isLoading: frontendPageLoading,
  } = usePublicFrontendPage(shouldUseFrontendWebsite ? slug : undefined, lang);

  useEffect(() => {
    if (!slug) {
      setResolution('not-found');
      setLegacyError('No slug provided');
      return;
    }

    if (APP_ROUTES.includes(slug)) {
      setResolution('app-route');
      return;
    }

    setResolution('pending');
    setLegacyWebsite(null);
    setLegacyError(null);
  }, [slug]);

  useEffect(() => {
    if (!slug || resolution !== 'pending' || websiteEnabledLoading) {
      return;
    }

    if (legacyOnly || !frontendWebsiteEnabled) {
      fetchLegacyWebsite(slug, legacyOnly);
      return;
    }

    if (frontendPageLoading) {
      return;
    }

    if (frontendPageData?.page) {
      setResolution('frontend');
      return;
    }

    setResolution('not-found');
    setLegacyError('Page not found');
  }, [
    slug,
    resolution,
    websiteEnabledLoading,
    frontendWebsiteEnabled,
    legacyOnly,
    frontendPageLoading,
    frontendPageData,
  ]);

  const fetchLegacyWebsite = async (websiteSlug: string, useLegacyCompat: boolean) => {
    setLegacyLoading(true);
    try {
      const legacyQuery = useLegacyCompat ? '?legacy=1' : '';
      let response = await fetch(`/api/public/company-page/${websiteSlug}${legacyQuery}`);
      if (response.status === 404) {
        response = await fetch(`/api/public/website/${websiteSlug}${legacyQuery}`);
      }
      if (response.status === 404) {
        setLegacyError('Website not found');
        setResolution('not-found');
        setLegacyLoading(false);
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to fetch website');
      }
      const websiteData = await response.json();
      if (websiteData.status !== 'published') {
        setLegacyError('Website not published');
        setResolution('not-found');
        setLegacyLoading(false);
        return;
      }
      setLegacyWebsite(websiteData);
      setResolution('legacy');
      setLegacyLoading(false);
    } catch (err) {
      console.error('Error fetching website:', err);
      setLegacyError('Failed to load website');
      setResolution('not-found');
      setLegacyLoading(false);
    }
  };

  const frontendSite = frontendPageData?.site;
  const frontendPage = frontendPageData?.page;

  useLandingCustomization(
    frontendSite
      ? {
          customCss: frontendSite.customCss,
          customJs: frontendSite.customJs,
        }
      : undefined
  );

  const pageMetadata = useMemo(() => {
    if (!frontendPage || !frontendSite) {
      return null;
    }
    return buildManagedPageDocumentMetadata(
      frontendPage,
      frontendSite.landingSeo,
      frontendSite.header
    );
  }, [frontendPage, frontendSite]);

  useDocumentMetadata({
    metadata: pageMetadata,
    brandingFallback: {
      appName: branding.appName,
      faviconUrl: branding.faviconUrl,
    },
    enabled: resolution === 'frontend' && !!pageMetadata,
    brandingReady: !brandingLoading,
  });

  useEffect(() => {
    if (resolution !== 'legacy' || !legacyWebsite || legacyError) {
      return;
    }

    if (legacyWebsite.metaTitle || legacyWebsite.title) {
      document.title = legacyWebsite.metaTitle || legacyWebsite.title;
    }
    if (legacyWebsite.metaDescription) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', legacyWebsite.metaDescription);
    }
    if (legacyWebsite.metaKeywords) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.setAttribute('name', 'keywords');
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute('content', legacyWebsite.metaKeywords);
    }
    if (legacyWebsite.favicon) {
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.setAttribute('rel', 'icon');
        document.head.appendChild(favicon);
      }
      favicon.href = legacyWebsite.favicon;
    }
    if (legacyWebsite.customHead) {
      const headDiv = document.createElement('div');
      headDiv.innerHTML = legacyWebsite.customHead;
      Array.from(headDiv.children).forEach((child) => {
        document.head.appendChild(child);
      });
    }
  }, [legacyWebsite, legacyError, resolution]);

  useEffect(() => {
    if (resolution !== 'legacy' || !legacyWebsite || legacyError) {
      return;
    }
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    return () => {
      if (wasDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    };
  }, [legacyWebsite, legacyError, resolution]);

  useEffect(() => {
    if (resolution !== 'legacy' || !legacyWebsite || !(legacyWebsite.grapesCss || legacyWebsite.customCss)) {
      return;
    }
    const style = document.createElement('style');
    style.innerHTML = `${legacyWebsite.grapesCss || ''}\n${legacyWebsite.customCss || ''}`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [legacyWebsite, resolution]);

  useEffect(() => {
    if (resolution !== 'legacy' || !legacyWebsite || !(legacyWebsite.grapesJs || legacyWebsite.customJs)) {
      return;
    }
    const script = document.createElement('script');
    script.innerHTML = `${legacyWebsite.grapesJs || ''}\n${legacyWebsite.customJs || ''}`;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [legacyWebsite, resolution]);

  if (resolution === 'app-route') {
    return null;
  }

  if (resolution === 'pending' || websiteEnabledLoading || frontendPageLoading || legacyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (resolution === 'frontend' && frontendPage && frontendSite) {
    const managedPageSlugs = frontendSite.pageReferences.map((page) => page.slug);
    return (
      <div className="min-h-screen bg-background landing-page">
        <LandingHeader header={frontendSite.header} managedPageSlugs={managedPageSlugs} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <article>
            <h1 className="text-3xl font-bold text-foreground mb-8">{frontendPage.title}</h1>
            <div
              className="prose prose-lg max-w-none dark:prose-invert frontend-managed-page-content"
              dangerouslySetInnerHTML={{ __html: frontendPage.content }}
            />
          </article>
        </main>
        <LandingFooter
          header={frontendSite.header}
          homepage={frontendSite.homepage}
          footer={frontendSite.footer}
          pageReferences={frontendSite.pageReferences}
          managedPageSlugs={managedPageSlugs}
        />
      </div>
    );
  }

  if (legacyError || !legacyWebsite) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
        <p className="text-gray-600 mb-8">Page Not Found</p>
        <p className="text-sm text-gray-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
    );
  }

  const html =
    legacyWebsite.source === 'company-page' && legacyWebsite.content
      ? legacyWebsite.content
      : legacyWebsite.grapesHtml || '';

  return (
    <div
      className="published-page-content fixed inset-0 w-full min-w-full min-h-full overflow-auto bg-background"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default PublicWebsite;
