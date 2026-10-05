import { useCustomCss } from '@/hooks/use-custom-css';

interface CustomCssProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that initializes custom CSS globally
 * Must be used inside QueryClientProvider
 */
export function CustomCssProvider({ children }: CustomCssProviderProps) {
  // Initialize custom CSS hook
  useCustomCss();

  return <>{children}</>;
}

