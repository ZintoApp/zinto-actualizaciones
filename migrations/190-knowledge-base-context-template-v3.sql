-- Migration: Update knowledge_base_configs to stricter RAG context template v3
-- Description: Ground answers solely in retrieved KB context; report gaps and conflicts

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
Never add examples, explanations, or extensions that are not present in the context';

-- Backfill rows still using previous default templates
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
Never add examples, explanations, or extensions that are not present in the context'
WHERE context_template LIKE 'You must answer ONLY using the provided context.%'
   OR context_template LIKE 'IMPORTANT: You have access to the following knowledge base information:%'
   OR context_template LIKE 'Based on the following knowledge base information:%';
