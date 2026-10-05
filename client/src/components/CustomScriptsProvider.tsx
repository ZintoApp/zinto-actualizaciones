import { useCustomScripts } from '@/hooks/use-custom-scripts';

interface CustomScriptsProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that initializes custom scripts globally
 * Must be used inside QueryClientProvider
 */
export function CustomScriptsProvider({ children }: CustomScriptsProviderProps) {

  useCustomScripts();

  return <>{children}</>;
}
