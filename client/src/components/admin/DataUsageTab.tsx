import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCompanyUsage, useOverrideCompanyUsage, useResetBandwidthUsage, useRecalculateCompanyUsage } from '@/hooks/use-company-usage';
import { 
  formatStorageSize, 
  getUsageStatusColor, 
  getUsageStatusText,
  getStorageRecommendations
} from '@/utils/storage';
import { 
  HardDrive, 
  Wifi, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Settings, 
  RefreshCw,
  TrendingUp,
  Calendar
} from 'lucide-react';

interface DataUsageTabProps {
  companyId: number;
}

type OverrideUsagePayload = {
  currentStorageUsed?: number;
  currentBandwidthUsed?: number;
  filesCount?: number;
  reason: string;
};

const emptyOverrideValues = {
  currentStorageUsed: '',
  currentBandwidthUsed: '',
  filesCount: '',
  reason: ''
};

const formatLimitSize = (limit: number) => limit > 0 ? formatStorageSize(limit) : 'Unlimited';
const formatLimitCount = (limit: number) => limit > 0 ? limit.toLocaleString() : 'Unlimited';
const formatPercentage = (percentage: number) => `${Math.round(percentage)}%`;

const getStatusBadgeVariant = (
  isExceeded: boolean,
  isNearLimit: boolean
): 'destructive' | 'warning' | 'success' => {
  if (isExceeded) return 'destructive';
  if (isNearLimit) return 'warning';
  return 'success';
};

const parseUsageMbInput = (value: string, label: string) => {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return parsed === 0 ? 0 : Math.ceil(parsed);
};

const parseFilesInput = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Files count must be a non-negative whole number.');
  }

  return parsed;
};

