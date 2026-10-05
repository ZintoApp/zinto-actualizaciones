export type CurrencyFormatOptions = {
  locale?: string;
  decimalPlaces?: number | null;
  style?: 'currency' | 'decimal';
};

/** Display ERP precision when supplied; preserve ISO defaults for existing callers. */
export function formatCurrency(amount: number, currency = 'USD', options: CurrencyFormatOptions = {}): string {
  const locale = options.locale ?? 'en-US';
  const configured = options.decimalPlaces;
  const precision = configured != null && Number.isInteger(configured) && configured >= 0 && configured <= 20
    ? configured : undefined;
  const digits = precision === undefined ? {} : { minimumFractionDigits: precision, maximumFractionDigits: precision };
  try {
    // Decimal-only accounting columns still follow the currency's precision.
    const currencyFormat = new Intl.NumberFormat(locale, { style: 'currency', currency, ...digits });
    if (options.style === 'decimal') {
      const resolved = currencyFormat.resolvedOptions();
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: resolved.minimumFractionDigits,
        maximumFractionDigits: resolved.maximumFractionDigits,
      }).format(amount);
    }
    return currencyFormat.format(amount);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const formatted = amount.toLocaleString(locale, {
      minimumFractionDigits: precision ?? 2, maximumFractionDigits: precision ?? 2,
    });
    return options.style === 'decimal' ? formatted : `${currency} ${formatted}`;
  }
}
