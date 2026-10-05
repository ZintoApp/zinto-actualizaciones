import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import { Plus, Trash2 } from 'lucide-react';
import type { FrontendWebsiteMediaLibrary } from '@shared/frontend-website-settings';
import type {
  LandingFeature,
  LandingFooterLink,
  LandingPageContent,
  LandingStat,
  LandingTestimonial,
} from '@shared/landing-page-content';
import { AssetPicker } from './AssetPicker';

type HomepageLocaleEditorProps = {
  locale: string;
  homepage: LandingPageContent;
  mediaLibrary: FrontendWebsiteMediaLibrary;
  fieldErrors: Record<string, string[]>;
  onChange: (homepage: LandingPageContent) => void;
  onLibraryUpdated: (library: FrontendWebsiteMediaLibrary) => void;
};

export function HomepageLocaleEditor({
  locale,
  homepage,
  mediaLibrary,
  fieldErrors,
  onChange,
  onLibraryUpdated,
}: HomepageLocaleEditorProps) {
  const { t } = useTranslation();

  const errorAt = (path: string) => fieldErrors[`localizedContent.${locale}.homepage.${path}`]?.[0];

  const updateField = <K extends keyof LandingPageContent>(key: K, value: LandingPageContent[K]) => {
    onChange({ ...homepage, [key]: value });
  };

  const updateTrustBadge = (key: keyof LandingPageContent['trustBadges'], value: string) => {
    onChange({
      ...homepage,
      trustBadges: { ...homepage.trustBadges, [key]: value },
    });
  };

  const updateHeroPreviewFallback = (
    key: keyof LandingPageContent['heroPreviewFallback'],
    value: string
  ) => {
    onChange({
      ...homepage,
      heroPreviewFallback: { ...homepage.heroPreviewFallback, [key]: value },
    });
  };

  const updateStat = (index: number, patch: Partial<LandingStat>) => {
    const stats = homepage.stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat));
    onChange({ ...homepage, stats });
  };

  const updateFeature = (index: number, patch: Partial<LandingFeature>) => {
    const features = homepage.features.map((feature, i) =>
      i === index ? { ...feature, ...patch } : feature
    );
    onChange({ ...homepage, features });
  };

  const updateTestimonial = (index: number, patch: Partial<LandingTestimonial>) => {
    const testimonials = homepage.testimonials.map((item, i) =>
      i === index ? { ...item, ...patch } : item
    );
    onChange({ ...homepage, testimonials });
  };

  const updateFooterLink = (
    section: 'product' | 'company' | 'support',
    index: number,
    patch: Partial<LandingFooterLink>
  ) => {
    const footerLinks = {
      ...homepage.footerLinks,
      [section]: homepage.footerLinks[section].map((link, i) =>
        i === index ? { ...link, ...patch } : link
      ),
    };
    onChange({ ...homepage, footerLinks });
  };

  const renderTextField = (
    id: string,
    label: string,
    value: string,
    onValueChange: (value: string) => void,
    errorPath?: string
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.value" id={id} value={value} onChange={(e) => onValueChange(e.target.value)} />
      {errorPath && errorAt(errorPath) && (
        <p className="text-sm text-destructive">{errorAt(errorPath)}</p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('admin.settings.frontend_website.homepage_title', 'Homepage Content')} ({locale})
        </CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.homepage_description',
            'Edit localized homepage sections, footer copy, and trust content for this language.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={['hero']} className="w-full">
          <AccordionItem value="hero">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_hero', 'Hero')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-hero-title`,
                t('admin.settings.frontend_website.hero_title', 'Hero title'),
                homepage.heroTitle,
                (value) => updateField('heroTitle', value),
                'heroTitle'
              )}
              {renderTextField(
                `${locale}-hero-subtitle`,
                t('admin.settings.frontend_website.hero_subtitle', 'Hero subtitle'),
                homepage.heroSubtitle,
                (value) => updateField('heroSubtitle', value),
                'heroSubtitle'
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {renderTextField(
                  `${locale}-hero-cta-primary`,
                  t('admin.settings.frontend_website.hero_cta_primary', 'Primary CTA text'),
                  homepage.heroCTAPrimaryText,
                  (value) => updateField('heroCTAPrimaryText', value),
                  'heroCTAPrimaryText'
                )}
                {renderTextField(
                  `${locale}-hero-cta-primary-href`,
                  t('admin.settings.frontend_website.hero_cta_primary_href', 'Primary CTA link'),
                  homepage.heroCTAPrimaryHref,
                  (value) => updateField('heroCTAPrimaryHref', value),
                  'heroCTAPrimaryHref'
                )}
                {renderTextField(
                  `${locale}-hero-cta-secondary`,
                  t('admin.settings.frontend_website.hero_cta_secondary', 'Secondary CTA text'),
                  homepage.heroCTASecondaryText,
                  (value) => updateField('heroCTASecondaryText', value),
                  'heroCTASecondaryText'
                )}
                {renderTextField(
                  `${locale}-hero-cta-secondary-href`,
                  t('admin.settings.frontend_website.hero_cta_secondary_href', 'Secondary CTA link'),
                  homepage.heroCTASecondaryHref,
                  (value) => updateField('heroCTASecondaryHref', value),
                  'heroCTASecondaryHref'
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <Label>{t('admin.settings.frontend_website.show_hero_image', 'Show hero image')}</Label>
                <Switch
                  checked={homepage.showHeroImage}
                  onCheckedChange={(checked) => updateField('showHeroImage', checked)}
                />
              </div>
              <AssetPicker
                label={t('admin.settings.frontend_website.hero_image', 'Hero image')}
                assetId={homepage.heroImageAssetId}
                mediaLibrary={mediaLibrary}
                onSelect={(assetId) => updateField('heroImageAssetId', assetId)}
                onLibraryUpdated={onLibraryUpdated}
                error={errorAt('heroImageAssetId')}
              />
              <div className="grid gap-4 md:grid-cols-2">
                {renderTextField(
                  `${locale}-hero-trust-businesses`,
                  t('admin.settings.frontend_website.hero_trust_businesses', 'Trust businesses text'),
                  homepage.heroTrustBusinessesText,
                  (value) => updateField('heroTrustBusinessesText', value)
                )}
                {renderTextField(
                  `${locale}-hero-trust-rating`,
                  t('admin.settings.frontend_website.hero_trust_rating', 'Trust rating text'),
                  homepage.heroTrustRatingText,
                  (value) => updateField('heroTrustRatingText', value)
                )}
              </div>
              {renderTextField(
                `${locale}-demo-placeholder`,
                t('admin.settings.frontend_website.demo_placeholder', 'Demo placeholder text'),
                homepage.demoPlaceholderText,
                (value) => updateField('demoPlaceholderText', value)
              )}
              <div className="space-y-3 rounded-lg border p-4">
                <Label>
                  {t(
                    'admin.settings.frontend_website.hero_preview_fallback',
                    'Hero preview fallback copy'
                  )}
                </Label>
                <div className="grid gap-4 md:grid-cols-2">
                  {renderTextField(
                    `${locale}-hero-preview-dashboard`,
                    t('admin.settings.frontend_website.hero_preview_dashboard', 'Dashboard label'),
                    homepage.heroPreviewFallback.dashboardLabel,
                    (value) => updateHeroPreviewFallback('dashboardLabel', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-analytics`,
                    t('admin.settings.frontend_website.hero_preview_analytics', 'Analytics title'),
                    homepage.heroPreviewFallback.analyticsTitle,
                    (value) => updateHeroPreviewFallback('analyticsTitle', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-msg1-channel`,
                    t('admin.settings.frontend_website.hero_preview_msg1_channel', 'Message 1 channel'),
                    homepage.heroPreviewFallback.message1Channel,
                    (value) => updateHeroPreviewFallback('message1Channel', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-msg1-text`,
                    t('admin.settings.frontend_website.hero_preview_msg1_text', 'Message 1 text'),
                    homepage.heroPreviewFallback.message1Text,
                    (value) => updateHeroPreviewFallback('message1Text', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-msg1-time`,
                    t('admin.settings.frontend_website.hero_preview_msg1_time', 'Message 1 time'),
                    homepage.heroPreviewFallback.message1Time,
                    (value) => updateHeroPreviewFallback('message1Time', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-msg2-channel`,
                    t('admin.settings.frontend_website.hero_preview_msg2_channel', 'Message 2 channel'),
                    homepage.heroPreviewFallback.message2Channel,
                    (value) => updateHeroPreviewFallback('message2Channel', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-msg2-text`,
                    t('admin.settings.frontend_website.hero_preview_msg2_text', 'Message 2 text'),
                    homepage.heroPreviewFallback.message2Text,
                    (value) => updateHeroPreviewFallback('message2Text', value)
                  )}
                  {renderTextField(
                    `${locale}-hero-preview-msg2-time`,
                    t('admin.settings.frontend_website.hero_preview_msg2_time', 'Message 2 time'),
                    homepage.heroPreviewFallback.message2Time,
                    (value) => updateHeroPreviewFallback('message2Time', value)
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="features">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_features', 'Features')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-features-title`,
                t('admin.settings.frontend_website.features_title', 'Features section title'),
                homepage.featuresSectionTitle,
                (value) => updateField('featuresSectionTitle', value)
              )}
              {renderTextField(
                `${locale}-features-subtitle`,
                t('admin.settings.frontend_website.features_subtitle', 'Features section subtitle'),
                homepage.featuresSectionSubtitle,
                (value) => updateField('featuresSectionSubtitle', value)
              )}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('admin.settings.frontend_website.feature_items', 'Feature items')}</Label>
                  <Button data-tour="components-settings-frontend-website-homepagelocaleeditor.button.ui.common.add"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...homepage,
                        features: [
                          ...homepage.features,
                          { title: '', description: '', icon: 'Star' },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t('ui.common.add', 'Add')}
                  </Button>
                </div>
                {homepage.features.map((feature, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label>{t('admin.settings.frontend_website.feature_title', 'Title')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.feature_title"
                        value={feature.title}
                        onChange={(e) => updateFeature(index, { title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>{t('admin.settings.frontend_website.feature_description', 'Description')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.feature_title"
                        value={feature.description}
                        onChange={(e) => updateFeature(index, { description: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label>{t('admin.settings.frontend_website.feature_icon', 'Icon name')}</Label>
                        <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.feature_icon"
                          value={feature.icon}
                          onChange={(e) => updateFeature(index, { icon: e.target.value })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onChange({
                            ...homepage,
                            features: homepage.features.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="social-proof">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_social_proof', 'Social proof')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-social-proof-title`,
                t('admin.settings.frontend_website.social_proof_title', 'Social proof title'),
                homepage.socialProofTitle,
                (value) => updateField('socialProofTitle', value)
              )}
              {renderTextField(
                `${locale}-social-proof-subtitle`,
                t('admin.settings.frontend_website.social_proof_subtitle', 'Social proof subtitle'),
                homepage.socialProofSubtitle,
                (value) => updateField('socialProofSubtitle', value)
              )}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('admin.settings.frontend_website.stats', 'Stats')}</Label>
                  <Button data-tour="components-settings-frontend-website-homepagelocaleeditor.button.ui.common.add"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...homepage,
                        stats: [...homepage.stats, { value: '', label: '' }],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t('ui.common.add', 'Add')}
                  </Button>
                </div>
                {homepage.stats.map((stat, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>{t('admin.settings.frontend_website.stat_value', 'Value')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.stat_value"
                        value={stat.value}
                        onChange={(e) => updateStat(index, { value: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('admin.settings.frontend_website.stat_label', 'Label')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.stat_value"
                        value={stat.label}
                        onChange={(e) => updateStat(index, { label: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onChange({
                            ...homepage,
                            stats: homepage.stats.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="testimonials">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_testimonials', 'Testimonials')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-testimonials-title`,
                t('admin.settings.frontend_website.testimonials_title', 'Testimonials section title'),
                homepage.testimonialsSectionTitle,
                (value) => updateField('testimonialsSectionTitle', value)
              )}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('admin.settings.frontend_website.testimonial_items', 'Testimonials')}</Label>
                  <Button data-tour="components-settings-frontend-website-homepagelocaleeditor.button.ui.common.add"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...homepage,
                        testimonials: [
                          ...homepage.testimonials,
                          { name: '', company: '', text: '', rating: 5 },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t('ui.common.add', 'Add')}
                  </Button>
                </div>
                {homepage.testimonials.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>{t('admin.settings.frontend_website.testimonial_name', 'Name')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.testimonial_name"
                        value={item.name}
                        onChange={(e) => updateTestimonial(index, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('admin.settings.frontend_website.testimonial_company', 'Company')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.testimonial_name"
                        value={item.company}
                        onChange={(e) => updateTestimonial(index, { company: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>{t('admin.settings.frontend_website.testimonial_text', 'Quote')}</Label>
                      <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.testimonial_name"
                        value={item.text}
                        onChange={(e) => updateTestimonial(index, { text: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="space-y-1">
                        <Label>{t('admin.settings.frontend_website.testimonial_rating', 'Rating (1-5)')}</Label>
                        <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.testimonial_rating"
                          type="number"
                          min={1}
                          max={5}
                          value={item.rating}
                          onChange={(e) =>
                            updateTestimonial(index, {
                              rating: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onChange({
                            ...homepage,
                            testimonials: homepage.testimonials.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="cta">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_cta', 'Call to action')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-cta-title`,
                t('admin.settings.frontend_website.cta_title', 'CTA title'),
                homepage.ctaTitle,
                (value) => updateField('ctaTitle', value)
              )}
              {renderTextField(
                `${locale}-cta-subtitle`,
                t('admin.settings.frontend_website.cta_subtitle', 'CTA subtitle'),
                homepage.ctaSubtitle,
                (value) => updateField('ctaSubtitle', value)
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {renderTextField(
                  `${locale}-cta-primary`,
                  t('admin.settings.frontend_website.cta_primary', 'Primary button text'),
                  homepage.ctaPrimaryText,
                  (value) => updateField('ctaPrimaryText', value)
                )}
                {renderTextField(
                  `${locale}-cta-primary-href`,
                  t('admin.settings.frontend_website.cta_primary_href', 'Primary button link'),
                  homepage.ctaPrimaryHref,
                  (value) => updateField('ctaPrimaryHref', value),
                  'ctaPrimaryHref'
                )}
                {renderTextField(
                  `${locale}-cta-secondary`,
                  t('admin.settings.frontend_website.cta_secondary', 'Secondary button text'),
                  homepage.ctaSecondaryText,
                  (value) => updateField('ctaSecondaryText', value)
                )}
                {renderTextField(
                  `${locale}-cta-secondary-href`,
                  t('admin.settings.frontend_website.cta_secondary_href', 'Secondary button link'),
                  homepage.ctaSecondaryHref,
                  (value) => updateField('ctaSecondaryHref', value),
                  'ctaSecondaryHref'
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="trust-badges">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_trust_badges', 'Trust badges')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-trust-security`,
                t('admin.settings.frontend_website.trust_security', 'Enterprise security'),
                homepage.trustBadges.enterpriseSecurity,
                (value) => updateTrustBadge('enterpriseSecurity', value)
              )}
              {renderTextField(
                `${locale}-trust-uptime`,
                t('admin.settings.frontend_website.trust_uptime', 'Uptime'),
                homepage.trustBadges.uptime,
                (value) => updateTrustBadge('uptime', value)
              )}
              {renderTextField(
                `${locale}-trust-soc2`,
                t('admin.settings.frontend_website.trust_soc2', 'SOC 2 compliant'),
                homepage.trustBadges.soc2Compliant,
                (value) => updateTrustBadge('soc2Compliant', value)
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="footer-copy">
            <AccordionTrigger>
              {t('admin.settings.frontend_website.section_footer_copy', 'Localized footer copy')}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {renderTextField(
                `${locale}-footer-description`,
                t('admin.settings.frontend_website.footer_description', 'Footer description'),
                homepage.footerDescription,
                (value) => updateField('footerDescription', value)
              )}
              <div className="grid gap-4 md:grid-cols-3">
                {renderTextField(
                  `${locale}-footer-product-heading`,
                  t('admin.settings.frontend_website.footer_product_heading', 'Product heading'),
                  homepage.footerProductHeading,
                  (value) => updateField('footerProductHeading', value)
                )}
                {renderTextField(
                  `${locale}-footer-company-heading`,
                  t('admin.settings.frontend_website.footer_company_heading', 'Company heading'),
                  homepage.footerCompanyHeading,
                  (value) => updateField('footerCompanyHeading', value)
                )}
                {renderTextField(
                  `${locale}-footer-support-heading`,
                  t('admin.settings.frontend_website.footer_support_heading', 'Support heading'),
                  homepage.footerSupportHeading,
                  (value) => updateField('footerSupportHeading', value)
                )}
              </div>
              {renderTextField(
                `${locale}-copyright`,
                t('admin.settings.frontend_website.copyright_text', 'Copyright text'),
                homepage.copyrightText,
                (value) => updateField('copyrightText', value)
              )}

              <p className="text-sm text-muted-foreground">
                {t(
                  'admin.settings.frontend_website.legal_links_managed_hint',
                  'Legal links are managed from Footer settings using legal pages. Legacy homepage legal links are no longer editable here.'
                )}
              </p>

              {(['product', 'company', 'support'] as const).map((section) => (
                <FooterLinkSection
                  key={section}
                  title={t(
                    `admin.settings.frontend_website.footer_links_${section}`,
                    `${section.charAt(0).toUpperCase()}${section.slice(1)} links`
                  )}
                  links={homepage.footerLinks[section]}
                  errorAt={(index, field) =>
                    errorAt(`footerLinks.${section}.${index}.${field}`)
                  }
                  onAdd={() =>
                    onChange({
                      ...homepage,
                      footerLinks: {
                        ...homepage.footerLinks,
                        [section]: [...homepage.footerLinks[section], { label: '', href: '#' }],
                      },
                    })
                  }
                  onUpdate={(index, patch) => updateFooterLink(section, index, patch)}
                  onRemove={(index) =>
                    onChange({
                      ...homepage,
                      footerLinks: {
                        ...homepage.footerLinks,
                        [section]: homepage.footerLinks[section].filter((_, i) => i !== index),
                      },
                    })
                  }
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

type FooterLinkSectionProps = {
  title: string;
  links: LandingFooterLink[];
  errorAt: (index: number, field: keyof LandingFooterLink) => string | undefined;
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<LandingFooterLink>) => void;
  onRemove: (index: number) => void;
};

function FooterLinkSection({ title, links, errorAt, onAdd, onUpdate, onRemove }: FooterLinkSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <Button data-tour="components-settings-frontend-website-homepagelocaleeditor.button.ui.common.add" type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {t('ui.common.add', 'Add')}
        </Button>
      </div>
      {links.map((link, index) => (
        <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>{t('admin.settings.frontend_website.link_label', 'Label')}</Label>
            <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.link_label" value={link.label} onChange={(e) => onUpdate(index, { label: e.target.value })} />
            {errorAt(index, 'label') && (
              <p className="text-sm text-destructive">{errorAt(index, 'label')}</p>
            )}
          </div>
          <div className="space-y-1 md:col-span-2">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label>{t('admin.settings.frontend_website.link_href', 'URL or path')}</Label>
                <Input data-tour="components-settings-frontend-website-homepagelocaleeditor.input.admin.settings.frontend_website.link_href" value={link.href} onChange={(e) => onUpdate(index, { href: e.target.value })} />
                {errorAt(index, 'href') && (
                  <p className="text-sm text-destructive">{errorAt(index, 'href')}</p>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
