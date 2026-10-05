import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  Upload,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Users,
  Database,
} from 'lucide-react';
import { format } from 'date-fns';

interface Backup {
  id: number;
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  totalContacts: number;
  totalConversations: number;
  totalMessages: number;
  createdAt: string;
  completedAt?: string;
}

interface Restore {
  id: number;
  backupId?: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  restoreType: 'full' | 'selective';
  conflictResolution: 'merge' | 'overwrite' | 'skip';
  totalItemsToRestore: number;
  itemsRestored: number;
  itemsSkipped: number;
  itemsErrored: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

interface RestoreData {
  backupId?: number;
  restoreType: 'full' | 'selective';
  conflictResolution: 'merge' | 'overwrite' | 'skip';
  dateRangeStart?: string;
  dateRangeEnd?: string;
  restoreContacts: boolean;
  restoreConversations: boolean;
  restoreMessages: boolean;
}

export function InboxRestore() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<RestoreData>({
    restoreType: 'full',
    conflictResolution: 'merge',
    dateRangeStart: '',
    dateRangeEnd: '',
    restoreContacts: true,
    restoreConversations: true,
    restoreMessages: true
  });


  const { data: backupsData, isLoading: isLoadingBackups } = useQuery({
    queryKey: ['/api/inbox/backups'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/inbox/backups');
      if (!response.ok) {
        throw new Error('Failed to fetch backups');
      }
      return response.json();
    },
  });


