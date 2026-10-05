import pgvector from 'pgvector';
import { pool } from '../db';
import { clampHnswEfSearch, DEFAULT_EMBEDDING_MODEL } from '../../shared/rag-defaults';
import type {
  VectorSearchMatch,
  VectorSearchOptions,
  VectorStore,
  VectorStoreRecord,
} from './vector-store';

/**
 * PgVector Service
 * Handles vector storage and retrieval using PostgreSQL pgvector
 */
export class PgVectorService implements VectorStore {
  async ensureStorage(_companyId: number, _nodeId: string): Promise<void> {
    const client = await pool.connect();
    try {
      const extensionResult = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists`
      );
      if (!extensionResult.rows[0]?.exists) {
        throw new Error(
          'pgvector extension is not enabled. Run the pgvector foundation migration to enable the vector extension.'
        );
      }

      const tableResult = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'knowledge_base_vectors'
        ) AS exists`
      );
      if (!tableResult.rows[0]?.exists) {
        throw new Error(
          'knowledge_base_vectors table does not exist. Run the pgvector foundation migration to create it.'
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('pgvector')) {
        throw error;
      }
      console.error('Error ensuring pgvector storage:', error);
      throw new Error(
        `Failed to ensure pgvector storage: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async upsertVectors(
    companyId: number,
    nodeId: string,
    vectors: VectorStoreRecord[]
  ): Promise<void> {
    if (vectors.length === 0) {
      return;
    }

    const BATCH_SIZE = 100;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let offset = 0; offset < vectors.length; offset += BATCH_SIZE) {
        const batch = vectors.slice(offset, offset + BATCH_SIZE);
        const valuesClauses: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        for (const vector of batch) {
          const embeddingModel = vector.embeddingModel || DEFAULT_EMBEDDING_MODEL;
          const metadata = {
            ...vector.metadata,
            nodeId,
          };

          valuesClauses.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}::vector, $${paramIndex + 6}::jsonb, NOW())`
          );
          params.push(
            companyId,
            metadata.documentId,
            metadata.chunkId,
            nodeId,
            embeddingModel,
            pgvector.toSql(vector.values),
            JSON.stringify(metadata)
          );
          paramIndex += 7;
        }

        await client.query(
          `INSERT INTO knowledge_base_vectors (
            company_id, document_id, chunk_id, node_id, embedding_model, embedding, metadata, updated_at
          ) VALUES ${valuesClauses.join(', ')}
          ON CONFLICT (company_id, node_id, chunk_id, embedding_model)
          DO UPDATE SET
            document_id = EXCLUDED.document_id,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
          params
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error upserting vectors to pgvector:', error);
      throw new Error(
        `Failed to upsert vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async queryVectors(options: VectorSearchOptions): Promise<VectorSearchMatch[]> {
    const {
      companyId,
      nodeId,
      queryEmbedding,
      topK,
      similarityThreshold = 0,
      documentIds,
      embeddingModel = DEFAULT_EMBEDDING_MODEL,
      efSearch,
    } = options;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (efSearch !== undefined) {
        const sanitizedEfSearch = clampHnswEfSearch(efSearch);
        await client.query(`SET LOCAL hnsw.ef_search = ${sanitizedEfSearch}`);
      }

      const queryVector = pgvector.toSql(queryEmbedding);
      const params: unknown[] = [
        companyId,
        nodeId,
        embeddingModel,
        queryVector,
        similarityThreshold,
        topK,
      ];

      let documentFilter = '';
      if (documentIds && documentIds.length > 0) {
        params.push(documentIds);
        documentFilter = `AND document_id = ANY($${params.length}::int[])`;
      }

      const result = await client.query<{
        chunk_id: number;
        metadata: VectorSearchMatch['metadata'];
        similarity: number;
      }>(
        `SELECT
          chunk_id,
          metadata,
          1 - (embedding <=> $4::vector) AS similarity
        FROM knowledge_base_vectors
        WHERE company_id = $1
          AND node_id = $2
          AND embedding_model = $3
          ${documentFilter}
          AND (1 - (embedding <=> $4::vector)) >= $5
        ORDER BY embedding <=> $4::vector
        LIMIT $6`,
        params
      );

      await client.query('COMMIT');

      return result.rows.map(row => ({
        id: `chunk-${row.chunk_id}`,
        score: row.similarity,
        metadata: row.metadata,
      }));
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      console.error('Error querying vectors from pgvector:', error);
      throw new Error(
        `Failed to query vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async fetchVectorsByChunkIds(
    companyId: number,
    nodeId: string,
    chunkIds: number[],
    embeddingModel: string
  ): Promise<Map<number, number[]>> {
    if (chunkIds.length === 0) {
      return new Map();
    }

    const client = await pool.connect();
    try {
      const result = await client.query<{ chunk_id: number; embedding: unknown }>(
        `SELECT chunk_id, embedding
         FROM knowledge_base_vectors
         WHERE company_id = $1
           AND node_id = $2
           AND embedding_model = $3
           AND chunk_id = ANY($4::int[])`,
        [companyId, nodeId, embeddingModel, chunkIds]
      );

      const map = new Map<number, number[]>();
      for (const row of result.rows) {
        let embedding: number[];
        if (typeof row.embedding === 'string') {
          embedding = pgvector.fromSql(row.embedding);
        } else if (Array.isArray(row.embedding)) {
          embedding = row.embedding as number[];
        } else {
          continue;
        }
        map.set(row.chunk_id, embedding);
      }
      return map;
    } catch (error) {
      console.error('Error fetching vectors by chunk IDs from pgvector:', error);
      return new Map();
    } finally {
      client.release();
    }
  }

  async deleteVectors(
    companyId: number,
    nodeId: string,
    vectorIds: string[]
  ): Promise<void> {
    if (vectorIds.length === 0) {
      return;
    }

    const chunkIds = vectorIds
      .map(id => {
        const match = id.match(/^chunk-(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((id): id is number => id !== null);

    if (chunkIds.length === 0) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM knowledge_base_vectors
         WHERE company_id = $1 AND node_id = $2 AND chunk_id = ANY($3::int[])`,
        [companyId, nodeId, chunkIds]
      );
    } catch (error) {
      console.error('Error deleting vectors from pgvector:', error);
      throw new Error(
        `Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async deleteDocumentVectors(
    companyId: number,
    nodeId: string,
    documentId: number
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM knowledge_base_vectors
         WHERE company_id = $1 AND node_id = $2 AND document_id = $3`,
        [companyId, nodeId, documentId]
      );
    } catch (error) {
      console.error('Error deleting document vectors from pgvector:', error);
      throw new Error(
        `Failed to delete document vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async deleteDocumentVectorsForCompany(
    companyId: number,
    documentId: number
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM knowledge_base_vectors
         WHERE company_id = $1 AND document_id = $2`,
        [companyId, documentId]
      );
    } catch (error) {
      console.error('Error deleting document vectors from pgvector by company/document:', error);
      throw new Error(
        `Failed to delete document vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }

  async deleteNodeVectors(companyId: number, nodeId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM knowledge_base_vectors
         WHERE company_id = $1 AND node_id = $2`,
        [companyId, nodeId]
      );
    } catch (error) {
      console.error('Error deleting node vectors from pgvector:', error);
      throw new Error(
        `Failed to delete node vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      client.release();
    }
  }
}

export const pgVectorService = new PgVectorService();
