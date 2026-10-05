export interface ChunkIdCandidate {
  chunkId: number;
  contentHash?: string | null;
}

export interface MmrScoredCandidate extends ChunkIdCandidate {
  mmrScore: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) {
    return 0;
  }

  return dot / magnitude;
}

export function dedupeNearDuplicates<T extends ChunkIdCandidate>(
  candidates: T[],
  embeddingsByChunkId: Map<number, number[]>,
  dedupeSimilarity: number
): { kept: T[]; collapsedCount: number } {
  const kept: T[] = [];
  const keptHashes = new Set<string>();
  const keptEmbeddings: number[][] = [];
  let collapsedCount = 0;

  for (const candidate of candidates) {
    const hash = candidate.contentHash ?? null;
    if (hash && keptHashes.has(hash)) {
      collapsedCount++;
      continue;
    }

    const embedding = embeddingsByChunkId.get(candidate.chunkId);
    if (embedding) {
      const isDuplicate = keptEmbeddings.some(
        keptEmbedding => cosineSimilarity(embedding, keptEmbedding) >= dedupeSimilarity
      );
      if (isDuplicate) {
        collapsedCount++;
        continue;
      }
    }

    kept.push(candidate);
    if (hash) {
      keptHashes.add(hash);
    }
    if (embedding) {
      keptEmbeddings.push(embedding);
    }
  }

  return { kept, collapsedCount };
}

export function applyMmr<T extends ChunkIdCandidate>(
  candidates: T[],
  embeddingsByChunkId: Map<number, number[]>,
  queryEmbedding: number[],
  lambda: number
): MmrScoredCandidate[] {
  const withEmbedding: T[] = [];
  const withoutEmbedding: T[] = [];

  for (const candidate of candidates) {
    if (embeddingsByChunkId.has(candidate.chunkId)) {
      withEmbedding.push(candidate);
    } else {
      withoutEmbedding.push(candidate);
    }
  }

  const querySimByChunkId = new Map<number, number>();
  for (const candidate of withEmbedding) {
    const embedding = embeddingsByChunkId.get(candidate.chunkId)!;
    querySimByChunkId.set(candidate.chunkId, cosineSimilarity(queryEmbedding, embedding));
  }

  const maxSimToSelected = new Map<number, number>();
  for (const candidate of withEmbedding) {
    maxSimToSelected.set(candidate.chunkId, 0);
  }

  const selected: MmrScoredCandidate[] = [];
  const remaining = [...withEmbedding];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const querySim = querySimByChunkId.get(candidate.chunkId)!;
      const maxSelectedSim = maxSimToSelected.get(candidate.chunkId) ?? 0;
      const score = lambda * querySim - (1 - lambda) * maxSelectedSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [picked] = remaining.splice(bestIdx, 1);
    selected.push({ chunkId: picked.chunkId, contentHash: picked.contentHash, mmrScore: bestScore });

    const pickedEmbedding = embeddingsByChunkId.get(picked.chunkId)!;
    for (const candidate of remaining) {
      const candidateEmbedding = embeddingsByChunkId.get(candidate.chunkId)!;
      const pairwiseSim = cosineSimilarity(pickedEmbedding, candidateEmbedding);
      const currentMax = maxSimToSelected.get(candidate.chunkId) ?? 0;
      maxSimToSelected.set(candidate.chunkId, Math.max(currentMax, pairwiseSim));
    }
  }

  return [
    ...selected,
    ...withoutEmbedding.map(candidate => ({
      chunkId: candidate.chunkId,
      contentHash: candidate.contentHash,
      mmrScore: 0,
    })),
  ];
}

export function computeConfidence(params: {
  reranked: boolean;
  topRerankScore?: number;
  secondRerankScore?: number;
  topDenseScore?: number;
}): number {
  const { reranked, topRerankScore, secondRerankScore, topDenseScore } = params;

  if (reranked && topRerankScore !== undefined) {
    const margin =
      secondRerankScore !== undefined
        ? Math.max(0, topRerankScore - secondRerankScore)
        : topRerankScore;
    const blended = 0.7 * topRerankScore + 0.3 * margin;
    return Math.min(1, Math.max(0, blended));
  }

  if (topDenseScore !== undefined) {
    return Math.min(1, Math.max(0, topDenseScore));
  }

  return 0;
}
