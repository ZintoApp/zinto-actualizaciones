import React, { useState } from 'react';
import { ExternalLink, AlertCircle, CheckCircle2, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useZohoCalendarAuth } from '@/hooks/useZohoCalendarAuth';

interface ZohoCalendarOAuthStatusProps {
  onAuthSuccess?: () => void;
  onDisconnect?: () => void;
  className?: string;
  compact?: boolean;
}

export function ZohoCalendarOAuthStatus({ onAuthSuccess, onDisconnect, className, compact }: ZohoCalendarOAuthStatusProps) {
  const {
    isConnected,
    isLoadingStatus,
    isAuthenticating,
    authenticate,
    disconnect
  } = useZohoCalendarAuth();

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnectClick = async () => {
    const success = await authenticate();
    if (success) {
      onAuthSuccess?.();
    }
  };

  const handleDisconnectClick = async () => {

    if (!confirm('Are you sure you want to disconnect your Zoho Calendar account? You will need to reconnect to use Zoho Calendar features.')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const success = await disconnect();
      if (success) {
        onDisconnect?.();
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoadingStatus) {
    if (compact) {
      return (
        <div className={className}>
          <Alert className="py-2 px-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              <span>Checking connection...</span>
            </div>
          </Alert>
        </div>
      );
    }
    return (
      <div className={className}>
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Checking Connection</AlertTitle>
          <AlertDescription>
            Verifying your Zoho Calendar connection status...
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isConnected) {
    if (compact) {
      return (
        <div className={className}>
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 py-2 px-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />
              <span className="text-sm text-green-600 dark:text-green-400">Connected</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  onClick={handleConnectClick}
                  disabled={isAuthenticating || isDisconnecting}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
                  title="Connect a different Zoho account"
                >
                  {isAuthenticating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  <span className="ml-1">{isAuthenticating ? 'Switching...' : 'Switch'}</span>
                </Button>
                <Button
                  onClick={handleDisconnectClick}
                  disabled={isDisconnecting || isAuthenticating}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                  title="Disconnect Zoho Calendar"
                >
                  {isDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                  <span className="ml-1">{isDisconnecting ? '...' : 'Disconnect'}</span>
                </Button>
              </div>
            </div>
          </Alert>
        </div>
      );
    }
    return (
      <div className={className}>
        <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
          <AlertTitle className="text-green-700 dark:text-green-200">Connected</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-400 space-y-3">
            <p>Your Zoho Calendar is connected and ready to use.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleConnectClick}
                disabled={isAuthenticating || isDisconnecting}
                variant="outline"
                size="sm"
                className="border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700"
                title="Connect a different Zoho account"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Switching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Switch Account
                  </>
                )}
              </Button>
              <Button
                onClick={handleDisconnectClick}
                disabled={isDisconnecting || isAuthenticating}
                variant="outline"
                size="sm"
                className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700"
                title="Disconnect Zoho Calendar integration"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-3 w-3" />
                    Disconnect
                  </>
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={className}>
        <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 py-2 px-3">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-200">Authentication required.</span>
            <span className="text-sm text-amber-600 dark:text-amber-300">Connect your Zoho Calendar to use this.</span>
            <Button
              onClick={handleConnectClick}
              disabled={isAuthenticating}
              className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs ml-auto"
              size="sm"
            >
              {isAuthenticating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Connect Zoho Calendar
                </>
              )}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className={className}>
      <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
        <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
        <AlertTitle className="text-amber-700 dark:text-amber-200">Authentication Required</AlertTitle>
        <AlertDescription className="text-amber-600 dark:text-amber-300 space-y-3">
          <p>Connect your Zoho Calendar account to use this.</p>
          <Button
            onClick={handleConnectClick}
            disabled={isAuthenticating}
            className="bg-blue-500 hover:bg-blue-600 text-white"
            size="sm"
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-3 w-3" />
                Connect Zoho Calendar
              </>
            )}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
