import React from 'react';
import { useTranslation } from '@/contexts/translation-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Check, Globe } from 'lucide-react';

interface LanguageSelectorProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showFlag?: boolean;
  showName?: boolean;
  align?: 'start' | 'center' | 'end';
}

export function LanguageSelector({
  variant = 'outline',
  size = 'default',
  showFlag = true,
  showName = true,
  align = 'end',
}: LanguageSelectorProps) {
  const { currentLanguage, languages, setLanguage } = useTranslation();

  if (!currentLanguage || languages.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="btn-brand-primary" variant={variant} size={size}>
          {showFlag && currentLanguage.flagIcon && (
            <span className="mr-2">{currentLanguage.flagIcon}</span>
          )}
          {!showFlag && !showName && <Globe className="h-4 w-4" />}
          {showName && (
            <span>{currentLanguage.nativeName}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {languages
          .filter(lang => lang.isActive === true)
          .map(language => (
            <DropdownMenuItem
              key={language.code}
              onClick={() => setLanguage(language.code)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center">
                {language.flagIcon && (
                  <span className="mr-2">{language.flagIcon}</span>
                )}
                <span>{language.nativeName}</span>
              </div>
              {currentLanguage.code === language.code && (
                <Check className="h-4 w-4 ml-2" />
              )}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
