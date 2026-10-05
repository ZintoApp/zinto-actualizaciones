import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import { Plus, Trash2 } from 'lucide-react';
import type { FrontendWebsiteFaqBlock } from '@shared/frontend-website-settings';
import { createDefaultFaqBlock, createEmptyFaqItem } from './helpers';

type FaqEditorProps = {
  locale: string;
  faq: FrontendWebsiteFaqBlock | undefined;
  fieldErrors: Record<string, string[]>;
  onChange: (faq: FrontendWebsiteFaqBlock | undefined) => void;
};

export function FaqEditor({ locale, faq, fieldErrors, onChange }: FaqEditorProps) {
  const { t } = useTranslation();
  const enabled = faq !== undefined;
  const currentFaq = faq ?? createDefaultFaqBlock();

  const errorAt = (path: string) => fieldErrors[`localizedContent.${locale}.faq.${path}`]?.[0];

  const updateFaq = (patch: Partial<FrontendWebsiteFaqBlock>) => {
    onChange({ ...currentFaq, ...patch });
  };

  const updateItem = (index: number, patch: Partial<(typeof currentFaq.items)[number]>) => {
    const items = currentFaq.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    updateFaq({ items });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('admin.settings.frontend_website.faq_title', 'FAQ Section')} ({locale})
        </CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.faq_description',
            'Configure frequently asked questions shown on the public homepage.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label>{t('admin.settings.frontend_website.enable_faq', 'Enable FAQ section')}</Label>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.settings.frontend_website.enable_faq_hint',
                'Show the FAQ block on the homepage for this locale.'
              )}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onChange(checked ? createDefaultFaqBlock() : undefined)}
          />
        </div>

        {enabled && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${locale}-faq-title`}>
                  {t('admin.settings.frontend_website.faq_block_title', 'Section title')}
                </Label>
                <Input data-tour="components-settings-frontend-website-faqeditor.input.admin.settings.frontend_website.faq_block_title"
                  id={`${locale}-faq-title`}
                  value={currentFaq.title}
                  onChange={(e) => updateFaq({ title: e.target.value })}
                />
                {errorAt('title') && <p className="text-sm text-destructive">{errorAt('title')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${locale}-faq-subtitle`}>
                  {t('admin.settings.frontend_website.faq_block_subtitle', 'Section subtitle')}
                </Label>
                <Input data-tour="components-settings-frontend-website-faqeditor.input.admin.settings.frontend_website.faq_block_title"
                  id={`${locale}-faq-subtitle`}
                  value={currentFaq.subtitle ?? ''}
                  onChange={(e) => updateFaq({ subtitle: e.target.value || undefined })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('admin.settings.frontend_website.faq_items', 'FAQ items')}</Label>
                <Button data-tour="components-settings-frontend-website-faqeditor.button.ui.common.add"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateFaq({ items: [...currentFaq.items, createEmptyFaqItem()] })}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t('ui.common.add', 'Add')}
                </Button>
              </div>

              {currentFaq.items.map((item, index) => (
                <div key={item.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <Label>
                      {t('admin.settings.frontend_website.faq_item', 'Item')} {index + 1}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateFaq({ items: currentFaq.items.filter((_, i) => i !== index) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.settings.frontend_website.faq_question', 'Question')}</Label>
                    <Input data-tour="components-settings-frontend-website-faqeditor.input.admin.settings.frontend_website.faq_item"
                      value={item.question}
                      onChange={(e) => updateItem(index, { question: e.target.value })}
                    />
                    {errorAt(`items.${index}.question`) && (
                      <p className="text-sm text-destructive">{errorAt(`items.${index}.question`)}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.settings.frontend_website.faq_answer', 'Answer')}</Label>
                    <Input data-tour="components-settings-frontend-website-faqeditor.input.admin.settings.frontend_website.faq_item"
                      value={item.answer}
                      onChange={(e) => updateItem(index, { answer: e.target.value })}
                    />
                    {errorAt(`items.${index}.answer`) && (
                      <p className="text-sm text-destructive">{errorAt(`items.${index}.answer`)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
