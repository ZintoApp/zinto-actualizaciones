-- Remove deprecated MCP fields from seeded flow_templates so ai_assistant nodes no longer
-- persist enableMCPServers / mcpServers (MCP support was removed from the product).

UPDATE flow_templates ft
SET
  nodes = COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN elem->>'type' = 'ai_assistant' AND elem ? 'data' THEN
            jsonb_set(
              elem,
              '{data}',
              (elem->'data') - 'enableMCPServers' - 'mcpServers'
            )
          ELSE elem
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(ft.nodes) WITH ORDINALITY AS t(elem, ord)
    ),
    '[]'::jsonb
  ),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(ft.nodes) elem
  WHERE elem->>'type' = 'ai_assistant'
    AND elem ? 'data'
    AND (
      elem->'data' ? 'enableMCPServers'
      OR elem->'data' ? 'mcpServers'
    )
);
