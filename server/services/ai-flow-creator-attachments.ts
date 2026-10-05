/** Validate common file signatures before extracting or forwarding Creator references. */
export function hasExpectedCreatorAttachmentSignature(extension: string, bytes: Buffer): boolean {
  const normalized = extension.toLowerCase();
  if (normalized === '.png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (normalized === '.jpg' || normalized === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (normalized === '.webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (normalized === '.pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (normalized === '.docx' || normalized === '.xlsx') return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (normalized === '.doc' || normalized === '.xls') return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return bytes.length > 0 && !bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0);
}
