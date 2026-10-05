import type { FrontendWebsiteFaqBlock } from '@shared/frontend-website-settings';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface LandingFaqProps {
  faq?: FrontendWebsiteFaqBlock;
}

export function LandingFaq({ faq }: LandingFaqProps) {
  if (!faq?.items.length) {
    return null;
  }

  return (
    <section id="faq" className="py-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">{faq.title}</h2>
          {faq.subtitle && <p className="text-xl text-muted-foreground">{faq.subtitle}</p>}
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faq.items.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="text-left text-foreground">{item.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
