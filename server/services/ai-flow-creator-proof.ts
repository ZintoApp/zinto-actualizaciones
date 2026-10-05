import crypto from 'crypto';

function proofSecret(): string {
  return process.env.SESSION_SECRET || 'bothive-secret';
}

function payload(params: { generationId: string; userId: number; companyId: number; beforeGraphHash: string; generatedGraphHash: string }): string {
  return `${params.generationId}:${params.userId}:${params.companyId}:${params.beforeGraphHash}:${params.generatedGraphHash}`;
}

export function createAiFlowGenerationProof(params: { generationId: string; userId: number; companyId: number; beforeGraphHash: string; generatedGraphHash: string }): string {
  return crypto.createHmac('sha256', proofSecret()).update(payload(params)).digest('hex');
}

export function verifyAiFlowGenerationProof(
  params: { generationId: string; userId: number; companyId: number; beforeGraphHash: string; generatedGraphHash: string },
  proof: string | undefined,
): boolean {
  if (!proof || !/^[a-f0-9]{64}$/i.test(proof)) return false;
  const expected = createAiFlowGenerationProof(params);
  return crypto.timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(expected, 'hex'));
}
