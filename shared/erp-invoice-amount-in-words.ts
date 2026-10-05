import { ToWords, LOCALES } from 'to-words';
import type { CurrencyOptions } from 'to-words/types';

/** Bundled `to-words` locale codes (runtime registry). */
export const TOWORDS_SUPPORTED_LOCALES = new Set(Object.keys(LOCALES));

/**
 * App short language codes → preferred to-words BCP-47 locale.
 * Each target is normalized via {@link normalizeToWordsLocale} so unknown or dropped locales still yield words (never silent numeric fallback).
 */
export const LANGUAGE_TO_TOWORDS_LOCALE: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  ar: 'ar-AE',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  it: 'it-IT',
  ru: 'ru-RU',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  hi: 'hi-IN',
  tr: 'tr-TR',
  nl: 'nl-NL',
  pl: 'pl-PL',
  id: 'id-ID',
  vi: 'vi-VN',
  sv: 'sv-SE',
  da: 'da-DK',
  no: 'nb-NO',
  fi: 'fi-FI',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  ro: 'ro-RO',
  bg: 'bg-BG',
  hr: 'hr-HR',
  sk: 'sk-SK',
  sl: 'sl-SI',
  /** Estonian in `to-words` is `ee-EE`, not `et-EE`. */
  et: 'ee-EE',
  lv: 'lv-LV',
  lt: 'lt-LT',
  /** Maltese locale not bundled — use English words. */
  mt: 'en-GB',
  /** Irish / Welsh locales not bundled — closest English-region locales with words. */
  ga: 'en-IE',
  cy: 'en-GB',
  uk: 'uk-UA',
  he: 'he-IL',
  th: 'th-TH',
  ms: 'ms-MY',
};

/** Map a candidate locale string to one present in `LOCALES` (never throws). */
export function normalizeToWordsLocale(localeCode: string): string {
  const trimmed = localeCode?.trim();
  if (!trimmed) return 'en-US';
  if (trimmed in LOCALES) return trimmed;
  const primary = trimmed.split(/[-_]/)[0]?.toLowerCase() ?? '';
  const preferred =
    primary === 'et'
      ? 'ee-EE'
      : primary === 'mt'
        ? 'en-GB'
        : primary === 'ga'
          ? 'en-IE'
          : primary === 'cy'
            ? 'en-GB'
            : trimmed;
  if (preferred in LOCALES) return preferred;
  const prefixMatch = Object.keys(LOCALES).find((k) => k.toLowerCase().startsWith(`${primary}-`));
  if (prefixMatch) return prefixMatch;
  return 'en-US';
}

const ZERO_DECIMAL_CODES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

function defaultFractionalUnit(): CurrencyOptions['fractionalUnit'] {
  return {
    name: 'Cent',
    plural: 'Cents',
    singular: 'Cent',
    symbol: '¢',
  };
}

function currencyEntry(
  name: string,
  plural: string,
  symbol: string,
  fractional: CurrencyOptions['fractionalUnit']
): CurrencyOptions {
  return {
    name,
    plural,
    symbol,
    singular: name,
    fractionalUnit: fractional,
  };
}

