import * as React from 'react';
import { cn } from '@/lib/utils';

// Compatibility wrapper: TabsList provides scrolling. No nested tablist or scroll container.
export const ScrollableTabs = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('min-w-0 max-w-full', className)} {...props} />
);
ScrollableTabs.displayName = 'ScrollableTabs';
export { TabsList as ScrollableTabsList, TabsTrigger as ScrollableTabsTrigger } from './tabs';
