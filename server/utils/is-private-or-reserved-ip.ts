/**
 * Returns true if the IP is loopback, private, link-local, reserved, or multicast.
 * Used for SSRF protection and link-preview validation.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // IPv4 checks
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;

    const [a, b, c, d] = parts.map(Number);

    // Loopback: 127.0.0.0/8
    if (a === 127) return true;

    // Private: 10.0.0.0/8
    if (a === 10) return true;

    // Private: 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;

    // Private: 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // Link-local: 169.254.0.0/16
    if (a === 169 && b === 254) return true;

    // Carrier-grade NAT: 100.64.0.0/10
    if (a === 100 && b >= 64 && b <= 127) return true;

    // IETF protocol assignments: 192.0.0.0/24
    if (a === 192 && b === 0 && c === 0) return true;

    // Documentation/test networks: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;

    // Benchmarking: 198.18.0.0/15
    if (a === 198 && (b === 18 || b === 19)) return true;

    // Reserved: 0.0.0.0
    if (a === 0 && b === 0 && c === 0 && d === 0) return true;

    // Multicast: 224.0.0.0/4
    if (a >= 224 && a <= 239) return true;

    // Reserved: 240.0.0.0/4
    if (a >= 240) return true;

    return false;
  }

  // IPv6 checks
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();

    // Loopback: ::1
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;

    // Link-local: fe80::/10
    if (lower.startsWith('fe80:') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;

    // Unique Local Address (ULA): fc00::/7
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

    // Multicast: ff00::/8
    if (lower.startsWith('ff')) return true;

    // Documentation: 2001:db8::/32
    if (lower === '2001:db8::' || lower.startsWith('2001:db8:')) return true;

    // Loopback: ::/128
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;

    // IPv4-mapped IPv6: ::ffff:0.0.0.0/96 (check the IPv4 part)
    if (lower.startsWith('::ffff:')) {
      const ipv4Part = lower.substring(7);
      return isPrivateOrReservedIP(ipv4Part);
    }

    return false;
  }

  return false;
}
