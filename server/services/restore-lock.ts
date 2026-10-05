import crypto from 'crypto';

type LockEntry = { ownerToken: string; acquiredAt: number };

let activeRestore: LockEntry | null = null;

/**
 * Process-wide restore guard (single Node process). BackupService is per-request;
 * only one restore may run at a time; maintenance mode and service resume use the owner token.
 */
export function tryAcquireRestoreLock(): { ownerToken: string } | null {
  if (activeRestore) {
    return null;
  }
  const ownerToken = crypto.randomBytes(32).toString('hex');
  activeRestore = { ownerToken, acquiredAt: Date.now() };
  return { ownerToken };
}

export function verifyRestoreLock(ownerToken: string | undefined): boolean {
  if (!ownerToken || !activeRestore) {
    return false;
  }
  return activeRestore.ownerToken === ownerToken;
}

export function releaseRestoreLock(ownerToken: string | undefined): void {
  if (ownerToken && activeRestore?.ownerToken === ownerToken) {
    activeRestore = null;
  }
}
