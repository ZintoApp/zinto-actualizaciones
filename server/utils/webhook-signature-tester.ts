import crypto from 'crypto';

/**
 * Test utility for Meta WhatsApp webhook signature verification
 * @param body The raw request body (string)
 * @param signature The X-Hub-Signature-256 header value
 * @param secret The app secret for verification
 * @returns Detailed comparison object with verification results
 */
export function testMetaWebhookSignature(
  body: string,
  signature: string,
  secret: string
): {
  isValid: boolean;
  computedHash: string;
  receivedHash: string;
  bodyLength: number;
  secretLength: number;
  algorithm: string;
  details: {
    signatureFormat: string;
    hashMatch: boolean;
    bodyEncoding: string;
    error?: string;
  };
} {
  try {
    // Parse signature
    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2) {
      return {
        isValid: false,
        computedHash: '',
        receivedHash: signature,
        bodyLength: body.length,
        secretLength: secret.length,
        algorithm: 'unknown',
        details: {
          signatureFormat: 'invalid',
          hashMatch: false,
          bodyEncoding: 'utf8',
          error: 'Invalid signature format - expected "sha256=<hash>"'
        }
      };
    }

    const algorithm = signatureParts[0];
    const receivedHash = signatureParts[1];

    // Convert body to buffer
    const bodyBuffer = Buffer.from(body, 'utf8');

    // Compute HMAC
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(bodyBuffer);
    const computedHash = hmac.digest('hex');

    // Compare hashes
    const hashMatch = computedHash === receivedHash;

    // Timing-safe comparison
    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(computedHash, 'hex'),
        Buffer.from(receivedHash, 'hex')
      );
    } catch (error) {
      // If timing-safe comparison fails, use simple comparison
      isValid = hashMatch;
    }

    return {
      isValid,
      computedHash,
      receivedHash,
      bodyLength: body.length,
      secretLength: secret.length,
      algorithm,
      details: {
        signatureFormat: `${algorithm}=<hash>`,
        hashMatch,
        bodyEncoding: 'utf8'
      }
    };
  } catch (error) {
    return {
      isValid: false,
      computedHash: '',
      receivedHash: signature,
      bodyLength: body.length,
      secretLength: secret.length,
      algorithm: 'unknown',
      details: {
        signatureFormat: 'error',
        hashMatch: false,
        bodyEncoding: 'utf8',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

