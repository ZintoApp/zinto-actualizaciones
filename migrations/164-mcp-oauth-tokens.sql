-- Migration: Add MCP OAuth tokens table
-- Stores OAuth tokens for MCP Client Tool node servers (per company, flow node, and MCP server config id).

-- Create mcp_oauth_tokens table
CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_company_node_server ON mcp_oauth_tokens(company_id, node_id, server_id);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_company ON mcp_oauth_tokens(company_id);

COMMENT ON TABLE mcp_oauth_tokens IS 'OAuth tokens for MCP servers bound to flow MCP Client Tool nodes (per company, node, and server id)';
COMMENT ON COLUMN mcp_oauth_tokens.company_id IS 'Company that owns the flow containing the MCP node';
COMMENT ON COLUMN mcp_oauth_tokens.node_id IS 'Flow canvas node id (MCPClientToolNode) referencing flows.nodes JSON';
COMMENT ON COLUMN mcp_oauth_tokens.server_id IS 'MCPServerConfig.id for the MCP server definition';
COMMENT ON COLUMN mcp_oauth_tokens.access_token IS 'OAuth access token for MCP HTTP transport';
COMMENT ON COLUMN mcp_oauth_tokens.refresh_token IS 'OAuth refresh token when issued by the provider';
COMMENT ON COLUMN mcp_oauth_tokens.token_type IS 'Token type, typically Bearer';
COMMENT ON COLUMN mcp_oauth_tokens.scope IS 'Granted OAuth scopes (space-separated or provider-specific)';
COMMENT ON COLUMN mcp_oauth_tokens.expires_at IS 'Access token expiry; null if non-expiring or unknown';
COMMENT ON COLUMN mcp_oauth_tokens.created_at IS 'Row creation time';
COMMENT ON COLUMN mcp_oauth_tokens.updated_at IS 'Last token update time';
