/** Storage capacity shared by ERP money, distinct from exchange-rate precision. */
export const ERP_MONEY_MAX_DIGITS = 6;
export function erpCurrencyDigits(value: unknown): number {
  const digits = value == null ? 2 : Number(value);
  if (!Number.isInteger(digits) || digits < 0 || digits > ERP_MONEY_MAX_DIGITS) throw new Error('ERP currency precision must be between zero and six decimal places');
  return digits;
}

/** Aggregated historical money can outlive changes to company currency settings.
 * Preserve significant stored minor units while ignoring numeric-column padding. */
export function erpRetainedAmountDigits(value:unknown,currentDigits:unknown):number {
 const configured=erpCurrencyDigits(currentDigits),text=String(value??'0');
 if(!/^-?\d+(\.\d+)?$/.test(text))throw new Error('Invalid retained ERP monetary amount');
 const fraction=(text.split('.')[1]??'').replace(/0+$/,'');
 if(fraction.length>ERP_MONEY_MAX_DIGITS)throw new Error('Retained ERP amount exceeds storage precision');
 return Math.max(configured,fraction.length);
}
