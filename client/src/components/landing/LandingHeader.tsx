import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { PublicFrontendWebsiteHeader } from '@shared/frontend-website-settings';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { renderIdentifiableLink, resolveFrontendWebsiteNavHref } from './helpers';

interface LandingHeaderProps {
  header: PublicFrontendWebsiteHeader;
  managedPageSlugs?: string[];
}

export function LandingHeader({ header, managedPageSlugs = [] }: LandingHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            {header.logoUrl ? (
              <img src={header.logoUrl} alt={header.siteName} className="h-8 w-auto" />
            ) : (
              <div className="flex items-center">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">
                    {header.siteName.charAt(0)}
                  </span>
                </div>
                <span className="ml-2 text-xl font-bold text-foreground">{header.siteName}</span>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {header.navLinks.map((link) => {
              const href = resolveFrontendWebsiteNavHref(link.href, managedPageSlugs);
              return (
                <a
                  key={link.id}
                  href={href}
                  className="nav-link text-muted-foreground hover:text-foreground transition-colors"
                  {...(link.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {link.label}
                </a>
              );
            })}
            {header.showThemeToggle && <ThemeToggle variant="compact" />}
            {header.showLanguageSwitcher && <LanguageSwitcher variant="compact" />}
            <Button variant="ghost" asChild>
              <a href="/auth">Sign In</a>
            </Button>
            {header.ctaButton ? (
              <Button variant="brand" asChild>
                <a {...renderIdentifiableLink(header.ctaButton)}>{header.ctaButton.label}</a>
              </Button>
            ) : (
              <Button variant="brand" asChild>
                <a href="/register">Get Started</a>
              </Button>
            )}
          </div>

          <div className="md:hidden flex items-center gap-1">
            {header.showThemeToggle && <ThemeToggle variant="compact" />}
            {header.showLanguageSwitcher && <LanguageSwitcher variant="compact" />}
            <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border py-4 mobile-menu">
            <div className="flex flex-col space-y-4">
              {header.navLinks.map((link) => {
                const href = resolveFrontendWebsiteNavHref(link.href, managedPageSlugs);
                return (
                  <a
                    key={link.id}
                    href={href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    {...(link.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {link.label}
                  </a>
                );
              })}
              <div className="flex flex-col space-y-2 pt-4 border-t border-border">
                <Button variant="ghost" asChild>
                  <a href="/auth">Sign In</a>
                </Button>
                {header.ctaButton ? (
                  <Button variant="brand" asChild>
                    <a {...renderIdentifiableLink(header.ctaButton)}>{header.ctaButton.label}</a>
                  </Button>
                ) : (
                  <Button variant="brand" asChild>
                    <a href="/register">Get Started</a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
