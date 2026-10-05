import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import type { FrontendWebsiteSectionVisibility, FrontendWebsiteSettings } from '@shared/frontend-website-settings';
import { syncLegacyHomepageSectionVisibility } from './helpers';

type SectionVisibilityEditorProps = {
  websiteDraft: FrontendWebsiteSettings;
  onChange: (draft: FrontendWebsiteSettings) => void;
};

const SECTIONS: Array<{ key: keyof FrontendWebsiteSectionVisibility; label: string }> = [
  { key: 'hero', label: 'Hero' },
  { key: 'features', label: 'Features' },
  { key: 'socialProof', label: 'Social proof' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'faq', label: 'FAQ' },
  { key: 'cta', label: 'Call to action' },
];

export function SectionVisibilityEditor({ websiteDraft, onChange }: SectionVisibilityEditorProps) {
  const { t } = useTranslation();

  const updateVisibility = (key: keyof FrontendWebsiteSectionVisibility, checked: boolean) => {
    const nextVisibility = { ...websiteDraft.sectionVisibility, [key]: checked };
    onChange(syncLegacyHomepageSectionVisibility(websiteDraft, nextVisibility));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.settings.frontend_website.sections_title', 'Section Visibility')}</CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.sections_description',
            'Control which homepage sections are shown on the public website.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between rounded-lg border p-4">
            <Label>{label}</Label>
            <Switch
              checked={websiteDraft.sectionVisibility[key]}
              onCheckedChange={(checked) => updateVisibility(key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
