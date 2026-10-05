import { appSumoCompanyPolicy } from './appsumo-policy';
import pgvector from 'pgvector';
import OpenAI from 'openai';
import { pool } from '../db';
import { aiCredentialsService } from './ai-credentials-service';
import { NodeKnowledgeBase, type NodeFunction } from './ai-flow-node-knowledge';
import {
  GENERATABLE_FLOW_NODE_DEFINITIONS,
  buildAllFlowNodeKnowledgeChunks,
  buildFlowNodeKnowledgeChunks,
  getFlowNodeDefinition,
  type FlowNodeKnowledgeChunk,
} from '@shared/flow-node-registry';
import type { FlowNodeDefinition } from '@shared/types/ai-flow-creator';
import { logger } from '../utils/logger';

const BATCH_SIZE = 20;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

function tokenize(input: string): string[] {
  return [...new Set(input.toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length > 2))];
}

class NodeRAGService {
  private async getOpenAIClient(companyId: number): Promise<OpenAI> {
    const credential = companyId === 0
      ? await aiCredentialsService.getSystemOrEnvCredential('openai')
      : await aiCredentialsService.getCredentialForCompany(companyId, 'openai');
    const apiKey = credential?.apiKey ?? ((await appSumoCompanyPolicy(companyId)).managed ? undefined : process.env.OPENAI_API_KEY);
    if (!apiKey) throw new Error('OpenAI embedding credential is not configured');
    return new OpenAI({ apiKey });
  }

  private lexicalDefinitions(query: string, topK: number): FlowNodeDefinition[] {
    const queryTokens = tokenize(query);
    const scored = GENERATABLE_FLOW_NODE_DEFINITIONS.map((definition) => {
      const text = [
        definition.canvasType,
        definition.displayName,
        definition.description,
        ...definition.aliases,
        ...definition.keywords,
        ...definition.operations,
        ...definition.examples,
      ].join(' ').toLowerCase();
      const score = queryTokens.reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);
      return { definition, score };
    }).sort((a, b) => b.score - a.score || a.definition.displayName.localeCompare(b.definition.displayName));

