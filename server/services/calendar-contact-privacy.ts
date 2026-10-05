/**
 * Contact-scoped privacy for AI calendar tools.
 * Fail closed: never return or mutate appointments unless they match the conversation contact.
 */

export type CalendarRequesterIdentity = {
  contactId?: number | null;
  email?: string | null;
  /** Digits-only phone (and optionally WhatsApp identifier digits). */
  phoneDigits?: string | null;
};

export const BOTHIVE_CONTACT_ID_PROP = 'bothiveContactId';
export const BOTHIVE_CONTACT_PHONE_PROP = 'bothiveContactPhone';

const CONTACT_ID_DESC_RE = /(?:^|\n)\s*bothive_contact_id\s*:\s*(\d+)\s*(?:\n|$)/i;
const CONTACT_PHONE_DESC_RE = /(?:^|\n)\s*bothive_contact_phone\s*:\s*(\d+)\s*(?:\n|$)/i;

export function normalizePhoneDigits(raw?: string | null): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

export function buildRequesterIdentityFromContact(contact: {
  id: number;
  email?: string | null;
  phone?: string | null;
  identifier?: string | null;
}): CalendarRequesterIdentity {
  const email = typeof contact.email === 'string' ? contact.email.trim().toLowerCase() : '';
  const phoneDigits =
    normalizePhoneDigits(contact.phone) || normalizePhoneDigits(contact.identifier);
  return {
    contactId: Number.isFinite(contact.id) && contact.id > 0 ? contact.id : null,
    email: email || null,
    phoneDigits,
  };
}

export function hasUsableRequesterIdentity(
  identity?: CalendarRequesterIdentity | null,
): boolean {
  if (!identity) return false;
  if (identity.contactId != null && Number(identity.contactId) > 0) return true;
  if (identity.email && identity.email.trim().length > 0) return true;
  if (identity.phoneDigits && identity.phoneDigits.length >= 7) return true;
  return false;
}

/** Private extended properties for Google Calendar events. */
export function buildContactOwnershipPrivateProps(
  identity: CalendarRequesterIdentity,
): Record<string, string> {
  const props: Record<string, string> = {};
  if (identity.contactId != null && Number(identity.contactId) > 0) {
    props[BOTHIVE_CONTACT_ID_PROP] = String(identity.contactId);
  }
  if (identity.phoneDigits) {
    props[BOTHIVE_CONTACT_PHONE_PROP] = identity.phoneDigits;
  }
  return props;
}

/** Stable description markers (Google + Zoho) for phone-only / legacy matching. */
export function buildContactOwnershipDescriptionSuffix(
  identity: CalendarRequesterIdentity,
): string {
  const lines: string[] = [];
  if (identity.contactId != null && Number(identity.contactId) > 0) {
    lines.push(`bothive_contact_id:${identity.contactId}`);
  }
  if (identity.phoneDigits) {
    lines.push(`bothive_contact_phone:${identity.phoneDigits}`);
  }
  return lines.join('\n');
}

export function appendOwnershipToDescription(
  description: string | null | undefined,
  identity: CalendarRequesterIdentity,
): string {
  const suffix = buildContactOwnershipDescriptionSuffix(identity);
  if (!suffix) return description == null ? '' : String(description);
  const base = description == null ? '' : String(description).trimEnd();
  if (
    (identity.contactId != null && CONTACT_ID_DESC_RE.test(base)) ||
    (identity.phoneDigits && base.includes(`bothive_contact_phone:${identity.phoneDigits}`))
  ) {
    return base;
  }
  return base ? `${base}\n\n${suffix}` : suffix;
}

function readPrivateProps(event: any): Record<string, string> {
  const privateProps = event?.extendedProperties?.private;
  if (!privateProps || typeof privateProps !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(privateProps)) {
    if (value != null) out[key] = String(value);
  }
  return out;
}

function attendeeEmails(event: any): string[] {
  const attendees = event?.attendees;
  if (!Array.isArray(attendees)) return [];
  return attendees
    .map((a: any) => {
      if (typeof a === 'string') return a.trim().toLowerCase();
      const email = a?.email ?? a?.Email ?? a?.mailId;
      return typeof email === 'string' ? email.trim().toLowerCase() : '';
    })
    .filter(Boolean);
}

/**
 * True when the calendar event is owned by / involves this contact.
 * Does not treat clinic organizer email alone as ownership.
 */
export function eventBelongsToContact(
  event: any,
  identity: CalendarRequesterIdentity,
): boolean {
  if (!event || !hasUsableRequesterIdentity(identity)) return false;

  const privateProps = readPrivateProps(event);
  if (
    identity.contactId != null &&
    privateProps[BOTHIVE_CONTACT_ID_PROP] &&
    String(privateProps[BOTHIVE_CONTACT_ID_PROP]) === String(identity.contactId)
  ) {
    return true;
  }
  if (
    identity.phoneDigits &&
    privateProps[BOTHIVE_CONTACT_PHONE_PROP] &&
    String(privateProps[BOTHIVE_CONTACT_PHONE_PROP]) === identity.phoneDigits
  ) {
    return true;
  }

  const description = typeof event.description === 'string' ? event.description : '';
  if (identity.contactId != null) {
    const idMatch = description.match(CONTACT_ID_DESC_RE);
    if (idMatch && idMatch[1] === String(identity.contactId)) return true;
  }
  if (identity.phoneDigits) {
    const phoneMatch = description.match(CONTACT_PHONE_DESC_RE);
    if (phoneMatch && phoneMatch[1] === identity.phoneDigits) return true;
  }

  if (identity.email) {
    const email = identity.email.trim().toLowerCase();
    if (attendeeEmails(event).includes(email)) return true;
  }

  return false;
}

/** Strip other attendees / PII before returning events to the AI / customer channel. */
export function sanitizeCalendarEventForContact(event: any): any {
  if (!event || typeof event !== 'object') return event;
  const { attendees: _attendees, extendedProperties: _ext, ...rest } = event;
  return {
    ...rest,
    // Keep description but strip ownership markers from customer-facing text if present
    description: typeof rest.description === 'string'
      ? rest.description
          .replace(CONTACT_ID_DESC_RE, '\n')
          .replace(CONTACT_PHONE_DESC_RE, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : rest.description,
  };
}

export function filterEventsForContact<T>(
  events: T[],
  identity: CalendarRequesterIdentity | null | undefined,
  options?: { bypassContactPrivacyFilter?: boolean },
): T[] {
  if (options?.bypassContactPrivacyFilter) return events;
  if (!hasUsableRequesterIdentity(identity)) return [];
  return events.filter((event) => eventBelongsToContact(event, identity!));
}

export function assertDentalAppointmentOwnedByContact(
  appointment: { contactId: number } | null | undefined,
  contactId: number,
): boolean {
  if (!appointment) return false;
  return Number(appointment.contactId) === Number(contactId);
}
