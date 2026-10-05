import React from 'react';
import { useSubdomain } from '@/contexts/subdomain-context';
import SubdomainErrorPage from '@/pages/subdomain-error';

interface SubdomainErrorHandlerProps {
  children: React.ReactNode;
}

export function SubdomainErrorHandler({ children }: SubdomainErrorHandlerProps) {
  const { subdomainInfo, isLoading, error } = useSubdomain();


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }


  if (error) {
    return (
      <SubdomainErrorPage
        errorType={error.type}
        subdomain={error.subdomain}
        message={error.message}
      />
    );
  }


  if (subdomainInfo?.isSubdomainMode && subdomainInfo?.subdomain && !subdomainInfo?.company) {
    return (
      <SubdomainErrorPage
        errorType="not_found"
        subdomain={subdomainInfo.subdomain}
      />
    );
  }


  return <>{children}</>;
}
