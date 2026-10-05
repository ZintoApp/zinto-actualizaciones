import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import type { WhatsAppContactSyncRun } from '@shared/whatsapp-contact-sync';
import { isWhatsAppContactSyncActive } from '@shared/whatsapp-contact-sync';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const queryKey = ['/api/contacts/whatsapp-sync-runs/latest'];

export function WhatsAppContactSyncAction() {
  const [open, setOpen] = useState(false);
  const previousStatus = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, currentLanguage } = useTranslation();
  const { data: run = null, isLoading } = useQuery<WhatsAppContactSyncRun | null>({
    queryKey,
    queryFn: async () => (await apiRequest('GET', '/api/contacts/whatsapp-sync-runs/latest')).json(),
    refetchInterval: query => isWhatsAppContactSyncActive(query.state.data?.status) ? 2_000 : false,
    refetchOnWindowFocus: true,
  });
  const active = isWhatsAppContactSyncActive(run?.status);

  const start = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/contacts/whatsapp-sync-runs')).json() as Promise<WhatsAppContactSyncRun>,
    onSuccess: data => {
      queryClient.setQueryData(queryKey, data);
      toast({
        title: t('contacts.whatsapp_sync.started_title'),
        description: t('contacts.whatsapp_sync.started_description'),
      });
    },
    onError: (error: Error & { errorCode?: string }) => {
      toast({
        title: t('contacts.whatsapp_sync.start_failed_title'),
        description: error.errorCode === 'SYNC_ALREADY_RUNNING'
          ? t('contacts.whatsapp_sync.already_running')
          : t('contacts.whatsapp_sync.start_failed_description'),
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey });
    },
  });

  useEffect(() => {
    if (previousStatus.current && isWhatsAppContactSyncActive(previousStatus.current) && run && !active) {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({
        title: run.status === 'failed'
          ? t('contacts.whatsapp_sync.failed_title')
          : t('contacts.whatsapp_sync.completed_title'),
        description: run.status === 'failed'
          ? t('contacts.whatsapp_sync.failed_description')
          : run.errors
            ? t('contacts.whatsapp_sync.completed_with_errors', undefined, { count: run.errors })
            : t('contacts.whatsapp_sync.completed_description', undefined, { count: run.updated }),
        variant: run.status === 'failed' ? 'destructive' : 'default',
      });
    }
    previousStatus.current = run?.status ?? null;
  }, [active, queryClient, run, t, toast]);

  const progress = run?.total ? Math.min(100, Math.round((run.processed / run.total) * 100)) : 0;
  const lastSyncAt = run?.completedAt || run?.startedAt || run?.createdAt;
  const lastSync = lastSyncAt
    ? new Intl.DateTimeFormat(currentLanguage?.code || undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSyncAt))
    : t('contacts.whatsapp_sync.never');

  return (
    <>
      <Button data-tour="components-contacts-whatsappcontactsyncaction.button.contacts.whatsapp_sync.action"
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 bg-green-500/10 border-green-500/30 text-green-700 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30"
        onClick={() => setOpen(true)}
        title={t('contacts.whatsapp_sync.action')}
        aria-label={t('contacts.whatsapp_sync.action')}
      >
        <RefreshCw className={`h-4 w-4 ${active ? 'animate-spin' : ''}`} />
        <span className="sr-only">{t('contacts.whatsapp_sync.action')}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-tour="components-contacts-whatsappcontactsyncaction.dialogcontent.contacts.whatsapp_sync.title" className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('contacts.whatsapp_sync.title')}</DialogTitle>
            <DialogDescription>{t('contacts.whatsapp_sync.description')}</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('contacts.whatsapp_sync.last_sync')}</span>
                <span>{lastSync}</span>
              </div>
              {run && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('contacts.whatsapp_sync.status')}</span>
                    <Badge variant={run.status === 'failed' || run.status === 'completed_with_errors' ? 'destructive' : active ? 'secondary' : 'default'}>
                      {t(`contacts.whatsapp_sync.status_${run.status}`)}
                    </Badge>
                  </div>
                  {(active || run.processed > 0) && (
                    <div className="space-y-2">
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">
                        {t('contacts.whatsapp_sync.progress', undefined, { processed: run.processed, total: run.total, percent: progress })}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      ['updated', run.updated],
                      ['unchanged', run.unchanged],
                      ['skipped', run.skipped],
                      ['errors', run.errors],
                    ] as const).map(([label, count]) => (
                      <div key={label} className="rounded-md border bg-muted/30 p-3 text-center">
                        <div className="text-lg font-semibold">{count}</div>
                        <div className="text-xs text-muted-foreground">{t(`contacts.whatsapp_sync.${label}`)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!active && <p className="text-sm text-muted-foreground">{t('contacts.whatsapp_sync.confirmation')}</p>}
            </div>
          )}

          <DialogFooter>
            <Button data-tour="components-contacts-whatsappcontactsyncaction.button.common.close" type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
            {!active && !isLoading && (
              <Button data-tour="components-contacts-whatsappcontactsyncaction.button.contacts.whatsapp_sync.sync_again" type="button" onClick={() => start.mutate()} disabled={start.isPending}>
                {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {run ? t('contacts.whatsapp_sync.sync_again') : t('contacts.whatsapp_sync.start')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
