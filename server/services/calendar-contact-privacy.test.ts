/**
 * Contact-scoped calendar privacy — fail-closed filtering for AI tools.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  appendOwnershipToDescription,
  assertDentalAppointmentOwnedByContact,
  buildContactOwnershipPrivateProps,
  buildRequesterIdentityFromContact,
  eventBelongsToContact,
  filterEventsForContact,
  hasUsableRequesterIdentity,
  normalizePhoneDigits,
  BOTHIVE_CONTACT_ID_PROP,
  BOTHIVE_CONTACT_PHONE_PROP,
  sanitizeCalendarEventForContact,
} from './calendar-contact-privacy.js';

describe('calendar-contact-privacy', () => {
  test('normalizePhoneDigits strips non-digits and rejects short values', () => {
    assert.equal(normalizePhoneDigits('+92 305-900-2132'), '923059002132');
    assert.equal(normalizePhoneDigits('123'), null);
    assert.equal(normalizePhoneDigits(null), null);
  });

  test('buildRequesterIdentityFromContact uses phone when email missing', () => {
    const identity = buildRequesterIdentityFromContact({
      id: 42,
      email: null,
      phone: '+923059002132',
      identifier: null,
    });
    assert.equal(identity.contactId, 42);
    assert.equal(identity.email, null);
    assert.equal(identity.phoneDigits, '923059002132');
    assert.equal(hasUsableRequesterIdentity(identity), true);
  });

  test('fail closed: no identity returns empty list', () => {
    const events = [
      { id: '1', summary: 'Other patient', attendees: [{ email: 'a@example.com' }] },
    ];
    assert.deepEqual(filterEventsForContact(events, null), []);
    assert.deepEqual(filterEventsForContact(events, {}), []);
  });

  test('bypassContactPrivacyFilter returns all events (staff/internal)', () => {
    const events = [{ id: '1', summary: 'Anyone' }];
    assert.deepEqual(
      filterEventsForContact(events, null, { bypassContactPrivacyFilter: true }),
      events,
    );
  });

  test('phone-only contact sees only phone-stamped events', () => {
    const identity = buildRequesterIdentityFromContact({
      id: 7,
      phone: '15551234567',
    });
    const mine = {
      id: 'mine',
      summary: 'My visit',
      description: 'bothive_contact_phone:15551234567',
    };
    const other = {
      id: 'other',
      summary: 'Jane Doe cleaning',
      description: 'bothive_contact_phone:19998887777',
      attendees: [{ email: 'jane@example.com' }],
    };
    const unmarked = {
      id: 'legacy',
      summary: 'Legacy clinic event',
      attendees: [],
    };
    const filtered = filterEventsForContact([mine, other, unmarked], identity);
    assert.deepEqual(
      filtered.map((e: any) => e.id),
      ['mine'],
    );
  });

  test('email attendee match works; organizer alone does not', () => {
    const identity = { contactId: 1, email: 'patient@example.com', phoneDigits: null };
    const asAttendee = {
      id: 'a',
      summary: 'Mine',
      organizer: { email: 'clinic@example.com' },
      attendees: [{ email: 'patient@example.com' }],
    };
    const organizerOnly = {
      id: 'b',
      summary: 'Clinic owned',
      organizer: { email: 'patient@example.com' },
      attendees: [{ email: 'someoneelse@example.com' }],
    };
    assert.equal(eventBelongsToContact(asAttendee, identity), true);
    assert.equal(eventBelongsToContact(organizerOnly, identity), false);
  });

  test('private extended props match contact id and phone', () => {
    const identity = { contactId: 99, email: null, phoneDigits: '15550001111' };
    const byId = {
      id: '1',
      extendedProperties: { private: { [BOTHIVE_CONTACT_ID_PROP]: '99' } },
    };
    const byPhone = {
      id: '2',
      extendedProperties: { private: { [BOTHIVE_CONTACT_PHONE_PROP]: '15550001111' } },
    };
    assert.equal(eventBelongsToContact(byId, identity), true);
    assert.equal(eventBelongsToContact(byPhone, identity), true);
  });

  test('appendOwnershipToDescription and private props stamp identity', () => {
    const identity = buildRequesterIdentityFromContact({
      id: 5,
      phone: '+1 (555) 222-3333',
      email: 'x@y.com',
    });
    const desc = appendOwnershipToDescription('Cleaning', identity);
    assert.match(desc, /bothive_contact_id:5/);
    assert.match(desc, /bothive_contact_phone:15552223333/);
    const props = buildContactOwnershipPrivateProps(identity);
    assert.equal(props[BOTHIVE_CONTACT_ID_PROP], '5');
    assert.equal(props[BOTHIVE_CONTACT_PHONE_PROP], '15552223333');
  });

  test('sanitizeCalendarEventForContact strips attendees', () => {
    const sanitized = sanitizeCalendarEventForContact({
      id: '1',
      summary: 'Visit',
      attendees: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
      description: 'Note\nbothive_contact_id:1\n',
    });
    assert.equal(sanitized.attendees, undefined);
    assert.equal(sanitized.summary, 'Visit');
    assert.doesNotMatch(sanitized.description || '', /bothive_contact_id/);
  });

  test('assertDentalAppointmentOwnedByContact rejects foreign appointments', () => {
    assert.equal(assertDentalAppointmentOwnedByContact({ contactId: 10 }, 10), true);
    assert.equal(assertDentalAppointmentOwnedByContact({ contactId: 10 }, 11), false);
    assert.equal(assertDentalAppointmentOwnedByContact(null, 10), false);
  });
});
