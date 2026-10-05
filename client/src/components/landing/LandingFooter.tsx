import { MessageSquare, Users, Mail } from 'lucide-react';
import type {
  FrontendWebsiteFooter,
  FrontendWebsitePageReference,
  PublicFrontendWebsiteHeader,
  PublicFrontendWebsiteHomepage,
} from '@shared/frontend-website-settings';
import { renderIdentifiableLink, resolveFrontendWebsiteNavHref } from './helpers';

interface LandingFooterProps {
  header: PublicFrontendWebsiteHeader;
  homepage?: Partial<PublicFrontendWebsiteHomepage>;
  footer: FrontendWebsiteFooter;
  pageReferences: FrontendWebsitePageReference[];
  managedPageSlugs?: string[];
}

export function LandingFooter({
  header,
  homepage = {},
  footer,
  pageReferences,
  managedPageSlugs = [],
}: LandingFooterProps) {
  const legalPages = pageReferences.filter((page) => footer.legalPageIds.includes(page.id));

  const socialEntries = [
    { key: 'twitter', url: footer.socialLinks.twitter, icon: MessageSquare },
    { key: 'linkedin', url: footer.socialLinks.linkedin, icon: Users },
    { key: 'facebook', url: footer.socialLinks.facebook, icon: Mail },
  ].filter((entry) => entry.url);

  const productLinks = homepage.footerLinks?.product ?? [];
  const companyLinks = homepage.footerLinks?.company ?? [];
  const supportLinks = [
    ...(homepage.footerLinks?.support ?? []),
    ...footer.customLinks.map((link) => ({ label: link.label, href: link.href, id: link.id })),
  ];
  const legacyLegalLinks =
    legalPages.length > 0 ? [] : (homepage.legalLinks ?? []);
  const hasLegalLinks = legacyLegalLinks.length > 0 || legalPages.length > 0;

  return (
    <footer className="bg-card border-t border-border text-foreground py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8 footer-grid">
          <div className="md:col-span-1">
            <div className="flex items-center mb-4">
              {header.logoUrl ? (
                <img src={header.logoUrl} alt={header.siteName} className="h-8 w-auto" />
              ) : (
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-sm">
                      {header.siteName.charAt(0)}
                    </span>
                  </div>
                  <span className="ml-2 text-xl font-bold">{header.siteName}</span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground mb-4">{homepage.footerDescription ?? ''}</p>
            {footer.showSocialLinks && socialEntries.length > 0 && (
              <div className="flex space-x-4">
                {socialEntries.map(({ key, url, icon: Icon }) => (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {productLinks.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">{homepage.footerProductHeading ?? ''}</h3>
              <ul className="space-y-2">
                {productLinks.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {companyLinks.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">{homepage.footerCompanyHeading ?? ''}</h3>
              <ul className="space-y-2">
                {companyLinks.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {supportLinks.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">{homepage.footerSupportHeading ?? ''}</h3>
              <ul className="space-y-2">
                {(homepage.footerLinks?.support ?? []).map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                {footer.customLinks.map((link) => (
                  <li key={link.id}>
                    <a
                      {...renderIdentifiableLink(link)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-muted-foreground text-sm">{homepage.copyrightText ?? ''}</p>
          {hasLegalLinks && (
            <div className="flex items-center flex-wrap justify-center gap-6 mt-4 md:mt-0">
              {legacyLegalLinks.map((link) => (
                <a
                  key={`${link.label}-${link.href}`}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  {link.label}
                </a>
              ))}
              {legalPages.map((page) => (
                <a
                  key={page.id}
                  href={resolveFrontendWebsiteNavHref(page.href ?? `/${page.slug}`, managedPageSlugs)}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  {page.title}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
