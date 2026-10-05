export const APPSUMO_ORIGIN = 'https://app.talkzen.io';
export const APPSUMO_CALLBACK = `${APPSUMO_ORIGIN}/api/appsumo/oauth/callback`;
export const APPSUMO_TIER_NAMES = { 1: 'Starter', 2: 'Professional', 3: 'Enterprise' } as const;
export function isAppSumoOrigin(origin: string): boolean { return origin === APPSUMO_ORIGIN; }
