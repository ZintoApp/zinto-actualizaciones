import { Star } from 'lucide-react';
import type { PublicFrontendWebsiteHomepage } from '@shared/frontend-website-settings';
import { Card, CardContent } from '@/components/ui/card';

interface LandingTestimonialsProps {
  homepage: PublicFrontendWebsiteHomepage;
}

export function LandingTestimonials({ homepage }: LandingTestimonialsProps) {
  if (!homepage.testimonials.length) {
    return null;
  }

  return (
    <section id="testimonials" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            {homepage.testimonialsSectionTitle}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {homepage.testimonials.map((testimonial) => (
            <Card key={`${testimonial.name}-${testimonial.company}`} className="p-6">
              <CardContent className="p-0">
                <div className="flex text-yellow-400 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">&ldquo;{testimonial.text}&rdquo;</p>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.company}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
