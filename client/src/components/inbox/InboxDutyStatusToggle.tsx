import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, UserCheck, UserX } from 'lucide-react';

type InboxAvailabilitySettingsResponse = {
  settings: { isOnDuty?: boolean } | null;
  inboxAvailabilityEnabled?: boolean;
};

export function InboxDutyStatusToggle() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<InboxAvailabilitySettingsResponse>({
    queryKey: ['agent-inbox-availability-settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/agent/inbox-availability/settings');
      if (!res.ok) {
        throw new Error('Failed to fetch availability settings');
      }
      return res.json();
    },
    staleTime: 30_000,
  });

  const isOnDuty = data?.settings?.isOnDuty !== false;

  const dutyMutation = useMutation({
    mutationFn: async (nextOnDuty: boolean) => {
      const res = await apiRequest('PATCH', '/api/agent/inbox-availability/duty-status', {
        isOnDuty: nextOnDuty,
      });
      if (!res.ok) {
        throw new Error('Failed to update availability status');
      }
      return res.json();
    },
    onSuccess: (_, nextOnDuty) => {
      queryClient.invalidateQueries({ queryKey: ['agent-inbox-availability-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company/agents/inbox-availability'] });
      toast({
        title: nextOnDuty
          ? t('inbox_availability.now_available', 'You are now available for assignments')
          : t('inbox_availability.now_unavailable', 'You are now unavailable for assignments'),
      });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: t('inbox_availability.duty_error_title', 'Failed to update availability status'),
      });
    },
  });

  const isToggling = dutyMutation.isPending;

  const handleToggle = () => {
    if (isLoading || isToggling) return;
    dutyMutation.mutate(!isOnDuty);
  };

  const label = isOnDuty
    ? t('inbox_availability.available', 'Available')
    : t('inbox_availability.unavailable', 'Unavailable');

  const tooltip = isOnDuty
    ? t(
        'inbox_availability.available_tooltip',
        'You are available for inbox assignments. Click to mark yourself unavailable.'
      )
    : t(
        'inbox_availability.unavailable_tooltip',
        'You are unavailable for inbox assignments. Click to mark yourself available.'
      );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleToggle}
            disabled={isLoading || isToggling}
            className={`
              inline-flex items-center text-xs sm:text-sm rounded-md px-2 py-1.5 min-h-[36px] sm:min-h-[32px]
              transition-colors disabled:opacity-60 disabled:pointer-events-none
              ${isOnDuty
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/50'
              }
            `}
            aria-label={tooltip}
            aria-pressed={isOnDuty}
          >
            {isToggling || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isOnDuty ? (
              <UserCheck className="h-4 w-4 sm:mr-1.5 shrink-0" />
            ) : (
              <UserX className="h-4 w-4 sm:mr-1.5 shrink-0" />
            )}
            <span className="hidden sm:inline whitespace-nowrap">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
