import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrapeContactsIconProps {
  className?: string;
  size?: number;
}

/**
 * Reusable icon for "scrape contacts" (e.g. WhatsApp / Google Maps) actions.
 */
export function ScrapeContactsIcon({ className, size = 16 }: ScrapeContactsIconProps) {
  return (
    <MapPin
      className={cn('shrink-0', className)}
      size={size}
      aria-hidden
    />
  );
}

export default ScrapeContactsIcon;
