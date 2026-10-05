import { emitTourSignal } from '@/components/guided-tours/signals';
import { GuidedTourHelpButton } from '@/components/guided-tours/GuidedTourProvider';
import { APP_ICONS } from '@/assets/icons';
import { AIAssistantNode } from '@/components/flow-builder/AIAssistantNode';
import { MCPClientToolNode } from '@/components/flow-builder/MCPClientToolNode';
import { MCPExecuteToolNode } from '@/components/flow-builder/MCPExecuteToolNode';
import { AI_TOOL_INPUT_HANDLE_ID } from '@/components/flow-builder/flowHandleIds';
import { BotDisableNode } from '@/components/flow-builder/BotDisableNode';
import { EndConversationNode } from '@/components/flow-builder/EndConversationNode';
import { BotResetNode } from '@/components/flow-builder/BotResetNode';
import { FlowTriggerNode } from '@/components/flow-builder/FlowTriggerNode';
import { DocumindNode } from '@/components/flow-builder/DocumindNode';
import { ChatPdfNode } from '@/components/flow-builder/ChatPdfNode';
import { DocumentGeneratorNode } from '@/components/flow-builder/DocumentGeneratorNode';
import { GammaNode } from '@/components/flow-builder/GammaNode';
import { GoogleSheetsNode } from '@/components/flow-builder/GoogleSheetsNode';
import { DataCaptureNode } from '@/components/flow-builder/DataCaptureNode';
import { VariableBrowser } from '@/components/flow-builder/VariableBrowser';
import { N8nNode } from '@/components/flow-builder/N8nNode';
import { MakeNode } from '@/components/flow-builder/MakeNode';
import { ExecutionHistoryModal } from '@/components/flow-builder/ExecutionHistoryModal';
import { FlowTemplatesModal } from '@/components/flow-builder/FlowTemplatesModal';
import { CustomVariableManagerDialog } from '@/components/flow-builder/CustomVariableManagerDialog';
import { MediaGalleryDialog } from '@/components/flow-builder/MediaGalleryDialog';
import { ExecutionOverlay } from '@/components/flow-builder/ExecutionOverlay';
import { EnhancedVariablePicker } from '@/components/flow-builder/EnhancedVariablePicker';
import { ImageNode } from '@/components/flow-builder/ImageNode';
import { VideoNode } from '@/components/flow-builder/VideoNode';
import { AudioNode } from '@/components/flow-builder/AudioNode';
import { DocumentNode } from '@/components/flow-builder/DocumentNode';
import { NodeToolbar } from '@/components/flow-builder/NodeToolbar';
import type { MessageKeyword } from '@/components/flow-builder/messageKeyword';
import WhatsAppInteractiveButtonsNode from '@/components/flow-builder/WhatsAppInteractiveButtonsNode';
import WhatsAppInteractiveListNode from '@/components/flow-builder/WhatsAppInteractiveListNode';
import WhatsAppCTAURLNode from '@/components/flow-builder/WhatsAppCTAURLNode';
import WhatsAppLocationRequestNode from '@/components/flow-builder/WhatsAppLocationRequestNode';
import WhatsAppPollNode from '@/components/flow-builder/WhatsAppPollNode';

import { HTTPRequestNode } from '@/components/flow-builder/HTTPRequestNode';
import { DatabaseQueryNode } from '@/components/flow-builder/DatabaseQueryNode';
import { CodeExecutionNode } from '@/components/flow-builder/CodeExecutionNode';
import { WhatsAppFlowsNode } from '@/components/flow-builder/WhatsAppFlowsNode';
import { TranslationNode } from '@/components/flow-builder/TranslationNode';
import UpdatePipelineStageNode from '@/components/flow-builder/UpdatePipelineStageNode';
import MoveDealToPipelineNode from '@/components/flow-builder/MoveDealToPipelineNode';
import ManageContactNode from '@/components/flow-builder/ManageContactNode';
import ManageTaskNode from '@/components/flow-builder/ManageTaskNode';
import { WebhookNode } from '@/components/flow-builder/WebhookNode';
import { ContactNotificationNode } from '@/components/flow-builder/ContactNotificationNode';
import { StripeNode } from '@/components/flow-builder/StripeNode';
import { ErpNode } from '@/components/flow-builder/ErpNode';
import { MasterShopNode } from '@/components/flow-builder/MasterShopNode';
import { MasterShopWebhookTriggerNode } from '@/components/flow-builder/MasterShopWebhookTriggerNode';
import { WooCommerceNode } from '@/components/flow-builder/WooCommerceNode';
import { CallAgentNode } from '@/components/flow-builder/CallAgentNode';
import { NotesNode } from '@/components/flow-builder/NotesNode';
import {
  AIWorkflowCreatorPanel,
  type CompletedCreatorGeneration,
} from '@/components/flow-builder/AIWorkflowCreatorPanel';
import {
  isNotesNodeType,
  NOTES_DEFAULT_HEIGHT,
  NOTES_DEFAULT_WIDTH,
} from '@/components/flow-builder/notes-node-colors';
import { ConditionNode } from '@/components/flow-builder/ConditionNode';
import { FollowUpNode } from '@/components/flow-builder/nodes/FollowUpNode';
import { WebhookTriggerNode } from '@/components/flow-builder/WebhookTriggerNode';
import { BrandingLogo } from '@/components/auth/BrandingLogo';
import { Button } from '@/components/ui/button';
import { Calendar } from "@/components/ui/calendar";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem, SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ThemeToggle from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useToast } from '@/hooks/use-toast';
import useFlowExecution from '@/hooks/useFlowExecution';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { BASE_VARIABLES, getFlowNodeVariablesFromNodes } from '@/hooks/useFlowVariables';
import { useBranding } from '@/contexts/branding-context';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { getBrowserTimezone } from '@/utils/timezones';
import { buildFlowNodeCatalog, flowHasMessageTrigger, isMessageTriggerNode } from '@/pages/flow-builder-node-catalog';
import { removeStaleInferredAiMediaVariables } from '@shared/types/flow-media';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock,
  Copy,
  Database,
  Globe,
  LayoutGrid,
  LayoutTemplate,
  Images,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  User,
  UserCheck,
  Variable,
  X,
  Code
} from 'lucide-react';
import { nanoid } from 'nanoid';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';
import type { AiCreatorCommitMetadata, FlowGraphDraft } from '@shared/types/ai-flow-creator';
import { CreatorEdgeToggle } from '@/components/flow-builder/CreatorEdgeToggle';
import {
  appendBoundedFlowHistory,
  cloneFlowHistoryValue,
  createFlowDraftSignature,
} from '@/lib/flow-editor-history';
import { hashFlowGraph } from '@shared/flow-graph-validator';
import { VISIBLE_FLOW_NODE_TYPES, createDefaultFlowNodeData } from '@shared/flow-node-registry';
import {
  createDefaultConditionNodeData,
  deriveFlowTriggerStageScopeFromNodes,
  isMessageReceivedTriggerNode,
  MEDIA_ITEMS_DEFAULT_DELAY_MS,
  MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC,
  MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD,
  MESSAGE_TRIGGER_META_AD_CHANNELS,
  deriveMessageTriggerMetaAdRoutingHandleId,
  isMessageTriggerMetaAdRoutingHandleId,
  parseMessageTriggerMetaAdRoutingKeyFromHandleId,
  normalizeConditionNodeData,
  normalizeMessageTriggerNodeData,
  resolveMessageTriggerInitialSourceMode,
  type MessageTriggerInitialSourceMode,
} from '@shared/types/node-types';
import {
  createDefaultMasterShopActionNodeData,
  createDefaultMasterShopWebhookTriggerNodeData,
} from '@shared/types/mastershop';
import {
  createDefaultDocumentGeneratorNodeData,
  normalizeDocumentGeneratorNodeData,
} from '@shared/document-generator-defaults';
import { buildDuplicatedWebhookTriggerNodeData } from '@shared/utils/duplicate-webhook-trigger-node';
import type { Pipeline, PipelineStage } from '@/types/pipeline';
import ReactFlow, {
  addEdge,
  Background,
  BaseEdge,
  Connection,
  Controls,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
  MiniMap,
  Node,
  NodeTypes,
  Panel,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useNodes,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Link, useLocation, useRoute } from 'wouter';
import { AutoArrangeCollapseSignalProvider } from '@/components/flow-builder/AutoArrangeCollapseContext';
import { autoArrangeFlow } from '@/utils/flow-layout';
import { handleFlowBuilderNodeWheelCapture, cleanupNodeNowheelMarks } from '@/utils/flow-builder-node-wheel';

const getFullscreenElement = () =>
  document.fullscreenElement ||
  (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
  (document as Document & { mozFullScreenElement?: Element | null }).mozFullScreenElement ||
  (document as Document & { msFullscreenElement?: Element | null }).msFullscreenElement;

function normalizeTriggerChannelTypesFromData(data: Record<string, unknown>): string[] {
  const raw = data.channelTypes ?? data.channels;
  let channels: string[] = [];
  if (Array.isArray(raw)) {
    channels = raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } else if (typeof raw === 'string' && raw) {
    channels = [raw];
  }
  return [channels[0] ?? 'whatsapp_unofficial'];
}

function parseRoutingKeysInput(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\n]/)
        .map((key) => key.trim())
        .filter((key) => key.length > 0)
    ),
  ];
}

const META_AD_CAPABLE_CHANNEL_SET = new Set<string>(MESSAGE_TRIGGER_META_AD_CHANNELS);

function stripDeprecatedFlowNodeFields(node: Node): Node {
  const rawData = node.data;
  if (!rawData || typeof rawData !== 'object') {
    return node;
  }
  const data = { ...rawData } as Record<string, unknown>;
  delete data.agentControlEnabled;
  const t = String(node.type ?? '');
  if (t === 'aiAssistant' || t === 'ai_assistant' || t === 'aiAssistantNode') {
    delete data.generatedAgentControlTools;
  }
  const normalizedData = isMessageTriggerNode(node)
    ? normalizeMessageTriggerNodeData(data)
    : (t === 'condition' || t === 'conditionNode')
      ? normalizeConditionNodeData(data)
      : t === 'document_generator'
        ? normalizeDocumentGeneratorNodeData(data)
        : data;
  if (isNotesNodeType(t)) {
    const noteData = normalizedData as Record<string, unknown>;
    const pinned = Boolean(noteData.pinned);
    const width = typeof noteData.width === 'number' ? noteData.width : NOTES_DEFAULT_WIDTH;
    const height = typeof noteData.height === 'number' ? noteData.height : NOTES_DEFAULT_HEIGHT;
    return {
      ...node,
      connectable: false,
      draggable: !pinned,
      style: { ...node.style, width, height },
      data: normalizedData,
    };
  }
  return { ...node, data: normalizedData };
}

function normalizeFlowNodesAgentControl(nodes: Node[]): Node[] {
  return nodes.map(stripDeprecatedFlowNodeFields);
}

/** Maps mistaken or legacy AI Assistant target handles so control-flow edges use `flow-in`, not MCP `tool-input`. */
function normalizeFlowEdgesAiAssistantHandles(edges: Edge[], nodes: Node[]): Edge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((edge) => {
    const target = nodeById.get(edge.target);
    if (target?.type !== 'ai_assistant') {
      return edge;
    }
    const source = edge.source ? nodeById.get(edge.source) : undefined;

    if (source?.type === 'mcp_client_tool') {
      const th = edge.targetHandle;
      if (th === undefined || th === null || (typeof th === 'string' && th.trim() === '')) {
        return { ...edge, targetHandle: AI_TOOL_INPUT_HANDLE_ID };
      }
      return edge;
    }

    if (edge.targetHandle === AI_TOOL_INPUT_HANDLE_ID) {
      return { ...edge, targetHandle: FLOW_DEFAULT_TARGET_HANDLE_ID };
    }

    const th = edge.targetHandle;
    if (th === undefined || th === null || (typeof th === 'string' && th.trim() === '')) {
      return { ...edge, targetHandle: FLOW_DEFAULT_TARGET_HANDLE_ID };
    }

    return edge;
  });
}

const CalendarClock = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.5" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h5" />
    <path d="M17.5 17.5 16 16.25V14" />
    <path d="M22 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
  </svg>
);



import { standardHandleStyle } from '@/components/flow-builder/StyledHandle';
import { FLOW_DEFAULT_SOURCE_HANDLE_ID, FLOW_DEFAULT_TARGET_HANDLE_ID, MESSAGE_TRIGGER_INITIAL_HANDLE_ID } from '@/components/flow-builder/flowHandleIds';
import { Handle, Position } from 'reactflow';

type FlowNodeExecutionStatus = 'pending' | 'executing' | 'executed' | 'waiting' | 'failed' | 'skipped';

const FlowContext = React.createContext<{
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  flowId?: number | null;
  getNodeExecutionStatus: (nodeId: string) => FlowNodeExecutionStatus;
  customVariables: FlowCustomVariable[];
  setCustomVariables: React.Dispatch<React.SetStateAction<FlowCustomVariable[]>>;
} | null>(null);

function MessageNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [message, setMessage] = useState(data.message || t('flow_builder.default_message', "Hello! How can I help you?"));
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const formatMessage = (message: string) => {
    const regex = /\{\{([^}]+)\}\}/g;

    if (!regex.test(message)) {
      return message;
    }

    const parts = [];
    let lastIndex = 0;
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(message)) !== null) {
      if (match.index > lastIndex) {
        parts.push(message.substring(lastIndex, match.index));
      }

      parts.push(
        <span key={match.index} className="bg-primary/10 text-primary px-1 rounded">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.length) {
      parts.push(message.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div className="node-message p-3 rounded-lg bg-card border border-border shadow-sm min-w-[320px] max-w-[450px] group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}
      <div className="font-medium flex items-center gap-2 mb-2">
        <img src={APP_ICONS.textMessage} alt="Text Message" className="h-4 w-4" />
        <span>{t('flow_builder.send_message', 'Send Message')}</span>
        <button data-tour="pages-flow-builder.button.common.done"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => { if (isEditing && message.trim()) emitTourSignal('flow-node-configured', id); setIsEditing(!isEditing); }}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.message_content', 'Message Content:')}</label>
            <EnhancedVariablePicker
              value={message}
              onChange={(newMessage) => {
                setMessage(newMessage);
                updateNodeData({ message: newMessage });
              }}
              placeholder={t('flow_builder.type_message_placeholder', 'Type your message here...')}
              multiline
              className="w-full p-2 text-sm border rounded min-h-[80px] resize-none"
              flowId={flowContext?.flowId ?? undefined}
              customVariables={flowContext?.customVariables}
            />

            <div className="text-[10px] text-muted-foreground mt-1">
              {t('flow_builder.variables_help', 'Variables will be replaced with actual values when message is sent.')}
            </div>
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input data-tour="pages-flow-builder.input.flow_builder.enable_keyword_triggers"
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button data-tour="pages-flow-builder.button.flow_builder.add_keyword"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input data-tour="pages-flow-builder.input.keyword.value"
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm p-2 rounded border border-border">
            {formatMessage(message)}
          </div>

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id={FLOW_DEFAULT_TARGET_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Default output: next node after message send (when keyword routing is off). Keyword outputs use handles above. */}
      <Handle
        type="source"
        position={Position.Right}
        id={FLOW_DEFAULT_SOURCE_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}


function TriggerNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  useCollapseOnAutoArrange(setIsExpanded);
  const [triggerType, setTriggerType] = useState(data.triggerType || 'message_received');
  const [localConditionType, setLocalConditionType] = useState(data.conditionType || 'any');
  const [localConditionValue, setLocalConditionValue] = useState(data.conditionValue || '');
  const [selectedChannelTypes, setSelectedChannelTypes] = useState<string[]>(
    () => normalizeTriggerChannelTypesFromData(data)
  );
  
  const { data: pipelines } = useQuery<Pipeline[]>({
    queryKey: ['/api/pipelines'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipelines');
      return res.json() as Promise<Pipeline[]>;
    },
    staleTime: 60 * 1000,
  });

  const selectedPipelineId = useMemo(() => {
    const raw = data.pipelineId;
    if (raw == null || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [data.pipelineId]);

  const { data: pipelineStages = [] } = useQuery<PipelineStage[]>({
    queryKey: ['/api/pipeline/stages', selectedPipelineId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/pipeline/stages?pipelineId=${selectedPipelineId}`);
      return res.json() as Promise<PipelineStage[]>;
    },
    enabled: selectedPipelineId !== null,
    staleTime: 60 * 1000,
  });

  const isMessageReceivedTrigger = useMemo(
    () => isMessageReceivedTriggerNode({ type: 'trigger', data }),
    [data]
  );
  const stageScope = useMemo(
    () => deriveFlowTriggerStageScopeFromNodes([{ type: 'trigger', data }]),
    [data]
  );
  const [hardResetKeyword, setHardResetKeyword] = useState(data.hardResetKeyword || '');
  const [hardResetConfirmationMessage, setHardResetConfirmationMessage] = useState(
    data.hardResetConfirmationMessage || t('flow_builder.trigger_default_reset_message', 'Bot has been reactivated. Starting fresh conversation...')
  );
  const [sessionTimeout, setSessionTimeout] = useState(data.sessionTimeout || 30);
  const [sessionTimeoutUnit, setSessionTimeoutUnit] = useState(data.sessionTimeoutUnit || 'minutes');
  const [enableSessionPersistence, setEnableSessionPersistence] = useState(data.enableSessionPersistence !== false);
  const [enableInitialMessageOutput, setEnableInitialMessageOutput] = useState(data.enableInitialMessageOutput === true);
  const [initialMessageSourceMode, setInitialMessageSourceMode] = useState<MessageTriggerInitialSourceMode>(
    () => resolveMessageTriggerInitialSourceMode(data.initialMessageSourceMode)
  );
  const [metaAdRoutingKeysInput, setMetaAdRoutingKeysInput] = useState(
    Array.isArray(data.metaAdRoutingKeys) ? data.metaAdRoutingKeys.join(', ') : ''
  );
  const [multipleKeywords, setMultipleKeywords] = useState(data.multipleKeywords || '');
  const [keywordsCaseSensitive, setKeywordsCaseSensitive] = useState(data.keywordsCaseSensitive || false);
  const { setNodes, setEdges, getEdges } = useReactFlow();
  const flowContext = useFlowContext();

  const getConditionLabel = (conditionType: string): string => {
    switch (conditionType) {
      case 'multiple_keywords': return t('flow_builder.trigger_condition_contains_any', 'contains any of');
      case 'regex': return t('flow_builder.trigger_condition_matches_pattern', 'matches pattern');
      case 'media': return t('flow_builder.trigger_condition_has_media', 'has media attachment');
      default: return '';
    }
  };

  const getConditionPlaceholder = (conditionType: string): string => {
    switch (conditionType) {
      case 'multiple_keywords': return t('flow_builder.trigger_placeholder_keywords', 'Enter keywords separated by commas (e.g., help, support, agent)');
      case 'regex': return t('flow_builder.trigger_placeholder_regex', '\\b\\w+\\b');
      default: return '';
    }
  };

  const channelTypes = [
    { value: 'whatsapp_unofficial', label: t('flow_builder.trigger_channel_whatsapp_unofficial', 'WhatsApp (Unofficial)'), icon: 'fab fa-whatsapp', color: 'text-green-600 dark:text-green-400' },
    { value: 'whatsapp_official', label: t('flow_builder.trigger_channel_whatsapp_official', 'WhatsApp (Official)'), icon: 'fab fa-whatsapp', color: 'text-green-700 dark:text-green-400' },
    { value: 'messenger', label: t('flow_builder.trigger_channel_messenger', 'Facebook Messenger'), icon: 'fab fa-facebook-messenger', color: 'text-blue-500 dark:text-blue-400' },
    { value: 'instagram', label: t('flow_builder.trigger_channel_instagram', 'Instagram'), icon: 'fab fa-instagram', color: 'text-pink-500 dark:text-pink-400' },
    { value: 'telegram', label: t('flow_builder.trigger_channel_telegram', 'Telegram'), icon: 'fab fa-telegram-plane', color: 'text-sky-600 dark:text-sky-400' },
    { value: 'email', label: t('flow_builder.trigger_channel_email', 'Email'), icon: 'fas fa-envelope', color: 'text-muted-foreground' },
    { value: 'webchat', label: t('flow_builder.trigger_channel_webchat', 'WebChat'), color: 'text-indigo-600 dark:text-indigo-400' }
  ];

  const isMetaAdRoutingMode =
    enableInitialMessageOutput &&
    triggerType === 'message_received' &&
    initialMessageSourceMode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD;

  const visibleChannelTypes = useMemo(() => {
    if (isMetaAdRoutingMode) {
      return channelTypes.filter((channelType) => META_AD_CAPABLE_CHANNEL_SET.has(channelType.value));
    }
    return channelTypes;
  }, [isMetaAdRoutingMode, t]);

  const getConditionTypesForChannels = (channels: string[]) => {
    const baseConditions = [
      { value: 'any', label: t('flow_builder.any_message', 'Any Message') },
      { value: 'multiple_keywords', label: t('flow_builder.multiple_keywords', 'Multiple Keywords') },
      { value: 'regex', label: t('flow_builder.regex_pattern', 'Regex Pattern') }
    ];


    const supportsMedia = channels.some(ch =>
      ['whatsapp_unofficial', 'whatsapp_official', 'messenger', 'instagram', 'telegram', 'webchat'].includes(ch)
    );
    if (supportsMedia) {
      baseConditions.push({ value: 'media', label: t('flow_builder.has_media', 'Has Media') });
    }


    const hasEmail = channels.includes('email');
    if (hasEmail) {
      baseConditions.push(
        { value: 'subject_contains', label: t('flow_builder.subject_contains', 'Subject Contains') },
        { value: 'from_domain', label: t('flow_builder.from_domain', 'From Domain') },
        { value: 'has_attachment', label: t('flow_builder.has_attachment', 'Has Attachment') }
      );
    }

    return baseConditions;
  };

  const conditionTypes = getConditionTypesForChannels(selectedChannelTypes);
  const configuredRoutingKeys = useMemo(
    () => parseRoutingKeysInput(metaAdRoutingKeysInput),
    [metaAdRoutingKeysInput]
  );
  const summaryChannelTypes = normalizeTriggerChannelTypesFromData(data);

  const updateNodeData = useCallback((updates: Record<string, unknown>) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          const mergedData = {
            ...node.data,
            ...updates,
          };
          return {
            ...node,
            data: normalizeMessageTriggerNodeData(mergedData as Record<string, unknown>),
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  useEffect(() => {
    if (!isMetaAdRoutingMode) {
      return;
    }

    const current = selectedChannelTypes[0];
    if (current && META_AD_CAPABLE_CHANNEL_SET.has(current)) {
      return;
    }

    const nextChannels = ['whatsapp_unofficial'];
    setSelectedChannelTypes(nextChannels);
    updateNodeData({ channelTypes: nextChannels });
  }, [isMetaAdRoutingMode, id, selectedChannelTypes, updateNodeData]);


  const parseKeywords = (keywordString: string): string[] => {
    return keywordString
      .split(',')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0);
  };


  const validateKeywords = (keywordString: string): boolean => {
    const keywords = parseKeywords(keywordString);
    return keywords.length > 0;
  };


  useEffect(() => {
    if (localConditionType === 'multiple_keywords') {
      const currentKeywords = parseKeywords(multipleKeywords);
      const currentHandleIds = currentKeywords.map(keyword =>
        `keyword-${keyword.toLowerCase().replace(/\s+/g, '-')}`
      );


      const currentEdges = getEdges();
      const edgesToRemove = currentEdges.filter(edge =>
        edge.source === id &&
        edge.sourceHandle &&
        edge.sourceHandle.startsWith('keyword-') &&
        !currentHandleIds.includes(edge.sourceHandle)
      );

      if (edgesToRemove.length > 0) {
        setEdges(edges => edges.filter(edge => !edgesToRemove.includes(edge)));

      }
    }
  }, [multipleKeywords, localConditionType, id, getEdges, setEdges]);

  const pruneInitialMessageEdges = useCallback(() => {
    const currentEdges = getEdges();
    const validMetaHandles = new Set(
      configuredRoutingKeys.map((key) => deriveMessageTriggerMetaAdRoutingHandleId(key))
    );
    const edgesToRemove = currentEdges.filter((edge) => {
      if (edge.source !== id || !edge.sourceHandle) {
        return false;
      }
      const handle = edge.sourceHandle;
      if (handle === MESSAGE_TRIGGER_INITIAL_HANDLE_ID) {
        return isMetaAdRoutingMode || !enableInitialMessageOutput;
      }
      if (isMessageTriggerMetaAdRoutingHandleId(handle)) {
        if (!enableInitialMessageOutput || !isMetaAdRoutingMode) {
          return true;
        }
        const key = parseMessageTriggerMetaAdRoutingKeyFromHandleId(handle);
        return !key || !validMetaHandles.has(handle);
      }
      return false;
    });
    if (edgesToRemove.length > 0) {
      setEdges((edges) => edges.filter((edge) => !edgesToRemove.includes(edge)));
    }
  }, [
    id,
    getEdges,
    setEdges,
    configuredRoutingKeys,
    isMetaAdRoutingMode,
    enableInitialMessageOutput,
  ]);

  useEffect(() => {
    if (!enableInitialMessageOutput || triggerType !== 'message_received') {
      pruneInitialMessageEdges();
      return;
    }
    pruneInitialMessageEdges();
  }, [
    enableInitialMessageOutput,
    triggerType,
    initialMessageSourceMode,
    configuredRoutingKeys,
    pruneInitialMessageEdges,
  ]);

  const handleChannelTypeSelect = (channelType: string) => {
    if (selectedChannelTypes[0] === channelType) {
      return;
    }
    const next = [channelType];
    setSelectedChannelTypes(next);
    updateNodeData({ channelTypes: next });

    const supportedConditions = getConditionTypesForChannels(next);
    if (!supportedConditions.some((entry) => entry.value === localConditionType)) {
      setLocalConditionType('any');
      updateNodeData({ conditionType: 'any', conditionValue: '' });
    }
  };

  const handleConditionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setLocalConditionType(newType);
    if (newType === 'media' || localConditionType === 'media') {
      setLocalConditionValue('');
      updateNodeData({ conditionType: newType, conditionValue: '' });
    } else {
      updateNodeData({ conditionType: newType });
    }
  };

  const handleConditionValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalConditionValue(newValue);
    updateNodeData({ conditionValue: newValue });
  };

  const handleHardResetKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setHardResetKeyword(newValue);
    updateNodeData({ hardResetKeyword: newValue });
  };

  const handleHardResetConfirmationMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setHardResetConfirmationMessage(newValue);
    updateNodeData({ hardResetConfirmationMessage: newValue });
  };

  const handleSessionTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value) || 30;
    setSessionTimeout(newValue);
    updateNodeData({ sessionTimeout: newValue });
  };

  const handleSessionTimeoutUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSessionTimeoutUnit(newValue);
    updateNodeData({ sessionTimeoutUnit: newValue });
  };

  const handleEnableSessionPersistenceChange = (checked: boolean) => {
    setEnableSessionPersistence(checked);
    updateNodeData({ enableSessionPersistence: checked });
  };

  const handleMultipleKeywordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setMultipleKeywords(newValue);
    const keywordsArray = parseKeywords(newValue);
    updateNodeData({
      multipleKeywords: newValue,
      keywordsArray: keywordsArray
    });
  };

  const handleKeywordsCaseSensitiveChange = (checked: boolean) => {
    setKeywordsCaseSensitive(checked);
    updateNodeData({ keywordsCaseSensitive: checked });
  };

  const handleEnableInitialMessageOutputChange = (checked: boolean) => {
    setEnableInitialMessageOutput(checked);
    updateNodeData({ enableInitialMessageOutput: checked });
    if (!checked) {
      pruneInitialMessageEdges();
    }
  };

  const handleInitialMessageSourceModeChange = (mode: MessageTriggerInitialSourceMode) => {
    setInitialMessageSourceMode(mode);
    const updates: Record<string, unknown> = { initialMessageSourceMode: mode };
    if (mode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD) {
      const current = selectedChannelTypes[0];
      const nextChannel =
        current && META_AD_CAPABLE_CHANNEL_SET.has(current) ? current : 'whatsapp_unofficial';
      const nextChannels = [nextChannel];
      setSelectedChannelTypes(nextChannels);
      updates.channelTypes = nextChannels;
    }
    updateNodeData(updates);
    pruneInitialMessageEdges();
  };

  const handleMetaAdRoutingKeysChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMetaAdRoutingKeysInput(value);
    updateNodeData({ metaAdRoutingKeys: parseRoutingKeysInput(value) });
  };

  return (
    <div className="node-trigger relative p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] min-w-[300px] group">
      {flowContext && (
        <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => flowContext.onDeleteNode(id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.trigger_delete_node', 'Delete node')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <div className="font-medium flex items-center gap-2 mb-2">
        <img src={APP_ICONS.messageTrigger} alt="Message Trigger" className="h-4 w-4" />
        {summaryChannelTypes.length > 0 && (
          <span className="flex items-center gap-1">
            {summaryChannelTypes.slice(0, 3).map((channelValue) => {
              const channelInfo = channelTypes.find((entry) => entry.value === channelValue);
              if (!channelInfo) return null;
              return (
                <i
                  key={channelValue}
                  className={`${channelInfo.icon} ${channelInfo.color} text-sm`}
                  title={channelInfo.label}
                ></i>
              );
            })}
            {summaryChannelTypes.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{summaryChannelTypes.length - 3}</span>
            )}
          </span>
        )}
        <span>{t('flow_builder.trigger_node', 'Message Trigger')}</span>
        <button data-tour="pages-flow-builder.button.common.hide"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? t('common.hide', 'Hide') : t('common.edit', 'Edit')}
        </button>
      </div>


      

      <div className="text-sm p-2  rounded border border-border">
        <div className="text-xs text-muted-foreground mb-1">{t('flow_builder.when', 'When')}</div>

        <div className="flex items-center gap-1 flex-wrap">
          {summaryChannelTypes.length > 0 ? (
            summaryChannelTypes.map((channelValue, index) => {
              const channelInfo = channelTypes.find((entry) => entry.value === channelValue);
              if (!channelInfo) return null;
              return (
                <span key={channelValue} className="flex items-center gap-1">
                  {index > 0 && <span className="text-muted-foreground">,</span>}
                  <i className={`${channelInfo.icon} ${channelInfo.color} text-xs`}></i>
                  <span className="font-medium text-xs">{channelInfo.label}</span>
                </span>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">{t('flow_builder.trigger_no_channels', 'No channels')}</span>
          )}
          <span className="text-muted-foreground">{t('flow_builder.message_lowercase', 'message')}</span>
        </div>

        {data.conditionType !== 'any' && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span>{t('flow_builder.that', 'that')} {getConditionLabel(data.conditionType)}</span>
            {data.conditionType === 'multiple_keywords' && data.multipleKeywords ? (
              <div className="flex flex-wrap gap-1">
                {parseKeywords(data.multipleKeywords).slice(0, 3).map((keyword, index) => (
                  <span key={index} className="font-medium bg-primary/10 rounded px-1">
                    "{keyword}"
                  </span>
                ))}
                {parseKeywords(data.multipleKeywords).length > 3 && (
                  <span className="text-muted-foreground">
                    {t('flow_builder.trigger_more_keywords', '+{{count}} more', { count: parseKeywords(data.multipleKeywords).length - 3 })}
                  </span>
                )}
              </div>
            ) : data.conditionValue && (
              <span className="font-medium bg-primary/10 rounded px-1">
                "{data.conditionValue}"
              </span>
            )}
          </div>
        )}

        {data.hardResetKeyword && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span className="text-orange-600 dark:text-orange-400">{t('flow_builder.hard_reset_label', 'Hard Reset')}:</span>
            <span className="font-medium bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded px-1">
              "{data.hardResetKeyword}"
            </span>
          </div>
        )}

        {data.enableSessionPersistence !== false && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span className="text-blue-600 dark:text-blue-400">{t('flow_builder.session_active', 'Session')}:</span>
            <span className="font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded px-1">
              {data.sessionTimeout || 30} {data.sessionTimeoutUnit || 'minutes'}
            </span>
          </div>
        )}

        {data.enableInitialMessageOutput === true && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span className="text-teal-600 dark:text-teal-400">
              {t('flow_builder.trigger_initial_message_output', 'Initial message output')}:
            </span>
            <span className="font-medium bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded px-1">
              {resolveMessageTriggerInitialSourceMode(data.initialMessageSourceMode) ===
              MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD
                ? t('flow_builder.trigger_initial_source_meta_ad', 'Meta ad routing')
                : t('flow_builder.trigger_initial_source_generic', 'Generic initial message')}
            </span>
            {resolveMessageTriggerInitialSourceMode(data.initialMessageSourceMode) ===
              MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD &&
              Array.isArray(data.metaAdRoutingKeys) &&
              data.metaAdRoutingKeys.length > 0 && (
                <span className="font-medium bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded px-1">
                  {data.metaAdRoutingKeys.length === 1
                    ? `"${data.metaAdRoutingKeys[0]}"`
                    : t('flow_builder.trigger_routing_keys_count', '{{count}} routing keys', {
                        count: data.metaAdRoutingKeys.length,
                      })}
                </span>
              )}
          </div>
        )}

        {isMessageReceivedTrigger && stageScope.kind === 'stage-scoped' && (() => {
          const pipeline = pipelines?.find((p) => p.id === stageScope.pipelineId);
          const stage = pipelineStages.find((s) => s.id === stageScope.stageId);
          const pipelineLabel =
            pipeline?.name ??
            t('flow_builder.trigger_pipeline_fallback', 'Pipeline #{{id}}', {
              id: stageScope.pipelineId,
            });
          const stageLabel =
            stage?.name ??
            t('flow_builder.trigger_stage_fallback', 'Stage #{{id}}', { id: stageScope.stageId });
          return (
            <div className="mt-1 text-xs flex flex-wrap gap-1">
              <span className="text-purple-600 dark:text-purple-400">{t('flow_builder.trigger_stage_filter', 'Stage filter')}:</span>
              <span className="font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded px-1">
                {pipelineLabel} / {stageLabel}
              </span>
            </div>
          );
        })()}

        {isMessageReceivedTrigger && stageScope.kind === 'invalid' && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span className="text-amber-600 dark:text-amber-400">{t('flow_builder.trigger_stage_filter', 'Stage filter')}:</span>
            <span className="font-medium bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded px-1">
              {t('flow_builder.trigger_stage_filter_incomplete', 'Stage filter incomplete')}
            </span>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 text-xs space-y-2 p-2 border rounded ">
          <div>
            <label className="block mb-1 font-medium text-blue-600 dark:text-blue-400">
              Trigger Type
            </label>
            <select
              className="w-full p-1 border rounded bg-background text-xs"
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value);
                updateNodeData({ triggerType: e.target.value });
              }}
            >
              <option value="message_received">Message Received</option>
              {/* <option value="webhook">Webhook</option>
              <option value="schedule">Schedule</option>
              <option value="manual">Manual</option>
              <option value="deal_enters_pipeline">Deal Enters Pipeline</option>
              <option value="deal_moves_between_pipelines">Deal Moves Between Pipelines</option>
              <option value="deal_stage_changed">Deal Stage Changed</option> */}
            </select>
          </div>

          {triggerType === 'deal_enters_pipeline' && (
            <div>
              <label className="block mb-1 font-medium">Target Pipeline</label>
              <select
                className="w-full p-1 border rounded bg-background text-xs"
                value={data.pipelineId?.toString() || ''}
                onChange={(e) => updateNodeData({ pipelineId: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Select pipeline</option>
                {pipelines?.map((p: Pipeline) => (
                  <option key={p.id} value={p.id.toString()}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {triggerType === 'deal_moves_between_pipelines' && (
            <>
              <div>
                <label className="block mb-1 font-medium">From Pipeline (Optional)</label>
                <select
                  className="w-full p-1 border rounded bg-background text-xs"
                  value={data.fromPipelineId?.toString() || 'any'}
                  onChange={(e) => updateNodeData({ fromPipelineId: e.target.value === 'any' ? null : parseInt(e.target.value) })}
                >
                  <option value="any">Any Pipeline</option>
                  {pipelines?.map((p: Pipeline) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 font-medium">To Pipeline (Optional)</label>
                <select
                  className="w-full p-1 border rounded bg-background text-xs"
                  value={data.toPipelineId?.toString() || 'any'}
                  onChange={(e) => updateNodeData({ toPipelineId: e.target.value === 'any' ? null : parseInt(e.target.value) })}
                >
                  <option value="any">Any Pipeline</option>
                  {pipelines?.map((p: Pipeline) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {triggerType === 'message_received' && (
            <>
          <div>
            <label className="block mb-1 font-medium text-blue-600 dark:text-blue-400">
              {t('flow_builder.channel_types', 'Channel Types')}
            </label>
            <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
              {visibleChannelTypes.map(channelType => (
                <label key={channelType.value} className="flex items-center space-x-1 p-1 hover: rounded cursor-pointer">
                  <input
                    type="radio"
                    name={`channel-type-${id}`}
                    checked={selectedChannelTypes[0] === channelType.value}
                    onChange={() => handleChannelTypeSelect(channelType.value)}
                    className="w-3 h-3"
                  />
                  <i className={`${channelType.icon} ${channelType.color} text-[10px]`}></i>
                  <span className="text-[10px] truncate">{channelType.label}</span>
                </label>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">
              {isMetaAdRoutingMode
                ? t(
                    'flow_builder.channel_types_help_meta_ad',
                    'Select a Meta channel for ad routing. Only Messenger, Instagram, and WhatsApp channels are available in this mode.'
                  )
                : t(
                    'flow_builder.channel_types_help_checkbox',
                    'Select the channel type this trigger should respond to.'
                  )}
            </div>
          </div>

          <div>
            <label className="block mb-1 font-medium">{t('flow_builder.trigger_condition_type', 'Condition Type')}</label>
            <select
              className="w-full p-1 border rounded bg-background text-xs"
              value={localConditionType}
              onChange={handleConditionTypeChange}
            >
              {conditionTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {localConditionType !== 'any' && localConditionType !== 'media' && (
            <div>
              <label className="block mb-1 font-medium">
                {localConditionType === 'multiple_keywords' ? t('flow_builder.trigger_multiple_keywords', 'Multiple Keywords') : t('flow_builder.trigger_pattern', 'Pattern')}
              </label>
              {localConditionType === 'multiple_keywords' ? (
                <div>
                  <input data-tour="pages-flow-builder.input.flow_builder.trigger_keywords_help"
                    className={`w-full p-1 border rounded bg-background text-xs ${
                      multipleKeywords && !validateKeywords(multipleKeywords) ? 'border-destructive' : ''
                    }`}
                    placeholder={getConditionPlaceholder(localConditionType)}
                    value={multipleKeywords}
                    onChange={handleMultipleKeywordsChange}
                  />
                  {!multipleKeywords && (
                    <div className="text-[9px] text-muted-foreground mt-1">
                      {t('flow_builder.trigger_keywords_help', 'Enter keywords separated by commas. The trigger will activate when any of these keywords is detected in a message.')}
                    </div>
                  )}
                  {multipleKeywords && (
                    <div className="mt-2">
                      <div className="text-[9px] text-muted-foreground mb-1">{t('flow_builder.trigger_keywords_label', 'Keywords:')}</div>
                      <div className="flex flex-wrap gap-1">
                        {parseKeywords(multipleKeywords).map((keyword, index) => (
                          <span
                            key={index}
                            className="inline-block bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 text-[9px] px-1.5 py-0.5 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                      {!validateKeywords(multipleKeywords) && (
                        <div className="text-[9px] text-red-600 dark:text-red-400 mt-1">
                          {t('flow_builder.trigger_keywords_required', 'At least one keyword is required')}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex items-center space-x-2">
                    <input data-tour="pages-flow-builder.input.flow_builder.trigger_case_sensitive"
                      type="checkbox"
                      id="case-sensitive-keywords"
                      checked={keywordsCaseSensitive}
                      onChange={(e) => handleKeywordsCaseSensitiveChange(e.target.checked)}
                      className="w-3 h-3"
                    />
                    <label htmlFor="case-sensitive-keywords" className="text-[10px] text-muted-foreground">
                      {t('flow_builder.trigger_case_sensitive', 'Case sensitive matching')}
                    </label>
                  </div>
                </div>
              ) : (
                <input data-tour="pages-flow-builder.input.localConditionValue"
                  className="w-full p-1 border rounded bg-background text-xs"
                  placeholder={getConditionPlaceholder(localConditionType)}
                  value={localConditionValue}
                  onChange={handleConditionValueChange}
                />
              )}
            </div>
          )}

          <div className="border-t pt-2 mt-2">
            <label className="block mb-1 font-medium text-purple-600 dark:text-purple-400">
              {t('flow_builder.trigger_pipeline_stage_filter', 'Pipeline Stage Filter')}
            </label>
            <div className="text-[9px] text-muted-foreground mb-2">
              {t(
                'flow_builder.trigger_pipeline_stage_filter_help',
                'Optional. When set, this flow starts only if the contact has an active deal in this pipeline stage.'
              )}
            </div>

            <div className="space-y-2">
              <div>
                <label className="block mb-1 font-medium text-[10px]">
                  {t('flow_builder.trigger_select_pipeline', 'Pipeline')}
                </label>
                <select data-tour="pages-flow-builder.select.flow_builder.trigger_no_stage_filter"
                  className="w-full p-1 border rounded bg-background text-xs"
                  value={selectedPipelineId?.toString() ?? ''}
                  onChange={(e) => {
                    const pipelineId = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    if (pipelineId) {
                      updateNodeData({ pipelineId, stageId: undefined });
                    } else {
                      updateNodeData({ pipelineId: undefined, stageId: undefined });
                    }
                  }}
                >
                  <option value="">{t('flow_builder.trigger_no_stage_filter', 'No stage filter')}</option>
                  {pipelines?.map((p) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1 font-medium text-[10px]">
                  {t('flow_builder.trigger_select_stage', 'Stage')}
                </label>
                <select data-tour="pages-flow-builder.select.flow_builder.trigger_select_stage_placeholder"
                  className="w-full p-1 border rounded bg-background text-xs disabled:opacity-50"
                  value={data.stageId?.toString() ?? ''}
                  disabled={!selectedPipelineId}
                  onChange={(e) => {
                    const stageId = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    updateNodeData({ stageId });
                  }}
                >
                  <option value="">{t('flow_builder.trigger_select_stage_placeholder', 'Select stage')}</option>
                  {pipelineStages.map((stage) => (
                    <option key={stage.id} value={stage.id.toString()}>
                      {stage.name}
                    </option>
                  ))}
                </select>
                {data.stageId && pipelineStages.length > 0 && (() => {
                  const selectedStage = pipelineStages.find((s) => s.id === Number(data.stageId));
                  if (!selectedStage) return null;
                  return (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: selectedStage.color ?? '#3a86ff' }}
                      />
                      <span className="text-[9px] text-muted-foreground">{selectedStage.name}</span>
                    </div>
                  );
                })()}
              </div>

              {selectedPipelineId && !data.stageId && (
                <div className="text-[9px] text-amber-600 dark:text-amber-400">
                  {t(
                    'flow_builder.trigger_stage_filter_select_or_clear',
                    'Select a stage to enable this filter, or clear the filter.'
                  )}
                </div>
              )}

              {(data.pipelineId || data.stageId) && (
                <button data-tour="pages-flow-builder.button.flow_builder.trigger_clear_stage_filter"
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  onClick={() => updateNodeData({ pipelineId: undefined, stageId: undefined })}
                >
                  {t('flow_builder.trigger_clear_stage_filter', 'Clear filter')}
                </button>
              )}
            </div>
          </div>

          <div className="border-t pt-2 mt-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block font-medium text-blue-600 dark:text-blue-400">
                {t('flow_builder.trigger_initial_message_output', 'Initial message output')}
              </label>
              <div className="flex items-center space-x-2">
                <input data-tour="pages-flow-builder.input.flow_builder.trigger_enable"
                  type="checkbox"
                  id={`initial-message-output-${id}`}
                  checked={enableInitialMessageOutput}
                  onChange={(e) => handleEnableInitialMessageOutputChange(e.target.checked)}
                  className="w-3 h-3"
                />
                <label htmlFor={`initial-message-output-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.trigger_enable', 'Enable')}
                </label>
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground">
              {t('flow_builder.trigger_initial_message_output_help', 'Expose a separate output path for the first inbound message after a contact is created.')}
            </div>

            {enableInitialMessageOutput && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block mb-1 font-medium text-[10px]">
                    {t('flow_builder.trigger_initial_source_mode', 'Initial message source')}
                  </label>
                  <select data-tour="pages-flow-builder.select.flow_builder.trigger_initial_source_generic"
                    className="w-full p-1 border rounded bg-background text-xs"
                    value={initialMessageSourceMode}
                    onChange={(e) =>
                      handleInitialMessageSourceModeChange(
                        e.target.value as MessageTriggerInitialSourceMode
                      )
                    }
                  >
                    <option value={MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC}>
                      {t('flow_builder.trigger_initial_source_generic', 'Generic initial message')}
                    </option>
                    <option value={MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD}>
                      {t('flow_builder.trigger_initial_source_meta_ad', 'Meta ad routing')}
                    </option>
                  </select>
                  <div className="text-[9px] text-muted-foreground mt-1">
                    {initialMessageSourceMode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD
                      ? t(
                          'flow_builder.trigger_initial_source_meta_ad_help',
                          'Start this flow only when the first inbound message includes a matching Meta ad routing key.'
                        )
                      : t(
                          'flow_builder.trigger_initial_source_generic_help',
                          'Start this flow for any qualifying first inbound message on the selected channels.'
                        )}
                  </div>
                </div>

                {initialMessageSourceMode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD && (
                  <div>
                    <label className="block mb-1 font-medium text-[10px]">
                      {t('flow_builder.trigger_meta_ad_routing_keys', 'Ad routing keys')}
                    </label>
                    <textarea data-tour="pages-flow-builder.textarea.flow_builder.trigger_meta_ad_routing_keys"
                      className="w-full p-1 border rounded bg-background text-xs h-14 resize-none"
                      placeholder={t(
                        'flow_builder.trigger_meta_ad_routing_keys_placeholder',
                        'Enter one or more routing keys, separated by commas or new lines'
                      )}
                      value={metaAdRoutingKeysInput}
                      onChange={handleMetaAdRoutingKeysChange}
                    />
                    {configuredRoutingKeys.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {configuredRoutingKeys.slice(0, 4).map((key) => (
                          <span
                            key={key}
                            className="inline-block bg-teal-100 dark:bg-teal-900/20 text-teal-800 dark:text-teal-400 text-[9px] px-1.5 py-0.5 rounded"
                          >
                            {key}
                          </span>
                        ))}
                        {configuredRoutingKeys.length > 4 && (
                          <span className="text-[9px] text-muted-foreground">
                            {t('flow_builder.trigger_more_routing_keys', '+{{count}} more', {
                              count: configuredRoutingKeys.length - 4,
                            })}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-[9px] text-muted-foreground mt-1">
                      {t(
                        'flow_builder.trigger_meta_ad_routing_keys_help',
                        'Use exact ad routing keys from Meta referral metadata. Messages without a matching key will not start this flow.'
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-2 mt-2">
            <label className="block mb-1 font-medium text-orange-600 dark:text-orange-400">
              {t('flow_builder.hard_reset_keyword', 'Hard Reset Keyword')}
            </label>
            <input data-tour="pages-flow-builder.input.flow_builder.hard_reset_keyword"
              className="w-full p-1 border rounded bg-background text-xs"
              placeholder={t('flow_builder.hard_reset_keyword_placeholder', 'reset, restart, newchat, etc.')}
              value={hardResetKeyword}
              onChange={handleHardResetKeywordChange}
            />
            <div className="text-[9px] text-muted-foreground mt-1">
              {t('flow_builder.hard_reset_keyword_help', 'When bot is disabled, users can type this keyword to re-enable the bot and start fresh')}
            </div>
          </div>

          {hardResetKeyword && (
            <div>
              <label className="block mb-1 font-medium text-orange-600">
                {t('flow_builder.hard_reset_confirmation_message', 'Reset Confirmation Message')}
              </label>
              <textarea data-tour="pages-flow-builder.textarea.flow_builder.hard_reset_confirmation_message"
                className="w-full p-1 border rounded bg-background text-xs h-12 resize-none"
                placeholder={t('flow_builder.hard_reset_confirmation_placeholder', 'Bot has been reactivated. Starting fresh conversation...')}
                value={hardResetConfirmationMessage}
                onChange={handleHardResetConfirmationMessageChange}
              />
              <div className="text-[9px] text-muted-foreground mt-1">
                {t('flow_builder.hard_reset_confirmation_help', 'Message sent to user when hard reset is triggered')}
              </div>
            </div>
          )}

          <div className="border-t pt-2 mt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block font-medium text-blue-600 dark:text-blue-400">
                {t('flow_builder.session_persistence', 'Session-Based Triggering')}
              </label>
              <div className="flex items-center space-x-2">
                <input data-tour="pages-flow-builder.input.flow_builder.trigger_enable"
                  type="checkbox"
                  id={`session-persistence-${id}`}
                  checked={enableSessionPersistence}
                  readOnly
                  disabled
                  className="w-3 h-3 opacity-50 cursor-not-allowed"
                />
                <label htmlFor={`session-persistence-${id}`} className="text-xs text-muted-foreground cursor-not-allowed">{t('flow_builder.trigger_enable', 'Enable')}</label>
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground mb-2">
              {t('flow_builder.session_persistence_help', 'When enabled, users who match the condition will continue triggering this flow for subsequent messages until session expires')}
            </div>

            {enableSessionPersistence && (
              <div className="space-y-2 pt-2 border-t">
                <label className="block mb-1 font-medium text-xs">
                  {t('flow_builder.session_timeout', 'Session Timeout')}
                </label>
                <div className="flex gap-2">
                  <NumberInput
                    min={1}
                    max={1440}
                    value={sessionTimeout}
                    onChange={(value) => {
                      setSessionTimeout(value);
                      updateNodeData({ sessionTimeout: value });
                    }}
                    fallbackValue={30}
                    className="flex-1 p-1 border rounded bg-background text-xs"
                  />
                  <select data-tour="pages-flow-builder.select.flow_builder.trigger_minutes"
                    className="p-1 border rounded bg-background text-xs"
                    value={sessionTimeoutUnit}
                    onChange={handleSessionTimeoutUnitChange}
                  >
                    <option value="minutes">{t('flow_builder.trigger_minutes', 'Minutes')}</option>
                    <option value="hours">{t('flow_builder.trigger_hours', 'Hours')}</option>
                    <option value="days">{t('flow_builder.trigger_days', 'Days')}</option>
                  </select>
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {t('flow_builder.session_timeout_help', 'After this period of inactivity, the user session will reset and conditions will be evaluated again')}
                </div>
              </div>
            )}
          </div>
            </>
          )}

          <div className="text-[10px] text-muted-foreground mt-2">
            {t('flow_builder.changes_saved_automatically', 'Changes are saved automatically when you save the flow.')}
          </div>
        </div>
      )}

      {/* Dynamic output handles based on condition type */}
      {localConditionType === 'multiple_keywords' && multipleKeywords ? (
        <div className="relative">
          {/* Multiple keyword handles */}
          {parseKeywords(multipleKeywords).map((keyword, index) => (
            <div key={`keyword-${keyword}`} className="absolute" style={{ left: `${20 + (index * 60)}px`, bottom: '-30px' }}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`keyword-${keyword.toLowerCase().replace(/\s+/g, '-')}`}
                style={{
                  ...standardHandleStyle,
                  position: 'relative',
                  left: '0px',
                  bottom: '0px'
                }}
                isConnectable={isConnectable}
              />
              <div className="absolute top-5 left-1/2 transform -translate-x-1/2 text-[8px] text-muted-foreground whitespace-nowrap bg-background px-1 rounded border">
                {keyword}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            ...standardHandleStyle,
            right: '-6px',
            top:
              triggerType === 'message_received' && enableInitialMessageOutput
                ? '38%'
                : '50%',
            transform: 'translateY(-50%)'
          }}
          isConnectable={isConnectable}
        />
      )}

      {triggerType === 'message_received' && enableInitialMessageOutput && isMetaAdRoutingMode && (
        <div className="relative">
          {configuredRoutingKeys.map((routingKey, index) => (
            <div
              key={routingKey}
              className="absolute flex flex-col items-center gap-0.5"
              style={{ left: `${20 + index * 80}px`, bottom: '-30px' }}
            >
              <Handle
                type="source"
                position={Position.Bottom}
                id={deriveMessageTriggerMetaAdRoutingHandleId(routingKey)}
                style={{
                  ...standardHandleStyle,
                  position: 'relative',
                  left: '0px',
                  bottom: '0px',
                }}
                isConnectable={isConnectable}
              />
              <div className="absolute top-5 left-1/2 transform -translate-x-1/2 text-[8px] text-muted-foreground whitespace-nowrap bg-background px-1 rounded border max-w-[72px] truncate">
                {routingKey}
              </div>
            </div>
          ))}
        </div>
      )}

      {triggerType === 'message_received' &&
        enableInitialMessageOutput &&
        !isMetaAdRoutingMode && (
        <div
          className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
          style={{ right: '-6px', top: '68%', transform: 'translate(50%, -50%)' }}
        >
          <Handle
            type="source"
            position={Position.Right}
            id={MESSAGE_TRIGGER_INITIAL_HANDLE_ID}
            style={{
              ...standardHandleStyle,
              position: 'relative',
              right: '0px',
              top: '0px',
              transform: 'none',
              pointerEvents: 'all',
            }}
            isConnectable={isConnectable}
          />
          <span className="text-[8px] text-muted-foreground whitespace-nowrap bg-background px-1 rounded border">
            {t('flow_builder.trigger_initial_message_handle', 'Initial message')}
          </span>
        </div>
      )}
    </div>
  );
}




function WaitNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const [waitMode, setWaitMode] = useState(data.waitMode || 'duration');

  const [timeValue, setTimeValue] = useState(data.timeValue || 5);
  const [timeUnit, setTimeUnit] = useState(data.timeUnit || 'minutes');

  const [waitDate, setWaitDate] = useState<Date | undefined>(
    data.waitDate ? new Date(data.waitDate) : undefined
  );
  const [waitTime, setWaitTime] = useState(data.waitTime || '12:00');
  const [timezone, setTimezone] = useState(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  const handleModeChange = (newMode: string) => {
    setWaitMode(newMode);
    updateNodeData({ waitMode: newMode });
  };

  const handleTimeValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    setTimeValue(value);
    updateNodeData({ timeValue: value });
  };

  const handleTimeUnitChange = (value: string) => {
    setTimeUnit(value);
    updateNodeData({ timeUnit: value });
  };

  const handleDateChange = (date: Date | undefined) => {
    setWaitDate(date);
    updateNodeData({ waitDate: date ? date.toISOString() : null });
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWaitTime(e.target.value);
    updateNodeData({ waitTime: e.target.value });
  };

  const handleTimezoneChange = (value: string) => {
    setTimezone(value);
    updateNodeData({ timezone: value });
  };

  const formatDate = (date: Date | undefined): string => {
    if (!date) return t('flow_builder.wait_no_date_selected', 'No date selected');
    return date.toLocaleDateString();
  };

  const getWaitDescription = (): string => {
    if (waitMode === 'duration') {
      return t('flow_builder.wait_for_duration', 'Wait for {{value}} {{unit}}', { value: timeValue, unit: timeUnit });
    } else {
      if (!waitDate) return t('flow_builder.wait_schedule_not_set', 'Schedule not set');
      return t('flow_builder.wait_scheduled_for', 'Scheduled for {{date}} at {{time}} ({{timezone}})', {
        date: formatDate(waitDate),
        time: waitTime,
        timezone: timezone.split('/').pop()?.replace('_', ' ') || timezone
      });
    }
  };

  return (
    <div className="node-wait p-3 rounded-lg bg-card border border-border shadow-sm max-w-[250px] group">
      <NodeToolbar id={id} onDuplicate={onDuplicateNode} onDelete={onDeleteNode} />

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src={APP_ICONS.wait}
          alt="Wait" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.wait_node_title', 'Wait')}</span>
        <button data-tour="pages-flow-builder.button.common.done"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button data-tour="pages-flow-builder.button.flow_builder.wait_duration_mode"
              type="button"
              size="sm"
              variant={waitMode === 'duration' ? 'default' : 'outline'}
              onClick={() => handleModeChange('duration')}
              className="text-xs"
            >
              <Clock className="h-3 w-3 mr-1" />
              {t('flow_builder.wait_duration_mode', 'Duration')}
            </Button>
            <Button data-tour="pages-flow-builder.button.flow_builder.wait_schedule_mode"
              type="button"
              size="sm"
              variant={waitMode === 'datetime' ? 'default' : 'outline'}
              onClick={() => handleModeChange('datetime')}
              className="text-xs"
            >
              <CalendarClock className="h-3 w-3 mr-1" />
              {t('flow_builder.wait_schedule_mode', 'Schedule')}
            </Button>
          </div>

          {waitMode === 'duration' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_time_value', 'Duration')}</label>
                <NumberInput
                  min={1}
                  value={timeValue}
                  onChange={(value) => {
                    setTimeValue(value);
                    updateNodeData({ timeValue: value });
                  }}
                  fallbackValue={1}
                  className="w-full p-1 border rounded bg-background text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_time_unit', 'Unit')}</label>
                <Select value={timeUnit} onValueChange={handleTimeUnitChange}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">{t('flow_builder.wait_seconds', 'Seconds')}</SelectItem>
                    <SelectItem value="minutes">{t('flow_builder.wait_minutes', 'Minutes')}</SelectItem>
                    <SelectItem value="hours">{t('flow_builder.wait_hours', 'Hours')}</SelectItem>
                    <SelectItem value="days">{t('flow_builder.wait_days', 'Days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_date', 'Date')}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button

                      variant="brand"
                      size="sm"
                      className="w-full justify-start text-left font-normal h-8 text-xs"
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {waitDate ? formatDate(waitDate) : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={waitDate}
                      onSelect={handleDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_time', 'Time')}</label>
                <input data-tour="pages-flow-builder.input.flow_builder.wait_time"
                  type="time"
                  className="w-full h-8 p-1 border rounded bg-background text-xs"
                  value={waitTime}
                  onChange={handleTimeChange}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_timezone', 'Timezone')}</label>
                <Select value={timezone} onValueChange={handleTimezoneChange}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[160px]">
                    <SelectGroup>
                      {Intl.supportedValuesOf("timeZone").map((tz) => (
                        <SelectItem key={tz} value={tz} className="text-xs">
                          {tz.replace('_', ' ').split('/').pop() || tz}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm p-2  rounded border border-border">
          {getWaitDescription()}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

interface QuickReplyOption {
  text: string;
  value: string;
}

function QuickReplyNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [message, setMessage] = useState(data.message || t('flow_builder.quick_reply_default_message', 'Please select an option to continue:'));
  const [options, setOptions] = useState<QuickReplyOption[]>(
    data.options || [
      { text: t('flow_builder.quick_reply_default_option1', 'I have a question about my order.'), value: "order" },
      { text: t('flow_builder.quick_reply_default_option2', 'I have a question about a product.'), value: "product" },
      { text: t('flow_builder.quick_reply_default_option3', 'I have another question.'), value: "other" }
    ]
  );

  const [invalidResponseMessage, setInvalidResponseMessage] = useState(
    data.invalidResponseMessage || t('flow_builder.quick_reply_invalid_response', "I didn't understand your selection. Please choose one of the available options:")
  );

  const [enableGoBack, setEnableGoBack] = useState(data.enableGoBack !== false);
  const [goBackText, setGoBackText] = useState(data.goBackText || t('flow_builder.quick_reply_go_back_default', '← Go Back'));
  const [goBackValue, setGoBackValue] = useState(data.goBackValue || 'go_back');

  const [showPreview, setShowPreview] = useState(false);
  const { setNodes } = useReactFlow();
  const flowNodes = useNodes();
  const flowContext = useFlowContext();

  const canvasOutputVariables = useMemo(() => getFlowNodeVariablesFromNodes(flowNodes), [flowNodes]);
  const availableVariables = useMemo(() => {
    const variables = new Map<string, { name: string; description: string }>();
    BASE_VARIABLES.forEach((variable) => variables.set(variable.value, { name: variable.value, description: variable.description }));
    [
      { name: 'date.today', description: t('flow_builder.var_date_today', 'Current date') },
      { name: 'time.now', description: t('flow_builder.var_time_now', 'Current time') },
    ].forEach((variable) => variables.set(variable.name, variable));
    canvasOutputVariables.forEach((variable) => variables.set(variable.value, { name: variable.value, description: variable.description }));
    (flowContext?.customVariables ?? []).forEach((variable) => variables.set(variable.name, { name: variable.name, description: variable.description ?? variable.label }));
    return [...variables.values()];
  }, [canvasOutputVariables, flowContext?.customVariables, t]);

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  const handleEnableGoBackChange = (checked: boolean) => {
    setEnableGoBack(checked);
    updateNodeData({ enableGoBack: checked });
  };

  const handleGoBackTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setGoBackText(newText);
    updateNodeData({ goBackText: newText });
  };

  const handleGoBackValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setGoBackValue(newValue);
    updateNodeData({ goBackValue: newValue });
  };

  const handleOptionTextChange = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], text };
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const handleOptionValueChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], value };
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const addOption = () => {
    const newOptions = [...options, { text: t('flow_builder.quick_reply_new_option', 'New option'), value: `option${options.length + 1}` }];
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };


  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const newOptions = [...options];
    const draggedOption = newOptions[draggedIndex];


    newOptions.splice(draggedIndex, 1);


    newOptions.splice(dropIndex, 0, draggedOption);

    setOptions(newOptions);
    updateNodeData({ options: newOptions });
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };


  const [selectedOptions, setSelectedOptions] = useState<Set<number>>(new Set());

  const toggleOptionSelection = (index: number) => {
    const newSelected = new Set(selectedOptions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedOptions(newSelected);
  };

  const selectAllOptions = () => {
    setSelectedOptions(new Set(options.map((_, index) => index)));
  };

  const deselectAllOptions = () => {
    setSelectedOptions(new Set());
  };

  const bulkDeleteOptions = () => {
    const newOptions = options.filter((_, index) => !selectedOptions.has(index));
    if (newOptions.length === 0) {

      return;
    }
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
    setSelectedOptions(new Set());
  };

  const bulkDuplicateOptions = () => {
    const newOptions = [...options];
    selectedOptions.forEach(index => {
      const optionToDuplicate = options[index];
      newOptions.push({
        text: `${optionToDuplicate.text} (Copy)`,
        value: `${optionToDuplicate.value}_copy`
      });
    });
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
    setSelectedOptions(new Set());
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if (!isEditing) return;
      const target = e.target as HTMLElement | null;
      const isTypingTarget = Boolean(
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], .ql-editor, .ProseMirror'
        )
      );


      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && e.target instanceof HTMLElement &&
          e.target.closest('.node-quickreply')) {
        if (isTypingTarget) return;
        e.preventDefault();
        selectAllOptions();
        return;
      }


      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedOptions.size > 0) {
        e.preventDefault();
        bulkDuplicateOptions();
        return;
      }


      if (e.key === 'Delete' && selectedOptions.size > 0 &&
          e.target instanceof HTMLElement && e.target.closest('.node-quickreply')) {
        e.preventDefault();
        bulkDeleteOptions();
        return;
      }


      if (e.key === 'Escape' && selectedOptions.size > 0) {
        e.preventDefault();
        deselectAllOptions();
        return;
      }


      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && options.length < 10) {
        e.preventDefault();
        addOption();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, selectedOptions, options.length, selectAllOptions, bulkDuplicateOptions, bulkDeleteOptions, deselectAllOptions, addOption]);

  const validateVariables = (text: string) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const validVariables = availableVariables.map(v => v.name);
    const issues: string[] = [];
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (!validVariables.includes(variableName)) {
        issues.push(`Unknown variable: {{${variableName}}}`);
      }
    }

    return issues;
  };


  const formatMessage = (text: string, showPreview = false) => {
    const regex = /\{\{([^}]+)\}\}/g;

    if (!regex.test(text)) {
      return text;
    }

    const parts = [];
    let lastIndex = 0;
    let match;


    const previewValues: Record<string, string> = {
      'contact.name': 'John Doe',
      'contact.phone': '+1234567890',
      'contact.username': 'johndoe',
      'date.today': new Date().toLocaleDateString(),
      'time.now': new Date().toLocaleTimeString()
    };
    canvasOutputVariables.forEach((variable) => {
      previewValues[variable.value] = variable.dataType === 'number'
        ? '123'
        : variable.dataType === 'email'
          ? 'student@example.com'
          : variable.dataType === 'phone'
            ? '+1234567890'
            : variable.dataType === 'media'
              ? 'https://example.com/file'
              : `[${variable.label}]`;
    });

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const variableName = match[1].trim();
      const validVariables = availableVariables.map(v => v.name);
      const isValid = validVariables.includes(variableName);
      const previewValue = showPreview ? previewValues[variableName] : null;

      if (showPreview && previewValue) {

        parts.push(
          <span key={match.index} className="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 px-1 rounded font-medium">
            {previewValue}
          </span>
        );
      } else {

        parts.push(
          <span
            key={match.index}
            className={`px-1 rounded ${
              isValid
                ? 'bg-primary/10 text-primary'
                : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}
            title={isValid ? `Variable: ${variableName}` : `Invalid variable: ${variableName}`}
          >
            {match[0]}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div className="node-quickreply p-3 rounded-lg bg-card border border-border shadow-sm max-w-[380px] group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img src={APP_ICONS.quickReplyOptions} alt="Quick Reply Options" className="h-4 w-4" />
        <span>{t('flow_builder.quick_reply_node_title', 'Quick Reply Options')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.quick_reply_message_label', 'Message:')}</label>
            <EnhancedVariablePicker
              value={message}
              onChange={(newMessage) => {
                setMessage(newMessage);
                updateNodeData({ message: newMessage });
              }}
              placeholder="Type your message here..."
              multiline
              className="w-full p-2 text-sm border rounded min-h-[80px] resize-none"
              flowId={flowContext?.flowId ?? undefined}
              customVariables={flowContext?.customVariables}
              additionalVariables={canvasOutputVariables}
            />

            {/* 🔧 NEW: Validation warnings for main message */}
            {(() => {
              const issues = validateVariables(message);
              return issues.length > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                  <div className="font-medium mb-1">Variable Issues:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}

          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.quick_reply_options_label', 'Options:')}</label>
              <Button data-tour="pages-flow-builder.button.flow_builder.quick_reply_add_option"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={addOption}
                disabled={options.length >= 10}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('flow_builder.quick_reply_add_option', 'Add Option')}
              </Button>
            </div>

            {/* 🔧 NEW: Bulk operations controls */}
            {options.length > 1 && (
              <div className="mb-3 p-2  rounded border">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {selectedOptions.size > 0 ? `${selectedOptions.size} selected` : 'Bulk actions:'}
                    </span>
                    <button
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-500"
                      onClick={selectedOptions.size === options.length ? deselectAllOptions : selectAllOptions}
                    >
                      {selectedOptions.size === options.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  {selectedOptions.size > 0 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={bulkDuplicateOptions}
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500"
                        onClick={bulkDeleteOptions}
                        disabled={options.length - selectedOptions.size < 1}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {options.map((option, index) => (
                <div
                  key={index}
                  className={`space-y-2 relative border rounded-lg p-2 transition-all ${
                    draggedIndex === index
                      ? 'opacity-50 scale-95 border-primary/50'
                      : 'border-transparent hover:border-border'
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-center gap-2">
                    {/* 🔧 NEW: Bulk selection checkbox */}
                    {options.length > 1 && (
                      <input
                        type="checkbox"
                        className="flex-shrink-0 w-4 h-4 rounded border-input"
                        checked={selectedOptions.has(index)}
                        onChange={() => toggleOptionSelection(index)}
                      />
                    )}
                    {/* 🔧 NEW: Drag handle */}
                    <div className="flex-shrink-0 cursor-move text-muted-foreground hover:text-foreground">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zM7 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zM7 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zM13 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 2zM13 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zM13 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z"/>
                      </svg>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 font-medium text-xs">Option {index + 1}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeOption(index)}
                      disabled={options.length <= 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="pl-8 space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Display Text:</label>
                      <input data-tour="pages-flow-builder.input.option.text"
                        className="w-full p-2 text-sm border rounded"
                        value={option.text}
                        onChange={(e) => handleOptionTextChange(index, e.target.value)}
                        placeholder="Text to display"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Response Value:</label>
                      <input data-tour="pages-flow-builder.input.option.value"
                        className="w-full p-2 text-sm border rounded"
                        value={option.value}
                        onChange={(e) => handleOptionValueChange(index, e.target.value)}
                        placeholder="Value to match"
                      />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        User can respond with this value to select this option
                      </div>
                    </div>
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`option-${index + 1}`}
                    style={{
                      ...standardHandleStyle,
                      top: '30px',
                      right: '-12px'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              ))}
            </div>

            <div className="text-[10px] text-muted-foreground mt-2 space-y-1">
              <div>Each option will have its own output connection.</div>
              {/* 🔧 NEW: Keyboard shortcuts help */}
              <div className="text-[9px] text-muted-foreground/70">
                <strong>Shortcuts:</strong> Ctrl+A (select all), Ctrl+D (duplicate), Del (delete), Esc (deselect), Ctrl+Enter (add option)
              </div>
            </div>
          </div>

          {/* 🔧 NEW: Invalid Response Message Section */}
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.quick_reply_invalid_response_label', 'Invalid Response Message:')}</label>
            <EnhancedVariablePicker
              value={invalidResponseMessage}
              onChange={(newValue) => {
                setInvalidResponseMessage(newValue);
                updateNodeData({ invalidResponseMessage: newValue });
              }}
              placeholder="Message to send when user's response doesn't match any option..."
              multiline
              className="w-full p-2 text-sm border rounded min-h-[60px] resize-none"
              flowId={flowContext?.flowId ?? undefined}
              customVariables={flowContext?.customVariables}
              additionalVariables={canvasOutputVariables}
            />

            {/* 🔧 NEW: Validation warnings for invalid response message */}
            {(() => {
              const issues = validateVariables(invalidResponseMessage);
              return issues.length > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                  <div className="font-medium mb-1">Variable Issues:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <div className="text-[10px] text-muted-foreground mt-2">
              This message will be sent when the user's response doesn't match any of the option values above.
            </div>
          </div>

          {/* 🔧 NEW: Go Back Option Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.quick_reply_go_back_label', 'Go Back Option:')}</label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableGoBack}
                  onChange={(e) => handleEnableGoBackChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-muted-foreground">Enable Go Back</span>
              </label>
            </div>
            
            {enableGoBack && (
              <div className="space-y-2 p-3 border rounded-lg ">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Display Text:</label>
                  <input data-tour="pages-flow-builder.input.goBackText"
                    className="w-full p-2 text-sm border rounded"
                    value={goBackText}
                    onChange={handleGoBackTextChange}
                    placeholder="← Go Back"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Text shown to users for the go back option
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Response Value:</label>
                  <input data-tour="pages-flow-builder.input.goBackValue"
                    className="w-full p-2 text-sm border rounded"
                    value={goBackValue}
                    onChange={handleGoBackValueChange}
                    placeholder="go_back"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Value users can type to trigger the go back action
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 🔧 NEW: Invalid Response Handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="invalid-response"
            style={{
              ...standardHandleStyle,
              top: '50%',
              right: '-12px',
              backgroundColor: '#f97316', // Orange color for invalid response
              borderColor: '#ea580c'
            }}
            isConnectable={isConnectable}
          />

          {/* 🔧 NEW: Go Back Handle */}
          {enableGoBack && (
            <Handle
              type="source"
              position={Position.Right}
              id="go-back"
              style={{
                ...standardHandleStyle,
                top: '60%',
                right: '-12px',
                backgroundColor: '#6b7280', // Gray color for go back
                borderColor: '#4b5563'
              }}
              isConnectable={isConnectable}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* 🔧 ENHANCED: Message display with validation and preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">Message</div>
              <button
                className="text-xs px-2 py-1 rounded  hover: transition-colors"
                onClick={() => setShowPreview(!showPreview)}
                title={showPreview ? "Show variables" : "Show preview values"}
              >
                {showPreview ? "Variables" : "Preview"}
              </button>
            </div>
            <div className="text-sm p-2  rounded border border-border">
              {formatMessage(message, showPreview)}
            </div>
            {/* 🔧 NEW: Validation warnings */}
            {(() => {
              const issues = validateVariables(message);
              return issues.length > 0 && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  <div className="font-medium mb-1">Variable Issues:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>

          <div className="space-y-1.5 mt-3">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2 relative">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </div>
                <div className="text-sm flex-1 pr-6">
                  <div>{option.text}</div>
                  <div className="text-xs text-muted-foreground">
                    Responds to: "{option.value}"
                  </div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${index + 1}`}
                  style={{
                    ...standardHandleStyle,
                    top: '50%',
                    right: '-12px'
                  }}
                  isConnectable={isConnectable}
                />
              </div>
            ))}
            
            {/* 🔧 NEW: Go Back Option Display */}
            {enableGoBack && (
              <div className="flex items-center gap-2 relative">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-muted-foreground text-primary-foreground flex items-center justify-center text-xs font-medium">
                  ←
                </div>
                <div className="text-sm flex-1 pr-6">
                  <div>{goBackText}</div>
                  <div className="text-xs text-muted-foreground">
                    Responds to: "{goBackValue}"
                  </div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="go-back"
                  style={{
                    ...standardHandleStyle,
                    top: '50%',
                    right: '-12px',
                    backgroundColor: '#6b7280', // Gray color for go back
                    borderColor: '#4b5563'
                  }}
                  isConnectable={isConnectable}
                />
              </div>
            )}
          </div>

          {/* 🔧 NEW: Invalid Response Indicator in View Mode */}
          <div className="flex items-center gap-2 relative mt-3 pt-2 border-t border-border/50">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-orange-500 dark:bg-orange-400 text-white flex items-center justify-center text-xs font-medium">
              !
            </div>
            <div className="text-sm flex-1 pr-6">
              <div className="text-orange-700 dark:text-orange-400 font-medium">Invalid Response</div>
              <div className="text-xs text-muted-foreground">
                {invalidResponseMessage.length > 50
                  ? `${invalidResponseMessage.substring(0, 50)}...`
                  : invalidResponseMessage}
              </div>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id="invalid-response"
              style={{
                ...standardHandleStyle,
                top: '50%',
                right: '-12px',
                backgroundColor: '#f97316', // Orange color for invalid response
                borderColor: '#ea580c'
              }}
              isConnectable={isConnectable}
            />
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

const withExecutionIndicator = (NodeComponent: any) => {
  const WrappedNode = (props: any) => {
    const { getNodeExecutionStatus } = useFlowContext();

    return (
      <ExecutionOverlay status={getNodeExecutionStatus(props.id)}>
        <NodeComponent {...props} />
      </ExecutionOverlay>
    );
  };

  WrappedNode.displayName = `WithExecutionIndicator(${NodeComponent.displayName || NodeComponent.name || 'Node'})`;
  return WrappedNode;
};

const AIWorkflowGhostNode = ({ data }: { data: { label?: string; originalType?: string } }) => (
  <div className="min-w-[220px] rounded-xl border-2 border-dashed border-primary/70 bg-background/95 px-4 py-3 shadow-lg shadow-primary/10">
    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
      <Sparkles className="h-4 w-4" />
      {data.label || 'Generated node'}
    </div>
    <div className="mt-1 text-xs text-muted-foreground">{data.originalType || 'native node'} · AI draft</div>
  </div>
);

const baseNodeTypes: NodeTypes = {
  message: MessageNode,
  condition: ConditionNode,
  trigger: TriggerNode,
  webhookTrigger: WebhookTriggerNode,
  mastershopWebhookTrigger: MasterShopWebhookTriggerNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  document: DocumentNode,
  wait: WaitNode,
  follow_up: FollowUpNode,
  quickreply: QuickReplyNode,
  whatsapp_interactive_buttons: WhatsAppInteractiveButtonsNode,
  whatsapp_interactive_list: WhatsAppInteractiveListNode,
  whatsapp_cta_url: WhatsAppCTAURLNode,
  whatsapp_location_request: WhatsAppLocationRequestNode,
  whatsapp_poll: WhatsAppPollNode as any,

  ai_assistant: AIAssistantNode,
  mcp_client_tool: MCPClientToolNode,
  mcp_execute_tool: MCPExecuteToolNode,
  translation: TranslationNode,
  update_pipeline_stage: UpdatePipelineStageNode,
  move_deal_to_pipeline: MoveDealToPipelineNode,
  manage_contact: ManageContactNode,
  manage_task: ManageTaskNode,
  contactNotification: ContactNotificationNode,
  webhook: WebhookNode,
  http_request: HTTPRequestNode,
  database_query: DatabaseQueryNode,
  code_execution: CodeExecutionNode,
  whatsapp_flows: WhatsAppFlowsNode,
  n8n: N8nNode,
  make: MakeNode,
  google_sheets: GoogleSheetsNode,
  data_capture: DataCaptureNode,
  documind: DocumindNode,
  chat_pdf: ChatPdfNode,
  document_generator: DocumentGeneratorNode,
  gamma: GammaNode,
  bot_disable: BotDisableNode,
  end_conversation: EndConversationNode,
  bot_reset: BotResetNode,
  flow_trigger: FlowTriggerNode,
  stripe: StripeNode,
  erp: ErpNode,
  mastershop: MasterShopNode,
  woocommerce: WooCommerceNode,
  call_agent: CallAgentNode
};

const nodeTypes: NodeTypes = {
  ...(Object.fromEntries(
    Object.entries(baseNodeTypes).map(([nodeType, component]) => [nodeType, withExecutionIndicator(component)])
  ) as NodeTypes),
  notes: NotesNode,
  ai_creator_ghost: AIWorkflowGhostNode,
};

const missingRegisteredRendererTypes = VISIBLE_FLOW_NODE_TYPES.filter((type) => !nodeTypes[type]);
if (missingRegisteredRendererTypes.length) {
  throw new Error(`Flow node registry is missing React Flow renderers: ${missingRegisteredRendererTypes.join(', ')}`);
}

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              className="flex items-center justify-center w-6 h-6 rounded-full bg-background border border-red-500 dark:border-red-400 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              onClick={handleDelete}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const edgeTypes = {
  custom: CustomEdge,
  smoothstep: CustomEdge
};


function SidebarContent({
  onAdd,
  nodes,
  flowId,
  customVariables
}: {
  onAdd: (type: string) => void;
  nodes: Node[];
  flowId?: number;
  customVariables?: FlowCustomVariable[];
}) {
  const { t } = useTranslation();
  const canvasOutputVariables = useMemo(() => getFlowNodeVariablesFromNodes(nodes), [nodes]);

  return (
    <Tabs defaultValue="nodes" className="flex h-full min-h-0 w-full flex-col">
      <TabsList className="mb-4 shrink-0">
        <TabsTrigger data-tour="pages-flow-builder.tabstrigger.nodes" value="nodes">
          <Plus className="h-4 w-4" />
          {t('flow_builder.nodes', 'Nodes')}
        </TabsTrigger>
        <TabsTrigger data-tour="pages-flow-builder.tabstrigger.variables" value="variables">
          <Variable className="h-4 w-4" />
          {t('flow_builder.variables', 'Variables')}
        </TabsTrigger>
      </TabsList>

      <TabsContent data-tour="pages-flow-builder.tabscontent.nodes" value="nodes" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <NodeSelector onAdd={onAdd} nodes={nodes} />
      </TabsContent>

      <TabsContent data-tour="pages-flow-builder.tabscontent.variables" value="variables" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="h-full min-h-0">
            <VariableBrowser flowId={flowId} customVariables={customVariables} additionalVariables={canvasOutputVariables} className="h-full" />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function NodeSelector({
  onAdd,
  nodes: flowNodes,
  collapseControl
}: {
  onAdd: (type: string) => void;
  nodes: Node[];
  collapseControl?: React.ReactNode;
}) {
  const { t, currentLanguage } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const allNodes = useMemo(
    () => buildFlowNodeCatalog(t, { nodes: flowNodes }),
    [t, currentLanguage?.code, flowNodes]
  );

  const filteredNodes = searchTerm.trim() === '' ? allNodes : allNodes.filter(node => {
    const searchLower = searchTerm.toLowerCase();
    return (
      node.name.toLowerCase().includes(searchLower) ||
      node.section.toLowerCase().includes(searchLower) ||
      node.type.toLowerCase().includes(searchLower)
    );
  });

  const groupedNodes = filteredNodes.reduce((acc, node) => {
    if (!acc[node.section]) {
      acc[node.section] = [];
    }
    acc[node.section].push(node);
    return acc;
  }, {} as Record<string, typeof allNodes>);


  const clearSearch = () => {
    setSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch();
    } else if (e.key === 'Enter' && filteredNodes.length === 1 && !filteredNodes[0].disabled) {
      onAdd(filteredNodes[0].type);
    }
  };


  return (
    <div className="w-full flex flex-col h-full">
      <div className="relative mb-3 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input data-tour="pages-flow-builder.input.flow_builder.search_nodes"
          type="text"
          placeholder={t('flow_builder.search_nodes', 'Search nodes...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10 h-9 text-sm"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
            onClick={clearSearch}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h3 className="font-medium">{t('flow_builder.add_node', 'Add Node')}</h3>
        {collapseControl}
      </div>

      <div
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {searchTerm && filteredNodes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('flow_builder.no_nodes_found', 'No nodes found')}</p>
            <p className="text-xs">{t('flow_builder.try_different_search', 'Try a different search term')}</p>
          </div>
        )}

        {filteredNodes.length > 0 && (
          <div className="grid gap-4 pr-2">
            {Object.entries(groupedNodes).map(([sectionName, sectionNodes]) => (
              <div key={sectionName}>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">{sectionName}</h4>

                <div className={sectionName === 'Triggers' ? 'w-full' : 'grid gap-2'}>
                  {sectionNodes.map((node, nodeIndex) => (
                    <Button
                      key={`${sectionName}-${node.type}-${nodeIndex}`} data-tour-node-type={node.type}
                      variant="outline"
                      className={`${sectionName === 'Triggers' ? 'justify-start w-full' : 'justify-start'} ${
                        node.disabled ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      onClick={() => onAdd(node.type)}
                      disabled={node.disabled}
                      title={node.tooltip || ''}
                    >
                      <img
                        src={node.iconSrc}
                        alt={node.iconAlt}
                        className={`h-4 w-4 mr-2 object-contain shrink-0 ${node.disabled ? 'opacity-60' : node.color}`}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                      <span className="flex items-center gap-2 flex-1">
                        {node.name}
                        {(node.type === 'whatsapp_flows' || node.type === 'whatsapp_interactive_buttons' || node.type === 'whatsapp_interactive_list' || node.type === 'whatsapp_cta_url' || node.type === 'whatsapp_location_request') && (
                          <span className="px-1.5 py-0.5 text-[8px] font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded border border-green-200 dark:border-green-900">
                            Official API
                          </span>
                        )}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type FlowHistorySnapshot = {
  name: string;
  nodes: Node[];
  edges: Edge[];
  customVariables: FlowCustomVariable[];
  creatorCommit: AiCreatorCommitMetadata | null;
};

const CREATOR_TOGGLE_POSITION_KEY = 'flow-builder:creator-toggle-position';

function readCreatorTogglePosition(): number {
  if (typeof window === 'undefined') return 50;
  try {
    const stored = Number(window.localStorage.getItem(CREATOR_TOGGLE_POSITION_KEY));
    return Number.isFinite(stored) && stored >= 8 && stored <= 92 ? stored : 50;
  } catch {
    return 50;
  }
}

function cloneFlowHistorySnapshot(snapshot: FlowHistorySnapshot): FlowHistorySnapshot {
  return cloneFlowHistoryValue(snapshot);
}

function FlowEditor() {
  const { t, currentLanguage } = useTranslation();
  const { theme } = useTheme();
  const [match, params] = useRoute('/flows/:id');
  const flowId = match ? (() => {
    const parsed = parseInt(params.id, 10);
    return isNaN(parsed) ? null : parsed;
  })() : null;
  const isEditMode = flowId !== null && flowId > 0;

  const { toast } = useToast();
  const { branding } = useBranding();
  const [, navigate] = useLocation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  const initialNodes: Node[] = !isEditMode ? [
    {
      id: 'trigger-node',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: {
        label: 'Message Trigger',
        channelTypes: ['whatsapp_unofficial'],
        conditionType: 'any',
        conditionValue: '',
        enableSessionPersistence: true,
        sessionTimeout: 30,
        sessionTimeoutUnit: 'minutes',
        enableInitialMessageOutput: false,
        initialMessageSourceMode: MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC,
        metaAdRoutingKeys: []
      }
    }
  ] : [];

  const initialEdges: Edge[] = [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const tourEdgeCount = useRef(0);
  useEffect(() => {
    if (edges.length > tourEdgeCount.current) { const edge = edges[edges.length - 1]; emitTourSignal('flow-connected', edge.target); }
    tourEdgeCount.current = edges.length;
  }, [edges]);

  useEffect(() => {
    const root = reactFlowWrapper.current;
    if (!root) return;
    const frame = requestAnimationFrame(() => cleanupNodeNowheelMarks(root));
    return () => cancelAnimationFrame(frame);
  }, [nodes]);

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAutoArranging, setIsAutoArranging] = useState(false);
  const [isExecutionHistoryOpen, setIsExecutionHistoryOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isVariableManagerOpen, setIsVariableManagerOpen] = useState(false);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);
  const [customVariables, setCustomVariables] = useState<FlowCustomVariable[]>([]);
  const [autoArrangeCollapseSignal, setAutoArrangeCollapseSignal] = useState(0);
  const [saveSessionPromptOpen, setSaveSessionPromptOpen] = useState(false);
  const [goBackPromptOpen, setGoBackPromptOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => !!getFullscreenElement());
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [creatorTogglePosition, setCreatorTogglePosition] = useState(readCreatorTogglePosition);
  const [creatorGhostDraft, setCreatorGhostDraft] = useState<FlowGraphDraft | null>(null);
  const [creatorPreviewNative, setCreatorPreviewNative] = useState(false);
  const [creatorFocusedNodeId, setCreatorFocusedNodeId] = useState<string | null>(null);
  const [creatorFocusedField, setCreatorFocusedField] = useState<string | null>(null);
  const [creatorCanvasLocked, setCreatorCanvasLocked] = useState(false);
  const [pendingCreatorCommit, setPendingCreatorCommit] = useState<AiCreatorCommitMetadata | null>(null);
  const [, setHistoryVersion] = useState(0);
  const savedFlowSignatureRef = useRef<string | null>(null);
  const undoStackRef = useRef<FlowHistorySnapshot[]>([]);
  const redoStackRef = useRef<FlowHistorySnapshot[]>([]);
  const lastHistorySnapshotRef = useRef<FlowHistorySnapshot | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const historyApplyingRef = useRef(false);
  const historyInitializedRef = useRef(false);
  const historyDraggingRef = useRef(false);
  const dragStartSnapshotRef = useRef<FlowHistorySnapshot | null>(null);

  const updateCreatorTogglePosition = useCallback((position: number) => {
    const nextPosition = Math.min(92, Math.max(8, position));
    setCreatorTogglePosition(nextPosition);
    try {
      window.localStorage.setItem(CREATOR_TOGGLE_POSITION_KEY, String(nextPosition));
    } catch {
      // A disabled storage API should not prevent the handle from being moved.
    }
  }, []);

  const captureHistorySnapshot = useCallback((): FlowHistorySnapshot => ({
    name,
    nodes: normalizeFlowNodesAgentControl(nodes),
    edges,
    customVariables,
    creatorCommit: pendingCreatorCommit,
  }), [name, nodes, edges, customVariables, pendingCreatorCommit]);

  const resetHistory = useCallback((snapshot: FlowHistorySnapshot) => {
    if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current);
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastHistorySnapshotRef.current = cloneFlowHistorySnapshot(snapshot);
    historyInitializedRef.current = true;
    setHistoryVersion((version) => version + 1);
  }, []);

  const applyHistorySnapshot = useCallback((snapshot: FlowHistorySnapshot) => {
    historyApplyingRef.current = true;
    const next = cloneFlowHistorySnapshot(snapshot);
    setName(next.name);
    setNodes(next.nodes);
    setEdges(next.edges);
    setCustomVariables(next.customVariables);
    setPendingCreatorCommit(next.creatorCommit);
    lastHistorySnapshotRef.current = next;
    requestAnimationFrame(() => {
      historyApplyingRef.current = false;
    });
    setHistoryVersion((version) => version + 1);
  }, [setNodes, setEdges]);

  const commitImmediateHistoryTransaction = useCallback((nextSnapshot: FlowHistorySnapshot) => {
    if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current);
    const current = cloneFlowHistorySnapshot(captureHistorySnapshot());
    undoStackRef.current = appendBoundedFlowHistory(undoStackRef.current, current);
    redoStackRef.current = [];
    applyHistorySnapshot(nextSnapshot);
  }, [captureHistorySnapshot, applyHistorySnapshot]);

  const undoEditor = useCallback(() => {
    if (!historyInitializedRef.current) return;
    if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current);
    const current = cloneFlowHistorySnapshot(captureHistorySnapshot());
    const recorded = lastHistorySnapshotRef.current;
    if (recorded && createFlowDraftSignature(current) !== createFlowDraftSignature(recorded)) {
      redoStackRef.current = appendBoundedFlowHistory(redoStackRef.current, current);
      applyHistorySnapshot(recorded);
      return;
    }
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current = appendBoundedFlowHistory(redoStackRef.current, current);
    applyHistorySnapshot(previous);
  }, [captureHistorySnapshot, applyHistorySnapshot]);

  const redoEditor = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    const current = cloneFlowHistorySnapshot(captureHistorySnapshot());
    undoStackRef.current = appendBoundedFlowHistory(undoStackRef.current, current);
    applyHistorySnapshot(next);
  }, [captureHistorySnapshot, applyHistorySnapshot]);

  useEffect(() => {
    if (!historyInitializedRef.current || historyApplyingRef.current || historyDraggingRef.current) return;
    if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current);
    historyTimerRef.current = window.setTimeout(() => {
      const next = cloneFlowHistorySnapshot(captureHistorySnapshot());
      const previous = lastHistorySnapshotRef.current;
      if (!previous || createFlowDraftSignature(next) === createFlowDraftSignature(previous)) return;
      undoStackRef.current = appendBoundedFlowHistory(undoStackRef.current, previous);
      redoStackRef.current = [];
      lastHistorySnapshotRef.current = next;
      setHistoryVersion((version) => version + 1);
    }, 750);
    return () => {
      if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current);
    };
  }, [captureHistorySnapshot]);

  const handleHistoryNodeDragStart = useCallback(() => {
    if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current);
    historyDraggingRef.current = true;
    dragStartSnapshotRef.current = cloneFlowHistorySnapshot(captureHistorySnapshot());
  }, [captureHistorySnapshot]);

  const handleHistoryNodeDragStop = useCallback((_event: React.MouseEvent, movedNode: Node) => {
    const previous = dragStartSnapshotRef.current;
    historyDraggingRef.current = false;
    dragStartSnapshotRef.current = null;
    if (!previous) return;
    const next = cloneFlowHistorySnapshot({
      ...captureHistorySnapshot(),
      nodes: normalizeFlowNodesAgentControl(nodes.map((node) => node.id === movedNode.id ? movedNode : node)),
    });
    if (createFlowDraftSignature(previous) === createFlowDraftSignature(next)) return;
    undoStackRef.current = appendBoundedFlowHistory(undoStackRef.current, previous);
    redoStackRef.current = [];
    lastHistorySnapshotRef.current = next;
    setHistoryVersion((version) => version + 1);
  }, [captureHistorySnapshot, nodes]);

  const getCurrentFlowDraftSignature = () => createFlowDraftSignature({
    name,
    nodes: normalizeFlowNodesAgentControl(nodes),
    edges,
    customVariables,
  });

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!getFullscreenElement());
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];

    events.forEach((event) => document.addEventListener(event, handleFullscreenChange));
    return () => events.forEach((event) => document.removeEventListener(event, handleFullscreenChange));
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!getFullscreenElement()) {
        const root = document.documentElement as HTMLElement & {
          mozRequestFullScreen?: () => Promise<void> | void;
          webkitRequestFullscreen?: () => Promise<void> | void;
          msRequestFullscreen?: () => Promise<void> | void;
        };

        if (root.requestFullscreen) await root.requestFullscreen();
        else if (root.mozRequestFullScreen) await root.mozRequestFullScreen();
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        else if (root.msRequestFullscreen) await root.msRequestFullscreen();
      } else {
        const doc = document as Document & {
          mozCancelFullScreen?: () => Promise<void> | void;
          webkitExitFullscreen?: () => Promise<void> | void;
          msExitFullscreen?: () => Promise<void> | void;
        };

        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.mozCancelFullScreen) await doc.mozCancelFullScreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
        else if (doc.msExitFullscreen) await doc.msExitFullscreen();
      }
    } catch (error) {
      toast({
        title: t('fullscreen.error', 'Unable to toggle fullscreen'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const { data: flowData, isLoading: isLoadingFlow } = useQuery({
    queryKey: ['/api/flows', flowId],
    queryFn: async () => {
      if (!flowId) return null;
      const res = await fetch(`/api/flows/${flowId}`);
      if (!res.ok) throw new Error('Failed to load flow');
      return res.json();
    },
    enabled: isEditMode
  });

  useEffect(() => {
    if (flowData) {
      historyInitializedRef.current = false;
      setName(flowData.name);
      setPendingCreatorCommit(null);
      try {
        const parsedNodes = typeof flowData.nodes === 'string'
          ? JSON.parse(flowData.nodes)
          : flowData.nodes;

        const parsedEdges = typeof flowData.edges === 'string'
          ? JSON.parse(flowData.edges)
          : flowData.edges;

        let parsedCustomVariables: FlowCustomVariable[] = [];
        if (flowData.customVariables != null) {
          if (typeof flowData.customVariables === 'string') {
            parsedCustomVariables = JSON.parse(flowData.customVariables);
          } else if (Array.isArray(flowData.customVariables)) {
            parsedCustomVariables = flowData.customVariables;
          }
        }

        const loadedNodes = normalizeFlowNodesAgentControl(parsedNodes || []);
        const loadedEdges = normalizeFlowEdgesAiAssistantHandles(parsedEdges || [], loadedNodes);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setCustomVariables(parsedCustomVariables || []);
        savedFlowSignatureRef.current = createFlowDraftSignature({
          name: flowData.name,
          nodes: loadedNodes,
          edges: loadedEdges,
          customVariables: parsedCustomVariables || [],
        });
        resetHistory({
          name: flowData.name,
          nodes: loadedNodes,
          edges: loadedEdges,
          customVariables: parsedCustomVariables || [],
          creatorCommit: null,
        });

        setTimeout(() => {
          try {
            reactFlowInstance.fitView({
              padding: 0.12,
              includeHiddenNodes: false,
              minZoom: 0.1,
              maxZoom: 1.5,
            });
          } catch {
            /* ignore */
          }
        }, 100);
      } catch (error) {
        toast({
          title: t('flow_builder.error_loading_flow', 'Error loading flow'),
          description: t('flow_builder.could_not_parse_flow_data', 'Could not parse flow data'),
          variant: 'destructive'
        });
      }
    }
  }, [flowData, setNodes, setEdges, toast, reactFlowInstance, resetHistory]);

  useEffect(() => {
    if (!isEditMode && savedFlowSignatureRef.current === null) {
      savedFlowSignatureRef.current = getCurrentFlowDraftSignature();
      resetHistory({
        name,
        nodes: normalizeFlowNodesAgentControl(nodes),
        edges,
        customVariables,
        creatorCommit: null,
      });
    }
  }, [isEditMode, resetHistory]);

  useEffect(() => {
    const shouldBlockNodeDragFromTarget = (target: EventTarget | null): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) return false;
      if (!target.closest('.react-flow__node')) return false;
      return Boolean(
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], .ql-editor, .ProseMirror'
        )
      );
    };

    const handleInteractivePointerCapture = (event: MouseEvent | PointerEvent) => {
      if (!shouldBlockNodeDragFromTarget(event.target)) return;
      event.stopPropagation();
    };

    document.addEventListener('pointerdown', handleInteractivePointerCapture, true);
    document.addEventListener('mousedown', handleInteractivePointerCapture, true);
    return () => {
      document.removeEventListener('pointerdown', handleInteractivePointerCapture, true);
      document.removeEventListener('mousedown', handleInteractivePointerCapture, true);
    };
  }, []);

  const createFlowMutation = useMutation({
    mutationFn: async (flowData: any) => {
      const response = await apiRequest('POST', '/api/flows', flowData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-config'] });
    },
    onError: (error: any) => {
      toast({
        title: t('flow_builder.error_creating_flow', 'Error creating flow'),
        description: error.message || t('flow_builder.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PATCH', `/api/flows/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows', flowId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-config'] });
      toast({
        title: t('flow_builder.flow_updated', 'Flow updated'),
        description: t('flow_builder.flow_updated_successfully', 'Your flow has been updated successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flow_builder.error_updating_flow', 'Error updating flow'),
        description: error.message || t('flow_builder.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const ensureFlowForMedia = useCallback(async (): Promise<number> => {
    if (flowId) return flowId;
    const draftName = name.trim() || t('flow_builder.untitled_flow', 'Untitled Flow');
    const flowToCreate = {
      name: draftName,
      nodes: normalizeFlowNodesAgentControl(nodes),
      edges,
      customVariables,
      status: 'draft',
    };
    const created = await createFlowMutation.mutateAsync(flowToCreate);
    if (!created?.id) throw new Error('Could not create a draft flow for the media upload.');
    setName(draftName);
    savedFlowSignatureRef.current = createFlowDraftSignature({
      name: draftName,
      nodes: flowToCreate.nodes,
      edges,
      customVariables,
    });
    navigate(`/flows/${created.id}`);
    toast({ title: t('flow_builder.media_gallery.draft_created', 'Draft flow created') });
    return created.id;
  }, [flowId, name, nodes, edges, customVariables, createFlowMutation, navigate, toast, t]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (connection.targetHandle === AI_TOOL_INPUT_HANDLE_ID && sourceNode?.type !== 'mcp_client_tool') {
        toast({
          variant: 'destructive',
          title: t('flow_builder.mcp.invalid_connection_title', 'Invalid connection'),
          description: t(
            'flow_builder.mcp.invalid_connection_desc',
            'The AI tool input only accepts edges from MCP Client Tool nodes.'
          ),
        });
        return;
      }
      if (connection.targetHandle === AI_TOOL_INPUT_HANDLE_ID) {
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              animated: false,
              type: 'smoothstep',
              data: { isMcpToolEdge: true },
              style: { strokeDasharray: '6 4' },
            },
            eds
          )
        );
        return;
      }
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            type: 'smoothstep',
          },
          eds
        )
      );
    },
    [setEdges, nodes, toast, t]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const targetNode = nodes.find((n) => n.id === connection.target);
      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (!targetNode || !sourceNode) return true;

      if (isNotesNodeType(sourceNode.type) || isNotesNodeType(targetNode.type)) {
        return false;
      }

      // Translation node input may only be connected from the Message Trigger node
      if (targetNode.type === 'translation' && (connection.targetHandle === 'input' || connection.targetHandle == null)) {
        return sourceNode.type === 'trigger';
      }
      // DataCapture node input cannot be connected from another DataCapture node output
      if (targetNode.type === 'data_capture') {
        return sourceNode.type !== 'data_capture';
      }

      // Never connect a node to itself: runtime traversal treats that as a cycle / duplicate execution.
      if (connection.source === connection.target) {
        return false;
      }

      // AI Assistant outbound handles (flow-out, manual tasks, variables-complete, calendar-booking-completed)
      // connect like any other node; inbound ai_assistant wiring is constrained below.

      if (targetNode.type === 'ai_assistant') {
        if (sourceNode.type === 'mcp_client_tool') {
          return connection.targetHandle === AI_TOOL_INPUT_HANDLE_ID;
        }
        return connection.targetHandle === FLOW_DEFAULT_TARGET_HANDLE_ID;
      }

      if (connection.targetHandle === AI_TOOL_INPUT_HANDLE_ID) {
        return sourceNode.type === 'mcp_client_tool';
      }
      if (sourceNode.type === 'mcp_client_tool') {
        return targetNode.type === 'ai_assistant' && connection.targetHandle === AI_TOOL_INPUT_HANDLE_ID;
      }

      return true;
    },
    [nodes]
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));

      setEdges((eds) => eds.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ));

      toast({
        title: t('flow_builder.node_deleted', 'Node deleted'),
        description: t('flow_builder.node_connections_removed', 'Node and its connections have been removed.')
      });
    },
    [setNodes, setEdges, toast]
  );

  const onDuplicateNode = useCallback(
    (nodeId: string) => {
      const nodeToDuplicate = nodes.find((node) => node.id === nodeId);
      if (!nodeToDuplicate) return;

      if (isMessageTriggerNode(nodeToDuplicate)) {
        toast({
          title: t(
            'flow_builder.singleton_errors.trigger_exists',
            'Only one Message Trigger allowed per flow'
          ),
          variant: 'destructive',
        });
        return;
      }

      const newNodeId = `node_${nanoid()}`;

      const isWebhookTrigger =
        nodeToDuplicate.type === 'webhookTrigger' ||
        nodeToDuplicate.type === 'mastershopWebhookTrigger';

      let duplicateData = nodeToDuplicate.data;
      if (isWebhookTrigger) {
        duplicateData = buildDuplicatedWebhookTriggerNodeData(
          nodeToDuplicate.data as Record<string, unknown>
        );
      }

      const duplicateNode: Node = {
        ...nodeToDuplicate,
        id: newNodeId,
        data: duplicateData,
        position: {
          x: nodeToDuplicate.position.x + 30,
          y: nodeToDuplicate.position.y + 30
        },
        selected: true // Ensure the new node is selected
      };


      setNodes((nds) => [
        ...nds.map(node => ({ ...node, selected: false })), // Deselect all existing nodes
        duplicateNode // Add the new selected duplicate node
      ]);


      setTimeout(() => {
        if (reactFlowInstance) {

          reactFlowInstance.setNodes((nds) =>
            nds.map(node => ({
              ...node,
              selected: node.id === newNodeId
            }))
          );
        }
      }, 10); // Small delay to ensure DOM updates

      toast({
        title: t('flow_builder.node_duplicated', 'Node duplicated'),
        description: t('flow_builder.node_copy_created', 'A copy of the node has been created.')
      });
    },
    [nodes, setNodes, toast, t, reactFlowInstance]
  );

  const onAddNode = useCallback(
    (type: string, data?: any, position?: { x: number; y: number }) => {
      if (!reactFlowWrapper.current) return;

      if (type === 'trigger' && flowHasMessageTrigger(nodes)) {
        toast({
          title: t(
            'flow_builder.singleton_errors.trigger_exists',
            'Only one Message Trigger allowed per flow'
          ),
          variant: 'destructive',
        });
        return;
      }

      if (data && position) {
        const newNodeId = data.id || `node_${nanoid()}`;
        const newNode: Node = {
          id: newNodeId,
          type,
          position,
          data: {
            ...data,
            onDeleteNode,
            onDuplicateNode,
          },
        };
        setNodes((nds) => nds.concat(stripDeprecatedFlowNodeFields(newNode)));
        return;
      }

      const triggerNode = nodes.find(isMessageTriggerNode);
      const triggerNodeId = triggerNode?.id || '';
      const hasExistingConnection = edges.some(edge => edge.source === triggerNodeId);

      const newNodeId = `node_${nanoid()}`;

      let nodeData: any = createDefaultFlowNodeData(type);

      switch (type) {
        case 'message':
          nodeData = { ...nodeData, message: 'Hello! How can I help you?' };
          break;
        case 'quickreply':
          nodeData = {
            ...nodeData,
            message: 'Please select an option to continue:',
            options: [
              { text: 'I have a question about my order.', value: 'order' },
              { text: 'I have a question about a product.', value: 'product' },
              { text: 'I have another question.', value: 'other' }
            ],
            invalidResponseMessage: "I didn't understand your selection. Please choose one of the available options:",
            enableGoBack: false,
            goBackText: '← Go Back',
            goBackValue: 'go_back'
          };
          break;
        case 'whatsapp_interactive_buttons':
          nodeData = {
            ...nodeData,
            headerText: '',
            bodyText: 'Please select an option:',
            footerText: '',
            buttons: [
              { id: '1', title: 'Option 1', payload: 'option_1' },
              { id: '2', title: 'Option 2', payload: 'option_2' }
            ]
          };
          break;
        case 'whatsapp_interactive_list':
          nodeData = {
            ...nodeData,
            headerText: '',
            bodyText: 'Please select an option:',
            footerText: '',
            buttonText: 'View Options',
            sections: [
              {
                id: '1',
                title: 'Options',
                rows: [
                  { id: '1', title: 'Option 1', description: '', payload: 'option_1' },
                  { id: '2', title: 'Option 2', description: '', payload: 'option_2' }
                ]
              }
            ]
          };
          break;
        case 'whatsapp_poll':
          nodeData = {
            ...nodeData,
            question: 'Please answer:',
            message: 'Please answer:',
            options: [
              { text: 'Option 1', value: 'option1' },
              { text: 'Option 2', value: 'option2' }
            ],
            invalidResponseMessage: 'I did not understand your selection. Please choose one of the available options.',
            enableGoBack: false,
            goBackText: '← Go Back',
            goBackValue: 'go_back'
          };
          break;
        case 'condition':
          nodeData = { ...nodeData, ...createDefaultConditionNodeData() };
          break;
        case 'action':
          nodeData = { ...nodeData, action: 'Create ticket' };
          break;
        case 'image':
          nodeData = {
            ...nodeData,
            mediaItems: [],
            interItemDelayMs: MEDIA_ITEMS_DEFAULT_DELAY_MS
          };
          break;
        case 'video':
          nodeData = {
            ...nodeData,
            mediaItems: [],
            interItemDelayMs: MEDIA_ITEMS_DEFAULT_DELAY_MS
          };
          break;
        case 'audio':
          nodeData = {
            ...nodeData,
            mediaItems: [],
            interItemDelayMs: MEDIA_ITEMS_DEFAULT_DELAY_MS
          };
          break;
        case 'document':
          nodeData = {
            ...nodeData,
            mediaItems: [],
            interItemDelayMs: MEDIA_ITEMS_DEFAULT_DELAY_MS
          };
          break;
        case 'wait':
          nodeData = { ...nodeData, timeValue: 5, timeUnit: 'minutes' };
          break;

        case 'ai_assistant':
          nodeData = {
            ...nodeData,
            provider: 'openai',
            model: 'gpt-5.6-luna',
            apiKey: '',
            aiVariables: [],
            customFieldBindings: [],
            prompt: t(
              'flow_builder.ai_default_customer_selected_calendar_prompt',
              `You are a helpful assistant. Answer user questions concisely and accurately.

When users request calendar-related tasks, you can:
- Book appointments and meetings
- Check availability for scheduling
- Update or modify appointments
- Cancel appointments when needed

For normal appointment booking:
1. Collect the necessary details (title/service, date, time preference, attendees/email, location)
2. Check availability before booking once the needed scheduling details are known
3. Confirm all details with the user before booking when confirmation is needed
4. Provide confirmation with event details

For customer-selected service booking:
1. Identify the ERP service first
2. Confirm the ERP product is type = service
3. Use only the product-level estimatedDurationMinutes for appointment length
4. Ask the customer to choose a person, or resolve a typed name like "John"
5. Check only that selected person's Google primary calendar
6. Show only that selected person's available slots
7. Book only into that selected person's calendar
8. If the selected person is unavailable, ask whether the customer wants to change the date, service, or person

Always be professional and ensure you have all required information before making calendar changes. Also make sure to ask the user about their email if they wish to know the previous appointments. So that we can fetch the previous appointments from the calendar. Also make sure to not share any sensitive information with the user like appointments made by other users etc. Only give info to the user if they are the owner of the event.

Note: Check available slots before responding when a user requests a specific appointment time, but for customer-selected booking do not check availability until the ERP service and booking person are selected.`
            ),
            enableHistory: true,
            enableAudio: false,
            enableImage: false,
            enableTaskExecution: false,
            tasks: [],
            taskGroups: [],
            enableGoogleCalendar: false,
            googleCalendarId: 'primary',
            assignmentStrategy: '',
            targetAgentUserId: null,
            bookableAgentUserIds: [],
            calendarBusinessHours: { start: '09:00', end: '17:00' },
            calendarDefaultDuration: 60,

            calendarTimeZone: getBrowserTimezone(),
            calendarFunctions: [],
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'mcp_client_tool':
          nodeData = {
            ...nodeData,
            servers: [
              {
                id: nanoid(),
                name: '',
                url: '',
                transport: 'streamable-http',
                authMode: 'none',
                headers: [],
                toolFilter: { mode: 'all', tools: [] },
              },
            ],
            onDeleteNode,
            onDuplicateNode,
          };
          break;
        case 'mcp_execute_tool':
          nodeData = {
            ...nodeData,
            serverConfig: {
              id: nanoid(),
              name: '',
              url: '',
              transport: 'streamable-http',
              authMode: 'none',
              headers: [],
              toolFilter: { mode: 'all', tools: [] },
            },
            sourceMcpClientNodeId: undefined,
            sourceServerId: undefined,
            toolName: '',
            argumentsJson: '{}',
            outputVariablePrefix: 'mcp',
            onDeleteNode,
            onDuplicateNode,
          };
          break;
        case 'update_pipeline_stage':
          nodeData = {
            ...nodeData,
            stageId: null,
            dealIdVariable: "{{contact.id}}",
            type: "update_pipeline_stage"
          };
          break;
        case 'webhook':
          nodeData = {
            ...nodeData,
            url: '',
            method: 'POST',
            headers: [],
            body: '{"message": "{{message.content}}", "contact": "{{contact.name}}"}',
            authType: 'none',
            authToken: '',
            authUsername: '',
            authPassword: '',
            authApiKey: '',
            authApiKeyHeader: 'X-API-Key',
            timeout: 30,
            followRedirects: true,
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'http_request':
          nodeData = {
            ...nodeData,
            url: '',
            method: 'GET',
            headers: [{ key: 'Accept', value: 'application/json' }],
            body: '',
            authType: 'none',
            authToken: '',
            authUsername: '',
            authPassword: '',
            authApiKey: '',
            authApiKeyHeader: 'X-API-Key',
            timeout: 30,
            followRedirects: true,
            responseType: 'auto',
            retryCount: 0,
            retryDelay: 1000,
            variableMappings: [],
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'database_query':
          nodeData = {
            ...nodeData,
            engine: 'postgres',
            connectionMode: 'fields',
            connectionString: '',
            host: '',
            port: 5432,
            database: '',
            username: '',
            password: '',
            ssl: false,
            query: '',
            parameters: [],
            rowLimit: 100,
            timeout: 30,
            variableMappings: [],
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        
        case 'whatsapp_flows':
          nodeData = {
            ...nodeData,
            flowName: '',
            flowId: '',
            screens: [{
              id: 'WELCOME_SCREEN',
              title: 'Welcome',
              terminal: true,
              layout: {
                type: 'SingleColumnLayout',
                children: [{
                  type: 'TextHeading',
                  text: 'Welcome to our Flow!'
                }]
              }
            }],
            flowJSON: {
              version: '7.2',
              screens: [{
                id: 'WELCOME_SCREEN',
                title: 'Welcome',
                terminal: true,
                layout: {
                  type: 'SingleColumnLayout',
                  children: [{
                    type: 'TextHeading',
                    text: 'Welcome to our Flow!'
                  }]
                }
              }]
            },
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'n8n':
          nodeData = {
            ...nodeData,
            instanceUrl: '',
            apiKey: '',
            webhookUrl: '',
            workflowId: '',
            workflowName: '',
            operation: 'webhook_trigger',
            config: {},
            variableMappings: [],
            timeout: 30,
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'bot_disable':
          nodeData = {
            ...nodeData,
            disableDuration: '30',
            customDuration: 60,
            customDurationUnit: 'minutes',
            triggerMethod: 'always',
            keyword: 'agent',
            caseSensitive: false,
            assignToAgent: 'auto',
            autoAssignAgentIds: [],
            notifyAgent: true,
            handoffMessage: 'A customer is requesting human assistance.'
          };
          break;
        case 'end_conversation':
          nodeData = {
            ...nodeData,
            label: 'End Conversation',
            disableDuration: 'manual',
            customDuration: 60,
            customDurationUnit: 'minutes',
            triggerMethod: 'always',
            keyword: 'agent',
            caseSensitive: false,
            assignToAgent: '',
            autoAssignAgentIds: [],
            notifyAgent: false,
            handoffMessage: 'This conversation is closed. Thanks!',
            __hideAgentAssignment: true,
          };
          break;
        case 'translation':
          nodeData = {
            ...nodeData,
            enabled: true,
            apiKey: '',
            targetLanguage: 'en',
            translationMode: 'append',
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'bot_reset':
          nodeData = {
            ...nodeData,
            resetScope: 'bot_only',
            confirmationMessage: 'Bot assistance has been re-enabled. How can I help you?',
            sendConfirmation: true,
            clearVariables: false,
            resetFlowPosition: false,
            notifyAgent: true,
            autoReassign: false
          };
          break;
        case 'data_capture':
          nodeData = {
            ...nodeData,
            captureRules: [],
            storageScope: 'session',
            overwriteExisting: false,
            enableValidation: true
          };
          break;
        case 'flow_trigger':
          nodeData = {
            ...nodeData,
            targetFlowId: null,
            targetFlowName: null
          };
          break;
        case 'document_generator':
          nodeData = {
            ...nodeData,
            ...createDefaultDocumentGeneratorNodeData(),
            onDeleteNode,
            onDuplicateNode,
          };
          break;
        case 'mastershop':
          nodeData = {
            ...createDefaultMasterShopActionNodeData(),
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode,
          };
          break;
        case 'mastershopWebhookTrigger':
          nodeData = {
            ...createDefaultMasterShopWebhookTriggerNodeData(),
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode,
          };
          break;
        case 'notes':
          nodeData = {
            ...nodeData,
            title: t('flow_builder.notes_default_title', 'Note'),
            body: '',
            backgroundColor: 'yellow',
            pinned: false,
            width: NOTES_DEFAULT_WIDTH,
            height: NOTES_DEFAULT_HEIGHT,
            onDeleteNode,
            onDuplicateNode,
          };
          break;
      }

      const newNode: Node = {
        id: newNodeId,
        type,
        position: {
          x: triggerNode ? triggerNode.position.x : 250,
          y: triggerNode ? triggerNode.position.y + 150 : 150
        },
        data: nodeData,
        ...(type === 'notes'
          ? {
              connectable: false,
              draggable: true,
              style: { width: NOTES_DEFAULT_WIDTH, height: NOTES_DEFAULT_HEIGHT },
            }
          : {}),
      };

      setNodes((nds) => nds.concat(stripDeprecatedFlowNodeFields(newNode)));
      emitTourSignal('flow-node-added', newNodeId);

      if (
        triggerNode &&
        !hasExistingConnection &&
        type !== 'trigger' &&
        type !== 'webhookTrigger' &&
        type !== 'mastershopWebhookTrigger' &&
        type !== 'mcp_client_tool' &&
        type !== 'notes'
      ) {
        const newEdge: Edge = {
          id: `edge-${triggerNodeId}-${newNodeId}`,
          source: triggerNodeId,
          target: newNodeId,
          animated: true,
          type: 'smoothstep',
          // AI Assistant has two target handles (flow-in vs MCP tool-input); without this, React Flow picks the wrong one.
          ...(type === 'ai_assistant' ? { targetHandle: FLOW_DEFAULT_TARGET_HANDLE_ID } : {}),
        };

        setEdges((eds) => eds.concat(newEdge));
      }

      setTimeout(() => {
        try {
          reactFlowInstance.fitView({
            nodes: [{ id: newNodeId }],
            duration: 800,
            padding: 0.3,
            maxZoom: 1.2,
            minZoom: 0.5
          });
        } catch (error) {
          
        }
      }, 100);
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance, t, onDeleteNode, onDuplicateNode]
  );

  const autoArrangeNodes = useCallback(() => {
    if (nodes.length === 0) return;

    setAutoArrangeCollapseSignal((s) => s + 1);

    setIsAutoArranging(true);

    try {

      const mcpToolEdges = edges.filter((e) => e.data?.isMcpToolEdge);
      const layoutEdges = edges.filter((e) => !e.data?.isMcpToolEdge);
      const annotationNodes = nodes.filter((node) => isNotesNodeType(node.type));
      const layoutNodes = nodes.filter((node) => !isNotesNodeType(node.type));

      const { nodes: layoutedNodes, edges: layoutedEdges, stats } = autoArrangeFlow(
        layoutNodes,
        layoutEdges,
        {
          direction: 'TB', // Top-to-bottom for chatbot flows
          preserveUserPositions: false
        }
      );


      setNodes([...layoutedNodes, ...annotationNodes]);
      setEdges([...layoutedEdges, ...mcpToolEdges]);




      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({
            padding: 0.1,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 1.5,
            duration: 800
          });
        }
      }, 100);


      toast({
        title: t('flow_builder.main.nodes_auto_arranged', 'Nodes Auto-Arranged'),
        description: t('flow_builder.main.nodes_arranged_desc', '{{count}} nodes organized across {{levels}} levels with proper spacing. No overlaps guaranteed!', {
          count: stats.nodeCount,
          levels: stats.levels
        }),
      });

    } catch (error) {
      console.error('Auto-arrange failed:', error);


      toast({
        title: t('flow_builder.main.auto_arrange_error', 'Auto-Arrange Failed'),
        description: t('flow_builder.main.auto_arrange_error_desc', 'Failed to arrange nodes. Please try again or arrange manually.'),
        variant: 'destructive'
      });
    } finally {

      setTimeout(() => {
        setIsAutoArranging(false);
      }, 500);
    }
  }, [nodes, edges, setNodes, setEdges, setAutoArrangeCollapseSignal, reactFlowInstance, toast, t]);

  const handleApplyTemplateFlow = useCallback((suggestion: any) => {
    try {
      const replace = suggestion.replace !== false;

      const newNodes = normalizeFlowNodesAgentControl(
        suggestion.nodes.map((node: any) => ({
          ...node,
          id: node.id || `node-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          position: node.position || { x: 0, y: 0 },
          data: {
            ...node.data,
            label: node.label || node.data?.label || 'Untitled Node'
          }
        }))
      );

      const newEdges = suggestion.edges.map((edge: any) => ({
        ...edge,
        id: edge.id || `edge-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        animated: true,
        type: edge.type || 'smoothstep'
      }));

      const applyNodesAndEdges = () => {
        setNodes(newNodes);
        setEdges(newEdges);

        if (reactFlowInstance) {
          setTimeout(() => {
            reactFlowInstance.fitView({ padding: 0.1 });
          }, 100);
        }
      };

      if (replace) {
        setNodes([]);
        setEdges([]);
        setTimeout(applyNodesAndEdges, 100);
      } else {
        applyNodesAndEdges();
      }

      toast({
        title: "Flow Template Applied",
        description: `Successfully applied "${suggestion.title}" with ${newNodes.length} nodes.`,
      });

    } catch (error) {
      console.error('Error applying flow template:', error);
      toast({
        title: "Error",
        description: "Failed to apply flow template. Please try again.",
        variant: "destructive",
      });
    }
  }, [setNodes, setEdges, reactFlowInstance, toast]);

  const clearAllFlowSessionsAfterSave = async (targetFlowId: number) => {
    const response = await fetch(`/api/flows/${targetFlowId}/sessions`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to clear all sessions: ${response.status}`);
    }
    return response.json() as Promise<{ deletedCount?: number }>;
  };

  const validateNodeConnectionsBeforeSave = () => {
    const connectableNodes = nodes.filter((node) => !isNotesNodeType(node.type));
    const nodeIds = new Set(connectableNodes.map((node) => node.id));
    const connectedNodeIds = new Set<string>();

    edges.forEach((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    const disconnectedNodes = connectableNodes.filter((node) => !connectedNodeIds.has(node.id));
    if (disconnectedNodes.length === 0) return true;

    const firstDisconnectedNode = disconnectedNodes[0];
    const nodeName = String(
      firstDisconnectedNode.data?.label ||
      firstDisconnectedNode.data?.name ||
      firstDisconnectedNode.type ||
      t('flow_builder.connection_validation.unnamed_node', 'Unnamed node')
    );

    setNodes((currentNodes) => currentNodes.map((node) => ({
      ...node,
      selected: node.id === firstDisconnectedNode.id,
    })));

    requestAnimationFrame(() => {
      reactFlowInstance.fitView({
        nodes: [{ id: firstDisconnectedNode.id }],
        padding: 0.45,
        minZoom: 1.1,
        maxZoom: 1.4,
        duration: 500,
      });
    });

    toast({
      title: t('flow_builder.connection_validation.title', 'Connect all nodes before saving'),
      description: t(
        'flow_builder.connection_validation.description',
        '“{{node}}” is not connected. Fix this node and every other disconnected node before saving.',
        { node: nodeName, count: disconnectedNodes.length }
      ),
      variant: 'destructive',
    });

    return false;
  };

  const performFlowSave = async (clearSessionsAfter: boolean) => {
    if (!name.trim()) {
      toast({
        title: t('flow_builder.name_required', 'Name required'),
        description: t('flow_builder.provide_flow_name', 'Please provide a name for your flow'),
        variant: 'destructive',
      });
      return;
    }
    if (!validateNodeConnectionsBeforeSave()) return;

    setLoading(true);
    try {
      const flowToSave = {
        name,
        nodes: normalizeFlowNodesAgentControl(nodes),
        edges,
        customVariables,
        status: pendingCreatorCommit?.validation.setupIssues.length
          ? 'draft'
          : (isEditMode && flowData?.status) ? flowData.status : 'draft',
        ...(pendingCreatorCommit ? { aiCreatorCommit: pendingCreatorCommit } : {}),
      };

      let targetFlowIdForClear: number | null = null;

      if (isEditMode && flowId) {
        await updateFlowMutation.mutateAsync({ id: flowId, data: flowToSave });
        targetFlowIdForClear = flowId;
      } else {
        const created = await createFlowMutation.mutateAsync(flowToSave);
        if (created?.id) {
          navigate(`/flows/${created.id}`);
          toast({
            title: t('flow_builder.flow_created', 'Flow created'),
            description: t('flow_builder.flow_created_successfully', 'Your flow has been created successfully.'),
          });
          targetFlowIdForClear = created.id;
        }
      }

      savedFlowSignatureRef.current = createFlowDraftSignature({
        name: flowToSave.name,
        nodes: flowToSave.nodes,
        edges: flowToSave.edges,
        customVariables: flowToSave.customVariables,
      });

      if (pendingCreatorCommit) {
        historyApplyingRef.current = true;
        setPendingCreatorCommit(null);
        undoStackRef.current = undoStackRef.current.map((snapshot) => ({ ...snapshot, creatorCommit: null }));
        redoStackRef.current = redoStackRef.current.map((snapshot) => ({ ...snapshot, creatorCommit: null }));
        lastHistorySnapshotRef.current = cloneFlowHistorySnapshot({
          name: flowToSave.name,
          nodes: flowToSave.nodes,
          edges: flowToSave.edges,
          customVariables: flowToSave.customVariables,
          creatorCommit: null,
        });
        requestAnimationFrame(() => {
          historyApplyingRef.current = false;
        });
        if (flowToSave.status === 'draft' && flowData?.status === 'active') {
          toast({
            title: t('flow_builder.creator.saved_as_draft', 'Saved as draft'),
            description: t('flow_builder.creator.setup_before_activation', 'Complete the generated integration setup before activating this workflow.'),
          });
        }
      }

      if (clearSessionsAfter && targetFlowIdForClear != null && targetFlowIdForClear > 0) {
        try {
          const data = await clearAllFlowSessionsAfterSave(targetFlowIdForClear);
          toast({
            title: t('flow_builder.variable_browser_clear_all_toast_title', 'All sessions cleared'),
            description: t('flow_builder.variable_browser_clear_all_toast_desc', 'Successfully deleted all sessions for this flow.', {
              count: data.deletedCount ?? 0,
            }),
          });
        } catch (error) {
          console.error('Error clearing flow sessions after save:', error);
          toast({
            title: t('flow_builder.variable_browser_clear_all_error_title', 'Error clearing sessions'),
            description:
              error instanceof Error
                ? error.message
                : t('flow_builder.variable_browser_unexpected_error', 'An unexpected error occurred'),
            variant: 'destructive',
          });
        }
      }
      setSaveSessionPromptOpen(false);
    } catch {
      // Mutation callbacks display the error. Preserve the draft and save dialog for retry.
    } finally {
      setLoading(false);
    }
  };

  const promptSaveFlow = () => {
    if (!name.trim()) {
      toast({
        title: t('flow_builder.name_required', 'Name required'),
        description: t('flow_builder.provide_flow_name', 'Please provide a name for your flow'),
        variant: 'destructive',
      });
      return;
    }
    if (!validateNodeConnectionsBeforeSave()) return;
    setSaveSessionPromptOpen(true);
  };

  const handleAcceptCreatorGeneration = useCallback((
    result: CompletedCreatorGeneration,
    creatorMessages: Array<{ role: 'user' | 'assistant'; content: string; isError?: boolean }>,
  ) => {
    const generatedNodes = normalizeFlowNodesAgentControl(result.draft.nodes as Node[]);
    const generatedEdges = normalizeFlowEdgesAiAssistantHandles(result.draft.edges as Edge[], generatedNodes);
    const nextName = name.trim() ? name : (result.draft.name?.trim() || 'AI Workflow');
    const acceptedGraphHash = hashFlowGraph({
      nodes: generatedNodes as FlowGraphDraft['nodes'],
      edges: generatedEdges as FlowGraphDraft['edges'],
      customVariables: customVariables as unknown as FlowGraphDraft['customVariables'],
    });
    const creatorCommit: AiCreatorCommitMetadata = {
      generationId: result.generationId,
      generationProof: result.generationProof,
      provider: result.provider,
      model: result.model,
      credentialSource: result.credentialSource,
      generatedGraphHash: result.graphHash,
      beforeGraphHash: result.beforeGraphHash,
      acceptedGraphHash,
      prompt: result.prompt,
      summary: result.summary,
      assumptions: result.assumptions,
      validation: result.validation,
      ...(!isEditMode ? {
        temporaryMessages: creatorMessages
          .filter((message) => !message.isError)
          .slice(-100)
          .map(({ role, content }) => ({ role, content })),
      } : {}),
    };
    commitImmediateHistoryTransaction({
      name: nextName,
      nodes: generatedNodes,
      edges: generatedEdges,
      customVariables,
      creatorCommit,
    });
    setCreatorGhostDraft(null);
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.12, duration: 500 }), 50);
    toast({
      title: t('flow_builder.creator.applied', 'Generated workflow applied'),
      description: t('flow_builder.creator.applied_description', 'Review or edit it, then use Save when you are ready.'),
    });
  }, [name, nodes, edges, customVariables, isEditMode, commitImmediateHistoryTransaction, reactFlowInstance, toast, t]);

  const displayedNodes = useMemo<Node[]>(() => {
    if (!creatorGhostDraft) return nodes;
    if (creatorPreviewNative) {
      return creatorGhostDraft.nodes.map((node) => ({
        ...node,
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
        style: { ...(typeof node.style === 'object' && node.style ? node.style : {}), pointerEvents: 'none' as const },
        className: cn(
          typeof node.className === 'string' ? node.className : '',
          'transition-[filter,opacity] duration-300',
          node.data?.__creatorChange === 'added' && 'ring-4 ring-emerald-400/60 ring-offset-4 ring-offset-background',
          node.data?.__creatorChange === 'updated' && 'ring-4 ring-amber-400/60 ring-offset-4 ring-offset-background',
          node.data?.__creatorChange === 'removing' && 'opacity-40 ring-4 ring-destructive/60 ring-offset-4 ring-offset-background',
          creatorFocusedNodeId === node.id && 'ring-4 ring-primary/60 ring-offset-4 ring-offset-background drop-shadow-[0_0_18px_hsl(var(--primary)/.45)]',
        ),
      })) as Node[];
    }
    const existing = nodes.map((node) => ({
      ...node,
      style: { ...node.style, opacity: 0.32 },
      selectable: false,
    }));
    const ghosts = creatorGhostDraft.nodes.map((node) => ({
      ...node,
      type: 'ai_creator_ghost',
      data: { label: node.data?.label || node.type, originalType: node.type },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      style: { ...(typeof node.style === 'object' && node.style ? node.style : {}), pointerEvents: 'none' as const },
    })) as Node[];
    return [...existing, ...ghosts];
  }, [nodes, creatorGhostDraft, creatorPreviewNative, creatorFocusedNodeId]);

  const displayedEdges = useMemo<Edge[]>(() => {
    if (!creatorGhostDraft) return edges;
    if (creatorPreviewNative) {
      return creatorGhostDraft.edges.map((edge) => ({
        ...edge,
        animated: true,
        selectable: false,
        style: { ...(typeof edge.style === 'object' && edge.style ? edge.style : {}), stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      })) as Edge[];
    }
    const existing = edges.map((edge) => ({
      ...edge,
      selectable: false,
      style: { ...edge.style, opacity: 0.22 },
    }));
    const ghosts = creatorGhostDraft.edges.map((edge) => ({
      ...edge,
      animated: true,
      selectable: false,
      type: 'smoothstep',
      style: { ...(typeof edge.style === 'object' && edge.style ? edge.style : {}), stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '7 5' },
    })) as Edge[];
    return [...existing, ...ghosts];
  }, [edges, creatorGhostDraft, creatorPreviewNative]);

  const focusCreatorNode = useCallback((nodeId: string, field?: string) => {
    setCreatorFocusedNodeId(nodeId);
    setCreatorFocusedField(field ?? null);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      const node = reactFlowInstance.getNode(nodeId);
      if (!node) return;
      const width = node.width ?? 320;
      const height = node.height ?? 220;
      const desktopPanelOffset = window.innerWidth >= 640 ? 300 : 0;
      reactFlowInstance.setCenter(node.position.x + width / 2 + desktopPanelOffset, node.position.y + height / 2, { zoom: 0.9, duration: reducedMotion ? 0 : 450 });
    }, 40);
  }, [reactFlowInstance]);

  const currentHistorySnapshot = captureHistorySnapshot();
  const canUndo = undoStackRef.current.length > 0 || Boolean(
    lastHistorySnapshotRef.current &&
    createFlowDraftSignature(currentHistorySnapshot) !== createFlowDraftSignature(lastHistorySnapshotRef.current)
  );
  const canRedo = redoStackRef.current.length > 0;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [nodeSidebarCollapsed, setNodeSidebarCollapsed] = useState(true);

  const collapsedNodeCatalog = useMemo(() => {
    const all = buildFlowNodeCatalog(t, { nodes });
    const seenTypes = new Set<string>();
    return all.filter((entry) => {
      if (seenTypes.has(entry.type)) return false;
      seenTypes.add(entry.type);
      return true;
    });
  }, [t, currentLanguage?.code, nodes]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTextEditing = Boolean(target?.closest('input, textarea, [contenteditable="true"], [role="textbox"]'));
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'A') {
        event.preventDefault();
        if (!isAutoArranging && nodes.length > 0) {
          autoArrangeNodes();
        }
      }
      if (isTextEditing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoEditor();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        redoEditor();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autoArrangeNodes, undoEditor, redoEditor, isAutoArranging, nodes.length]);

  if (isEditMode && isLoadingFlow) {
    return (
      <div className="flex justify-center items-center h-svh">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`flow-builder flex h-svh max-h-svh min-h-0 flex-col overflow-hidden md:grid md:grid-rows-[auto_minmax(0,1fr)] ${
      nodeSidebarCollapsed
        ? 'md:grid-cols-[3.5rem_minmax(0,1fr)]'
        : 'md:grid-cols-[minmax(280px,350px)_minmax(0,1fr)]'
    }`}>
      <AlertDialog open={saveSessionPromptOpen} onOpenChange={setSaveSessionPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('flow_builder.save_flow_confirm_title', 'Save flow')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'flow_builder.save_flow_clear_sessions_description',
                'Your flow will be saved. Do you also want to clear all bot sessions for this flow? Contacts will start fresh on the next message. This removes saved session state and cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={loading}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <Button data-tour="pages-flow-builder.button.flow_builder.save_and_clear_sessions"
              type="button"
              variant="outline"
              disabled={loading}
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => void performFlowSave(true)}
            >
              {t('flow_builder.save_and_clear_sessions', 'Save and clear sessions')}
            </Button>
            <Button data-tour="pages-flow-builder.button.flow_builder.save_without_clearing_sessions"
              type="button"
              variant="default"
              disabled={loading}
              className="btn-brand-primary"
              autoFocus
              onClick={() => void performFlowSave(false)}
            >
              {t('flow_builder.save_without_clearing_sessions', 'Save only')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={goBackPromptOpen} onOpenChange={setGoBackPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('flow_builder.go_back_confirm_title', 'Discard changes?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'flow_builder.go_back_confirm_description',
                'Any unsaved changes to this flow will be discarded. Are you sure you want to go back?'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('flow_builder.go_back_stay', 'Stay here')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => navigate('/flows')}
            >
              {t('flow_builder.go_back_discard', 'Discard changes and go back')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flow-header sticky top-0 z-30 shrink-0 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 md:col-start-2 md:row-start-1">
        <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center lg:w-auto lg:min-w-0">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-90 md:hidden lg:shrink-0"
            >
              <BrandingLogo logoHeight="h-10" className="justify-start" />
              {!branding.logoUrl && (
                <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {branding.appName}
                </div>
              )}
            </Link>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button data-tour="pages-flow-builder.button.flow_builder.expand_node_panel"
                  type="button"
                  variant="outline"
                  size="icon"
                  className="hidden shrink-0 md:inline-flex"
                  onClick={() => setNodeSidebarCollapsed((collapsed) => !collapsed)}
                  aria-label={nodeSidebarCollapsed
                    ? t('flow_builder.expand_node_panel', 'Expand node panel')
                    : t('flow_builder.collapse_node_panel', 'Collapse node panel')}
                >
                  {nodeSidebarCollapsed
                    ? <PanelLeftOpen className="h-4 w-4" />
                    : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {nodeSidebarCollapsed
                  ? t('flow_builder.expand_node_panel_tooltip', 'Show nodes and variables')
                  : t('flow_builder.collapse_node_panel_tooltip', 'Collapse panel for more canvas space')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Input data-tour="pages-flow-builder.input.flow_builder.main.flow_name"
            placeholder={t('flow_builder.main.flow_name', 'Flow name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full sm:flex-1 lg:w-64 lg:flex-none"
          />
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:flex-1 lg:min-w-0">
            <Button data-tour="pages-flow-builder.button.common.save"
              variant="outline"
              onClick={promptSaveFlow}
              disabled={loading}
              className="flex-1 px-3 sm:flex-none min-[1800px]:px-4 btn-brand-primary"
              aria-label={t('common.save', 'Save')}
              title={t('common.save', 'Save')}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin min-[1800px]:mr-2" />
              ) : (
                <Save className="h-4 w-4 min-[1800px]:mr-2" />
              )}
              <span className="hidden min-[1800px]:inline">{t('common.save', 'Save')}</span>
            </Button>
            <div className="flex-1 sm:flex-none">
              <Button data-tour="pages-flow-builder.button.flow_builder.main.go_back"
                type="button"
                variant="outline"
                className="w-full px-3 min-[1800px]:px-4"
                onClick={() => {
                  if (savedFlowSignatureRef.current === getCurrentFlowDraftSignature()) {
                    navigate('/flows');
                    return;
                  }
                  setGoBackPromptOpen(true);
                }}
                aria-label={t('flow_builder.main.go_back', 'Go Back')}
                title={t('flow_builder.main.go_back', 'Go Back')}
              >
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('flow_builder.main.go_back', 'Go Back')}</span>
              </Button>
            </div>
            <div className="flex overflow-hidden rounded-md border">
              <Button data-tour="pages-flow-builder.button.flow_builder.history.undo"
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none border-r"
                onClick={undoEditor}
                disabled={!canUndo || creatorCanvasLocked || Boolean(creatorGhostDraft)}
                aria-label={t('flow_builder.history.undo', 'Undo')}
                title={`${t('flow_builder.history.undo', 'Undo')} (Ctrl+Z)`}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button data-tour="pages-flow-builder.button.flow_builder.history.redo"
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={redoEditor}
                disabled={!canRedo || creatorCanvasLocked || Boolean(creatorGhostDraft)}
                aria-label={t('flow_builder.history.redo', 'Redo')}
                title={`${t('flow_builder.history.redo', 'Redo')} (Ctrl+Shift+Z)`}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="pages-flow-builder.button.flow_builder.main.arranging"
                    variant="outline"
                    onClick={autoArrangeNodes}
                    disabled={isAutoArranging || nodes.length === 0}
                    className="flex-1 px-3 sm:flex-none min-[1800px]:px-4"
                    aria-label={isAutoArranging ? t('flow_builder.main.arranging', 'Arranging...') : t('flow_builder.main.auto_arrange', 'Auto-Arrange')}
                  >
                    {isAutoArranging ? (
                      <Loader2 className="h-4 w-4 animate-spin min-[1800px]:mr-2" />
                    ) : (
                      <LayoutGrid className="h-4 w-4 min-[1800px]:mr-2" />
                    )}
                    <span className="hidden min-[1800px]:inline">
                      {isAutoArranging ? t('flow_builder.main.arranging', 'Arranging...') : t('flow_builder.main.auto_arrange', 'Auto-Arrange')}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.main.auto_arrange_tooltip', 'Automatically organize all nodes in a clean hierarchical layout')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('flow_builder.main.auto_arrange_shortcut', 'Shortcut: Ctrl+Shift+A')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="pages-flow-builder.button.flow_builder.main.execution_history"
                    variant="outline"
                    onClick={() => setIsExecutionHistoryOpen(true)}
                    className="flex-1 px-3 sm:flex-none min-[1800px]:px-4"
                    aria-label={t('flow_builder.main.execution_history', 'Execution History')}
                  >
                    <Clock className="h-4 w-4 min-[1800px]:mr-2" />
                    <span className="hidden min-[1800px]:inline">{t('flow_builder.main.execution_history', 'Execution History')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.main.execution_history_tooltip', 'Inspect durable execution runs and node history')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="pages-flow-builder.button.flow_builder.main.templates"
                    variant="outline"
                    onClick={() => setIsTemplatesModalOpen(true)}
                    className="flex-1 px-3 sm:flex-none min-[1800px]:px-4"
                    aria-label={t('flow_builder.main.templates', 'Templates')}
                  >
                    <LayoutTemplate className="h-4 w-4 min-[1800px]:mr-2" />
                    <span className="hidden min-[1800px]:inline">{t('flow_builder.main.templates', 'Templates')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.main.templates_tooltip', 'Apply a flow template')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="pages-flow-builder.button.flow_builder.main.variables"
                    variant="outline"
                    onClick={() => setIsVariableManagerOpen(true)}
                    className="flex-1 px-3 sm:flex-none min-[1800px]:px-4"
                    aria-label={t('flow_builder.main.variables', 'Variables')}
                  >
                    <Variable className="h-4 w-4 min-[1800px]:mr-2" />
                    <span className="hidden min-[1800px]:inline">{t('flow_builder.main.variables', 'Variables')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.main.custom_variables', 'Define custom variables for this flow')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="pages-flow-builder.button.flow_builder.media_gallery.title"
                    variant="outline"
                    onClick={() => setIsMediaGalleryOpen(true)}
                    className="flex-1 px-3 sm:flex-none min-[1800px]:px-4"
                    aria-label={t('flow_builder.media_gallery.title', 'Media Gallery')}
                  >
                    <Images className="h-4 w-4 min-[1800px]:mr-2" />
                    <span className="hidden min-[1800px]:inline">{t('flow_builder.media_gallery.title', 'Media Gallery')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>{t('flow_builder.media_gallery.tooltip', 'Upload reusable media and assign flow variables')}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="ml-auto flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button data-tour="pages-flow-builder.button.fullscreen.exit"
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void toggleFullscreen()}
                      aria-label={isFullscreen ? t('fullscreen.exit', 'Exit fullscreen') : t('fullscreen.enter', 'Enter fullscreen')}
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isFullscreen ? t('fullscreen.exit', 'Exit fullscreen') : t('fullscreen.enter', 'Enter fullscreen')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <ThemeToggle variant="compact" />
              <LanguageSwitcher variant="compact" />
              <GuidedTourHelpButton />
              <Button data-tour="pages-flow-builder.button.flow_builder.close_node_panel"
                type="button"
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-expanded={sidebarOpen}
                onClick={() => { if(!sidebarOpen)setNodeSidebarCollapsed(false);setSidebarOpen(!sidebarOpen); }}
                aria-label={sidebarOpen
                  ? t('flow_builder.close_node_panel', 'Close node panel')
                  : t('flow_builder.open_node_panel', 'Open node panel')}
              >
                {sidebarOpen
                  ? <PanelLeftClose className="h-4 w-4" />
                  : <PanelLeftOpen className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex relative min-h-0 md:contents">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`flow-sidebar border-r bg-background shadow-lg md:shadow-none z-20 transition-[width,min-width,max-width] duration-300 ease-in-out md:col-start-1 md:row-span-2 md:row-start-1 md:h-full md:w-full md:min-w-0 md:max-w-none ${
            nodeSidebarCollapsed
              ? 'hidden md:relative md:flex min-h-0 h-full w-full flex-col sm:w-80 md:shrink-0'
              : sidebarOpen
                ? 'absolute md:relative flex min-h-0 h-full w-full flex-col sm:w-80'
                : 'hidden md:flex md:min-h-0 md:flex-col'
          }`}
        >
          <div className={`hidden h-[81px] shrink-0 items-center border-b px-4 md:flex ${
            nodeSidebarCollapsed ? 'justify-center px-1' : 'justify-start'
          }`}>
            <Link
              href="/"
              className="flex min-w-0 items-center justify-center rounded-md transition-opacity hover:opacity-90"
              aria-label={branding.appName}
            >
              {nodeSidebarCollapsed && branding.faviconUrl ? (
                <img
                  src={branding.faviconUrl}
                  alt={`${branding.appName} favicon`}
                  className="h-9 w-9 rounded-lg object-contain"
                />
              ) : (
                <BrandingLogo
                  logoHeight={nodeSidebarCollapsed ? 'h-8' : 'h-12'}
                  className={nodeSidebarCollapsed ? 'w-10 justify-center overflow-hidden' : 'w-full justify-start overflow-hidden'}
                />
              )}
              {!branding.logoUrl && !nodeSidebarCollapsed && (
                <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {branding.appName}
                </div>
              )}
            </Link>
          </div>

          <div className="flex justify-between items-center p-4 border-b md:hidden">
            <h3 className="font-medium">{t('flow_builder.main.node_selection', 'Node Selection')}</h3>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {!nodeSidebarCollapsed && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <SidebarContent
                nodes={nodes}
                flowId={flowId || undefined}
                customVariables={customVariables}
                onAdd={(type) => {
                  onAddNode(type);
                  if (window.innerWidth < 768) {
                    setSidebarOpen(false);
                  }
                }}
              />
            </div>
          )}
          {nodeSidebarCollapsed && (
            <div className="hidden min-h-0 flex-1 flex-col items-stretch overflow-hidden pt-2 md:flex">
              <TooltipProvider delayDuration={300}>
                <div
                  className="custom-scrollbar flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden px-1 pb-2"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {collapsedNodeCatalog.map((catalogNode) => (
                    <Tooltip key={catalogNode.type}>
                      <TooltipTrigger asChild>
                        <Button
                          data-tour-node-type={catalogNode.type}
                          type="button"
                          variant="outline"
                          size="icon"
                          className={`h-9 w-9 shrink-0 p-0 ${catalogNode.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          disabled={catalogNode.disabled}
                          title={catalogNode.disabled ? catalogNode.tooltip || catalogNode.name : undefined}
                          onClick={() => {
                            if (catalogNode.disabled) return;
                            onAddNode(catalogNode.type);
                          }}
                          aria-label={catalogNode.name}
                        >
                          <img
                            src={catalogNode.iconSrc}
                            alt=""
                            className={`h-5 w-5 object-contain ${catalogNode.color}`}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="font-medium">{catalogNode.name}</p>
                        {catalogNode.tooltip ? (
                          <p className="text-xs text-muted-foreground">{catalogNode.tooltip}</p>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>
          )}
        </div>

        <div
          className={`flow-container relative min-h-0 min-w-0 flex-1 flex flex-col md:col-start-2 md:row-start-2 ${
            sidebarOpen ? 'hidden md:flex' : 'flex'
          }`}
          ref={reactFlowWrapper} data-tour="flow-canvas"
          onWheelCapture={handleFlowBuilderNodeWheelCapture}
        >
          {!isCreatorOpen && (
            <CreatorEdgeToggle
              expanded={false}
              position={creatorTogglePosition}
              onPositionChange={updateCreatorTogglePosition}
              onToggle={() => setIsCreatorOpen(true)}
              label={t('flow_builder.creator.open', 'Open Workflow Creator')}
              className="absolute right-0 z-30"
            />
          )}
          <AutoArrangeCollapseSignalProvider signal={autoArrangeCollapseSignal}>
          <FlowProvider
            onDeleteNode={onDeleteNode}
            onDuplicateNode={onDuplicateNode}
            flowId={flowId}
            customVariables={customVariables}
            setCustomVariables={setCustomVariables}
          >
            <ReactFlow
              className="h-full w-full"
              nodes={displayedNodes}
              edges={displayedEdges}
              onInit={(instance) => {
                if (!isEditMode) {
                  setTimeout(() => {
                    try {
                      instance.fitView({
                        padding: 0.12,
                        includeHiddenNodes: false,
                        minZoom: 0.1,
                        maxZoom: 1.5,
                      });
                    } catch {
                      /* ignore */
                    }
                  }, 100);
                }
              }}
              onNodesChange={creatorCanvasLocked || creatorGhostDraft ? undefined : onNodesChange}
              onEdgesChange={creatorCanvasLocked || creatorGhostDraft ? undefined : onEdgesChange}
              onConnect={creatorCanvasLocked || creatorGhostDraft ? undefined : onConnect}
              onNodeDragStart={creatorCanvasLocked || creatorGhostDraft ? undefined : handleHistoryNodeDragStart}
              onNodeDragStop={creatorCanvasLocked || creatorGhostDraft ? undefined : handleHistoryNodeDragStop}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              selectionOnDrag={false}
              selectionKeyCode={['Control', 'Meta']}
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode={null}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{
          animated: true,
          type: 'smoothstep',
          style: { stroke: 'hsl(var(--muted-foreground))' }
              }}
            >
              <Background />
              <Controls />
              <MiniMap
                nodeColor={() => 'hsl(var(--primary))'}
                maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)'}
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))'
                }}
                className="react-flow__minimap"
              />
              <Panel position="top-right" className="bg-background p-2 rounded-md shadow-sm border border-border">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${
              isEditMode ? (
                flowData?.status === 'active' ? 'bg-primary' : 'bg-muted-foreground'
              ) : 'bg-primary'
            }`} />
            {isEditMode ? (
              flowData?.status === 'active' ? t('flow_builder.active', 'Active') : t('flow_builder.draft', 'Draft')
            ) : t('flow_builder.creating_new_flow', 'Creating New Flow')}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('flow_builder.current_flow_status', 'Current flow status')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
              </Panel>
              {creatorPreviewNative && creatorFocusedNodeId && <Panel position="top-center" className="rounded-full border border-primary/30 bg-background/90 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur"><span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />{creatorFocusedField ? t('flow_builder.creator.editing_field', 'Editing {{field}}', { field: creatorFocusedField }) : t('flow_builder.creator.editing_node', 'Editing node')}</span></Panel>}
            </ReactFlow>
          </FlowProvider>
          </AutoArrangeCollapseSignalProvider>
        </div>

        <FlowTemplatesModal
          isOpen={isTemplatesModalOpen}
          onClose={() => setIsTemplatesModalOpen(false)}
          onApplyTemplate={handleApplyTemplateFlow}
        />
        <ExecutionHistoryModal
          isOpen={isExecutionHistoryOpen}
          onClose={() => setIsExecutionHistoryOpen(false)}
          flowId={flowId ?? null}
        />
        <CustomVariableManagerDialog
          open={isVariableManagerOpen}
          onOpenChange={setIsVariableManagerOpen}
          customVariables={customVariables}
          onChange={setCustomVariables}
          flowId={flowId ?? undefined}
        />
        <MediaGalleryDialog
          open={isMediaGalleryOpen}
          onOpenChange={setIsMediaGalleryOpen}
          flowId={flowId}
          ensureFlowId={ensureFlowForMedia}
          nodes={nodes}
          customVariables={customVariables}
          onVariableTakeover={(variableName) => {
            setNodes((currentNodes) => removeStaleInferredAiMediaVariables(
              currentNodes,
              new Set([variableName]),
            ) as typeof currentNodes);
          }}
        />
        <AIWorkflowCreatorPanel
          open={isCreatorOpen}
          onClose={() => {
            setIsCreatorOpen(false);
            setCreatorGhostDraft(null);
          }}
          flowId={flowId}
          isEditMode={isEditMode}
          currentGraph={{
            name,
            nodes: normalizeFlowNodesAgentControl(nodes) as FlowGraphDraft['nodes'],
            edges: edges as FlowGraphDraft['edges'],
            customVariables: customVariables as unknown as FlowGraphDraft['customVariables'],
          }}
          onGhostChange={setCreatorGhostDraft}
          onPreviewPresentationChange={(native) => {
            setCreatorPreviewNative(native);
            if (!native) {
              setCreatorFocusedNodeId(null);
              setCreatorFocusedField(null);
            }
          }}
          onFocusNode={focusCreatorNode}
          onGenerationStateChange={setCreatorCanvasLocked}
          onAccept={handleAcceptCreatorGeneration}
          togglePosition={creatorTogglePosition}
          onTogglePositionChange={updateCreatorTogglePosition}
        />
      </div>
    </div>
  );
}

function FlowProvider({ children, onDeleteNode, onDuplicateNode, flowId, customVariables, setCustomVariables }: {
  children: React.ReactNode;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  flowId?: number | null;
  customVariables: FlowCustomVariable[];
  setCustomVariables: React.Dispatch<React.SetStateAction<FlowCustomVariable[]>>;
}) {
  const execution = useFlowExecution(flowId ?? undefined);

  return (
    <FlowContext.Provider value={{
      onDeleteNode,
      onDuplicateNode,
      flowId,
      getNodeExecutionStatus: execution.getNodeExecutionStatus,
      customVariables,
      setCustomVariables
    }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlowContext() {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}

export default function FlowBuilderPage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}
