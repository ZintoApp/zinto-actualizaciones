/**
 * WhatsApp Rate Limit Service
 * Handles rate limiting logic for different WhatsApp channel types
 */

import {
  WHATSAPP_CHANNEL_TYPES,
  WHATSAPP_RATE_LIMITS
} from '@/lib/whatsapp-constants';

export interface RateLimitCalculation {
  recommended_messages_per_minute: number;
  recommended_delay_ms: number;
  estimated_completion_minutes: number;
  safety_factor: number;
  warnings: string[];
  channel_limits: {
    max_per_minute: number;
    max_per_hour: number;
    max_per_day: number;
    burst_limit: number;
  };
}

export interface RateLimitStatus {
  current_rate: number;
  remaining_today: number;
  remaining_hour: number;
  next_reset_time: Date;
  is_throttled: boolean;
  throttle_reason?: string;
}

export class WhatsAppRateLimitService {
  private static instance: WhatsAppRateLimitService;
  private rateLimitCache = new Map<string, RateLimitStatus>();
  private lastUpdateTime = new Map<string, number>();

  static getInstance(): WhatsAppRateLimitService {
    if (!WhatsAppRateLimitService.instance) {
      WhatsAppRateLimitService.instance = new WhatsAppRateLimitService();
    }
    return WhatsAppRateLimitService.instance;
  }

  /**
   * Calculate optimal rate limits for a campaign
   */
  calculateOptimalRateLimit(
    channelType: string,
    recipientCount: number,
    accountCount: number = 1,
    priorityLevel: 'low' | 'medium' | 'high' = 'medium'
  ): RateLimitCalculation {
    const limits = this.getChannelLimits(channelType);
    const warnings: string[] = [];
    

    const safetyFactors = {
      [WHATSAPP_CHANNEL_TYPES.OFFICIAL]: {
        low: 0.9,
        medium: 0.8,
        high: 0.7
      },
      [WHATSAPP_CHANNEL_TYPES.UNOFFICIAL]: {
        low: 0.6,
        medium: 0.5,
        high: 0.4
      }
    };

    const safetyFactor = safetyFactors[channelType as keyof typeof safetyFactors]?.[priorityLevel] || 0.5;
    

    const perAccountLimit = Math.floor(limits.MESSAGES_PER_MINUTE / accountCount);
    const recommendedRate = Math.floor(perAccountLimit * safetyFactor);
    

    const minRate = channelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL ? 10 : 1;
    const finalRate = Math.max(recommendedRate, minRate);
    

    const delayMs = Math.ceil(60000 / finalRate);
    const estimatedMinutes = Math.ceil(recipientCount / (finalRate * accountCount));
    

    if (channelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL) {
      warnings.push('Unofficial channels have higher ban risk - consider business hours only');
      
      if (recipientCount > 500) {
        warnings.push('Large campaigns on unofficial channels may trigger account restrictions');
      }
      
      if (finalRate > 15) {
        warnings.push('High rate detected - consider reducing to avoid detection');
      }
    }
    
    if (estimatedMinutes > 480) { // 8 hours
      warnings.push('Campaign will take over 8 hours - consider splitting into smaller batches');
    }
    
    if (accountCount === 1 && recipientCount > 1000) {
      warnings.push('Consider using multiple accounts for better distribution and reduced risk');
    }

    return {
      recommended_messages_per_minute: finalRate,
      recommended_delay_ms: delayMs,
      estimated_completion_minutes: estimatedMinutes,
      safety_factor: safetyFactor,
      warnings,
      channel_limits: {
        max_per_minute: limits.MESSAGES_PER_MINUTE,
        max_per_hour: limits.MESSAGES_PER_HOUR,
        max_per_day: limits.MESSAGES_PER_DAY,
        burst_limit: limits.BURST_LIMIT
      }
    };
  }

