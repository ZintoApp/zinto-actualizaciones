import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  GripHorizontal,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Workflow,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useOpenRouterModels } from '@/services/openrouter';
import { useAzureDeploymentsQuery } from '@/services/azure';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_AZURE_OPENAI_API_VERSION, uniqueAzureDeploymentCatalog } from '@shared/ai-providers';
import { aiCreatorModelSupportsImage, aiCreatorVisionFallback } from '@shared/ai-providers';
import type {
  AiFlowCreatorCredentialSource,
  AiFlowCreatorActivityEntry,
  AiFlowCreatorHistory,
  AiFlowCreatorMode,
  AiFlowCreatorProgressPhase,
  AiFlowCreatorProgressEvent,
  AiFlowCreatorProvider,
  AiFlowGenerationEvent,
  FlowGraphDraft,
  FlowValidationIssue,
  FlowValidationResult,
} from '@shared/types/ai-flow-creator';
import { cn } from '@/lib/utils';
import { getFlowNodeVariablesFromNodes, useFlowVariables, type FlowVariable } from '@/hooks/useFlowVariables';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';
import {
  CreatorHero,
  CreatorProviderMark,
  CreatorTemplateCards,
  CreatorVariableMenu,
} from './AIWorkflowCreatorVisuals';
import { CreatorEdgeToggle } from './CreatorEdgeToggle';
import {
  AIWorkflowCreatorProgressTimeline,
  type CreatorProgressEntry,
  type CreatorProgressTimeline,
} from './AIWorkflowCreatorProgress';
import { upsertCreatorProgressEntry } from '@shared/ai-flow-creator-progress';

export type CompletedCreatorGeneration = {
  generationId: string;
  generationProof: string;
  beforeGraphHash: string;
  draft: FlowGraphDraft;
  summary: string;
  assumptions: string[];
  validation: FlowValidationResult;
  graphHash: string;
  provider: AiFlowCreatorProvider;
  credentialSource: AiFlowCreatorCredentialSource;
  model: string;
  prompt: string;
};

type CreatorMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  attachments?: Array<{ name: string; size: number; kind: 'image' | 'document' }>;
  activity?: AiFlowCreatorActivityEntry[];
};

type CreatorResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const CREATOR_RESIZE_HANDLES: Array<{ direction: CreatorResizeDirection; className: string }> = [
  { direction: 'n', className: 'left-3 right-3 top-0 h-1.5 cursor-n-resize' },
  { direction: 's', className: 'bottom-0 left-3 right-3 h-1.5 cursor-s-resize' },
  { direction: 'e', className: 'bottom-3 right-0 top-3 w-1.5 cursor-e-resize' },
  { direction: 'w', className: 'bottom-3 left-0 top-3 w-1.5 cursor-w-resize' },
  { direction: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-ne-resize' },
  { direction: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nw-resize' },
  { direction: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  flowId?: number | null;
  isEditMode: boolean;
  currentGraph: FlowGraphDraft;
  onGhostChange: (draft: FlowGraphDraft | null) => void;
  onAccept: (result: CompletedCreatorGeneration, messages: CreatorMessage[]) => void;
  togglePosition: number;
  onTogglePositionChange: (position: number) => void;
  onPreviewPresentationChange?: (native: boolean) => void;
  onFocusNode?: (nodeId: string, field?: string) => void;
  onGenerationStateChange?: (running: boolean) => void;
};

const DEFAULT_CREATOR_MODELS: Record<AiFlowCreatorProvider, string> = {
  openai: 'gpt-5.6-sol',
  openrouter: 'openai/gpt-5.6-sol',
  azure: 'gpt-5.6-sol',
};

const OPENAI_MODELS = [
  { id: DEFAULT_CREATOR_MODELS.openai, name: 'GPT-5.6 Sol' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.1', name: 'GPT-5.1' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
];

const FALLBACK_OPENROUTER_MODELS = [
  { id: DEFAULT_CREATOR_MODELS.openrouter, name: 'GPT-5.6 Sol via OpenRouter' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4 via OpenRouter' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1 via OpenRouter' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
];

const CREATOR_STATUS_LABELS: Record<AiFlowCreatorProgressPhase, { key: string; fallback: string }> = {
  starting: { key: 'flow_builder.creator.status.starting', fallback: 'Starting the AI workflow creator…' },
  model_adjusted: { key: 'flow_builder.creator.status.model_adjusted', fallback: 'Selecting a compatible AI model…' },
  preflight: { key: 'flow_builder.creator.status.preflight', fallback: 'Checking the workflow and credentials…' },
  retrieval: { key: 'flow_builder.creator.status.retrieval', fallback: 'Reviewing available nodes and capabilities…' },
  planning: { key: 'flow_builder.creator.status.planning', fallback: 'Planning the workflow structure…' },
  building: { key: 'flow_builder.creator.status.building', fallback: 'Creating and connecting workflow nodes…' },
  validating: { key: 'flow_builder.creator.status.validating', fallback: 'Validating the generated workflow…' },
  repairing: { key: 'flow_builder.creator.status.repairing', fallback: 'Repairing validation issues…' },
  finalizing: { key: 'flow_builder.creator.status.finalizing', fallback: 'Preparing the completed workflow…' },
};

const PERSONAL_INFORMATION_PROMPT_TEMPLATE = `I want to create a flow that asks the customer questions about their personal information, captures their responses, and, at the end, sends the customer a confirmation message summarizing the data they provided.

The flow should collect the following information:

- Name
- Father's Name
- Address
- Occupation

At the end, send a confirmation message such as:

"Here is the information you shared with us. Please review it and confirm that everything is correct."`;

const LEAD_CAPTURE_PROMPT_TEMPLATE = `Create an unofficial WhatsApp lead-capture flow.

Ask for the following information step by step and save every response as a reusable Data Capture variable:

- Full name
- WhatsApp or phone number
- Email address
- Company or business name
- Product or service of interest
- Budget range
- Expected purchase timeline
- City or location
- Preferred contact method
- Additional requirements or notes

When all details have been collected, send the lead a complete summary and ask them to confirm that everything is correct.

After the lead confirms, use the native Pipeline node with the create_deal operation to add the lead as a deal to the company's default pipeline and its first suitable stage. Select the default pipeline and stage from the accessible company resources; do not invent IDs. Attach the deal to the current contact, use the captured lead name in the deal title, include the captured requirements in the deal description, and prevent duplicate active deals when possible.

Finally, tell the lead that their inquiry was received and added to the pipeline. If no default pipeline or suitable stage is available, keep the workflow as a draft and show a concise setup requirement.`;

type RememberedCreatorSelection = {
  provider: AiFlowCreatorProvider;
  credentialSource: AiFlowCreatorCredentialSource;
  modelsByProvider: Partial<Record<AiFlowCreatorProvider, string>>;
};

const CREATOR_SELECTION_STORAGE_VERSION = 1;
const CREATOR_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const CREATOR_ATTACHMENT_MAX_COUNT = 5;
const CREATOR_ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.txt,.md,.markdown,.csv,.xls,.xlsx,.json';
const CREATOR_ATTACHMENT_EXTENSIONS = new Set(CREATOR_ATTACHMENT_ACCEPT.split(','));

function formatCreatorFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function creatorFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function isCreatorImage(file: File): boolean {
  return ['.png', '.jpg', '.jpeg', '.webp'].includes(creatorFileExtension(file.name));
}

function readRememberedCreatorSelection(storageKey: string): RememberedCreatorSelection | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedCreatorSelection>;
    if (!['openai', 'openrouter', 'azure'].includes(String(parsed.provider))) return null;
    if (!['auto', 'company', 'system', 'manual'].includes(String(parsed.credentialSource))) return null;
    const modelsByProvider = Object.fromEntries(
      Object.entries(parsed.modelsByProvider ?? {})
        .filter(([provider, model]) => ['openai', 'openrouter', 'azure'].includes(provider) && typeof model === 'string' && model.trim())
        .map(([provider, model]) => [provider, String(model).trim()]),
    ) as Partial<Record<AiFlowCreatorProvider, string>>;
    return {
      provider: parsed.provider as AiFlowCreatorProvider,
      credentialSource: parsed.credentialSource as AiFlowCreatorCredentialSource,
      modelsByProvider,
    };
  } catch {
    return null;
  }
}

function readSseEvents(buffer: string): { events: AiFlowGenerationEvent[]; remainder: string } {
  const normalized = buffer.replaceAll('\r\n', '\n');
  const frames = normalized.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: AiFlowGenerationEvent[] = [];
  for (const frame of frames) {
    const payload = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload) as AiFlowGenerationEvent);
    } catch {
      // Ignore malformed transport frames; the server sends a terminal error event when generation fails.
    }
  }
  return { events, remainder };
}

