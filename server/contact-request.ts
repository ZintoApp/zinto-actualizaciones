import { insertContactSchema } from '../shared/schema';

// Ownership, tenancy, deletion state, sync metadata and access grants are server-managed.
export const editableContactSchema = insertContactSchema.pick({
  name: true, email: true, phone: true, company: true, tags: true, notes: true,
  customFields: true, colombiaFiscalProfile: true, avatarUrl: true,
  identifier: true, identifierType: true, source: true, whatsappUsername: true,
});
