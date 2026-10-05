import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterIconProps {
  className?: string;
  size?: number;
}

/**
 * Reusable icon for filter-related UI.
 */
export function FilterIcon({ className, size = 16 }: FilterIconProps) {
  return (
    <Filter
      className={cn('shrink-0', className)}
      size={size}
      aria-hidden
    />
  );
}

export default FilterIcon;
