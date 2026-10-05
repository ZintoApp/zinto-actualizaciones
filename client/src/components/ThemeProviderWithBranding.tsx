import { useState, useEffect, ReactNode } from "react";
import { ThemeProvider } from "next-themes";

interface ThemeProviderWithBrandingProps {
  children: ReactNode;
}

/**
 * ThemeProvider wrapper that fetches branding settings to determine the default theme
 * before rendering. This prevents theme flashing on initial load.
 */
export function ThemeProviderWithBranding({ children }: ThemeProviderWithBrandingProps) {
  const [defaultTheme, setDefaultTheme] = useState<'dark' | 'light'>('dark');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBrandingTheme = async () => {
      try {
        // Try public endpoint first (no auth required)
        let res = await fetch("/public/branding", {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });

        // Fallback to authenticated endpoint if public fails
        if (!res.ok) {
          try {
            const { apiRequest } = await import("@/lib/queryClient");
            res = await apiRequest("GET", "/api/branding");
          } catch (error) {
            // If both fail, use default
            setIsLoading(false);
            return;
          }
        }

        if (res.ok) {
          const settings = await res.json();
          const brandingSetting = settings.find((s: any) => s.key === 'branding');
          
          if (brandingSetting) {
            let brandingValue = brandingSetting.value;
            if (typeof brandingValue === 'string') {
              try {
                brandingValue = JSON.parse(brandingValue);
              } catch (e) {
                // Invalid JSON, use default
              }
            }

            // Extract defaultTheme from branding settings
            if (brandingValue?.defaultTheme === 'dark' || brandingValue?.defaultTheme === 'light') {
              setDefaultTheme(brandingValue.defaultTheme);
              // Apply theme class immediately to prevent flash
              if (brandingValue.defaultTheme === 'dark') {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              } else {
                document.documentElement.classList.add('light');
                document.documentElement.classList.remove('dark');
              }
            }
          }
        }
      } catch (error) {
        // Error fetching, use default 'dark' theme
        console.error('Error fetching branding theme:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrandingTheme();
  }, []);

  // Apply default dark theme class while loading to prevent flash
  useEffect(() => {
    if (isLoading) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [isLoading]);

  // Show nothing while loading to prevent flash
  // The theme class is already applied to document element above
  if (isLoading) {
    return null;
  }

  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme={defaultTheme} 
      storageKey="theme" 
      enableSystem={false}
    >
      {children}
    </ThemeProvider>
  );
}
