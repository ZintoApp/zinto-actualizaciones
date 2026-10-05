import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import {
  Plus,
  Trash2,
  Key,
  LogOut,
  Loader2,
  Network,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MCPAuthMode,
  MCPHeader,
  MCPServerConfig,
  MCPTransportType,
} from '@shared/types/mcp';

export function createDefaultServer(): MCPServerConfig {
  return {
    id: nanoid(),
    name: '',
    url: '',
    transport: 'streamable-http',
    authMode: 'none',
    headers: [],
    toolFilter: { mode: 'all', tools: [] },
  };
}

export function mergeServerPatch(
  server: MCPServerConfig,
  patch: Partial<MCPServerConfig>
): MCPServerConfig {
  const { oauth: patchOauth, headers: patchHeaders, ...restPatch } = patch;
  const next: MCPServerConfig = { ...server, ...restPatch };
  if (patchOauth !== undefined) {
    next.oauth = { ...server.oauth, ...patchOauth };
  }
  if (patchHeaders !== undefined) {
    next.headers = patchHeaders;
  }
  return next;
}

export function serializeHeadersForIdentity(h: MCPHeader[] | undefined): string {
  const list = (h ?? []).map((x) => ({ k: x.key.trim(), v: x.value.trim() }));
  list.sort((a, b) => a.k.localeCompare(b.k) || a.v.localeCompare(b.v));
  return JSON.stringify(list);
}

export function serializeOauthForIdentity(o: MCPServerConfig['oauth']): string {
  if (!o) return '';
  return JSON.stringify({
    clientId: (o.clientId ?? '').trim(),
    authorizationUrl: (o.authorizationUrl ?? '').trim(),
    tokenUrl: (o.tokenUrl ?? '').trim(),
    scopes: (o.scopes ?? []).join(' '),
    redirectUri: (o.redirectUri ?? '').trim(),
  });
}

export function didAuthIdentityChange(before: MCPServerConfig, after: MCPServerConfig): boolean {
  return (
    before.url.trim() !== after.url.trim() ||
    before.authMode !== after.authMode ||
    serializeHeadersForIdentity(before.headers) !== serializeHeadersForIdentity(after.headers) ||
    serializeOauthForIdentity(before.oauth) !== serializeOauthForIdentity(after.oauth)
  );
}

function McpOAuthRedirectUriField({
  flowNodeId,
  server,
  t,
  toast,
}: {
  flowNodeId: string;
  server: MCPServerConfig;
  t: (k: string, d?: string, vars?: Record<string, string | number>) => string;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const oauthSig = serializeOauthForIdentity(server.oauth);
  const { data, isLoading } = useQuery({
    queryKey: [
      'mcp-oauth-redirect',
      flowNodeId,
      server.id,
      server.oauth?.redirectUri ?? '',
      oauthSig,
    ],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/mcp/oauth/resolve-redirect', {
        server: { oauth: server.oauth },
      });
      return res.json() as Promise<{ redirectUri: string }>;
    },
    enabled: server.authMode === 'oauth2',
  });
  const redirectUri = data?.redirectUri ?? '';
  const copyRedirectUri = useCallback(() => {
    if (!redirectUri) return;
    void navigator.clipboard.writeText(redirectUri);
    toast({
      title: t('flow_builder.mcp.oauth_redirect_uri', 'Redirect URI'),
      description: redirectUri,
    });
  }, [redirectUri, toast, t]);

  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{t('flow_builder.mcp.oauth_redirect_uri', 'Redirect URI')}</Label>
      <div className="flex gap-1">
        <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.oauth_redirect_uri"
          readOnly
          className="h-8 text-xs flex-1 font-mono"
          value={isLoading ? '…' : redirectUri}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={copyRedirectUri}
          disabled={!redirectUri || isLoading}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function transportLabel(t: (k: string, d?: string) => string, tr: MCPTransportType): string {
  if (tr === 'sse') return t('flow_builder.mcp.transport_sse', 'HTTP + SSE');
  return t('flow_builder.mcp.transport_streamable_http', 'Streamable HTTP');
}

export type MCPServerFormProps = {
  nodeId: string;
  server: MCPServerConfig;
  onChange: (patch: Partial<MCPServerConfig>) => void;
  onRequestRotate?: (oldId: string, newId: string) => void;
  renderExtraActions?: () => React.ReactNode;
};

