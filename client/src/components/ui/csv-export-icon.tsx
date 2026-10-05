import { FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CsvExportIconProps {
  className?: string;
  size?: number;
}

/**
 * Reusable icon for Export to CSV buttons across the application.
 */
export function CsvExportIcon({ className, size = 16 }: CsvExportIconProps) {
  return (
    <FileUp
      className={cn('shrink-0', className)}
      size={size}
      aria-hidden
    />
  );
}

export default CsvExportIcon;
