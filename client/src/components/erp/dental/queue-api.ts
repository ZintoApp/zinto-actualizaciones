import { apiRequest } from '@/lib/queryClient';
export const QUEUE_API = '/api/erp/dental/queue';
export async function queueRequest<T>(path = '', method = 'GET', body?: unknown): Promise<T> {
  const response = await apiRequest(method, `${QUEUE_API}${path}`, body);
  return (await response.json()).data as T;
}
export function queueDate(value: string, timezone: string, locale: string, date = false) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, ...(date ? { dateStyle: 'medium' as const } : {}), timeStyle: 'short' }).format(new Date(value));
}
