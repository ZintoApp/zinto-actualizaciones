/**
 * WhatsApp Campaign Service
 * Specialized service for WhatsApp-specific campaign functionality
 */

import { WhatsAppChannelType, WhatsAppMessageType, WhatsAppTemplateCategory } from '../types/campaign';

export class WhatsAppCampaignService {
  
  /**
   * Get rate limits based on WhatsApp channel type
   */
  static getRateLimits(channelType: WhatsAppChannelType) {
    const limits = {
      official: {
        messages_per_second: 20,
        messages_per_minute: 1000,
        messages_per_hour: 10000,
        messages_per_day: 100000,
        default_delay: 50, // milliseconds
        burst_limit: 100,
        burst_window: 60 // seconds
      },
      unofficial: {
        messages_per_second: 1,
        messages_per_minute: 20,
        messages_per_hour: 200,
        messages_per_day: 1000,
        default_delay: 3000, // 3 seconds
        burst_limit: 5,
        burst_window: 300 // 5 minutes
      }
    };

    return limits[channelType];
  }

  /**
   * Get channel capabilities
   */
  static getChannelCapabilities(channelType: WhatsAppChannelType) {
    const capabilities = {
      official: {
        supports_templates: true,
        supports_interactive_messages: true,
        supports_buttons: true,
        supports_lists: true,
        supports_quick_replies: true,
        supports_media: true,
        supports_documents: true,
        supports_location: true,
        supports_contacts: true,
        delivery_receipts: true,
        read_receipts: true,
        typing_indicators: true,
        business_hours_required: false,
        template_approval_required: true
      },
      unofficial: {
        supports_templates: false,
        supports_interactive_messages: false,
        supports_buttons: false,
        supports_lists: false,
        supports_quick_replies: false,
        supports_media: true,
        supports_documents: true,
        supports_location: false,
        supports_contacts: false,
        delivery_receipts: false,
        read_receipts: false,
        typing_indicators: true,
        business_hours_required: true,
        template_approval_required: false
      }
    };

    return capabilities[channelType];
  }

