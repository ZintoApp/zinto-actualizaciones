import { useEffect } from 'react';
import {
  applyDocumentMetadata,
  clearDocumentMetadata,
  type DocumentMetadataInput,
} from '@/lib/apply-document-metadata';

type UseDocumentMetadataOptions = {
  metadata: DocumentMetadataInput | null | undefined;
  brandingFallback?: { appName?: string; faviconUrl?: string };
  enabled?: boolean;
  brandingReady?: boolean;
};

export function useDocumentMetadata({
  metadata,
  brandingFallback,
  enabled = true,
  brandingReady = true,
}: UseDocumentMetadataOptions) {
  useEffect(() => {
    if (!enabled || !metadata || !brandingReady) {
      return;
    }

    applyDocumentMetadata(metadata, brandingFallback);

    return () => {
      clearDocumentMetadata(brandingFallback);
    };
  }, [metadata, brandingFallback, enabled, brandingReady]);
}

export function buildLandingDocumentMetadata(
  seo?: {
    title?: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    twitterCard?: 'summary' | 'summary_large_image';
  },
  header?: { faviconUrl?: string; siteName?: string }
): DocumentMetadataInput {
  return {
    title: seo?.title || header?.siteName,
    description: seo?.description,
    keywords: seo?.keywords,
    faviconUrl: header?.faviconUrl,
    ogTitle: seo?.ogTitle || seo?.title,
    ogDescription: seo?.ogDescription || seo?.description,
    ogImageUrl: seo?.ogImageUrl,
    twitterCard: seo?.twitterCard,
  };
}

export function buildManagedPageDocumentMetadata(
  page: {
    title: string;
    seo?: {
      metaTitle?: string;
      metaDescription?: string;
      metaKeywords?: string;
      ogTitle?: string;
      ogDescription?: string;
      ogImageUrl?: string;
      faviconUrl?: string;
      twitterCard?: 'summary' | 'summary_large_image';
    };
  },
  landingSeo?: {
    title?: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    twitterCard?: 'summary' | 'summary_large_image';
  },
  siteHeader?: { faviconUrl?: string; siteName?: string }
): DocumentMetadataInput {
  const pageSeo = page.seo;
  return {
    title: pageSeo?.metaTitle || page.title || landingSeo?.title || siteHeader?.siteName,
    description: pageSeo?.metaDescription || landingSeo?.description,
    keywords: pageSeo?.metaKeywords || landingSeo?.keywords,
    faviconUrl: pageSeo?.faviconUrl || siteHeader?.faviconUrl,
    ogTitle: pageSeo?.ogTitle || pageSeo?.metaTitle || page.title || landingSeo?.ogTitle,
    ogDescription:
      pageSeo?.ogDescription || pageSeo?.metaDescription || landingSeo?.ogDescription,
    ogImageUrl: pageSeo?.ogImageUrl || landingSeo?.ogImageUrl,
    twitterCard: pageSeo?.twitterCard || landingSeo?.twitterCard,
  };
}