export function AIWorkflowCreatorPanel({
  open,
  onClose,
  flowId,
  isEditMode,
  currentGraph,
  onGhostChange,
  onAccept,
  togglePosition,
  onTogglePositionChange,
  onPreviewPresentationChange,
  onFocusNode,
  onGenerationStateChange,
}: Props) {
  const { user, company } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [instruction, setInstruction] = useState('');
  const [provider, setProvider] = useState<AiFlowCreatorProvider>('openai');
  const [credentialSource, setCredentialSource] = useState<AiFlowCreatorCredentialSource>('auto');
  const [model, setModel] = useState(DEFAULT_CREATOR_MODELS.openai);
  const [manualApiKey, setManualApiKey] = useState('');
  const [azureEndpoint, setAzureEndpoint] = useState('');
  const [azureApiVersion, setAzureApiVersion] = useState(DEFAULT_AZURE_OPENAI_API_VERSION);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressTimelines, setProgressTimelines] = useState<CreatorProgressTimeline[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatusPhase, setGenerationStatusPhase] = useState<AiFlowCreatorProgressPhase>('starting');
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [originalInstruction, setOriginalInstruction] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedCreatorGeneration | null>(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [variableCursor, setVariableCursor] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const enhancementAbortRef = useRef<AbortController | null>(null);
  const activeTimelineIdRef = useRef<string | null>(null);
  const activeGenerationIdRef = useRef<string | null>(null);
  const generationTerminalRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const ghostNodesRef = useRef<FlowGraphDraft['nodes']>([]);
  const ghostEdgesRef = useRef<FlowGraphDraft['edges']>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const expandedInstructionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preferencesAppliedRef = useRef<string | null>(null);
  const rememberedModelsRef = useRef<Partial<Record<AiFlowCreatorProvider, string>>>({ ...DEFAULT_CREATOR_MODELS });
  const rememberedSelectionRef = useRef<string | null>(null);
  const [selectionReadyKey, setSelectionReadyKey] = useState('');
  const [creatorMode, setCreatorMode] = useState<AiFlowCreatorMode>('interactive');
  const [liveActivity, setLiveActivity] = useState<AiFlowCreatorActivityEntry[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'chat' | 'canvas'>('chat');
  const [isCanvasDocked, setIsCanvasDocked] = useState(false);
  const [windowPosition, setWindowPosition] = useState(() => ({
    x: typeof window === 'undefined' ? 16 : Math.max(16, window.innerWidth - Math.min(660, window.innerWidth - 32) - 16),
    y: typeof window === 'undefined' ? 16 : Math.max(16, window.innerHeight - Math.min(780, window.innerHeight - 32) - 16),
  }));
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === 'undefined' ? 660 : Math.min(660, window.innerWidth - 32),
    height: typeof window === 'undefined' ? 780 : Math.min(780, window.innerHeight - 32),
  }));
  const creatorPanelRef = useRef<HTMLDivElement>(null);
  const creatorDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const creatorResizeRef = useRef<{
    pointerId: number;
    direction: CreatorResizeDirection;
    startX: number;
    startY: number;
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);

  const canvasVariables = useMemo(() => getFlowNodeVariablesFromNodes(currentGraph.nodes), [currentGraph.nodes]);
  const { variables: promptVariables } = useFlowVariables(
    flowId ?? undefined,
    (currentGraph.customVariables ?? []) as unknown as FlowCustomVariable[],
    canvasVariables,
  );

  const selectionStorageKey = useMemo(() => {
    if (!user?.id) return '';
    const companyId = company?.id ?? user.companyId ?? 'none';
    return `bothive:ai-flow-creator-selection:v${CREATOR_SELECTION_STORAGE_VERSION}:${companyId}:${user.id}`;
  }, [company?.id, user?.companyId, user?.id]);
  const modeStorageKey = selectionStorageKey ? `${selectionStorageKey}:mode` : '';

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resize = creatorResizeRef.current;
      if (resize && event.pointerId === resize.pointerId && !isFullscreen && !isCanvasDocked && !isMobile) {
        event.preventDefault();
        const deltaX = event.clientX - resize.startX;
        const deltaY = event.clientY - resize.startY;
        const movesWest = resize.direction.includes('w');
        const movesEast = resize.direction.includes('e');
        const movesNorth = resize.direction.includes('n');
        const movesSouth = resize.direction.includes('s');
        let width = resize.size.width;
        let height = resize.size.height;
        let x = resize.position.x;
        let y = resize.position.y;
        if (movesEast) width = Math.min(Math.max(420, resize.size.width + deltaX), window.innerWidth - resize.position.x - 8);
        if (movesSouth) height = Math.min(Math.max(420, resize.size.height + deltaY), window.innerHeight - resize.position.y - 8);
        if (movesWest) {
          width = Math.min(Math.max(420, resize.size.width - deltaX), resize.position.x + resize.size.width - 8);
          x = resize.position.x + resize.size.width - width;
        }
        if (movesNorth) {
          height = Math.min(Math.max(420, resize.size.height - deltaY), resize.position.y + resize.size.height - 8);
          y = resize.position.y + resize.size.height - height;
        }
        setWindowPosition({ x, y });
        setWindowSize({ width, height });
        return;
      }
      const drag = creatorDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId || isFullscreen || isCanvasDocked || isMobile) return;
      event.preventDefault();
      const bounds = creatorPanelRef.current?.getBoundingClientRect();
      const panelWidth = bounds?.width ?? windowSize.width;
      const panelHeight = bounds?.height ?? windowSize.height;
      setWindowPosition({
        x: Math.min(Math.max(8, event.clientX - drag.offsetX), Math.max(8, window.innerWidth - panelWidth - 8)),
        y: Math.min(Math.max(8, event.clientY - drag.offsetY), Math.max(8, window.innerHeight - panelHeight - 8)),
      });
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (creatorDragRef.current?.pointerId === event.pointerId) creatorDragRef.current = null;
      if (creatorResizeRef.current?.pointerId === event.pointerId) creatorResizeRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isCanvasDocked, isFullscreen, isMobile, windowSize.height, windowSize.width]);

  const startCreatorDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen || isCanvasDocked || isMobile || event.button !== 0) return;
    const bounds = creatorPanelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    creatorDragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
  };

  const startCreatorResize = (direction: CreatorResizeDirection, event: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen || isCanvasDocked || isMobile || event.button !== 0) return;
    const bounds = creatorPanelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    event.stopPropagation();
    creatorResizeRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      position: { x: bounds.left, y: bounds.top },
      size: { width: bounds.width, height: bounds.height },
    };
  };

  useEffect(() => {
    if (!open || !modeStorageKey) return;
    try {
      const saved = window.localStorage.getItem(modeStorageKey);
      setCreatorMode(saved === 'normal' ? 'normal' : 'interactive');
    } catch {
      setCreatorMode('interactive');
    }
  }, [modeStorageKey, open]);

  const changeCreatorMode = (mode: AiFlowCreatorMode) => {
    setCreatorMode(mode);
    try { if (modeStorageKey) window.localStorage.setItem(modeStorageKey, mode); } catch { /* optional preference */ }
  };

  const historyQuery = useQuery<AiFlowCreatorHistory>({
    queryKey: ['/api/flows', flowId, 'ai-creator', 'history'],
    queryFn: async () => {
      const response = await fetch(`/api/flows/${flowId}/ai-creator/history`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load Creator history');
      return response.json();
    },
    enabled: open && Boolean(flowId),
    staleTime: 30_000,
  });
  const preferencesQuery = useQuery({
    queryKey: ['company-ai-credentials-preferences'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials/preferences');
      return response.json();
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const availabilityQuery = useQuery({
    queryKey: ['company-ai-credentials-availability', provider, credentialSource],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/company/ai-credentials/availability?provider=${provider}&preference=${credentialSource}`);
      const payload = await response.json();
      return Boolean(payload?.data?.available);
    },
    enabled: open && credentialSource !== 'manual',
    staleTime: 60_000,
  });
  const openRouterQuery = useQuery({ ...useOpenRouterModels(), enabled: open && provider === 'openrouter' });
  const azureQuery = useAzureDeploymentsQuery(open && provider === 'azure' && credentialSource !== 'manual');

  useEffect(() => {
    if (!open || !historyQuery.data || messages.length) return;
    setMessages(historyQuery.data.messages.map((message) => ({
      id: String(message.id),
      role: message.role,
      content: message.content,
      activity: message.activity,
    })));
  }, [open, historyQuery.data, messages.length]);

  useEffect(() => {
    if (!open || !selectionStorageKey || selectionReadyKey === selectionStorageKey) return;
    const remembered = readRememberedCreatorSelection(selectionStorageKey);
    rememberedSelectionRef.current = remembered ? selectionStorageKey : null;
    if (remembered) {
      rememberedModelsRef.current = { ...rememberedModelsRef.current, ...remembered.modelsByProvider };
      setProvider(remembered.provider);
      setCredentialSource(remembered.credentialSource);
      const rememberedModel = remembered.modelsByProvider[remembered.provider];
      if (rememberedModel) setModel(rememberedModel);
    }
    setSelectionReadyKey(selectionStorageKey);
  }, [open, selectionReadyKey, selectionStorageKey]);

  useEffect(() => {
    if (!open || !selectionStorageKey || selectionReadyKey !== selectionStorageKey || preferencesAppliedRef.current === selectionStorageKey || !preferencesQuery.data?.data) return;
    if (rememberedSelectionRef.current === selectionStorageKey) {
      preferencesAppliedRef.current = selectionStorageKey;
      return;
    }
    const preferredProvider = preferencesQuery.data.data.defaultProvider;
    const preferredSource = preferencesQuery.data.data.credentialPreference;
    if (['openai', 'openrouter', 'azure'].includes(preferredProvider)) setProvider(preferredProvider);
    if (['auto', 'company', 'system'].includes(preferredSource)) setCredentialSource(preferredSource);
    preferencesAppliedRef.current = selectionStorageKey;
  }, [open, preferencesQuery.data, selectionReadyKey, selectionStorageKey]);

  const models = useMemo(() => {
    if (provider === 'openrouter') {
      const available = openRouterQuery.data?.map((entry) => ({ id: entry.id, name: entry.name })) ?? FALLBACK_OPENROUTER_MODELS;
      return available.some((entry) => entry.id === DEFAULT_CREATOR_MODELS.openrouter)
        ? available
        : [{ id: DEFAULT_CREATOR_MODELS.openrouter, name: 'GPT-5.6 Sol via OpenRouter' }, ...available];
    }
    if (provider === 'azure') {
      const deployments = uniqueAzureDeploymentCatalog(azureQuery.data ?? [])
        .filter((entry) => entry.kind === 'chat')
        .map((entry) => ({ id: entry.id, name: entry.name }));
      return deployments.some((entry) => entry.id === DEFAULT_CREATOR_MODELS.azure)
        ? deployments
        : [{ id: DEFAULT_CREATOR_MODELS.azure, name: 'GPT-5.6 Sol' }, ...deployments];
    }
    return OPENAI_MODELS;
  }, [provider, openRouterQuery.data, azureQuery.data]);

  useEffect(() => {
    if (provider === 'openai' && !model.startsWith('gpt-')) setModel(DEFAULT_CREATOR_MODELS.openai);
    if (provider === 'openrouter' && !model.includes('/')) setModel(DEFAULT_CREATOR_MODELS.openrouter);
    if (provider === 'azure' && models.length && !models.some((entry) => entry.id === model)) setModel(models[0].id);
  }, [provider, models, model, openRouterQuery.data]);

  useEffect(() => {
    if (!selectionStorageKey || selectionReadyKey !== selectionStorageKey || !model.trim()) return;
    rememberedModelsRef.current = { ...rememberedModelsRef.current, [provider]: model.trim() };
    const selection: RememberedCreatorSelection = {
      provider,
      credentialSource,
      modelsByProvider: rememberedModelsRef.current,
    };
    try {
      // Store selection metadata only. API keys, endpoints, and credential contents are never persisted here.
      window.localStorage.setItem(selectionStorageKey, JSON.stringify(selection));
      rememberedSelectionRef.current = selectionStorageKey;
    } catch {
      // Storage can be unavailable in hardened/private browser contexts; company defaults still work.
    }
  }, [credentialSource, model, provider, selectionReadyKey, selectionStorageKey]);

  const handleProviderChange = (nextProvider: AiFlowCreatorProvider) => {
    if (model.trim()) rememberedModelsRef.current = { ...rememberedModelsRef.current, [provider]: model.trim() };
    setProvider(nextProvider);
    const rememberedModel = rememberedModelsRef.current[nextProvider];
    if (rememberedModel) setModel(rememberedModel);
  };

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, progressTimelines, completed]);

  const handleConversationScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.scrollHeight <= target.clientHeight) return;
    shouldAutoScrollRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 96;
  };

  const publishGhost = () => {
    onGhostChange({
      nodes: [...ghostNodesRef.current],
      edges: [...ghostEdgesRef.current],
      customVariables: currentGraph.customVariables ?? [],
    });
  };

  const cancelGeneration = () => {
    const wasGenerating = isGenerating;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setGenerationStatusPhase('starting');
    onGenerationStateChange?.(false);
    setCompleted(null);
    setLiveActivity([]);
    onPreviewPresentationChange?.(false);
    setIsCanvasDocked(false);
    if (wasGenerating && activeTimelineIdRef.current) {
      const timelineId = activeTimelineIdRef.current;
      setProgressTimelines((current) => current.map((timeline) => timeline.id === timelineId
        ? {
            ...timeline,
            status: 'stopped',
            expanded: false,
            entries: timeline.entries.map((entry) => entry.state === 'active' || entry.state === 'streaming'
              ? { ...entry, state: entry.kind === 'action' ? 'failed' : 'complete' }
              : entry),
          }
        : timeline));
    }
    activeTimelineIdRef.current = null;
    activeGenerationIdRef.current = null;
    generationTerminalRef.current = true;
    ghostNodesRef.current = [];
    ghostEdgesRef.current = [];
    onGhostChange(null);
  };

  const requestClose = () => {
    if (isGenerating || attachments.length > 0 || completed) {
      setConfirmCloseOpen(true);
      return;
    }
    enhancementAbortRef.current?.abort();
    enhancementAbortRef.current = null;
    setIsEnhancingPrompt(false);
    setOriginalInstruction(null);
    onClose();
  };

  const closeAndDiscard = () => {
    enhancementAbortRef.current?.abort();
    enhancementAbortRef.current = null;
    setIsEnhancingPrompt(false);
    setOriginalInstruction(null);
    cancelGeneration();
    setAttachments([]);
    setAttachmentError('');
    setConfirmCloseOpen(false);
    onClose();
  };

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    setAttachmentError('');
    const next = [...attachments];
    for (const file of Array.from(files)) {
      if (next.length >= CREATOR_ATTACHMENT_MAX_COUNT) {
        setAttachmentError(t('flow_builder.creator.attachment.too_many', 'Attach no more than five reference files.'));
        break;
      }
      if (!CREATOR_ATTACHMENT_EXTENSIONS.has(creatorFileExtension(file.name))) {
        setAttachmentError(t('flow_builder.creator.attachment.unsupported', 'This file type is not supported.'));
        continue;
      }
      if (file.size > CREATOR_ATTACHMENT_MAX_BYTES) {
        setAttachmentError(t('flow_builder.creator.attachment.too_large', 'Each reference file must be 10MB or smaller.'));
        continue;
      }
      if (!next.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) next.push(file);
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const insertPromptVariable = (variable: FlowVariable) => {
    const insertion = `{{${variable.value}}}`;
    const cursor = Math.max(0, Math.min(variableCursor, instruction.length));
    setOriginalInstruction(null);
    setInstruction(`${instruction.slice(0, cursor)}${insertion}${instruction.slice(cursor)}`);
    const nextCursor = cursor + insertion.length;
    setVariableCursor(nextCursor);
    requestAnimationFrame(() => {
      const target = promptExpanded ? expandedInstructionRef.current : instructionRef.current;
      target?.focus();
      target?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const updateInstructionFromUser = (value: string, cursor: number) => {
    setOriginalInstruction(null);
    setInstruction(value);
    setVariableCursor(cursor);
  };

  const enhancePrompt = async () => {
    const original = instruction;
    const prompt = original.trim();
    if (!prompt || isGenerating || isEnhancingPrompt || credentialUnavailable) return;
    if (credentialSource === 'manual' && !manualApiKey.trim()) {
      toast({
        variant: 'destructive',
        title: t('flow_builder.creator.enhance.error_title', 'Unable to enhance prompt'),
        description: t('flow_builder.creator.error.manual_key_required', 'Enter a manual API key or choose an existing credential source.'),
      });
      return;
    }
    const controller = new AbortController();
    enhancementAbortRef.current?.abort();
    enhancementAbortRef.current = controller;
    setOriginalInstruction(null);
    setIsEnhancingPrompt(true);
    try {
      const response = await fetch('/api/ai-flow-creator/enhance-prompt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...(flowId ? { flowId } : {}),
          instruction: prompt,
          currentGraph,
          provider,
          credentialSource,
          model,
          ...(credentialSource === 'manual' ? { manualApiKey } : {}),
          ...(provider === 'azure' && credentialSource === 'manual' ? { azureEndpoint, azureApiVersion } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.enhancedInstruction !== 'string' || !payload.enhancedInstruction.trim()) {
        throw new Error(payload.message || t('flow_builder.creator.enhance.error_description', 'The prompt could not be enhanced.'));
      }
      const enhanced = payload.enhancedInstruction.trim();
      setOriginalInstruction(original);
      setInstruction(enhanced);
      setVariableCursor(enhanced.length);
      if (typeof payload.model === 'string' && payload.model.trim()) setModel(payload.model.trim());
      requestAnimationFrame(() => {
        const target = promptExpanded ? expandedInstructionRef.current : instructionRef.current;
        target?.focus();
        target?.setSelectionRange(enhanced.length, enhanced.length);
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        toast({
          variant: 'destructive',
          title: t('flow_builder.creator.enhance.error_title', 'Unable to enhance prompt'),
          description: error instanceof Error ? error.message : t('flow_builder.creator.enhance.error_description', 'The prompt could not be enhanced.'),
        });
      }
    } finally {
      if (enhancementAbortRef.current === controller) enhancementAbortRef.current = null;
      setIsEnhancingPrompt(false);
    }
  };

  const restoreOriginalInstruction = () => {
    if (originalInstruction === null) return;
    const original = originalInstruction;
    setOriginalInstruction(null);
    setInstruction(original);
    setVariableCursor(original.length);
    requestAnimationFrame(() => {
      const target = promptExpanded ? expandedInstructionRef.current : instructionRef.current;
      target?.focus();
      target?.setSelectionRange(original.length, original.length);
    });
  };

  useEffect(() => () => {
    abortRef.current?.abort();
    enhancementAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (open) return;
    enhancementAbortRef.current?.abort();
    enhancementAbortRef.current = null;
    setIsEnhancingPrompt(false);
    setOriginalInstruction(null);
  }, [open]);

  const updateActiveTimeline = (updater: (timeline: CreatorProgressTimeline) => CreatorProgressTimeline) => {
    const timelineId = activeTimelineIdRef.current;
    if (!timelineId) return;
    setProgressTimelines((current) => current.map((timeline) => timeline.id === timelineId ? updater(timeline) : timeline));
  };

  const appendModelAdjustmentProgress = (event: Extract<AiFlowGenerationEvent, { type: 'model_adjusted' }>) => {
    const generationId = activeGenerationIdRef.current;
    if (!generationId || generationId !== event.generationId) return;
    const base = `${generationId}-model-adjusted`;
    const params = { model: event.model };
    const entries: CreatorProgressEntry[] = [
      {
        generationId,
        entryId: `${base}-narrative`,
        phase: 'model_adjusted',
        kind: 'narrative',
        state: 'complete',
        messageKey: 'flow_builder.creator.progress.model_adjusted.narrative',
        params,
        chunkIndex: 1,
        chunkCount: 1,
      },
      {
        generationId,
        entryId: `${base}-action`,
        phase: 'model_adjusted',
        kind: 'action',
        state: 'complete',
        messageKey: 'flow_builder.creator.progress.model_adjusted.action',
        params,
      },
    ];
    updateActiveTimeline((timeline) => ({
      ...timeline,
      entries: [
        ...timeline.entries.map((entry) => entry.phase === 'starting' && entry.state === 'active' ? { ...entry, state: 'complete' as const } : entry),
        ...entries,
      ],
    }));
  };

  const handleProgressEvent = (event: AiFlowCreatorProgressEvent) => {
    if (activeGenerationIdRef.current !== event.generationId) return;
    updateActiveTimeline((timeline) => ({
      ...timeline,
      generationId: event.generationId,
      entries: upsertCreatorProgressEntry(
        timeline.entries.map((entry) => entry.phase === 'starting' && entry.state === 'active'
          ? { ...entry, state: 'complete' }
          : entry),
        event,
      ),
    }));
  };

  const handleEvent = (event: AiFlowGenerationEvent, prompt: string) => {
    if (event.type === 'started') {
      setGenerationStatusPhase('starting');
      activeGenerationIdRef.current = event.generationId;
      updateActiveTimeline((timeline) => ({
        ...timeline,
        generationId: event.generationId,
        entries: timeline.entries.map((entry) => ({ ...entry, generationId: event.generationId })),
      }));
    } else if (event.type === 'assistant_delta') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setMessages((current) => {
        const index = current.findIndex((message) => message.id === event.messageId);
        if (index < 0) return [...current, { id: event.messageId, role: 'assistant', content: event.delta }];
        const next = [...current];
        next[index] = { ...next[index], content: `${next[index].content}${event.delta}` };
        return next;
      });
    } else if (event.type === 'operation_started') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setGenerationStatusPhase((current) => current === 'repairing' ? current : 'building');
      if (creatorMode === 'interactive') setIsCanvasDocked(true);
      setLiveActivity((current) => [...current, { id: event.operationId, kind: 'operation', text: event.label, state: 'active', operationType: event.operationType, nodeId: event.nodeId, edgeId: event.edgeId }]);
      if (creatorMode === 'interactive' && event.nodeId) {
        ghostNodesRef.current = ghostNodesRef.current.map((node) => node.id === event.nodeId
          ? { ...node, data: { ...node.data, __creatorChange: event.operationType === 'remove_node' ? 'removing' : 'updating' } }
          : node);
        publishGhost();
      }
    } else if (event.type === 'operation_applied') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setLiveActivity((current) => current.map((entry) => entry.id === event.operation.operationId ? { ...entry, state: 'complete' } : entry));
      if (creatorMode === 'interactive') {
        const changedNodeId = 'node' in event.operation ? event.operation.node.id : 'nodeId' in event.operation ? event.operation.nodeId : undefined;
        const changeKind = event.operation.type === 'add_node' ? 'added' : 'updated';
        ghostNodesRef.current = event.draft.nodes.map((node) => node.id === changedNodeId ? { ...node, data: { ...node.data, __creatorChange: changeKind } } : node);
        ghostEdgesRef.current = event.draft.edges;
        publishGhost();
        if (isMobile) setMobileView('canvas');
      }
    } else if (event.type === 'operation_rejected') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setLiveActivity((current) => current.map((entry) => entry.id === event.operationId ? { ...entry, state: 'failed', text: `${event.label}: ${event.message}` } : entry));
    } else if (event.type === 'canvas_focus') {
      if (activeGenerationIdRef.current !== event.generationId || creatorMode !== 'interactive') return;
      onFocusNode?.(event.nodeId, event.field);
    } else if (event.type === 'model_adjusted') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setGenerationStatusPhase('model_adjusted');
      setModel(event.model);
      appendModelAdjustmentProgress(event);
    } else if (event.type === 'progress') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setGenerationStatusPhase(event.phase);
      handleProgressEvent(event);
    } else if (event.type === 'phase') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      setGenerationStatusPhase(event.phase);
      const phaseId = `${event.generationId}-phase-${event.phase}-${event.attempt ?? 0}`;
      setLiveActivity((current) => [
        ...current.map((entry) => entry.kind === 'validation' && entry.state === 'active' ? { ...entry, state: 'complete' as const } : entry),
        ...(current.some((entry) => entry.id === phaseId) ? [] : [{ id: phaseId, kind: 'validation' as const, text: event.message, state: 'active' as const }]),
      ]);
    } else if (event.type === 'node') {
      if (activeGenerationIdRef.current !== event.generationId || creatorMode !== 'interactive') return;
      ghostNodesRef.current = [...ghostNodesRef.current.filter((node) => node.id !== event.node.id), event.node];
      publishGhost();
    } else if (event.type === 'edge') {
      if (activeGenerationIdRef.current !== event.generationId || creatorMode !== 'interactive') return;
      ghostEdgesRef.current = [...ghostEdgesRef.current.filter((edge) => edge.id !== event.edge.id), event.edge];
      publishGhost();
    } else if (event.type === 'complete') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      const result: CompletedCreatorGeneration = {
        generationId: event.generationId,
        generationProof: event.generationProof,
        beforeGraphHash: event.beforeGraphHash,
        draft: event.draft,
        summary: event.summary,
        assumptions: event.assumptions,
        validation: event.validation,
        graphHash: event.graphHash,
        provider: event.provider,
        credentialSource: event.credentialSource,
        model: event.model,
        prompt,
      };
      ghostNodesRef.current = event.draft.nodes;
      ghostEdgesRef.current = event.draft.edges;
      onGhostChange(event.draft);
      setCompleted(result);
      setGenerationStatusPhase('finalizing');
      setIsCanvasDocked(false);
      setMobileView('chat');
      if (event.activity?.length) setLiveActivity((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        for (const entry of event.activity ?? []) byId.set(entry.id, entry);
        return [...byId.values()].map((entry) => entry.state === 'active' ? { ...entry, state: 'complete' as const } : entry);
      });
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: 'assistant', content: event.summary }]);
      generationTerminalRef.current = true;
      updateActiveTimeline((timeline) => ({ ...timeline, status: 'complete', expanded: false }));
      activeTimelineIdRef.current = null;
      activeGenerationIdRef.current = null;
    } else if (event.type === 'error') {
      if (activeGenerationIdRef.current !== event.generationId) return;
      const content = event.message === 'Workflow generation failed'
        ? t('flow_builder.creator.error.generation_failed', 'Workflow generation failed.')
        : event.message;
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', content, isError: true }]);
      setGenerationStatusPhase('starting');
      generationTerminalRef.current = true;
      updateActiveTimeline((timeline) => ({
        ...timeline,
        status: 'failed',
        expanded: true,
        entries: timeline.entries.map((entry) => entry.state === 'active' || entry.state === 'streaming'
          ? { ...entry, state: entry.kind === 'action' ? 'failed' : 'complete' }
          : entry),
      }));
      activeTimelineIdRef.current = null;
      activeGenerationIdRef.current = null;
      onGhostChange(null);
      onPreviewPresentationChange?.(false);
      setIsCanvasDocked(false);
      setMobileView('chat');
    }
  };

  const generate = async () => {
    const prompt = instruction.trim();
    if (!prompt || isGenerating || isEnhancingPrompt) return;
    if (credentialSource === 'manual' && !manualApiKey.trim()) {
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', content: t('flow_builder.creator.error.manual_key_required', 'Enter a manual API key or choose an existing credential source.'), isError: true }]);
      return;
    }
    const submittedAttachments = [...attachments];
    let generationModel = model;
    let previousModel: string | undefined;
    let generationModelSupportsImage = false;
    if (submittedAttachments.some(isCreatorImage)) {
      const catalogSupportsImage = provider === 'openrouter'
        ? openRouterQuery.data?.find((entry) => entry.id === model)?.supportsImage
        : provider === 'azure'
          ? azureQuery.data?.find((entry) => entry.id === model)?.supportsImage
          : undefined;
      generationModelSupportsImage = catalogSupportsImage ?? aiCreatorModelSupportsImage(provider, model);
      if (!generationModelSupportsImage) {
        previousModel = model;
        if (provider === 'azure') {
          const compatible = uniqueAzureDeploymentCatalog(azureQuery.data ?? []).find((entry) => entry.kind === 'chat' && entry.supportsImage);
          if (!compatible) {
            setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', content: t('flow_builder.creator.error.image_model_unavailable', 'No image-capable model is available for this provider.'), isError: true }]);
            return;
          }
          generationModel = compatible.id;
        } else {
          generationModel = aiCreatorVisionFallback(provider);
        }
        generationModelSupportsImage = true;
        setModel(generationModel);
      }
    }
    const requestKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessageId = `user-${requestKey}`;
    setMessages((current) => [...current, {
      id: userMessageId,
      role: 'user',
      content: prompt,
      attachments: submittedAttachments.map((file) => ({ name: file.name, size: file.size, kind: isCreatorImage(file) ? 'image' : 'document' })),
    }]);
    setOriginalInstruction(null);
    setInstruction('');
    setAttachments([]);
    setAttachmentError('');
    setCompleted(null);
    activeTimelineIdRef.current = null;
    activeGenerationIdRef.current = null;
    generationTerminalRef.current = false;
    shouldAutoScrollRef.current = true;
    ghostNodesRef.current = creatorMode === 'interactive' ? structuredClone(currentGraph.nodes) : [];
    ghostEdgesRef.current = creatorMode === 'interactive' ? structuredClone(currentGraph.edges) : [];
    onGhostChange(creatorMode === 'interactive' ? structuredClone(currentGraph) : null);
    onPreviewPresentationChange?.(creatorMode === 'interactive');
    setLiveActivity([]);
    setGenerationStatusPhase('starting');
    setMobileView('chat');
    setIsCanvasDocked(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    onGenerationStateChange?.(true);
    try {
      const requestPayload = {
        ...(flowId ? { flowId } : {}),
        instruction: prompt,
        currentGraph,
        provider,
        credentialSource,
        mode: creatorMode,
        model: generationModel,
        ...(submittedAttachments.some(isCreatorImage) ? { modelSupportsImage: generationModelSupportsImage } : {}),
        ...(previousModel ? { previousModel } : {}),
        ...(credentialSource === 'manual' ? { manualApiKey } : {}),
        ...(provider === 'azure' && credentialSource === 'manual' ? { azureEndpoint, azureApiVersion } : {}),
        conversationHistory: messages.slice(-12).map(({ role, content }) => ({ role, content })),
      };
      const requestBody = submittedAttachments.length ? new FormData() : JSON.stringify(requestPayload);
      if (requestBody instanceof FormData) {
        requestBody.append('request', JSON.stringify(requestPayload));
        submittedAttachments.forEach((file) => requestBody.append('attachments', file, file.name));
      }
      const response = await fetch('/api/ai-flow-creator/generations', {
        method: 'POST',
        credentials: 'include',
        headers: submittedAttachments.length ? { Accept: 'text/event-stream' } : { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: controller.signal,
        body: requestBody,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('flow_builder.creator.error.generation_failed', 'Workflow generation failed.'));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const parsed = readSseEvents(buffer);
        buffer = parsed.remainder;
        parsed.events.forEach((event) => handleEvent(event, prompt));
        if (done) break;
      }
      if (buffer.trim()) readSseEvents(`${buffer}\n\n`).events.forEach((event) => handleEvent(event, prompt));
      if (!generationTerminalRef.current && !controller.signal.aborted) {
        throw new Error(t('flow_builder.creator.error.stream_ended', 'The generation stream ended before the workflow was completed.'));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', content: error instanceof Error ? error.message : t('flow_builder.creator.error.generation_failed', 'Workflow generation failed.'), isError: true }]);
        generationTerminalRef.current = true;
        updateActiveTimeline((timeline) => ({
          ...timeline,
          status: 'failed',
          expanded: true,
          entries: timeline.entries.map((entry) => entry.state === 'active' || entry.state === 'streaming'
            ? { ...entry, state: entry.kind === 'action' ? 'failed' : 'complete' }
            : entry),
        }));
        activeTimelineIdRef.current = null;
        activeGenerationIdRef.current = null;
        onGhostChange(null);
        onPreviewPresentationChange?.(false);
        setIsCanvasDocked(false);
        setMobileView('chat');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsGenerating(false);
      onGenerationStateChange?.(false);
    }
  };

  const clearConversation = async () => {
    if (flowId) {
      await apiRequest('DELETE', `/api/flows/${flowId}/ai-creator/messages`);
      queryClient.invalidateQueries({ queryKey: ['/api/flows', flowId, 'ai-creator', 'history'] });
    }
    setMessages([]);
    setProgressTimelines([]);
    setLiveActivity([]);
  };

  const acceptCompleted = () => {
    if (!completed || !completed.validation.valid) return;
    onAccept(completed, messages);
    setCompleted(null);
    ghostNodesRef.current = [];
    ghostEdgesRef.current = [];
    onGhostChange(null);
    onPreviewPresentationChange?.(false);
    setConfirmReplaceOpen(false);
  };

  const applyPromptTemplate = (template: string) => {
    setOriginalInstruction(null);
    setInstruction(template);
    setVariableCursor(template.length);
    requestAnimationFrame(() => {
      instructionRef.current?.focus();
      instructionRef.current?.setSelectionRange(template.length, template.length);
    });
  };

  if (!open) return null;

  const credentialUnavailable = credentialSource !== 'manual' && availabilityQuery.data === false;
  const creatorBusy = isGenerating || isEnhancingPrompt;
  const generationStatus = CREATOR_STATUS_LABELS[generationStatusPhase];
  const generationStatusText = t(generationStatus.key, generationStatus.fallback);
  const providerLabel: Record<AiFlowCreatorProvider, string> = {
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    azure: 'Azure OpenAI',
  };
  const credentialSourceLabel: Record<AiFlowCreatorCredentialSource, string> = {
    auto: t('flow_builder.creator.credential_source.auto', 'Auto'),
    company: t('flow_builder.creator.credential_source.company', 'Company'),
    system: t('flow_builder.creator.credential_source.system', 'System'),
    manual: t('flow_builder.creator.credential_source.manual', 'Manual key'),
  };
  const setupIssueMessage = (issue: FlowValidationIssue): string => {
    switch (issue.code) {
      case 'missing_setup_field':
        return t('flow_builder.creator.setup_issue.missing_field', 'Complete the required setup field: {{field}}.', { field: issue.field ?? 'configuration' });
      case 'missing_oauth_connection':
        return t('flow_builder.creator.setup_issue.oauth', 'Connect the required OAuth account before activation.');
      case 'missing_credential':
        return t('flow_builder.creator.setup_issue.credential', 'Configure the required credential before activation.');
      case 'missing_database_connection':
        return t('flow_builder.creator.setup_issue.database', 'Configure the database connection before activation.');
      case 'missing_mcp_server_url':
        return t('flow_builder.creator.setup_issue.mcp_url', 'Configure the MCP server URL before activation.');
      case 'missing_target_flow':
        return t('flow_builder.creator.setup_issue.target_flow', 'Select a saved target flow before activation.');
      case 'task_delete_confirmation':
      case 'contact_delete_confirmation':
        return t('flow_builder.creator.setup_issue.delete_confirmation', 'Explicitly confirm the generated deletion action before activation.');
      case 'stripe_amount_required':
      case 'stripe_subscription_fields':
        return t('flow_builder.creator.setup_issue.stripe', 'Complete the required Stripe payment fields before activation.');
      case 'external_setup_unavailable':
        return t('flow_builder.creator.setup_issue.external', 'Complete the required external integration setup before activation.');
      default:
        return issue.message;
    }
  };
  const hasConversation = messages.length > 0 || progressTimelines.length > 0 || liveActivity.length > 0 || Boolean(completed);
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || t('flow_builder.creator.guest_name', 'there');
  const promptPlaceholder = isEditMode
    ? t('flow_builder.creator.prompt_replace_placeholder', 'Describe what should be fixed or changed…')
    : t('flow_builder.creator.prompt_placeholder', 'Describe the workflow you want…');
  const canvasDockedActive = creatorMode === 'interactive' && isGenerating && (isCanvasDocked || (isMobile && mobileView === 'canvas'));
  const creatorWindowFloating = !isMobile && !isFullscreen && !canvasDockedActive;

  return (
    <>
      <Dialog open={open} modal={!(canvasDockedActive || creatorWindowFloating)} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}>
        <DialogContent data-tour="components-flow-builder-aiworkflowcreatorpanel.dialogcontent.flow_builder.creator.panel_title"
          ref={creatorPanelRef}
          showCloseButton={false}
          contentNoScroll
          onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}
          aria-describedby="workflow-creator-description"
          hideOverlay={canvasDockedActive || creatorWindowFloating}
          style={creatorWindowFloating ? {
            left: windowPosition.x,
            top: windowPosition.y,
            right: 'auto',
            bottom: 'auto',
            width: windowSize.width,
            height: windowSize.height,
          } : undefined}
          className={cn(
            'overflow-hidden border-border/70 bg-background/95 p-0 shadow-[0_30px_100px_rgba(2,8,23,.5)] backdrop-blur-xl [&>div:first-child]:overflow-visible [&>div:first-child]:p-0 [&>div:first-child]:pb-0',
            canvasDockedActive
              ? isMobile
                ? 'bottom-3 left-3 right-3 top-auto h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 rounded-xl border-primary/30'
                : 'bottom-auto left-auto right-3 top-3 h-auto max-h-none w-[360px] max-w-[calc(100vw-1.5rem)] translate-x-0 translate-y-0 rounded-xl border-primary/30'
              : isFullscreen
              ? 'left-0 top-0 h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none'
              : creatorWindowFloating
                ? 'max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)] translate-x-0 translate-y-0 rounded-[18px]'
                : 'bottom-3 left-auto right-3 top-auto h-[780px] max-h-[calc(100vh-1.5rem)] w-full max-w-[calc(100vw-1.5rem)] translate-x-0 translate-y-0 rounded-[18px] max-sm:inset-0 max-sm:h-screen max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none',
          )}
        >
          {!isFullscreen && !canvasDockedActive && (
            <CreatorEdgeToggle
              expanded
              position={togglePosition}
              onPositionChange={onTogglePositionChange}
              onToggle={requestClose}
              label={t('flow_builder.creator.collapse', 'Collapse Workflow Creator')}
              className="absolute -left-10 z-[60] hidden sm:flex"
            />
          )}
          <DialogTitle className="sr-only">{t('flow_builder.creator.panel_title', 'Workflow Creator')}</DialogTitle>
          <DialogDescription id="workflow-creator-description" className="sr-only">{t('flow_builder.creator.subtitle', 'AI builds native workflows using smart nodes.')}</DialogDescription>
          {canvasDockedActive ? <div className="flex items-center gap-3 px-3 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{t('flow_builder.creator.generation_in_progress', 'Workflow generation is in progress. Please wait.')}</span><span className="block truncate text-[10px] text-muted-foreground" aria-live="polite">{generationStatusText}</span></span>
            <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.mobile.chat" size="sm" variant="outline" className="h-8" onClick={() => { setIsCanvasDocked(false); setMobileView('chat'); }}><InboxConversationIcon className="mr-1.5 h-3.5 w-3.5" />{t('flow_builder.creator.mobile.chat', 'Chat')}</Button>
            <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.common.stop" size="icon" variant="destructive" className="h-8 w-8" onClick={cancelGeneration} title={t('common.stop', 'Stop')} aria-label={t('common.stop', 'Stop')}><Square className="h-3.5 w-3.5" /></Button>
          </div> : <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_78%_18%,rgba(109,40,217,.08),transparent_32%),radial-gradient(circle_at_12%_12%,rgba(20,184,166,.07),transparent_25%)]">
            <header className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4">
              <div className={cn('flex min-w-0 flex-1 touch-none select-none items-center gap-2.5', creatorWindowFloating && 'cursor-move')} onPointerDown={startCreatorDrag}>
                {creatorWindowFloating && <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-teal-400/10 bg-teal-500/10 text-teal-400 shadow-[0_0_20px_rgba(20,184,166,.08)]"><Sparkles className="h-4 w-4" /></span>
                <div className="min-w-0"><h2 data-tour="components-flow-builder-aiworkflowcreatorpanel.h2.flow_builder.creator.panel_title" className="truncate text-lg font-semibold tracking-tight">{t('flow_builder.creator.panel_title', 'Workflow Creator')}</h2><p className="truncate text-[11px] text-muted-foreground sm:text-xs">{t('flow_builder.creator.subtitle', 'AI builds native workflows using smart nodes.')}</p></div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isMobile && creatorMode === 'interactive' && isGenerating && <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.mobile.canvas" variant="outline" size="sm" className="h-8" onClick={() => setMobileView('canvas')}><Workflow className="mr-1.5 h-3.5 w-3.5" />{t('flow_builder.creator.mobile.canvas', 'Canvas')}</Button>}
                <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.clear_conversation" variant="outline" size="icon" className="h-8 w-8 rounded-md bg-card/50" onClick={() => void clearConversation()} disabled={!messages.length || isGenerating} title={t('flow_builder.creator.clear_conversation', 'Clear conversation')} aria-label={t('flow_builder.creator.clear_conversation', 'Clear conversation')}><Trash2 className="h-3.5 w-3.5" /></Button>
                <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.exit_fullscreen" variant="outline" size="icon" className="hidden h-8 w-8 rounded-md bg-card/50 sm:inline-flex" onClick={() => setIsFullscreen((current) => !current)} title={isFullscreen ? t('flow_builder.creator.exit_fullscreen', 'Exit full screen') : t('flow_builder.creator.fullscreen', 'Full screen')} aria-label={isFullscreen ? t('flow_builder.creator.exit_fullscreen', 'Exit full screen') : t('flow_builder.creator.fullscreen', 'Full screen')}>{isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</Button>
                <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.common.close" variant="outline" size="icon" className="h-8 w-8 rounded-md bg-card/50" onClick={requestClose} title={t('common.close', 'Close')} aria-label={t('common.close', 'Close')}><X className="h-3.5 w-3.5" /></Button>
              </div>
            </header>

            <div className="px-3.5 sm:px-4">
              <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} className="overflow-hidden rounded-xl border border-border/70 bg-card/45 shadow-sm">
                <CollapsibleTrigger asChild>
                  <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.select_model" variant="ghost" className="h-11 w-full justify-between rounded-none px-3 text-left">
                    <span className="flex min-w-0 items-center gap-2.5"><CreatorProviderMark provider={provider} /><span className="min-w-0 truncate text-xs font-semibold sm:text-sm">{providerLabel[provider]} · {model || t('flow_builder.creator.select_model', 'Select model')}</span><Badge className="hidden h-5 border-teal-400/20 bg-teal-500/10 px-2 text-[10px] text-teal-600 hover:bg-teal-500/10 dark:text-teal-300 sm:inline-flex" variant="outline">{credentialSourceLabel[credentialSource]}</Badge></span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', settingsOpen && 'rotate-180')} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-2 border-t border-border/60 bg-muted/20 p-3 data-[state=closed]:hidden">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select disabled={creatorBusy} value={provider} onValueChange={(value) => handleProviderChange(value as AiFlowCreatorProvider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="openrouter">OpenRouter</SelectItem><SelectItem value="azure">Azure OpenAI</SelectItem></SelectContent></Select>
                    <Select disabled={creatorBusy} value={credentialSource} onValueChange={(value) => setCredentialSource(value as AiFlowCreatorCredentialSource)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">{t('flow_builder.creator.credential_source.auto', 'Auto')}</SelectItem><SelectItem value="company">{t('flow_builder.creator.credential_source.company', 'Company')}</SelectItem><SelectItem value="system">{t('flow_builder.creator.credential_source.system', 'System')}</SelectItem><SelectItem value="manual">{t('flow_builder.creator.credential_source.manual', 'Manual key')}</SelectItem></SelectContent></Select>
                  </div>
                  {models.length ? <Select disabled={creatorBusy} value={model} onValueChange={setModel}><SelectTrigger data-tour="components-flow-builder-aiworkflowcreatorpanel.selecttrigger.flow_builder.creator.select_model"><SelectValue placeholder={t('flow_builder.creator.select_model', 'Select model')} /></SelectTrigger><SelectContent>{models.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}</SelectContent></Select> : <Input data-tour="components-flow-builder-aiworkflowcreatorpanel.input.flow_builder.creator.azure_deployment_name" disabled={creatorBusy} value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider === 'azure' ? t('flow_builder.creator.azure_deployment_name', 'Azure deployment name') : t('flow_builder.creator.model_id', 'Model ID')} />}
                  {credentialSource === 'manual' && <><Input data-tour="components-flow-builder-aiworkflowcreatorpanel.input.flow_builder.creator.api_key_never_saved" disabled={creatorBusy} type="password" value={manualApiKey} onChange={(event) => setManualApiKey(event.target.value)} placeholder={t('flow_builder.creator.api_key_never_saved', 'API key (never saved)')} autoComplete="off" />{provider === 'azure' && <div className="grid gap-2"><Input data-tour="components-flow-builder-aiworkflowcreatorpanel.input.azureEndpoint" disabled={creatorBusy} value={azureEndpoint} onChange={(event) => setAzureEndpoint(event.target.value)} placeholder="https://resource.openai.azure.com" /><Input data-tour="components-flow-builder-aiworkflowcreatorpanel.input.flow_builder.creator.azure_api_version" disabled={creatorBusy} value={azureApiVersion} onChange={(event) => setAzureApiVersion(event.target.value)} placeholder={t('flow_builder.creator.azure_api_version', 'Azure API version')} /></div>}</>}
                  {credentialUnavailable && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"><p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t('flow_builder.creator.no_credential', 'No usable credential was found for this selection.')}</p><a className="mt-1 inline-block underline underline-offset-2" href="/settings?tab=ai-credentials">{t('flow_builder.creator.open_credential_settings', 'Open AI credential settings')}</a></div>}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <ScrollArea className="min-h-0 flex-1" onScrollCapture={handleConversationScroll}>
              <div className="space-y-3 px-3.5 py-3 sm:px-4">
                {!hasConversation && <>
                  <CreatorHero
                    greeting={t('flow_builder.creator.hero.greeting', 'Hi {{name}}! 👋', { name: firstName })}
                    introduction={t('flow_builder.creator.hero.introduction', "I'm your workflow assistant.")}
                    description={t('flow_builder.creator.hero.description', "Describe what you want to achieve, and I’ll design the workflow using the right native nodes.")}
                    featureLabels={[t('flow_builder.creator.hero.ai_title', 'AI-Powered'), t('flow_builder.creator.hero.native_title', 'Native Nodes'), t('flow_builder.creator.hero.secure_title', 'Secure & Reliable')]}
                    featureDescriptions={[t('flow_builder.creator.hero.ai_description', 'Smart suggestions and automation'), t('flow_builder.creator.hero.native_description', 'Optimized for built-in nodes'), t('flow_builder.creator.hero.secure_description', 'Your data stays private and safe')]}
                  />
                  <CreatorTemplateCards
                    heading={t('flow_builder.creator.template_heading', 'Start with a template')}
                    description={t('flow_builder.creator.template_description', 'Pick a template to get started quickly')}
                    personalTitle={t('flow_builder.creator.template.personal_information.title', 'Collect personal information')}
                    personalDescription={t('flow_builder.creator.template.personal_information.description', "Collect name, father’s name, address, occupation, and send a confirmation summary.")}
                    leadTitle={t('flow_builder.creator.template.lead_capture.title', 'Capture and qualify leads')}
                    leadDescription={t('flow_builder.creator.template.lead_capture.description', 'Collect lead details through WhatsApp and add a deal to the default pipeline.')}
                    onPersonal={() => applyPromptTemplate(t('flow_builder.creator.template.personal_information.prompt', PERSONAL_INFORMATION_PROMPT_TEMPLATE))}
                    onLead={() => applyPromptTemplate(t('flow_builder.creator.template.lead_capture.prompt', LEAD_CAPTURE_PROMPT_TEMPLATE))}
                    disabled={creatorBusy}
                  />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{t('common.or', 'or')}</span><span className="h-px flex-1 bg-border" /></div>
                </>}

                {messages.map((message) => <Fragment key={message.id}>
                  <div className={cn('flex gap-3', message.role === 'user' && 'justify-end')}>
                    {message.role === 'assistant' && <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/20 bg-primary/10"><img src={APP_ICONS.inboxBot} alt="" aria-hidden="true" className="h-7 w-7 object-contain" /></span>}
                    <div className={cn('max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm', message.role === 'user' ? 'border border-primary/30 bg-primary text-primary-foreground' : message.isError ? 'border border-destructive/30 bg-destructive/10 text-destructive' : 'border border-border bg-muted text-foreground')}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.activity?.length ? <details className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">{t('flow_builder.creator.activity_history', '{{count}} creator actions', { count: message.activity.length })}</summary><div className="mt-2 space-y-1">{message.activity.map((entry) => <div key={entry.id} className="flex items-center gap-2"><span className={cn('h-1.5 w-1.5 rounded-full', entry.state === 'failed' ? 'bg-destructive' : 'bg-emerald-500')} /><span>{entry.text}</span></div>)}</div></details> : null}
                      {message.attachments?.length ? <div className="mt-3 flex flex-wrap gap-2">{message.attachments.map((attachment) => <span key={`${attachment.name}-${attachment.size}`} className={cn('flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs', message.role === 'user' ? 'bg-primary-foreground/10' : 'bg-background/70')}><span>{attachment.kind === 'image' ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}</span><span className="truncate">{attachment.name}</span></span>)}</div> : null}
                    </div>
                    {message.role === 'user' && <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-primary">{user?.avatarUrl ? <img src={user.avatarUrl} alt={user.fullName || t('flow_builder.creator.user_avatar', 'User profile')} className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}</span>}
                  </div>
                  {progressTimelines.filter((timeline) => timeline.afterMessageId === message.id).map((timeline) => (
                    <AIWorkflowCreatorProgressTimeline
                      key={timeline.id}
                      timeline={timeline}
                      onExpandedChange={(expanded) => setProgressTimelines((current) => current.map((entry) => entry.id === timeline.id ? { ...entry, expanded } : entry))}
                    />
                  ))}
                </Fragment>)}
                {liveActivity.length > 0 && <div className="space-y-1.5 rounded-2xl border border-border/70 bg-card/45 p-3" aria-live="polite">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('flow_builder.creator.live_activity', 'Live canvas activity')}</p>
                  {liveActivity.map((entry) => <div key={entry.id} className="flex items-center gap-2 text-sm">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', entry.state === 'active' ? 'animate-pulse bg-primary' : entry.state === 'failed' ? 'bg-destructive' : 'bg-emerald-500')} />
                    <span className={cn(entry.state === 'failed' && 'text-destructive')}>{entry.text}</span>
                  </div>)}
                </div>}
                {completed && <div className="space-y-3 rounded-[16px] border border-teal-400/25 bg-gradient-to-br from-teal-500/[0.07] to-violet-500/[0.06] p-4">
                  <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5 text-teal-500" />{t('flow_builder.creator.ready_to_apply', 'Ready to apply')}</span><Badge variant="secondary">{t('flow_builder.creator.node_count', '{{count}} nodes', { count: completed.draft.nodes.length })}</Badge></div>
                  {completed.assumptions.length > 0 && <div><p className="text-sm font-medium">{t('flow_builder.creator.assumptions', 'Assumptions')}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{completed.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>}
                  {completed.validation.setupIssues.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />{t('flow_builder.creator.setup_needed', 'Setup needed before activation')}</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{completed.validation.setupIssues.slice(0, 6).map((current, index) => <li key={`${current.code}-${current.nodeId}-${index}`}>• {setupIssueMessage(current)}</li>)}</ul></div>}
                  <div className="flex flex-col gap-2 sm:flex-row"><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.discard" variant="outline" className="flex-1" onClick={cancelGeneration}>{t('flow_builder.creator.discard', 'Discard')}</Button><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.apply_to_editor" className="flex-1 bg-gradient-to-r from-teal-500 via-blue-500 to-violet-600 text-white hover:opacity-90" disabled={!completed.validation.valid} onClick={() => isEditMode ? setConfirmReplaceOpen(true) : acceptCompleted()}>{t('flow_builder.creator.apply_to_editor', 'Apply to editor')}</Button></div>
                  <p className="text-xs text-muted-foreground">{t('flow_builder.creator.apply_local_note', 'Applying changes the editor only. Use Save when you are ready to persist.')}</p>
                </div>}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <footer className="border-t border-border/70 bg-background/80 px-3.5 py-2.5 backdrop-blur-xl sm:px-4">
              <div className="rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 p-[1px] shadow-[0_8px_24px_rgba(99,102,241,.08)]">
                <div className="rounded-[11px] bg-background/95 p-2">
                  {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map((file) => <span key={`${file.name}-${file.size}-${file.lastModified}`} className="flex max-w-full items-center gap-2 rounded-xl border bg-muted/40 px-2.5 py-1.5 text-xs"><span className="text-muted-foreground">{isCreatorImage(file) ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}</span><span className="max-w-44 truncate">{file.name}</span><span className="text-muted-foreground">{formatCreatorFileSize(file.size)}</span><button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.attachment.remove" type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => setAttachments((current) => current.filter((entry) => entry !== file))} aria-label={t('flow_builder.creator.attachment.remove', 'Remove {{name}}', { name: file.name })}><X className="h-3 w-3" /></button></span>)}</div>}
                  <Textarea data-tour="components-flow-builder-aiworkflowcreatorpanel.textarea.instruction" showExpandButton={false} ref={instructionRef} value={instruction} onChange={(event) => updateInstructionFromUser(event.target.value, event.target.selectionStart ?? event.target.value.length)} onSelect={(event) => setVariableCursor(event.currentTarget.selectionStart ?? instruction.length)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void generate(); } }} placeholder={promptPlaceholder} className="min-h-[52px] resize-none border-0 bg-transparent px-1.5 py-1.5 text-sm shadow-none transition-[min-height] duration-200 focus:min-h-[140px] focus-visible:ring-0 motion-reduce:transition-none sm:focus:min-h-[180px]" disabled={creatorBusy} />
                  <div className="flex items-center justify-between gap-3 pt-1.5">
                    <div className="flex items-center gap-1.5"><input data-tour="components-flow-builder-aiworkflowcreatorpanel.input.flow_builder.creator.attachment.add" ref={fileInputRef} type="file" multiple accept={CREATOR_ATTACHMENT_ACCEPT} className="hidden" onChange={(event) => addAttachments(event.target.files)} /><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.attachment.add" type="button" size="icon" variant="ghost" disabled={creatorBusy || attachments.length >= CREATOR_ATTACHMENT_MAX_COUNT} title={t('flow_builder.creator.attachment.add', 'Attach reference files')} aria-label={t('flow_builder.creator.attachment.add', 'Attach reference files')} onClick={() => fileInputRef.current?.click()} className="h-8 w-8 rounded-md border border-border/70 bg-background/40"><Paperclip className="h-3.5 w-3.5" /></Button><CreatorVariableMenu variables={promptVariables} disabled={creatorBusy} label={t('flow_builder.creator.variable.insert', 'Insert variable')} searchLabel={t('flow_builder.creator.variable.search', 'Search variables…')} emptyLabel={t('flow_builder.creator.variable.empty', 'No variables found.')} onSelect={insertPromptVariable} /><div className="ml-1 flex h-8 items-center rounded-md border border-border/70 bg-background/40 p-0.5" aria-label={t('flow_builder.creator.mode.label', 'Creator mode')}><button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.mode.normal" type="button" disabled={creatorBusy} onClick={() => changeCreatorMode('normal')} className={cn('h-6 rounded px-2 text-[10px] font-medium transition-colors', creatorMode === 'normal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('flow_builder.creator.mode.normal', 'Normal')}</button><button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.mode.interactive" type="button" disabled={creatorBusy} onClick={() => changeCreatorMode('interactive')} className={cn('h-6 rounded px-2 text-[10px] font-medium transition-colors', creatorMode === 'interactive' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('flow_builder.creator.mode.interactive', 'Interactive')}</button></div><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.enhance.action" type="button" size="icon" variant="ghost" disabled={!instruction.trim() || creatorBusy || credentialUnavailable} title={t('flow_builder.creator.enhance.action', 'Enhance workflow prompt')} aria-label={t('flow_builder.creator.enhance.action', 'Enhance workflow prompt')} onClick={() => void enhancePrompt()} className="h-8 w-8 rounded-md border border-violet-400/30 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-300">{isEnhancingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}</Button>{originalInstruction !== null && <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.enhance.undo" type="button" size="icon" variant="ghost" title={t('flow_builder.creator.enhance.undo', 'Undo enhancement')} aria-label={t('flow_builder.creator.enhance.undo', 'Undo enhancement')} onClick={restoreOriginalInstruction} className="h-8 w-8 rounded-md border border-border/70 bg-background/40"><RotateCcw className="h-3.5 w-3.5" /></Button>}</div>
                    <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.expand_prompt" type="button" size="icon" variant="ghost" disabled={creatorBusy} title={t('flow_builder.creator.expand_prompt', 'Expand prompt editor')} aria-label={t('flow_builder.creator.expand_prompt', 'Expand prompt editor')} onClick={() => setPromptExpanded(true)} className="h-8 w-8 rounded-md border border-border/70 bg-background/40"><Maximize2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
              {attachmentError && <p className="mt-2 text-xs text-destructive">{attachmentError}</p>}
              <div className="mt-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">{isGenerating ? <><div className="flex min-w-0 items-center gap-2" role="status" aria-live="polite"><Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /><span className="min-w-0"><span className="block text-[11px] font-medium text-foreground">{t('flow_builder.creator.generation_in_progress', 'Workflow generation is in progress. Please wait.')}</span><span className="block truncate text-[10px] text-muted-foreground">{generationStatusText}</span></span></div><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.common.stop" size="sm" variant="destructive" className="h-8 shrink-0 sm:min-w-28" onClick={cancelGeneration}><Square className="mr-2 h-3.5 w-3.5" />{t('common.stop', 'Stop')}</Button></> : <><p className="text-[10px] text-muted-foreground">{t('flow_builder.creator.keyboard_hint', 'Press Shift + Enter for a new line')}</p><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.generate_workflow" size="sm" className="h-8 bg-gradient-to-r from-teal-400 via-blue-500 to-violet-600 text-xs text-white shadow-lg hover:opacity-90 sm:min-w-44" onClick={() => void generate()} disabled={!instruction.trim() || credentialUnavailable || isEnhancingPrompt}>{isEnhancingPrompt ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}{t('flow_builder.creator.generate_workflow', 'Generate Workflow')}</Button></>}</div>
            </footer>
          </div>}
          {creatorWindowFloating && CREATOR_RESIZE_HANDLES.map((handle) => <div key={handle.direction} aria-hidden="true" className={cn('absolute z-[80] touch-none', handle.className)} onPointerDown={(event) => startCreatorResize(handle.direction, event)} />)}
        </DialogContent>
      </Dialog>

      <Dialog open={promptExpanded} onOpenChange={setPromptExpanded}>
        <DialogContent data-tour="components-flow-builder-aiworkflowcreatorpanel.dialogcontent.flow_builder.creator.prompt_editor_title" showCloseButton={false} contentNoScroll className="max-w-3xl rounded-[22px] [&>div:first-child]:p-0 [&>div:first-child]:pb-0">
          <DialogHeader className="border-b px-6 py-5"><DialogTitle>{t('flow_builder.creator.prompt_editor_title', 'Workflow prompt')}</DialogTitle><DialogDescription>{t('flow_builder.creator.prompt_editor_description', 'Describe the complete outcome, constraints, and information the workflow should handle.')}</DialogDescription></DialogHeader>
          <div className="p-6"><Textarea data-tour="components-flow-builder-aiworkflowcreatorpanel.textarea.instruction" showExpandButton={false} ref={expandedInstructionRef} value={instruction} onChange={(event) => updateInstructionFromUser(event.target.value, event.target.selectionStart ?? event.target.value.length)} onSelect={(event) => setVariableCursor(event.currentTarget.selectionStart ?? instruction.length)} className="min-h-[50vh] resize-none text-base leading-relaxed" placeholder={promptPlaceholder} autoFocus disabled={creatorBusy} /></div>
          <div className="flex items-center justify-between gap-3 border-t px-6 py-4"><div className="flex items-center gap-2"><CreatorVariableMenu variables={promptVariables} disabled={creatorBusy} label={t('flow_builder.creator.variable.insert', 'Insert variable')} searchLabel={t('flow_builder.creator.variable.search', 'Search variables…')} emptyLabel={t('flow_builder.creator.variable.empty', 'No variables found.')} onSelect={insertPromptVariable} /><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.enhance.action" type="button" variant="outline" size="sm" disabled={!instruction.trim() || creatorBusy || credentialUnavailable} onClick={() => void enhancePrompt()}>{isEnhancingPrompt ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}{t('flow_builder.creator.enhance.action', 'Enhance workflow prompt')}</Button>{originalInstruction !== null && <Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.flow_builder.creator.enhance.undo" type="button" variant="ghost" size="sm" onClick={restoreOriginalInstruction}><RotateCcw className="mr-2 h-3.5 w-3.5" />{t('flow_builder.creator.enhance.undo', 'Undo enhancement')}</Button>}</div><Button data-tour="components-flow-builder-aiworkflowcreatorpanel.button.common.done" onClick={() => setPromptExpanded(false)} disabled={isEnhancingPrompt}>{t('common.done', 'Done')}</Button></div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('flow_builder.creator.replace_title', 'Apply these workflow changes?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('flow_builder.creator.replace_description', 'This applies the staged repair to the editor as one undoable change. It will not be saved until you use Save.', { current: currentGraph.nodes.length, generated: completed?.draft.nodes.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('flow_builder.creator.keep_current', 'Keep current workflow')}</AlertDialogCancel>
            <AlertDialogAction onClick={acceptCompleted}>{t('flow_builder.creator.replace_action', 'Apply changes')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('flow_builder.creator.close_title', 'Close Workflow Creator?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('flow_builder.creator.close_description', 'The current generation, reference files, and unapplied preview will be discarded.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={closeAndDiscard}>{t('flow_builder.creator.close_discard', 'Discard and close')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
