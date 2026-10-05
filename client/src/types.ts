export interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  tags?: string[] | null;
  isActive?: boolean | null;
  identifier?: string | null;
  identifierType?: string | null;
  source?: string | null;
  notes?: string | null;
  whatsappUsername?: string | null;
  whatsappLid?: string | null;
  whatsappBsuid?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
  total: number;
}