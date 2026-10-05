/**
 * Storage utility functions for handling data usage and limits
 */

export interface StorageUsage {
  companyId: number;
  companyName: string;
  planName: string;
  currentUsage: {
    storage: number; // in MB
    bandwidth: number; // in MB
    files: number;
  };
  limits: {
    storage: number; // in MB
    bandwidth: number; // in MB
    fileUpload: number; // in MB
    totalFiles: number;
  };
  percentages: {
    storage: number;
    bandwidth: number;
    files: number;
  };
  status: {
    storageNearLimit: boolean;
    bandwidthNearLimit: boolean;
    filesNearLimit: boolean;
    storageExceeded: boolean;
    bandwidthExceeded: boolean;
    filesExceeded: boolean;
  };
  lastUpdated?: string;
}

/**
 * Format storage size in MB to human readable format
 */
export function formatStorageSize(sizeInMB: number): string {
  if (sizeInMB === 0) {
    return '0 MB';
  } else if (sizeInMB < 1024) {
    return `${sizeInMB.toFixed(1)} MB`;
  } else {
    const sizeInGB = sizeInMB / 1024;
    return `${sizeInGB.toFixed(2)} GB`;
  }
}

/**
 * Get storage usage status color based on percentage
 */
export function getUsageStatusColor(percentage: number): string {
  if (percentage >= 100) return 'text-red-600';
  if (percentage >= 90) return 'text-red-500';
  if (percentage >= 80) return 'text-orange-500';
  if (percentage >= 60) return 'text-yellow-500';
  return 'text-green-600';
}

/**
 * Get storage usage background color for progress bars
 */
export function getUsageProgressColor(percentage: number): string {
  if (percentage >= 100) return 'bg-red-500';
  if (percentage >= 90) return 'bg-red-400';
  if (percentage >= 80) return 'bg-orange-400';
  if (percentage >= 60) return 'bg-yellow-400';
  return 'bg-green-500';
}

/**
 * Get storage usage status text
 */
export function getUsageStatusText(percentage: number): string {
  if (percentage >= 100) return 'Limit Exceeded';
  if (percentage >= 90) return 'Critical';
  if (percentage >= 80) return 'Warning';
  if (percentage >= 60) return 'Moderate';
  return 'Good';
}

/**
 * Calculate remaining storage/bandwidth
 */
export function calculateRemaining(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

/**
 * Calculate days until limit based on current usage trend
 * This is a simplified calculation - in a real app you'd want historical data
 */
export function estimateDaysUntilLimit(
  currentUsage: number,
  limit: number,
  dailyAverageUsage: number
): number | null {
  if (dailyAverageUsage <= 0) return null;
  
  const remaining = calculateRemaining(currentUsage, limit);
  if (remaining <= 0) return 0;
  
  return Math.floor(remaining / dailyAverageUsage);
}

/**
 * Get storage recommendations based on usage
 */
export function getStorageRecommendations(usage: StorageUsage): string[] {
  const recommendations: string[] = [];
  let upgradeRecommended = false;
  const addRecommendation = (recommendation: string) => {
    if (!recommendations.includes(recommendation)) {
      recommendations.push(recommendation);
    }
  };
  const addUpgradeRecommendation = () => {
    if (!upgradeRecommended) {
      addRecommendation('Upgrade your plan for higher usage limits');
      upgradeRecommended = true;
    }
  };
  
  if (usage.status.storageExceeded) {
    addUpgradeRecommendation();
    addRecommendation('Delete unnecessary files to free up space');
  } else if (usage.status.storageNearLimit) {
    addUpgradeRecommendation();
    addRecommendation('Review and clean up old files');
  }
  
  if (usage.status.bandwidthExceeded) {
    addRecommendation('Bandwidth limit exceeded - some features may be limited');
    addUpgradeRecommendation();
  } else if (usage.status.bandwidthNearLimit) {
    addRecommendation('Monitor bandwidth usage to avoid hitting limits');
  }
  
  if (usage.status.filesExceeded) {
    addRecommendation('File count limit reached - delete some files to upload more');
    addUpgradeRecommendation();
  } else if (usage.status.filesNearLimit) {
    addRecommendation('Approaching file count limit');
  }
  
  return recommendations;
}

/**
 * Validate storage limits for plan configuration
 */
export function validateStorageLimits(limits: {
  storageLimit?: number;
  bandwidthLimit?: number;
  fileUploadLimit?: number;
  totalFilesLimit?: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (limits.storageLimit !== undefined) {
    if (limits.storageLimit < 0) {
      errors.push('Storage limit must be a positive number');
    }
    if (limits.storageLimit > 1000000) { // 1TB in MB
      errors.push('Storage limit cannot exceed 1TB');
    }
  }
  
  if (limits.bandwidthLimit !== undefined) {
    if (limits.bandwidthLimit < 0) {
      errors.push('Bandwidth limit must be a positive number');
    }
    if (limits.bandwidthLimit > 10000000) { // 10TB in MB
      errors.push('Bandwidth limit cannot exceed 10TB');
    }
  }
  
  if (limits.fileUploadLimit !== undefined) {
    if (limits.fileUploadLimit < 0) {
      errors.push('File upload limit must be a positive number');
    }
    if (limits.fileUploadLimit > 1024) { // 1GB in MB
      errors.push('File upload limit cannot exceed 1GB');
    }
  }
  
  if (limits.totalFilesLimit !== undefined) {
    if (limits.totalFilesLimit < 0) {
      errors.push('Total files limit must be a positive number');
    }
    if (limits.totalFilesLimit > 1000000) {
      errors.push('Total files limit cannot exceed 1,000,000');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Convert storage units
 */
export const StorageUnits = {
  MB_TO_GB: (mb: number) => mb / 1024,
  GB_TO_MB: (gb: number) => gb * 1024,
  MB_TO_KB: (mb: number) => mb * 1024,
  KB_TO_MB: (kb: number) => kb / 1024,
  

  formatMB: (mb: number) => formatStorageSize(mb),
  formatGB: (gb: number) => `${gb.toFixed(2)} GB`,
  formatKB: (kb: number) => `${Math.round(kb)} KB`
};

/**
 * Storage usage chart data formatter
 */
export function formatUsageChartData(usage: StorageUsage) {
  return [
    {
      name: 'Storage',
      used: usage.currentUsage.storage,
      limit: usage.limits.storage,
      percentage: usage.percentages.storage,
      color: getUsageProgressColor(usage.percentages.storage),
      unit: 'MB'
    },
    {
      name: 'Bandwidth',
      used: usage.currentUsage.bandwidth,
      limit: usage.limits.bandwidth,
      percentage: usage.percentages.bandwidth,
      color: getUsageProgressColor(usage.percentages.bandwidth),
      unit: 'MB'
    },
    {
      name: 'Files',
      used: usage.currentUsage.files,
      limit: usage.limits.totalFiles,
      percentage: usage.percentages.files,
      color: getUsageProgressColor(usage.percentages.files),
      unit: 'files'
    }
  ];
}
