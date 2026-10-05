export interface TrackedFileSize {
  sizeBytes: number;
}

export function bytesToTrackedMB(bytes: number): number {
  if (bytes <= 0) {
    return 0;
  }

  return Math.ceil(bytes / (1024 * 1024));
}

export function megabytesToBytes(megabytes: number): number {
  if (megabytes <= 0) {
    return 0;
  }

  return Math.round(megabytes * 1024 * 1024);
}

export function bytesToMegabytes(bytes: number): number {
  if (bytes <= 0) {
    return 0;
  }

  return bytes / (1024 * 1024);
}

export function sumTransferredBytes(events: Array<{ bytesTransferred: number }>): number {
  return events.reduce((total, event) => total + Math.max(0, event.bytesTransferred), 0);
}

export function sumTrackedFileSizes(files: TrackedFileSize[]): { storageMB: number; filesCount: number } {
  return files.reduce(
    (totals, file) => ({
      storageMB: totals.storageMB + bytesToTrackedMB(file.sizeBytes),
      filesCount: totals.filesCount + 1
    }),
    { storageMB: 0, filesCount: 0 }
  );
}

export function getTrackableBandwidthBytes(method: string, statusCode: number, contentLength: unknown): number | null {
  if (method === 'HEAD' || statusCode === 304 || (statusCode !== 200 && statusCode !== 206)) {
    return null;
  }

  const length = typeof contentLength === 'number'
    ? contentLength
    : typeof contentLength === 'string'
      ? Number.parseInt(contentLength, 10)
      : Number.NaN;

  return Number.isFinite(length) && length > 0 ? length : null;
}
