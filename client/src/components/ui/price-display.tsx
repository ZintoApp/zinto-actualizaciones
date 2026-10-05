import React from 'react';
import { cn } from '@/lib/utils';
import { getPricingInfo, getDiscountDurationText, type PlanDiscount } from '@/utils/pricing';
import { getPlanBillingPeriod } from '@/utils/plan-duration';
import { useCurrency } from '@/contexts/currency-context';

interface PriceDisplayProps {
  plan: { price: number | string } & PlanDiscount;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showPeriod?: boolean;
  period?: string;
  className?: string;
  showDiscountBadge?: boolean;
  showSavings?: boolean;
  layout?: 'horizontal' | 'vertical';
}

export function PriceDisplay({
  plan,
  size = 'md',
  showPeriod = true,
  period,
  className,
  showDiscountBadge = true,
  showSavings = false,
  layout = 'horizontal'
}: PriceDisplayProps) {
  const { formatCurrency } = useCurrency();
  const pricing = getPricingInfo(plan);
  

  const billingPeriod = period || getPlanBillingPeriod(plan);


  const safeDiscountedPrice = typeof pricing.discountedPrice === 'number' ? pricing.discountedPrice : 0;
  const safeOriginalPrice = typeof pricing.originalPrice === 'number' ? pricing.originalPrice : 0;
  const safeDiscountAmount = typeof pricing.discountAmount === 'number' ? pricing.discountAmount : 0;


  const sizeConfig = {
    sm: {
      currentPrice: 'text-lg font-bold',
      originalPrice: 'text-sm line-through',
      period: 'text-sm',
      badge: 'text-xs px-2 py-1',
      savings: 'text-xs'
    },
    md: {
      currentPrice: 'text-2xl font-bold',
      originalPrice: 'text-lg line-through',
      period: 'text-base',
      badge: 'text-xs px-2 py-1',
      savings: 'text-sm'
    },
    lg: {
      currentPrice: 'text-3xl font-bold',
      originalPrice: 'text-xl line-through',
      period: 'text-lg',
      badge: 'text-sm px-3 py-1',
      savings: 'text-base'
    },
    xl: {
      currentPrice: 'text-4xl font-bold',
      originalPrice: 'text-2xl line-through',
      period: 'text-xl',
      badge: 'text-base px-4 py-2',
      savings: 'text-lg'
    }
  };

  const config = sizeConfig[size];

  if (!pricing.hasDiscount) {

    return (
      <div className={cn('flex items-baseline gap-2', className)}>
        <span className={cn(config.currentPrice, 'text-foreground')}>
          {formatCurrency(safeDiscountedPrice)}
        </span>
        {showPeriod && (
          <span className={cn(config.period, 'text-muted-foreground')}>
            {billingPeriod}
          </span>
        )}
      </div>
    );
  }


  if (layout === 'vertical') {
    return (
      <div className={cn('space-y-2', className)}>
        {/* Current discounted price */}
        <div className="flex items-baseline gap-2">
          <span className={cn(config.currentPrice, 'text-green-600')}>
            {formatCurrency(safeDiscountedPrice)}
          </span>
          {showPeriod && (
            <span className={cn(config.period, 'text-muted-foreground')}>
              {billingPeriod}
            </span>
          )}
        </div>

        {/* Original price with strikethrough */}
        <div className="flex items-center gap-2">
          <span className={cn(config.originalPrice, 'text-muted-foreground')}>
            {formatCurrency(safeOriginalPrice)}
          </span>
          {showDiscountBadge && pricing.discountLabel && (
            <span className={cn(
              config.badge,
              'bg-green-100 text-green-800 font-medium rounded-full'
            )}>
              {pricing.discountLabel}
            </span>
          )}
        </div>

        {/* Savings information */}
        {showSavings && (
          <div className={cn(config.savings, 'text-green-600 font-medium')}>
            Save {formatCurrency(safeDiscountAmount)} ({pricing.discountPercentage}%)
          </div>
        )}

        {/* Duration text */}
        {plan.discountDuration && plan.discountDuration !== 'permanent' && (
          <div className={cn(config.savings, 'text-muted-foreground')}>
            {getDiscountDurationText(plan.discountDuration)}
          </div>
        )}
      </div>
    );
  }


  return (
    <div className={cn('space-y-2', className)}>
      {/* Price line */}
      <div className="flex items-center gap-3">
        <span className={cn(config.currentPrice, 'text-green-600')}>
          {formatCurrency(safeDiscountedPrice)}
        </span>
        <span className={cn(config.originalPrice, 'text-muted-foreground')}>
          {formatCurrency(safeOriginalPrice)}
        </span>
        {showPeriod && (
          <span className={cn(config.period, 'text-muted-foreground')}>
            {billingPeriod}
          </span>
        )}
      </div>

      {/* Discount badges and info */}
      <div className="flex items-center gap-2 flex-wrap">
        {showDiscountBadge && pricing.discountLabel && (
          <span className={cn(
            config.badge,
            'bg-green-100 text-green-800 font-medium rounded-full'
          )}>
            {pricing.discountLabel}
          </span>
        )}
        
        {showSavings && (
          <span className={cn(config.badge, 'bg-blue-100 text-blue-800 font-medium rounded-full')}>
            Save {formatCurrency(safeDiscountAmount)}
          </span>
        )}

        {plan.discountDuration && plan.discountDuration !== 'permanent' && (
          <span className={cn(config.savings, 'text-muted-foreground')}>
            {getDiscountDurationText(plan.discountDuration)}
          </span>
        )}
      </div>
    </div>
  );
}


export function CompactPriceDisplay({
  plan,
  className
}: {
  plan: { price: number | string } & PlanDiscount;
  className?: string;
}) {
  const { formatCurrency } = useCurrency();
  const pricing = getPricingInfo(plan);


  const safeDiscountedPrice = typeof pricing.discountedPrice === 'number' ? pricing.discountedPrice : 0;
  const safeOriginalPrice = typeof pricing.originalPrice === 'number' ? pricing.originalPrice : 0;

  if (!pricing.hasDiscount) {
    return (
      <span className={cn('font-semibold', className)}>
        {formatCurrency(safeDiscountedPrice)}
      </span>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-semibold text-green-600">
        {formatCurrency(safeDiscountedPrice)}
      </span>
      <span className="text-sm text-muted-foreground line-through">
        {formatCurrency(safeOriginalPrice)}
      </span>
      {pricing.discountLabel && (
        <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
          {pricing.discountLabel}
        </span>
      )}
    </div>
  );
}
