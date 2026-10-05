/**
 * Exchange rate utilities using Frankfurter API (no API key required).
 */

const cache = new Map<string, { rate: number; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getExchangeRate(from: string, to: string): Promise<number> {
  const key = `${from}-${to}`;
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.rate;
  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.rates?.[to]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid ${to} rate`);
  cache.set(key, { rate, expiry: Date.now() + CACHE_TTL_MS });
  return rate;
}
