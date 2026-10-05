/**
 * Routes that use the persistent main app chrome (nav sidebar mounted once in App.tsx).
 * Keep in sync with main authenticated product routes — exclude embeds, auth, admin, etc.
 */
export function needsPersistentSidebar(pathname: string): boolean {
  if (/^\/erp\/dental\/queue\/display\/?$/.test(pathname) || pathname.startsWith('/erp/dental/queue/ticket/')) return false;
  if (pathname.includes('/inbox/embed')) return false;

  // Flow list uses the main nav; flow builder (/flows/new, /flows/:id) is full-width without it.
  const isFlowListOnly = pathname === '/flows' || pathname === '/flows/';
  if (pathname.startsWith('/flows') && !isFlowListOnly) return false;

  const prefixes = [
    '/inbox',
    '/email/',
    '/flows',
    '/contacts',
    '/tasks',
    '/pipeline',
    '/calendar',
    '/my-calendar',
    '/campaigns',
    '/call-logs',
    '/templates',
    '/analytics',
    '/reports',
    '/captured-data',
    '/erp/restaurant/kitchen',
    '/erp/restaurant/dispatch',
    '/erp/restaurant/',
    '/erp/',
    '/settings',
    '/pages',
    '/profile',
  ];

  return prefixes.some((p) => pathname === p || pathname.startsWith(p));
}