export function MCPServerForm({
  nodeId,
  server,
  onChange,
  onRequestRotate,
  renderExtraActions,
}: MCPServerFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [headerValueVisible, setHeaderValueVisible] = useState<Record<string, boolean>>({});

  const emitPatch = useCallback(
    (patch: Partial<MCPServerConfig>) => {
      const merged = mergeServerPatch(server, patch);
      if (didAuthIdentityChange(server, merged)) {
        const newId = nanoid();
        onRequestRotate?.(server.id, newId);
        onChange({ ...merged, id: newId, sessionId: undefined });
        return;
      }
      onChange(patch);
    },
    [server, onChange, onRequestRotate]
  );

  const testConnectionMutation = useMutation({
    mutationFn: async ({ srv }: { srv: MCPServerConfig }) => {
      const res = await apiRequest('POST', '/api/mcp/test-connection', { server: srv, nodeId });
      return res.json() as Promise<{ ok?: boolean; serverInfo?: unknown; error?: string }>;
    },
    onSuccess: (body) => {
      const info = body.serverInfo as { name?: string; title?: string } | string | undefined;
      const name =
        typeof info === 'string'
          ? info
          : info?.name ?? info?.title ?? t('flow_builder.node_types.mcp_client_tool', 'MCP Client Tool');
      toast({
        title: t('flow_builder.mcp.test_success_title', 'Connection OK'),
        description: t('flow_builder.mcp.test_success_desc', 'Connected to {{name}}', { name }),
      });
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: t('flow_builder.mcp.test_failed_title', 'Connection failed'),
        description: err.message,
      });
    },
  });

  const oauthStartMutation = useMutation({
    mutationFn: async ({ srv }: { srv: MCPServerConfig }) => {
      const res = await apiRequest('POST', '/api/mcp/oauth/start', { server: srv, nodeId });
      return res.json() as Promise<{ authorizationUrl: string; state: string }>;
    },
    onSuccess: ({ authorizationUrl }) => {
      window.open(authorizationUrl, 'mcp-oauth', 'width=600,height=700');
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: t('flow_builder.mcp.authenticate', 'Authenticate'),
        description: err.message,
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async ({ serverId }: { serverId: string }) => {
      await apiRequest('POST', '/api/mcp/disconnect', { nodeId, serverId });
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-status', nodeId, serverId] });
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: t('flow_builder.mcp.disconnect', 'Disconnect'),
        description: err.message,
      });
    },
  });

  const { data: oauthStatusData } = useQuery({
    queryKey: ['mcp-oauth-status', nodeId, server.id] as const,
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/mcp/oauth/status?nodeId=${encodeURIComponent(nodeId)}&serverId=${encodeURIComponent(server.id)}`
      );
      return res.json() as Promise<{
        connected: boolean;
        expiresAt?: string;
        scope?: string;
      }>;
    },
    enabled: server.authMode === 'oauth2',
  });

  const oauthStatus = useMemo(
    () =>
      oauthStatusData
        ? { connected: oauthStatusData.connected, expiresAt: oauthStatusData.expiresAt, scope: oauthStatusData.scope }
        : { connected: false },
    [oauthStatusData]
  );

  const addHeader = useCallback(() => {
    const headers: MCPHeader[] = [...(server.headers ?? []), { id: nanoid(), key: '', value: '' }];
    emitPatch({ headers });
  }, [server.headers, emitPatch]);

  const removeHeader = useCallback(
    (headerId: string) => {
      emitPatch({ headers: (server.headers ?? []).filter((h) => h.id !== headerId) });
    },
    [server.headers, emitPatch]
  );

  const updateHeader = useCallback(
    (headerId: string, patch: Partial<MCPHeader>) => {
      emitPatch({
        headers: (server.headers ?? []).map((h) => (h.id === headerId ? { ...h, ...patch } : h)),
      });
    },
    [server.headers, emitPatch]
  );

  return (
    <>
      <div className="space-y-1">
        <Label className="text-[10px]">{t('flow_builder.mcp.server_name', 'Server name')}</Label>
        <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.server_name"
          className="h-8 text-xs"
          value={server.name}
          onChange={(e) => emitPatch({ name: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">{t('flow_builder.mcp.server_url', 'Server URL')}</Label>
        <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.server_name"
          type="url"
          className="h-8 text-xs"
          value={server.url}
          onChange={(e) => emitPatch({ url: e.target.value })}
          placeholder="https://"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">{t('flow_builder.mcp.transport', 'Transport')}</Label>
          <Select
            value={server.transport}
            onValueChange={(v: MCPTransportType) => emitPatch({ transport: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="streamable-http">
                {t('flow_builder.mcp.transport_streamable_http', 'Streamable HTTP')}
              </SelectItem>
              <SelectItem value="sse">{t('flow_builder.mcp.transport_sse', 'HTTP + SSE')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">{t('flow_builder.mcp.auth_mode', 'Authentication')}</Label>
          <Select
            value={server.authMode}
            onValueChange={(v: MCPAuthMode) => emitPatch({ authMode: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('flow_builder.mcp.auth_none', 'None')}</SelectItem>
              <SelectItem value="headers">{t('flow_builder.mcp.auth_headers', 'Static headers')}</SelectItem>
              <SelectItem value="oauth2">{t('flow_builder.mcp.auth_oauth2', 'OAuth 2.0')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {server.authMode === 'headers' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px]">{t('flow_builder.mcp.headers_title', 'HTTP headers')}</Label>
            <Button data-tour="components-flow-builder-mcp-mcpserverform.button.flow_builder.mcp.add_header" type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={addHeader}>
              <Plus className="h-3 w-3 mr-1" />
              {t('flow_builder.mcp.add_header', 'Add header')}
            </Button>
          </div>
          {(server.headers ?? []).map((h) => {
            const visKey = `${server.id}:${h.id}`;
            const hidden = !headerValueVisible[visKey];
            return (
              <div key={h.id} className="flex gap-1 items-start">
                <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.header_key"
                  className="h-8 text-xs flex-1"
                  placeholder={t('flow_builder.mcp.header_key', 'Header name')}
                  value={h.key}
                  onChange={(e) => updateHeader(h.id, { key: e.target.value })}
                />
                <div className="flex-1 flex gap-1">
                  <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.header_value"
                    className="h-8 text-xs flex-1"
                    type={hidden ? 'password' : 'text'}
                    placeholder={t('flow_builder.mcp.header_value', 'Header value')}
                    value={h.value}
                    onChange={(e) => updateHeader(h.id, { value: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setHeaderValueVisible((prev) => ({ ...prev, [visKey]: !prev[visKey] }))
                    }
                  >
                    {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeHeader(h.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {server.authMode === 'oauth2' && (
        <div className="space-y-2 rounded-md border p-2 bg-background/50">
          <div className="space-y-1">
            <Label className="text-[10px]">{t('flow_builder.mcp.oauth_client_id', 'Client ID')}</Label>
            <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.oauth_client_id"
              className="h-8 text-xs"
              value={server.oauth?.clientId ?? ''}
              onChange={(e) =>
                emitPatch({
                  oauth: { ...server.oauth, clientId: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{t('flow_builder.mcp.oauth_authorization_url', 'Authorization URL')}</Label>
            <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.oauth_client_id"
              type="url"
              className="h-8 text-xs"
              value={server.oauth?.authorizationUrl ?? ''}
              onChange={(e) =>
                emitPatch({
                  oauth: { ...server.oauth, authorizationUrl: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{t('flow_builder.mcp.oauth_token_url', 'Token URL')}</Label>
            <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.oauth_client_id"
              type="url"
              className="h-8 text-xs"
              value={server.oauth?.tokenUrl ?? ''}
              onChange={(e) =>
                emitPatch({
                  oauth: { ...server.oauth, tokenUrl: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{t('flow_builder.mcp.oauth_scopes', 'Scopes (comma-separated)')}</Label>
            <Input data-tour="components-flow-builder-mcp-mcpserverform.input.flow_builder.mcp.oauth_client_id"
              className="h-8 text-xs"
              value={(server.oauth?.scopes ?? []).join(', ')}
              onChange={(e) => {
                const parts = e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean);
                emitPatch({
                  oauth: { ...server.oauth, scopes: parts },
                });
              }}
            />
          </div>
          <McpOAuthRedirectUriField flowNodeId={nodeId} server={server} t={t} toast={toast} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button data-tour="components-flow-builder-mcp-mcpserverform.button.flow_builder.mcp.authenticate"
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={() => oauthStartMutation.mutate({ srv: server })}
              disabled={oauthStartMutation.isPending}
            >
              {oauthStartMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Key className="h-3.5 w-3.5 mr-1" />
              )}
              {t('flow_builder.mcp.authenticate', 'Authenticate')}
            </Button>
            {oauthStatus?.connected && (
              <Button data-tour="components-flow-builder-mcp-mcpserverform.button.flow_builder.mcp.disconnect"
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => disconnectMutation.mutate({ serverId: server.id })}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <LogOut className="h-3.5 w-3.5 mr-1" />
                )}
                {t('flow_builder.mcp.disconnect', 'Disconnect')}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button data-tour="components-flow-builder-mcp-mcpserverform.button.flow_builder.mcp.test_connection"
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs"
          onClick={() => testConnectionMutation.mutate({ srv: server })}
          disabled={testConnectionMutation.isPending}
        >
          {testConnectionMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Network className="h-3.5 w-3.5 mr-1" />
          )}
          {t('flow_builder.mcp.test_connection', 'Test connection')}
        </Button>
        {renderExtraActions?.()}
      </div>
    </>
  );
}
