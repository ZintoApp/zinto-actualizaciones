
import * as fs from 'node:fs';
import * as path from 'node:path';

function getApplicationRoot(): string {
  const fromEnv = process.env.BOTHIVE_APP_ROOT || process.env.APP_ROOT;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    return path.resolve(String(fromEnv));
  }
  return path.resolve(process.cwd());
}

function resolveTranslationsDirectory(appRoot: string): string {
  const explicit = process.env.BOTHIVE_TRANSLATIONS_DIR;
  if (explicit != null && String(explicit).trim() !== '') {
    return path.resolve(String(explicit));
  }
  const candidates = [
    path.join(appRoot, 'translations'),
    path.join(appRoot, 'dist', 'translations'),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      const files = fs.readdirSync(dir);
      if (files.some((f) => f.endsWith('.json'))) {
        return dir;
      }
    } catch {
      continue;
    }
  }
  return path.join(appRoot, 'translations');
}

interface TranslationCache {
  [languageCode: string]: Record<string, string>;
}

class ServerI18n {
  private cache: TranslationCache = {};

  constructor() {
  }

  private flattenJsonTranslations(
    obj: Record<string, any>,
    prefix: string = '',
    out: Record<string, string> = {}
  ): Record<string, string> {
    for (const [k, v] of Object.entries(obj || {})) {
      const nextKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        this.flattenJsonTranslations(v, nextKey, out);
      } else if (typeof v === 'string') {
        out[nextKey] = v;
      }
    }
    return out;
  }

  private parseLocaleFileContent(raw: string): Record<string, string> | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      if (Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const item of parsed) {
          if (
            item &&
            typeof item === 'object' &&
            typeof (item as any).key === 'string' &&
            typeof (item as any).value === 'string'
          ) {
            out[(item as any).key] = (item as any).value;
          }
        }
        return out;
      }
      if (typeof parsed !== 'object') return null;
      return this.flattenJsonTranslations(parsed as Record<string, any>);
    } catch {
      return null;
    }
  }

  private readLocaleFile(languageCode: string, translationsDir: string): Record<string, string> | null {
    const codes = [languageCode];
    const base = languageCode.split(/[-_]/)[0];
    if (base && base !== languageCode) {
      codes.push(base);
    }
    for (const code of codes) {
      try {
        const filePath = path.join(translationsDir, `${code}.json`);
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = this.parseLocaleFileContent(raw);
        if (parsed && Object.keys(parsed).length > 0) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private loadTranslationsFromFilesystem(languageCode: string): Record<string, string> | null {
    try {
      const appRoot = getApplicationRoot();
      const translationsDir = resolveTranslationsDirectory(appRoot);
      return this.readLocaleFile(languageCode, translationsDir);
    } catch {
      return null;
    }
  }

  /**
   * Load translations: English file as fallback base, locale file for the requested language,
   * then non-empty database values (namespace.key) on top.
   */
  private async loadTranslations(languageCode: string): Promise<Record<string, string>> {
    try {
      const appRoot = getApplicationRoot();
      const translationsDir = resolveTranslationsDirectory(appRoot);

      const enFs = this.readLocaleFile('en', translationsDir) ?? {};
      const langFs =
        languageCode === 'en'
          ? {}
          : (this.readLocaleFile(languageCode, translationsDir) ?? {});

      const merged: Record<string, string> = { ...enFs, ...langFs };

      try {
        const { storage } = await import('../storage');
        const rows = await storage.getTranslationsForLanguageAsArray(languageCode);
        for (const row of rows) {
          if (typeof row.value === 'string' && row.value.trim() !== '') {
            merged[row.key] = row.value;
          }
        }
      } catch (dbErr) {
        console.error('server-i18n: database overlay failed:', dbErr);
      }

      if (Object.keys(merged).length > 0) {
        return merged;
      }

      if (languageCode !== 'en') {
        return this.loadTranslations('en');
      }
      return {};
    } catch (error) {
      console.error(`Error loading translations for ${languageCode}:`, error);

      if (languageCode !== 'en') {
        return this.loadTranslations('en');
      }
      return {};
    }
  }

  /**
   * Get translations for a language (with caching)
   */
  private async getTranslations(languageCode: string): Promise<Record<string, string>> {
    if (!this.cache[languageCode]) {
      this.cache[languageCode] = await this.loadTranslations(languageCode);
    }
    return this.cache[languageCode];
  }

  /**
   * Translate a key with optional variables
   */
  async t(
    key: string,
    language: string = 'en',
    fallback?: string,
    variables?: Record<string, any>
  ): Promise<string> {
    const translations = await this.getTranslations(language);
    let translation = translations[key] || fallback || key;


    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        const placeholder = `{{${varKey}}}`;
        translation = translation.replace(new RegExp(placeholder, 'g'), String(varValue));
      });
    }

    return translation;
  }

  /**
   * Synchronous version of t() - uses cached translations
   * Note: Call ensureLanguageLoaded() first to populate cache
   */
  tSync(
    key: string,
    language: string = 'en',
    fallback?: string,
    variables?: Record<string, any>
  ): string {
    const translations = this.cache[language] || this.cache['en'] || {};
    let translation = translations[key] || fallback || key;


    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        const placeholder = `{{${varKey}}}`;
        translation = translation.replace(new RegExp(placeholder, 'g'), String(varValue));
      });
    }

    return translation;
  }

  /**
   * Ensure translations for a language are loaded (for sync usage)
   */
  async ensureLanguageLoaded(languageCode: string): Promise<void> {
    if (!this.cache[languageCode]) {
      this.cache[languageCode] = await this.loadTranslations(languageCode);
    }
  }

  /**
   * Clear cache (useful for development/testing)
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Drop cached catalog for one language (e.g. after admin translation edits).
   */
  invalidateLanguageCache(languageCode: string): void {
    delete this.cache[languageCode];
  }

  /**
   * Drop every cached language catalog. Use when namespace or translation-key metadata
   * changes, since composite keys (namespace.key) returned from storage can shift for
   * all languages at once.
   */
  invalidateAllCatalogCaches(): void {
    this.cache = {};
  }

  /**
   * Get language name from code
   */
  getLanguageName(languageCode: string): string {
    return SERVER_UI_LANGUAGE_NAMES[languageCode] || languageCode;
  }
}

/** Display names for selectable app languages (`getLanguageName`). Keep in sync with invoice amount-in-words tests. */
export const SERVER_UI_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  hi: 'Hindi',
  tr: 'Turkish',
  nl: 'Dutch',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  mt: 'Maltese',
  ga: 'Irish',
  cy: 'Welsh',
};

/** Short codes listed by `getLanguageName` / ERP language UI. */
export const SERVER_APP_LANGUAGE_CODES = Object.keys(SERVER_UI_LANGUAGE_NAMES);


const serverI18n = new ServerI18n();
export default serverI18n;