  /**
   * Validate message content for WhatsApp
   */
  static validateMessageContent(content: string, channelType: WhatsAppChannelType) {
    const errors: string[] = [];
    const warnings: string[] = [];


    if (content.length > 4096) {
      errors.push(`Message exceeds 4096 character limit (${content.length} characters)`);
    }



    const emojiCount = (content.match(/[\u2600-\u26FF]|[\u2700-\u27BF]/g) || []).length;
    if (emojiCount > 100) {
      warnings.push(`High emoji count (${emojiCount}) may trigger spam filters`);
    }


    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = content.match(urlPattern) || [];
    

    const suspiciousUrls = urls.filter(url => 
      url.includes('bit.ly') || 
      url.includes('tinyurl') || 
      url.includes('t.co')
    );
    
    if (suspiciousUrls.length > 0) {
      warnings.push('Shortened URLs may be flagged as spam');
    }


    const spamTriggers = [
      'urgent', 'limited time', 'act now', 'free money', 'guaranteed',
      'no risk', 'click here', 'buy now', 'special offer'
    ];
    
    const foundTriggers = spamTriggers.filter(trigger => 
      content.toLowerCase().includes(trigger)
    );
    
    if (foundTriggers.length > 0) {
      warnings.push(`Potential spam triggers found: ${foundTriggers.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      characterCount: content.length,
      emojiCount,
      urlCount: urls.length
    };
  }

  /**
   * Validate media file for WhatsApp
   */
  static validateMediaFile(file: { size: number; type: string; name: string }, messageType: WhatsAppMessageType) {
    const errors: string[] = [];
    
    const limits = {
      image: {
        maxSize: 16 * 1024 * 1024, // 16MB
        formats: ['image/jpeg', 'image/png', 'image/webp']
      },
      video: {
        maxSize: 16 * 1024 * 1024, // 16MB
        formats: ['video/mp4', 'video/3gpp']
      },
      audio: {
        maxSize: 16 * 1024 * 1024, // 16MB
        formats: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg']
      },
      document: {
        maxSize: 100 * 1024 * 1024, // 100MB
        formats: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain'
        ]
      }
    };

    const limit = limits[messageType as keyof typeof limits];
    if (!limit) {
      errors.push(`Unsupported message type: ${messageType}`);
      return { isValid: false, errors };
    }

    if (file.size > limit.maxSize) {
      errors.push(`File too large. Maximum size: ${limit.maxSize / (1024 * 1024)}MB`);
    }

    if (!limit.formats.includes(file.type)) {
      errors.push(`Unsupported file format: ${file.type}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate optimal rate limiting for channel type
   */
  static calculateOptimalRateLimit(channelType: WhatsAppChannelType, recipientCount: number) {
    const limits = this.getRateLimits(channelType);
    

    const messagesPerMinute = Math.min(limits.messages_per_minute, recipientCount);
    const estimatedMinutes = Math.ceil(recipientCount / messagesPerMinute);
    

    const safetyFactor = channelType === 'unofficial' ? 0.7 : 0.9; // Be more conservative with unofficial
    const recommendedRate = Math.floor(messagesPerMinute * safetyFactor);
    
    return {
      recommended_messages_per_minute: recommendedRate,
      recommended_delay: Math.ceil(60000 / recommendedRate), // milliseconds
      estimated_completion_minutes: Math.ceil(recipientCount / recommendedRate),
      safety_factor: safetyFactor
    };
  }

  /**
   * Check if business hours enforcement is needed
   */
  static requiresBusinessHours(channelType: WhatsAppChannelType): boolean {
    return channelType === 'unofficial';
  }

  /**
   * Get default anti-ban settings for channel type
   */
  static getDefaultAntiBanSettings(channelType: WhatsAppChannelType) {
    const baseSettings = {
      enabled: true,
      randomize_delay: true,
      account_rotation: true,
      avoid_spam_triggers: true,
      use_typing_indicators: true,
      randomize_message_timing: true
    };

    if (channelType === 'unofficial') {
      return {
        ...baseSettings,
        mode: 'conservative' as const,
        business_hours_only: true,
        respect_weekends: true,
        min_delay: 5000, // 5 seconds
        max_delay: 15000, // 15 seconds
        cooldown_period: 60, // 1 minute
        respect_recipient_timezone: true
      };
    } else {
      return {
        ...baseSettings,
        mode: 'moderate' as const,
        business_hours_only: false,
        respect_weekends: false,
        min_delay: 1000, // 1 second
        max_delay: 5000, // 5 seconds
        cooldown_period: 30, // 30 seconds
        respect_recipient_timezone: false
      };
    }
  }

  /**
   * Validate template for WhatsApp Business API
   */
  static validateWhatsAppTemplate(template: {
    name: string;
    content: string;
    category: WhatsAppTemplateCategory;
    variables: string[];
  }) {
    const errors: string[] = [];
    const warnings: string[] = [];


    if (!/^[a-z0-9_]+$/.test(template.name)) {
      errors.push('Template name must contain only lowercase letters, numbers, and underscores');
    }


    const variablePattern = /\{\{(\d+)\}\}/g;
    const foundVariables: RegExpExecArray[] = [];
    let match;
    while ((match = variablePattern.exec(template.content)) !== null) {
      foundVariables.push(match);
    }
    const variableNumbers = foundVariables.map(match => parseInt(match[1]));
    

    const expectedVariables = Array.from({ length: template.variables.length }, (_, i) => i + 1);
    const missingVariables = expectedVariables.filter(num => !variableNumbers.includes(num));
    
    if (missingVariables.length > 0) {
      errors.push(`Missing variables: {{${missingVariables.join('}}, {{')}}}`);
    }


    if (template.category === 'marketing') {
      warnings.push('Marketing templates require Facebook approval and may take 24-48 hours');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get supported message types for channel
   */
  static getSupportedMessageTypes(channelType: WhatsAppChannelType): WhatsAppMessageType[] {
    const baseTypes: WhatsAppMessageType[] = ['text', 'image', 'video', 'audio', 'document'];
    
    if (channelType === 'official') {
      return [...baseTypes, 'location', 'contact', 'template', 'interactive'];
    }
    
    return baseTypes;
  }
}
