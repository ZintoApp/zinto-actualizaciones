import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useWebsiteEnabled } from '@/hooks/use-website-enabled';
import { preserveEmbedParam, isEmbeddedContext } from '@/utils/embed-context';
import { useTranslation } from '@/hooks/use-translation';

export default function RootRedirect() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, setLocation] = useLocation();
  const { data: websiteSettings, isLoading: websiteLoading } = useWebsiteEnabled();
  const { t } = useTranslation();

  useEffect(() => {
    if (authLoading || websiteLoading) return;

    const preserveEmbed = (path: string) => {
      if (isEmbeddedContext()) {
        const urlWithEmbed = preserveEmbedParam(path);
        return urlWithEmbed.replace(window.location.origin, '');
      }
      return path;
    };

    if (user) {
      if (user.isSuperAdmin) {
        setLocation(preserveEmbed('/admin/dashboard'));
      } else {
        setLocation(preserveEmbed('/inbox'));
      }
      return;
    }

    if (websiteSettings?.enabled) {
      setLocation(preserveEmbed('/landing'));
      return;
    }

    setLocation(preserveEmbed('/auth'));
  }, [user, authLoading, websiteSettings, websiteLoading, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-foreground">{t('common.loading', 'Loading...')}</p>
      </div>
    </div>
  );
}