  /**
   * Get current rate limit status for an account
   */
  async getRateLimitStatus(accountId: string, channelType: string): Promise<RateLimitStatus> {
    const cacheKey = `${accountId}-${channelType}`;
    const cached = this.rateLimitCache.get(cacheKey);
    const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
    

    if (cached && Date.now() - lastUpdate < 60000) {
      return cached;
    }

    try {

      const response = await fetch(`/api/whatsapp/rate-limit-status/${accountId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const status: RateLimitStatus = {
          current_rate: data.current_rate || 0,
          remaining_today: data.remaining_today || this.getChannelLimits(channelType).MESSAGES_PER_DAY,
          remaining_hour: data.remaining_hour || this.getChannelLimits(channelType).MESSAGES_PER_HOUR,
          next_reset_time: new Date(data.next_reset_time || Date.now() + 3600000),
          is_throttled: data.is_throttled || false,
          throttle_reason: data.throttle_reason
        };
        
        this.rateLimitCache.set(cacheKey, status);
        this.lastUpdateTime.set(cacheKey, Date.now());
        return status;
      }
    } catch (error) {
      console.error('Failed to fetch rate limit status:', error);
    }


    const limits = this.getChannelLimits(channelType);
    return {
      current_rate: 0,
      remaining_today: limits.MESSAGES_PER_DAY,
      remaining_hour: limits.MESSAGES_PER_HOUR,
      next_reset_time: new Date(Date.now() + 3600000),
      is_throttled: false
    };
  }

  /**
   * Check if a campaign can be executed with current rate limits
   */
  async canExecuteCampaign(
    accountIds: string[],
    channelType: string,
    recipientCount: number
  ): Promise<{ canExecute: boolean; reasons: string[]; estimatedDelay?: number }> {
    const reasons: string[] = [];
    let canExecute = true;
    let maxDelay = 0;

    for (const accountId of accountIds) {
      const status = await this.getRateLimitStatus(accountId, channelType);
      
      if (status.is_throttled) {
        canExecute = false;
        reasons.push(`Account ${accountId} is currently throttled: ${status.throttle_reason}`);
      }
      
      const messagesPerAccount = Math.ceil(recipientCount / accountIds.length);
      
      if (status.remaining_today < messagesPerAccount) {
        canExecute = false;
        reasons.push(`Account ${accountId} has insufficient daily quota (${status.remaining_today} remaining, ${messagesPerAccount} needed)`);
      }
      
      if (status.remaining_hour < Math.min(messagesPerAccount, 100)) {
        const delayMinutes = Math.ceil((status.next_reset_time.getTime() - Date.now()) / 60000);
        maxDelay = Math.max(maxDelay, delayMinutes);
        reasons.push(`Account ${accountId} needs to wait ${delayMinutes} minutes for hourly reset`);
      }
    }

    return {
      canExecute,
      reasons,
      estimatedDelay: maxDelay > 0 ? maxDelay : undefined
    };
  }

  /**
   * Get adaptive rate limit based on recent performance
   */
  getAdaptiveRateLimit(
    baseRate: number,
    channelType: string,
    recentFailureRate: number = 0
  ): number {
    let adaptiveRate = baseRate;
    

    if (recentFailureRate > 0.1) { // 10% failure rate
      adaptiveRate = Math.floor(baseRate * 0.7);
    } else if (recentFailureRate > 0.05) { // 5% failure rate
      adaptiveRate = Math.floor(baseRate * 0.85);
    }
    

    if (channelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL) {

      adaptiveRate = Math.floor(adaptiveRate * 0.8);
    }
    

    const minRate = channelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL ? 5 : 1;
    return Math.max(adaptiveRate, minRate);
  }

  /**
   * Calculate business hours adjusted schedule
   */
  calculateBusinessHoursSchedule(
    recipientCount: number,
    ratePerMinute: number,
    _timezone: string = 'UTC', // Prefixed with underscore to indicate intentionally unused
    businessHours: { start: string; end: string } = { start: '09:00', end: '17:00' }
  ): {
    scheduledBatches: Array<{ startTime: Date; endTime: Date; messageCount: number }>;
    totalDays: number;
  } {
    const batches: Array<{ startTime: Date; endTime: Date; messageCount: number }> = [];
    const messagesPerHour = ratePerMinute * 60;
    const businessHoursPerDay = 8; // 9 AM to 5 PM
    const messagesPerDay = messagesPerHour * businessHoursPerDay;
    
    let remainingMessages = recipientCount;
    let currentDate = new Date();
    

    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(businessHours.start.split(':')[0]);
    const endHour = parseInt(businessHours.end.split(':')[0]);
    
    if (currentHour < startHour || currentHour >= endHour) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    while (remainingMessages > 0) {

      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      
      const messagesForDay = Math.min(remainingMessages, messagesPerDay);
      
      const startTime = new Date(currentDate);
      startTime.setHours(startHour, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setHours(endHour, 0, 0, 0);
      
      batches.push({
        startTime,
        endTime,
        messageCount: messagesForDay
      });
      
      remainingMessages -= messagesForDay;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
      scheduledBatches: batches,
      totalDays: batches.length
    };
  }

  private getChannelLimits(channelType: string) {
    return channelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
      ? WHATSAPP_RATE_LIMITS.official
      : WHATSAPP_RATE_LIMITS.unofficial;
  }

  /**
   * Clear rate limit cache
   */
  clearCache(): void {
    this.rateLimitCache.clear();
    this.lastUpdateTime.clear();
  }
}


export const whatsappRateLimitService = WhatsAppRateLimitService.getInstance();
