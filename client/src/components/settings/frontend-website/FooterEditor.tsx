import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import { Info, Plus, Trash2 } from 'lucide-react';
import type {
  FrontendWebsiteFooter,
  FrontendWebsiteManagedPage,
} from '@shared/frontend-website-settings';
import { createEmptyNavLink } from './helpers';

type FooterEditorProps = {
  footer: FrontendWebsiteFooter;
  pages: FrontendWebsiteManagedPage[];
  fieldErrors: Record<string, string[]>;
  onChange: (footer: FrontendWebsiteFooter) => void;
};

export function FooterEditor({ footer, pages, fieldErrors, onChange }: FooterEditorProps) {
  const { t } = useTranslation();

  const updateCustomLink = (index: number, patch: Partial<(typeof footer.customLinks)[number]>) => {
    const customLinks = footer.customLinks.map((link, i) =>
      i === index ? { ...link, ...patch } : link
    );
    onChange({ ...footer, customLinks });
  };

  const toggleLegalPageId = (pageId: string, checked: boolean) => {
    const legalPageIds = checked
      ? [...footer.legalPageIds, pageId]
      : footer.legalPageIds.filter((id) => id !== pageId);
    onChange({ ...footer, legalPageIds });
  };

  const legalPages = pages.filter((page) => page.type === 'legal');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.settings.frontend_website.footer_title', 'Footer')}</CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.footer_description',
            'Configure global footer links and social settings shared across all locales.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {t(
              'admin.settings.frontend_website.footer_localized_note',
              'Localized footer headings, descriptions, and column links are edited in the Homepage Content editor for each language.'
            )}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label>{t('admin.settings.frontend_website.show_social_links', 'Show social links')}</Label>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.settings.frontend_website.show_social_links_hint',
                'Display social profile links in the global footer.'
              )}
            </p>
          </div>
          <Switch
            checked={footer.showSocialLinks}
            onCheckedChange={(checked) => onChange({ ...footer, showSocialLinks: checked })}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="footer-twitter">
              {t('admin.settings.frontend_website.social_twitter', 'Twitter / X URL')}
            </Label>
            <Input data-tour="components-settings-frontend-website-footereditor.input.footer-twitter"
              id="footer-twitter"
              value={footer.socialLinks.twitter}
              onChange={(e) =>
                onChange({
                  ...footer,
                  socialLinks: { ...footer.socialLinks, twitter: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-linkedin">
              {t('admin.settings.frontend_website.social_linkedin', 'LinkedIn URL')}
            </Label>
            <Input data-tour="components-settings-frontend-website-footereditor.input.footer-linkedin"
              id="footer-linkedin"
              value={footer.socialLinks.linkedin}
              onChange={(e) =>
                onChange({
                  ...footer,
                  socialLinks: { ...footer.socialLinks, linkedin: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-facebook">
              {t('admin.settings.frontend_website.social_facebook', 'Facebook URL')}
            </Label>
            <Input data-tour="components-settings-frontend-website-footereditor.input.footer-facebook"
              id="footer-facebook"
              value={footer.socialLinks.facebook}
              onChange={(e) =>
                onChange({
                  ...footer,
                  socialLinks: { ...footer.socialLinks, facebook: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label>{t('admin.settings.frontend_website.legal_pages', 'Legal pages')}</Label>
          <p className="text-sm text-muted-foreground">
            {t(
              'admin.settings.frontend_website.legal_pages_hint',
              'Select legal pages to show in the footer.'
            )}
          </p>
          {legalPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.settings.frontend_website.no_legal_pages',
                'No legal pages defined yet. Add legal pages in the Pages tab.'
              )}
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border p-4">
              {legalPages.map((page) => {
                const title =
                  page.localizedContent[Object.keys(page.localizedContent)[0]]?.title ||
                  page.slug ||
                  page.id;
                return (
                  <div key={page.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`legal-page-${page.id}`}
                      checked={footer.legalPageIds.includes(page.id)}
                      onCheckedChange={(checked) => toggleLegalPageId(page.id, checked === true)}
                    />
                    <Label htmlFor={`legal-page-${page.id}`} className="font-normal">
                      {title}
                    </Label>
                  </div>
                );
              })}
            </div>
          )}
          {fieldErrors['footer.legalPageIds']?.[0] && (
            <p className="text-sm text-destructive">{fieldErrors['footer.legalPageIds'][0]}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('admin.settings.frontend_website.custom_footer_links', 'Custom footer links')}</Label>
            <Button data-tour="components-settings-frontend-website-footereditor.button.ui.common.add"
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({ ...footer, customLinks: [...footer.customLinks, createEmptyNavLink()] })
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('ui.common.add', 'Add')}
            </Button>
          </div>

          {footer.customLinks.map((link, index) => (
            <div key={link.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.link_label', 'Label')}</Label>
                <Input data-tour="components-settings-frontend-website-footereditor.input.admin.settings.frontend_website.link_label"
                  value={link.label}
                  onChange={(e) => updateCustomLink(index, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t('admin.settings.frontend_website.link_href', 'URL or path')}</Label>
                <Input data-tour="components-settings-frontend-website-footereditor.input.admin.settings.frontend_website.link_label"
                  value={link.href}
                  onChange={(e) => updateCustomLink(index, { href: e.target.value })}
                />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!link.openInNewTab}
                    onCheckedChange={(checked) => updateCustomLink(index, { openInNewTab: checked })}
                  />
                  <Label>{t('admin.settings.frontend_website.open_new_tab', 'New tab')}</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...footer,
                      customLinks: footer.customLinks.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
