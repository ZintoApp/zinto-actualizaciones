import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import { Plus, Trash2 } from 'lucide-react';
import type { FrontendWebsitePageReference } from '@shared/frontend-website-settings';
import { createEmptyPageReference } from './helpers';

type PageReferencesEditorProps = {
  pageReferences: FrontendWebsitePageReference[];
  fieldErrors: Record<string, string[]>;
  onChange: (pageReferences: FrontendWebsitePageReference[]) => void;
};

export function PageReferencesEditor({
  pageReferences,
  fieldErrors,
  onChange,
}: PageReferencesEditorProps) {
  const { t } = useTranslation();

  const errorAt = (index: number, path: string) =>
    fieldErrors[`pageReferences.${index}.${path}`]?.[0];

  const updatePage = (index: number, patch: Partial<FrontendWebsitePageReference>) => {
    const next = pageReferences.map((page, i) => (i === index ? { ...page, ...patch } : page));
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>
              {t('admin.settings.frontend_website.page_references_title', 'Page References')}
            </CardTitle>
            <CardDescription>
              {t(
                'admin.settings.frontend_website.page_references_description',
                'Define legal and custom pages referenced by the public website footer and navigation.'
              )}
            </CardDescription>
          </div>
          <Button data-tour="components-settings-frontend-website-pagereferenceseditor.button.ui.common.add"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...pageReferences, createEmptyPageReference()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('ui.common.add', 'Add')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {pageReferences.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t(
              'admin.settings.frontend_website.page_references_empty',
              'No page references yet. Add one to link legal or custom pages.'
            )}
          </p>
        )}

        {pageReferences.map((page, index) => (
          <div key={page.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label>
                {t('admin.settings.frontend_website.page_reference', 'Page')} {index + 1}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(pageReferences.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.page_id', 'ID')}</Label>
                <Input data-tour="components-settings-frontend-website-pagereferenceseditor.input.admin.settings.frontend_website.page_id"
                  value={page.id}
                  onChange={(e) => updatePage(index, { id: e.target.value })}
                />
                {errorAt(index, 'id') && (
                  <p className="text-sm text-destructive">{errorAt(index, 'id')}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.page_slug', 'Slug')}</Label>
                <Input data-tour="components-settings-frontend-website-pagereferenceseditor.input.admin.settings.frontend_website.page_id"
                  value={page.slug}
                  onChange={(e) => updatePage(index, { slug: e.target.value })}
                />
                {errorAt(index, 'slug') && (
                  <p className="text-sm text-destructive">{errorAt(index, 'slug')}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.page_title', 'Title')}</Label>
                <Input data-tour="components-settings-frontend-website-pagereferenceseditor.input.admin.settings.frontend_website.page_title"
                  value={page.title}
                  onChange={(e) => updatePage(index, { title: e.target.value })}
                />
                {errorAt(index, 'title') && (
                  <p className="text-sm text-destructive">{errorAt(index, 'title')}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.page_type', 'Type')}</Label>
                <Select
                  value={page.type}
                  onValueChange={(value: 'legal' | 'custom') => updatePage(index, { type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legal">
                      {t('admin.settings.frontend_website.page_type_legal', 'Legal')}
                    </SelectItem>
                    <SelectItem value="custom">
                      {t('admin.settings.frontend_website.page_type_custom', 'Custom')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('admin.settings.frontend_website.page_href', 'URL or path')}</Label>
                <Input data-tour="components-settings-frontend-website-pagereferenceseditor.input.admin.settings.frontend_website.page_href"
                  value={page.href ?? ''}
                  onChange={(e) => updatePage(index, { href: e.target.value || undefined })}
                />
                {errorAt(index, 'href') && (
                  <p className="text-sm text-destructive">{errorAt(index, 'href')}</p>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <Label>{t('admin.settings.frontend_website.page_enabled', 'Enabled')}</Label>
                <Switch
                  checked={page.enabled !== false}
                  onCheckedChange={(checked) => updatePage(index, { enabled: checked })}
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
