import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { contacts, contactAuditLogs, userContactAccess, users, type Contact, type InsertContact } from '../../shared/schema';
import { normalizeContactPhone } from '../../shared/contact-access';

export class ContactAddConflict extends Error {
  status = 409;

  constructor(message: string, readonly code?: 'CONTACT_IDENTITIES_CONFLICT') {
    super(message);
    this.name = 'ContactAddConflict';
  }
}

/** Explicit user additions only. Ingress/import deduplication must not create grants. */
export async function addContactWithAccess(
  database: Pick<typeof import('../db').db, 'transaction'>,
  input: InsertContact,
  actor: { companyId: number; userId: number; ipAddress?: string; userAgent?: string },
  prepareNewContact: (contact: InsertContact) => Promise<InsertContact> = async contact => contact,
): Promise<{ contact: Contact; created: boolean }> {
  return database.transaction(async tx => {
    // Serialize manual additions within a tenant, including installations with legacy indexes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(261, ${actor.companyId})`);
    const [member] = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.id, actor.userId), eq(users.companyId, actor.companyId))).limit(1);
    if (!member) throw new Error('A company member is required to add contacts');

    const phone = normalizeContactPhone(input.phone);
    const phoneDigits = phone?.replace(/[^0-9]/g, '') || null;
    const candidate = { ...input, phone, phoneDigits, companyId: actor.companyId, createdBy: actor.userId };
    const identities: SQL[] = [];
    if (phoneDigits) identities.push(sql`REGEXP_REPLACE(COALESCE(${contacts.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`);
    if (input.email?.trim()) identities.push(sql`LOWER(TRIM(${contacts.email})) = ${input.email.trim().toLowerCase()}`);
    if (input.identifier && input.identifierType) identities.push(and(eq(contacts.identifier, input.identifier), eq(contacts.identifierType, input.identifierType))!);
    if (input.whatsappUsername) identities.push(eq(contacts.whatsappUsername, input.whatsappUsername.trim().replace(/^@/, '').toLowerCase()));
    if (input.whatsappLid) identities.push(eq(contacts.whatsappLid, input.whatsappLid));
    if (input.whatsappBsuid) identities.push(eq(contacts.whatsappBsuid, input.whatsappBsuid));

    const findExisting = async () => {
      if (!identities.length) return undefined;
      const matches = await tx.select().from(contacts).where(and(
        eq(contacts.companyId, actor.companyId), or(...identities),
        isNull(contacts.deletedAt), isNull(contacts.anonymizedAt),
      )).limit(2);
      if (matches.length > 1) {
        throw new ContactAddConflict(
          'These details match multiple contacts. Ask an administrator to resolve the duplicates.',
          'CONTACT_IDENTITIES_CONFLICT',
        );
      }
      return matches[0];
    };

    let contact = await findExisting();
    let created = false;
    if (!contact) {
      const validated = await prepareNewContact(candidate);
      const [inserted] = await tx.insert(contacts).values({ ...validated, phoneDigits }).onConflictDoNothing().returning();
      contact = inserted;
      created = Boolean(inserted);
      // A concurrent ingress writer may have won a unique-key race outside our advisory lock.
      if (!contact) contact = await findExisting();
      if (!contact) throw new ContactAddConflict('This contact could not be added. Ask an administrator to check for duplicates.');
    }

    const [grant] = await tx.insert(userContactAccess).values({
      companyId: actor.companyId, contactId: contact.id, userId: actor.userId, grantReason: 'manual_add',
    }).onConflictDoNothing().returning({ id: userContactAccess.id });
    if (created) {
      await tx.insert(contactAuditLogs).values({
        companyId: actor.companyId, contactId: contact.id, userId: actor.userId,
        actionType: 'created', actionCategory: 'contact', description: `Contact created: ${contact.name}`,
        ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      });
    }
    if (grant) {
      await tx.insert(contactAuditLogs).values({
        companyId: actor.companyId, contactId: contact.id, userId: actor.userId,
        actionType: 'access_granted', actionCategory: 'contact',
        description: 'Contact added to member contacts', metadata: { reason: 'manual_add', userId: actor.userId },
        ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      });
    }
    return { contact, created };
  });
}
