import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import {
  ArrowRight,
  Mail,
  Play,
  Star,
  TrendingUp,
} from 'lucide-react';
import type { PublicFrontendWebsiteHomepage } from '@shared/frontend-website-settings';
import { Button } from '@/components/ui/button';

interface LandingHeroProps {
  homepage: PublicFrontendWebsiteHomepage;
}

export function LandingHero({ homepage }: LandingHeroProps) {
  const showImage = homepage.showHeroImage && homepage.heroImageUrl;
  const preview = homepage.heroPreviewFallback;
  const heroPrimaryHref = homepage.heroCTAPrimaryHref || '/register';
  const heroSecondaryHref = homepage.heroCTASecondaryHref || '#demo';

  return (
    <section className="relative hero-gradient section-padding">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center hero-grid">
          <div className="text-center lg:text-left hero-content">
            <h1 className="hero-title text-4xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
              {homepage.heroTitle}
            </h1>
            <p className="hero-subtitle text-xl text-muted-foreground mb-8 max-w-2xl">
              {homepage.heroSubtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start cta-buttons">
              <Button size="lg" className="btn-primary" variant="brand" asChild>
                <a href={heroPrimaryHref}>
                  {homepage.heroCTAPrimaryText} <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg" asChild>
                <a href={heroSecondaryHref} className="flex items-center">
                  <Play className="mr-2 h-5 w-5" />
                  {homepage.heroCTASecondaryText}
                </a>
              </Button>
            </div>

            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-8">
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 bg-primary rounded-full border-2 border-background" />
                  <div className="w-8 h-8 bg-green-500 rounded-full border-2 border-background" />
                  <div className="w-8 h-8 bg-purple-500 rounded-full border-2 border-background" />
                  <div className="w-8 h-8 bg-orange-500 rounded-full border-2 border-background" />
                </div>
                <span className="ml-3 text-sm text-muted-foreground">
                  {homepage.heroTrustBusinessesText}
                </span>
              </div>
              <div className="flex items-center">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <span className="ml-2 text-sm text-muted-foreground">
                  {homepage.heroTrustRatingText}
                </span>
              </div>
            </div>
          </div>

          <div className="relative hero-image" id="demo">
            {showImage ? (
              <div className="glass-card rounded-2xl shadow-2xl overflow-hidden dashboard-preview">
                <img
                  src={homepage.heroImageUrl}
                  alt={homepage.heroTitle}
                  className="w-full h-auto object-cover"
                />
              </div>
            ) : (
              <div className="glass-card rounded-2xl shadow-2xl p-6 transform rotate-3 dashboard-preview">
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full" />
                      <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                    </div>
                    <div className="text-xs text-muted-foreground">{preview.dashboardLabel}</div>
                  </div>

                  <div className="bg-card rounded-lg p-4 mb-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground">{preview.analyticsTitle}</h3>
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-end space-x-1 h-20">
                      {[40, 60, 30, 80, 50, 90, 70].map((height, i) => (
                        <div
                          key={i}
                          className="bg-primary rounded-t"
                          style={{ height: `${height}%`, width: '12px' }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-card rounded-lg p-3 flex items-center space-x-3 border border-border">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <InboxConversationIcon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-muted-foreground">{preview.message1Channel}</div>
                        <div className="text-sm text-foreground">{preview.message1Text}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{preview.message1Time}</div>
                    </div>
                    <div className="bg-card rounded-lg p-3 flex items-center space-x-3 border border-border">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <Mail className="w-4 h-4 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-muted-foreground">{preview.message2Channel}</div>
                        <div className="text-sm text-foreground">{preview.message2Text}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{preview.message2Time}</div>
                    </div>
                  </div>

                  {homepage.demoPlaceholderText && (
                    <p className="text-center text-sm text-muted-foreground mt-4">
                      {homepage.demoPlaceholderText}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
