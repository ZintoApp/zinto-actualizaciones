import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GroupParticipantAvatar } from '@/components/groups/GroupParticipantAvatar';
import { Loader2, Search, Users, Crown, Shield } from 'lucide-react';
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';
import { toast } from '@/hooks/use-toast';
import { useParticipantProfilePictures } from '@/hooks/use-participant-profile-pictures';

interface GroupParticipant {
  id: number;
  conversationId: number;
  contactId?: number;
  participantJid: string;
  phoneNumber?: string | null;
  participantName?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  joinedAt?: string;
  leftAt?: string;
  isActive: boolean;
  contact?: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    notes?: string;
  };
}

interface GroupParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  groupName?: string;
  connectionId?: number;
}

export default function GroupParticipantsModal({
  isOpen,
  onClose,
  conversationId,
  groupName,
  connectionId
}: GroupParticipantsModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: participantsData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/group-conversations', conversationId, 'participants'],
    queryFn: async () => {
      const response = await fetch(`/api/group-conversations/${conversationId}/participants`);
      if (!response.ok) throw new Error('Failed to fetch participants');
      return response.json();
    },
    enabled: isOpen && !!conversationId
  });

  const handleSyncParticipants = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/group-conversations/${conversationId}/participants/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(t('groups.participants.sync_error', 'Failed to sync participants'));
      }

      await refetch();

      toast({
        title: t('groups.participants.sync_success', 'Sync successful'),
        description: t('groups.participants.sync_success_desc', 'Participants have been synced from WhatsApp. Names will appear as participants send messages.'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('groups.participants.sync_error', 'Failed to sync participants'),
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const participants: GroupParticipant[] = participantsData?.participants || [];
  const participantJids = participants.map(participant => participant.participantJid);
  const { participantPictures } = useParticipantProfilePictures({
    connectionId,
    conversationId,
    participantJids,
    enabled: isOpen && participantJids.length > 0 && !!connectionId,
  });


  const filteredParticipants = participants.filter(participant => {
    const name = participant.participantName || participant.contact?.name || '';
    const phone = participant.contact?.phone || participant.phoneNumber || participant.participantJid || '';
    const searchLower = searchQuery.toLowerCase();
    
    return name.toLowerCase().includes(searchLower) || 
           phone.toLowerCase().includes(searchLower);
  });

  const handleExport = async (format: DownloadExportFormat) => {
    try {
      setIsExporting(true);
      const response = await fetch(`/api/group-conversations/${conversationId}/participants/export?format=${format}`);
      await downloadExportResponse(response, `${groupName || 'group'}-participants`, format);

      toast({
        title: t('groups.participants.export_success', 'Export successful'),
        description: t('groups.participants.export_success_desc', 'Participants list has been exported.'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('groups.participants.export_error', 'Failed to export participants list'),
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getRoleIcon = (participant: GroupParticipant) => {
    if (participant.isSuperAdmin) {
      return <Crown className="h-4 w-4 text-amber-500 dark:text-amber-400" />;
    }
    if (participant.isAdmin) {
      return <Shield className="h-4 w-4 text-primary" />;
    }
    return null;
  };

  const getRoleText = (participant: GroupParticipant) => {
    if (participant.isSuperAdmin) {
      return t('groups.participants.super_admin', 'Super Admin');
    }
    if (participant.isAdmin) {
      return t('groups.participants.admin', 'Admin');
    }
    return t('groups.participants.member', 'Member');
  };

  const getRoleBadgeVariant = (participant: GroupParticipant): "default" | "secondary" | "destructive" | "outline" => {
    if (participant.isSuperAdmin) return "default";
    if (participant.isAdmin) return "secondary";
    return "outline";
  };

  const getParticipantDisplayName = (participant: GroupParticipant) => {

   


    const participantName = participant.participantName;
    const contactName = participant.contact?.name;
    const rawJid = participant.participantJid;
    const rawId = rawJid.split('@')[0];
    const isLidFormat = rawJid.includes('@lid');
    const displayId = isLidFormat ? `LID-${rawId}` : rawId;

   


    if (participantName && participantName !== rawJid && participantName !== rawId && participantName !== displayId) {
      return participantName;
    }


    if (contactName && contactName !== rawId && contactName !== displayId) {
      return contactName;
    }

    return null; // No display name available, will show ID
  };

  const getFormattedPhoneNumber = (participant: GroupParticipant) => {
    const rawJid = participant.participantJid;
    const rawId = rawJid.split('@')[0];

    


    const mappedPhoneJid = participant.phoneNumber;
    const resolvedPhone = mappedPhoneJid?.includes('@')
      ? mappedPhoneJid.slice(0, mappedPhoneJid.indexOf('@')).split(':')[0]
      : mappedPhoneJid;
    if (resolvedPhone) {

      if (resolvedPhone.length > 10) {
        const formatted = `+${resolvedPhone.slice(0, -10)} ${resolvedPhone.slice(-10, -7)} ${resolvedPhone.slice(-7, -4)} ${resolvedPhone.slice(-4)}`;
        return formatted;
      } else {
        const formatted = `+${resolvedPhone}`;
        return formatted;
      }
    }


    const isLidFormat = rawJid.includes('@lid');
    const isWhatsAppFormat = rawJid.includes('@s.whatsapp.net');

    if (isLidFormat) {

      const formatted = `LID-${rawId}`;

      return formatted;
    } else if (isWhatsAppFormat && rawId && rawId.length > 10) {

      const formatted = `+${rawId.slice(0, -10)} ${rawId.slice(-10, -7)} ${rawId.slice(-7, -4)} ${rawId.slice(-4)}`;
      return formatted;
    } else {

      const fallback = isWhatsAppFormat ? `+${rawId}` : rawId;
      return fallback;
    }
  };

  const getParticipantStatus = (participant: GroupParticipant) => {

    if (participant.contact?.notes && participant.contact.notes.startsWith('Status: ')) {
      return participant.contact.notes.substring(8);
    }
    return t('groups.participants.default_status', 'Hey there! I am using WhatsApp.');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2 pr-8">
            <Users className="h-5 w-5 shrink-0" />
            <span>{t('groups.participants.title', 'Group Participants')}</span>
            {groupName && (
              <span className="min-w-0 break-words text-sm font-normal text-muted-foreground">
                - {groupName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search and Export Controls */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('groups.participants.search_placeholder', 'Search participants...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Button
                onClick={handleSyncParticipants}
                disabled={isSyncing}
                variant="outline"
                size="sm"
                className="min-w-0 flex-1 sm:flex-none"
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <i className="ri-refresh-line w-4 h-4 mr-2"></i>
                )}
                {t('groups.participants.sync_participants', 'Sync Participants')}
              </Button>
              <ExportFormatMenu
                onExport={handleExport}
                loading={isExporting}
                disabled={participants.length === 0}
                className="min-w-0 flex-1 sm:flex-none"
              />
            </div>
          </div>

          {/* Participants Count */}
          <div className="text-sm text-muted-foreground">
            {t('groups.participants.showing_count', 'Showing {{count}} of {{total}} participants', {
              count: filteredParticipants.length,
              total: participants.length
            })}
          </div>

          {/* Info Message */}
          <div className="rounded border border-primary/20 border-l-4 bg-primary/5 p-2 text-xs text-muted-foreground">
            <i className="ri-information-line mr-1"></i>
            {t('groups.participants.name_info', 'Participant names appear when they send messages. Phone numbers are shown for participants who haven\'t been active yet.')}
          </div>

          {/* Participants List */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                {t('groups.participants.loading', 'Loading participants...')}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center p-8 text-destructive">
                {t('groups.participants.error', 'Failed to load participants')}
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                {searchQuery ? 
                  t('groups.participants.no_results', 'No participants found matching your search') :
                  t('groups.participants.no_participants', 'No participants found')
                }
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredParticipants.map((participant) => {
                  const displayName = getParticipantDisplayName(participant);
                  const phoneNumber = getFormattedPhoneNumber(participant);
                  const status = getParticipantStatus(participant);

                  return (
                    <div key={participant.id} className="p-3 transition-colors hover:bg-muted/50">
                      <div className="flex min-w-0 flex-wrap items-start gap-3 sm:flex-nowrap">
                        {/* Profile Picture */}
                        <GroupParticipantAvatar
                          participantJid={participant.participantJid}
                          participantName={displayName || phoneNumber}
                          connectionId={connectionId}
                          conversationId={conversationId}
                          avatarUrl={participant.contact?.avatarUrl || participantPictures[participant.participantJid]}
                          size="lg"
                          enableAutoFetch={false}
                        />

                        {/* Name and Status */}
                        <div className="flex-1 min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {displayName && (
                              <h4 className="min-w-0 break-words text-base font-medium text-foreground">
                                {displayName}
                              </h4>
                            )}
                            {getRoleIcon(participant)}
                            {(participant.isAdmin || participant.isSuperAdmin) && (
                              <Badge variant={getRoleBadgeVariant(participant)} className="text-xs">
                                {getRoleText(participant)}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {status}
                          </p>
                        </div>

                        {/* Phone Number */}
                        <div className="w-full break-all pl-[3.25rem] text-left font-mono text-sm text-muted-foreground sm:w-auto sm:shrink-0 sm:pl-0 sm:text-right">
                          {phoneNumber}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
