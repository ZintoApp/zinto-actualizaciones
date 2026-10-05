import { Loader2, CheckCircle } from 'lucide-react';
import type { FrontendWebsitePricingBlock } from '@shared/frontend-website-settings';
import type { PublicPlan } from '@/hooks/use-public-plans';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PriceDisplay } from '@/components/ui/price-display';
import { getPlanBillingPeriod } from '@/utils/plan-duration';

interface LandingPricingProps {
  pricingContent?: FrontendWebsitePricingBlock;
  plans: PublicPlan[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  showSection: boolean;
}

function findPricingOverlay(
  pricingContent: FrontendWebsitePricingBlock | undefined,
  plan: PublicPlan
) {
  return pricingContent?.plans.find((entry) => entry.subscriptionPlanId === plan.id);
}

function resolveVisiblePricingPlans(
  pricingContent: FrontendWebsitePricingBlock | undefined,
  publicPlans: PublicPlan[]
): { visiblePlans: PublicPlan[]; useOverlayFallback: boolean } {
  const configuredOverlays = (pricingContent?.plans ?? []).filter(
    (entry) => entry.subscriptionPlanId > 0
  );

  if (configuredOverlays.length === 0) {
    return { visiblePlans: publicPlans, useOverlayFallback: false };
  }

  const publicPlanById = new Map(publicPlans.map((plan) => [plan.id, plan]));
  const overlayMatchedPlans = configuredOverlays
    .map((overlay) => publicPlanById.get(overlay.subscriptionPlanId))
    .filter((plan): plan is PublicPlan => plan !== undefined);

  if (overlayMatchedPlans.length === 0) {
    return { visiblePlans: publicPlans, useOverlayFallback: true };
  }

  return { visiblePlans: overlayMatchedPlans, useOverlayFallback: false };
}

export function LandingPricing({
  pricingContent,
  plans,
  isLoading,
  error,
  onRetry,
  showSection,
}: LandingPricingProps) {
  const { t } = useTranslation();

  if (!showSection) {
    return null;
  }

  const title = pricingContent?.title ?? t('landing.pricing.title', 'Simple, transparent pricing');
  const subtitle =
    pricingContent?.subtitle ??
    t(
      'landing.pricing.subtitle',
      'Choose the perfect plan for your business. Start free, upgrade when you need more.'
    );

  const { visiblePlans, useOverlayFallback } = resolveVisiblePricingPlans(pricingContent, plans);

  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">{title}</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">{subtitle}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              {t('landing.pricing.loading', 'Loading pricing plans...')}
            </span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">
              {t('landing.pricing.error', 'Failed to load pricing plans')}
            </p>
            <Button onClick={onRetry} variant="outline">
              {t('landing.pricing.retry', 'Retry')}
            </Button>
          </div>
        ) : visiblePlans.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t('landing.pricing.no_plans', 'No pricing plans are currently available.')}
            </p>
          </div>
        ) : (
          <>
            {useOverlayFallback && (
              <p className="text-center text-sm text-muted-foreground mb-8">
                {t(
                  'landing.pricing.stale_overlay_fallback',
                  'Configured pricing overlays are outdated. Showing current subscription plans.'
                )}
              </p>
            )}
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto pricing-grid">
            {visiblePlans.map((plan) => {
              const configPlan = findPricingOverlay(pricingContent, plan);
              const isPopular = configPlan?.highlighted === true;
              const ctaHref = configPlan?.ctaHref ?? '/register';
              const ctaText =
                configPlan?.ctaText ??
                (plan.isFree
                  ? t('landing.pricing.get_started_free', 'Get Started Free')
                  : plan.hasTrialPeriod
                    ? t('landing.pricing.start_trial', 'Start {{days}}-Day Free Trial', {
                        days: plan.trialDays,
                      })
                    : t('landing.pricing.get_started', 'Get Started'));
              const displayName = configPlan?.name?.trim() || plan.name;
              const displayDescription = configPlan?.description?.trim() || plan.description;
              const customFeatures = (configPlan?.features ?? []).filter((feature) => feature.trim());
              const useCustomFeatures = customFeatures.length > 0;

              return (
                <Card
                  key={plan.id}
                  className={`pricing-card p-8 hover:shadow-lg transition-shadow duration-300 ${
                    isPopular ? 'popular border-2 border-primary relative' : ''
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                        {t('landing.pricing.most_popular', 'Most Popular')}
                      </span>
                    </div>
                  )}
                  <CardContent className="p-0">
                    <div className="text-center">
                      <h3 className="text-xl font-semibold text-foreground mb-2">{displayName}</h3>
                      {displayDescription && (
                        <p className="text-sm text-muted-foreground mb-4">{displayDescription}</p>
                      )}
                      <div className="mb-6">
                        {plan.price === 0 ? (
                          <div>
                            <div className="text-4xl font-bold text-foreground mb-1">
                              {t('landing.pricing.free', 'Free')}
                            </div>
                            <div className="text-muted-foreground">
                              {t('landing.pricing.forever', 'forever')}
                            </div>
                          </div>
                        ) : (
                          <PriceDisplay
                            plan={plan as Parameters<typeof PriceDisplay>[0]['plan']}
                            size="xl"
                            showDiscountBadge={true}
                            showSavings={true}
                            layout="vertical"
                            period={getPlanBillingPeriod(plan)}
                            className="justify-center items-center"
                          />
                        )}
                      </div>
                      <Button
                        className="w-full mb-6"
                        variant={isPopular || plan.isFree ? 'brand' : 'outline'}
                        asChild
                      >
                        <a href={ctaHref}>{ctaText}</a>
                      </Button>
                    </div>
                    <ul className="space-y-3">
                      {useCustomFeatures ? (
                        customFeatures.map((feature, featureIndex) => (
                          <li key={featureIndex} className="flex items-center">
                            <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))
                      ) : (
                        <>
                          <li className="flex items-center">
                            <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                            <span className="text-muted-foreground">
                              {t('landing.pricing.users', 'Up to {{count}} users', { count: plan.maxUsers })}
                            </span>
                          </li>
                          <li className="flex items-center">
                            <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                            <span className="text-muted-foreground">
                              {t('landing.pricing.contacts', '{{count}} contacts', {
                                count: plan.maxContacts.toLocaleString(),
                              })}
                            </span>
                          </li>
                          <li className="flex items-center">
                            <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                            <span className="text-muted-foreground">
                              {t('landing.pricing.channels', '{{count}} channels', {
                                count: plan.maxChannels,
                              })}
                            </span>
                          </li>
                          <li className="flex items-center">
                            <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                            <span className="text-muted-foreground">
                              {t('landing.pricing.flows', '{{count}} flows', { count: plan.maxFlows })}
                            </span>
                          </li>
                          {plan.features.map((feature, featureIndex) => (
                            <li key={featureIndex} className="flex items-center">
                              <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                              <span className="text-muted-foreground">{feature}</span>
                            </li>
                          ))}
                        </>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          </>
        )}
      </div>
    </section>
  );
}
