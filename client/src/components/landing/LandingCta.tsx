import { ArrowRight, Shield, Clock, Award } from 'lucide-react';
import type { PublicFrontendWebsiteHomepage } from '@shared/frontend-website-settings';
import { Button } from '@/components/ui/button';

interface LandingCtaProps {
  homepage: PublicFrontendWebsiteHomepage;
}

export function LandingCta({ homepage }: LandingCtaProps) {
  const ctaPrimaryHref = homepage.ctaPrimaryHref || '/register';
  const ctaSecondaryHref = homepage.ctaSecondaryHref || '/auth';

  return (
    <section className="section-padding cta-gradient">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl lg:text-4xl font-bold text-primary-foreground mb-6">
          {homepage.ctaTitle}
        </h2>
        <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
          {homepage.ctaSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center cta-buttons">
          <Button
            size="lg"
            className="bg-background text-primary hover:bg-background/90 px-8 py-4 text-lg"
            asChild
          >
            <a href={ctaPrimaryHref}>
              {homepage.ctaPrimaryText} <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="cta-sign-in-btn border-primary-foreground text-primary-foreground hover:bg-background hover:text-primary px-8 py-4 text-lg bg-transparent"
            asChild
          >
            <a href={ctaSecondaryHref}>{homepage.ctaSecondaryText}</a>
          </Button>
        </div>

        <div className="mt-12 flex flex-wrap justify-center items-center gap-8 opacity-80">
          <div className="flex items-center text-primary-foreground trust-badge">
            <Shield className="w-5 h-5 mr-2" />
            <span className="text-sm">{homepage.trustBadges.enterpriseSecurity}</span>
          </div>
          <div className="flex items-center text-primary-foreground trust-badge">
            <Clock className="w-5 h-5 mr-2" />
            <span className="text-sm">{homepage.trustBadges.uptime}</span>
          </div>
          <div className="flex items-center text-primary-foreground trust-badge">
            <Award className="w-5 h-5 mr-2" />
            <span className="text-sm">{homepage.trustBadges.soc2Compliant}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
