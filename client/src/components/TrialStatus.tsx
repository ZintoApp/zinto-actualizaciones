import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useSubscriptionStatus } from '@/hooks/use-subscription-status';
import { Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface TrialStatusProps {
  isCollapsed?: boolean;
}

export default function TrialStatus({ isCollapsed = false }: TrialStatusProps) {
  const { company } = useAuth();
  const { t } = useTranslation();
  const { refreshSubscriptionStatus } = useSubscriptionStatus();




  if (!company?.isInTrial || !company?.trialEndDate) {
    return null;
  }

  const now = new Date();
  const trialEndDate = new Date(company.trialEndDate);
  const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  

  if (daysRemaining <= 0) {
    return null;
  }

  const isExpiringSoon = daysRemaining <= 3;

  if (isCollapsed) {
    return (
      <div className="mb-2 flex flex-col items-center gap-1">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
          isExpiringSoon ? 'border-red-400/20 bg-red-400/10 text-red-300' : 'border-blue-400/20 bg-blue-400/10 text-blue-300'
        }`}>
          {isExpiringSoon ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Clock className="h-5 w-5" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-9 text-white/40 hover:bg-white/10 hover:text-white"
          onClick={refreshSubscriptionStatus}
          title={t('trial.refresh', 'Refresh subscription status')}
          aria-label={t('trial.refresh', 'Refresh subscription status')}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <Alert className={`rounded-xl px-3 py-2 ${
        isExpiringSoon 
          ? 'border-red-400/20 bg-red-400/10 text-red-200'
          : 'border-blue-400/20 bg-blue-400/10 text-blue-200'
      }`}>
        <div className="flex items-center gap-2">
          {isExpiringSoon ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          <div className="flex-1">
            <div className="text-xs font-medium">
              {t('trial.status_title', 'Trial Period')}
            </div>
            <AlertDescription className="mt-0.5 text-[11px] text-current/75">
              {daysRemaining === 1
                ? t('trial.expires_today', 'Expires today')
                : t('trial.days_remaining', '{{days}} days remaining', { days: daysRemaining })
              }
            </AlertDescription>
          </div>
        </div>
      </Alert>
    </div>
  );
}
