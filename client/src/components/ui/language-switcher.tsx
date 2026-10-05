import { useState } from 'react';
import { useTranslation, isLanguageActive } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function LanguageSwitcher({ variant = 'default', className }: LanguageSwitcherProps) {
  const { currentLanguage, languages, changeLanguage, isLoading, t } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);

  const handleLanguageChange = async (languageCode: string) => {
    if (currentLanguage?.code === languageCode || isChanging) return;

    setIsChanging(true);
    try {
      await changeLanguage(languageCode);
    } catch (error) {
      console.error('Error changing language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  if (isLoading || !currentLanguage) {
    return null;
  }

  const activeLanguages = languages.filter(isLanguageActive);



  if (activeLanguages.length === 0) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", className)}
            disabled={isChanging}
          >
            <Globe className="h-4 w-4" />
            <span className="sr-only">{t('language_switcher.select_language', 'Select language')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {activeLanguages.map((language) => (
            <DropdownMenuItem
              key={language.id}
              onClick={() => handleLanguageChange(language.code)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center">
                {language.flagIcon && (
                  <span className="mr-2 text-sm">{language.flagIcon}</span>
                )}
                <span>{language.name}</span>
              </div>
              {currentLanguage.code === language.code && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="brand"
          className={cn("flex items-center gap-2", className)}
          disabled={isChanging}
        >
          <Globe className="h-4 w-4" />
          <div className="flex items-center gap-1">
            {currentLanguage.flagIcon && (
              <span className="text-sm">{currentLanguage.flagIcon}</span>
            )}
            <span className="hidden sm:inline">{currentLanguage.name}</span>
            <span className="sm:hidden">{currentLanguage.code.toUpperCase()}</span>
          </div>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {activeLanguages.map((language) => (
          <DropdownMenuItem
            key={language.id}
            onClick={() => handleLanguageChange(language.code)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center">
              {language.flagIcon && (
                <span className="mr-2 text-sm">{language.flagIcon}</span>
              )}
              <span>{language.name}</span>
            </div>
            {currentLanguage.code === language.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
