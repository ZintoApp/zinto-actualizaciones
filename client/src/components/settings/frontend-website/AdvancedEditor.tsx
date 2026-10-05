import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { AlertTriangle, Code, Paintbrush } from 'lucide-react';
import type { FrontendWebsiteSettings } from '@shared/frontend-website-settings';

type AdvancedEditorProps = {
  customCss: FrontendWebsiteSettings['customCss'];
  customJs: FrontendWebsiteSettings['customJs'];
  onChange: (patch: Pick<FrontendWebsiteSettings, 'customCss' | 'customJs'>) => void;
};

export function AdvancedEditor({ customCss, customJs, onChange }: AdvancedEditorProps) {
  const { t } = useTranslation();

  const updateCustomCss = (patch: Partial<FrontendWebsiteSettings['customCss']>) => {
    onChange({
      customCss: { ...customCss, ...patch },
      customJs,
    });
  };

  const updateCustomJs = (patch: Partial<FrontendWebsiteSettings['customJs']>) => {
    onChange({
      customCss,
      customJs: { ...customJs, ...patch },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paintbrush className="h-5 w-5" />
            {t('admin.settings.frontend_website.custom_css_title', 'Custom CSS')}
          </CardTitle>
          <CardDescription>
            {t(
              'admin.settings.frontend_website.custom_css_description',
              'Inject custom CSS styles into the public frontend website.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label className="text-base font-medium">
                {t('admin.settings.custom_css_page.enable_label', 'Enable Custom CSS')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  'admin.settings.custom_css_page.enable_hint',
                  'Toggle to enable or disable custom CSS injection globally'
                )}
              </p>
            </div>
            <Switch
              checked={customCss.enabled}
              onCheckedChange={(checked) => updateCustomCss({ enabled: checked })}
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="frontend-custom-css" className="text-base font-medium">
              {t('admin.settings.custom_css_page.editor_heading', 'Custom CSS')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.settings.frontend_website.custom_css_hint',
                'Paste CSS scoped to the public website. Styles are injected into the page head when enabled.'
              )}
            </p>
            <Textarea data-tour="components-settings-frontend-website-advancededitor.textarea.frontend-custom-css"
              id="frontend-custom-css"
              placeholder={`Example:
.landing-hero {
  padding-top: 4rem;
}`}
              value={customCss.css}
              onChange={(e) =>
                updateCustomCss({
                  css: e.target.value,
                  lastModified: new Date().toISOString(),
                })
              }
              className="min-h-[200px] font-mono text-sm"
              disabled={!customCss.enabled}
            />
          </div>

          {customCss.lastModified && (
            <div className="text-sm text-muted-foreground">
              {t('admin.settings.custom_css_page.last_modified', 'Last modified: {{date}}', {
                date: new Date(customCss.lastModified).toLocaleString(),
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            {t('admin.settings.frontend_website.custom_js_title', 'Custom JavaScript')}
          </CardTitle>
          <CardDescription>
            {t(
              'admin.settings.frontend_website.custom_js_description',
              'Inject custom JavaScript into the public frontend website.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/20">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {t('settings.custom_js_warning_title', 'Security warning')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'admin.settings.frontend_website.custom_js_warning',
                'Only add JavaScript from trusted sources. Custom scripts run on all public website pages when enabled.'
              )}
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label className="text-base font-medium">
                {t('settings.enable_custom_js', 'Enable Custom JavaScript')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  'admin.settings.frontend_website.custom_js_enable_hint',
                  'Toggle to enable or disable custom JavaScript on the public website.'
                )}
              </p>
            </div>
            <Switch
              checked={customJs.enabled}
              onCheckedChange={(checked) => updateCustomJs({ enabled: checked })}
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="frontend-custom-js" className="text-base font-medium">
              {t('settings.custom_js', 'Custom JavaScript')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.settings.frontend_website.custom_js_hint',
                'Paste raw JavaScript or a trusted embed snippet. The saved value is loaded on public pages only.'
              )}
            </p>
            <Textarea data-tour="components-settings-frontend-website-advancededitor.textarea.frontend-custom-js"
              id="frontend-custom-js"
              placeholder={`Example:
window.addEventListener('load', () => {
  console.log('Frontend website custom JavaScript loaded');
});`}
              value={customJs.js}
              onChange={(e) =>
                updateCustomJs({
                  js: e.target.value,
                  lastModified: new Date().toISOString(),
                })
              }
              className="min-h-[200px] font-mono text-sm"
              disabled={!customJs.enabled}
            />
          </div>

          {customJs.lastModified && (
            <div className="text-sm text-muted-foreground">
              {t('settings.last_modified', 'Last modified')}:{' '}
              {new Date(customJs.lastModified).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
