/**
 * Email Campaign Types
 */

export interface EmailCampaignData {
  name: string;
  description: string;
  emailSubject: string;
  emailProvider: 'smtp' | 'ses';
  channelId?: number;
  segmentId?: number;
  templateId?: number;
  campaignType: 'immediate' | 'scheduled';
  scheduledAt?: string;
  /** IANA timezone for scheduled send interpretation */
  timezone?: string;
  content: string;
  contentMode: 'text' | 'html';
}

export interface EmailCampaignTemplate {
  id: number;
  name: string;
  content: string;
  category: string;
  contentMode: 'text' | 'html';
}

export interface EmailContentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  characterCount: number;
}
