import React, { useState } from 'react';
import { Check, ChevronDown, Globe, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProfileLanguageSelectorProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'default' | 'ghost' | 'outline';
}

export function ProfileLanguageSelector({
  className,
  showLabel = true,
  variant = 'ghost'
}: ProfileLanguageSelectorProps) {
  const { currentLanguage, languages, changeLanguage, isLoading, t } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);



  const activeLanguages = languages.filter(lang => lang.isActive === true);

  const handleLanguageChange = async (languageCode: string) => {
    if (languageCode === currentLanguage?.code || isChanging) return;
    
    setIsChanging(true);
    try {
      await changeLanguage(languageCode);
    } catch (error) {
      console.error('Error changing language:', error);
    } finally {
      setIsChanging(false);
    }
  };


  if (isLoading) {
    return (
      <Button variant={variant} size="sm" disabled className={cn("gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {showLabel && <span className="text-sm">Loading...</span>}
      </Button>
    );
  }

  if (!currentLanguage || activeLanguages.length === 0) {
    return (
      <Button variant={variant} size="sm" disabled className={cn("gap-2", className)}>
        <Globe className="h-4 w-4" />
        {showLabel && <span className="text-sm">No languages</span>}
      </Button>
    );
  }


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant} 
          size="sm" 
          className={cn("gap-2 justify-start", className)}
          disabled={isChanging}
        >
          <Globe className="h-4 w-4" />
          {showLabel && (
            <>
              <span className="text-sm">{currentLanguage.nativeName}</span>
              {currentLanguage.flagIcon && (
                <span className="text-sm">{currentLanguage.flagIcon}</span>
              )}
            </>
          )}
          {isChanging ? (
            <Loader2 className="h-3 w-3 animate-spin ml-auto" />
          ) : (
            <ChevronDown className="h-3 w-3 ml-auto" />
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t('common.language_selector.title', 'Select Language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {activeLanguages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className="flex items-center justify-between cursor-pointer"
            disabled={isChanging}
          >
            <div className="flex items-center gap-3">
              {language.flagIcon && (
                <span className="text-lg">{language.flagIcon}</span>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">{language.nativeName}</span>
                <span className="text-xs text-muted-foreground">{language.name}</span>
              </div>
            </div>
            
            {currentLanguage.code === language.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        
        {activeLanguages.length === 0 && (
          <DropdownMenuItem disabled>
            <span className="text-sm text-muted-foreground">
              {t('common.language_selector.no_languages', 'No languages available')}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CompactLanguageSelector({ className }: { className?: string }) {
  return (
    <ProfileLanguageSelector 
      className={className}
      showLabel={false}
      variant="ghost"
    />
  );
}

export function FullLanguageSelector({ className }: { className?: string }) {
  return (
    <ProfileLanguageSelector 
      className={className}
      showLabel={true}
      variant="ghost"
    />
  );
}