/** ISO 4217 → default spoken unit names; merge with company `currencies` row when present. */
export const CURRENCY_FALLBACKS: Record<string, CurrencyOptions> = {
  USD: currencyEntry('Dollar', 'Dollars', '$', {
    name: 'Cent',
    plural: 'Cents',
    singular: 'Cent',
    symbol: '¢',
  }),
  EUR: currencyEntry('Euro', 'Euros', '€', {
    name: 'Cent',
    plural: 'Cents',
    singular: 'Cent',
    symbol: 'c',
  }),
  GBP: currencyEntry('Pound', 'Pounds', '£', {
    name: 'Penny',
    plural: 'Pence',
    singular: 'Penny',
    symbol: 'p',
  }),
  INR: currencyEntry('Rupee', 'Rupees', '₹', {
    name: 'Paisa',
    plural: 'Paise',
    singular: 'Paisa',
    symbol: 'p',
  }),
  PKR: currencyEntry('Rupee', 'Rupees', '₨', {
    name: 'Paisa',
    plural: 'Paise',
    singular: 'Paisa',
    symbol: 'p',
  }),
  SAR: currencyEntry('Riyal', 'Riyals', '﷼', {
    name: 'Halala',
    plural: 'Halalas',
    singular: 'Halala',
    symbol: '',
  }),
  AED: currencyEntry('Dirham', 'Dirhams', 'د.إ', {
    name: 'Fils',
    plural: 'Fils',
    singular: 'Fils',
    symbol: '',
  }),
  MXN: currencyEntry('Peso', 'Pesos', '$', {
    name: 'Centavo',
    plural: 'Centavos',
    singular: 'Centavo',
    symbol: '¢',
  }),
  BRL: currencyEntry('Real', 'Reais', 'R$', {
    name: 'Centavo',
    plural: 'Centavos',
    singular: 'Centavo',
    symbol: '¢',
  }),
  CAD: currencyEntry('Dollar', 'Dollars', '$', {
    name: 'Cent',
    plural: 'Cents',
    singular: 'Cent',
    symbol: '¢',
  }),
  AUD: currencyEntry('Dollar', 'Dollars', '$', {
    name: 'Cent',
    plural: 'Cents',
    singular: 'Cent',
    symbol: '¢',
  }),
  JPY: currencyEntry('Yen', 'Yen', '¥', {
    name: 'Sen',
    plural: 'Sen',
    singular: 'Sen',
    symbol: '',
  }),
  CNY: currencyEntry('Yuan', 'Yuan', '¥', {
    name: 'Jiao',
    plural: 'Jiao',
    singular: 'Jiao',
    symbol: '角',
  }),
  KRW: currencyEntry('Won', 'Won', '₩', {
    name: 'Jeon',
    plural: 'Jeon',
    singular: 'Jeon',
    symbol: '',
  }),
  RUB: currencyEntry('Ruble', 'Rubles', '₽', {
    name: 'Kopek',
    plural: 'Kopeks',
    singular: 'Kopek',
    symbol: '',
  }),
  TRY: currencyEntry('Lira', 'Liras', '₺', {
    name: 'Kuruş',
    plural: 'Kuruş',
    singular: 'Kuruş',
    symbol: '',
  }),
  NGN: currencyEntry('Naira', 'Naira', '₦', {
    name: 'Kobo',
    plural: 'Kobo',
    singular: 'Kobo',
    symbol: '',
  }),
  ZAR: currencyEntry('Rand', 'Rand', 'R', {
    name: 'Cent',
    plural: 'Cents',
    singular: 'Cent',
    symbol: 'c',
  }),
  ILS: currencyEntry('Shekel', 'Shekels', '₪', {
    name: 'Agora',
    plural: 'Agorot',
    singular: 'Agora',
    symbol: '',
  }),
  EGP: currencyEntry('Pound', 'Pounds', 'ج.م', {
    name: 'Piastre',
    plural: 'Piastres',
    singular: 'Piastre',
    symbol: '',
  }),
  COP: currencyEntry('Peso', 'Pesos', '$', {
    name: 'Centavo',
    plural: 'Centavos',
    singular: 'Centavo',
    symbol: '',
  }),
  ARS: currencyEntry('Peso', 'Pesos', '$', {
    name: 'Centavo',
    plural: 'Centavos',
    singular: 'Centavo',
    symbol: '',
  }),
  CLP: currencyEntry('Peso', 'Pesos', '$', {
    name: 'Centavo',
    plural: 'Centavos',
    singular: 'Centavo',
    symbol: '',
  }),
  PEN: currencyEntry('Sol', 'Soles', 'S/', {
    name: 'Céntimo',
    plural: 'Céntimos',
    singular: 'Céntimo',
    symbol: '',
  }),
};

