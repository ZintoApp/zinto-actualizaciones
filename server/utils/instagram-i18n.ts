import serverI18n from './server-i18n';
import type { InstagramTranslate } from '../../shared/instagram-i18n';

export async function getInstagramTranslator(language = 'en'): Promise<InstagramTranslate> {
  await serverI18n.ensureLanguageLoaded(language);
  return (key, fallback, variables) => serverI18n.tSync(key, language, fallback, variables);
}
