import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import { usePublicPlans } from '@/hooks/use-public-plans';
import { Plus, Trash2 } from 'lucide-react';
import type { FrontendWebsitePricingBlock } from '@shared/frontend-website-settings';
import { createDefaultPricingBlock, createEmptyPricingPlan } from './helpers';

type PricingEditorProps = {
  locale: string;
  pricing: FrontendWebsitePricingBlock | undefined;
  fieldErrors: Record<string, string[]>;
  onChange: (pricing: FrontendWebsitePricingBlock | undefined) => void;
};

export function PricingEditor({ locale, pricing, fieldErrors, onChange }: PricingEditorProps) {
  const { t } = useTranslation();
  const { plans: subscriptionPlans, isLoading: plansLoading } = usePublicPlans();
  const enabled = pricing !== undefined;
  const currentPricing = pricing ?? createDefaultPricingBlock();

  const errorAt = (path: string) =>
    fieldErrors[`localizedContent.${locale}.pricing.${path}`]?.[0];

  const updatePricing = (patch: Partial<FrontendWebsitePricingBlock>) => {
    onChange({ ...currentPricing, ...patch });
  };

  const updatePlan = (index: number, patch: Partial<(typeof currentPricing.plans)[number]>) => {
    const plans = currentPricing.plans.map((plan, i) => (i === index ? { ...plan, ...patch } : plan));
    updatePricing({ plans });
  };

  const updatePlanFeature = (planIndex: number, featureIndex: number, value: string) => {
    const plan = currentPricing.plans[planIndex];
    const features = plan.features.map((feature, i) => (i === featureIndex ? value : feature));
    updatePlan(planIndex, { features });
  };

  const usedSubscriptionPlanIds = new Set(
    currentPricing.plans
      .map((plan) => plan.subscriptionPlanId)
      .filter((planId) => planId > 0)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('admin.settings.frontend_website.pricing_title', 'Pricing Section')} ({locale})
        </CardTitle>
        <CardDescription>
          {t(
            'admin.settings.frontend_website.pricing_description',
            'Configure pricing overlay copy for subscription plans displayed on the public homepage.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label>{t('admin.settings.frontend_website.enable_pricing', 'Enable pricing section')}</Label>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.settings.frontend_website.enable_pricing_hint',
                'Show the pricing block on the homepage for this locale.'
              )}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onChange(checked ? createDefaultPricingBlock() : undefined)}
          />
        </div>

        {enabled && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${locale}-pricing-title`}>
                  {t('admin.settings.frontend_website.pricing_block_title', 'Section title')}
                </Label>
                <Input data-tour="components-settings-frontend-website-pricingeditor.input.admin.settings.frontend_website.pricing_block_title"
                  id={`${locale}-pricing-title`}
                  value={currentPricing.title}
                  onChange={(e) => updatePricing({ title: e.target.value })}
                />
                {errorAt('title') && <p className="text-sm text-destructive">{errorAt('title')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${locale}-pricing-subtitle`}>
                  {t('admin.settings.frontend_website.pricing_block_subtitle', 'Section subtitle')}
                </Label>
                <Input data-tour="components-settings-frontend-website-pricingeditor.input.admin.settings.frontend_website.pricing_block_title"
                  id={`${locale}-pricing-subtitle`}
                  value={currentPricing.subtitle ?? ''}
                  onChange={(e) => updatePricing({ subtitle: e.target.value || undefined })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('admin.settings.frontend_website.pricing_plans', 'Plan overlays')}</Label>
                <Button data-tour="components-settings-frontend-website-pricingeditor.button.ui.common.add"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updatePricing({ plans: [...currentPricing.plans, createEmptyPricingPlan()] })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t('ui.common.add', 'Add')}
                </Button>
              </div>

              {currentPricing.plans.map((plan, planIndex) => {
                const linkedPlan = subscriptionPlans.find(
                  (subscriptionPlan) => subscriptionPlan.id === plan.subscriptionPlanId
                );

                return (
                  <div key={plan.id} className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <Label>
                        {t('admin.settings.frontend_website.pricing_plan', 'Plan overlay')} {planIndex + 1}
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updatePricing({
                            plans: currentPricing.plans.filter((_, i) => i !== planIndex),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>{t('admin.settings.frontend_website.subscription_plan', 'Subscription plan')}</Label>
                        <Select
                          value={plan.subscriptionPlanId > 0 ? String(plan.subscriptionPlanId) : ''}
                          onValueChange={(value) =>
                            updatePlan(planIndex, { subscriptionPlanId: parseInt(value, 10) || 0 })
                          }
                          disabled={plansLoading}
                        >
                          <SelectTrigger data-tour="components-settings-frontend-website-pricingeditor.selecttrigger.admin.settings.frontend_website.select_subscription_plan">
                            <SelectValue
                              placeholder={t(
                                'admin.settings.frontend_website.select_subscription_plan',
                                'Select a subscription plan'
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {subscriptionPlans.map((subscriptionPlan) => (
                              <SelectItem
                                key={subscriptionPlan.id}
                                value={String(subscriptionPlan.id)}
                                disabled={
                                  usedSubscriptionPlanIds.has(subscriptionPlan.id) &&
                                  subscriptionPlan.id !== plan.subscriptionPlanId
                                }
                              >
                                {subscriptionPlan.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errorAt(`plans.${planIndex}.subscriptionPlanId`) && (
                          <p className="text-sm text-destructive">
                            {errorAt(`plans.${planIndex}.subscriptionPlanId`)}
                          </p>
                        )}
                        {plan.subscriptionPlanId > 0 && !linkedPlan && !plansLoading && (
                          <p className="text-sm text-destructive">
                            {t(
                              'admin.settings.frontend_website.invalid_subscription_plan',
                              'This subscription plan is no longer available. Select a current public plan.'
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label>{t('admin.settings.frontend_website.plan_name_override', 'Name override')}</Label>
                        <Input data-tour="components-settings-frontend-website-pricingeditor.input.admin.settings.frontend_website.subscription_plan"
                          value={plan.name ?? ''}
                          onChange={(e) => updatePlan(planIndex, { name: e.target.value || undefined })}
                          placeholder={linkedPlan?.name ?? ''}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>{t('admin.settings.frontend_website.plan_description', 'Description')}</Label>
                      <Input data-tour="components-settings-frontend-website-pricingeditor.input.admin.settings.frontend_website.pricing_plan"
                        value={plan.description ?? ''}
                        onChange={(e) => updatePlan(planIndex, { description: e.target.value || undefined })}
                        placeholder={linkedPlan?.description ?? ''}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>{t('admin.settings.frontend_website.plan_cta_text', 'CTA text')}</Label>
                        <Input data-tour="components-settings-frontend-website-pricingeditor.input.admin.settings.frontend_website.plan_cta_text"
                          value={plan.ctaText}
                          onChange={(e) => updatePlan(planIndex, { ctaText: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label>{t('admin.settings.frontend_website.plan_cta_href', 'CTA URL or path')}</Label>
                        <Input data-tour="components-settings-frontend-website-pricingeditor.input.admin.settings.frontend_website.plan_cta_text"
                          value={plan.ctaHref}
                          onChange={(e) => updatePlan(planIndex, { ctaHref: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <Label>{t('admin.settings.frontend_website.plan_highlighted', 'Highlight plan')}</Label>
                      <Switch
                        checked={!!plan.highlighted}
                        onCheckedChange={(checked) => updatePlan(planIndex, { highlighted: checked })}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>{t('admin.settings.frontend_website.plan_features', 'Feature bullets')}</Label>
                        <Button data-tour="components-settings-frontend-website-pricingeditor.button.ui.common.add"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updatePlan(planIndex, { features: [...plan.features, ''] })
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t('ui.common.add', 'Add')}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'admin.settings.frontend_website.plan_features_hint',
                          'When provided, these bullets replace the default plan limit list on the landing page.'
                        )}
                      </p>
                      {plan.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-center gap-2">
                          <Input data-tour="components-settings-frontend-website-pricingeditor.input.feature"
                            value={feature}
                            onChange={(e) => updatePlanFeature(planIndex, featureIndex, e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updatePlan(planIndex, {
                                features: plan.features.filter((_, i) => i !== featureIndex),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
