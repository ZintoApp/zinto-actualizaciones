export class ScrapingCancelledError extends Error {
  constructor(message = 'Scraping cancelled') {
    super(message);
    this.name = 'ScrapingCancelledError';
  }
}

export function isScrapingCancelledError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ScrapingCancelledError';
}

export function throwIfScrapingCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ScrapingCancelledError();
  }
}

export async function waitForScrapingDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }

  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  throwIfScrapingCancelled(signal);

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', handleAbort);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new ScrapingCancelledError());
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    signal.addEventListener('abort', handleAbort, { once: true });
  });
}