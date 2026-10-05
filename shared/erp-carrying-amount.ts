export type ErpCarryingPrecision = { transactionDigits: number; baseDigits: number };
const defaultPrecision: ErpCarryingPrecision = { transactionDigits: 2, baseDigits: 2 };

export function erpMinorUnits(value: string, digits: number): bigint {
  if (!Number.isInteger(digits) || digits < 0 || digits > 6) throw new Error('Invalid ERP currency precision');
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Carrying amounts must be nonnegative ERP monetary amounts');
  const [whole, fraction = ''] = value.split('.');
  // Database numeric columns may add insignificant trailing zeroes.
  if (/[1-9]/.test(fraction.slice(digits))) throw new Error('Amount exceeds ERP currency precision');
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, '0') || '0');
}

export function erpMinorUnitsToAmount(value: bigint, digits: number): string {
  if (!Number.isInteger(digits) || digits < 0 || digits > 6 || value < 0n) throw new Error('Invalid ERP monetary amount');
  const factor = 10n ** BigInt(digits);
  return digits ? `${value / factor}.${String(value % factor).padStart(digits, '0')}` : String(value);
}

/** Allocate remaining historical base value; transaction/base currencies can differ in precision. */
export function allocateCarryingAmount(amount: string, remainingAmount: string, remainingBase: string, precision: ErpCarryingPrecision = defaultPrecision): string {
  const part = erpMinorUnits(amount, precision.transactionDigits), total = erpMinorUnits(remainingAmount, precision.transactionDigits), base = erpMinorUnits(remainingBase, precision.baseDigits);
  if (part <= 0n || total <= 0n || part > total) throw new Error('Payment exceeds the remaining posted open item');
  const allocated = (base * part + total / 2n) / total;
  return erpMinorUnitsToAmount(allocated, precision.baseDigits);
}

/** Signed source carrying is retained for corrections; open payable/receipt
 * allocations keep the nonnegative contract above. */
export function allocateSignedCarryingAmount(amount:string,remainingAmount:string,remainingBase:string,precision:ErpCarryingPrecision=defaultPrecision):string{
  const negative=remainingBase.startsWith('-');
  const allocated=allocateCarryingAmount(amount,remainingAmount,negative?remainingBase.slice(1):remainingBase,precision);
  return negative&&erpMinorUnits(allocated,precision.baseDigits)!==0n?`-${allocated}`:allocated;
}
