import { Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';
import { db } from '../db';
import { flows } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_RAG_CONFIG } from '../../shared/rag-defaults';
import {
  getCachedPineconeCredentials,
  setCachedPineconeCredentials,
} from './node-config-cache';
import type {
  VectorSearchMatch,
  VectorSearchOptions,
  VectorStore,
  VectorStoreMetadata,
  VectorStoreRecord,
} from './vector-store';

interface PineconeCredentials {
  apiKey: string;
  environment?: string;
  indexName: string;
}

type VectorMetadata = VectorStoreMetadata & RecordMetadata;

type UpsertVector = VectorStoreRecord;

type QueryResult = VectorSearchMatch;

/**
 * Pinecone Service
 * Handles vector storage and retrieval using Pinecone
 */
export class PineconeService implements VectorStore {
  private clients: Map<string, Pinecone> = new Map();

  constructor() {}

  /**
   * Get Pinecone credentials from node configuration
   */
  private async getPineconeCredentials(
    companyId: number,
    nodeId: string
  ): Promise<PineconeCredentials> {
    try {
      const cached = getCachedPineconeCredentials<PineconeCredentials>(companyId, nodeId);
      if (cached) {
        return cached;
      }

      const companyFlows = await db.select()
        .from(flows)
        .where(eq(flows.companyId, companyId));

      for (const flow of companyFlows) {
        if (!flow.nodes) continue;

        const nodes = typeof flow.nodes === 'string'
          ? JSON.parse(flow.nodes)
          : flow.nodes;

        const node = (nodes as any)?.find?.((n: any) => n.id === nodeId);

        if (node?.data?.pineconeApiKey) {

          const indexName = node.data.pineconeIndexName ||
            `chatflow-kb-${companyId}`;

          const credentials = {
            apiKey: node.data.pineconeApiKey,
            environment: node.data.pineconeEnvironment || 'us-east-1',
            indexName,
          };
          setCachedPineconeCredentials(companyId, nodeId, credentials);
          return credentials;
        }
      }

      throw new Error(
        'Pinecone API Key not configured. Please set Pinecone API Key in the AI Assistant node settings.'
      );
    } catch (error) {
      console.error('Failed to get Pinecone credentials:', error);
      throw new Error(
        'Pinecone API Key not configured. Please set Pinecone API Key in the AI Assistant node settings.'
      );
    }
  }

  /**
   * Get or create Pinecone client for given credentials
   */
  private async getPineconeClient(
    companyId: number,
    nodeId: string
  ): Promise<{ client: Pinecone; indexName: string }> {
    const credentials = await this.getPineconeCredentials(companyId, nodeId);
    const clientKey = `${credentials.apiKey}-${credentials.indexName}`;


    if (!this.clients.has(clientKey)) {
      const client = new Pinecone({
        apiKey: credentials.apiKey,
      });
      this.clients.set(clientKey, client);
    }

    return {
      client: this.clients.get(clientKey)!,
      indexName: credentials.indexName,
    };
  }

  /**
   * Generate namespace for multi-tenancy isolation
   */
  private getNamespace(companyId: number, nodeId: string): string {
    return `company-${companyId}-node-${nodeId}`;
  }

  async ensureStorage(companyId: number, nodeId: string): Promise<void> {
    return this.ensureIndex(companyId, nodeId);
  }

  /**
   * Ensure index exists (create if needed)
   */
  async ensureIndex(companyId: number, nodeId: string): Promise<void> {
    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);


      const indexes = await client.listIndexes();
      const exists = indexes.indexes?.some(idx => idx.name === indexName);

