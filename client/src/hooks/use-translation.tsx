import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface Translation {
  id: number;
  keyId: number;
  languageId: number;
  value: string;
  key?: string;
}

export interface TranslationKey {
  id: number;
  key: string;
  namespaceId: number;
  description?: string;
}

export interface Language {
  id: number;
  name: string;
  nativeName: string;
  code: string;
  /** When null/undefined, the language is treated as active (same contract as public frontend website routes). */
  isActive: boolean | null;
  isDefault: boolean | null;
  direction: string | null;
  flagIcon?: string | null;
}

export function isLanguageActive(language: Pick<Language, 'isActive'>): boolean {
  return language.isActive !== false;
}

export interface TranslationContextType {
  currentLanguage: Language | null;
  languages: Language[];
  translations: Record<string, string>;
  isLoading: boolean;
  t: (key: string, fallback?: string, variables?: Record<string, any>) => string;
  changeLanguage: (languageCode: string) => Promise<void>;
  refreshTranslations: () => Promise<void>;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const getStoredLanguage = (): string | null => {
    return localStorage.getItem('preferred-language');
  };

  const storeLanguage = (languageCode: string) => {
    localStorage.setItem('preferred-language', languageCode);
  };

  const fetchLanguages = async (): Promise<Language[]> => {
    try {
      const res = await apiRequest('GET', '/api/languages');
      if (!res.ok) {
        console.error('Failed to fetch languages, status:', res.status);
        throw new Error('Failed to fetch languages');
      }
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('Error fetching languages:', error);
      return [];
    }
  };

  const fetchFileTranslations = async (languageCode: string): Promise<Record<string, string>> => {
    try {
      // Use bundled JSON files from the /translations folder instead of HTTP fetch,
      // so this works in both dev and production without relying on static hosting config.
      // Support language variants: es-ES, es_MX, en-US, en-GB, etc.
      const baseCode = languageCode.split(/[-_]/)[0]?.toLowerCase() || languageCode.toLowerCase();
      let moduleData: any;

      if (baseCode === 'en') {
        moduleData = await import('../../../translations/en.json');
      } else if (baseCode === 'es') {
        moduleData = await import('../../../translations/es.json');
      } else {
        try {
          moduleData = await import(/* @vite-ignore */ `../../../translations/${baseCode}.json`);
        } catch {
          return {};
        }
      }

      const data = moduleData.default ?? moduleData;

      // Expected format: [{ key: string, value: string }, ...]
      if (Array.isArray(data)) {
        const map: Record<string, string> = {};
        for (const item of data) {
          if (item && typeof item.key === 'string' && typeof item.value === 'string') {
            map[item.key] = item.value;
          }
        }
        return map;
      }

      return {};
    } catch (error) {
      console.error('Error loading file-based translations:', error);
      return {};
    }
  };

  const mergeFileTranslationsForLanguage = async (languageCode: string): Promise<Record<string, string>> => {
    const baseCode = languageCode.split(/[-_]/)[0]?.toLowerCase() || languageCode.toLowerCase();
    const enTranslations = await fetchFileTranslations('en');
    const langSpecific = baseCode === 'en' ? {} : await fetchFileTranslations(languageCode);
    return { ...enTranslations, ...langSpecific };
  };

  const fetchTranslations = async (languageCode: string): Promise<Record<string, string>> => {
    try {
      // 1) English file fills gaps; locale file overrides (matches server-i18n ordering)
      const fileTranslations = await mergeFileTranslationsForLanguage(languageCode);

      // 2) Load overrides from the database API (if available)
      const res = await apiRequest('GET', `/api/translations/language/${languageCode}`);
      if (!res.ok) {
        console.error('Failed to fetch translations from API, using file-only translations, status:', res.status);
        return fileTranslations;
      }

      const data = await res.json();

      const apiTranslations: Record<string, string> = {};

      for (const namespaceName in data) {
        const namespaceTranslations = data[namespaceName];
        if (typeof namespaceTranslations !== 'object' || namespaceTranslations === null) continue;
        for (const key in namespaceTranslations) {
          const val = namespaceTranslations[key];
          // Only use API value if it's a non-empty string (avoid overwriting with empty)
          if (typeof val === 'string' && val.trim() !== '') {
            const fullKey = `${namespaceName}.${key}`;
            apiTranslations[fullKey] = val;
          }
        }
      }

      // Database values override file-based ones when the same key exists (and API value is non-empty)
      return { ...fileTranslations, ...apiTranslations };
    } catch (error) {
      console.error('Error fetching translations:', error);
      // Fall back to file-only translations if API call fails
      try {
        return await mergeFileTranslationsForLanguage(languageCode);
      } catch {
        return {};
      }
    }
  };

  const t = (key: string, fallback?: string, variables?: Record<string, any>): string => {
    let translation = translations[key] || fallback || key;

    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        const placeholder = `{{${varKey}}}`;
        translation = translation.replace(new RegExp(placeholder, 'g'), String(varValue));
      });
    }

    return translation;
  };

  const changeLanguageWithLanguages = async (languageCode: string, availableLanguages: Language[], persist = false): Promise<void> => {
    setIsLoading(true);
    try {
      const newTranslations = await fetchTranslations(languageCode);

      const language = availableLanguages.find(lang => lang.code === languageCode);

      if (language) {
        setCurrentLanguage(language);
        setTranslations(newTranslations);
        if (persist) {
          storeLanguage(languageCode);
        }



        const isOnAuthPage = window.location.pathname === '/auth' || 
                            window.location.pathname === '/login' || 
                            window.location.pathname === '/register';
        
        if (persist && !isOnAuthPage) {
          try {
            const testRes = await fetch('/api/user', {
              method: 'GET',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' }
            });

            if (testRes.ok) {
              await apiRequest('PUT', '/api/user/language', { languageCode });
            }
          } catch (err) {

          }
        }

        document.documentElement.lang = languageCode;
        document.documentElement.dir = language.direction || 'ltr';
      } else {
        console.error('Language not found in provided languages array');
      }
    } catch (error) {
      console.error('Error changing language:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const changeLanguage = async (languageCode: string): Promise<void> => {
    await changeLanguageWithLanguages(languageCode, languages, true);
  };

  const refreshTranslations = async (): Promise<void> => {
    if (currentLanguage) {
      const newTranslations = await fetchTranslations(currentLanguage.code);
      setTranslations(newTranslations);
    }
  };

  useEffect(() => {
    const initializeTranslations = async () => {
      setIsLoading(true);

      try {
        const availableLanguages = await fetchLanguages();
        const activeLanguages = availableLanguages.filter(isLanguageActive);
        setLanguages(activeLanguages);

        if (activeLanguages.length > 0) {
          const storedLanguageCode = getStoredLanguage();
          const storedLanguage = storedLanguageCode
            ? activeLanguages.find(lang => lang.code === storedLanguageCode)
            : undefined;
          const preferredLanguage =
            storedLanguage ||
            activeLanguages.find(lang => lang.isDefault === true) ||
            activeLanguages[0];

          if (preferredLanguage) {
            await changeLanguageWithLanguages(preferredLanguage.code, activeLanguages, false);
          }
        } else {
          
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error initializing translations:', error);
        setIsLoading(false);
      }
    };

    initializeTranslations();
  }, []);



  const value: TranslationContextType = {
    currentLanguage,
    languages,
    translations,
    isLoading,
    t,
    changeLanguage,
    refreshTranslations,
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation(): TranslationContextType {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
