import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';
import { usePublicPlans } from '@/hooks/use-public-plans';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  ExternalLink,
  Globe,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Save,
  BadgeDollarSign as TabIconBadgeDollarSign,
  CircleHelp as TabIconCircleHelp,
  Files as TabIconFiles,
  House as TabIconHouse,
  Info as TabIconInfo,
  PanelBottom as TabIconPanelBottom,
  PanelTop as TabIconPanelTop,
  PanelsTopLeft as TabIconPanelsTopLeft,
  Search as TabIconSearch,
  SlidersHorizontal as TabIconSlidersHorizontal,
} from 'lucide-react';
import type {
  FrontendWebsiteMediaLibrary,
  FrontendWebsiteSettings,
} from '@shared/frontend-website-settings';
import { AdvancedEditor } from './frontend-website/AdvancedEditor';
import { FaqEditor } from './frontend-website/FaqEditor';
import { FooterEditor } from './frontend-website/FooterEditor';
import { HeaderNavEditor } from './frontend-website/HeaderNavEditor';
import { HomepageLocaleEditor } from './frontend-website/HomepageLocaleEditor';
import { MediaLibraryPanel } from './frontend-website/MediaLibraryPanel';
import { ManagedPagesEditor } from './frontend-website/ManagedPagesEditor';
import { PricingEditor } from './frontend-website/PricingEditor';
import { SectionVisibilityEditor } from './frontend-website/SectionVisibilityEditor';
import { SeoEditor } from './frontend-website/SeoEditor';
import {
  FRONTEND_WEBSITE_SETTINGS_QUERY_KEY,
  buildSavePayload,
  ensureLocaleContent,
  getDefaultWebsiteDraft,
  normalizeWebsiteResponse,
  validateWebsiteDraft,
  type ValidationFieldErrors,
} from './frontend-website/helpers';

type FrontendWebsiteManagementSectionProps = {
  frontendWebsiteEnabled: boolean;
  persistedFrontendWebsiteEnabled: boolean;
  onFrontendWebsiteEnabledChange: (enabled: boolean) => void;
  onSavePublishState: () => void;
  isSavingPublishState: boolean;
};

