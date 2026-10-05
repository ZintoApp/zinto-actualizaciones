import type { CSSProperties } from 'react';

type DentalAppointmentColorSource = {
  calendarColor?: string | null;
  bookingServiceKey?: string | null;
  bookingServiceLabel?: string | null;
  title?: string | null;
  status?: string | null;
};

// These match the service colors used by the dental calendar. Keeping the
// palette here makes calendar cards, agenda items, and table rows identical.
const DENTAL_APPOINTMENT_COLORS = [
  '#38bdf8',
  '#34d399',
  '#a78bfa',
  '#fbbf24',
  '#fb7185',
] as const;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function stableHash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
}

export function getDentalAppointmentColor(row: DentalAppointmentColorSource): string {
  if (row.calendarColor && HEX_COLOR_PATTERN.test(row.calendarColor)) return row.calendarColor;

  const serviceIdentity = row.bookingServiceKey || row.bookingServiceLabel || row.title || '';
  return DENTAL_APPOINTMENT_COLORS[stableHash(serviceIdentity) % DENTAL_APPOINTMENT_COLORS.length];
}

export function getDentalAppointmentColorStyle(row: DentalAppointmentColorSource): CSSProperties {
  const color = getDentalAppointmentColor(row);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return {
    borderLeftColor: color,
    backgroundColor: `rgba(${red}, ${green}, ${blue}, 0.18)`,
  };
}

export function isMutedDentalAppointment(row: DentalAppointmentColorSource): boolean {
  return row.status === 'cancelled' || row.status === 'no_show';
}
