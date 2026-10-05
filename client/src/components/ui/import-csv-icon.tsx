import { FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportCsvIconProps {
  className?: string;
  size?: number;
}

/**
 * Reusable icon for Import CSV buttons across the application.
 */
export function ImportCsvIcon({ className, size = 16 }: ImportCsvIconProps) {
  return (
    <FileDown
      className={cn('shrink-0', className)}
      size={size}
      aria-hidden
    />
  );
}

export default ImportCsvIcon;