export default function FrontendWebsiteManagementSection({
  frontendWebsiteEnabled,
  persistedFrontendWebsiteEnabled,
  onFrontendWebsiteEnabledChange,
  onSavePublishState,
  isSavingPublishState,
}: FrontendWebsiteManagementSectionProps) {
  const { user } = useAuth();
  const { t, languages, currentLanguage } = useTranslation();
  const { branding } = useBranding();
  const { plans: publicPlans } = usePublicPlans();
  const { toast } = useToast();

  const appName = branding.appName || 'BotHive';
  const activeLanguages = useMemo(
    () => languages.filter((language) => language.isActive !== false),
    [languages]
  );
  const activeLocaleCodes = useMemo(
    () => activeLanguages.map((language) => language.code.toLowerCase()),
    [activeLanguages]
  );
  const defaultLocale =
    activeLanguages.find((language) => language.isDefault)?.code.toLowerCase() ||
    currentLanguage?.code.toLowerCase() ||
    activeLocaleCodes[0] ||
    'en';

  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [websiteDraft, setWebsiteDraft] = useState<FrontendWebsiteSettings>(() =>
    getDefaultWebsiteDraft(appName, defaultLocale)
  );
  const [mediaLibrary, setMediaLibrary] = useState<FrontendWebsiteMediaLibrary>({ assets: [] });
  const [fieldErrors, setFieldErrors] = useState<ValidationFieldErrors>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && defaultLocale) {
      setSelectedLocale(defaultLocale);
    }
  }, [defaultLocale, initialized]);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: FRONTEND_WEBSITE_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/admin/settings/frontend-website', { credentials: 'include' });
      if (!res.ok) {
        let message = res.statusText || 'Failed to fetch frontend website settings';
        try {
          const body = await res.json();
          message = body.error || body.message || message;
        } catch {
          // Response body is not JSON; keep statusText fallback
        }
        throw new Error(`${res.status}: ${message}`);
      }
      return res.json();
    },
    enabled: !!user?.isSuperAdmin,
  });

  useEffect(() => {
    if (!data || initialized) {
      return;
    }

    const normalized = normalizeWebsiteResponse(data, appName, defaultLocale);
    setWebsiteDraft(normalized.settings);
    setMediaLibrary(normalized.mediaLibrary);
    setInitialized(true);

    const firstLocale =
      normalized.settings.localizedContent[defaultLocale]
        ? defaultLocale
        : Object.keys(normalized.settings.localizedContent)[0] || defaultLocale;
    setSelectedLocale(firstLocale);
  }, [appName, data, defaultLocale, initialized]);

  const saveMutation = useMutation({
    mutationFn: async (draft: FrontendWebsiteSettings) => {
      const payload = buildSavePayload(draft);
      const res = await apiRequest('PUT', '/api/admin/settings/frontend-website', payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save frontend website settings');
      }
      return res.json() as Promise<{ settings: FrontendWebsiteSettings }>;
    },
    onSuccess: (result) => {
      setWebsiteDraft(result.settings);
      setFieldErrors({});
      queryClient.invalidateQueries({ queryKey: FRONTEND_WEBSITE_SETTINGS_QUERY_KEY });
      toast({
        title: t('ui.common.success', 'Success'),
        description: t(
          'admin.settings.frontend_website.saved',
          'Frontend website settings saved successfully'
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ui.common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!user?.isSuperAdmin) {
    return null;
  }

  const handleLocaleChange = (locale: string) => {
    setSelectedLocale(locale);
    setWebsiteDraft((current) => ensureLocaleContent(current, locale, appName));
  };

  const updateLocaleContent = (
    locale: string,
    patch: Partial<(typeof websiteDraft.localizedContent)[string]>
  ) => {
    setWebsiteDraft((current) => {
      const next = ensureLocaleContent(current, locale, appName);
      return {
        ...next,
        localizedContent: {
          ...next.localizedContent,
          [locale]: {
            ...next.localizedContent[locale],
            ...patch,
          },
        },
      };
    });
  };

  const handleSave = () => {
    const validSubscriptionPlanIds = publicPlans.map((plan) => plan.id);
    const errors = validateWebsiteDraft(
      websiteDraft,
      mediaLibrary,
      activeLocaleCodes,
      defaultLocale,
      validSubscriptionPlanIds
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: t('admin.settings.frontend_website.validation_failed', 'Validation failed'),
        description: t(
          'admin.settings.frontend_website.validation_failed_description',
          'Fix the highlighted issues before saving.'
        ),
        variant: 'destructive',
      });
      return;
    }

    saveMutation.mutate(websiteDraft);

    if (frontendWebsiteEnabled !== persistedFrontendWebsiteEnabled) {
      onSavePublishState();
    }
  };

  const isSaving = saveMutation.isPending || isSavingPublishState;

  const localeContent = websiteDraft.localizedContent[selectedLocale];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              {t('admin.settings.frontend_website.title', 'Frontend Website')}
            </CardTitle>
            <CardDescription>
              {t(
                'admin.settings.frontend_website.description',
                'Manage public website content, navigation, media assets, and page references.'
              )}
            </CardDescription>
            {websiteDraft.updatedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('admin.settings.frontend_website.last_updated', 'Last updated')}:{' '}
                {new Date(websiteDraft.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedLocale} onValueChange={handleLocaleChange}>
              <SelectTrigger data-tour="components-settings-frontendwebsitemanagementsection.selecttrigger.admin.settings.frontend_website.content_locale" className="w-[180px]">
                <SelectValue placeholder={t('admin.settings.frontend_website.content_locale', 'Content locale')} />
              </SelectTrigger>
              <SelectContent>
                {activeLanguages.map((language) => (
                  <SelectItem key={language.code} value={language.code.toLowerCase()}>
                    {language.nativeName || language.name} ({language.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button data-tour="components-settings-frontendwebsitemanagementsection.button.admin.settings.frontend_website.save" onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('admin.settings.frontend_website.save', 'Save Website Settings')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {Object.keys(fieldErrors).length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              {t(
                'admin.settings.frontend_website.validation_summary',
                'Some fields need attention before saving.'
              )}
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(fieldErrors).map(([key, messages]) => (
                  <li key={key}>
                    <span className="font-medium">{key}</span>: {messages.join('; ')}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {loadError instanceof Error
                ? loadError.message
                : t(
                    'admin.settings.frontend_website.load_error',
                    'Failed to load frontend website settings.'
                  )}
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-6">
            <TabsList>
              <TabsTrigger icon={TabIconInfo} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.overview" value="overview">{t('admin.settings.frontend_website.tab.overview', 'Overview')}</TabsTrigger>
              <TabsTrigger icon={TabIconPanelTop} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.header" value="header">{t('admin.settings.frontend_website.tab.header', 'Header')}</TabsTrigger>
              <TabsTrigger icon={TabIconPanelsTopLeft} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.sections" value="sections">{t('admin.settings.frontend_website.tab.sections', 'Sections')}</TabsTrigger>
              <TabsTrigger icon={TabIconHouse} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.homepage" value="homepage">{t('admin.settings.frontend_website.tab.homepage', 'Homepage')}</TabsTrigger>
              <TabsTrigger icon={TabIconSearch} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.seo" value="seo">{t('admin.settings.frontend_website.tab.seo', 'SEO')}</TabsTrigger>
              <TabsTrigger icon={TabIconCircleHelp} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.faq" value="faq">{t('admin.settings.frontend_website.tab.faq', 'FAQ')}</TabsTrigger>
              <TabsTrigger icon={TabIconBadgeDollarSign} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.pricing" value="pricing">{t('admin.settings.frontend_website.tab.pricing', 'Pricing')}</TabsTrigger>
              <TabsTrigger icon={TabIconPanelBottom} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.footer" value="footer">{t('admin.settings.frontend_website.tab.footer', 'Footer')}</TabsTrigger>
              <TabsTrigger icon={TabIconFiles} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.pages" value="pages">{t('admin.settings.frontend_website.tab.pages', 'Pages')}</TabsTrigger>
              <TabsTrigger data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.media" value="media">
                <ImageIcon className="mr-1 h-4 w-4" />
                {t('admin.settings.frontend_website.tab.media', 'Media')}
              </TabsTrigger>
              <TabsTrigger icon={TabIconSlidersHorizontal} data-tour="components-settings-frontendwebsitemanagementsection.tabstrigger.advanced" value="advanced">{t('admin.settings.frontend_website.tab.advanced', 'Advanced')}</TabsTrigger>
            </TabsList>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.overview" value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.frontend_website.overview_title', 'Website status')}</CardTitle>
                  <CardDescription>
                    {t(
                      'admin.settings.frontend_website.overview_description',
                      'Quick overview of publish state and useful links.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {frontendWebsiteEnabled
                          ? t('admin.settings.frontend_website.status_enabled', 'Public website enabled')
                          : t('admin.settings.frontend_website.status_disabled', 'Public website disabled')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'admin.settings.frontend_website.status_hint',
                          'Use the switch below to publish or unpublish the public website, then click Save Website Settings.'
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label htmlFor="frontend-website-publish" className="sr-only">
                        {t('admin.settings.frontend_website.publish_toggle_label', 'Enable public website')}
                      </Label>
                      <Switch
                        id="frontend-website-publish"
                        checked={frontendWebsiteEnabled}
                        onCheckedChange={onFrontendWebsiteEnabledChange}
                      />
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button data-tour="components-settings-frontendwebsitemanagementsection.button.admin.settings.frontend_website.preview_landing" type="button" variant="outline" asChild>
                      <a href="/landing" target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t('admin.settings.frontend_website.preview_landing', 'Preview /landing')}
                      </a>
                    </Button>
                    <Button data-tour="components-settings-frontendwebsitemanagementsection.button.admin.settings.frontend_website.open_media" type="button" variant="outline" onClick={() => setActiveSubTab('media')}>
                      {t('admin.settings.frontend_website.open_media', 'Open media library')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.header" value="header">
              <HeaderNavEditor
                header={websiteDraft.header}
                mediaLibrary={mediaLibrary}
                fieldErrors={fieldErrors}
                onChange={(header) => setWebsiteDraft((current) => ({ ...current, header }))}
                onLibraryUpdated={setMediaLibrary}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.sections" value="sections">
              <SectionVisibilityEditor websiteDraft={websiteDraft} onChange={setWebsiteDraft} />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.homepage" value="homepage">
              {localeContent ? (
                <HomepageLocaleEditor
                  locale={selectedLocale}
                  homepage={localeContent.homepage}
                  mediaLibrary={mediaLibrary}
                  fieldErrors={fieldErrors}
                  onChange={(homepage) => updateLocaleContent(selectedLocale, { homepage })}
                  onLibraryUpdated={setMediaLibrary}
                />
              ) : null}
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.seo" value="seo">
              <SeoEditor
                locale={selectedLocale}
                seo={localeContent?.seo}
                mediaLibrary={mediaLibrary}
                fieldErrors={fieldErrors}
                onChange={(seo) => updateLocaleContent(selectedLocale, { seo })}
                onLibraryUpdated={setMediaLibrary}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.faq" value="faq">
              <FaqEditor
                locale={selectedLocale}
                faq={localeContent?.faq}
                fieldErrors={fieldErrors}
                onChange={(faq) => updateLocaleContent(selectedLocale, { faq })}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.pricing" value="pricing">
              <PricingEditor
                locale={selectedLocale}
                pricing={localeContent?.pricing}
                fieldErrors={fieldErrors}
                onChange={(pricing) => updateLocaleContent(selectedLocale, { pricing })}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.footer" value="footer">
              <FooterEditor
                footer={websiteDraft.footer}
                pages={websiteDraft.pages}
                fieldErrors={fieldErrors}
                onChange={(footer) => setWebsiteDraft((current) => ({ ...current, footer }))}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.pages" value="pages">
              <ManagedPagesEditor
                pages={websiteDraft.pages}
                selectedLocale={selectedLocale}
                mediaLibrary={mediaLibrary}
                fieldErrors={fieldErrors}
                onChange={(pages) => setWebsiteDraft((current) => ({ ...current, pages }))}
                onLibraryUpdated={setMediaLibrary}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.media" value="media">
              <MediaLibraryPanel
                mediaLibrary={mediaLibrary}
                websiteDraft={websiteDraft}
                onLibraryUpdated={setMediaLibrary}
              />
            </TabsContent>

            <TabsContent data-tour="components-settings-frontendwebsitemanagementsection.tabscontent.advanced" value="advanced">
              <AdvancedEditor
                customCss={websiteDraft.customCss}
                customJs={websiteDraft.customJs}
                onChange={({ customCss, customJs }) =>
                  setWebsiteDraft((current) => ({ ...current, customCss, customJs }))
                }
              />
              <div className="mt-6 flex justify-end">
                <Button data-tour="components-settings-frontendwebsitemanagementsection.button.admin.settings.frontend_website.save" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t('admin.settings.frontend_website.save', 'Save Website Settings')}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
