/**
 * Shared types for follow-up data (API responses and WebSocket events)
 */

export interface ActiveFollowUpResponse {
  id: number;
  scheduleId: string;
  conversationId: number;
  contactId: number;
  messageType: string;
  messageContent: string;
  scheduledFor: Date;
  status: string;
  cancelOnUserResponse: boolean;
  cancelCondition: 'any_message' | 'specific_topic' | 'none';
  monitoringStartedAt: Date | null;
  lastUserMessageAt: Date | null;
  isMonitored: boolean;
  willCancelOnResponse: boolean;
}

export interface FollowUpStatsResponse {
  conversationId: number;
  summary: {
    totalScheduled: number;
    totalSent: number;
    totalCancelled: number;
    totalFailed: number;
    totalPending: number;
    totalOverdue: number;
  };
  cancellation: {
    totalWithCancellation: number;
    cancelledByUserResponse: number;
    cancelledManually: number;
    cancelledByCondition: number;
  };
  monitoring: {
    activelyMonitored: number;
    averageMonitoringDuration: number | null;
  };
  generatedAt: Date;
}

export type FollowUpWebSocketEventType =
  | 'followUpExecuted'
  | 'followUpCancelled'
  | 'followUpSkipped'
  | 'followUpManuallyCancelled';

export interface FollowUpExecutedPayload {
  scheduleId: string;
  conversationId?: number;
  messageId?: string | null;
}

export interface FollowUpCancelledPayload {
  scheduleId: string;
  conversationId?: number;
  reason?: string;
  condition?: string;
}

export interface FollowUpSkippedPayload {
  scheduleId: string;
  conversationId?: number;
  reason?: string;
  cancelCondition?: string;
}

export interface FollowUpManuallyCancelledPayload {
  scheduleId: string;
  conversationId?: number;
  reason?: string;
  userId?: number;
}

export type FollowUpEventPayload =
  | FollowUpExecutedPayload
  | FollowUpCancelledPayload
  | FollowUpSkippedPayload
  | FollowUpManuallyCancelledPayload;
