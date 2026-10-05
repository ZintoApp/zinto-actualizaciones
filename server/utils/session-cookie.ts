export function buildSessionCookieSettings(options: {
  isProduction: boolean;
  forceInsecure: boolean;
}) {
  const secure = options.isProduction && !options.forceInsecure;

  return {
    secure,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: secure ? 'none' : 'lax',
    httpOnly: true,
  } as const;
}