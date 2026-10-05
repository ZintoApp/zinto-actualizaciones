import { useMemo } from 'react';
import { useBranding } from '@/contexts/branding-context';

export const DEFAULT_AUTH_BACKGROUND_URL = 'https://i.ibb.co/SW3nWBD/Default-Bg.jpg';

/**
 * A hook that returns style objects for branding colors
 * 
 * @returns An object with style objects for primary and secondary colors
 */
export function useBrandingStyles() {
  const { branding } = useBranding();
  
  return useMemo(() => {
    return {
      primaryStyle: {
        backgroundColor: branding.primaryColor,
        color: 'white',
      },
      secondaryStyle: {
        backgroundColor: branding.secondaryColor,
        color: 'white',
      },
      primaryTextStyle: {
        color: branding.primaryColor,
      },
      secondaryTextStyle: {
        color: branding.secondaryColor,
      },
      primaryBorderStyle: {
        borderColor: branding.primaryColor,
      },
      secondaryBorderStyle: {
        borderColor: branding.secondaryColor,
      },
    };
  }, [branding.primaryColor, branding.secondaryColor]);
}

/**
 * A hook that generates CSS styles for auth page backgrounds based on branding configuration
 * 
 * @param type - 'admin' or 'user' to determine which auth background to use
 * @returns CSS style object for the auth page background
 */
export function useAuthBackgroundStyles(type: 'admin' | 'user') {
  const { branding } = useBranding();
  
  return useMemo(() => {
    const imageUrl = (type === 'admin'
      ? branding.adminAuthBackgroundUrl
      : branding.userAuthBackgroundUrl) || DEFAULT_AUTH_BACKGROUND_URL;

    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }, [branding.adminAuthBackgroundUrl, branding.userAuthBackgroundUrl, type]);
}
