-- Migration: Update knowledge_base_configs RAG context template v4
-- Description: Adds closing grounding reminder to the strict KB-only context template

ALTER TABLE knowledge_base_configs
  ALTER COLUMN context_template SET DEFAULT 'Use only the information provided in the knowledge base context below as the sole source of truth.

If the answer is not explicitly supported by the context, state that it is not available in the provided knowledge base.

Do not use prior knowledge, assumptions, or external reasoning beyond what is present in the context.

Do not infer missing details, even if they seem likely or commonly known.

Only combine chunks when they explicitly contain complementary information about the same topic. Do not introduce new relationships between chunks that are not directly stated.

{context}

Answer rules:

Prefer direct extraction or tight paraphrasing from context
If multiple chunks conflict, do not resolve the conflict; report inconsistency
Never add examples, explanations, or extensions that are not present in the context.

Make sure to provide strictly grounded answers based on the KB only. Do not over-engineer or introduce assumptions. Keep responses as precise and accurate as possible.';

-- Backfill rows still using the v3 default (without the closing grounding reminder)
UPDATE knowledge_base_configs
SET context_template = 'Use only the information provided in the knowledge base context below as the sole source of truth.

If the answer is not explicitly supported by the context, state that it is not available in the provided knowledge base.

Do not use prior knowledge, assumptions, or external reasoning beyond what is present in the context.

Do not infer missing details, even if they seem likely or commonly known.

Only combine chunks when they explicitly contain complementary information about the same topic. Do not introduce new relationships between chunks that are not directly stated.

{context}

Answer rules:

Prefer direct extraction or tight paraphrasing from context
If multiple chunks conflict, do not resolve the conflict; report inconsistency
Never add examples, explanations, or extensions that are not present in the context.

Make sure to provide strictly grounded answers based on the KB only. Do not over-engineer or introduce assumptions. Keep responses as precise and accurate as possible.'
WHERE context_template LIKE 'Use only the information provided in the knowledge base context below as the sole source of truth.%'
  AND context_template NOT LIKE '%Make sure to provide strictly grounded answers based on the KB only.%';
