import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Download, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Info,
  Calendar,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';

interface UpdatePackage {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  packageHash: string;
  packageSize: number;
  migrationScripts: string[];
}

interface SystemUpdate {
  id: number;
  version: string;
  releaseNotes: string;
  status: 'pending' | 'downloading' | 'validating' | 'applying' | 'completed' | 'failed' | 'rolled_back';
  progressPercentage: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

interface UpdateProgress {
  updateId: number;
  status: string;
  progress: number;
  message: string;
}

export default function SystemUpdatesTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);


  const { data: versionData } = useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auto-update/version');
      return response.json();
    }
  });


  const { data: updateCheck, refetch: checkForUpdates, isLoading: isCheckingUpdates } = useQuery({
    queryKey: ['update-check'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auto-update/check');
      return response.json();
    },
    enabled: false
  });


  const { data: updateHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['update-history'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auto-update/history');
      return response.json();
    }
  });


  const { data: updateStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['update-status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auto-update/status');
      return response.json();
    },
    refetchInterval: updateProgress ? 2000 : false
  });


  const startUpdateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auto-update/start');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('settings.updates.update_started', 'Update Started'),
        description: t('settings.updates.update_started_desc', 'System update has been initiated'),
      });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('settings.updates.update_failed', 'Failed to start update'),
        variant: 'destructive',
      });
    }
  });


  useEffect(() => {
    if (updateStatus?.isInProgress) {
      const eventSource = new EventSource('/api/auto-update/progress');
      
      eventSource.onmessage = (event) => {
        try {
          const progress = JSON.parse(event.data);
          setUpdateProgress(progress);
          refetchStatus();
        } catch (error) {
          console.error('Failed to parse progress data:', error);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setUpdateProgress(null);
      };

      return () => {
        eventSource.close();
      };
    } else {
      setUpdateProgress(null);
    }
  }, [updateStatus?.isInProgress, refetchStatus]);

  const handleCheckForUpdates = () => {
    checkForUpdates();
  };

  const handleStartUpdate = () => {
    startUpdateMutation.mutate();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
      case 'rolled_back':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'downloading':
      case 'validating':
      case 'applying':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      completed: 'default',
      failed: 'destructive',
      rolled_back: 'destructive',
      pending: 'secondary',
      downloading: 'default',
      validating: 'default',
      applying: 'default'
    };

    return (
      <Badge variant={variants[status] || 'secondary'}>
        {t(`settings.updates.status.${status}`, status)}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const currentVersion = versionData?.version || '1.0.0';
  const updateAvailable = updateCheck?.updateAvailable;
  const updatePackage = updateCheck?.updatePackage as UpdatePackage;
  const updates = updateHistory?.updates || [];
  const isUpdateInProgress = updateStatus?.isInProgress;

  return (
    <div className="space-y-6">
      {/* Current Version & Update Check */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5" />
            <span>{t('settings.updates.title', 'System Updates')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {t('settings.updates.current_version', 'Current Version')}
              </p>
              <p className="text-lg font-semibold">v{currentVersion}</p>
            </div>
            <Button data-tour="components-settings-systemupdatestab.button.settings.updates.checking"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdates || isUpdateInProgress}
              variant="outline"
            >
              {isCheckingUpdates ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.updates.checking', 'Checking...')}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('settings.updates.check_updates', 'Check for Updates')}
                </>
              )}
            </Button>
          </div>

          {updateAvailable && updatePackage && (
            <Alert>
              <Download className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    {t('settings.updates.update_available', 'Update Available: v{{version}}', { 
                      version: updatePackage.version 
                    })}
                  </p>
                  <p className="text-sm">
                    {t('settings.updates.package_size', 'Package Size: {{size}}', { 
                      size: formatFileSize(updatePackage.packageSize) 
                    })}
                  </p>
                  {updatePackage.releaseNotes && (
                    <div className="text-sm">
                      <p className="font-medium mb-1">
                        {t('settings.updates.release_notes', 'Release Notes:')}
                      </p>
                      <p className="whitespace-pre-wrap">{updatePackage.releaseNotes}</p>
                    </div>
                  )}
                  <Button data-tour="components-settings-systemupdatestab.button.settings.updates.starting"
                    onClick={handleStartUpdate}
                    disabled={startUpdateMutation.isPending || isUpdateInProgress}
                    className="mt-2"
                  >
                    {startUpdateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('settings.updates.starting', 'Starting...')}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        {t('settings.updates.install_update', 'Install Update')}
                      </>
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {!updateAvailable && updateCheck && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {t('settings.updates.up_to_date', 'Your system is up to date')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Update Progress */}
      {(isUpdateInProgress || updateProgress) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{t('settings.updates.update_progress', 'Update Progress')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{updateProgress?.message || t('settings.updates.preparing', 'Preparing update...')}</span>
                <span>{updateProgress?.progress || 0}%</span>
              </div>
              <Progress value={updateProgress?.progress || 0} className="w-full" />
            </div>
            
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('settings.updates.update_warning', 'Do not close this page or restart the system during the update process.')}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Update History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>{t('settings.updates.history', 'Update History')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {t('settings.updates.no_history', 'No update history available')}
            </p>
          ) : (
            <div className="space-y-4">
              {updates.map((update: SystemUpdate) => (
                <div key={update.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(update.status)}
                    <div>
                      <p className="font-medium">v{update.version}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(update.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(update.status)}
                    {update.progressPercentage > 0 && update.status !== 'completed' && (
                      <span className="text-sm text-muted-foreground">
                        {update.progressPercentage}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
