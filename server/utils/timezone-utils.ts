/**
 * Timezone utilities for AI Assistant date/time context injection
 * Provides accurate timezone handling and date formatting for AI prompts
 */

/**
 * Get current date and time formatted for AI context injection
 * @param timezone - IANA timezone identifier (e.g., 'America/New_York')
 * @returns Formatted date/time string for AI context
 */
export function getCurrentDateTimeContext(timezone: string = 'UTC', instant: Date = new Date()): string {
  try {
    const now = instant;


    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });

    const parts = formatter.formatToParts(now);
    const partsMap = parts.reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {} as Record<string, string>);


    return `${partsMap.weekday}, ${partsMap.month} ${partsMap.day}, ${partsMap.year}, ${partsMap.hour}:${partsMap.minute} ${partsMap.dayPeriod} ${partsMap.timeZoneName} (${timezone})`;
  } catch (error) {
    console.error('Error formatting date/time context:', error);
    if (timezone !== 'UTC') return getCurrentDateTimeContext('UTC', instant);
    return `${instant.toISOString()} UTC (fallback)`;
  }
}

/**
 * Inject current date/time context into system prompt
 * @param systemPrompt - Original system prompt
 * @param timezone - IANA timezone identifier
 * @returns Enhanced system prompt with date/time context
 */
export function injectDateTimeContext(systemPrompt: string, timezone: string = 'UTC', instant: Date = new Date()): string {
  const dateTimeContext = getCurrentDateTimeContext(timezone, instant);
  

  const contextPrefix = `Current date and time: ${dateTimeContext}\n\n`;
  
  return contextPrefix + systemPrompt;
}

/**
 * Get timezone abbreviation for display purposes
 * @param timezone - IANA timezone identifier
 * @returns Timezone abbreviation (e.g., 'EST', 'PST', 'UTC')
 */
export function getTimezoneAbbreviation(timezone: string = 'UTC'): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(now);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    return timeZonePart?.value || 'UTC';
  } catch (error) {
    console.error('Error getting timezone abbreviation:', error);
    return 'UTC';
  }
}

/**
 * Validate if a timezone string is valid
 * @param timezone - IANA timezone identifier to validate
 * @returns true if timezone is valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  try {

    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get current timestamp in specified timezone for logging
 * @param timezone - IANA timezone identifier
 * @returns ISO string with timezone information
 */
export function getCurrentTimestamp(timezone: string = 'UTC'): string {
  try {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const formatted = formatter.format(now);
    const tzAbbr = getTimezoneAbbreviation(timezone);
    return `${formatted} ${tzAbbr}`;
  } catch (error) {
    console.error('Error getting current timestamp:', error);
    return new Date().toISOString();
  }
}

/**
 * Common timezone options for UI dropdowns
 */
export const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Rome', label: 'Rome' },
  { value: 'Europe/Madrid', label: 'Madrid' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Mumbai', label: 'Mumbai' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Australia/Melbourne', label: 'Melbourne' },
  { value: 'Pacific/Auckland', label: 'Auckland' }
];

/**
 * Get browser timezone as fallback
 * @returns Browser's detected timezone or UTC as fallback
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    console.error('Error getting browser timezone:', error);
    return 'UTC';
  }
}
