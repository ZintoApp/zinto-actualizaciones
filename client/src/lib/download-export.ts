export type DownloadExportFormat = 'csv' | 'xlsx';

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

export async function downloadExportResponse(
  response: Response,
  fallbackBaseName: string,
  format: DownloadExportFormat,
): Promise<void> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    filenameFromDisposition(response.headers.get('Content-Disposition')) ??
    `${fallbackBaseName}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
