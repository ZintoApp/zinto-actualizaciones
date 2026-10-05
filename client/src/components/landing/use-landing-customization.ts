import { useEffect } from 'react';
import type { PublicFrontendWebsiteSettings } from '@shared/frontend-website-settings';
import { LANDING_CUSTOM_CSS_MARKER, LANDING_CUSTOM_JS_MARKER } from './helpers';

export function useLandingCustomization(
  config: Pick<PublicFrontendWebsiteSettings, 'customCss' | 'customJs'> | undefined
) {
  useEffect(() => {
    if (!config?.customCss?.enabled || !config.customCss.css.trim()) {
      return;
    }

    const style = document.createElement('style');
    style.setAttribute(LANDING_CUSTOM_CSS_MARKER, 'true');
    style.textContent = config.customCss.css;
    document.head.appendChild(style);

    return () => {
      document.querySelectorAll(`style[${LANDING_CUSTOM_CSS_MARKER}]`).forEach((el) => el.remove());
    };
  }, [config?.customCss?.enabled, config?.customCss?.css, config?.customCss?.lastModified]);

  useEffect(() => {
    if (!config?.customJs?.enabled || !config.customJs.js.trim()) {
      return;
    }

    const script = document.createElement('script');
    script.setAttribute(LANDING_CUSTOM_JS_MARKER, 'true');
    script.textContent = config.customJs.js;
    document.body.appendChild(script);

    return () => {
      document.querySelectorAll(`script[${LANDING_CUSTOM_JS_MARKER}]`).forEach((el) => el.remove());
    };
  }, [config?.customJs?.enabled, config?.customJs?.js, config?.customJs?.lastModified]);
}
