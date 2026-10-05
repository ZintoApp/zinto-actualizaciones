import { memo, useEffect, useMemo, useState } from 'react';

/** A local clock: queue polling and announcement timing never drive its ticks. */
export const QueueClock = memo(function QueueClock({ timezone, locale }: { timezone: string; locale: string }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000) * 1000);
  const { timeFormatter, dateFormatter, periodWidth } = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit' };
    const timeFormatter = new Intl.DateTimeFormat(locale, options);
    // Reserve equal space for either day period, including localized AM/PM labels.
    const periodLengths = [0, 12].map(hour => timeFormatter.formatToParts(new Date(Date.UTC(2026, 0, 1, hour)))
      .find(part => part.type === 'dayPeriod')?.value.length || 0);
    return {
      timeFormatter,
      dateFormatter: new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: 'medium' }),
      periodWidth: `${Math.max(...periodLengths, 2) + 1}ch`,
    };
  }, [locale, timezone]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function synchronize() {
      clearTimeout(timer);
      if (document.hidden) return;
      setNow(Math.floor(Date.now() / 1000) * 1000);
      // Recalculate the delay from wall-clock time on every tick to avoid drift.
      timer = setTimeout(synchronize, 1000 - Date.now() % 1000);
    }
    synchronize();
    document.addEventListener('visibilitychange', synchronize);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, []);

  const parts = timeFormatter.formatToParts(now);
  const date = dateFormatter.format(now);
  return <time className="dental-tv-clock" dateTime={new Date(now).toISOString()} aria-label={`${date}, ${timeFormatter.format(now)}`}>
    <span className="dental-tv-clock-digits" aria-hidden="true">
      {parts.map((part, index) => {
        if (part.type === 'second') {
          return <span key={index} className="dental-tv-clock-seconds">{part.value}</span>;
        }
        if (part.type === 'dayPeriod') {
          return <span key={index} className="dental-tv-clock-period" style={{ inlineSize: periodWidth }}>{part.value}</span>;
        }
        const className = part.type === 'hour' || part.type === 'minute'
          ? 'dental-tv-clock-unit'
          : parts[index + 1]?.type === 'second' ? 'dental-tv-clock-separator dental-tv-clock-separator-seconds' : 'dental-tv-clock-separator';
        return <span key={index} className={className}>{part.value}</span>;
      })}
    </span>
    <span className="dental-tv-clock-date" aria-hidden="true">{date}</span>
  </time>;
});
