import type { AiCreatorCommitMetadata } from '@shared/types/ai-flow-creator';
import { verifyAiFlowGenerationProof } from './ai-flow-creator-proof';

export function reconcileCreatorCommitWithStoredGeneration(params: {
  metadata: AiCreatorCommitMetadata;
  storedGeneratedGraphHash: unknown;
  storedBeforeGraphHash: unknown;
  userId: number;
  companyId: number;
}): AiCreatorCommitMetadata | null {
  const { metadata, storedGeneratedGraphHash, storedBeforeGraphHash, userId, companyId } = params;
  if (storedGeneratedGraphHash !== metadata.generatedGraphHash || typeof storedBeforeGraphHash !== 'string') return null;
  if (metadata.generationProof && !verifyAiFlowGenerationProof({
    generationId: metadata.generationId,
    userId,
    companyId,
    beforeGraphHash: storedBeforeGraphHash,
    generatedGraphHash: metadata.generatedGraphHash,
  }, metadata.generationProof)) return null;
  return { ...metadata, beforeGraphHash: storedBeforeGraphHash };
}
