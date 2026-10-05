import { pool } from '../db';

export interface LexicalSearchParams {
  companyId: number;
  documentIds: number[];
  query: string;
  topK: number;
}

export interface LexicalSearchMatch {
  chunkId: number;
  score: number;
}

/**
 * Postgres full-text search over knowledge_base_chunks.content_tsv.
 * Runs regardless of dense vector backend (Pinecone or pgvector).
 */
export async function lexicalSearchChunks(params: LexicalSearchParams): Promise<LexicalSearchMatch[]> {
  const { companyId, documentIds, query, topK } = params;

  if (!query.trim() || documentIds.length === 0) {
    return [];
  }

  try {
    const result = await pool.query<{ chunk_id: number; score: number }>(
      `SELECT kb_chunks.id AS chunk_id,
              ts_rank_cd(kb_chunks.content_tsv, tsquery) AS score
       FROM knowledge_base_chunks kb_chunks
       INNER JOIN knowledge_base_documents kb_docs
         ON kb_chunks.document_id = kb_docs.id,
       websearch_to_tsquery('simple', $3) AS tsquery
       WHERE kb_docs.company_id = $1
         AND kb_chunks.document_id = ANY($2::int[])
         AND kb_chunks.content_tsv @@ tsquery
       ORDER BY score DESC
       LIMIT $4`,
      [companyId, documentIds, query, topK]
    );

    return result.rows.map(row => ({
      chunkId: row.chunk_id,
      score: row.score,
    }));
  } catch (error) {
    console.error('[Lexical Search] Failed to search chunks:', error);
    return [];
  }
}
