export function mediaDateKey(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatMediaDate(value: string, timeZone: string, language = 'en') {
  return new Intl.DateTimeFormat(language.startsWith('en') ? 'en-GB' : language, { timeZone, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

export function formatMediaTime(value: string, timeZone: string, language = 'en') {
  return new Intl.DateTimeFormat(language, { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function formatMediaSize(size: number) {
  if (size >= 1048576) return `${(size / 1048576).toFixed(1).replace(/\.0$/, '')} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