  const { data: restoresData, isLoading: isLoadingRestores, refetch: refetchRestores } = useQuery({
    queryKey: ['/api/inbox/restores'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/inbox/restores');
      if (!response.ok) {
        throw new Error('Failed to fetch restores');
      }
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds to update status
  });


  const createRestoreMutation = useMutation({
    mutationFn: async (data: { restoreData: RestoreData; file?: File }) => {
      const formData = new FormData();
      

      Object.entries(data.restoreData).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          formData.append(key, value.toString());
        }
      });


      if (data.file) {
        formData.append('backupFile', data.file);
      }

      const response = await fetch('/api/inbox/restores', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start restore');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('restore.create_success_title', 'Restore Started'),
        description: t('restore.create_success_desc', 'Your restore process has been started and will be processed shortly.'),
      });
      setShowRestoreDialog(false);
      setShowConfirmDialog(false);
      setSelectedFile(null);
      setRestoreData({
        restoreType: 'full',
        conflictResolution: 'merge',
        dateRangeStart: '',
        dateRangeEnd: '',
        restoreContacts: true,
        restoreConversations: true,
        restoreMessages: true
      });
      refetchRestores();
    },
    onError: (error: Error) => {
      toast({
        title: t('restore.create_error_title', 'Restore Failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.gz')) {
        toast({
          title: t('restore.file_error_title', 'Invalid File'),
          description: t('restore.file_error_desc', 'Please select a valid backup file (.gz format)'),
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setRestoreData(prev => ({ ...prev, backupId: undefined }));
    }
  };

  const handleBackupSelect = (backupId: string) => {
    setRestoreData(prev => ({ ...prev, backupId: parseInt(backupId) }));
    setSelectedFile(null);
  };

  const handleStartRestore = () => {
    if (!restoreData.backupId && !selectedFile) {
      toast({
        title: t('restore.validation_error', 'Validation Error'),
        description: t('restore.source_required', 'Please select a backup or upload a backup file'),
        variant: 'destructive',
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmRestore = () => {
    createRestoreMutation.mutate({
      restoreData,
      file: selectedFile || undefined
    });
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

  const completedBackups = backupsData?.backups?.filter((backup: Backup) => backup.status === 'completed') || [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Restore Section */}
      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <RotateCcw className="h-5 w-5" />
            {t('restore.title', 'Restore from Backup')}
          </CardTitle>
          <CardDescription>
            {t('restore.description', 'Restore your inbox data from a previous backup or upload a backup file.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button data-tour="components-settings-inboxrestore.button.restore.start_restore"
              onClick={() => setShowRestoreDialog(true)}
              className="flex items-center gap-2"
              disabled={createRestoreMutation.isPending}
            >
              {createRestoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {t('restore.start_restore', 'Start Restore')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Restore History */}
      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <FileText className="h-5 w-5" />
            {t('restore.history_title', 'Restore History')}
          </CardTitle>
          <CardDescription>
            {t('restore.history_description', 'View your previous restore operations')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRestores ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : restoresData?.restores?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('restore.no_restores', 'No restore operations found')}</p>
              <p className="text-sm">{t('restore.start_first_restore', 'Start your first restore to get started')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {restoresData?.restores?.map((restore: Restore) => (
                <div key={restore.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(restore.status)}
                        <h3 className="font-medium">
                          {restore.restoreType === 'full'
                            ? t('restore.full_restore', 'Full Restore')
                            : t('restore.selective_restore', 'Selective Restore')
                          }
                        </h3>
                        <Badge variant="secondary" className={getStatusColor(restore.status)}>
                          {t(`restore.status.${restore.status}`, restore.status)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-2">
                        <span>{t('restore.conflict_resolution', 'Conflict Resolution')}: {restore.conflictResolution}</span>
                        {restore.totalItemsToRestore > 0 && (
                          <>
                            <span>{t('restore.items_restored', 'Restored')}: {restore.itemsRestored}</span>
                            <span>{t('restore.items_skipped', 'Skipped')}: {restore.itemsSkipped}</span>
                            {restore.itemsErrored > 0 && (
                              <span className="text-red-600">{t('restore.items_errored', 'Errors')}: {restore.itemsErrored}</span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{t('restore.started', 'Started')}: {format(new Date(restore.createdAt), 'PPp')}</span>
                        {restore.completedAt && (
                          <span>{t('restore.completed', 'Completed')}: {format(new Date(restore.completedAt), 'PPp')}</span>
                        )}
                      </div>

                      {restore.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          {restore.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Configuration Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent data-tour="components-settings-inboxrestore.dialogcontent.restore.configure_title" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('restore.configure_title', 'Configure Restore')}</DialogTitle>
            <DialogDescription>
              {t('restore.configure_desc', 'Select a backup source and configure restore options.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Backup Source Selection */}
            <div>
              <Label className="text-base font-medium">{t('restore.backup_source', 'Backup Source')}</Label>
              <div className="space-y-3 mt-2">
                <div>
                  <Label htmlFor="existing-backup">{t('restore.existing_backup', 'Existing Backup')}</Label>
                  <Select
                    value={restoreData.backupId?.toString() || ''}
                    onValueChange={handleBackupSelect}
                    disabled={!!selectedFile}
                  >
                    <SelectTrigger data-tour="components-settings-inboxrestore.selecttrigger.restore.select_backup" className="mt-1">
                      <SelectValue placeholder={t('restore.select_backup', 'Select a backup')} />
                    </SelectTrigger>
                    <SelectContent>
                      {completedBackups.map((backup: Backup) => (
                        <SelectItem key={backup.id} value={backup.id.toString()}>
                          <div className="flex flex-col">
                            <span>{backup.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(backup.createdAt), 'PPp')} •
                              {backup.totalContacts} contacts, {backup.totalConversations} conversations, {backup.totalMessages} messages
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-center text-sm text-muted-foreground">
                  {t('restore.or', 'OR')}
                </div>

                <div>
                  <Label htmlFor="upload-backup">{t('restore.upload_backup', 'Upload Backup File')}</Label>
                  <div className="mt-1">
                    <input data-tour="components-settings-inboxrestore.input.restore.choose_file"
                      ref={fileInputRef}
                      type="file"
                      accept=".gz"
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={!!restoreData.backupId}
                    />
                    <Button data-tour="components-settings-inboxrestore.button.restore.choose_file"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!!restoreData.backupId}
                      className="w-full flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {selectedFile ? selectedFile.name : t('restore.choose_file', 'Choose backup file')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Restore Type */}
            <div>
              <Label htmlFor="restore-type">{t('restore.restore_type', 'Restore Type')}</Label>
              <Select
                value={restoreData.restoreType}
                onValueChange={(value: 'full' | 'selective') => setRestoreData(prev => ({ ...prev, restoreType: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">{t('restore.full_restore', 'Full Restore')}</SelectItem>
                  <SelectItem value="selective">{t('restore.selective_restore', 'Selective Restore')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conflict Resolution */}
            <div>
              <Label htmlFor="conflict-resolution">{t('restore.conflict_resolution', 'Conflict Resolution')}</Label>
              <Select
                value={restoreData.conflictResolution}
                onValueChange={(value: 'merge' | 'overwrite' | 'skip') => setRestoreData(prev => ({ ...prev, conflictResolution: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">{t('restore.merge', 'Merge (Recommended)')}</SelectItem>
                  <SelectItem value="overwrite">{t('restore.overwrite', 'Overwrite')}</SelectItem>
                  <SelectItem value="skip">{t('restore.skip', 'Skip Existing')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {restoreData.conflictResolution === 'merge' && t('restore.merge_desc', 'Combine existing data with backup data')}
                {restoreData.conflictResolution === 'overwrite' && t('restore.overwrite_desc', 'Replace existing data with backup data')}
                {restoreData.conflictResolution === 'skip' && t('restore.skip_desc', 'Keep existing data, skip backup data')}
              </p>
            </div>

            {restoreData.restoreType === 'selective' && (
              <>
                <Separator />

                {/* Data Selection */}
                <div>
                  <Label className="text-base font-medium">{t('restore.select_data', 'Select Data to Restore')}</Label>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <Label htmlFor="restore-contacts">{t('restore.restore_contacts', 'Contacts')}</Label>
                      </div>
                      <Switch
                        id="restore-contacts"
                        checked={restoreData.restoreContacts}
                        onCheckedChange={(checked) => setRestoreData(prev => ({ ...prev, restoreContacts: checked }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <InboxConversationIcon className="h-4 w-4" />
                        <Label htmlFor="restore-conversations">{t('restore.restore_conversations', 'Conversations')}</Label>
                      </div>
                      <Switch
                        id="restore-conversations"
                        checked={restoreData.restoreConversations}
                        onCheckedChange={(checked) => setRestoreData(prev => ({ ...prev, restoreConversations: checked }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <Label htmlFor="restore-messages">{t('restore.restore_messages', 'Messages')}</Label>
                      </div>
                      <Switch
                        id="restore-messages"
                        checked={restoreData.restoreMessages}
                        onCheckedChange={(checked) => setRestoreData(prev => ({ ...prev, restoreMessages: checked }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Date Range */}
                <div>
                  <Label className="text-base font-medium">{t('restore.date_range', 'Date Range (Optional)')}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <Label htmlFor="restore-date-start" className="text-sm">{t('restore.start_date', 'Start Date')}</Label>
                      <Input data-tour="components-settings-inboxrestore.input.restore-date-start"
                        id="restore-date-start"
                        type="date"
                        value={restoreData.dateRangeStart}
                        onChange={(e) => setRestoreData(prev => ({ ...prev, dateRangeStart: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="restore-date-end" className="text-sm">{t('restore.end_date', 'End Date')}</Label>
                      <Input data-tour="components-settings-inboxrestore.input.restore-date-end"
                        id="restore-date-end"
                        type="date"
                        value={restoreData.dateRangeEnd}
                        onChange={(e) => setRestoreData(prev => ({ ...prev, dateRangeEnd: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button data-tour="components-settings-inboxrestore.button.common.cancel"
              variant="outline"
              onClick={() => setShowRestoreDialog(false)}
              disabled={createRestoreMutation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-inboxrestore.button.restore.start_restore"
              onClick={handleStartRestore}
              disabled={createRestoreMutation.isPending}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {t('restore.start_restore', 'Start Restore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restore.confirm_title', 'Confirm Restore')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('restore.confirm_desc', 'Are you sure you want to start the restore process? This will modify your existing data based on the selected conflict resolution strategy.')}
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <div className="font-medium text-yellow-800 mb-1">{t('restore.restore_summary', 'Restore Summary:')}</div>
                <div className="text-yellow-700 space-y-1">
                  <div>{t('restore.type', 'Type')}: {restoreData.restoreType === 'full' ? t('restore.full_restore', 'Full Restore') : t('restore.selective_restore', 'Selective Restore')}</div>
                  <div>{t('restore.conflict_resolution', 'Conflict Resolution')}: {restoreData.conflictResolution}</div>
                  {selectedFile && <div>{t('restore.source', 'Source')}: {selectedFile.name}</div>}
                  {restoreData.backupId && <div>{t('restore.backup_id', 'Backup ID')}: {restoreData.backupId}</div>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createRestoreMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRestore}
              disabled={createRestoreMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createRestoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              {t('restore.confirm_restore', 'Confirm Restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
