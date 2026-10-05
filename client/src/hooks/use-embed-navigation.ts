import { useLocation } from 'wouter';
import { preserveEmbedParam, isEmbeddedContext } from '@/utils/embed-context';

/**
 * Hook that provides navigation functions that preserve embed parameter
 */
export function useEmbedNavigation() {
  const [, setLocation] = useLocation();

  const navigate = (path: string) => {
    if (isEmbeddedContext()) {
      const urlWithEmbed = preserveEmbedParam(path);
      setLocation(urlWithEmbed.replace(window.location.origin, ''));
    } else {
      setLocation(path);
    }
  };

  return { navigate };
}

