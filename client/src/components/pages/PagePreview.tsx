import { ArrowLeft, ExternalLink, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';

interface CompanyPage {
  id: number;
  companyId: number;
  title: string;
  slug: string;
  content: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  isPublished: boolean;
  isFeatured: boolean;
  template: string;
  customCss?: string;
  customJs?: string;
  authorId?: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface PagePreviewProps {
  page: CompanyPage;
  onClose: () => void;
}

export function PagePreview({ page, onClose }: PagePreviewProps) {
  const { t } = useTranslation();
  const { company } = useAuth();

  const getPublicUrl = () => {
    if (typeof window === 'undefined') {
      return '';
    }
    const companySlug = (company as any)?.subdomain || company?.slug;
    if (!companySlug) {
      return '';
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
    return `${protocol}//${hostname}${portSuffix}/${companySlug}-${page.slug}`;
  };

  const getTemplateStyles = () => {
    switch (page.template) {
      case 'legal':
        return {
          container: 'max-w-4xl mx-auto px-6 py-12 bg-background',
          title: 'text-4xl font-bold text-foreground mb-8 text-center',
          content: 'prose prose-lg max-w-none text-foreground leading-relaxed dark:prose-invert'
        };
      case 'marketing':
        return {
          container: 'max-w-6xl mx-auto px-6 py-16 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50',
          title: 'text-5xl font-extrabold text-gray-900 dark:text-gray-100 mb-12 text-center bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent',
          content: 'prose prose-xl max-w-none text-gray-800 dark:text-gray-200 dark:prose-invert'
        };
      case 'minimal':
        return {
          container: 'max-w-2xl mx-auto px-4 py-8 bg-white dark:bg-card',
          title: 'text-2xl font-semibold text-gray-800 dark:text-foreground mb-6',
          content: 'prose prose-sm max-w-none text-gray-600 dark:text-muted-foreground dark:prose-invert'
        };
      case 'custom':
        return {
          container: 'w-full',
          title: '',
          content: 'w-full'
        };
      default:
        return {
          container: 'max-w-4xl mx-auto px-6 py-10 bg-white dark:bg-card',
          title: 'text-3xl font-bold text-gray-900 dark:text-foreground mb-6',
          content: 'prose max-w-none text-gray-700 dark:text-muted-foreground dark:prose-invert'
        };
    }
  };

  const templateStyles = getTemplateStyles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button data-tour="components-pages-pagepreview.button.common.back"  onClick={onClose}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back', 'Back')}
          </Button>
          <div>
            <h1 data-tour="components-pages-pagepreview.h1.pages.preview" className="text-2xl text-foreground">{t('pages.preview', 'Page Preview')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('pages.preview_description', 'Preview how your page will appear to visitors')}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {page.isPublished && getPublicUrl() && (
            <Button data-tour="components-pages-pagepreview.button.pages.view_live"
              
              onClick={() => window.open(getPublicUrl(), '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('pages.view_live', 'View Live')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2 text-foreground">
                <Globe className="w-5 h-5" />
                <span>{page.title}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                /{page.slug}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {page.isPublished ? (
                <Badge variant="default" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-0">
                  {t('pages.published', 'Published')}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {t('pages.draft', 'Draft')}
                </Badge>
              )}
              {page.isFeatured && (
                <Badge  className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">
                  {t('pages.featured', 'Featured')}
                </Badge>
              )}
              <Badge >
                {page.template.charAt(0).toUpperCase() + page.template.slice(1)} {t('pages.template_suffix', 'Template')}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t border-border">
            {/* SEO Preview */}
            {(page.metaTitle || page.metaDescription) && (
              <div className="p-6 bg-muted/30 dark:bg-muted/20 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  {t('pages.seo_preview', 'SEO Preview')}
                </h3>
                <div className="bg-background dark:bg-card p-4 rounded border border-border">
                  <div className="text-primary text-lg hover:underline cursor-pointer">
                    {page.metaTitle || page.title}
                  </div>
                  {getPublicUrl() && (
                    <div className="text-green-700 dark:text-green-400 text-sm">
                      {getPublicUrl()}
                    </div>
                  )}
                  {page.metaDescription && (
                    <div className="text-muted-foreground text-sm mt-1">
                      {page.metaDescription}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Page Content Preview */}
            <div className="min-h-96">
              <style>
                {page.customCss && `
                  .page-preview-content {
                    ${page.customCss}
                  }
                `}
              </style>
              
              <div className={`page-preview-content ${templateStyles.container}`}>
                {page.template !== 'custom' && (
                  <h1 className={templateStyles.title}>
                    {page.title}
                  </h1>
                )}
                
                <div 
                  className={templateStyles.content}
                  dangerouslySetInnerHTML={{ 
                    __html: page.content || '<p>No content available</p>' 
                  }}
                />
              </div>

              {page.customJs && (
                <script
                  dangerouslySetInnerHTML={{
                    __html: page.customJs
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Page Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{t('pages.page_info', 'Page Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pages.template', 'Template')}:</span>
              <span className="font-medium text-foreground">{page.template.charAt(0).toUpperCase() + page.template.slice(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pages.status', 'Status')}:</span>
              <span className="font-medium text-foreground">
                {page.isPublished ? t('pages.published', 'Published') : t('pages.draft', 'Draft')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pages.featured', 'Featured')}:</span>
              <span className="font-medium text-foreground">
                {page.isFeatured ? t('common.yes', 'Yes') : t('common.no', 'No')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pages.created', 'Created')}:</span>
              <span className="font-medium text-foreground">{new Date(page.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pages.updated', 'Updated')}:</span>
              <span className="font-medium text-foreground">{new Date(page.updatedAt).toLocaleDateString()}</span>
            </div>
            {page.publishedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('pages.published_at', 'Published At')}:</span>
                <span className="font-medium text-foreground">{new Date(page.publishedAt).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{t('pages.seo_info', 'SEO Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-muted-foreground block">{t('pages.meta_title', 'Meta Title')}:</span>
              <span className="font-medium text-foreground">{page.metaTitle || t('common.not_set', 'Not set')}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">{t('pages.meta_description', 'Meta Description')}:</span>
              <span className="font-medium text-sm text-foreground">
                {page.metaDescription || t('common.not_set', 'Not set')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">{t('pages.meta_keywords', 'Meta Keywords')}:</span>
              <span className="font-medium text-sm text-foreground">
                {page.metaKeywords || t('common.not_set', 'Not set')}
              </span>
            </div>
            {page.isPublished && getPublicUrl() && (
              <div>
                <span className="text-muted-foreground block">{t('pages.public_url', 'Public URL')}:</span>
                <a
                  href={getPublicUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:opacity-90 underline text-sm break-all"
                >
                  {getPublicUrl()}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
