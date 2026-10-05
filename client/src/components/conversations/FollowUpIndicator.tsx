import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Clock, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import useSocket from '@/hooks/useSocket';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { formatFollowUpTime, getFollowUpStatusColor } from '@/utils/dateUtils';
import { apiRequest } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { ActiveFollowUpResponse } from '@shared/types/follow-up';

interface FollowUpIndicatorProps {
  conversationId: number;
  className?: string;
}

const TRUNCATE_LEN = 60;

export function FollowUpIndicator({ conversationId, className }: FollowUpIndicatorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hoverOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cancelScheduleId, setCancelScheduleId] = useState<string | null>(null);
  const [confirmCancelScheduleId, setConfirmCancelScheduleId] = useState<string | null>(null);
  const [removingScheduleIds, setRemovingScheduleIds] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const socket = useSocket('/ws');

  const {
    data: activeFollowUps = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ActiveFollowUpResponse[]>({
    queryKey: ['follow-ups', 'active', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/follow-ups/active/${conversationId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch active follow-ups');
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await apiRequest('POST', `/api/follow-ups/${scheduleId}/cancel`, {
        reason: 'Manual cancellation from conversation view',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to cancel follow-up');
      }
      return res.json();
    },
    onMutate: async (scheduleId) => {
      setCancelScheduleId(scheduleId);
      await queryClient.cancelQueries({ queryKey: ['follow-ups', 'active', conversationId] });
      const prev = queryClient.getQueryData<ActiveFollowUpResponse[]>(['follow-ups', 'active', conversationId]);
      setRemovingScheduleIds((ids) => [...ids, scheduleId]);
      return { prev };
    },
    onSuccess: (_, scheduleId) => {
      setCancelScheduleId(null);
      setConfirmCancelScheduleId(null);
      setRemovingScheduleIds((ids) => ids.filter((id) => id !== scheduleId));
      toast({
        title: 'Follow-up cancelled',
        description: 'The scheduled follow-up has been cancelled.',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['follow-ups', 'active', conversationId] });
    },
    onError: (err, scheduleId, context) => {
      setCancelScheduleId(null);
      setConfirmCancelScheduleId(null);
      setRemovingScheduleIds((ids) => ids.filter((id) => id !== scheduleId));
      if (context?.prev != null) {
        queryClient.setQueryData(['follow-ups', 'active', conversationId], context.prev);
      }
      toast({
        title: 'Failed to cancel follow-up',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Retry" onClick={() => handleCancelFollowUp(scheduleId)}>
            Retry
          </ToastAction>
        ),
      });
    },
  });

  const handleCancelFollowUp = useCallback(
    (scheduleId: string) => {
      setConfirmCancelScheduleId(scheduleId);
    },
    []
  );

  const confirmCancel = useCallback(() => {
    if (confirmCancelScheduleId) {
      cancelMutation.mutate(confirmCancelScheduleId);
    }
    setConfirmCancelScheduleId(null);
  }, [confirmCancelScheduleId, cancelMutation]);

  // After fade-out duration, remove item(s) from cache
  useEffect(() => {
    if (removingScheduleIds.length === 0) return;
    const idsToRemove = [...removingScheduleIds];
    const t = setTimeout(() => {
      queryClient.setQueryData<ActiveFollowUpResponse[]>(['follow-ups', 'active', conversationId], (old) =>
        old ? old.filter((f) => !idsToRemove.includes(f.scheduleId)) : []
      );
      setRemovingScheduleIds((ids) => ids.filter((id) => !idsToRemove.includes(id)));
    }, 200);
    return () => clearTimeout(t);
  }, [removingScheduleIds, queryClient, conversationId]);

  useEffect(() => {
    const unsubExecuted = socket.onMessage('followUpExecuted', (data: { data?: { conversationId?: number } }) => {
      if (data?.data?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ['follow-ups', 'active', conversationId] });
        toast({
          title: 'Follow-up sent',
          description: 'A scheduled follow-up message was sent.',
          variant: 'default',
        });
      }
    });
    const unsubCancelled = socket.onMessage('followUpCancelled', (data: { data?: { conversationId?: number } }) => {
      if (data?.data?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ['follow-ups', 'active', conversationId] });
        toast({
          title: 'Follow-up cancelled',
          description: 'A scheduled follow-up was cancelled.',
          variant: 'default',
        });
      }
    });
    const unsubSkipped = socket.onMessage('followUpSkipped', (data: { data?: { conversationId?: number } }) => {
      if (data?.data?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ['follow-ups', 'active', conversationId] });
      }
    });
    const unsubManuallyCancelled = socket.onMessage(
      'followUpManuallyCancelled',
      (data: { data?: { conversationId?: number } }) => {
        if (data?.data?.conversationId === conversationId) {
          queryClient.invalidateQueries({ queryKey: ['follow-ups', 'active', conversationId] });
          toast({
            title: 'Follow-up cancelled',
            description: 'The scheduled follow-up was cancelled.',
            variant: 'default',
          });
        }
      }
    );
    return () => {
      unsubExecuted();
      unsubCancelled();
      unsubSkipped();
      unsubManuallyCancelled();
    };
  }, [conversationId, queryClient, toast, socket.onMessage]);

  const clearHoverClose = useCallback(() => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }, []);

  const clearHoverOpen = useCallback(() => {
    if (hoverOpenTimeoutRef.current) {
      clearTimeout(hoverOpenTimeoutRef.current);
      hoverOpenTimeoutRef.current = null;
    }
  }, []);

  const handleTriggerPointerEnter = useCallback(() => {
    clearHoverClose();
    hoverOpenTimeoutRef.current = setTimeout(() => setPopoverOpen(true), 200);
  }, [clearHoverClose]);

  const handleTriggerPointerLeave = useCallback(() => {
    clearHoverOpen();
    hoverCloseTimeoutRef.current = setTimeout(() => setPopoverOpen(false), 150);
  }, [clearHoverOpen]);

  const handleContentPointerEnter = useCallback(() => {
    clearHoverClose();
    clearHoverOpen();
    setPopoverOpen(true);
  }, [clearHoverClose, clearHoverOpen]);

  const handleContentPointerLeave = useCallback(() => {
    hoverCloseTimeoutRef.current = setTimeout(() => setPopoverOpen(false), 150);
  }, []);

  if (isLoading) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={className}
              role="status"
              aria-label="Loading follow-up information"
            >
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Loading scheduled follow-ups…</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`inline-flex items-center gap-1 cursor-help ${className}`}
              aria-label="Error loading follow-ups"
            >
              <AlertCircle className="h-3 w-3" />
              <span>?</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Could not load scheduled follow-ups.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!activeFollowUps.length) {
    return null;
  }

  const count = activeFollowUps.length;

  return (
    <>
      <TooltipProvider>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className ?? ''}`}
              aria-label="Active follow-up messages scheduled"
              onPointerEnter={handleTriggerPointerEnter}
              onPointerLeave={handleTriggerPointerLeave}
            >
              <Clock className="h-3 w-3" aria-hidden />
              <span>{count}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 max-h-[min(70vh,400px)] overflow-hidden flex flex-col p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onPointerEnter={handleContentPointerEnter}
            onPointerLeave={handleContentPointerLeave}
          >
            <div className="p-3 border-b shrink-0">
              <h3 className="font-semibold text-sm">Scheduled Follow-ups</h3>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2" role="list">
              {activeFollowUps.map((fu) => (
                <div
                  key={fu.scheduleId}
                  className={`rounded-md border p-2 mb-2 last:mb-0 space-y-1.5 transition-opacity duration-200 ${
                    removingScheduleIds.includes(fu.scheduleId) ? 'opacity-0' : ''
                  }`}
                  role="listitem"
                >
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                    {fu.messageContent
                      ? fu.messageContent.length > TRUNCATE_LEN
                        ? `${fu.messageContent.slice(0, TRUNCATE_LEN)}…`
                        : fu.messageContent
                      : '(No message preview)'}
                  </p>
                  <p className={`text-xs font-medium ${getFollowUpStatusColor(fu.scheduledFor)}`}>
                    {formatFollowUpTime(fu.scheduledFor)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                      {fu.willCancelOnResponse ? (
                        <>
                          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                          <span>Will cancel if user replies</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3 w-3 shrink-0" aria-hidden />
                          <span>No auto-cancel</span>
                        </>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleCancelFollowUp(fu.scheduleId)}
                      disabled={cancelMutation.isPending && cancelScheduleId === fu.scheduleId}
                      aria-label={`Cancel follow-up scheduled for ${formatFollowUpTime(fu.scheduledFor)}`}
                    >
                      {cancelMutation.isPending && cancelScheduleId === fu.scheduleId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <X className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </TooltipProvider>

      <AlertDialog open={!!confirmCancelScheduleId} onOpenChange={(open) => !open && setConfirmCancelScheduleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the scheduled follow-up message. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel follow-up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
