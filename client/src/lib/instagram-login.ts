import type { InstagramLoginResult } from '@shared/types/instagram-login';
import { instagramEnglish, type InstagramTranslate } from '@shared/instagram-i18n';

export function launchInstagramBusinessLogin(connectionName: string, signal?: AbortSignal, t: InstagramTranslate = instagramEnglish): Promise<InstagramLoginResult> {
  // Open synchronously in the click handler so browsers do not block the popup.
  const popup = window.open('', '_blank', 'popup,width=600,height=760');
  if (!popup) return Promise.reject(new Error(t("instagram.login.popup_blocked", 'Allow popups for this site, then try connecting Instagram again.')));
  return new Promise((resolve, reject) => {
    let state = '';
    let settled = false;
    const finish = (result?: InstagramLoginResult, error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(interval); clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal?.removeEventListener('abort', abort);
      popup.close();
      if (error) reject(error); else resolve(result!);
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || !state ||
          event.data?.type !== 'instagram_oauth_result' || event.data.state !== state) return;
      const result = event.data as InstagramLoginResult;
      finish(result, result.success ? undefined : new Error(result.error || t("instagram.login.authorization_failed", 'Instagram authorization failed.')));
    };
    const abort = () => finish(undefined, new Error(t("instagram.login.cancelled", 'Instagram signup was cancelled.')));
    const interval = window.setInterval(() => {
      if (popup.closed) finish(undefined, new Error(t("instagram.login.closed", 'Instagram login was closed. Please try again.')));
    }, 500);
    const timeout = window.setTimeout(() => finish(undefined, new Error(t("instagram.login.expired", 'Instagram login expired. Please try again.'))), 15 * 60 * 1000);
    window.addEventListener('message', receive);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    fetch('/api/instagram/oauth/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionName }), signal,
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("instagram.login.start_failed", 'Could not start Instagram login.'));
      if (settled) return;
      const url = new URL(result.authorizationUrl);
      if (url.origin !== 'https://www.instagram.com' || !result.state) throw new Error(t("instagram.login.invalid_url", 'Invalid Instagram authorization URL.'));
      state = result.state;
      popup.location.href = url.toString();
    }).catch(error => finish(undefined, error instanceof Error ? error : new Error(t("instagram.login.start_failed", 'Could not start Instagram login.'))));
  });
}
