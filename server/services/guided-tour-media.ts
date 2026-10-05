export const mimeExtensions: Record<string,string> = { 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','video/mp4':'.mp4','video/webm':'.webm','application/pdf':'.pdf' };
export function signatureMatches(buffer: Buffer, mime: string) {
  const hex = buffer.subarray(0,12).toString('hex');
  if (mime === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mime === 'image/gif') return /^GIF8[79]a/.test(buffer.subarray(0,6).toString());
  if (mime === 'image/webp') return buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP';
  if (mime === 'application/pdf') return buffer.subarray(0,5).toString() === '%PDF-';
  if (mime === 'video/webm') return hex.startsWith('1a45dfa3');
  return mime === 'video/mp4' && buffer.subarray(4,8).toString() === 'ftyp';
}
