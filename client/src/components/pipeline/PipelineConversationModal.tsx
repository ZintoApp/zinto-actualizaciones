import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import { useConversations } from '@/context/ConversationContext';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';
import { useChannelInfo } from '@/contexts/ActiveChannelContext';
import { MobileLayoutProvider } from '@/contexts/mobile-layout-context';
import ConversationView from '@/components/conversations/ConversationView';
import NewConversationModal from '@/components/conversations/NewConversationModal';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { apiRequest } from '@/lib/queryClient';
import type { Deal } from '@shared/schema';

export default function PipelineConversationModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { t, currentLanguage } = useTranslation();
  const context = useConversations();
  const channel = useActiveChannel();
  const { getChannelDisplayName, getChannelIcon } = useChannelInfo();
  const previous = useRef({ conversation: context.activeConversationId, channel: context.activeChannelId,
    globalChannel: channel.activeChannelId, reply: context.replyToMessage });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/deals', deal.id, 'conversations'],
    queryFn: async () => (await apiRequest('GET', `/api/deals/${deal.id}/conversations`)).json(),
  });
  const select = (conversation: any) => {
    context.registerFocusedConversations([{ ...conversation, contact: data?.contact }]);
    context.setReplyToMessage(null);
    context.setActiveChannelId(conversation.channelId);
    channel.setActiveChannelId(conversation.channelId);
    context.setActiveConversationId(conversation.id);
    setSelectedId(conversation.id);
  };
  useEffect(() => {
    if (data?.conversations?.length && selectedId === null) select(data.conversations[0]);
  }, [data, selectedId]);
  useEffect(() => () => {
    context.registerFocusedConversations([]);
    context.setActiveConversationId(previous.current.conversation);
    context.setActiveChannelId(previous.current.channel);
    channel.setActiveChannelId(previous.current.globalChannel);
    context.setReplyToMessage(previous.current.reply);
  }, []);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100%-1rem)] sm:max-w-4xl h-[calc(100dvh-1rem)] sm:h-[92dvh] max-h-[calc(100dvh-1rem)]" contentNoScroll
        bodyClassName="flex flex-col min-h-0 p-0" closeButtonLabel={t('common.close', 'Close')}
        dir={currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr'}>
        <DialogHeader className="px-4 pr-14 pt-4 shrink-0">
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              {data?.contact ? <ContactAvatar contact={data.contact} size="sm" /> : <User className="h-5 w-5" aria-hidden="true" />}
            </span>
            <span className="truncate">{deal.title}</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> :
          error ? <div className="p-4 space-y-3"><p>{t('pipeline.follow_up.unavailable', 'This conversation is unavailable or you do not have access.')}</p>
            <Button data-tour="components-pipeline-pipelineconversationmodal.button.common.retry" variant="outline" onClick={() => void refetch()}>{t('common.retry', 'Retry')}</Button></div> :
          data?.conversations?.length || selectedId ? <>
            {data?.conversations?.length > 1 && <div className="px-3 py-2 border-b">
              <Select value={String(selectedId ?? '')} onValueChange={id => select(data.conversations.find((item: any) => item.id === Number(id)))}>
                <SelectTrigger data-tour="components-pipeline-pipelineconversationmodal.selecttrigger.pipeline.follow_up.choose_conversation" aria-label={t('pipeline.follow_up.choose_conversation', 'Choose conversation')}><SelectValue /></SelectTrigger>
                <SelectContent>{data.conversations.map((item: any) => <SelectItem key={item.id} value={String(item.id)}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                      {getChannelIcon(item.channelConnection?.channelType || item.channelType)}
                    </span>
                    <span className="truncate">{getChannelDisplayName(item.channelConnection || { ...item, id: item.channelId }) || item.channelType}</span>
                  </span>
                </SelectItem>)}</SelectContent>
              </Select>
            </div>}
            {selectedId && <MobileLayoutProvider><ConversationView focused /></MobileLayoutProvider>}
          </> : <div className="p-4 space-y-3">
            <p className="text-muted-foreground">{t('pipeline.follow_up.no_conversation', 'No conversation is available for this customer.')}</p>
            <Button data-tour="components-pipeline-pipelineconversationmodal.button.pipeline.follow_up.start_conversation" variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4 me-2" />{t('pipeline.follow_up.start_conversation', 'Start conversation')}</Button>
          </div>}
        <NewConversationModal isOpen={creating} onClose={() => setCreating(false)} initialContact={data?.contact}
          onConversationCreated={conversation => { setCreating(false); select(conversation); void refetch(); }} />
      </DialogContent>
    </Dialog>
  );
}
