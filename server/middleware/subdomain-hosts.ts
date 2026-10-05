export function shouldReturnCompanyNotFoundForUnknownSubdomain(hostname: string): boolean {
  const cleanHostname = (hostname || '').split(':')[0].toLowerCase();
  return cleanHostname.endsWith('.localhost');
}