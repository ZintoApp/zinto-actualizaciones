/**
 * CSV Export Utility
 * Handles CSV generation with proper formatting and special character handling
 */

export interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  tags?: string[] | null;
  customFields?: Record<string, any> | null;
  identifierType?: string | null;
  identifier?: string | null;
  source?: string | null;
  notes?: string | null;
  whatsappUsername?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Escapes CSV field values by wrapping in quotes and escaping internal quotes
 */
function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }
  
  const stringValue = String(value);

  return `"${stringValue.replace(/"/g, '""')}"`;
}

/**
 * Formats a date string for CSV export
 */
function formatDateForCsv(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toISOString();
  } catch (error) {
    return dateString;
  }
}

/**
 * Generates CSV content from contact data
 */
export function generateContactsCsv(contacts: Contact[]): string {
  const headers = [
    'ID',
    'Name',
    'Email',
    'Phone',
    'whatsappUsername',
    'Company',
    'Tags',
    'Custom Fields',
    'Channel Type',
    'Channel Identifier',
    'Source',
    'Notes',
    'Created At',
    'Updated At'
  ];

  const csvRows = [headers.join(',')];

  contacts.forEach(contact => {
    const customFieldsStr = contact.customFields && typeof contact.customFields === 'object' && Object.keys(contact.customFields).length > 0
      ? JSON.stringify(contact.customFields)
      : '';
    const row = [
      contact.id?.toString() || '',
      escapeCsvField(contact.name),
      escapeCsvField(contact.email),
      escapeCsvField(contact.phone),
      escapeCsvField(contact.whatsappUsername),
      escapeCsvField(contact.company),
      escapeCsvField((contact.tags || []).join(', ')),
      escapeCsvField(customFieldsStr),
      escapeCsvField(contact.identifierType),
      escapeCsvField(contact.identifier),
      escapeCsvField(contact.source),
      escapeCsvField(contact.notes),
      escapeCsvField(formatDateForCsv(contact.createdAt)),
      escapeCsvField(formatDateForCsv(contact.updatedAt))
    ];
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}

/**
 * Generates a timestamped filename for CSV export
 */
export function generateExportFilename(prefix: string = 'contacts_export'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${prefix}_${timestamp}.csv`;
}

/**
 * Downloads CSV content as a file
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Main export function that handles the complete CSV export process
 */
export function exportContactsToCsv(contacts: Contact[], filename?: string): void {
  const csvContent = generateContactsCsv(contacts);
  const exportFilename = filename || generateExportFilename();
  downloadCsv(csvContent, exportFilename);
}
