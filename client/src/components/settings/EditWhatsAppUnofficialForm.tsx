import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface EditWhatsAppUnofficialFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

interface ConnectionHealthData {
  healthScore: number;
  lastLatency: number;
  averageLatency: number;
  lastHealthCheck: string;
  status: string;
}

export function EditWhatsAppUnofficialForm({ isOpen, onClose, onSuccess, connectionId }: EditWhatsAppUnofficialFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [healthData, setHealthData] = useState<ConnectionHealthData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [connectionIdDisplay, setConnectionIdDisplay] = useState<number>(0);
  const [channelType, setChannelType] = useState<string>('whatsapp_unofficial');

  useEffect(() => {
    let controller: AbortController | null = null;
    if (isOpen && connectionId) {
      loadConnectionData().then((c) => { controller = c; }).catch(() => {});
    }
    return () => {
      if (controller) controller.abort();
    };
  }, [isOpen, connectionId]);

  const loadConnectionData = async (): Promise<AbortController> => {
    const controller = new AbortController();
    setIsLoading(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(errorData.message || 'WhatsApp connection not found.');
        } else if (response.status === 403) {
          throw new Error(errorData.message || 'Access denied. You do not have permission to edit this connection.');
        } else {
          throw new Error(errorData.message || `Server error: ${response.status}. Please try again later.`);
        }
      }

      const connection = await response.json();

      if (controller.signal.aborted) return controller;

      setAccountName(connection.accountName || '');
      setConnectionIdDisplay(connection.id);
      setChannelType(connection.channelType);
      setConnectionStatus(connection.status || 'disconnected');


      if (connection.connectionData && connection.connectionData.healthScore !== undefined) {
        setHealthData({
          healthScore: Number(connection.connectionData.healthScore ?? 0),
          lastLatency: Number(connection.connectionData.lastLatency ?? 0),
          averageLatency: Number(connection.connectionData.averageLatency ?? 0),
          lastHealthCheck: connection.connectionData.lastHealthCheck,
          status: connection.connectionData.status
        });
      } else {
        setHealthData(null);
      }
    } catch (error: any) {
      console.error('Error loading connection data:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load connection data",
        variant: "destructive"
      });
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
    return controller;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);


    if (!accountName.trim()) {
      toast({
        title: "Validation Error",
        description: "Account name is required.",
        variant: "destructive"
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const updateData = {
        accountName: accountName.trim()
      };

      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update WhatsApp connection');
      }

      toast({
        title: "WhatsApp Connection Updated",
        description: "Your WhatsApp connection settings have been updated successfully.",
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error updating connection:', error);
      toast({
        title: "Update Error",
        description: error.message || "Failed to update WhatsApp connection",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isLoading) {
      onClose();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-100 text-green-800">Connected</Badge>;
      case 'disconnected':
        return <Badge variant="secondary">Disconnected</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 2000) return 'text-green-600';
    if (latency < 5000) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading connection data...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-green-500" />
            Edit WhatsApp Unofficial Connection
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Configuration</h3>

            <div className="grid gap-2">
              <Label htmlFor="accountName">Account Name</Label>
              <Input data-tour="components-settings-editwhatsappunofficialform.input.accountName"
                id="accountName"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. My WhatsApp"
                required
              />
              <p className="text-sm text-gray-500">
                A name to identify this connection
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Connection Details</Label>
              <div className="text-sm text-gray-600">
                <p>ID: {connectionIdDisplay}</p>
                <p>Type: {channelType}</p>
                <p>Status: {getStatusBadge(connectionStatus)}</p>
              </div>
            </div>
          </div>

          {/* Connection Health Metrics */}
          {healthData && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Connection Health Metrics</h3>

              <div className="grid gap-2">
                <Label>Health Score</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${healthData.healthScore >= 70 ? 'bg-green-500' : healthData.healthScore >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, healthData.healthScore))}%` }}
                    ></div>
                  </div>
                  <span className={`text-sm font-medium ${getHealthColor(healthData.healthScore)}`}>
                    {healthData.healthScore}/100
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  Overall connection health score
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Latency Metrics</Label>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Current: <span className={getLatencyColor(healthData.lastLatency)}>{healthData.lastLatency ?? 0}ms</span></p>
                  <p>Average: {healthData.averageLatency ?? 0}ms</p>
                </div>
                <p className="text-sm text-gray-500">
                  Connection latency in milliseconds
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Last Health Check</Label>
                <p className="text-sm text-gray-600">
                  {new Date(healthData.lastHealthCheck).toLocaleString()}
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Connection Status</Label>
                <div className="flex items-center gap-2">
                  {healthData.status === 'healthy' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {healthData.status === 'degraded' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                  {healthData.status === 'unhealthy' && <XCircle className="h-4 w-4 text-red-500" />}
                  <span className={`capitalize ${healthData.status === 'healthy' ? 'text-green-600' : healthData.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'}`}>
                    {healthData.status}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Edit className="h-4 w-4" />
              )}
              {isSubmitting ? 'Updating...' : 'Update Connection'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}