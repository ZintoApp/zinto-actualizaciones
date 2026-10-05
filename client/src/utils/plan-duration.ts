/**
 * Utility functions for formatting plan duration and billing information
 */

export interface PlanDurationInfo {
  billingInterval: string;
  customDurationDays?: number | null;
}

/**
 * Format plan duration into human-readable text
 */
export function formatPlanDuration(billingInterval: string, customDurationDays?: number | null): string {
  switch (billingInterval) {
    case 'lifetime':
      return 'Lifetime';
    case 'daily':
      return '24 hours';
    case 'weekly':
      return '7 days';
    case 'biweekly':
      return '14 days';
    case 'monthly':
      return '30 days';
    case 'quarterly':
      return '3 months';
    case 'semi_annual':
      return '6 months';
    case 'annual':
      return '12 months';
    case 'biennial':
      return '2 years';
    case 'custom':
      return customDurationDays ? `${customDurationDays} days` : 'Custom';

    case 'month':
      return '30 days';
    case 'quarter':
      return '3 months';
    case 'year':
      return '12 months';
    default:
      return '30 days';
  }
}

/**
 * Get billing period text for price display (e.g., "/month", "/year", "/lifetime")
 */
export function getBillingPeriodText(billingInterval: string, customDurationDays?: number | null): string {
  switch (billingInterval) {
    case 'lifetime':
      return '/lifetime';
    case 'daily':
      return '/day';
    case 'weekly':
      return '/week';
    case 'biweekly':
      return '/2 weeks';
    case 'monthly':
      return '/month';
    case 'quarterly':
      return '/quarter';
    case 'semi_annual':
      return '/6 months';
    case 'annual':
      return '/year';
    case 'biennial':
      return '/2 years';
    case 'custom':
      return customDurationDays ? `/${customDurationDays} days` : '/custom';

    case 'month':
      return '/month';
    case 'quarter':
      return '/quarter';
    case 'year':
      return '/year';
    default:
      return '/month';
  }
}

/**
 * Check if a plan is lifetime (never expires)
 */
export function isLifetimePlan(billingInterval: string): boolean {
  return billingInterval === 'lifetime';
}

/**
 * Check if a plan has automatic renewal
 */
export function hasAutomaticRenewal(billingInterval: string): boolean {
  return billingInterval !== 'lifetime';
}

/**
 * Get the number of days in a billing cycle
 */
export function getBillingCycleDays(billingInterval: string, customDurationDays?: number | null): number {
  switch (billingInterval) {
    case 'lifetime':
      return 36500; // ~100 years
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
    case 'monthly':
      return 30;
    case 'quarterly':
      return 90;
    case 'semi_annual':
      return 180;
    case 'annual':
      return 365;
    case 'biennial':
      return 730;
    case 'custom':
      return customDurationDays || 30;

    case 'month':
      return 30;
    case 'quarter':
      return 90;
    case 'year':
      return 365;
    default:
      return 30;
  }
}

/**
 * Format plan duration for display in UI components
 */
export function formatPlanDurationForDisplay(plan: any): string {
  const billingInterval = plan.billingInterval || plan.billing_interval || 'monthly';
  const customDurationDays = plan.customDurationDays || plan.custom_duration_days;
  return formatPlanDuration(billingInterval, customDurationDays);
}

/**
 * Get billing period text for a plan
 */
export function getPlanBillingPeriod(plan: any): string {
  const billingInterval = plan.billingInterval || plan.billing_interval || 'monthly';
  const customDurationDays = plan.customDurationDays || plan.custom_duration_days;
  return getBillingPeriodText(billingInterval, customDurationDays);
}
