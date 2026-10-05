import { useState, useEffect, useCallback, useRef } from 'react';
import { emitTourSignal } from '@/components/guided-tours/signals';
import { getInstagramHandle } from '@shared/instagram-contact';
import { useConversations } from '@/context/ConversationContext';
import { useTranslation } from '@/hooks/use-translation';
import ConversationItem from './ConversationItem';
import NewConversationModal from './NewConversationModal';
import { PipelineProvider } from '@/contexts/PipelineContext';
import AddDealModal from '@/components/pipeline/AddDealModal';
import EditDealModal from '@/components/pipeline/EditDealModal';
import { Deal } from '@shared/schema';

import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { useMobileLayout } from '@/contexts/mobile-layout-context';
import { Loader2, Pin, PinOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ContactsWithoutConversations } from '@/components/contacts/ContactsWithoutConversations';
import { ChannelSelector } from '@/components/inbox/ChannelSelector';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';

export default function ConversationList() {
  const {
    conversations,
    isLoadingConversations,
    activeConversationId,
    setActiveConversationId,
    conversationsPagination,
    loadMoreConversations
  } = useConversations();
  const { t } = useTranslation();
  const [filterStatus, setFilterStatus] = useState<'all' | 'unassigned' | 'assigned' | 'assigned_to_me'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewConversationModalOpen, setIsNewConversationModalOpen] = useState(false);

  const [selectedContactIdForAddDeal, setSelectedContactIdForAddDeal] = useState<number | null>(null);
  const [selectedDealForEdit, setSelectedDealForEdit] = useState<Deal | null>(null);
  const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
  const [isEditDealModalOpen, setIsEditDealModalOpen] = useState(false);
  const [smartDealLoadingContactId, setSmartDealLoadingContactId] = useState<number | null>(null);

  const { user } = useAuth();
  const { canViewAllConversations, canOnlyViewAssignedConversations, canAccessPipeline } = usePermissions();
  const { isMobile, toggleConversationList, setConversationListOpen } = useMobileLayout();
  const { activeChannelId, setActiveChannelId } = useActiveChannel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const PINNED_CONVERSATIONS_MAX = 7;

  // Sorting helpers
  const getDealSortTime = (deal: Deal, field: 'lastActivityAt' | 'updatedAt' | 'createdAt'): number => {
    const value = deal[field];
    if (!value) return 0;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  };

  const compareDealsByRecentActivity = (a: Deal, b: Deal): number => {
    return (
      getDealSortTime(b, 'lastActivityAt') - getDealSortTime(a, 'lastActivityAt') ||
      getDealSortTime(b, 'updatedAt') - getDealSortTime(a, 'updatedAt') ||
      getDealSortTime(b, 'createdAt') - getDealSortTime(a, 'createdAt') ||
      b.id - a.id
    );
  };

  const handleSmartDealClick = async (contact: any) => {
    if (!contact?.id || smartDealLoadingContactId !== null) return;

    setSmartDealLoadingContactId(contact.id);

    try {
      const response = await apiRequest('GET', `/api/deals/contact/${contact.id}`);
      const deals: Deal[] = await response.json();
      const activeDeals = deals
        .filter((deal) => deal.status === 'active')
        .sort(compareDealsByRecentActivity);

      if (activeDeals.length > 0) {
        setSelectedDealForEdit(activeDeals[0]);
        setIsEditDealModalOpen(true);
      } else {
        setSelectedContactIdForAddDeal(contact.id);
        setIsAddDealModalOpen(true);
      }
    } catch (error: any) {
      toast({
        title: t('contacts.toast.deal_lookup_failed.title', 'Deal lookup failed'),
        description: error.message || t('contacts.toast.deal_lookup_failed.description', 'Failed to load deals for this contact.'),
        variant: "destructive",
      });
    } finally {
      setSmartDealLoadingContactId(null);
    }
  };

  const handleCloseAddDeal = () => {
    setIsAddDealModalOpen(false);
    setSelectedContactIdForAddDeal(null);
  };

  const handleCloseEditDeal = () => {
    setIsEditDealModalOpen(false);
    setSelectedDealForEdit(null);
  };

  const handleDealSaved = async (savedDeal: Deal, prevContactId?: number | null) => {
    const contactIds = new Set<number>();
    if (savedDeal.contactId) {
      contactIds.add(savedDeal.contactId);
    }
    if (prevContactId) {
      contactIds.add(prevContactId);
    }
    if (selectedContactIdForAddDeal) {
      contactIds.add(selectedContactIdForAddDeal);
    }

    const promises = [
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] }),
    ];

    contactIds.forEach((cId) => {
      promises.push(queryClient.invalidateQueries({ queryKey: [`/api/deals/contact/${cId}`] }));
    });

    await Promise.all(promises);
  };

  const handleDealCreated = (newDeal: Deal) => {
    handleDealSaved(newDeal);
    handleCloseAddDeal();
  };

  const handleDealUpdated = (updatedDeal: Deal) => {
    handleDealSaved(updatedDeal, selectedDealForEdit?.contactId);
    handleCloseEditDeal();
  };

  const { data: pinnedData } = useQuery({
    queryKey: ['/api/conversations/pins'],
    queryFn: async () => {
      const response = await fetch('/api/conversations/pins');
      if (!response.ok) throw new Error('Failed to fetch pinned conversations');
      return response.json();
    },
  });

  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  useEffect(() => {
    setPinnedIds(Array.isArray(pinnedData?.pinnedIds) ? pinnedData.pinnedIds : []);
  }, [pinnedData?.pinnedIds]);

  const pinConversationMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      const response = await apiRequest('POST', `/api/conversations/${conversationId}/pin`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to pin conversation');
      }
      return response.json();
    },
    onSuccess: (_, conversationId) => {
      setPinnedIds(prev => [...prev, conversationId]);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/pins'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('inbox.pin_failed', 'Pin failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const unpinConversationMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      const response = await apiRequest('DELETE', `/api/conversations/${conversationId}/pin`);
      if (!response.ok) throw new Error('Failed to unpin conversation');
      return response.json();
    },
    onSuccess: (_, conversationId) => {
      setPinnedIds(prev => prev.filter(id => id !== conversationId));
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/pins'] });
    },
  });

  const handleTogglePin = (conversationId: number) => {
    const isPinned = pinnedIds.includes(conversationId);
    if (isPinned) {
      unpinConversationMutation.mutate(conversationId);
    } else {
      if (pinnedIds.length >= PINNED_CONVERSATIONS_MAX) {
        toast({
          title: t('inbox.max_pins_reached', 'Maximum pins reached'),
          description: t('inbox.max_pins_description', 'You can pin up to 7 conversations. Unpin one to pin another.'),
          variant: 'destructive',
        });
        return;
      }
      pinConversationMutation.mutate(conversationId);
    }
  };


  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTimeRef = useRef<number>(0);



  useEffect(() => {
    if (canOnlyViewAssignedConversations() && !user?.isSuperAdmin) {
      setFilterStatus('assigned_to_me');
    }
  }, [canOnlyViewAssignedConversations, user?.isSuperAdmin]);


  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 100) return; // Throttle to 100ms
    lastScrollTimeRef.current = now;

    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50; // Reduced threshold for better detection

    if (isNearBottom && conversationsPagination.hasMore && !conversationsPagination.loading) {
      loadMoreConversations();
    }
  }, [conversationsPagination.hasMore, conversationsPagination.loading, conversationsPagination.page, conversationsPagination.total, loadMoreConversations]);


  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleConversationCreated = (conversation: any) => {
    if (conversation && conversation.id) {
      setActiveConversationId(conversation.id);
      if (isMobile) {
        setConversationListOpen(false);
      }
    }
  };

  const handleConversationClick = (conversationId: number) => {
    setActiveConversationId(conversationId);
    emitTourSignal('conversation-selected',conversationId);
    if (isMobile) {
      setConversationListOpen(false);
    }
  };

  const isInitialLoad = isLoadingConversations && conversations.length === 0;

  if (isInitialLoad) {
    return (
      <div className={`
        ${isMobile ? 'w-full' : 'w-80 md:w-[350px] lg:w-[380px]'}
        border-r border-border bg-card flex-shrink-0 overflow-hidden flex flex-col
        ${isMobile ? 'h-full' : ''}
      `}>
        <div className="p-3 sm:p-4 border-b border-border">
          <h2 data-tour="components-conversations-conversationlist.h2.inbox.conversations" className="text-lg font-medium">{t('inbox.conversations', 'Conversations')}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col w-full p-3 sm:p-4 space-y-3">
            <div className="h-10 sm:h-12 bg-muted rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-muted rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-muted rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-muted rounded w-full"></div>
          </div>
        </div>
      </div>
    );
  }



  const filteredConversations = (() => {
    const filtered = conversations
      .filter(conversation => {

        if (activeChannelId !== null) {
          return conversation.channelId === activeChannelId;
        }
        return true;
      })
      .filter(conversation => {


        if (filterStatus === 'all') return true;
        if (filterStatus === 'assigned') return conversation.assignedToUserId !== null;
        if (filterStatus === 'unassigned') return conversation.assignedToUserId === null;
        if (filterStatus === 'assigned_to_me') return true; // Server-side filtered
        return true;
      })
      .filter(conversation => {

        if (!searchQuery) return true;

        const query = searchQuery.toLowerCase().trim();
        const contact = conversation.contact;

        if (!contact) return false;

        if (contact.name?.toLowerCase().includes(query)) {
          return true;
        }

        if (contact.phone?.toLowerCase().includes(query)) {
          return true;
        }

        if (contact.whatsappUsername?.toLowerCase().includes(query.replace(/^@/, ''))) {
          return true;
        }
        if (conversation.channelType === 'instagram' && getInstagramHandle(contact)?.toLowerCase().includes(query)) {
          return true;
        }

        if (contact.email?.toLowerCase().includes(query)) {
          return true;
        }

        if (contact.tags && Array.isArray(contact.tags)) {
          return contact.tags.some((tag: string) =>
            tag.toLowerCase().includes(query)
          );
        }

        return false;
      });
    const pinnedSet = new Set(pinnedIds);
    const pinned = pinnedIds
      .map(id => filtered.find(c => c.id === id))
      .filter((c): c is typeof filtered[0] => !!c);
    const unpinned = filtered.filter(c => !pinnedSet.has(c.id));
    return [...pinned, ...unpinned];
  })();

  return (
    <div
      data-tour="conversation-list"
      className={`
        ${isMobile ? 'w-full' : 'w-80 md:w-[350px] lg:w-[380px]'}
        border-r border-border bg-card flex-shrink-0 overflow-hidden flex flex-col
        ${isMobile ? 'h-full' : ''}
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3 sm:p-4 border-b border-border flex justify-between items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button data-tour="components-conversations-conversationlist.button.inbox.close_conversations"
                onClick={toggleConversationList}
                className="p-2 rounded-md hover:bg-accent lg:hidden"
                aria-label={t('inbox.close_conversations', 'Close conversations')}
              >
                <i className="ri-close-line text-lg text-muted-foreground"></i>
              </button>
            )}
          </div>

          {/* Channel Selector */}
          <div className="mt-2">
            <ChannelSelector
              activeChannelId={activeChannelId}
              onChannelChange={setActiveChannelId}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex space-x-2 ml-2">
          <button data-tour="components-conversations-conversationlist.button.inbox.start_new_conversation"
            className="p-2 sm:p-1.5 rounded-md bg-primary-50 text-primary-600 hover:bg-primary-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setIsNewConversationModalOpen(true)}
            title={t('inbox.start_new_conversation', 'Start new conversation')}
          >
            <i className="ri-user-add-line text-lg sm:text-base"></i>
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4 border-b border-border flex items-center bg-muted/50">
        <div className="relative flex-1">
          <input data-tour="components-conversations-conversationlist.input.inbox.search_conversations_enhanced"
            type="search"
            placeholder={t('inbox.search_conversations_enhanced', 'Search by name, tag, phone, email...')}
            className="w-full pl-9 pr-4 py-3 sm:py-2 rounded-lg border border-input bg-background text-base sm:text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <i className="ri-search-line absolute left-3 top-3.5 sm:top-2.5 text-muted-foreground"></i>
        </div>
      </div>

      <div className="border-b border-border">
        <div className="flex w-full min-w-0 overflow-x-auto horizontal-scrollbar scroll-smooth px-3 sm:px-4 py-2 pb-2.5">
          <div className="flex gap-1 min-w-max">
            {(canViewAllConversations() || user?.isSuperAdmin) && (
              <button data-tour="components-conversations-conversationlist.button.inbox.filter.all"
                className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
                  filterStatus === 'all'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-background border border-input text-foreground hover:bg-accent'
                }`}
                onClick={() => setFilterStatus('all')}
              >
                {t('inbox.filter.all', 'All')}
              </button>
            )}

            {(canViewAllConversations() || user?.isSuperAdmin) && (
              <button data-tour="components-conversations-conversationlist.button.inbox.filter.unassigned"
                className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
                  filterStatus === 'unassigned'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-background border border-input text-foreground hover:bg-accent'
                }`}
                onClick={() => setFilterStatus('unassigned')}
              >
                {t('inbox.filter.unassigned', 'Unassigned')}
              </button>
            )}

            <button data-tour="components-conversations-conversationlist.button.inbox.filter.my_chats"
              className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
                filterStatus === 'assigned_to_me'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-background border border-input text-foreground hover:bg-accent'
              }`}
              onClick={() => setFilterStatus('assigned_to_me')}
            >
              {t('inbox.filter.my_chats', 'My Chats')}
            </button>

            {(canViewAllConversations() || user?.isSuperAdmin) && (
              <button data-tour="components-conversations-conversationlist.button.inbox.filter.assigned"
                className={`flex-shrink-0 px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
                  filterStatus === 'assigned'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-background border border-input text-foreground hover:bg-accent'
                }`}
                onClick={() => setFilterStatus('assigned')}
              >
                {t('inbox.filter.assigned', 'Assigned')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contacts without conversations section */}
      <ContactsWithoutConversations
        onConversationCreated={(conversationId) => {

          setActiveConversationId(conversationId);
        }}
      />

      <div
        ref={scrollContainerRef}
        className="overflow-y-auto flex-1 scrollbar-hide"
        data-conversation-list
        style={{
          maxHeight: 'calc(100vh - 300px)',
          minHeight: '200px' // Ensure minimum height for scroll detection
        }}
      >
        {filteredConversations.length === 0 && !isLoadingConversations ? (
          <div className="p-4 sm:p-6 text-center text-muted-foreground">
            <div className="text-sm sm:text-base">
              {t('inbox.no_conversations_found', 'No conversations found')}
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const pinnedCount = filteredConversations.filter(c => pinnedIds.includes(c.id)).length;
              return pinnedCount > 0 ? (
                <div className="px-3 py-2 bg-muted/30 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    {t('inbox.pinned', 'Pinned')} ({pinnedCount}/{PINNED_CONVERSATIONS_MAX})
                  </span>
                </div>
              ) : null;
            })()}
            {filteredConversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onClick={() => handleConversationClick(conversation.id)}
                searchQuery={searchQuery}
                isPinned={pinnedIds.includes(conversation.id)}
                onTogglePin={(e) => {
                  e.stopPropagation();
                  handleTogglePin(conversation.id);
                }}
                showChannelBadge={activeChannelId === null}
                showDealAction={canAccessPipeline() && !conversation.isGroup && !!conversation.contact?.id}
                dealActionLoading={smartDealLoadingContactId === conversation.contact?.id}
                onDealActionClick={() => handleSmartDealClick(conversation.contact)}
              />
            ))}

            {/* Loading indicator for infinite scroll */}
            {conversationsPagination.loading && (
              <div className="flex items-center justify-center p-6 border-t border-border">
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-full">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  <span className="text-sm text-muted-foreground font-medium">
                    {t('inbox.loading_more_conversations', 'Loading more conversations...')}
                  </span>
                </div>
              </div>
            )}

            {/* Manual load more button as fallback */}
            {!conversationsPagination.loading && conversationsPagination.hasMore && filteredConversations.length > 0 && (
              <div className="p-4 border-t border-border">
                <button data-tour="components-conversations-conversationlist.button.inbox.load_more_conversations"
                  onClick={loadMoreConversations}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg border border-border hover:border-input hover:shadow-sm transition-all duration-200 group active:scale-[0.98]"
                >
                  <i className="ri-arrow-down-line text-base group-hover:translate-y-0.5 transition-transform duration-200"></i>
                  {t('inbox.load_more_conversations', 'Load More Conversations')}
                  <span className="text-xs text-muted-foreground ml-1 bg-muted px-2 py-0.5 rounded-full group-hover:bg-muted/80 transition-colors duration-200">
                    {conversationsPagination.total - filteredConversations.length} more
                  </span>
                </button>
              </div>
            )}

            {/* End of list indicator */}
            {!conversationsPagination.hasMore && filteredConversations.length > 0 && (
              <div className="p-4 border-t border-border">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <i className="ri-check-line text-base"></i>
                  <span>{t('inbox.all_conversations_loaded', 'All conversations loaded')}</span>
                  <span className="text-xs">({filteredConversations.length} total)</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <NewConversationModal
        isOpen={isNewConversationModalOpen}
        onClose={() => setIsNewConversationModalOpen(false)}
        onConversationCreated={handleConversationCreated}
      />

      {(isAddDealModalOpen || isEditDealModalOpen) && (
        <PipelineProvider syncUrl={false}>
          {selectedContactIdForAddDeal !== null && (
            <AddDealModal
              isOpen={isAddDealModalOpen}
              onClose={handleCloseAddDeal}
              inboxCreateMode={true}
              initialContactId={selectedContactIdForAddDeal}
              onDealCreated={handleDealCreated}
            />
          )}
          {selectedDealForEdit && (
            <EditDealModal
              isOpen={isEditDealModalOpen}
              onClose={handleCloseEditDeal}
              deal={selectedDealForEdit}
              showPipelineSelector={true}
              lockContact={true}
              onDealUpdated={handleDealUpdated}
            />
          )}
        </PipelineProvider>
      )}
    </div>
  );
}