export function DataUsageTab({ companyId }: DataUsageTabProps) {
  const { toast } = useToast();
  const { data: usage, isLoading, error, refetch } = useCompanyUsage(companyId);
  const overrideUsageMutation = useOverrideCompanyUsage(companyId);
  const resetBandwidthMutation = useResetBandwidthUsage(companyId);
  const recalculateUsageMutation = useRecalculateCompanyUsage(companyId);

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideValues, setOverrideValues] = useState(emptyOverrideValues);

  const resetOverrideValues = () => {
    setOverrideValues(emptyOverrideValues);
  };

  const handleOverrideUsage = async () => {
    try {
      const data: OverrideUsagePayload = {
        reason: overrideValues.reason || 'Admin manual override'
      };

      data.currentStorageUsed = parseUsageMbInput(overrideValues.currentStorageUsed, 'Storage used');
      data.currentBandwidthUsed = parseUsageMbInput(overrideValues.currentBandwidthUsed, 'Bandwidth used');
      data.filesCount = parseFilesInput(overrideValues.filesCount);

      await overrideUsageMutation.mutateAsync(data);
      
      toast({
        title: "Usage Updated",
        description: "Company usage has been manually overridden successfully.",
      });
      
      setOverrideDialogOpen(false);
      resetOverrideValues();
    } catch (error: any) {
      toast({
        title: "Override Failed",
        description: error.message || "Failed to override usage",
        variant: "destructive",
      });
    }
  };

  const handleResetBandwidth = async () => {
    try {
      await resetBandwidthMutation.mutateAsync();
      toast({
        title: "Bandwidth Reset",
        description: "Monthly bandwidth usage has been reset to zero.",
      });
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset bandwidth usage",
        variant: "destructive",
      });
    }
  };

  const handleRecalculateUsage = async () => {
    try {
      await recalculateUsageMutation.mutateAsync();
      toast({
        title: "Storage Recalculated",
        description: "Storage usage and file count were recalculated. Bandwidth is tracked monthly and was not recalculated.",
      });
    } catch (error: any) {
      toast({
        title: "Storage Recalculation Failed",
        description: error.message || "Failed to recalculate storage usage",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="h-2 bg-muted rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-600 mb-2">Failed to Load Usage Data</h3>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'An error occurred while loading usage data'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-muted-foreground">
            No usage data available for this company.
          </div>
        </CardContent>
      </Card>
    );
  }

  const recommendations = getStorageRecommendations(usage);

  return (
    <div className="space-y-6">
      {/* Usage Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Storage Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatStorageSize(usage.currentUsage.storage ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatLimitSize(usage.limits.storage)} limit
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.storage ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.storage ?? 0)}`}>
                  {formatPercentage(usage.percentages.storage ?? 0)}
                </span>
                <Badge variant={getStatusBadgeVariant(usage.status.storageExceeded, usage.status.storageNearLimit)}>
                  {getUsageStatusText(usage.percentages.storage ?? 0)}
                </Badge>
              </div>
              {usage.limits.storage === 0 && usage.currentUsage.storage > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No plan limit configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bandwidth Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth Usage</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatStorageSize(usage.currentUsage.bandwidth ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatLimitSize(usage.limits.bandwidth)} monthly limit
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.bandwidth ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.bandwidth ?? 0)}`}>
                  {formatPercentage(usage.percentages.bandwidth ?? 0)}
                </span>
                <Badge variant={getStatusBadgeVariant(usage.status.bandwidthExceeded, usage.status.bandwidthNearLimit)}>
                  {getUsageStatusText(usage.percentages.bandwidth ?? 0)}
                </Badge>
              </div>
              {usage.limits.bandwidth === 0 && usage.currentUsage.bandwidth > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No plan limit configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Files Count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Files Count</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(usage.currentUsage.files ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage.limits.totalFiles > 0 ? usage.limits.totalFiles.toLocaleString() : 'Unlimited'} limit
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.files ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.files ?? 0)}`}>
                  {formatPercentage(usage.percentages.files ?? 0)}
                </span>
                <Badge variant={getStatusBadgeVariant(usage.status.filesExceeded, usage.status.filesNearLimit)}>
                  {getUsageStatusText(usage.percentages.files ?? 0)}
                </Badge>
              </div>
              {usage.limits.totalFiles === 0 && usage.currentUsage.files > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No plan limit configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Information */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Limits</CardTitle>
          <CardDescription>Current plan: {usage.planName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm font-medium">Storage Limit</Label>
              <p className="text-lg font-semibold">{formatLimitSize(usage.limits.storage)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Bandwidth Limit</Label>
              <p className="text-lg font-semibold">{formatLimitSize(usage.limits.bandwidth)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">File Upload Limit</Label>
              <p className="text-lg font-semibold">{formatLimitSize(usage.limits.fileUpload)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Total Files Limit</Label>
              <p className="text-lg font-semibold">{formatLimitCount(usage.limits.totalFiles)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Admin Actions
          </CardTitle>
          <CardDescription>
            Administrative tools for managing company usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Dialog
              open={overrideDialogOpen}
              onOpenChange={(open) => {
                setOverrideDialogOpen(open);
                if (!open) {
                  resetOverrideValues();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Override Usage
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Override Company Usage</DialogTitle>
                  <DialogDescription>
                    Manually set usage values for this company. Leave fields empty to keep current values.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="storage">Storage Used (MB)</Label>
                    <Input
                      id="storage"
                      type="number"
                      min="0"
                      step="any"
                      placeholder={`Current: ${formatStorageSize(usage.currentUsage.storage ?? 0)}`}
                      value={overrideValues.currentStorageUsed}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, currentStorageUsed: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bandwidth">Bandwidth Used (MB)</Label>
                    <Input
                      id="bandwidth"
                      type="number"
                      min="0"
                      step="any"
                      placeholder={`Current: ${formatStorageSize(usage.currentUsage.bandwidth ?? 0)}`}
                      value={overrideValues.currentBandwidthUsed}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, currentBandwidthUsed: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="files">Files Count</Label>
                    <Input
                      id="files"
                      type="number"
                      min="0"
                      step="1"
                      placeholder={`Current: ${usage.currentUsage.files}`}
                      value={overrideValues.filesCount}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, filesCount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason (Optional)</Label>
                    <Textarea
                      id="reason"
                      placeholder="Reason for manual override..."
                      value={overrideValues.reason}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, reason: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setOverrideDialogOpen(false);
                    resetOverrideValues();
                  }}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleOverrideUsage}
                    disabled={overrideUsageMutation.isPending}
                  >
                    {overrideUsageMutation.isPending ? "Updating..." : "Update Usage"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              variant="outline" 
              onClick={handleResetBandwidth}
              disabled={resetBandwidthMutation.isPending}
            >
              <Calendar className="h-4 w-4 mr-2" />
              {resetBandwidthMutation.isPending ? "Resetting..." : "Reset Monthly Bandwidth"}
            </Button>

            <Button 
              variant="outline" 
              onClick={handleRecalculateUsage}
              disabled={recalculateUsageMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {recalculateUsageMutation.isPending ? "Recalculating..." : "Recalculate Storage & Files"}
            </Button>

            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      <div className="text-sm text-muted-foreground text-center">
        Last updated: {usage.lastUpdated ? new Date(usage.lastUpdated).toLocaleString() : 'Never'}
      </div>
    </div>
  );
}
