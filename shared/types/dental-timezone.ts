export type DentalTimezoneStatus =
  | { status: 'valid'; timezone: string }
  | { status: 'missing' | 'invalid'; timezone: null };

export const DENTAL_TIMEZONE_ERROR = 'DENTAL_TIMEZONE_REQUIRED';
