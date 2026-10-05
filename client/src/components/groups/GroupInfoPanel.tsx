import ConversationMediaGallery from '@/components/conversations/ConversationMediaGallery';
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Crown,
  Shield,
  Phone,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2
} from "lucide-react";
import { GroupAvatar } from "./GroupAvatar";
import { GroupParticipantAvatar } from "./GroupParticipantAvatar";
import { ClearChatHistoryDialog } from "@/components/conversations/ClearChatHistoryDialog";
import { useTranslation } from "@/hooks/use-translation";
import { useMobileLayout } from "@/contexts/mobile-layout-context";
import { useParticipantProfilePictures } from "@/hooks/use-participant-profile-pictures";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface GroupParticipant {
  id: string;
  name?: string;
  phone?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  avatarUrl?: string | null;
  displayName?: string;
  hasDisplayName?: boolean;
  contactId?: number;
}

interface StoredGroupParticipant {
  participantJid: string;
  participantName?: string | null;
  phoneNumber?: string | null;
  contact?: {
    id: number;
    name: string;
    phone?: string | null;
  } | null;
}

interface GroupParticipantsResponse {
  participants: StoredGroupParticipant[];
}

function normalizeWhatsAppPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!normalized) return undefined;

  const phoneJidMatch = normalized.match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/i);
  if (phoneJidMatch) return phoneJidMatch[1];

  // A LID (or any other non-PN JID) must never be presented as a phone number.
  if (normalized.includes("@")) return undefined;

  const digits = normalized.replace(/\D/g, "");
  return digits || undefined;
}

function formatPhoneNumber(phone: string): string {
  return `+${phone}`;
}

interface ContactsResponse {
  contacts: Array<{
    id: number;
    name: string;
    identifier: string;
    identifierType: string;
  }>;
}

interface GroupInfoPanelProps {
  conversation: {
    id: number;
    groupName?: string;
    groupDescription?: string;
    groupJid?: string;
    groupParticipantCount?: number;
    groupCreatedAt?: string;
    groupMetadata?: any;
    channelId?: number;
  };
  className?: string;
}

