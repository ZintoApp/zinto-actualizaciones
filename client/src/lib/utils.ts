import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ChannelConnection, Contact } from "@shared/schema";
import { isChannelAvailable } from "@shared/channel-utils";
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(phone?: string): string {
  if (!phone) return "";
  
  const cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length > 10) {
    return `+${cleaned.slice(0, cleaned.length - 10)} ${cleaned.slice(-10, -7)} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
  }
  
  return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3");
}

export function findChannelConnectionForContact(
  contact: Contact,
  connections: ChannelConnection[]
): ChannelConnection | undefined {
  if (!contact || !connections?.length) return undefined;
  
  if (contact.identifierType === 'whatsapp' || contact.identifierType === 'whatsapp_unofficial') {
    return connections.find(conn => 
      (conn.channelType === 'whatsapp' || conn.channelType === 'whatsapp_unofficial' || conn.channelType === 'whatsapp_official') && 
      isChannelAvailable(conn)
    );
  }
  
  if (contact.identifierType) {
    return connections.find(conn => 
      conn.channelType === contact.identifierType && 
      isChannelAvailable(conn)
    );
  }
  
  return undefined;
}

export { formatCurrency } from '@shared/currency-format';

export { formatDate } from '@shared/date-format';

/**
 * Extracts initials from a name string, handling edge cases like empty names,
 * single-character names, and names with special characters.
 * 
 * @param name - The name string to extract initials from
 * @returns A string containing up to 2 uppercase initials, or '?' for empty names
 */
export function getInitials(name: string): string {
  if (!name || !name.trim()) {
    return '?'; // Fallback for empty names
  }
  
  return name
    .trim()
    .split(/\s+/) // Split on one or more whitespace characters
    .filter(part => part.length > 0) // Remove empty parts
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}