      if (!exists) {

        await client.createIndex({
          name: indexName,
          dimension: 1536,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1',
            },
          },
          waitUntilReady: true,
        });


      }
    } catch (error) {
      console.error('Error ensuring Pinecone index:', error);
      throw new Error(`Failed to ensure Pinecone index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upsert vectors to Pinecone
   */
  async upsertVectors(
    companyId: number,
    nodeId: string,
    vectors: UpsertVector[]
  ): Promise<void> {
    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const namespace = this.getNamespace(companyId, nodeId);

      const index = client.index(indexName);


      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize).map(vector => ({
          id: vector.id,
          values: vector.values,
          metadata: vector.metadata as VectorMetadata,
        }));
        await index.namespace(namespace).upsert(batch);
      }


    } catch (error) {
      console.error('Error upserting vectors to Pinecone:', error);
      throw new Error(`Failed to upsert vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async queryVectors(options: VectorSearchOptions): Promise<QueryResult[]>;
  async queryVectors(
    companyId: number,
    nodeId: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold?: number,
    namespaceOverride?: string
  ): Promise<QueryResult[]>;
  async queryVectors(
    companyIdOrOptions: number | VectorSearchOptions,
    nodeId?: string,
    queryEmbedding?: number[],
    topK?: number,
    similarityThreshold: number = DEFAULT_RAG_CONFIG.similarityThreshold,
    namespaceOverride?: string
  ): Promise<QueryResult[]> {
    if (typeof companyIdOrOptions === 'object') {
      return this.queryVectorsFromOptions(companyIdOrOptions);
    }

    return this.queryVectorsFromOptions({
      companyId: companyIdOrOptions,
      nodeId: nodeId!,
      queryEmbedding: queryEmbedding!,
      topK: topK!,
      similarityThreshold,
      namespaceOverride,
    });
  }

  private async queryVectorsFromOptions(options: VectorSearchOptions): Promise<QueryResult[]> {
    const {
      companyId,
      nodeId,
      queryEmbedding,
      topK,
      similarityThreshold = DEFAULT_RAG_CONFIG.similarityThreshold,
      documentIds,
      namespaceOverride,
    } = options;

    const fetchTopK = documentIds && documentIds.length > 0
      ? Math.max(topK * 3, 20)
      : topK;

    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const namespace = namespaceOverride ?? this.getNamespace(companyId, nodeId);

      const index = client.index(indexName);

      const results = await index.namespace(namespace).query({
        vector: queryEmbedding,
        topK: fetchTopK,
        includeMetadata: true,
        includeValues: false,
      });

      let matches = results.matches
        .filter(match => match.score !== undefined)
        .map(match => ({
          id: match.id,
          score: match.score!,
          metadata: match.metadata as VectorMetadata,
        }));

      if (similarityThreshold > 0) {
        matches = matches.filter(match => match.score >= similarityThreshold);
      }

      if (documentIds && documentIds.length > 0) {
        const allowedDocumentIds = new Set(documentIds);
        matches = matches.filter(match => allowedDocumentIds.has(match.metadata.documentId));
      }

      return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('Error querying vectors from Pinecone:', error);
      throw new Error(`Failed to query vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async fetchVectorsByChunkIds(
    companyId: number,
    nodeId: string,
    chunkIds: number[],
    _embeddingModel: string
  ): Promise<Map<number, number[]>> {
    if (chunkIds.length === 0) {
      return new Map();
    }

    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const namespace = this.getNamespace(companyId, nodeId);
      const index = client.index(indexName);
      const ids = chunkIds.map(id => `chunk-${id}`);
      const response = await index.namespace(namespace).fetch(ids);

      const map = new Map<number, number[]>();
      for (const [id, record] of Object.entries(response.records ?? {})) {
        if (!record?.values) {
          continue;
        }
        const match = id.match(/^chunk-(\d+)$/);
        if (match) {
          map.set(parseInt(match[1], 10), record.values);
        }
      }
      return map;
    } catch (error) {
      console.error('Error fetching vectors by chunk IDs from Pinecone:', error);
      return new Map();
    }
  }

  /**
   * Delete vectors by IDs
   */
  async deleteVectors(
    companyId: number,
    nodeId: string,
    vectorIds: string[]
  ): Promise<void> {
    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const namespace = this.getNamespace(companyId, nodeId);

      const index = client.index(indexName);

      await index.namespace(namespace).deleteMany(vectorIds);


    } catch (error) {
      console.error('Error deleting vectors from Pinecone:', error);
      throw new Error(`Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all vectors for a document
   */
  async deleteDocumentVectors(
    companyId: number,
    nodeId: string,
    documentId: number
  ): Promise<void> {
    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const namespace = this.getNamespace(companyId, nodeId);

      const index = client.index(indexName);


      await index.namespace(namespace).deleteMany({
        documentId: { $eq: documentId },
      });


    } catch (error) {
      console.error('Error deleting document vectors from Pinecone:', error);
      throw new Error(`Failed to delete document vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteNodeVectors(companyId: number, nodeId: string): Promise<void> {
    return this.deleteNamespace(companyId, nodeId);
  }

  /**
   * Delete entire namespace (all vectors for a company-node combination)
   */
  async deleteNamespace(companyId: number, nodeId: string): Promise<void> {
    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const namespace = this.getNamespace(companyId, nodeId);

      const index = client.index(indexName);

      await index.namespace(namespace).deleteAll();


    } catch (error) {
      console.error('Error deleting namespace from Pinecone:', error);
      throw new Error(`Failed to delete namespace: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(companyId: number, nodeId: string): Promise<any> {
    try {
      const { client, indexName } = await this.getPineconeClient(companyId, nodeId);
      const index = client.index(indexName);

      const stats = await index.describeIndexStats();
      return stats;
    } catch (error) {
      console.error('Error getting index stats from Pinecone:', error);
      throw new Error(`Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}


export const pineconeService = new PineconeService();