export function GroupInfoPanel({ conversation, className }: GroupInfoPanelProps) {
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const { t, currentLanguage } = useTranslation();
  const { toggleContactDetails } = useMobileLayout();


  const formatDate = (dateString?: string) => {
    if (!dateString) return t('common.unknown', 'Unknown');
    return new Date(dateString).toLocaleDateString(currentLanguage?.code);
  };


  const { data: contactsData } = useQuery<ContactsResponse>({
    queryKey: ['/api/contacts'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: storedParticipantsData } = useQuery<GroupParticipantsResponse>({
    queryKey: ['/api/group-conversations', conversation.id, 'participants'],
    queryFn: async () => {
      const response = await fetch(`/api/group-conversations/${conversation.id}/participants`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch group participants');
      return response.json();
    },
    enabled: !!conversation.id,
    staleTime: 60 * 1000,
  });

  const storedParticipantsByJid = new Map(
    (storedParticipantsData?.participants || []).map(participant => [participant.participantJid, participant])
  );

  const participants: GroupParticipant[] = conversation.groupMetadata?.participants?.map((p: any) => {
    const storedParticipant = storedParticipantsByJid.get(p.id);
    return {
      id: p.id,
      name: p.notify || p.displayName || p.name || undefined,
      phone: normalizeWhatsAppPhone(p.phoneNumber) ||
        normalizeWhatsAppPhone(p.pn) ||
        normalizeWhatsAppPhone(p.phone) ||
        normalizeWhatsAppPhone(storedParticipant?.phoneNumber) ||
        normalizeWhatsAppPhone(storedParticipant?.contact?.phone) ||
        normalizeWhatsAppPhone(p.id),
      isAdmin: p.admin === 'admin',
      isSuperAdmin: p.admin === 'superadmin',
      avatarUrl: null
    };
  }) || [];


  const enhancedParticipants = participants.map(participant => {
    const storedParticipant = storedParticipantsByJid.get(participant.id);
    const matchingContact = contactsData?.contacts?.find((contact: any) =>
      contact.identifierType === 'whatsapp' &&
      normalizeWhatsAppPhone(contact.identifier) === participant.phone
    );

    const fallbackIdentity = participant.phone ? formatPhoneNumber(participant.phone) : participant.id;
    const localJid = participant.id.split('@')[0].split(':')[0];
    const realName = [
      participant.name,
      storedParticipant?.contact?.name,
      storedParticipant?.participantName,
      matchingContact?.name,
    ]
      .map(value => value?.trim())
      .find(value => !!value &&
        value !== participant.id &&
        value !== localJid &&
        normalizeWhatsAppPhone(value) !== participant.phone);
    const displayName = realName || fallbackIdentity;

    return {
      ...participant,
      displayName,
      hasDisplayName: !!realName,
      contactId: storedParticipant?.contact?.id || matchingContact?.id
    };
  });


  const participantJids = enhancedParticipants.map(p => p.id);


  const {
    participantPictures,
    isLoading: isLoadingPictures,
    refreshParticipantPictures
  } = useParticipantProfilePictures({
    connectionId: conversation.channelId,
    conversationId: conversation.id,
    participantJids,
    enabled: participantJids.length > 0 && !!conversation.channelId
  });


  const participantsWithPictures = enhancedParticipants.map(participant => ({
    ...participant,
    avatarUrl: participantPictures[participant.id] || null
  }));
  
  const displayedParticipants = showAllParticipants ? participantsWithPictures : participantsWithPictures.slice(0, 5);
  const hasMoreParticipants = participantsWithPictures.length > 5;

  const handleRefreshParticipantPictures = () => {
    refreshParticipantPictures();
  };



  
  return (
    <div className={cn("h-full min-w-0 overflow-x-hidden overflow-y-auto bg-card", className)} onClick={(e) => e.stopPropagation()}>
      {/* Mobile header */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border p-4 lg:hidden">
        <h2 className="min-w-0 truncate text-lg font-medium">{t('groups.group_info', 'Group Info')}</h2>
        <button
          onClick={toggleContactDetails}
          className="p-2 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={t('groups.close_group_info', 'Close group info')}
        >
          <i className="ri-close-line text-lg text-muted-foreground"></i>
        </button>
      </div>

      {/* Group header */}
      <div className="p-4 border-b border-border">
        <div className="flex min-w-0 items-center gap-3">
          <GroupAvatar
            groupName={conversation.groupName || 'Group'}
            groupJid={conversation.groupJid}
            connectionId={conversation.channelId}
            conversationId={conversation.id}
            groupMetadata={conversation.groupMetadata}
            size="lg"
            showRefreshButton={true}
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate">
              {conversation.groupName || t('groups.unnamed_group', 'Unnamed Group')}
            </h3>
            <div className="flex items-center text-sm text-muted-foreground mt-1">
              <Users className="h-4 w-4 mr-1" />
              {conversation.groupParticipantCount || participants.length} {t('groups.participants', 'participants')}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-4 p-3 sm:p-4">
        {/* Group Description */}
        {conversation.groupDescription && (
          <div>
            <h4 className="text-sm font-medium mb-2">{t('groups.description', 'Description')}</h4>
            <p className="break-words text-sm text-muted-foreground">{conversation.groupDescription}</p>
          </div>
        )}
        
        {/* Group Details */}
        <div className="space-y-3">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
            <span className="text-sm font-medium">{t('groups.group_id', 'Group ID')}</span>
            <span className="min-w-0 break-all text-right font-mono text-sm text-muted-foreground">
              {conversation.groupJid?.split('@')[0]}
            </span>
          </div>
          
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
            <span className="text-sm font-medium">{t('groups.created_date', 'Created')}</span>
            <span className="min-w-0 break-words text-right text-sm text-muted-foreground">
              {formatDate(conversation.groupCreatedAt)}
            </span>
          </div>
        </div>

        <ConversationMediaGallery conversationId={conversation.id} />
        <Separator />

        {/* Actions Section */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => setShowClearHistoryDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('clear_history.button', 'Clear Chat History')}
          </Button>
        </div>

        <Separator />

        {/* Participants Section */}
        <div>
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h4 className="flex min-w-0 items-center text-sm font-medium">
              <Users className="mr-2 h-4 w-4 shrink-0" />
              {t('groups.participants', 'Participants')} ({participantsWithPictures.length})
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshParticipantPictures}
              disabled={isLoadingPictures}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn("h-4 w-4", isLoadingPictures && "animate-spin")} />
            </Button>
          </div>
          
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {displayedParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex min-w-0 items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                >
                  <GroupParticipantAvatar
                    participantJid={participant.id}
                    participantName={participant.displayName}
                    connectionId={conversation.channelId}
                    conversationId={conversation.id}
                    avatarUrl={participant.avatarUrl}
                    size="md"
                    className="shrink-0"
                    enableAutoFetch={false} // We're already fetching in bulk
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="min-w-0 break-all text-sm font-medium">
                        {participant.displayName}
                      </span>
                      {participant.isSuperAdmin && (
                        <Badge variant="destructive" className="h-5 shrink-0 px-1.5 py-0.5 text-[10px]">
                          <Crown className="mr-1 h-2.5 w-2.5" />
                          {t('groups.super_admin', 'Group Admin')}
                        </Badge>
                      )}
                      {participant.isAdmin && !participant.isSuperAdmin && (
                        <Badge variant="secondary" className="h-5 shrink-0 px-1.5 py-0.5 text-[10px]">
                          <Shield className="mr-1 h-2.5 w-2.5" />
                          {t('groups.admin', 'Admin')}
                        </Badge>
                      )}
                    </div>
                    {participant.phone && participant.hasDisplayName && (
                      <div className="flex min-w-0 items-start text-xs text-muted-foreground">
                        <Phone className="mr-1 mt-0.5 h-3 w-3 shrink-0" />
                        <span className="break-all">{formatPhoneNumber(participant.phone)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          {hasMoreParticipants && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2"
              onClick={() => setShowAllParticipants(!showAllParticipants)}
            >
              {showAllParticipants ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  {t('groups.show_less', 'Show Less')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  {t('groups.show_more', 'Show More')} ({participantsWithPictures.length - 5})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Clear Chat History Dialog */}
      <ClearChatHistoryDialog
        isOpen={showClearHistoryDialog}
        onClose={() => setShowClearHistoryDialog(false)}
        conversationId={conversation.id}
        conversationName={conversation.groupName || t('groups.unnamed_group', 'Unnamed Group')}
        isGroupChat={true}
        onSuccess={() => {

        }}
      />
    </div>
  );
}
