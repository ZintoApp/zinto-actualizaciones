import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodes, useReactFlow } from 'reactflow';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Trash2,
  Pencil,
  ChevronDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { standardHandleStyle } from './StyledHandle';
import { FLOW_DEFAULT_TARGET_HANDLE_ID, FLOW_DEFAULT_SOURCE_HANDLE_ID } from './flowHandleIds';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import {
  MCPServerForm,
  createDefaultServer,
  mergeServerPatch,
  transportLabel,
} from './mcp/MCPServerForm';
import type { MCPServerConfig, MCPToolDescriptor, MCPExecuteToolNodeData } from '@shared/types/mcp';

/** OAuth/session tokens are keyed by flow node id; connected mode must use the source MCP Client Tool node's id. */
function mcpOwnershipNodeIdForMode(
  mode: 'inline' | 'connected',
  executeNodeId: string,
  sourceMcpClientNodeId: string
): string {
  if (mode === 'connected' && sourceMcpClientNodeId) {
    return sourceMcpClientNodeId;
  }
  return executeNodeId;
}

export function MCPExecuteToolNode({ data, isConnectable, id }: any) {
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const { onDeleteNode, customVariables, flowId } = useFlowContext();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'inline' | 'connected'>(() =>
    data?.sourceMcpClientNodeId ? 'connected' : 'inline'
  );
  const [serverConfig, setServerConfig] = useState<MCPServerConfig>(() =>
    data?.serverConfig ?? createDefaultServer()
  );
  const connectedSourceMcpClientNodeId = data?.sourceMcpClientNodeId ?? '';
  const connectedSourceServerId = data?.sourceServerId ?? '';
  const [toolName, setToolName] = useState<string>(data?.toolName ?? '');
  const [argumentsJson, setArgumentsJson] = useState<string>(data?.argumentsJson ?? '{}');
  const [outputVariablePrefix, setOutputVariablePrefix] = useState<string>(
    data?.outputVariablePrefix ?? 'mcp'
  );
  const [tools, setTools] = useState<MCPToolDescriptor[]>([]);
  const connectedToolsKeyRef = useRef<string>('');

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

  const persistData = useCallback(
    (patch: Partial<MCPExecuteToolNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...patch,
                },
              }
            : n
        )
      );
    },
    [id, setNodes]
  );

  useEffect(() => {
    if (mode !== 'connected') {
      connectedToolsKeyRef.current = '';
      return;
    }
    const key = `${connectedSourceMcpClientNodeId}|${connectedSourceServerId}`;
    if (connectedToolsKeyRef.current === key) return;
    const prevKey = connectedToolsKeyRef.current;
    connectedToolsKeyRef.current = key;
    setTools([]);
    if (prevKey !== '' && prevKey !== key) {
      setToolName('');
      persistData({ toolName: undefined });
    }
  }, [mode, connectedSourceMcpClientNodeId, connectedSourceServerId, persistData]);

  const mcpClientToolNodes = useMemo(
    () => nodes.filter((n) => n.type === 'mcp_client_tool'),
    [nodes]
  );

  const sourceNode = useMemo(() => {
    if (mode !== 'connected' || !connectedSourceMcpClientNodeId) return undefined;
    return nodes.find((n) => n.id === connectedSourceMcpClientNodeId);
  }, [nodes, mode, connectedSourceMcpClientNodeId]);

  const sourceServers: MCPServerConfig[] = useMemo(() => {
    const list = (sourceNode?.data as { servers?: MCPServerConfig[] } | undefined)?.servers;
    return Array.isArray(list) ? list : [];
  }, [sourceNode]);

  const effectiveServer = useMemo((): MCPServerConfig | undefined => {
    if (mode === 'inline') {
      return serverConfig;
    }
    if (!connectedSourceMcpClientNodeId || !connectedSourceServerId) return undefined;
    const sn = nodes.find((n) => n.id === connectedSourceMcpClientNodeId);
    const list = (sn?.data as { servers?: MCPServerConfig[] } | undefined)?.servers;
    if (!Array.isArray(list)) return undefined;
    return list.find((s) => s.id === connectedSourceServerId);
  }, [mode, serverConfig, connectedSourceMcpClientNodeId, connectedSourceServerId, nodes]);

  const mcpOwnershipNodeId = useMemo(
    () => mcpOwnershipNodeIdForMode(mode, id, connectedSourceMcpClientNodeId),
    [mode, id, connectedSourceMcpClientNodeId]
  );

  const argumentsParseError = useMemo(() => {
    try {
      JSON.parse(argumentsJson);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [argumentsJson]);

  const listToolsMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveServer) throw new Error('No server');
      const res = await apiRequest('POST', '/api/mcp/list-tools', {
        server: effectiveServer,
        nodeId: mcpOwnershipNodeId,
      });
      return res.json() as Promise<{ tools?: MCPToolDescriptor[] }>;
    },
    onSuccess: (b) => setTools(b.tools ?? []),
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: t('flow_builder.mcp.refresh_tools', 'Refresh tools'),
        description: err.message,
      });
    },
  });

  const handleRequestRotateInline = useCallback(
    (oldId: string, _newId: string) => {
      setTools([]);
      queryClient.removeQueries({ queryKey: ['mcp-oauth-status', id, oldId] });
      queryClient.removeQueries({ queryKey: ['mcp-oauth-redirect', id, oldId] });
    },
    [id, queryClient]
  );

  const commitInlineServerPatch = useCallback(
    async (patch: Partial<MCPServerConfig>) => {
      const before = serverConfig;
      const merged = mergeServerPatch(before, patch);
      if (merged.id !== before.id) {
        try {
          await apiRequest('POST', '/api/mcp/disconnect', { nodeId: id, serverId: before.id });
        } catch {
          /* */
        }
        setServerConfig(merged);
        persistData({ serverConfig: merged });
        return;
      }
      setServerConfig(merged);
      persistData({ serverConfig: merged });
    },
    [serverConfig, id, persistData]
  );

  const connectedSourceLabel = useMemo(() => {
    if (!sourceNode) return '';
    const label = (sourceNode.data as { label?: string } | undefined)?.label;
    return label?.trim() || sourceNode.id.slice(0, 6);
  }, [sourceNode]);

  const handleBar = (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <Play className="h-4 w-4 text-purple-600 shrink-0" />
        <span className="font-medium text-sm truncate">
          {t('flow_builder.node_types.mcp_execute_tool', 'MCP Execute Tool')}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button data-tour="components-flow-builder-mcpexecutetoolnode.button.common.hide" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(!isEditing)}>
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

  return (
    <div className="bg-card border-2 border-border rounded-lg shadow-md w-[300px] group relative">
      {handleBar}

      {!isEditing ? (
        <div className="p-3 space-y-2 relative pb-4">
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {mode === 'inline'
                ? t('flow_builder.mcp.execute.mode_inline', 'Inline server')
                : t('flow_builder.mcp.execute.connected_label', 'From {{name}}', { name: connectedSourceLabel || '…' })}
            </Badge>
            {toolName ? (
              <Badge variant="outline" className="text-[10px] max-w-full truncate">
                {toolName}
              </Badge>
            ) : null}
            {effectiveServer ? (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {transportLabel(t, effectiveServer.transport)}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3 relative pb-4">
          <div className="space-y-2">
            <RadioGroup
              value={mode}
              onValueChange={(v) => {
                const next = v as 'inline' | 'connected';
                setMode(next);
                if (next === 'inline') {
                  const fresh = createDefaultServer();
                  setServerConfig(fresh);
                  persistData({
                    sourceMcpClientNodeId: undefined,
                    sourceServerId: undefined,
                    serverConfig: fresh,
                  });
                } else {
                  persistData({ serverConfig: undefined });
                  setTools([]);
                }
              }}
              className="flex flex-col gap-1"
            >
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <RadioGroupItem value="inline" id={`${id}-mode-inline`} />
                {t('flow_builder.mcp.execute.mode_inline', 'Inline server')}
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <RadioGroupItem value="connected" id={`${id}-mode-connected`} />
                {t('flow_builder.mcp.execute.mode_connected', 'Use connected MCP Client Tool')}
              </label>
            </RadioGroup>
          </div>

          {mode === 'inline' ? (
            <MCPServerForm
              nodeId={id}
              server={serverConfig}
              onChange={(patch) => {
                void commitInlineServerPatch(patch);
              }}
              onRequestRotate={handleRequestRotateInline}
            />
          ) : (
            <div className="space-y-2">
              {mcpClientToolNodes.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  {t(
                    'flow_builder.mcp.execute.no_client_tool_nodes',
                    'No MCP Client Tool nodes on this canvas yet — add one or switch to Inline server.'
                  )}
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px]">
                      {t('flow_builder.mcp.execute.source_node', 'Source MCP Client Tool node')}
                    </Label>
                    <Select
                      value={connectedSourceMcpClientNodeId || undefined}
                      onValueChange={(v) => {
                        setTools([]);
                        persistData({ sourceMcpClientNodeId: v, sourceServerId: undefined });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="…" />
                      </SelectTrigger>
                      <SelectContent>
                        {mcpClientToolNodes.map((n) => {
                          const nl = (n.data as { label?: string } | undefined)?.label;
                          return (
                            <SelectItem key={n.id} value={n.id}>
                              {nl?.trim() || n.id.slice(0, 6)}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">{t('flow_builder.mcp.execute.source_server', 'Server')}</Label>
                    <Select
                      value={connectedSourceServerId || undefined}
                      disabled={!connectedSourceMcpClientNodeId}
                      onValueChange={(v) => {
                        setTools([]);
                        persistData({
                          sourceMcpClientNodeId: connectedSourceMcpClientNodeId,
                          sourceServerId: v,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceServers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name?.trim() || s.id.slice(0, 6)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Button data-tour="components-flow-builder-mcpexecutetoolnode.button.flow_builder.mcp.refresh_tools"
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-xs"
                onClick={() => listToolsMutation.mutate()}
                disabled={!effectiveServer || listToolsMutation.isPending}
              >
                {listToolsMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                {t('flow_builder.mcp.refresh_tools', 'Refresh tools')}
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">{t('flow_builder.mcp.execute.tool_name', 'Tool')}</Label>
              <Select
                value={toolName || undefined}
                onValueChange={(v) => {
                  setToolName(v);
                  persistData({ toolName: v });
                }}
                disabled={tools.length === 0}
              >
                <SelectTrigger data-tour="components-flow-builder-mcpexecutetoolnode.selecttrigger.flow_builder.mcp.execute.no_tool_selected" className="h-8 text-xs">
                  <SelectValue
                    placeholder={
                      tools.length === 0
                        ? t('flow_builder.mcp.execute.no_tool_selected', 'No tool selected')
                        : toolName || t('flow_builder.mcp.execute.no_tool_selected', 'No tool selected')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {tools.map((tool) => (
                    <SelectItem key={tool.name} value={tool.name}>
                      {tool.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tools.length === 0 && effectiveServer ? (
                <p className="text-[10px] text-muted-foreground">
                  {t('flow_builder.mcp.execute.no_tools_loaded', "Click Refresh tools to load this server's tools.")}
                </p>
              ) : null}
              {toolName ? (
                <p className="text-[10px] text-muted-foreground">
                  {tools.find((x) => x.name === toolName)?.description ?? ''}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">{t('flow_builder.mcp.execute.arguments_json', 'Arguments (JSON)')}</Label>
            <EnhancedVariablePicker
              value={argumentsJson}
              onChange={(v) => {
                setArgumentsJson(v);
                persistData({ argumentsJson: v });
              }}
              flowId={flowId ?? undefined}
              customVariables={customVariables}
              multiline
              className="min-h-[120px]"
            />
            {argumentsParseError ? (
              <p className="text-[10px] text-destructive">
                {t(
                  'flow_builder.mcp.execute.arguments_invalid',
                  'Arguments must be valid JSON. Variables like {{name}} are evaluated at runtime — wrap them in quotes if they should be strings.'
                )}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">{t('flow_builder.mcp.execute.output_prefix', 'Output variable prefix')}</Label>
            <Input data-tour="components-flow-builder-mcpexecutetoolnode.input.outputVariablePrefix"
              className="h-8 text-xs"
              value={outputVariablePrefix}
              onChange={(e) => {
                setOutputVariablePrefix(e.target.value);
                persistData({ outputVariablePrefix: e.target.value });
              }}
              placeholder="mcp"
            />
            <p className="text-[10px] text-muted-foreground">
              {t(
                'flow_builder.mcp.execute.output_prefix_help',
                'Result variables will be written as {{prefix}}.lastResponse and {{prefix}}.error'
              )}
            </p>
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        id={FLOW_DEFAULT_TARGET_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={FLOW_DEFAULT_SOURCE_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}
