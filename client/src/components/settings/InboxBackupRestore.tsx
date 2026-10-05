import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Download,
  Upload,
  Trash2,
  Database,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Users,
  HardDrive,
} from 'lucide-react';
import { format } from 'date-fns';

interface Backup {
  id: number;
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  type: 'manual' | 'scheduled';
  fileSize?: number;
  compressedSize?: number;
  totalContacts: number;
  totalConversations: number;
  totalMessages: number;
  metadata?: {
    version?: string;
    totalChannelRelationships?: number;
    totalChannelConnections?: number;
    [key: string]: any;
  };
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

interface CreateBackupData {
  name: string;
  description?: string;
  includeContacts: boolean;
  includeConversations: boolean;
  includeMessages: boolean;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

export function InboxBackupRestore() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateBackupDialog, setShowCreateBackupDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [createBackupData, setCreateBackupData] = useState<CreateBackupData>({
    name: '',
    description: '',
    includeContacts: true,
    includeConversations: true,
    includeMessages: true,
    dateRangeStart: '',
    dateRangeEnd: ''
  });


  const { data: backupsData, isLoading: isLoadingBackups, refetch: refetchBackups } = useQuery({
    queryKey: ['/api/inbox/backups'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/inbox/backups');
      if (!response.ok) {
        throw new Error('Failed to fetch backups');
      }
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds to update status
  });


  const createBackupMutation = useMutation({
    mutationFn: async (data: CreateBackupData) => {
      const response = await apiRequest('POST', '/api/inbox/backups', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create backup');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('backup.create_success_title', 'Backup Started'),
        description: t('backup.create_success_desc', 'Your backup has been queued and will be processed shortly.'),
      });
      setShowCreateBackupDialog(false);
      setCreateBackupData({
        name: '',
        description: '',
        includeContacts: true,
        includeConversations: true,
        includeMessages: true,
        dateRangeStart: '',
        dateRangeEnd: ''
      });
      refetchBackups();
    },
    onError: (error: Error) => {
      toast({
        title: t('backup.create_error_title', 'Backup Failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: number) => {
      const response = await apiRequest('DELETE', `/api/inbox/backups/${backupId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete backup');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('backup.delete_success_title', 'Backup Deleted'),
        description: t('backup.delete_success_desc', 'The backup has been deleted successfully.'),
      });
      setShowDeleteDialog(false);
      setSelectedBackup(null);
      refetchBackups();
    },
    onError: (error: Error) => {
      toast({
        title: t('backup.delete_error_title', 'Delete Failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateBackup = () => {
    if (!createBackupData.name.trim()) {
      toast({
        title: t('backup.validation_error', 'Validation Error'),
        description: t('backup.name_required', 'Backup name is required'),
        variant: 'destructive',
      });
      return;
    }

    createBackupMutation.mutate(createBackupData);
  };

  const handleDownloadBackup = async (backup: Backup) => {
    if (backup.status !== 'completed') {
      toast({
        title: t('backup.download_error_title', 'Download Error'),
        description: t('backup.download_not_ready', 'Backup is not ready for download'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`/api/inbox/backups/${backup.id}/download`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download backup');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${backup.name}.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('backup.download_success_title', 'Download Started'),
        description: t('backup.download_success_desc', 'Your backup file is being downloaded.'),
      });
    } catch (error) {
      toast({
        title: t('backup.download_error_title', 'Download Failed'),
        description: t('backup.download_error_desc', 'Failed to download backup file'),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteBackup = (backup: Backup) => {
    setSelectedBackup(backup);
    setShowDeleteDialog(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Create Backup Section */}
      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Database className="h-5 w-5" />
            {t('backup.title', 'Inbox Backup & Restore')}
          </CardTitle>
          <CardDescription>
            {t('backup.description', 'Create backups of your inbox data and restore from previous backups. Media files are excluded to keep backup sizes manageable.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button data-tour="components-settings-inboxbackuprestore.button.backup.create_backup"
              onClick={() => setShowCreateBackupDialog(true)}
              className="flex items-center gap-2"
              disabled={createBackupMutation.isPending}
            >
              {createBackupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('backup.create_backup', 'Create Backup')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <FileText className="h-5 w-5" />
            {t('backup.history_title', 'Backup History')}
          </CardTitle>
          <CardDescription>
            {t('backup.history_description', 'View and manage your backup files')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingBackups ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : backupsData?.backups?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('backup.no_backups', 'No backups found')}</p>
              <p className="text-sm">{t('backup.create_first_backup', 'Create your first backup to get started')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {backupsData?.backups?.map((backup: Backup) => (
                <div key={backup.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(backup.status)}
                        <h3 className="font-medium">{backup.name}</h3>
                        <Badge variant="secondary" className={getStatusColor(backup.status)}>
                          {t(`backup.status.${backup.status}`, backup.status)}
                        </Badge>
                        {backup.type === 'scheduled' && (
                          <Badge variant="outline">
                            {t('backup.scheduled', 'Scheduled')}
                          </Badge>
                        )}
                      </div>

                      {backup.description && (
                        <p className="text-sm text-muted-foreground mb-2">{backup.description}</p>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {backup.totalContacts} {t('backup.contacts', 'contacts')}
                        </div>
                        <div className="flex items-center gap-1">
                          <InboxConversationIcon className="h-3 w-3" />
                          {backup.totalConversations} {t('backup.conversations', 'conversations')}
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {backup.totalMessages} {t('backup.messages', 'messages')}
                        </div>
                        {backup.metadata?.totalChannelRelationships && (
                          <div className="flex items-center gap-1">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            {backup.metadata.totalChannelRelationships} {t('backup.channel_relationships', 'channel links')}
                          </div>
                        )}
                        {backup.compressedSize && (
                          <div className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {formatFileSize(backup.compressedSize)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{t('backup.created', 'Created')}: {format(new Date(backup.createdAt), 'PPp')}</span>
                        {backup.completedAt && (
                          <span>{t('backup.completed', 'Completed')}: {format(new Date(backup.completedAt), 'PPp')}</span>
                        )}
                      </div>

                      {backup.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          {backup.errorMessage}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {backup.status === 'completed' && (
                        <Button data-tour="components-settings-inboxbackuprestore.button.backup.download"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadBackup(backup)}
                          className="flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" />
                          {t('backup.download', 'Download')}
                        </Button>
                      )}
                      <Button data-tour="components-settings-inboxbackuprestore.button.backup.delete"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteBackup(backup)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700"
                        disabled={deleteBackupMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                        {t('backup.delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Backup Dialog */}
      <Dialog open={showCreateBackupDialog} onOpenChange={setShowCreateBackupDialog}>
        <DialogContent data-tour="components-settings-inboxbackuprestore.dialogcontent.backup.create_backup_title" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('backup.create_backup_title', 'Create New Backup')}</DialogTitle>
            <DialogDescription>
              {t('backup.create_backup_desc', 'Configure your backup settings. Media files will be excluded to keep the backup size manageable.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="backup-name">{t('backup.name', 'Backup Name')}</Label>
              <Input data-tour="components-settings-inboxbackuprestore.input.backup.name_placeholder"
                id="backup-name"
                value={createBackupData.name}
                onChange={(e) => setCreateBackupData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('backup.name_placeholder', 'Enter backup name')}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="backup-description">{t('backup.description_optional', 'Description (Optional)')}</Label>
              <Textarea data-tour="components-settings-inboxbackuprestore.textarea.backup.description_placeholder"
                id="backup-description"
                value={createBackupData.description}
                onChange={(e) => setCreateBackupData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('backup.description_placeholder', 'Enter backup description')}
                className="mt-1"
                rows={3}
              />
            </div>

            <Separator />

            <div>
              <Label className="text-base font-medium">{t('backup.include_data', 'Include Data')}</Label>
              <div className="space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <Label htmlFor="include-contacts">{t('backup.include_contacts', 'Contacts')}</Label>
                  </div>
                  <Switch
                    id="include-contacts"
                    checked={createBackupData.includeContacts}
                    onCheckedChange={(checked) => setCreateBackupData(prev => ({ ...prev, includeContacts: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <InboxConversationIcon className="h-4 w-4" />
                    <Label htmlFor="include-conversations">{t('backup.include_conversations', 'Conversations')}</Label>
                  </div>
                  <Switch
                    id="include-conversations"
                    checked={createBackupData.includeConversations}
                    onCheckedChange={(checked) => setCreateBackupData(prev => ({ ...prev, includeConversations: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <Label htmlFor="include-messages">{t('backup.include_messages', 'Messages (Text Only)')}</Label>
                  </div>
                  <Switch
                    id="include-messages"
                    checked={createBackupData.includeMessages}
                    onCheckedChange={(checked) => setCreateBackupData(prev => ({ ...prev, includeMessages: checked }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-base font-medium">{t('backup.date_range', 'Date Range (Optional)')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label htmlFor="date-start" className="text-sm">{t('backup.start_date', 'Start Date')}</Label>
                  <Input data-tour="components-settings-inboxbackuprestore.input.date-start"
                    id="date-start"
                    type="date"
                    value={createBackupData.dateRangeStart}
                    onChange={(e) => setCreateBackupData(prev => ({ ...prev, dateRangeStart: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="date-end" className="text-sm">{t('backup.end_date', 'End Date')}</Label>
                  <Input data-tour="components-settings-inboxbackuprestore.input.date-end"
                    id="date-end"
                    type="date"
                    value={createBackupData.dateRangeEnd}
                    onChange={(e) => setCreateBackupData(prev => ({ ...prev, dateRangeEnd: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="components-settings-inboxbackuprestore.button.common.cancel"
              variant="outline"
              onClick={() => setShowCreateBackupDialog(false)}
              disabled={createBackupMutation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-inboxbackuprestore.button.backup.create"
              onClick={handleCreateBackup}
              disabled={createBackupMutation.isPending}
              className="flex items-center gap-2"
            >
              {createBackupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              {t('backup.create', 'Create Backup')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backup.delete_confirm_title', 'Delete Backup')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('backup.delete_confirm_desc', 'Are you sure you want to delete this backup? This action cannot be undone.')}
              {selectedBackup && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                  <strong>{selectedBackup.name}</strong>
                  {selectedBackup.description && <div className="text-muted-foreground">{selectedBackup.description}</div>}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBackupMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedBackup && deleteBackupMutation.mutate(selectedBackup.id)}
              disabled={deleteBackupMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteBackupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t('backup.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


