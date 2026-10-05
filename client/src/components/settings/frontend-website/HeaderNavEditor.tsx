import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import { Plus, Trash2 } from 'lucide-react';
import type {
  FrontendWebsiteHeader,
  FrontendWebsiteMediaLibrary,
} from '@shared/frontend-website-settings';
import { createEmptyNavLink } from './helpers';
import { AssetPicker } from './AssetPicker';

type HeaderNavEditorProps = {
  header: FrontendWebsiteHeader;
  mediaLibrary: FrontendWebsiteMediaLibrary;
  fieldErrors: Record<string, string[]>;
  onChange: (header: FrontendWebsiteHeader) => void;
  onLibraryUpdated: (library: FrontendWebsiteMediaLibrary) => void;
};

export function HeaderNavEditor({
  header,
  mediaLibrary,
  fieldErrors,
  onChange,
  onLibraryUpdated,
}: HeaderNavEditorProps) {
  const { t } = useTranslation();

  const updateNavLink = (index: number, patch: Partial<(typeof header.navLinks)[number]>) => {
    const navLinks = header.navLinks.map((link, i) => (i === index ? { ...link, ...patch } : link));
    onChange({ ...header, navLinks });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.settings.frontend_website.header_title', 'Header & Navigation')}</CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.header_description',
            'Configure global header branding, navigation links, and call-to-action button.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <AssetPicker
            label={t('admin.settings.frontend_website.logo', 'Logo')}
            assetId={header.logoAssetId}
            mediaLibrary={mediaLibrary}
            onSelect={(assetId) => onChange({ ...header, logoAssetId: assetId })}
            onLibraryUpdated={onLibraryUpdated}
            error={fieldErrors['header.logoAssetId']?.[0]}
          />
          <AssetPicker
            label={t('admin.settings.frontend_website.favicon', 'Favicon')}
            assetId={header.faviconAssetId}
            mediaLibrary={mediaLibrary}
            onSelect={(assetId) => onChange({ ...header, faviconAssetId: assetId })}
            onLibraryUpdated={onLibraryUpdated}
            error={fieldErrors['header.faviconAssetId']?.[0]}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="site-name-override">
            {t('admin.settings.frontend_website.site_name_override', 'Site name override')}
          </Label>
          <Input data-tour="components-settings-frontend-website-headernaveditor.input.admin.settings.frontend_website.site_name_placeholder"
            id="site-name-override"
            value={header.siteNameOverride ?? ''}
            onChange={(e) => onChange({ ...header, siteNameOverride: e.target.value || undefined })}
            placeholder={t('admin.settings.frontend_website.site_name_placeholder', 'Leave empty to use app branding name')}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label>{t('admin.settings.frontend_website.show_theme_toggle', 'Show theme toggle')}</Label>
            </div>
            <Switch
              checked={header.showThemeToggle}
              onCheckedChange={(checked) => onChange({ ...header, showThemeToggle: checked })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label>{t('admin.settings.frontend_website.show_language_switcher', 'Show language switcher')}</Label>
            </div>
            <Switch
              checked={header.showLanguageSwitcher}
              onCheckedChange={(checked) => onChange({ ...header, showLanguageSwitcher: checked })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('admin.settings.frontend_website.nav_links', 'Navigation links')}</Label>
            <Button data-tour="components-settings-frontend-website-headernaveditor.button.ui.common.add"
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...header, navLinks: [...header.navLinks, createEmptyNavLink()] })}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('ui.common.add', 'Add')}
            </Button>
          </div>

          {header.navLinks.map((link, index) => (
            <div key={link.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.link_label', 'Label')}</Label>
                <Input data-tour="components-settings-frontend-website-headernaveditor.input.admin.settings.frontend_website.link_label" value={link.label} onChange={(e) => updateNavLink(index, { label: e.target.value })} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t('admin.settings.frontend_website.link_href', 'URL or path')}</Label>
                <Input data-tour="components-settings-frontend-website-headernaveditor.input.admin.settings.frontend_website.link_label" value={link.href} onChange={(e) => updateNavLink(index, { href: e.target.value })} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!link.openInNewTab}
                    onCheckedChange={(checked) => updateNavLink(index, { openInNewTab: checked })}
                  />
                  <Label>{t('admin.settings.frontend_website.open_new_tab', 'New tab')}</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({ ...header, navLinks: header.navLinks.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Label>{t('admin.settings.frontend_website.cta_button', 'Header CTA button')}</Label>
            <Switch
              checked={!!header.ctaButton}
              onCheckedChange={(checked) =>
                onChange({
                  ...header,
                  ctaButton: checked
                    ? { label: '', href: '/', openInNewTab: false }
                    : undefined,
                })
              }
            />
          </div>

          {header.ctaButton && (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.link_label', 'Label')}</Label>
                <Input data-tour="components-settings-frontend-website-headernaveditor.input.admin.settings.frontend_website.link_label"
                  value={header.ctaButton.label}
                  onChange={(e) =>
                    onChange({ ...header, ctaButton: { ...header.ctaButton!, label: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t('admin.settings.frontend_website.link_href', 'URL or path')}</Label>
                <Input data-tour="components-settings-frontend-website-headernaveditor.input.admin.settings.frontend_website.link_label"
                  value={header.ctaButton.href}
                  onChange={(e) =>
                    onChange({ ...header, ctaButton: { ...header.ctaButton!, href: e.target.value } })
                  }
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch
                  checked={!!header.ctaButton.openInNewTab}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...header,
                      ctaButton: { ...header.ctaButton!, openInNewTab: checked },
                    })
                  }
                />
                <Label>{t('admin.settings.frontend_website.open_new_tab', 'New tab')}</Label>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
