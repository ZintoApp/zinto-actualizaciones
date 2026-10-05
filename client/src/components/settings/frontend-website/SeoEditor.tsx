import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import type {
  FrontendWebsiteMediaLibrary,
  FrontendWebsiteSeo,
} from '@shared/frontend-website-settings';
import { createDefaultSeo } from './helpers';
import { AssetPicker } from './AssetPicker';

type SeoEditorProps = {
  locale: string;
  seo: FrontendWebsiteSeo | undefined;
  mediaLibrary: FrontendWebsiteMediaLibrary;
  fieldErrors: Record<string, string[]>;
  onChange: (seo: FrontendWebsiteSeo | undefined) => void;
  onLibraryUpdated: (library: FrontendWebsiteMediaLibrary) => void;
};

export function SeoEditor({
  locale,
  seo,
  mediaLibrary,
  fieldErrors,
  onChange,
  onLibraryUpdated,
}: SeoEditorProps) {
  const { t } = useTranslation();
  const currentSeo = seo ?? createDefaultSeo();

  const errorAt = (path: string) => fieldErrors[`localizedContent.${locale}.seo.${path}`]?.[0];

  const updateSeo = (patch: Partial<FrontendWebsiteSeo>) => {
    onChange({ ...currentSeo, ...patch });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('admin.settings.frontend_website.seo_title', 'SEO & Social Sharing')} ({locale})
        </CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.seo_description',
            'Configure page metadata and Open Graph settings for this locale.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${locale}-seo-title`}>
              {t('admin.settings.frontend_website.seo_page_title', 'Page title')}
            </Label>
            <Input data-tour="components-settings-frontend-website-seoeditor.input.admin.settings.frontend_website.seo_page_title"
              id={`${locale}-seo-title`}
              value={currentSeo.title ?? ''}
              onChange={(e) => updateSeo({ title: e.target.value || undefined })}
            />
            {errorAt('title') && <p className="text-sm text-destructive">{errorAt('title')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${locale}-seo-keywords`}>
              {t('admin.settings.frontend_website.seo_keywords', 'Keywords')}
            </Label>
            <Input data-tour="components-settings-frontend-website-seoeditor.input.admin.settings.frontend_website.seo_page_title"
              id={`${locale}-seo-keywords`}
              value={currentSeo.keywords ?? ''}
              onChange={(e) => updateSeo({ keywords: e.target.value || undefined })}
            />
            {errorAt('keywords') && <p className="text-sm text-destructive">{errorAt('keywords')}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${locale}-seo-description`}>
            {t('admin.settings.frontend_website.seo_description_field', 'Meta description')}
          </Label>
          <Input data-tour="components-settings-frontend-website-seoeditor.input.admin.settings.frontend_website.seo_page_title"
            id={`${locale}-seo-description`}
            value={currentSeo.description ?? ''}
            onChange={(e) => updateSeo({ description: e.target.value || undefined })}
          />
          {errorAt('description') && (
            <p className="text-sm text-destructive">{errorAt('description')}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${locale}-og-title`}>
              {t('admin.settings.frontend_website.seo_og_title', 'Open Graph title')}
            </Label>
            <Input data-tour="components-settings-frontend-website-seoeditor.input.admin.settings.frontend_website.seo_og_title"
              id={`${locale}-og-title`}
              value={currentSeo.ogTitle ?? ''}
              onChange={(e) => updateSeo({ ogTitle: e.target.value || undefined })}
            />
            {errorAt('ogTitle') && <p className="text-sm text-destructive">{errorAt('ogTitle')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${locale}-og-description`}>
              {t('admin.settings.frontend_website.seo_og_description', 'Open Graph description')}
            </Label>
            <Input data-tour="components-settings-frontend-website-seoeditor.input.admin.settings.frontend_website.seo_og_title"
              id={`${locale}-og-description`}
              value={currentSeo.ogDescription ?? ''}
              onChange={(e) => updateSeo({ ogDescription: e.target.value || undefined })}
            />
            {errorAt('ogDescription') && (
              <p className="text-sm text-destructive">{errorAt('ogDescription')}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('admin.settings.frontend_website.seo_twitter_card', 'Twitter card type')}</Label>
            <Select
              value={currentSeo.twitterCard ?? 'summary_large_image'}
              onValueChange={(value: 'summary' | 'summary_large_image') =>
                updateSeo({ twitterCard: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">
                  {t('admin.settings.frontend_website.twitter_summary', 'Summary')}
                </SelectItem>
                <SelectItem value="summary_large_image">
                  {t('admin.settings.frontend_website.twitter_large_image', 'Summary with large image')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AssetPicker
            label={t('admin.settings.frontend_website.seo_og_image', 'Open Graph image')}
            assetId={currentSeo.ogImageAssetId}
            mediaLibrary={mediaLibrary}
            onSelect={(assetId) => updateSeo({ ogImageAssetId: assetId })}
            onLibraryUpdated={onLibraryUpdated}
            error={errorAt('ogImageAssetId')}
          />
        </div>
      </CardContent>
    </Card>
  );
}
