
/**
 * WhatsApp Campaign Types for Backend
 * Updated to use WhatsApp-specific channel types and enhanced fields
 */

export type WhatsAppChannelType = 'official' | 'unofficial';
export type WhatsAppMessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'template' | 'interactive';
export type WhatsAppTemplateCategory = 'marketing' | 'utility' | 'authentication';
export type WhatsAppTemplateStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface Campaign {
  id: number;
  company_id: number;
  created_by_id: number;
  name: string;
  description?: string;
  content: string;
  whatsapp_channel_type: WhatsAppChannelType;
  whatsapp_account_id?: number;
  template_id?: number;
  segment_id?: number;
  campaign_type: 'immediate' | 'scheduled';
  scheduled_at?: Date;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  message_type: WhatsAppMessageType;
  rate_limit_settings: WhatsAppRateLimitSettings;
  anti_ban_settings: WhatsAppAntiBanSettings;
  business_hours_settings?: WhatsAppBusinessHoursSettings;
  total_recipients?: number;
  sent_count?: number;
  delivered_count?: number;
  read_count?: number;
  failed_count?: number;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;

  whatsapp_template_id?: string;
  whatsapp_template_name?: string;
  interactive_components?: any;
}

export interface CampaignTemplate {
  id: number;
  company_id: number;
  created_by_id: number;
  name: string;
  description?: string;
  category: WhatsAppTemplateCategory;
  content: string;
  message_type: WhatsAppMessageType;
  media_urls: string[];
  media_metadata: MediaMetadata;
  variables: string[];
  whatsapp_channel_type: WhatsAppChannelType;
  is_active: boolean;
  usage_count: number;
  created_at: Date;
  updated_at: Date;

  whatsapp_template_id?: string;
  whatsapp_template_name?: string;
  whatsapp_template_language?: string;
  whatsapp_template_status?: WhatsAppTemplateStatus;
  rejection_reason?: string;
  interactive_components?: any;
}

export interface CampaignRecipient {
  id: number;
  campaign_id: number;
  contact_id: number;
  variables: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  sent_at?: Date;
  delivered_at?: Date;
  failed_at?: Date;
  error_message?: string;
  created_at: Date;
}

export interface CampaignQueueItem {
  id: number;
  campaign_id: number;
  recipient_id: number;
  account_id?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  scheduled_for: Date;
  started_at?: Date;
  completed_at?: Date;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  last_error_at?: Date;
  metadata: CampaignQueueMetadata;
  created_at: Date;
}

export interface CampaignQueueMetadata {
  content?: string;
  recipient_phone?: string;
  recipient_name?: string;
  variables?: Record<string, any>;
  media_urls?: string[];
  template_id?: number;
  personalization_data?: Record<string, any>;
  retry_count?: number;
  [key: string]: any;
}

export interface CampaignSegment {
  id: number;
  company_id: number;
  created_by_id: number;
  name: string;
  description?: string;
  filter_criteria: SegmentFilterCriteria;
  contact_count: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SegmentFilterCriteria {
  tags?: string[];
  custom_fields?: Record<string, any>;
  date_range?: {
    field: string;
    start?: Date;
    end?: Date;
  };
  location?: {
    country?: string;
    city?: string;
    region?: string;
  };
  engagement?: {
    last_message_days?: number;
    message_count_min?: number;
    message_count_max?: number;
  };
  [key: string]: any;
}

export interface WhatsAppRateLimitSettings {
  messages_per_minute: number;
  messages_per_hour: number;
  messages_per_day: number;
  delay_between_messages: number;
  random_delay_range?: [number, number];
  humanization_enabled: boolean;
  cooldown_period?: number;
  burst_limit?: number;
  burst_window?: number;

  respect_whatsapp_limits: boolean;
  adaptive_rate_limiting: boolean;
}

export interface WhatsAppAntiBanSettings {
  enabled: boolean;
  mode: 'conservative' | 'moderate' | 'aggressive';
  business_hours_only: boolean;
  respect_weekends: boolean;
  randomize_delay: boolean;
  min_delay: number;
  max_delay: number;
  account_rotation: boolean;
  cooldown_period: number;
  message_variation: boolean;

  avoid_spam_triggers: boolean;
  use_typing_indicators: boolean;
  randomize_message_timing: boolean;
  respect_recipient_timezone: boolean;
}

export interface WhatsAppBusinessHoursSettings {
  enabled: boolean;
  timezone: string;
  schedule: {
    [key: string]: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
}


export interface RateLimitSettings extends WhatsAppRateLimitSettings {}

export interface CampaignAnalytics {
  id: number;
  campaign_id: number;
  snapshot_time: Date;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  pending_count: number;
  delivery_rate: number;
  failure_rate: number;
  avg_delivery_time?: number;
  created_at: Date;
}

export interface MediaMetadata {
  [filename: string]: {
    originalName: string;
    size: number;
    mimetype: string;
    contentType: 'image' | 'video' | 'audio' | 'document';
    uploadedAt: Date;
    uploadedBy: number;
    dimensions?: {
      width: number;
      height: number;
    };
    duration?: number;
  };
}

export interface WhatsAppAccountInfo {
  id: number;
  companyId: number;
  channelId?: number;
  accountName: string;
  phoneNumber: string;
  accountType: 'official' | 'unofficial';
  sessionData?: any;
  qrCode?: string;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error' | 'banned';
  lastActivityAt?: Date;
  messageCountToday: number;
  messageCountHour: number;
  warningCount: number;
  restrictionCount: number;
  rateLimits: any;
  healthScore: number;
  lastHealthCheck?: Date;
  isActive: boolean;
  rotationGroup?: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  paused: number;
}

export interface CampaignProcessingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
  accountId?: number;
  recipientPhone?: string;
}

export interface CampaignCreateRequest {
  name: string;
  description?: string;
  content: string;
  channelType: 'whatsapp_unofficial' | 'whatsapp_official';
  channelId?: number;
  templateId?: number;
  segmentId?: number;
  campaignType: 'immediate' | 'scheduled';
  scheduledAt?: string;
  rateLimitSettings: RateLimitSettings;
}

export interface CampaignUpdateRequest extends Partial<CampaignCreateRequest> {
  status?: Campaign['status'];
}

export interface TemplateCreateRequest {
  name: string;
  description?: string;
  category: string;
  content: string;
  contentType?: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrls?: string[];
  variables?: string[];
  channelType?: string;
}

export interface SegmentCreateRequest {
  name: string;
  description?: string;
  filterCriteria: SegmentFilterCriteria;
}

export interface CampaignError extends Error {
  code: string;
  campaignId?: number;
  recipientId?: number;
  accountId?: number;
  retryable: boolean;
}

export interface CampaignEvent {
  type: 'campaign_started' | 'campaign_completed' | 'campaign_failed' | 'message_sent' | 'message_failed' | 'queue_updated';
  campaignId: number;
  companyId: number;
  timestamp: Date;
  data: any;
}

export interface CampaignWebhookPayload {
  event: CampaignEvent['type'];
  campaign: Campaign;
  stats?: CampaignAnalytics;
  error?: string;
  timestamp: Date;
}

export interface MessageWebhookPayload {
  event: 'message_sent' | 'message_delivered' | 'message_failed';
  campaignId: number;
  recipientId: number;
  messageId?: string;
  phone: string;
  status: string;
  error?: string;
  timestamp: Date;
}
