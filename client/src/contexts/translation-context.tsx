import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';

type TranslationValue = string;
type NamespaceTranslations = Record<string, TranslationValue>;
type Translations = Record<string, NamespaceTranslations>;

interface Language {
  id: number;
  code: string;
  name: string;
  nativeName: string;
  flagIcon?: string | null;
  isActive: boolean | null;
  isDefault: boolean | null;
  direction: string | null;
}

interface TranslationContextType {
  currentLanguage: Language | null;
  languages: Language[];
  translations: Translations;
  isLoading: boolean;
  error: Error | null;
  setLanguage: (languageCode: string) => Promise<void>;
  t: (key: string, namespace?: string, params?: Record<string, string | number>) => string;
}

const TranslationContext = createContext<TranslationContextType>({
  currentLanguage: null,
  languages: [],
  translations: {},
  isLoading: true,
  error: null,
  setLanguage: async () => {},
  t: () => '',
});

const DEFAULT_LANGUAGE: Language = {
  id: 1,
  code: 'en',
  name: 'English',
  nativeName: 'English',
  flagIcon: '🇺🇸',
  isActive: true,
  isDefault: true,
  direction: 'ltr',
};

const DEFAULT_NAMESPACE = 'common';

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<Translations>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await apiRequest('GET', '/api/languages');
        if (!response.ok) {
          throw new Error('Failed to fetch languages');
        }
        const data = await response.json();
        setLanguages(data);
        
        if (!currentLanguage) {
          const defaultLang = data.find((lang: Language) => lang.isDefault) || data[0] || DEFAULT_LANGUAGE;
          setCurrentLanguage(defaultLang);
        }
      } catch (err) {
        console.error('Error fetching languages:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        if (!currentLanguage) {
          setCurrentLanguage(DEFAULT_LANGUAGE);
        }
      }
    };

    fetchLanguages();
  }, []);

  useEffect(() => {
    const fetchTranslations = async () => {
      if (!currentLanguage) return;
      
      setIsLoading(true);
      try {
        const response = await apiRequest('GET', `/api/translations/language/${currentLanguage.code}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch translations for ${currentLanguage.code}`);
        }
        const data = await response.json();
        setTranslations(data);
      } catch (err) {
        console.error(`Error fetching translations for ${currentLanguage.code}:`, err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTranslations();
  }, [currentLanguage]);

  useEffect(() => {
    if (user && user.languagePreference && languages.length > 0) {
      const userLanguage = languages.find(lang => lang.code === user.languagePreference);
      if (userLanguage) {
        setCurrentLanguage(userLanguage);
      }
    }
  }, [user, languages]);

  const setLanguage = async (languageCode: string) => {
    const language = languages.find(lang => lang.code === languageCode);
    if (!language) {
      throw new Error(`Language ${languageCode} not found`);
    }
    
    setCurrentLanguage(language);
    
    if (user) {
      try {
        await apiRequest('PUT', '/api/user/language', { languageCode });
      } catch (err) {
        console.error('Error updating user language preference:', err);
      }
    }
  };

  const t = (key: string, namespace = DEFAULT_NAMESPACE, params?: Record<string, string | number>): string => {
    if (!translations[namespace]) {
      
      return key;
    }
    
    const translation = translations[namespace][key];
    if (!translation) {
      
      return key;
    }
    
    if (params) {
      return Object.entries(params).reduce((result, [param, value]) => {
        return result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
      }, translation);
    }
    
    return translation;
  };

  return (
    <TranslationContext.Provider
      value={{
        currentLanguage,
        languages,
        translations,
        isLoading,
        error,
        setLanguage,
        t,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
