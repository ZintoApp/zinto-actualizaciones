import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

interface TikTokConnectionData {
  openId: string;
  unionId?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  isVerified: boolean;
  tokenExpiresAt: number;
  scopes?: string[];
  lastSyncAt: number;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

export function EditTikTokConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [connectionData, setConnectionData] = useState<TikTokConnectionData | null>(null);
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    if (isOpen && connectionId) {
      loadConnectionData();
    }
  }, [isOpen, connectionId]);

  const loadConnectionData = async () => {
    setLoadingConnection(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`);
      if (!response.ok) {
        throw new Error('Failed to load connection data');
      }

      const connection = await response.json();
      setAccountName(connection.accountName || '');
      setConnectionData(connection.connectionData as TikTokConnectionData);
    } catch (error: any) {
      console.error('Error loading connection data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load connection data. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoadingConnection(false);
    }
  };

  const handleRefreshConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tiktok/refresh-connection/${connectionId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to refresh connection');
      }

      toast({
        title: 'Success',
        description: 'TikTok connection refreshed successfully!'
      });

      await loadConnectionData();
      onSuccess();
    } catch (error: any) {
      console.error('Error refreshing connection:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to refresh connection. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConnectionData(null);
    setAccountName('');
    onClose();
  };

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString();

  const getTokenExpiryStatus = () => {
    if (!connectionData?.tokenExpiresAt) return null;

    const now = Date.now();
    const expiresAt = connectionData.tokenExpiresAt;
    const daysUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: 'expired', color: 'text-red-600 dark:text-red-400', message: 'Token expired' };
    }
    if (daysUntilExpiry < 7) {
      return { status: 'expiring', color: 'text-orange-600 dark:text-orange-400', message: `Expires in ${daysUntilExpiry} days` };
    }
    return { status: 'valid', color: 'text-green-600 dark:text-green-400', message: `Valid for ${daysUntilExpiry} days` };
  };

  const tokenStatus = getTokenExpiryStatus();
  const statusBadgeClass =
    connectionData?.status === 'active'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : connectionData?.status === 'error'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  const statusLabel =
    connectionData?.status === 'active'
      ? 'Active'
      : connectionData?.status === 'error'
        ? 'Error'
        : 'Disconnected';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="ri-tiktok-line text-2xl"></i>
            TikTok Connection Details
          </DialogTitle>
          <DialogDescription>View and refresh your TikTok Business connection.</DialogDescription>
        </DialogHeader>

        {loadingConnection ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : connectionData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              {connectionData.avatarUrl ? (
                <img
                  src={connectionData.avatarUrl}
                  alt={connectionData.displayName}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <i className="ri-tiktok-line text-xl"></i>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold">{connectionData.displayName}</h3>
                  {connectionData.isVerified && (
                    <CheckCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  )}
                </div>
                {connectionData.username && (
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">@{connectionData.username}</p>
                )}
                {accountName && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{accountName}</p>
                )}
              </div>

              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
                {statusLabel}
              </span>
            </div>

            {tokenStatus && (
              <div className="rounded-lg border p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className={`mt-0.5 h-4 w-4 ${tokenStatus.color}`} />
                  <div className="min-w-0 flex-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Token Expiry</Label>
                    <p className={`text-sm font-medium ${tokenStatus.color}`}>{tokenStatus.message}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Expires at {formatDate(connectionData.tokenExpiresAt)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tokenStatus?.status === 'expired' && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-400">Token Expired</p>
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Your TikTok access token has expired. Click &quot;Refresh Connection&quot; to renew access.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No connection data available</p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handleRefreshConnection}
            disabled={loading || loadingConnection || !connectionData}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh Connection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
