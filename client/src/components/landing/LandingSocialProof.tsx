import type { PublicFrontendWebsiteHomepage } from '@shared/frontend-website-settings';

interface LandingSocialProofProps {
  homepage: PublicFrontendWebsiteHomepage;
}

const STAT_COLORS = ['text-primary', 'text-green-500', 'text-purple-500', 'text-orange-500'];

export function LandingSocialProof({ homepage }: LandingSocialProofProps) {
  if (!homepage.stats.length) {
    return null;
  }

  return (
    <section className="py-16 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-4">{homepage.socialProofTitle}</h2>
          <p className="text-muted-foreground">{homepage.socialProofSubtitle}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center stats-grid">
          {homepage.stats.map((stat, index) => (
            <div key={`${stat.label}-${index}`} className="stat-counter">
              <div className={`text-3xl font-bold mb-2 ${STAT_COLORS[index % STAT_COLORS.length]}`}>
                {stat.value}
              </div>
              <div className="text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
