export interface ScrapingProgressStats {
  totalChecked: number;
  validCount: number;
  errors: string[];
  totalToCheck?: number;
  progress?: number;
  currentBatch?: number;
  totalBatches?: number;
  currentPhoneNumber?: string;
  isCompleted?: boolean;
  wasStopped?: boolean;
}

export function buildStoppedScrapingStats(
  stats: ScrapingProgressStats | null
): ScrapingProgressStats | null {
  if (!stats) {
    return null;
  }

  return {
    ...stats,
    currentPhoneNumber: undefined,
    isCompleted: false,
    wasStopped: true,
  };
}

export function hasScrapingResultsFooter(
  isScrapingInProgress: boolean,
  resultsCount: number
): boolean {
  return !isScrapingInProgress && resultsCount > 0;
}

export function isScrapeAbortError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    error.name === 'ScrapingCancelledError'
  );
}