function resolveLocaleCode(language: string): string {
  const trimmed = language?.trim();
  if (!trimmed) return 'en-US';
  const lower = trimmed.toLowerCase();
  const exact = LANGUAGE_TO_TOWORDS_LOCALE[lower];
  if (exact) return normalizeToWordsLocale(exact);
  const base = trimmed.split(/[-_]/)[0]?.toLowerCase() ?? 'en';
  const mapped = LANGUAGE_TO_TOWORDS_LOCALE[base] ?? 'en-US';
  return normalizeToWordsLocale(mapped);
}

function implicitDecimalPlaces(code: string): number {
  return ZERO_DECIMAL_CODES.has(code) ? 0 : 2;
}

/** Aligns with `to-words` ar-SA locale currency (SAR) for natural Arabic unit words. */
const AR_SAR_CURRENCY_OVERLAY: CurrencyOptions = {
  name: 'ريال',
  plural: 'ريال',
  singular: 'ريال',
  symbol: 'ر.س',
  numberSpecificForms: {
    1: 'ريال واحد',
    2: 'ريالان',
    3: 'ثلاثة ريالات',
    4: 'أربعة ريالات',
    5: 'خمسة ريالات',
    6: 'ستة ريالات',
    7: 'سبعة ريالات',
    8: 'ثمانية ريالات',
    9: 'تسعة ريالات',
    10: 'عشرة ريالات',
  },
  fractionalUnit: {
    name: 'هللة',
    plural: 'هللة',
    singular: 'هللة',
    symbol: '',
    numberSpecificForms: {
      1: 'هللة واحدة',
      2: 'هللتان',
      3: 'ثلاث هللات',
      4: 'أربع هللات',
      5: 'خمس هللات',
      6: 'ست هللات',
      7: 'سبع هللات',
      8: 'ثماني هللات',
      9: 'تسع هللات',
      10: 'عشر هللات',
    },
  },
};

const ES_USD_CURRENCY_OVERLAY: CurrencyOptions = {
  name: 'Dólar',
  plural: 'Dólares',
  singular: 'Dólar',
  symbol: '$',
  fractionalUnit: {
    name: 'Centavo',
    plural: 'Centavos',
    singular: 'Centavo',
    symbol: '¢',
  },
};

/** Matches `to-words` ja-JP currency block for integer yen amounts. */
const JA_JPY_CURRENCY_OVERLAY: CurrencyOptions = {
  name: '円',
  plural: '円',
  singular: '円',
  symbol: '¥',
  fractionalUnit: {
    name: '銭',
    plural: '銭',
    singular: '銭',
    symbol: '',
  },
};