    const selected = scored.filter((entry) => entry.score > 0).slice(0, topK).map((entry) => entry.definition);
    const commonTypes = ['trigger', 'message', 'condition', 'ai_assistant', 'end_conversation'];
    for (const type of commonTypes) {
      if (selected.length >= topK) break;
      const definition = getFlowNodeDefinition(type);
      if (definition?.generatable && !selected.includes(definition)) selected.push(definition);
    }
    return selected.length ? selected : GENERATABLE_FLOW_NODE_DEFINITIONS.slice(0, topK);
  }

  private prioritizeExplicitDefinitions(query: string, ranked: FlowNodeDefinition[], topK: number): FlowNodeDefinition[] {
    const normalizedQuery = query.toLowerCase();
    const compactQuery = normalizedQuery.replace(/[^a-z0-9]+/g, '');
    const explicit = GENERATABLE_FLOW_NODE_DEFINITIONS.filter((definition) => {
      const names = [definition.canvasType, definition.displayName, ...definition.aliases]
        .map((name) => name.toLowerCase())
        .filter((name) => name.length >= 4);
      return names.some((name) => normalizedQuery.includes(name) || compactQuery.includes(name.replace(/[^a-z0-9]+/g, '')));
    });
    return [...new Set([...explicit, ...ranked])].slice(0, topK);
  }

  async initializeEmbeddings(companyId: number, forceReEmbed = false): Promise<void> {
    const chunks = buildAllFlowNodeKnowledgeChunks();
    const readClient = await pool.connect();
    let chunksToProcess = chunks;
    try {
      const validChunkKeys = new Set(chunks.map((chunk) => `${chunk.nodeType}:${chunk.chunkKey}`));
      const allExisting = await readClient.query<{ node_type: string; chunk_key: string; content_hash: string }>(
        'SELECT node_type, chunk_key, content_hash FROM node_embeddings',
      );
      const stale = allExisting.rows.filter((row) => !validChunkKeys.has(`${row.node_type}:${row.chunk_key}`));
      if (stale.length) {
        const values = stale.flatMap((row) => [row.node_type, row.chunk_key]);
        const tuples = stale.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ');
        await readClient.query(`DELETE FROM node_embeddings WHERE (node_type, chunk_key) IN (${tuples})`, values);
      }
      if (!forceReEmbed) {
        const hashes = new Map(allExisting.rows.map((row) => [`${row.node_type}:${row.chunk_key}`, row.content_hash]));
        chunksToProcess = chunks.filter((chunk) => hashes.get(`${chunk.nodeType}:${chunk.chunkKey}`) !== chunk.contentHash);
      }
    } finally {
      readClient.release();
    }

    if (!chunksToProcess.length) {
      logger.info('NodeRAGService', 'Node registry embeddings are current');
      return;
    }

    const openai = await this.getOpenAIClient(companyId);
    let embeddedCount = 0;
    for (let offset = 0; offset < chunksToProcess.length; offset += BATCH_SIZE) {
      const batch = chunksToProcess.slice(offset, offset + BATCH_SIZE);
      const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch.map((chunk) => chunk.text),
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let index = 0; index < batch.length; index += 1) {
          const embedding = embeddingResponse.data[index]?.embedding;
          if (!embedding) continue;
          const chunk = batch[index];
          await client.query(
            `INSERT INTO node_embeddings
              (node_type, chunk_key, content_hash, chunk_text, embedding, metadata, updated_at)
             VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, NOW())
             ON CONFLICT (node_type, chunk_key) DO UPDATE SET
               content_hash = EXCLUDED.content_hash,
               chunk_text = EXCLUDED.chunk_text,
               embedding = EXCLUDED.embedding,
               metadata = EXCLUDED.metadata,
               updated_at = NOW()`,
            [chunk.nodeType, chunk.chunkKey, chunk.contentHash, chunk.text, pgvector.toSql(embedding), JSON.stringify(chunk.metadata)],
          );
          embeddedCount += 1;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
    logger.info('NodeRAGService', `Embedded ${embeddedCount} changed registry chunks`);
  }

  async retrieveRelevantDefinitions(query: string, topK: number, companyId: number, similarityThreshold = 0.25): Promise<FlowNodeDefinition[]> {
    try {
      const openai = await this.getOpenAIClient(companyId);
      const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: [query], dimensions: EMBEDDING_DIMENSIONS });
      const queryEmbedding = embeddingResponse.data[0]?.embedding;
      if (!queryEmbedding) return this.lexicalDefinitions(query, topK);
      const client = await pool.connect();
      try {
        const result = await client.query<{ node_type: string; similarity: number }>(
          `SELECT node_type, MAX(1 - (embedding <=> $1::vector)) AS similarity
           FROM node_embeddings
           WHERE (metadata->>'generatable')::boolean IS TRUE
           GROUP BY node_type
           HAVING MAX(1 - (embedding <=> $1::vector)) >= $3
           ORDER BY similarity DESC
           LIMIT $2`,
          [pgvector.toSql(queryEmbedding), topK, similarityThreshold],
        );
        const definitions = result.rows
          .map((row) => getFlowNodeDefinition(row.node_type))
          .filter((definition): definition is FlowNodeDefinition => Boolean(definition?.generatable));
        const ranked = definitions.length ? definitions : this.lexicalDefinitions(query, topK);
        return this.prioritizeExplicitDefinitions(query, ranked, topK);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.warn('NodeRAGService', 'Semantic node retrieval unavailable; using deterministic lexical fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.prioritizeExplicitDefinitions(query, this.lexicalDefinitions(query, topK), topK);
    }
  }

  async retrieveRelevantNodes(query: string, topK: number, companyId: number, similarityThreshold = 0.25): Promise<NodeFunction[]> {
    const definitions = await this.retrieveRelevantDefinitions(query, topK, companyId, similarityThreshold);
    const knowledge = NodeKnowledgeBase.getInstance();
    return definitions.map((definition) => knowledge.getNodeFunction(definition.canvasType)).filter((node): node is NodeFunction => Boolean(node));
  }

  getKnowledgeChunks(nodeTypes: string[]): FlowNodeKnowledgeChunk[] {
    return nodeTypes.flatMap((nodeType) => {
      const definition = getFlowNodeDefinition(nodeType);
      return definition?.generatable ? buildFlowNodeKnowledgeChunks(definition) : [];
    });
  }

  getNodeSchema(nodeType: string): NodeFunction | null {
    return NodeKnowledgeBase.getInstance().getNodeFunction(nodeType);
  }
}

export const nodeRagService = new NodeRAGService();
