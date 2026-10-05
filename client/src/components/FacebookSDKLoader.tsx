import { useEffect } from 'react';
import { FACEBOOK_APP_CONFIG } from '@/lib/facebook-config';

/**
 * This component loads the Facebook SDK when mounted
 * It should be included once in your application layout
 */
export function FacebookSDKLoader() {
  useEffect(() => {
    if (!document.getElementById('facebook-jssdk')) {
      window.fbAsyncInit = function() {
        window.FB.init({
          appId: FACEBOOK_APP_CONFIG.appId,
          autoLogAppEvents: true,
          xfbml: true,
          version: FACEBOOK_APP_CONFIG.apiVersion
        });
      };
      
      const scriptElement = document.createElement('script');
      scriptElement.id = 'facebook-jssdk';
      scriptElement.src = 'https://connect.facebook.net/en_US/sdk.js';
      scriptElement.async = true;
      scriptElement.defer = true;
      scriptElement.crossOrigin = 'anonymous';
      
      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(scriptElement, firstScript);
      } else {
        document.head.appendChild(scriptElement);
      }
    }
  }, []);
  
  return null;
}