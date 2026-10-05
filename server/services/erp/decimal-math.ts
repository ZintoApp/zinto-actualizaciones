/** Exact decimal arithmetic for shared ERP currency conversion. */
type Decimal = { coefficient: bigint; scale: number };

function parseDecimal(input: string): Decimal {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(input.trim());
  if (!match) throw new Error('Invalid numeric string');
  const exponent = Number(match[5] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error('Invalid decimal exponent');
  const fraction = match[3] ?? match[4] ?? '';
  let coefficient = BigInt((match[2] ?? '0') + fraction) * (match[1] === '-' ? -1n : 1n);
  let scale = fraction.length - exponent;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return { coefficient, scale };
}

function fixedRatio(numerator: bigint, denominator: bigint, digits: number): string {
  if (!Number.isInteger(digits) || digits < 0 || digits > 8) throw new Error('Invalid ERP decimal precision');
  if (denominator === 0n) throw new Error('Division by zero');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = (numerator < 0n ? -numerator : numerator) * 10n ** BigInt(digits);
  const d = denominator < 0n ? -denominator : denominator;
  // Round once, half away from zero, after the complete decimal operation.
  const rounded = n / d + ((n % d) * 2n >= d ? 1n : 0n);
  const raw = rounded.toString().padStart(digits + 1, '0');
  const value = digits ? `${raw.slice(0, -digits)}.${raw.slice(-digits)}` : raw;
  return negative && rounded !== 0n ? `-${value}` : value;
}

export function roundErpDecimal(value: string, digits: number): string {
  const decimal = parseDecimal(value);
  return fixedRatio(decimal.coefficient, 10n ** BigInt(decimal.scale), digits);
}

export function multiplyErpDecimals(left: string, right: string, digits: number): string {
  const a = parseDecimal(left), b = parseDecimal(right);
  return fixedRatio(a.coefficient * b.coefficient, 10n ** BigInt(a.scale + b.scale), digits);
}

export function divideErpDecimals(left: string, right: string, digits: number): string {
  const a = parseDecimal(left), b = parseDecimal(right);
  return fixedRatio(a.coefficient * 10n ** BigInt(b.scale), b.coefficient * 10n ** BigInt(a.scale), digits);
}

/** Round a prorated amount only after both multiplication and division. */
export function prorateErpDecimal(amount: string, numerator: string, denominator: string, digits: number): string {
  const a = parseDecimal(amount), n = parseDecimal(numerator), d = parseDecimal(denominator);
  return fixedRatio(a.coefficient * n.coefficient * 10n ** BigInt(d.scale),
    d.coefficient * 10n ** BigInt(a.scale + n.scale), digits);
}

export function sumErpDecimals(values: string[], digits: number): string {
  const decimals = values.map(parseDecimal);
  const scale = Math.max(0, ...decimals.map(value => value.scale));
  const total = decimals.reduce((sum, value) => sum + value.coefficient * 10n ** BigInt(scale - value.scale), 0n);
  return fixedRatio(total, 10n ** BigInt(scale), digits);
}

/** Exact subtraction also accepts a signed historical carrying amount. */
export function subtractErpDecimals(left:string,right:string,digits:number):string {
 const value=right.trim();return sumErpDecimals([left,value.startsWith('-')?value.slice(1):'-'+value.replace(/^\+/,'')],digits);
}
