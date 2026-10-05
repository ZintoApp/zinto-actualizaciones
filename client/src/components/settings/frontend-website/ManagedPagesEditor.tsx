import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/hooks/use-translation';
import { WysiwygEditor } from '@/components/ui/wysiwyg-editor';
import { AssetPicker } from './AssetPicker';
import {
  Eye,
  FileText,
  Globe,
  Plus,
  Settings,
  Trash2,
  FileText as TabIconFileText,
} from 'lucide-react';
import type {
  FrontendWebsiteManagedPage,
  FrontendWebsiteMediaLibrary,
  FrontendWebsitePageLocaleContent,
  FrontendWebsitePageSeo,
  FrontendWebsitePageTemplateKey,
} from '@shared/frontend-website-settings';
import {
  FRONTEND_WEBSITE_MEDIA_UPLOAD_URL,
  createEmptyManagedPage,
  createManagedPageFromTemplate,
  ensurePageLocaleContent,
  normalizeFrontendWebsiteManagedPageSlug,
  slugifyFrontendWebsitePageTitle,
} from './helpers';

type ManagedPagesEditorProps = {
  pages: FrontendWebsiteManagedPage[];
  selectedLocale: string;
  mediaLibrary: FrontendWebsiteMediaLibrary;
  fieldErrors: Record<string, string[]>;
  onChange: (pages: FrontendWebsiteManagedPage[]) => void;
  onLibraryUpdated: (library: FrontendWebsiteMediaLibrary) => void;
};

const TEMPLATE_OPTIONS: Array<{ key: FrontendWebsitePageTemplateKey; label: string }> = [
  { key: 'privacy-policy', label: 'Privacy Policy' },
  { key: 'terms-of-service', label: 'Terms of Service' },
  { key: 'about', label: 'About' },
  { key: 'contact', label: 'Contact' },
];

