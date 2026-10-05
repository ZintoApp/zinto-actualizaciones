import { ErpValidationError, storage } from "../../storage";

import { roundErpDecimal, multiplyErpDecimals, divideErpDecimals } from "./decimal-math";

export async function convertAmount(
  amount: string,
  fromCurrency: string,
  toCurrency: string,
  companyId: number,
  asOfDate?: Date
): Promise<string> {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return roundErpDecimal(amount, 6);

  const direct = await storage.getLatestExchangeRate(companyId, from, to, asOfDate);
  if (direct) {
    const directRate = Number(direct.rate);
    if (!Number.isFinite(directRate) || directRate <= 0) {
      throw new ErpValidationError(`Invalid exchange rate for ${from} -> ${to}`);
    }
    return multiplyErpDecimals(amount, String(direct.rate), 6);
  }
  const inverse = await storage.getLatestExchangeRate(companyId, to, from, asOfDate);
  if (inverse) {
    const invRate = String(inverse.rate);
    if (!Number.isFinite(Number(invRate)) || Number(invRate) <= 0) {
      throw new ErpValidationError(`Invalid inverse rate for ${from} -> ${to}`);
    }
    return divideErpDecimals(amount, invRate, 6);
  }
  throw new ErpValidationError(`No exchange rate found for ${from} -> ${to}`);
}

export async function getEffectiveRate(
  companyId: number,
  fromCurrency: string,
  toCurrency: string,
  asOfDate?: Date
): Promise<number> {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return 1;
  const direct = await storage.getLatestExchangeRate(companyId, from, to, asOfDate);
  if (direct) {
    const directRate = Number(direct.rate);
    if (!Number.isFinite(directRate) || directRate <= 0) {
      throw new ErpValidationError(`Invalid exchange rate for ${from} -> ${to}`);
    }
    return directRate;
  }
  const inverse = await storage.getLatestExchangeRate(companyId, to, from, asOfDate);
  if (inverse) {
    const inverseRate = Number(inverse.rate);
    if (!Number.isFinite(inverseRate) || inverseRate <= 0) {
      throw new ErpValidationError(`Invalid inverse rate for ${from} -> ${to}`);
    }
    return 1 / inverseRate;
  }
  throw new ErpValidationError(`No exchange rate found for ${from} -> ${to}`);
}

export async function formatCurrency(amount: string, currencyCode: string, companyId: number): Promise<string> {
  const code = currencyCode.trim().toUpperCase();
  const row = await storage.getCurrencyByCode(companyId, code);
  const dp = row?.decimalPlaces ?? 2;
  const sym = row?.symbol ?? code;
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return `${sym}${formatted}`;
}

/** Prefer an explicit currency; otherwise the company's ERP base currency; else USD. */
export async function resolveCompanyCurrencyCode(
  companyId: number,
  requested?: string | null,
): Promise<string> {
  const trimmed = requested?.trim();
  if (trimmed) return trimmed.toUpperCase();
  const base = await storage.getBaseCurrency(companyId);
  const code = base?.code?.trim().toUpperCase();
  return code || "USD";
}
