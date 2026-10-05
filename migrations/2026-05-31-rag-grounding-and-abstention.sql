-- Migration: RAG grounding template v5, citation requirements, and answer validation flag
-- Description: Updates default context template for [S#] citation grounding and abstention;
--              backfills rows still on previous default templates; adds answer_validation_enabled.

ALTER TABLE knowledge_base_configs
  ALTER COLUMN context_template SET DEFAULT 'The knowledge base context below is the sole source of truth for answering this question.

Base your answer only on what is explicitly stated in the context. When you cite information, reference the bracketed source tags [S#] shown alongside each chunk.

Do not use prior knowledge, assumptions, or information from outside this context. Do not infer or fill in details that are not directly supported by the context.

If the context does not contain the information needed to answer the question, say clearly that you could not find that information in the knowledge base — do not invent an answer.

Only combine chunks when they explicitly contain complementary information about the same topic. Do not introduce new relationships between chunks that are not directly stated.

{context}

Answer guidelines:

Be natural and concise; write like a helpful human, not a rigid policy bot
Support factual claims with the relevant [S#] citations from the context
Prefer direct extraction or tight paraphrasing from the context
If multiple chunks conflict, do not resolve the conflict; report the inconsistency
Never add examples, explanations, or extensions that are not present in the context';

-- Backfill rows still using any previous default template (v3/v4 prefix)
UPDATE knowledge_base_configs
SET context_template = 'The knowledge base context below is the sole source of truth for answering this question.

Base your answer only on what is explicitly stated in the context. When you cite information, reference the bracketed source tags [S#] shown alongside each chunk.

Do not use prior knowledge, assumptions, or information from outside this context. Do not infer or fill in details that are not directly supported by the context.

If the context does not contain the information needed to answer the question, say clearly that you could not find that information in the knowledge base — do not invent an answer.

Only combine chunks when they explicitly contain complementary information about the same topic. Do not introduce new relationships between chunks that are not directly stated.

{context}

Answer guidelines:

Be natural and concise; write like a helpful human, not a rigid policy bot
Support factual claims with the relevant [S#] citations from the context
Prefer direct extraction or tight paraphrasing from the context
If multiple chunks conflict, do not resolve the conflict; report the inconsistency
Never add examples, explanations, or extensions that are not present in the context'
WHERE context_template LIKE 'Use only the information provided in the knowledge base context below as the sole source of truth.%';

ALTER TABLE knowledge_base_configs
  ADD COLUMN IF NOT EXISTS answer_validation_enabled BOOLEAN NOT NULL DEFAULT FALSE;
