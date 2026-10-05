import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface SubdomainInfo {
  isSubdomainMode: boolean;
  subdomain: string | null;
  company: {
    id: number;
    name: string;
    slug: string;
    logo?: string;
    primaryColor?: string;
  } | null;
}

interface SubdomainError {
  type: 'not_found' | 'inactive' | 'invalid' | 'network';
  message: string;
  subdomain?: string;
}

interface SubdomainContextType {
  subdomainInfo: SubdomainInfo | null;
  isLoading: boolean;
  error: SubdomainError | null;
  refreshSubdomainInfo: () => Promise<void>;
}

const SubdomainContext = createContext<SubdomainContextType | undefined>(undefined);

export function SubdomainProvider({ children }: { children: React.ReactNode }) {
  const [subdomainInfo, setSubdomainInfo] = useState<SubdomainInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<SubdomainError | null>(null);

  const fetchSubdomainInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);


      const clientSubdomain = extractSubdomain();
      if (clientSubdomain && !/^[a-z0-9-]+$/i.test(clientSubdomain)) {
        setError({
          type: 'invalid',
          message: 'Invalid subdomain format',
          subdomain: clientSubdomain
        });
        setSubdomainInfo({
          isSubdomainMode: false,
          subdomain: null,
          company: null
        });
        setIsLoading(false);
        return;
      }

      const response = await apiRequest('GET', '/api/subdomain-info');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));


        if (response.status === 404 && errorData.error === 'COMPANY_NOT_FOUND') {
          setError({
            type: 'not_found',
            message: errorData.message || 'Company not found',
            subdomain: errorData.subdomain
          });
        } else if (response.status === 403 && errorData.error === 'COMPANY_INACTIVE') {
          setError({
            type: 'inactive',
            message: errorData.message || 'Company account is inactive',
            subdomain: errorData.subdomain
          });
        } else {
          setError({
            type: 'network',
            message: errorData.message || 'Failed to fetch subdomain information'
          });
        }


        setSubdomainInfo({
          isSubdomainMode: false,
          subdomain: null,
          company: null
        });
        return;
      }

      const data = await response.json();
      setSubdomainInfo(data);
    } catch (err) {
      console.error('Error fetching subdomain info:', err);
      setError({
        type: 'network',
        message: err instanceof Error ? err.message : 'Unknown error'
      });

      setSubdomainInfo({
        isSubdomainMode: false,
        subdomain: null,
        company: null
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSubdomainInfo = async () => {
    await fetchSubdomainInfo();
  };

  useEffect(() => {
    fetchSubdomainInfo();
  }, []);

  const value: SubdomainContextType = {
    subdomainInfo,
    isLoading,
    error,
    refreshSubdomainInfo
  };

  return (
    <SubdomainContext.Provider value={value}>
      {children}
    </SubdomainContext.Provider>
  );
}

export function useSubdomain() {
  const context = useContext(SubdomainContext);
  if (context === undefined) {
    throw new Error('useSubdomain must be used within a SubdomainProvider');
  }
  return context;
}


export function isSubdomainMode(): boolean {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  

  if (parts.length < 3) return false;
  

  const ignoredSubdomains = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'cdn', 'static'];
  const subdomain = parts[0].toLowerCase();
  
  return !ignoredSubdomains.includes(subdomain);
}

export function extractSubdomain(): string | null {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  
  if (parts.length < 3) return null;
  
  const subdomain = parts[0].toLowerCase();
  const ignoredSubdomains = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'cdn', 'static'];
  
  if (ignoredSubdomains.includes(subdomain)) return null;
  

  if (!/^[a-z0-9-]+$/i.test(subdomain)) return null;
  
  return subdomain;
}

export function getMainDomain(): string {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  
  if (parts.length >= 3) {
    return parts.slice(1).join('.');
  }
  
  return hostname;
}

export function buildSubdomainUrl(subdomain: string, path: string = ''): string {
  const protocol = window.location.protocol;
  const mainDomain = getMainDomain();
  const port = window.location.port ? `:${window.location.port}` : '';
  
  return `${protocol}//${subdomain}.${mainDomain}${port}${path}`;
}

export function buildMainDomainUrl(path: string = ''): string {
  const protocol = window.location.protocol;
  const mainDomain = getMainDomain();
  const port = window.location.port ? `:${window.location.port}` : '';
  
  return `${protocol}//${mainDomain}${port}${path}`;
}
