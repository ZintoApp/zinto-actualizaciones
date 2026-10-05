import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';

interface ClearChatHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  conversationName: string;
  isGroupChat: boolean;
  onSuccess?: () => void;
}

export function ClearChatHistoryDialog({
  isOpen,
  onClose,
  conversationId,
  conversationName,
  isGroupChat,
  onSuccess
}: ClearChatHistoryDialogProps) {
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { branding } = useBranding();

  const handleClearHistory = async () => {
    if (isClearing) return;

    setIsClearing(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/history`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('clear_history.error_generic', 'Failed to clear chat history'));
      }

      const result = await response.json();

      toast({
        title: t('clear_history.success_title', 'Chat History Cleared'),
        description: t(
          'clear_history.success_description', 
          `Successfully cleared ${result.deletedMessageCount} messages and ${result.deletedMediaCount} media files.`,
          {
            deletedMessageCount: result.deletedMessageCount,
            deletedMediaCount: result.deletedMediaCount,
          }
        ),
        variant: 'default'
      });

      onClose();
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('clear_history.error_generic', 'Failed to clear chat history');

      toast({
        title: t('clear_history.error_title', 'Clear Failed'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleCancel = () => {
    if (!isClearing) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent data-tour="components-conversations-clearchathistorydialog.dialogcontent.clear_history.confirm_group_title" className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-lg font-medium text-foreground">
                {isGroupChat
                  ? t('clear_history.confirm_group_title', 'Clear Group Chat History')
                  : t('clear_history.confirm_title', 'Clear Chat History')
                }
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <DialogDescription className="space-y-3 text-sm text-muted-foreground">
          <p>
            {isGroupChat
              ? t(
                  'clear_history.confirm_group_message',
                  `Are you sure you want to clear all chat history for "${conversationName}"? This will permanently delete all messages and media files from ${branding.appName}.`,
                  { conversationName, appName: branding.appName }
                )
              : t(
                  'clear_history.confirm_message',
                  `Are you sure you want to clear all chat history with "${conversationName}"? This will permanently delete all messages and media files from ${branding.appName}.`,
                  { conversationName, appName: branding.appName }
                )
            }
          </p>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-foreground">
                <p className="font-medium mb-1">
                  {t('clear_history.warning_title', 'Important:')}
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>
                    {t(
                      'clear_history.warning_irreversible',
                      'This action cannot be undone'
                    )}
                  </li>
                  <li>
                    {t(
                      'clear_history.warning_local_only',
                      `Messages will only be deleted from ${branding.appName}, not from WhatsApp`,
                      { appName: branding.appName }
                    )}
                  </li>
                  <li>
                    {t(
                      'clear_history.warning_media',
                      'All associated media files will be permanently deleted'
                    )}
                  </li>
                  <li>
                    {isGroupChat
                      ? t(
                          'clear_history.warning_group_preserved',
                          'Group information and participants will be preserved'
                        )
                      : t(
                          'clear_history.warning_contact_preserved',
                          'Contact information will be preserved'
                        )
                    }
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </DialogDescription>

        <DialogFooter className="flex justify-end space-x-3 pt-4">
          <Button data-tour="components-conversations-clearchathistorydialog.button.common.cancel"
            variant="outline"
            onClick={handleCancel}
            disabled={isClearing}
            className="min-w-[80px]"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-conversations-clearchathistorydialog.button.clear_history.clearing"
            variant="destructive"
            onClick={handleClearHistory}
            disabled={isClearing}
            className="min-w-[120px] flex items-center space-x-2"
          >
            {isClearing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('clear_history.clearing', 'Clearing...')}</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>{t('clear_history.clear_button', 'Clear History')}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