export function ManagedPagesEditor({
  pages,
  selectedLocale,
  mediaLibrary,
  fieldErrors,
  onChange,
  onLibraryUpdated,
}: ManagedPagesEditorProps) {
  const { t } = useTranslation();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(pages[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState('content');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<FrontendWebsitePageTemplateKey | null>(null);

  const sortedPages = useMemo(
    () => [...pages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [pages]
  );

  const selectedPage = sortedPages.find((page) => page.id === selectedPageId) ?? null;
  const localeContent = selectedPage?.localizedContent[selectedLocale];

  useEffect(() => {
    if (!selectedPageId && sortedPages.length > 0) {
      setSelectedPageId(sortedPages[0].id);
    } else if (selectedPageId && !sortedPages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(sortedPages[0]?.id ?? null);
    }
  }, [selectedPageId, sortedPages]);

  const errorAt = (path: string) => fieldErrors[path]?.[0];

  const updatePages = (nextPages: FrontendWebsiteManagedPage[]) => {
    onChange(nextPages);
  };

  const updateSelectedPage = (patch: Partial<FrontendWebsiteManagedPage>) => {
    if (!selectedPage) return;
    updatePages(
      pages.map((page) =>
        page.id === selectedPage.id
          ? { ...page, ...patch, updatedAt: new Date().toISOString() }
          : page
      )
    );
  };

  const updateLocaleContent = (patch: Partial<FrontendWebsitePageLocaleContent>) => {
    if (!selectedPage) return;
    const page = ensurePageLocaleContent(selectedPage, selectedLocale);
    updatePages(
      pages.map((item) =>
        item.id === page.id
          ? {
              ...page,
              localizedContent: {
                ...page.localizedContent,
                [selectedLocale]: {
                  ...page.localizedContent[selectedLocale],
                  ...patch,
                },
              },
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );
  };

  const updateSeo = (patch: Partial<FrontendWebsitePageSeo>) => {
    if (!localeContent) return;
    updateLocaleContent({
      seo: { ...(localeContent.seo ?? {}), ...patch },
    });
  };

  const handleAddPage = () => {
    const page = createEmptyManagedPage(selectedLocale);
    updatePages([...pages, page]);
    setSelectedPageId(page.id);
    setActiveTab('content');
  };

  const handleAddFromTemplate = (templateKey: FrontendWebsitePageTemplateKey) => {
    const page = createManagedPageFromTemplate(templateKey, selectedLocale);
    updatePages([...pages, page]);
    setSelectedPageId(page.id);
    setActiveTab('content');
    setShowTemplateDialog(false);
    setPendingTemplate(null);
  };

  const handleDeletePage = (pageId: string) => {
    const next = pages.filter((page) => page.id !== pageId);
    updatePages(next);
    if (selectedPageId === pageId) {
      setSelectedPageId(next[0]?.id ?? null);
    }
  };

  const handleTitleChange = (title: string) => {
    updateLocaleContent({ title });
    if (selectedPage && !selectedPage.slug.trim()) {
      updateSelectedPage({ slug: slugifyFrontendWebsitePageTitle(title) });
    }
  };

  const seo = localeContent?.seo ?? {};

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {t('admin.settings.frontend_website.managed_pages', 'Managed Pages')}
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={handleAddPage}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            {t(
              'admin.settings.frontend_website.managed_pages_list_hint',
              'Legal and custom pages published at root paths like /privacy-policy.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedPages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('admin.settings.frontend_website.no_managed_pages', 'No pages yet.')}
            </p>
          )}
          {sortedPages.map((page) => {
            const title =
              page.localizedContent[selectedLocale]?.title ||
              page.localizedContent[Object.keys(page.localizedContent)[0]]?.title ||
              page.slug ||
              page.id;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => setSelectedPageId(page.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedPageId === page.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                }`}
              >
                <span className="truncate font-medium">{title}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {page.enabled === false ? 'draft' : page.type}
                </span>
              </button>
            );
          })}
          <Button data-tour="components-settings-frontend-website-managedpageseditor.button.admin.settings.frontend_website.add_from_template"
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowTemplateDialog(true)}
          >
            <FileText className="mr-1 h-4 w-4" />
            {t('admin.settings.frontend_website.add_from_template', 'Add from template')}
          </Button>
        </CardContent>
      </Card>

      {selectedPage ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>
                  {localeContent?.title ||
                    t('admin.settings.frontend_website.edit_page', 'Edit page')}
                </CardTitle>
                <CardDescription>/{selectedPage.slug || '…'}</CardDescription>
              </div>
              <div className="flex gap-2">
                {selectedPage.slug && (
                  <Button data-tour="components-settings-frontend-website-managedpageseditor.button.admin.settings.frontend_website.preview" type="button" variant="outline" size="sm" asChild>
                    <a href={`/${selectedPage.slug}`} target="_blank" rel="noreferrer">
                      <Eye className="mr-1 h-4 w-4" />
                      {t('admin.settings.frontend_website.preview', 'Preview')}
                    </a>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeletePage(selectedPage.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger icon={TabIconFileText} data-tour="components-settings-frontend-website-managedpageseditor.tabstrigger.content" value="content">
                  {t('admin.settings.frontend_website.tab_content', 'Content')}
                </TabsTrigger>
                <TabsTrigger data-tour="components-settings-frontend-website-managedpageseditor.tabstrigger.seo" value="seo">
                  <Globe className="mr-1 h-4 w-4" />
                  SEO
                </TabsTrigger>
                <TabsTrigger data-tour="components-settings-frontend-website-managedpageseditor.tabstrigger.advanced" value="advanced">
                  <Settings className="mr-1 h-4 w-4" />
                  {t('admin.settings.frontend_website.tab_advanced', 'Advanced')}
                </TabsTrigger>
                <TabsTrigger data-tour="components-settings-frontend-website-managedpageseditor.tabstrigger.preview" value="preview">
                  <Eye className="mr-1 h-4 w-4" />
                  {t('admin.settings.frontend_website.tab_preview', 'Preview')}
                </TabsTrigger>
              </TabsList>

              <TabsContent data-tour="components-settings-frontend-website-managedpageseditor.tabscontent.content" value="content" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('admin.settings.frontend_website.page_title', 'Title')}</Label>
                    <Input data-tour="components-settings-frontend-website-managedpageseditor.input.admin.settings.frontend_website.page_title"
                      value={localeContent?.title ?? ''}
                      onChange={(e) => handleTitleChange(e.target.value)}
                    />
                    {errorAt(`pages.${selectedPage.id}.localizedContent.${selectedLocale}.title`) && (
                      <p className="text-sm text-destructive">
                        {errorAt(`pages.${selectedPage.id}.localizedContent.${selectedLocale}.title`)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.settings.frontend_website.page_slug', 'Slug')}</Label>
                    <Input data-tour="components-settings-frontend-website-managedpageseditor.input.admin.settings.frontend_website.page_title"
                      value={selectedPage.slug}
                      onChange={(e) =>
                        updateSelectedPage({
                          slug: normalizeFrontendWebsiteManagedPageSlug(e.target.value),
                        })
                      }
                    />
                    {errorAt(`pages.${selectedPage.id}.slug`) && (
                      <p className="text-sm text-destructive">
                        {errorAt(`pages.${selectedPage.id}.slug`)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.settings.frontend_website.page_body', 'Page content')}</Label>
                  <WysiwygEditor
                    value={localeContent?.content ?? ''}
                    onChange={(content) => updateLocaleContent({ content })}
                    imageUploadUrl={FRONTEND_WEBSITE_MEDIA_UPLOAD_URL}
                  />
                </div>
              </TabsContent>

              <TabsContent data-tour="components-settings-frontend-website-managedpageseditor.tabscontent.seo" value="seo" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Meta title</Label>
                    <Input
                      value={seo.metaTitle ?? ''}
                      onChange={(e) => updateSeo({ metaTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Meta keywords</Label>
                    <Input
                      value={seo.metaKeywords ?? ''}
                      onChange={(e) => updateSeo({ metaKeywords: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Meta description</Label>
                  <Textarea
                    value={seo.metaDescription ?? ''}
                    onChange={(e) => updateSeo({ metaDescription: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>OG title</Label>
                    <Input
                      value={seo.ogTitle ?? ''}
                      onChange={(e) => updateSeo({ ogTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG description</Label>
                    <Input
                      value={seo.ogDescription ?? ''}
                      onChange={(e) => updateSeo({ ogDescription: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <AssetPicker
                    label="OG image"
                    assetId={seo.ogImageAssetId}
                    mediaLibrary={mediaLibrary}
                    onSelect={(assetId) => updateSeo({ ogImageAssetId: assetId })}
                    onLibraryUpdated={onLibraryUpdated}
                  />
                  <AssetPicker
                    label="Page favicon"
                    assetId={seo.faviconAssetId}
                    mediaLibrary={mediaLibrary}
                    onSelect={(assetId) => updateSeo({ faviconAssetId: assetId })}
                    onLibraryUpdated={onLibraryUpdated}
                  />
                </div>
              </TabsContent>

              <TabsContent data-tour="components-settings-frontend-website-managedpageseditor.tabscontent.advanced" value="advanced" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('admin.settings.frontend_website.page_type', 'Type')}</Label>
                    <Select
                      value={selectedPage.type}
                      onValueChange={(value: 'legal' | 'custom') =>
                        updateSelectedPage({ type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sort order</Label>
                    <Input data-tour="components-settings-frontend-website-managedpageseditor.input.admin.settings.frontend_website.page_type"
                      type="number"
                      value={selectedPage.sortOrder ?? 0}
                      onChange={(e) =>
                        updateSelectedPage({ sortOrder: parseInt(e.target.value, 10) || 0 })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <Label>{t('admin.settings.frontend_website.page_enabled', 'Published')}</Label>
                  <Switch
                    checked={selectedPage.enabled !== false}
                    onCheckedChange={(checked) => updateSelectedPage({ enabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <Label>Show in navigation hints</Label>
                  <Switch
                    checked={!!selectedPage.showInNav}
                    onCheckedChange={(checked) => updateSelectedPage({ showInNav: checked })}
                  />
                </div>
              </TabsContent>

              <TabsContent data-tour="components-settings-frontend-website-managedpageseditor.tabscontent.preview" value="preview" className="mt-4">
                <div className="rounded-lg border bg-background p-6">
                  <h1 className="mb-4 text-2xl font-bold">
                    {localeContent?.title || selectedPage.slug}
                  </h1>
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: localeContent?.content ?? '' }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex min-h-[300px] items-center justify-center text-muted-foreground">
            {t('admin.settings.frontend_website.select_page', 'Select or create a page to edit.')}
          </CardContent>
        </Card>
      )}

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent data-tour="components-settings-frontend-website-managedpageseditor.dialogcontent.admin.settings.frontend_website.add_from_template">
          <DialogHeader>
            <DialogTitle>
              {t('admin.settings.frontend_website.add_from_template', 'Add from template')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'admin.settings.frontend_website.template_description',
                'Choose a starter template for a common public page.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {TEMPLATE_OPTIONS.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => handleAddFromTemplate(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-frontend-website-managedpageseditor.button.ui.common.cancel" type="button" variant="ghost" onClick={() => setShowTemplateDialog(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
