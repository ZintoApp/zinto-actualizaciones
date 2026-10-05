export type InstagramTranslate = (key: string, fallback: string, variables?: Record<string, any>) => string;

export const instagramEnglish: InstagramTranslate = (_key, fallback, variables) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (match, key) => String(variables?.[key] ?? match));
