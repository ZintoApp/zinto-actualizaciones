import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import {
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Loader2,
  ChevronUp,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { mcpToolOutputHandleStyle } from './StyledHandle';
import type {
  MCPServerConfig,
  MCPToolDescriptor,
  MCPToolDiscoverySummary,
  MCPToolFilterMode,
} from '@shared/types/mcp';
import { applyMcpToolFilter } from '@shared/mcp-tool-filter';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MCPServerForm,
  createDefaultServer,
  mergeServerPatch,
  didAuthIdentityChange,
  transportLabel,
} from './mcp/MCPServerForm';

export function MCPClientToolNode({ data, isConnectable, id }: any) {
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const { setNodes } = useReactFlow();
  const { onDeleteNode } = useFlowContext();
  const { t } = useTranslation();
  const { toast } = useToast();
  const updateNodeInternals = useUpdateNodeInternals();
  const queryClient = useQueryClient();

  const didInitRef = useRef(false);

  const [servers, setServers] = useState<MCPServerConfig[]>(() =>
    Array.isArray(data?.servers) && data.servers.length > 0 ? data.servers : [createDefaultServer()]
  );

  const [toolsByServerId, setToolsByServerId] = useState<Record<string, MCPToolDescriptor[]>>({});
  const [toolsLoadingByServerId, setToolsLoadingByServerId] = useState<Record<string, boolean>>({});
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (Array.isArray(data?.servers) && data.servers.length > 0) {
      setServers(data.servers);
    }
  }, [data?.servers]);

  const persistDiscoveryPatch = useCallback(
    (patch: Record<string, MCPToolDiscoverySummary>) => {
      if (Object.keys(patch).length === 0) return;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  mcpToolDiscoveryByServerId: {
                    ...((node.data as { mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary> })
                      .mcpToolDiscoveryByServerId ?? {}),
                    ...patch,
                  },
                },
              }
            : node
        )
      );
    },
    [id, setNodes]
  );

  const persistServers = useCallback(
    (next: MCPServerConfig[]) => {
      setServers(next);
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  servers: next,
                },
              }
            : node
        )
      );
    },
    [id, setNodes]
  );

  /** Keeps connected MCP Execute Tool nodes pointing at the server after its id is rotated. */
  const persistServersAndPropagateRotation = useCallback(
    (next: MCPServerConfig[], rotation: { oldId: string; newId: string }) => {
      setServers(next);
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            const prevDisc = (node.data as { mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary> })
              .mcpToolDiscoveryByServerId;
            let mcpToolDiscoveryByServerId = prevDisc;
            if (prevDisc?.[rotation.oldId]) {
              mcpToolDiscoveryByServerId = { ...prevDisc };
              mcpToolDiscoveryByServerId[rotation.newId] = prevDisc[rotation.oldId];
              delete mcpToolDiscoveryByServerId[rotation.oldId];
            }
            return {
              ...node,
              data: {
                ...node.data,
                servers: next,
                ...(mcpToolDiscoveryByServerId !== prevDisc
                  ? { mcpToolDiscoveryByServerId }
                  : {}),
              },
            };
          }
          if (node.type === 'mcp_execute_tool') {
            const d = node.data as { sourceMcpClientNodeId?: string; sourceServerId?: string };
            if (d.sourceMcpClientNodeId === id && d.sourceServerId === rotation.oldId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  sourceServerId: rotation.newId,
                },
              };
            }
          }
          return node;
        })
      );
    },
    [id, setNodes]
  );

  const listToolsMutation = useMutation({
    mutationFn: async ({ server }: { server: MCPServerConfig }) => {
      const res = await apiRequest('POST', '/api/mcp/list-tools', { server, nodeId: id });
      return res.json() as Promise<{
        tools?: MCPToolDescriptor[];
        rawToolCount?: number;
        filterExposedCount?: number;
        exportableToolCount?: number;
      }>;
    },
    onMutate: ({ server }) => {
      setToolsLoadingByServerId((m) => ({ ...m, [server.id]: true }));
    },
    onSuccess: (body, { server }) => {
      const raw = body.tools ?? [];
      setToolsByServerId((prev) => ({ ...prev, [server.id]: raw }));
      const exposed = applyMcpToolFilter(raw, server.toolFilter);
      const rawToolCount = body.rawToolCount ?? raw.length;
      const filterExposedCount = body.filterExposedCount ?? exposed.length;
      const exportableToolCount = body.exportableToolCount ?? filterExposedCount;
      persistDiscoveryPatch({
        [server.id]: {
          lastRefreshAt: new Date().toISOString(),
          lastRefreshStatus: 'ok',
          lastErrorMessage: undefined,
          rawToolCountAtRefresh: rawToolCount,
          exposedToolCountAtRefresh: filterExposedCount,
          exportableToolCountAtRefresh: exportableToolCount,
        },
      });
    },
    onError: (err: Error, { server }) => {
      persistDiscoveryPatch({
        [server.id]: {
          lastRefreshAt: new Date().toISOString(),
          lastRefreshStatus: 'error',
          lastErrorMessage: err.message,
          rawToolCountAtRefresh: 0,
          exposedToolCountAtRefresh: 0,
          exportableToolCountAtRefresh: 0,
        },
      });
      toast({
        variant: 'destructive',
        title: t('flow_builder.mcp.refresh_tools', 'Refresh tools'),
        description: err.message,
      });
    },
    onSettled: (_, __, { server }) => {
      setToolsLoadingByServerId((m) => ({ ...m, [server.id]: false }));
    },
  });

  const oauthStatusQueries = useQueries({
    queries: servers.map((s) => ({
      queryKey: ['mcp-oauth-status', id, s.id] as const,
      queryFn: async () => {
        const res = await apiRequest(
          'GET',
          `/api/mcp/oauth/status?nodeId=${encodeURIComponent(id)}&serverId=${encodeURIComponent(s.id)}`
        );
        return res.json() as Promise<{
          connected: boolean;
          expiresAt?: string;
          scope?: string;
        }>;
      },
      enabled: s.authMode === 'oauth2',
    })),
  });

  const connectionStatusByServerId = useMemo(() => {
    const m: Record<string, { connected: boolean; expiresAt?: string; scope?: string }> = {};
    servers.forEach((s, i) => {
      if (s.authMode !== 'oauth2') return;
      const d = oauthStatusQueries[i]?.data;
      m[s.id] = d
        ? { connected: d.connected, expiresAt: d.expiresAt, scope: d.scope }
        : { connected: false };
    });
    return m;
  }, [servers, oauthStatusQueries]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d?.type !== 'mcp-oauth-complete') return;
      const sid = d.serverId as string | undefined;
      if (sid) {
        queryClient.invalidateQueries({ queryKey: ['mcp-oauth-status', id, sid] });
      }
      if (d.ok) {
        toast({
          title: t('flow_builder.mcp.test_success_title', 'Connection OK'),
          description: t('flow_builder.mcp.connected', 'Connected'),
        });
      } else if (d.error) {
        toast({
          variant: 'destructive',
          title: t('flow_builder.mcp.test_failed_title', 'Connection failed'),
          description: String(d.error),
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [id, queryClient, toast, t]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [servers.length, isEditing, id, updateNodeInternals]);

  useEffect(() => {
    const prev =
      (data as { mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary> })
        .mcpToolDiscoveryByServerId ?? {};
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const patch: Record<string, MCPToolDiscoverySummary> = {};
        for (const s of servers) {
          const list = toolsByServerId[s.id];
          const disc = prev[s.id];
          if (!disc || disc.lastRefreshStatus !== 'ok' || !list?.length) continue;
          try {
            const res = await apiRequest('POST', '/api/mcp/count-exportable', {
              server: s,
              tools: list,
              nodeId: id,
            });
            const body = (await res.json()) as {
              filterExposedCount?: number;
              exportableToolCount?: number;
            };
            const filterExposed = body.filterExposedCount ?? applyMcpToolFilter(list, s.toolFilter).length;
            const exportable = body.exportableToolCount ?? disc.exportableToolCountAtRefresh ?? 0;
            if (
              disc.exposedToolCountAtRefresh !== filterExposed ||
              disc.exportableToolCountAtRefresh !== exportable
            ) {
              patch[s.id] = {
                ...disc,
                exposedToolCountAtRefresh: filterExposed,
                exportableToolCountAtRefresh: exportable,
              };
            }
          } catch {
            const exposedOnly = applyMcpToolFilter(list, s.toolFilter).length;
            if (disc.exposedToolCountAtRefresh !== exposedOnly) {
              patch[s.id] = { ...disc, exposedToolCountAtRefresh: exposedOnly };
            }
          }
        }
        if (!cancelled && Object.keys(patch).length > 0) {
          persistDiscoveryPatch(patch);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [servers, toolsByServerId, data, persistDiscoveryPatch, id]);

  const addServer = useCallback(() => {
    const next = [...servers, createDefaultServer()];
    persistServers(next);
    setExpandedServerId(next[next.length - 1].id);
  }, [servers, persistServers]);

  const handleRequestRotate = useCallback(
    (oldId: string, _newId: string) => {
      queryClient.removeQueries({ queryKey: ['mcp-oauth-status', id, oldId] });
      queryClient.removeQueries({ queryKey: ['mcp-oauth-redirect', id, oldId] });
      setToolsByServerId((m) => {
        const n = { ...m };
        delete n[oldId];
        return n;
      });
      setToolsLoadingByServerId((m) => {
        const n = { ...m };
        delete n[oldId];
        return n;
      });
      if (expandedServerId === oldId) {
        setExpandedServerId(_newId);
      }
    },
    [id, queryClient, expandedServerId]
  );

  const commitServerPatch = useCallback(
    async (serverId: string, patch: Partial<MCPServerConfig>) => {
      const before = servers.find((s) => s.id === serverId);
      if (!before) return;
      const merged = mergeServerPatch(before, patch);

      if (merged.id !== before.id) {
        try {
          await apiRequest('POST', '/api/mcp/disconnect', { nodeId: id, serverId: before.id });
        } catch {
          // No stored token or already cleared
        }
        const next = servers.map((s) => (s.id === before.id ? merged : s));
        persistServersAndPropagateRotation(next, { oldId: before.id, newId: merged.id });
        return;
      }

      if (!didAuthIdentityChange(before, merged)) {
        persistServers(servers.map((s) => (s.id === serverId ? merged : s)));
        return;
      }
      const oldId = serverId;
      try {
        await apiRequest('POST', '/api/mcp/disconnect', { nodeId: id, serverId: oldId });
      } catch {
        // No stored token or already cleared
      }
      queryClient.removeQueries({ queryKey: ['mcp-oauth-status', id, oldId] });
      queryClient.removeQueries({ queryKey: ['mcp-oauth-redirect', id, oldId] });
      const newId = nanoid();
      const replacement: MCPServerConfig = { ...merged, id: newId, sessionId: undefined };
      const next = servers.map((s) => (s.id === oldId ? replacement : s));
      setToolsByServerId((m) => {
        const n = { ...m };
        delete n[oldId];
        return n;
      });
      setToolsLoadingByServerId((m) => {
        const n = { ...m };
        delete n[oldId];
        return n;
      });
      if (expandedServerId === oldId) {
        setExpandedServerId(newId);
      }
      persistServersAndPropagateRotation(next, { oldId, newId });
    },
    [servers, persistServers, persistServersAndPropagateRotation, id, queryClient, expandedServerId]
  );

  const updateServer = useCallback(
    (serverId: string, patch: Partial<MCPServerConfig>) => {
      void commitServerPatch(serverId, patch);
    },
    [commitServerPatch]
  );

  const moveServer = useCallback(
    (serverId: string, direction: 'up' | 'down') => {
      const idx = servers.findIndex((s) => s.id === serverId);
      if (idx < 0) return;
      const j = direction === 'up' ? idx - 1 : idx + 1;
      if (j < 0 || j >= servers.length) return;
      const next = [...servers];
      [next[idx], next[j]] = [next[j], next[idx]];
      persistServers(next);
    },
    [servers, persistServers]
  );

  const disconnectMutation = useMutation({
    mutationFn: async ({ serverId }: { serverId: string }) => {
      await apiRequest('POST', '/api/mcp/disconnect', { nodeId: id, serverId });
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-status', id, serverId] });
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: t('flow_builder.mcp.disconnect', 'Disconnect'),
        description: err.message,
      });
    },
  });

  const removeServer = useCallback(
    (serverId: string) => {
      const st = connectionStatusByServerId[serverId];
      if (st?.connected) {
        disconnectMutation.mutate({ serverId });
      }
      setToolsByServerId((m) => {
        const n = { ...m };
        delete n[serverId];
        return n;
      });
      setToolsLoadingByServerId((m) => {
        const n = { ...m };
        delete n[serverId];
        return n;
      });
      const next = servers.filter((s) => s.id !== serverId);
      const finalServers = next.length > 0 ? next : [createDefaultServer()];
      setServers(finalServers);
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          const disc = {
            ...((node.data as { mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary> })
              .mcpToolDiscoveryByServerId ?? {}),
          };
          delete disc[serverId];
          return {
            ...node,
            data: {
              ...node.data,
              servers: finalServers,
              mcpToolDiscoveryByServerId: disc,
            },
          };
        })
      );
      if (expandedServerId === serverId) setExpandedServerId(null);
    },
    [
      servers,
      id,
      setNodes,
      expandedServerId,
      connectionStatusByServerId,
      disconnectMutation,
    ]
  );

  const setToolFilterMode = useCallback(
    (serverId: string, mode: MCPToolFilterMode) => {
      const s = servers.find((x) => x.id === serverId);
      if (!s) return;
      updateServer(serverId, {
        toolFilter: { mode, tools: s.toolFilter?.tools ?? [] },
      });
    },
    [servers, updateServer]
  );

  const toggleToolInFilter = useCallback(
    (serverId: string, toolName: string) => {
      const s = servers.find((x) => x.id === serverId);
      if (!s) return;
      const mode = s.toolFilter?.mode ?? 'all';
      if (mode === 'all') return;
      const tools = new Set(s.toolFilter?.tools ?? []);
      if (tools.has(toolName)) tools.delete(toolName);
      else tools.add(toolName);
      updateServer(serverId, {
        toolFilter: { mode, tools: [...tools] },
      });
    },
    [servers, updateServer]
  );

  const distinctTransports = useMemo(() => {
    const set = new Set(servers.map((s) => s.transport));
    return [...set];
  }, [servers]);

  const renderServerCard = (server: MCPServerConfig, serverIndex: number) => {
    const open = expandedServerId === server.id;
    const tools = toolsByServerId[server.id] ?? [];
    const toolsLoading = toolsLoadingByServerId[server.id];
    const oauthStatus = connectionStatusByServerId[server.id];
    const filterMode = server.toolFilter?.mode ?? 'all';
    const selectedTools = new Set(server.toolFilter?.tools ?? []);
    const discovery = (
      data as { mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary> }
    ).mcpToolDiscoveryByServerId?.[server.id];
    const exposedForFilter = applyMcpToolFilter(tools, server.toolFilter).length;
    const exportableForDisc =
      discovery?.exportableToolCountAtRefresh !== undefined
        ? discovery.exportableToolCountAtRefresh
        : discovery?.exposedToolCountAtRefresh ?? 0;
    const showZeroCallableWarning =
      discovery?.lastRefreshStatus === 'ok' &&
      !toolsLoading &&
      exportableForDisc === 0;

    return (
      <Collapsible
        key={server.id}
        open={open}
        onOpenChange={(v) => setExpandedServerId(v ? server.id : null)}
        className="border rounded-md bg-muted/20"
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted/40 rounded-t-md">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="font-medium text-sm truncate flex-1">
            {server.name?.trim() || t('flow_builder.mcp.server_name', 'Server name')}
          </span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {transportLabel(t, server.transport)}
          </Badge>
          {server.authMode === 'oauth2' && (
            <Badge
              variant={oauthStatus?.connected ? 'default' : 'secondary'}
              className={cn('text-[10px] shrink-0', oauthStatus?.connected && 'bg-emerald-600')}
            >
              {oauthStatus?.connected
                ? t('flow_builder.mcp.connected', 'Connected')
                : t('flow_builder.mcp.not_connected', 'Not connected')}
            </Badge>
          )}
          <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button data-tour="components-flow-builder-mcpclienttoolnode.button.flow_builder.mcp.move_server_up"
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={serverIndex <= 0}
              onClick={() => moveServer(server.id, 'up')}
              aria-label={t('flow_builder.mcp.move_server_up', 'Move server up')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button data-tour="components-flow-builder-mcpclienttoolnode.button.flow_builder.mcp.move_server_down"
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={serverIndex >= servers.length - 1}
              onClick={() => moveServer(server.id, 'down')}
              aria-label={t('flow_builder.mcp.move_server_down', 'Move server down')}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              removeServer(server.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 pt-0 space-y-3 border-t">
            <MCPServerForm
              nodeId={id}
              server={server}
              onChange={(patch) => updateServer(server.id, patch)}
              onRequestRotate={handleRequestRotate}
              renderExtraActions={() => (
                <Button data-tour="components-flow-builder-mcpclienttoolnode.button.flow_builder.mcp.refresh_tools"
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => listToolsMutation.mutate({ server })}
                  disabled={!!toolsLoading || listToolsMutation.isPending}
                >
                  {toolsLoading || listToolsMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  )}
                  {t('flow_builder.mcp.refresh_tools', 'Refresh tools')}
                </Button>
              )}
            />

            {discovery?.lastRefreshStatus === 'error' && discovery.lastErrorMessage && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{discovery.lastErrorMessage}</AlertDescription>
              </Alert>
            )}
            {showZeroCallableWarning && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">
                  {discovery.rawToolCountAtRefresh === 0
                    ? t(
                        'flow_builder.mcp.zero_tools_catalog',
                        'This server reported no callable tools. The AI will not see MCP actions from this server.'
                      )
                    : exposedForFilter === 0
                      ? t(
                          'flow_builder.mcp.zero_tools_filtered',
                          'No tools are exposed to the AI after filtering ({{exposed}} of {{raw}}). Adjust the filter or refresh.',
                          { exposed: exposedForFilter, raw: discovery.rawToolCountAtRefresh }
                        )
                      : t(
                          'flow_builder.mcp.zero_tools_export_validation',
                          'No tools can be exported to the AI after validation ({{exportable}} of {{filtered}} pass; {{raw}} from server). Fix schemas or tool names, or adjust the filter.',
                          {
                            exportable: exportableForDisc,
                            filtered: exposedForFilter,
                            raw: discovery.rawToolCountAtRefresh,
                          }
                        )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label className="text-[10px]">{t('flow_builder.mcp.tools_filter_mode', 'Tool filter')}</Label>
              <RadioGroup
                value={filterMode}
                onValueChange={(v) => setToolFilterMode(server.id, v as MCPToolFilterMode)}
                className="flex flex-col gap-1"
              >
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <RadioGroupItem value="all" id={`${server.id}-all`} />
                  {t('flow_builder.mcp.tools_filter_all', 'Expose all tools')}
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <RadioGroupItem value="include" id={`${server.id}-inc`} />
                  {t('flow_builder.mcp.tools_filter_include', 'Include only selected')}
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <RadioGroupItem value="exclude" id={`${server.id}-exc`} />
                  {t('flow_builder.mcp.tools_filter_exclude', 'Exclude selected')}
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-1">
              {toolsLoading ? (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('flow_builder.mcp.refresh_tools', 'Refresh tools')}…
                </div>
              ) : tools.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">{t('flow_builder.mcp.tools_empty', 'No tools loaded yet — click Refresh tools')}</p>
              ) : (
                <ScrollArea className="h-[140px] rounded border p-2">
                  <div className="space-y-2 pr-2">
                    {tools.map((tool) => {
                      const checked = selectedTools.has(tool.name);
                      const disabled = filterMode === 'all';
                      return (
                        <label
                          key={tool.name}
                          className={cn('flex items-start gap-2 text-xs', disabled && 'opacity-80')}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() => {
                              if (!disabled) toggleToolInFilter(server.id, tool.name);
                            }}
                            className="mt-0.5"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{tool.name}</span>
                            {tool.description && (
                              <span className="block text-[10px] text-muted-foreground line-clamp-2">
                                {tool.description}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const handleBar = (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <Plug className="h-4 w-4 text-teal-600 shrink-0" />
        <span className="font-medium text-sm truncate">
          {t('flow_builder.node_types.mcp_client_tool', 'MCP Client Tool')}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button data-tour="components-flow-builder-mcpclienttoolnode.button.common.hide" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              {t('common.hide', 'Hide')}
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {t('common.edit', 'Edit')}
            </>
          )}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDeleteNode(id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('flow_builder.delete_node', 'Delete node')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );

  const sourceHandle = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="pointer-events-auto">
            <Handle
              type="source"
              position={Position.Right}
              id="mcp-tool-out"
              style={mcpToolOutputHandleStyle}
              isConnectable={isConnectable}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="left">
          {t('flow_builder.ai.connect_mcp_tools', 'Connect MCP Client Tool nodes here')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div
      className={cn(
        'bg-card border-2 border-border rounded-lg shadow-md group relative',
        isEditing ? 'w-[440px]' : 'w-[320px]'
      )}
    >
      {handleBar}

      {!isEditing ? (
        <div className="p-3 space-y-2 relative pb-6">
          {(() => {
            const discMap = (
              data as { mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary> }
            ).mcpToolDiscoveryByServerId;
            const warnServers = servers.filter((s) => {
              const d = discMap?.[s.id];
              if (!d) return false;
              if (d.lastRefreshStatus === 'error') return true;
              if (d.lastRefreshStatus !== 'ok') return false;
              const exportable =
                d.exportableToolCountAtRefresh !== undefined
                  ? d.exportableToolCountAtRefresh
                  : d.exposedToolCountAtRefresh ?? 0;
              return exportable === 0;
            });
            if (warnServers.length === 0) return null;
            return (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-[10px]">
                  {t(
                    'flow_builder.mcp.collapsed_discovery_issues',
                    '{{count}} server(s) have discovery errors or no tools exposed to the AI. Open edit to review.',
                    { count: warnServers.length }
                  )}
                </AlertDescription>
              </Alert>
            );
          })()}
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {t('flow_builder.mcp.server_count', '{{count}} server(s)', { count: servers.length })}
            </Badge>
            <Badge variant="outline" className="text-[10px] max-w-full truncate">
              {distinctTransports.map((tr) => transportLabel(t, tr)).join(', ')}
            </Badge>
            {servers
              .filter((s) => s.authMode === 'oauth2')
              .map((s) => {
                const st = connectionStatusByServerId[s.id];
                return (
                  <Badge
                    key={s.id}
                    variant={st?.connected ? 'default' : 'secondary'}
                    className={cn('text-[10px]', st?.connected && 'bg-emerald-600')}
                  >
                    {s.name?.trim() || s.id.slice(0, 6)}:{' '}
                    {st?.connected
                      ? t('flow_builder.mcp.connected', 'Connected')
                      : t('flow_builder.mcp.not_connected', 'Not connected')}
                  </Badge>
                );
              })}
          </div>
          {sourceHandle}
        </div>
      ) : (
        <div className="p-3 space-y-3 relative pb-6">
          {servers.map((s, i) => renderServerCard(s, i))}
          <Button data-tour="components-flow-builder-mcpclienttoolnode.button.flow_builder.mcp.add_server" type="button" variant="outline" size="sm" className="w-full h-9" onClick={addServer}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            {t('flow_builder.mcp.add_server', 'Add MCP server')}
          </Button>
          {sourceHandle}
        </div>
      )}
    </div>
  );
}