function mergeCurrencyOptions(params: {
  code: string;
  localeCode: string;
  currencyName?: string | null;
  currencySymbol?: string | null;
  currencyDecimalPlaces?: number | null;
}): { options: CurrencyOptions; decimalPlaces: number } {
  const code = params.code.toUpperCase();
  const base = CURRENCY_FALLBACKS[code];
  const dpRaw = params.currencyDecimalPlaces;
  const decimalPlaces =
    dpRaw != null && Number.isFinite(Number(dpRaw))
      ? Math.max(0, Math.min(8, Math.trunc(Number(dpRaw))))
      : implicitDecimalPlaces(code);

  const isEnLocale = params.localeCode.startsWith('en');
  const nameFromDb = params.currencyName?.trim();
  const isKnownIso = Boolean(base);
  /** DB `name` may localize branding in English; for known ISO codes and non-English locales it must not replace locale-aware / overlay unit names. */
  const allowDbCurrencyName = isEnLocale || !isKnownIso;

  let options: CurrencyOptions;

  if (params.localeCode.startsWith('ar') && code === 'SAR') {
    options = {
      ...AR_SAR_CURRENCY_OVERLAY,
      symbol: params.currencySymbol?.trim() || AR_SAR_CURRENCY_OVERLAY.symbol,
    };
  } else if (params.localeCode.startsWith('es') && code === 'USD') {
    options = {
      ...ES_USD_CURRENCY_OVERLAY,
      symbol: params.currencySymbol?.trim() || ES_USD_CURRENCY_OVERLAY.symbol,
    };
  } else if (params.localeCode.startsWith('ja') && code === 'JPY') {
    options = {
      ...JA_JPY_CURRENCY_OVERLAY,
      symbol: params.currencySymbol?.trim() || JA_JPY_CURRENCY_OVERLAY.symbol,
    };
  } else {
    const symbol = params.currencySymbol?.trim() || base?.symbol || code;
    const fractionalUnit = base?.fractionalUnit ?? defaultFractionalUnit();

    let name: string;
    let plural: string;
    let singular: string;

    if (allowDbCurrencyName && nameFromDb) {
      name = nameFromDb;
      singular = base?.singular ?? name;
      plural = isEnLocale ? (name.endsWith('s') ? name : `${name}s`) : base?.plural ?? name;
    } else {
      name = base?.name ?? code;
      plural = base?.plural ?? name;
      singular = base?.singular ?? name;
    }

    options = {
      name,
      plural,
      symbol,
      singular,
      numberSpecificForms: base?.numberSpecificForms,
      fractionalUnit,
    };
  }

  if (params.currencySymbol?.trim()) {
    options = { ...options, symbol: params.currencySymbol.trim() };
  }

  return { options, decimalPlaces };
}

const toWordsMemo = new Map<string, ToWords>();

function getMemoizedToWords(localeCode: string, currencyCode: string, currencyOptions: CurrencyOptions): ToWords {
  const key = `${localeCode}\0${currencyCode}\0${JSON.stringify(currencyOptions)}`;
  let inst = toWordsMemo.get(key);
  if (!inst) {
    inst = new ToWords({
      localeCode,
      converterOptions: {
        currency: true,
        ignoreZeroCurrency: false,
        doNotAddOnly: false,
        currencyOptions,
      },
    });
    toWordsMemo.set(key, inst);
  }
  return inst;
}

export type FormatAmountInWordsParams = {
  amount: number;
  currencyCode: string;
  language: string;
  currencyName?: string | null;
  currencySymbol?: string | null;
  currencyDecimalPlaces?: number | null;
  /** When conversion fails completely; default `amount.toFixed(decimals) + code`. */
  formatNumericFallback?: (args: { amount: number; currencyCode: string; decimalPlaces: number }) => string;
};

export function formatAmountInWords({
  amount,
  currencyCode,
  language,
  currencyName,
  currencySymbol,
  currencyDecimalPlaces,
  formatNumericFallback,
}: FormatAmountInWordsParams): string {
  const code = (currencyCode || 'USD').toUpperCase();
  const localeCode = resolveLocaleCode(language);
  const { options: currencyOptions, decimalPlaces } = mergeCurrencyOptions({
    code,
    localeCode,
    currencyName,
    currencySymbol,
    currencyDecimalPlaces,
  });

  const tw = getMemoizedToWords(localeCode, code, currencyOptions);
  const ignoreDecimal = decimalPlaces === 0;

  const lastDitch = (): string => {
    const fixed = amount.toFixed(decimalPlaces);
    if (formatNumericFallback) {
      return formatNumericFallback({ amount, currencyCode: code, decimalPlaces });
    }
    return `${fixed} ${code}`;
  };

  try {
    const primary = tw.convert(amount, {
      currency: true,
      ignoreZeroCurrency: false,
      doNotAddOnly: false,
      ignoreDecimal,
      currencyOptions,
    });
    if (primary?.trim()) return primary;
  } catch {
    /* try fallback chain */
  }

  try {
    const plain = tw.convert(Math.trunc(amount), {
      currency: false,
      ignoreDecimal: true,
      currencyOptions,
    });
    if (plain?.trim()) return `${plain} ${currencyName?.trim() || code}`;
  } catch {
    /* last ditch */
  }

  return lastDitch();
}
