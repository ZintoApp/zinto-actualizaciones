import React from 'react';
import { Check, CheckCheck, Clock, XCircle, Eye } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MessageStatusProps {
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: Date | string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  error?: string;
}

/**
 * Message status indicator component
 * Shows visual status for sent messages
 */
export function MessageStatus({
  status,
  timestamp,
  showLabel = false,
  size = 'md',
  className = ''
}: MessageStatusProps) {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'sending':
        return <Clock className={cn(sizeClasses[size], 'text-gray-400')} />;
      case 'sent':
        return <Check className={cn(sizeClasses[size], 'text-gray-400')} />;
      case 'delivered':
        return <CheckCheck className={cn(sizeClasses[size], 'text-gray-400')} />;
      case 'read':
        return <CheckCheck className={cn(sizeClasses[size], 'text-blue-500')} />;
      case 'failed':
        return <XCircle className={cn(sizeClasses[size], 'text-red-500')} />;
      default:
        return null;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Read';
      case 'failed':
        return 'Failed';
      default:
        return '';
    }
  };

  const getTooltipText = () => {
    const label = getStatusLabel();
    if (timestamp) {
      const time = new Date(timestamp).toLocaleString();
      return `${label} at ${time}`;
    }
    return label;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center gap-1', className)}>
          {getStatusIcon()}
          {showLabel && (
            <span className="text-xs text-gray-500">{getStatusLabel()}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Detailed message status with timestamps
 */
interface DetailedMessageStatusProps {
  sentAt?: Date | string;
  deliveredAt?: Date | string;
  readAt?: Date | string;
  failedAt?: Date | string;
  error?: string;
  readBy?: { userId: number; userName: string; readAt: Date | string }[];
  className?: string;
}

export function DetailedMessageStatus({
  sentAt,
  deliveredAt,
  readAt,
  failedAt,
  error,
  readBy = [],
  className = ''
}: DetailedMessageStatusProps) {
  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className={cn('space-y-2 text-sm', className)}>
      {/* Sent */}
      {sentAt && (
        <div className="flex items-center gap-2 text-gray-600">
          <Check className="w-4 h-4" />
          <span>Sent: {formatTime(sentAt)}</span>
        </div>
      )}

      {/* Delivered */}
      {deliveredAt && (
        <div className="flex items-center gap-2 text-gray-600">
          <CheckCheck className="w-4 h-4" />
          <span>Delivered: {formatTime(deliveredAt)}</span>
        </div>
      )}

      {/* Read */}
      {readAt && (
        <div className="flex items-center gap-2 text-blue-600">
          <Eye className="w-4 h-4" />
          <span>Read: {formatTime(readAt)}</span>
        </div>
      )}

      {/* Read by multiple users */}
      {readBy.length > 0 && (
        <div className="space-y-1 pl-6">
          <p className="text-xs font-medium text-gray-500">Read by:</p>
          {readBy.map((receipt, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-gray-600">
              <span>{receipt.userName}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-400">{formatTime(receipt.readAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Failed */}
      {failedAt && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="w-4 h-4" />
            <span>Failed: {formatTime(failedAt)}</span>
          </div>
          {error && (
            <p className="text-xs text-red-500 pl-6">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact read receipt indicator
 */
interface ReadReceiptIndicatorProps {
  readCount: number;
  totalRecipients?: number;
  readBy?: string[];
  className?: string;
}

export function ReadReceiptIndicator({
  readCount,
  totalRecipients,
  readBy = [],
  className = ''
}: ReadReceiptIndicatorProps) {
  if (readCount === 0) return null;

  const getTooltipText = () => {
    if (readBy.length > 0) {
      if (readBy.length === 1) {
        return `Read by ${readBy[0]}`;
      } else if (readBy.length === 2) {
        return `Read by ${readBy[0]} and ${readBy[1]}`;
      } else {
        return `Read by ${readBy[0]}, ${readBy[1]} and ${readBy.length - 2} others`;
      }
    }
    return `Read by ${readCount} ${readCount === 1 ? 'person' : 'people'}`;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center gap-1 text-blue-500', className)}>
          <Eye className="w-3 h-3" />
          <span className="text-xs font-medium">{readCount}</span>
          {totalRecipients && (
            <span className="text-xs text-gray-400">/ {totalRecipients}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Message status badge (for message lists)
 */
interface MessageStatusBadgeProps {
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  compact?: boolean;
  className?: string;
}

export function MessageStatusBadge({
  status,
  compact = false,
  className = ''
}: MessageStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'sending':
        return {
          icon: <Clock className="w-3 h-3" />,
          label: 'Sending',
          color: 'bg-gray-100 text-gray-600'
        };
      case 'sent':
        return {
          icon: <Check className="w-3 h-3" />,
          label: 'Sent',
          color: 'bg-gray-100 text-gray-600'
        };
      case 'delivered':
        return {
          icon: <CheckCheck className="w-3 h-3" />,
          label: 'Delivered',
          color: 'bg-blue-100 text-blue-600'
        };
      case 'read':
        return {
          icon: <Eye className="w-3 h-3" />,
          label: 'Read',
          color: 'bg-green-100 text-green-600'
        };
      case 'failed':
        return {
          icon: <XCircle className="w-3 h-3" />,
          label: 'Failed',
          color: 'bg-red-100 text-red-600'
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('inline-flex items-center justify-center w-5 h-5 rounded-full', config.color, className)}>
            {config.icon}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', config.color, className)}>
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}

