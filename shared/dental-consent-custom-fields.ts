import type { ContactCustomFieldDefinition } from './contact-custom-fields';
export type ConsentCustomField = ContactCustomFieldDefinition & { id: number };
export const customConsentToken = (id: number) => `contact.custom.${id}`;
export const CONSENT_TOKEN_SOURCE = '(patientName|professionalName|guardianName|consentDate|contact\\.custom\\.[1-9][0-9]{0,9})';
export function consentCustomFieldIds(body: string): number[] {
  return [...new Set([...body.matchAll(/\{\{contact\.custom\.([1-9][0-9]{0,9})\}\}/g)].map(match => Number(match[1])))];
}
