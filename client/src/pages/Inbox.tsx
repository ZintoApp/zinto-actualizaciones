import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { useAppSidebarChrome } from '@/contexts/AppSidebarChromeContext';
import ConversationList from '@/components/conversations/ConversationList';
import GroupConversationList from '@/components/groups/GroupConversationList';
import ConversationView from '@/components/conversations/ConversationView';
import { useConversations } from '@/context/ConversationContext';
import { MobileLayoutProvider, useMobileLayout } from '@/contexts/mobile-layout-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useTranslation } from '@/hooks/use-translation';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Loader2,
  UserRound as TabIconUserRound,
  UsersRound as TabIconUsersRound,
} from 'lucide-react';
import { isEmbeddedContext } from '@/utils/embed-context';
import { isEmbeddedInboxAccessAllowed, isEmbeddedInboxMode } from '@/utils/inbox-embed';

function InboxContent() {
  const queryClient = useQueryClient();
  const { setHideMainSidebar } = useAppSidebarChrome();
  const {
    showGroupChats,
    inboxEmbeddingEnabled,
    isLoadingInboxSettings,
  } = useConversations();

  // Invalidate inbox/conversations cache when user opens or switches to this page so list is fresh
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
  }, [queryClient]);

  const {
    isMobile,
    isTablet,
    isConversationListOpen,
    isContactDetailsOpen,
    closeAllPanels
  } = useMobileLayout();

  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'individual' | 'groups'>('individual');
  const embeddedContext = isEmbeddedContext();
  const isEmbedded = isEmbeddedInboxMode(window.location.pathname, embeddedContext);
  const isEmbeddedAccessAllowed = isEmbeddedInboxAccessAllowed(
    window.location.pathname,
    embeddedContext,
    inboxEmbeddingEnabled,
  );

  useEffect(() => {
    if (!showGroupChats && activeTab === 'groups') {
      setActiveTab('individual');
    }
  }, [showGroupChats, activeTab]);

  useEffect(() => {
    if (isEmbedded) {
      setHideMainSidebar(false);
      return;
    }
    if (isMobile) {
      setHideMainSidebar(true);
      return;
    }
    setHideMainSidebar(false);
  }, [isEmbedded, isMobile, setHideMainSidebar]);

  if (isEmbedded && isLoadingInboxSettings) {
    return (
      <div className="h-screen min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isEmbedded && !isEmbeddedAccessAllowed) {
    return (
      <div className="h-screen min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('settings.inbox.embedding_disabled', 'Inbox embedding is disabled')}</AlertTitle>
            <AlertDescription>
              {t(
                'settings.inbox.embedding_disabled_description',
                'This company has disabled the embedded Inbox view. Ask an admin to enable Inbox embedding in Settings to use this page.',
              )}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isEmbedded
          ? 'h-full min-h-0 flex flex-col overflow-hidden font-sans text-foreground bg-background'
          : 'flex flex-1 min-h-0 flex-col overflow-hidden font-sans text-foreground bg-background'
      }
    >
      {!isEmbedded && <Header />}

      <div className="flex flex-1 overflow-hidden relative min-h-0">
        <div className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
                isConversationListOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : isTablet
            ? `${isConversationListOpen ? 'flex' : 'hidden'}`
            : 'flex'
          }
        `}>
          {showGroupChats ? (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'individual' | 'groups')} className="flex flex-col h-full min-h-0">
              <div className="border-r border-border bg-background flex-shrink-0 overflow-hidden flex flex-col h-full min-h-0">
                <div className="p-3 sm:p-4 border-b border-border">
                  <TabsList>
                    <TabsTrigger icon={TabIconUserRound} data-tour="pages-inbox.tabstrigger.individual" value="individual">
                      {t('inbox.individual', 'Individual')}
                    </TabsTrigger>
                    <TabsTrigger icon={TabIconUsersRound} data-tour="pages-inbox.tabstrigger.groups" value="groups">
                      <span>{t('inbox.groups', 'Groups')}</span>
                      <span className="ms-1.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-white shadow-sm">
                        {t('inbox.groups_new_badge', 'New')}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent data-tour="pages-inbox.tabscontent.individual" value="individual" className="flex-1 overflow-hidden m-0 min-h-0">
                  <ConversationList />
                </TabsContent>

                <TabsContent data-tour="pages-inbox.tabscontent.groups" value="groups" className="flex-1 overflow-hidden m-0 min-h-0">
                  <GroupConversationList />
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <ConversationList />
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
          <ConversationView />
        </div>

        {isMobile && (isConversationListOpen || isContactDetailsOpen) && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={(e) => {
              e.stopPropagation();
              closeAllPanels();
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Inbox() {
  return (
    <MobileLayoutProvider>
      <InboxContent />
    </MobileLayoutProvider>
  );
}
