import { UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddContactIconProps {
  className?: string;
  size?: number;
}

/**
 * Reusable icon for Add Contact buttons across the application.
 */
export function AddContactIcon({ className, size = 16 }: AddContactIconProps) {
  return (
    <UserPlus
      className={cn('shrink-0', className)}
      size={size}
      aria-hidden
    />
  );
}

export default AddContactIcon;
