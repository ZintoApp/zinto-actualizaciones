import LandingPage from '@/pages/landing';
import { Redirect } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWebsiteEnabled } from '@/hooks/use-website-enabled';
import { useTranslation } from '@/hooks/use-translation';

export default function ProtectedLandingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: settings, isLoading: websiteLoading } = useWebsiteEnabled();
  const { t } = useTranslation();

  if (authLoading || websiteLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">{t('common.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  if (user) {
    if (user.isSuperAdmin) {
      return <Redirect to="/admin/dashboard" />;
    }
    return <Redirect to="/inbox" />;
  }

  if (!settings?.enabled) {
    return <Redirect to="/auth" />;
  }

  return <LandingPage />;
}
