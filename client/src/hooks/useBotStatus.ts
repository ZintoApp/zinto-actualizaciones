import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';

interface BotStatusData {
  conversationId: number;
  botDisabled: boolean;
  disabledAt?: string;
  disableDuration?: number;
  disableReason?: string;
}

interface UseBotStatusReturn {
  isBotDisabled: boolean;
  isLoading: boolean;
  error: Error | null;
  toggleBot: () => Promise<void>;
  enableBot: () => Promise<void>;
  disableBot: (duration?: number, reason?: string) => Promise<void>;
  isToggling: boolean;
}

/**
 * Custom hook to manage bot enable/disable status for a conversation
 */
export function useBotStatus(conversationId: number | null): UseBotStatusReturn {
  const [isToggling, setIsToggling] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();


  const {
    data: botStatusData,
    isLoading,
    error,
    refetch
  } = useQuery<BotStatusData>({
    queryKey: ['bot-status', conversationId],
    queryFn: async () => {
      if (!conversationId) {
        throw new Error('No conversation ID provided');
      }

      const response = await apiRequest('GET', `/api/conversations/${conversationId}/bot-status`);
      if (!response.ok) {
        throw new Error('Failed to fetch bot status');
      }
      return response.json();
    },
    enabled: !!conversationId,
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  const isBotDisabled = botStatusData?.botDisabled ?? false;

  /**
   * Toggle bot status (enable if disabled, disable if enabled)
   */
  const toggleBot = useCallback(async () => {
    if (!conversationId || isToggling) return;

    setIsToggling(true);
    try {
      const newStatus = !isBotDisabled;
      const response = await apiRequest('PATCH', `/api/conversations/${conversationId}/bot-status`, {
        botDisabled: newStatus
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update bot status');
      }

      const updatedData = await response.json();


      queryClient.setQueryData(['bot-status', conversationId], updatedData);


      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });


      toast({
        title: newStatus 
          ? t('bot.disabled.title', 'Bot Disabled') 
          : t('bot.enabled.title', 'Bot Enabled'),
        description: newStatus
          ? t('bot.disabled.description', 'Automated responses are now disabled for this conversation')
          : t('bot.enabled.description', 'Automated responses are now enabled for this conversation'),
        variant: 'default'
      });

    } catch (error: any) {
      console.error('Error toggling bot status:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('bot.toggle.error', 'Failed to update bot status'),
        variant: 'destructive'
      });
    } finally {
      setIsToggling(false);
    }
  }, [conversationId, isBotDisabled, isToggling, queryClient, toast, t]);

  /**
   * Enable bot for the conversation
   */
  const enableBot = useCallback(async () => {
    if (!conversationId || isToggling) return;

    setIsToggling(true);
    try {
      const response = await apiRequest('PATCH', `/api/conversations/${conversationId}/bot-status`, {
        botDisabled: false
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to enable bot');
      }

      const updatedData = await response.json();


      queryClient.setQueryData(['bot-status', conversationId], updatedData);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });

      toast({
        title: t('bot.enabled.title', 'Bot Enabled'),
        description: t('bot.enabled.description', 'Automated responses are now enabled for this conversation'),
        variant: 'default'
      });

    } catch (error: any) {
      console.error('Error enabling bot:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('bot.enable.error', 'Failed to enable bot'),
        variant: 'destructive'
      });
    } finally {
      setIsToggling(false);
    }
  }, [conversationId, isToggling, queryClient, toast, t]);

  /**
   * Disable bot for the conversation
   */
  const disableBot = useCallback(async (duration?: number, reason?: string) => {
    if (!conversationId || isToggling) return;

    setIsToggling(true);
    try {
      const response = await apiRequest('PATCH', `/api/conversations/${conversationId}/bot-status`, {
        botDisabled: true,
        disableDuration: duration,
        disableReason: reason
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to disable bot');
      }

      const updatedData = await response.json();


      queryClient.setQueryData(['bot-status', conversationId], updatedData);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });

      const durationText = duration 
        ? t('bot.disabled.with_duration', `for ${duration} minutes`)
        : t('bot.disabled.indefinitely', 'indefinitely');

      toast({
        title: t('bot.disabled.title', 'Bot Disabled'),
        description: t('bot.disabled.description_with_duration', `Automated responses are now disabled ${durationText}`),
        variant: 'default'
      });

    } catch (error: any) {
      console.error('Error disabling bot:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('bot.disable.error', 'Failed to disable bot'),
        variant: 'destructive'
      });
    } finally {
      setIsToggling(false);
    }
  }, [conversationId, isToggling, queryClient, toast, t]);


  useEffect(() => {
    return () => {
      setIsToggling(false);
    };
  }, [conversationId]);

  return {
    isBotDisabled,
    isLoading,
    error: error as Error | null,
    toggleBot,
    enableBot,
    disableBot,
    isToggling
  };
}
