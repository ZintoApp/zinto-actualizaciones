/**
 * Pricing utility functions for handling plan discounts and price calculations
 */

export interface PlanDiscount {
  discountType?: "none" | "percentage" | "fixed_amount";
  discountValue?: number | string;
  discountDuration?: "permanent" | "first_month" | "first_year" | "limited_time";
  discountStartDate?: string | Date;
  discountEndDate?: string | Date;
  originalPrice?: number | string;
}

export interface PricingInfo {
  originalPrice: number;
  discountedPrice: number;
  hasDiscount: boolean;
  discountAmount: number;
  discountPercentage: number;
  discountLabel: string;
  isDiscountActive: boolean;
}

/**
 * Convert string or number to number
 */
function toNumber(value: string | number | undefined | null): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
}

/**
 * Check if a discount is currently active based on dates and configuration
 */
export function isDiscountActive(discount: PlanDiscount): boolean {
  const discountValue = toNumber(discount.discountValue);
  if (!discount.discountType || discount.discountType === "none" || !discount.discountValue || discountValue <= 0) {
    return false;
  }


  if (discount.discountDuration === "limited_time") {
    const now = new Date();
    const startDate = discount.discountStartDate ? new Date(discount.discountStartDate) : null;
    const endDate = discount.discountEndDate ? new Date(discount.discountEndDate) : null;

    if (startDate && now < startDate) {
      return false; // Discount hasn't started yet
    }

    if (endDate && now > endDate) {
      return false; // Discount has expired
    }
  }

  return true;
}

/**
 * Calculate the discounted price based on discount configuration
 */
export function calculateDiscountedPrice(originalPrice: number, discount: PlanDiscount): number {
  if (!isDiscountActive(discount)) {
    return originalPrice;
  }

  const discountValue = toNumber(discount.discountValue);

  if (discount.discountType === "percentage") {
    const discountAmount = (originalPrice * discountValue) / 100;
    return Math.max(0, originalPrice - discountAmount);
  } else if (discount.discountType === "fixed_amount") {
    return Math.max(0, originalPrice - discountValue);
  }

  return originalPrice;
}

/**
 * Get comprehensive pricing information for a plan
 */
export function getPricingInfo(plan: { price: number | string } & PlanDiscount): PricingInfo {
  const originalPrice = toNumber(plan.originalPrice) || toNumber(plan.price);
  const hasActiveDiscount = isDiscountActive(plan);
  const discountedPrice = hasActiveDiscount ? calculateDiscountedPrice(originalPrice, plan) : toNumber(plan.price);
  const discountAmount = originalPrice - discountedPrice;
  const discountPercentage = originalPrice > 0 ? Math.round((discountAmount / originalPrice) * 100) : 0;


  let discountLabel = "";
  const discountValue = toNumber(plan.discountValue);
  if (hasActiveDiscount && plan.discountValue && discountValue > 0) {
    if (plan.discountType === "percentage") {
      discountLabel = `${discountValue}% OFF`;
    } else if (plan.discountType === "fixed_amount") {
      discountLabel = `$${discountValue} OFF`;
    }
  }

  return {
    originalPrice: Number(originalPrice),
    discountedPrice: Number(discountedPrice),
    hasDiscount: hasActiveDiscount,
    discountAmount: Number(discountAmount),
    discountPercentage: Number(discountPercentage),
    discountLabel,
    isDiscountActive: hasActiveDiscount
  };
}

/**
 * Get discount duration display text
 */
export function getDiscountDurationText(duration?: string): string {
  switch (duration) {
    case "first_month":
      return "First month only";
    case "first_year":
      return "First year only";
    case "limited_time":
      return "Limited time";
    case "permanent":
    default:
      return "";
  }
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

/**
 * Calculate savings amount and percentage
 */
export function calculateSavings(originalPrice: number, discountedPrice: number): {
  amount: number;
  percentage: number;
  formattedAmount: string;
} {
  const amount = originalPrice - discountedPrice;
  const percentage = originalPrice > 0 ? Math.round((amount / originalPrice) * 100) : 0;
  
  return {
    amount,
    percentage,
    formattedAmount: formatPrice(amount)
  };
}
