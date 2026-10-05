import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Users,
  Zap,
  BarChart3,
  Workflow,
  Shield,
  Clock,
  Mail,
  TrendingUp,
  Award,
  Star,
  Play,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

export const LANDING_ICON_REGISTRY: Record<string, LucideIcon> = {
  MessageSquare: InboxConversationIcon,
  Bot,
  Users,
  Zap,
  BarChart3,
  Workflow,
  Shield,
  Clock,
  Mail,
  TrendingUp,
  Award,
  Star,
  Play,
  ArrowRight,
  CheckCircle,
};

export function getLandingIcon(name: string): LucideIcon {
  return LANDING_ICON_REGISTRY[name] ?? Zap;
}

export function resolveFrontendWebsiteNavHref(
  href: string,
  managedPageSlugs: string[] = []
): string {
  const trimmed = href.trim();
  if (!trimmed) return '/';

  if (trimmed.startsWith('page:')) {
    const slug = trimmed.slice(5).replace(/^\//, '');
    return slug ? `/${slug}` : '/';
  }

  if (trimmed.startsWith('#')) {
    return trimmed;
  }

  const slugSet = new Set(managedPageSlugs.map((slug) => slug.toLowerCase()));
  const withoutLeadingSlash = trimmed.replace(/^\//, '').toLowerCase();
  if (
    slugSet.has(withoutLeadingSlash) &&
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://')
  ) {
    return `/${withoutLeadingSlash}`;
  }

  return trimmed.startsWith('/') || trimmed.startsWith('http') ? trimmed : `/${trimmed}`;
}

export function getLinkProps(href: string, openInNewTab?: boolean) {
  const isExternal = href.startsWith('http://') || href.startsWith('https://');
  if (openInNewTab || isExternal) {
    return {
      href,
      target: '_blank' as const,
      rel: 'noopener noreferrer',
    };
  }
  return { href };
}

export function renderIdentifiableLink(link: {
  href: string;
  openInNewTab?: boolean;
}) {
  return getLinkProps(link.href, link.openInNewTab);
}

export const LANDING_CUSTOM_CSS_MARKER = 'data-landing-custom-css';
export const LANDING_CUSTOM_JS_MARKER = 'data-landing-custom-js';
