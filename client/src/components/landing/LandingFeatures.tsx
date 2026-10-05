import type { PublicFrontendWebsiteHomepage } from '@shared/frontend-website-settings';
import { Card, CardContent } from '@/components/ui/card';
import { getLandingIcon } from './helpers';

interface LandingFeaturesProps {
  homepage: PublicFrontendWebsiteHomepage;
}

export function LandingFeatures({ homepage }: LandingFeaturesProps) {
  if (!homepage.features.length) {
    return null;
  }

  return (
    <section id="features" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            {homepage.featuresSectionTitle}
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            {homepage.featuresSectionSubtitle}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 features-grid">
          {homepage.features.map((feature) => {
            const Icon = getLandingIcon(feature.icon);
            return (
              <Card key={feature.title} className="feature-card p-6 hover:shadow-lg transition-shadow duration-300">
                <CardContent className="p-0">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
