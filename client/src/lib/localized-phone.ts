import {
  getCountryCallingCode,
  getCountries,
  isSupportedCountry,
  parsePhoneNumber,
  type Country,
} from "react-phone-number-input/max";

export const FALLBACK_PHONE_COUNTRY: Country = "CO";

export function resolveCountryFromLocales(
  locales: readonly string[] | null | undefined,
  fallback: Country = FALLBACK_PHONE_COUNTRY,
): Country {
  for (const locale of locales ?? []) {
    if (typeof locale !== "string" || !locale.trim()) continue;

    const normalized = locale.trim().replace(/_/g, "-");
    const parts = normalized.split("-");
    const region = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part));
    if (!region) continue;

    const country = region.toUpperCase();
    if (isSupportedCountry(country)) {
      // Many browsers ship with en-US even when the user is elsewhere.
      // Treat it as a generic default and prefer the product fallback.
      return country === "US" ? fallback : (country as Country);
    }
  }

  return fallback;
}

export function getBrowserPhoneCountry(): Country {
  if (typeof navigator === "undefined") return FALLBACK_PHONE_COUNTRY;

  const locales = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter((locale): locale is string => typeof locale === "string");

  return resolveCountryFromLocales(locales);
}

export function getPhoneCallingPrefix(country: Country): string {
  return `+${getCountryCallingCode(country)}`;
}

export function getCountryForPhoneValue(value: string | null | undefined, fallback: Country): Country {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("+")) return fallback;

  try {
    return parsePhoneNumber(trimmed)?.country ?? fallback;
  } catch {
    return fallback;
  }
}

export function normalizeExistingPhoneValue(
  value: string | null | undefined,
  defaultCountry: Country = FALLBACK_PHONE_COUNTRY,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  try {
    const parsed = parsePhoneNumber(trimmed, trimmed.startsWith("+") ? undefined : defaultCountry);
    if (parsed && parsed.isPossible()) return parsed.number;
  } catch {
    // Preserve legacy values that cannot be parsed so users can correct them manually.
  }

  return trimmed;
}

export function isCallingCodeOnly(value: string | null | undefined, country: Country): boolean {
  const digits = value?.replace(/\D/g, "") ?? "";
  return !digits || digits === getCountryCallingCode(country);
}

const PHONE_CALLING_CODES = new Set<string>(
  getCountries().map((country) => String(getCountryCallingCode(country))),
);

export function isBareCallingCode(value: string | null | undefined): boolean {
  const digits = value?.replace(/\D/g, "") ?? "";
  return !digits || PHONE_CALLING_CODES.has(digits);
}
