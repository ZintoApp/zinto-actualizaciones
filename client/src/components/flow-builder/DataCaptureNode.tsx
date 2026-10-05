import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, dialogCloseButtonClassName } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  Plus,
  Settings,
  Trash2,
  Variable,
  X,
  Database,
  Phone,
  Mail,
  Tag,
  Hash,
  Image as ImageIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import React from 'react';

type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'any';

interface DataCaptureRule {
  id: string;
  variableName: string;
  sourceType: 'regex_extract' | 'custom_prompt';
  sourceValue: string;
  dataType: 'string' | 'number' | 'email' | 'phone' | 'media';
  /** When dataType is media, which attachment types are accepted. */
  mediaKind?: MediaKind;
  required: boolean;
  defaultValue?: string;
  validationPattern?: string;
  validationErrorMessage?: string;
  description?: string;
}

interface DataCaptureNodeProps {
  id: string;
  data: {
    label: string;
    captureRules?: DataCaptureRule[];
    storageScope?: 'session' | 'flow' | 'global';
    overwriteExisting?: boolean;
    enableValidation?: boolean;
    formMode?: boolean;
  };
  isConnectable: boolean;
}

const DATA_SOURCE_TYPES = [
  {
    id: 'regex_extract',
    name: 'Regex Extract',
    description: 'Extract specific patterns from message',
    icon: <Hash className="w-3 h-3" />,
    placeholder: 'Regular expression pattern'
  },
  {
    id: 'custom_prompt',
    name: 'Custom Prompt',
    description: 'Ask user for specific information',
    icon: <InboxConversationIcon className="w-3 h-3" />,
    placeholder: 'What is your name?'
  }
];

const DATA_TYPES = [
  { id: 'string', name: 'Text', icon: <Tag className="w-3 h-3" /> },
  { id: 'number', name: 'Number', icon: <Hash className="w-3 h-3" /> },
  { id: 'email', name: 'Email', icon: <Mail className="w-3 h-3" /> },
  { id: 'phone', name: 'Phone', icon: <Phone className="w-3 h-3" /> },
  { id: 'media', name: 'Media', icon: <ImageIcon className="w-3 h-3" /> }
];

const MEDIA_KINDS: { id: MediaKind; name: string }[] = [
  { id: 'any', name: 'Any media' },
  { id: 'image', name: 'Image' },
  { id: 'video', name: 'Video' },
  { id: 'audio', name: 'Audio' },
  { id: 'document', name: 'Document' }
];

type DataCaptureRuleInput = Omit<DataCaptureRule, 'dataType' | 'sourceType' | 'mediaKind'> & {
  dataType?: string;
  sourceType?: string;
  mediaKind?: string;
};

function normalizeDataType(dataType: string | undefined): DataCaptureRule['dataType'] {
  if (dataType === 'number' || dataType === 'email' || dataType === 'phone' || dataType === 'media') {
    return dataType;
  }
  return 'string';
}

function normalizeMediaKind(v: string | undefined): MediaKind {
  if (v === 'image' || v === 'video' || v === 'audio' || v === 'document' || v === 'any') return v;
  return 'any';
}

/** Map deprecated source types to supported ones when loading saved flows. */
function normalizeSourceType(rule: DataCaptureRuleInput): Pick<DataCaptureRule, 'sourceType' | 'description' | 'sourceValue'> {
  const raw = rule.sourceType || 'custom_prompt';
  let description = rule.description ?? '';
  let sourceValue = rule.sourceValue ?? '';

  if (raw === 'regex_extract' || raw === 'custom_prompt') {
    return { sourceType: raw, description, sourceValue };
  }

  if (raw === 'contact_field') {
    const desc = description.trim();
    const path = sourceValue.trim();
    return {
      sourceType: 'custom_prompt',
      description: desc || path,
      sourceValue: ''
    };
  }

  // message_content, user_input, unknown
  return {
    sourceType: 'custom_prompt',
    description: (description.trim() || sourceValue.trim()),
    sourceValue: ''
  };
}

function normalizeCaptureRule(rule: DataCaptureRuleInput): DataCaptureRule {
  const { sourceType, description, sourceValue } = normalizeSourceType(rule);
  const dataType = normalizeDataType(rule.dataType);
  return {
    ...rule,
    sourceType,
    description,
    sourceValue,
    dataType,
    mediaKind: dataType === 'media' ? normalizeMediaKind(rule.mediaKind) : undefined
  };
}

function ruleUsesPatternOrPathField(sourceType: DataCaptureRule['sourceType']): boolean {
  return sourceType === 'regex_extract';
}

function isCaptureRuleConfigured(rule: DataCaptureRule): boolean {
  if (!rule.variableName.trim()) return false;
  if (rule.sourceType === 'regex_extract') {
    return rule.sourceValue.trim().length > 0;
  }
  return (rule.description || '').trim().length > 0;
}

/** Persisted rule shape: sourceValue derived for prompt types; default/regex pattern UI removed — omit those keys. */
function captureRulesForPersist(rules: DataCaptureRule[]): DataCaptureRule[] {
  return rules.map((rule) => {
    const { defaultValue: _omitDefault, validationPattern: _omitPattern, ...rest } = rule;
    const merged =
      ruleUsesPatternOrPathField(rule.sourceType)
        ? rest
        : { ...rest, sourceValue: (rule.description ?? '').trim() };
    const dt = normalizeDataType(merged.dataType);
    return {
      ...merged,
      dataType: dt,
      mediaKind: dt === 'media' ? normalizeMediaKind(merged.mediaKind) : undefined
    };
  });
}

const CAPTURE_TEMPLATES = [
  {
    id: 'contact_info',
    name: 'Contact Information',
    rules: [
      {
        id: 'name',
        variableName: 'user_name',
        sourceType: 'regex_extract' as const,
        sourceValue: 'My name is ([\\p{L}]+(?:[\\s\'-][\\p{L}]+)*)',
        dataType: 'string' as const,
        required: true,
        description: 'What is your name?'
      },
      {
        id: 'email',
        variableName: 'user_email',
        sourceType: 'regex_extract' as const,
        sourceValue: '([a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z]{2,})',
        dataType: 'email' as const,
        required: false,
        description: 'What is your email?'
      }
    ]
  },
  {
    id: 'profile_details',
    name: 'General Contact & Background Information',
    rules: [
      {
        id: 'first_name',
        variableName: 'user_first_name',
        sourceType: 'custom_prompt' as const,
        sourceValue: 'Please share your first name.',
        dataType: 'string' as const,
        required: true,
        description: 'What is your first name?'
      },
      {
        id: 'last_name',
        variableName: 'user_last_name',
        sourceType: 'custom_prompt' as const,
        sourceValue: 'Please share your last name.',
        dataType: 'string' as const,
        required: true,
        description: 'What is your last name?'
      },
      {
        id: 'company_or_institution',
        variableName: 'user_company_or_institution',
        sourceType: 'custom_prompt' as const,
        sourceValue: 'Please share your company or institution.',
        dataType: 'string' as const,
        required: false,
        description: 'Which company or institution are you affiliated with?'
      },
      {
        id: 'email_address',
        variableName: 'user_email',
        sourceType: 'custom_prompt' as const,
        sourceValue: 'Please share your email address.',
        dataType: 'email' as const,
        required: true,
        description: 'What is your email address?'
      },
      {
        id: 'area_of_interest',
        variableName: 'user_area_of_interest',
        sourceType: 'custom_prompt' as const,
        sourceValue: 'Please share your main area of interest, such as industry or agriculture.',
        dataType: 'string' as const,
        required: false,
        description: 'What is your main area of interest (for example: industry, agriculture, etc.)?'
      },
      {
        id: 'profession',
        variableName: 'user_profession',
        sourceType: 'custom_prompt' as const,
        sourceValue: 'Please share your profession.',
        dataType: 'string' as const,
        required: false,
        description: 'What is your profession?'
      }
    ]
  },
  {
    id: 'order_details',
    name: 'Order Information',
    rules: [
      {
        id: 'order_id',
        variableName: 'order_id',
        sourceType: 'regex_extract' as const,
        sourceValue: 'order[\\s#]*([A-Z0-9]+)',
        dataType: 'string' as const,
        required: true,
        description: 'Please provide your order ID'
      },
      {
        id: 'quantity',
        variableName: 'quantity',
        sourceType: 'regex_extract' as const,
        sourceValue: '(\\d+)\\s*(?:items?|pieces?|qty)',
        dataType: 'number' as const,
        required: false,
        description: 'What is the quantity of the order?'
      }
    ]
  },
  {
    id: 'feedback_form',
    name: 'Feedback Collection',
    rules: [
      {
        id: 'rating',
        variableName: 'satisfaction_rating',
        sourceType: 'regex_extract' as const,
        sourceValue: '([1-5]|one|two|three|four|five)',
        dataType: 'number' as const,
        required: true,
        description: 'what is your satisfaction rating?'
      },
      {
        id: 'feedback',
        variableName: 'feedback_text',
        sourceType: 'custom_prompt' as const,
        sourceValue: '',
        dataType: 'string' as const,
        required: false,
        description: 'Please provide your feedback'
      }
    ]
  }
];

export function DataCaptureNode({ id, data, isConnectable }: DataCaptureNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [captureRules, setCaptureRules] = useState<DataCaptureRule[]>(() =>
    (data.captureRules || []).map((r) => normalizeCaptureRule(r as DataCaptureRuleInput))
  );
  const storageScope: 'session' = 'session';
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(data.overwriteExisting || false);
  const [enableValidation, setEnableValidation] = useState<boolean>(data.enableValidation !== false);
  const formMode = true;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configurationProgress, setConfigurationProgress] = useState(0);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

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

  const standardHandleStyle = {
    width: 12,
    height: 12,
    backgroundColor: '#3b82f6',
    border: '2px solid white',
  };

  const addCaptureRule = () => {
    const newRule: DataCaptureRule = {
      id: `rule_${Date.now()}`,
      variableName: '',
      sourceType: 'custom_prompt',
      sourceValue: '',
      dataType: 'string',
      required: false,
      description: ''
    };
    setCaptureRules([...captureRules, newRule]);
  };

  const updateCaptureRule = (ruleId: string, updates: Partial<DataCaptureRule>) => {
    setCaptureRules(rules =>
      rules.map(rule =>
        rule.id === ruleId ? { ...rule, ...updates } : rule
      )
    );
  };

  const removeCaptureRule = (ruleId: string) => {
    setCaptureRules(rules => rules.filter(rule => rule.id !== ruleId));
  };

  const applyTemplate = (templateId: string) => {
    const template = CAPTURE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setCaptureRules(template.rules.map((r) => normalizeCaptureRule(r as DataCaptureRuleInput)));
    }
  };

  const calculateProgress = () => {
    const hasRules = captureRules.length > 0;
    const validRules = captureRules.filter(isCaptureRuleConfigured).length;
    const totalRules = captureRules.length || 1;
    
    const progress = hasRules ? (validRules / totalRules) * 100 : 0;
    setConfigurationProgress(Math.round(progress));
  };

  useEffect(() => {
    calculateProgress();
  }, [captureRules]);

  useEffect(() => {
    updateNodeData({
      captureRules: captureRulesForPersist(captureRules),
      storageScope: 'session',
      overwriteExisting,
      enableValidation,
      formMode: true
    });
  }, [updateNodeData, captureRules, overwriteExisting, enableValidation]);

  return (
    <div className={`node-data-capture p-3 rounded-lg bg-card border border-border shadow-sm group ${isEditing ? 'min-w-[640px] max-w-[900px]' : 'min-w-[380px] max-w-[480px]'}`}>
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <Dialog>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Content
                  className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
                >
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      {t('flow_builder.data_capture_help_title', 'Data Capture Node - Help & Documentation')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('flow_builder.data_capture_help_description', 'Learn how to effectively capture and use data in your flows')}
                    </DialogDescription>
                  </DialogHeader>
                  <DataCaptureHelpContent />
                  <DialogPrimitive.Close className={dialogCloseButtonClassName}>
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </Dialog>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.help_documentation', 'Help & Documentation')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <img 
                src={APP_ICONS.dataCapture}
                alt="Data Capture" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.data_capture_node', 'Data Capture Node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>{t('flow_builder.data_capture', 'Data Capture')}</span>
        
        {configurationProgress > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20">
                  {configurationProgress}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.configuration_progress', 'Configuration Progress')}</p>
                <p className="text-xs text-muted-foreground">
                  {configurationProgress === 100 ? t('flow_builder.data_capture_fully_configured', 'Fully configured and ready to capture data') : t('flow_builder.data_capture_complete_rules', 'Complete capture rules for full functionality')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {formMode && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  🗂 {t('flow_builder.data_capture_form_mode', 'Form Mode')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.data_capture_form_mode_enabled', 'Form mode enabled')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('flow_builder.data_capture_form_mode_description', 'Each capture rule is asked as a sequential question and the node waits for a reply before continuing.')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-tour="components-flow-builder-datacapturenode.button.flow_builder.hide"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {t('flow_builder.hide', 'Hide')}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t('flow_builder.edit', 'Edit')}
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {isEditing ? t('flow_builder.hide_configuration_options', 'Hide configuration options') : t('flow_builder.show_configuration_options', 'Show configuration options')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Variable className="h-3 w-3 text-primary" />
                  <span className="font-medium text-primary">
                    {captureRules.length} {captureRules.length !== 1 ? t('flow_builder.data_capture_variables', 'Variables') : t('flow_builder.data_capture_variable', 'Variable')}
                  </span>
                  {captureRules.length > 0 && (
                    <span className="text-xs text-primary font-medium">✓</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{t('flow_builder.data_capture_rules', 'Data Capture Rules')}</p>
                <p className="text-xs text-muted-foreground">
                  {captureRules.length === 0
                    ? t('flow_builder.data_capture_no_rules', 'No capture rules configured yet')
                    : t('flow_builder.data_capture_capturing', 'Capturing {{count}} variable(s) from user data', { count: captureRules.length })
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {captureRules.length > 0 ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-secondary" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {captureRules.length > 0 ? t('flow_builder.ready', 'Ready') : t('flow_builder.setup_required', 'Setup required')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {captureRules.length > 0
                    ? t('flow_builder.data_capture_ready_scope', 'Data capture ready with {{scope}} scope', { scope: storageScope })
                    : t('flow_builder.data_capture_configure_rules', 'Please configure capture rules to start capturing data')
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex flex-wrap gap-1 text-[10px]">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  📊 {storageScope.charAt(0).toUpperCase() + storageScope.slice(1)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.data_capture_storage_scope', 'Variable Storage Scope')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('flow_builder.data_capture_storage_scope_desc', 'Variables will be stored at {{scope}} level', { scope: storageScope })}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {enableValidation && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ✅ Validation
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.data_capture_validation_enabled', 'Data validation enabled')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.data_capture_validation_desc', 'Captured data will be validated before storage')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {overwriteExisting && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    🔄 Overwrite
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.data_capture_overwrite', 'Overwrite existing variables')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.data_capture_overwrite_desc', 'Will replace existing variables with same names')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {captureRules.some(rule => rule.required) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ⚠️ Required
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.data_capture_has_required', 'Has required fields')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.data_capture_required_desc', 'Some variables are marked as required')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.data_capture_quick_templates', 'Quick Templates')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.data_capture_templates_desc', 'Pre-configured templates for common data capture scenarios')}</p>
                    <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_templates_select', 'Select a template to quickly set up data capture rules')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value=""
              onValueChange={applyTemplate}
            >
              <SelectTrigger data-tour="components-flow-builder-datacapturenode.selecttrigger.flow_builder.data_capture_choose_template" className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.data_capture_choose_template', 'Choose a template...')} />
              </SelectTrigger>
              <SelectContent>
                {CAPTURE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <Variable className="w-3 h-3" />
                      <div>
                        <div className="font-medium">{t(`flow_builder.data_capture_template_${template.id}`, template.name)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {template.rules.length} {template.rules.length !== 1 ? t('flow_builder.data_capture_rules_count', 'capture rules') : t('flow_builder.data_capture_rule_count', 'capture rule')}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="font-medium">{t('flow_builder.data_capture_rules', 'Capture Rules')}</Label>
              <Button data-tour="components-flow-builder-datacapturenode.button.flow_builder.data_capture_add_rule"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={addCaptureRule}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('flow_builder.data_capture_add_rule', 'Add Rule')}
              </Button>
            </div>

            <div className="max-h-[420px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-1">
            {captureRules.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <Variable className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">{t('flow_builder.data_capture_no_rules', 'No capture rules configured')}</p>
                <p className="text-[10px] text-muted-foreground">{t('flow_builder.data_capture_add_rules_prompt', 'Add rules to start capturing data from conversations')}</p>
              </div>
            )}

            <div className="space-y-2">
              {captureRules.map((rule, index) => (
                <div key={rule.id} className="border rounded p-2 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[9px]">
                      {t('flow_builder.data_capture_rule_num', 'Rule {{num}}', { num: index + 1 })}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeCaptureRule(rule.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.data_capture_variable_name', 'Variable Name')}</Label>
                      <Input data-tour="components-flow-builder-datacapturenode.input.flow_builder.data_capture_variable_name"
                        value={rule.variableName}
                        onChange={(e) => updateCaptureRule(rule.id, { variableName: e.target.value })}
                        placeholder="user_name"
                        className="text-[10px] h-6"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.data_capture_data_type', 'Data Type')}</Label>
                      <Select
                        value={rule.dataType}
                        onValueChange={(value: any) => {
                          const dt = value as DataCaptureRule['dataType'];
                          if (dt === 'media') {
                            updateCaptureRule(rule.id, {
                              dataType: dt,
                              mediaKind: rule.mediaKind ?? 'any'
                            });
                          } else {
                            updateCaptureRule(rule.id, { dataType: dt, mediaKind: undefined });
                          }
                        }}
                      >
                        <SelectTrigger className="text-[10px] h-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              <div className="flex items-center gap-1">
                                {type.icon}
                                {t(`flow_builder.data_capture_type_${type.id}`, type.name)}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {rule.dataType === 'media' && (
                    <div className="mb-2">
                      <Label className="text-[10px] font-medium mb-1 block">
                        {t('flow_builder.data_capture_media_kind', 'Media type')}
                      </Label>
                      <Select
                        value={rule.mediaKind ?? 'any'}
                        onValueChange={(value: any) =>
                          updateCaptureRule(rule.id, { mediaKind: value as MediaKind })
                        }
                      >
                        <SelectTrigger className="text-[10px] h-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEDIA_KINDS.map((kind) => (
                            <SelectItem key={kind.id} value={kind.id}>
                              {t(`flow_builder.data_capture_media_kind_${kind.id}`, kind.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[9px] text-muted-foreground">
                        {t(
                          'flow_builder.data_capture_media_kind_hint',
                          'Validation uses the channel message type (e.g. WhatsApp image/video/audio/document) and falls back to the file URL when needed.'
                        )}
                      </p>
                    </div>
                  )}

                  <div className="mb-2">
                    <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.data_capture_source_type', 'Source Type')}</Label>
                    <Select
                      value={rule.sourceType}
                      onValueChange={(value: any) => {
                        const nextType = value as DataCaptureRule['sourceType'];
                        if (ruleUsesPatternOrPathField(nextType)) {
                          updateCaptureRule(rule.id, { sourceType: nextType });
                        } else {
                          updateCaptureRule(rule.id, {
                            sourceType: nextType,
                            sourceValue: (rule.description ?? '').trim()
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="text-[10px] h-6">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATA_SOURCE_TYPES.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            <div className="flex items-center gap-1">
                              {source.icon}
                              <div>
                                <div className="font-medium">{t(`flow_builder.data_capture_source_${source.id}`, source.name)}</div>
                                <div className="text-[9px] text-muted-foreground">{t(`flow_builder.data_capture_source_${source.id}_desc`, source.description)}</div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {ruleUsesPatternOrPathField(rule.sourceType) && (
                    <div className="mb-2">
                      <Label className="text-[10px] font-medium mb-1 block">
                        {t('flow_builder.data_capture_regex_pattern', 'Regex pattern')}
                      </Label>
                      <Input data-tour="components-flow-builder-datacapturenode.input.flow_builder.data_capture_regex_pattern"
                        value={rule.sourceValue}
                        onChange={(e) => updateCaptureRule(rule.id, { sourceValue: e.target.value })}
                        placeholder={
                          DATA_SOURCE_TYPES.find((s) => s.id === rule.sourceType)
                            ? t(
                                `flow_builder.data_capture_source_${rule.sourceType}_placeholder`,
                                DATA_SOURCE_TYPES.find((s) => s.id === rule.sourceType)!.placeholder
                              )
                            : ''
                        }
                        className="text-[10px] h-6 font-mono"
                      />
                    </div>
                  )}

                  <div className="mb-2">
                    <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.data_capture_description_prompt', 'Description / Prompt')}</Label>
                    <Input data-tour="components-flow-builder-datacapturenode.input.flow_builder.data_capture_prompt_placeholder"
                      value={rule.description || ''}
                      onChange={(e) => updateCaptureRule(rule.id, { description: e.target.value })}
                      placeholder={t('flow_builder.data_capture_prompt_placeholder', 'What is your email?')}
                      className="text-[10px] h-6"
                    />
                  </div>

                  <div className="mb-2">
                    <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.data_capture_validation_error', 'Validation Error Message')}</Label>
                    <Input data-tour="components-flow-builder-datacapturenode.input.flow_builder.data_capture_validation_error_placeholder"
                      value={rule.validationErrorMessage || ''}
                      onChange={(e) => updateCaptureRule(rule.id, { validationErrorMessage: e.target.value })}
                      placeholder={t('flow_builder.data_capture_validation_error_placeholder', 'Invalid input, please try again.')}
                      className="text-[10px] h-6"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={rule.required}
                        onCheckedChange={(checked) => updateCaptureRule(rule.id, { required: checked })}
                      />
                      <Label className="text-[10px]">{t('flow_builder.data_capture_required', 'Required')}</Label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button data-tour="components-flow-builder-datacapturenode.button.flow_builder.data_capture_advanced_settings" variant="ghost" size="sm" className="h-6 p-1 text-[10px] w-full justify-between">
                <span>{t('flow_builder.data_capture_advanced_settings', 'Advanced Settings')}</span>
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={overwriteExisting}
                  onCheckedChange={(checked) => setOverwriteExisting(checked)}
                />
                <Label className="text-[10px] font-medium">
                  {t('flow_builder.data_capture_overwrite_label', 'Overwrite Existing Variables')}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs max-w-48">
                          {t('flow_builder.data_capture_overwrite_tooltip', 'If enabled, will replace existing variables with the same name. If disabled, will skip capture if variable already exists.')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={enableValidation}
                  onCheckedChange={(checked) => setEnableValidation(checked)}
                />
                <Label className="text-[10px] font-medium">
                  {t('flow_builder.data_capture_enable_validation', 'Enable Data Validation')}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs max-w-48">
                          {t('flow_builder.data_capture_validation_tooltip', 'Validate captured data against the specified data type (email format, phone format, etc.)')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />
    </div>
  );
}


function DataCaptureHelpContent() {
  const { t } = useTranslation();
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Node Overview */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            {t('flow_builder.data_capture_help_node_overview', 'Node Overview')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              {t('flow_builder.data_capture_help_overview_p1', 'The Data Capture Node is a powerful tool for extracting and storing information from user conversations. It enables you to capture specific data points and make them available as variables throughout your entire flow.')}
            </p>
            <p className="text-sm text-foreground">
              {t('flow_builder.data_capture_help_overview_p2', 'Key Benefits: Personalize responses, store user preferences, extract order information, collect contact details, and create dynamic, context-aware conversations.')}
            </p>
          </div>
        </section>

        {/* Data Source Types */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <InboxConversationIcon className="h-4 w-4 text-primary" />
            {t('flow_builder.data_capture_help_source_types', 'Data Source Types')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Hash className="h-3 w-3" />
                {t('flow_builder.data_capture_source_regex_extract', 'Regex Extract')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.data_capture_help_regex', 'Uses regular expressions to extract specific patterns from messages.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>Common Patterns:</strong></div>
                <div>Name: My name is ([\p&#123;L&#125;]+(?:[\s'-][\p&#123;L&#125;]+)*)</div>
                <div>Email: ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]&#123;2,&#125;)</div>
                <div>Phone: (\\+?[\\d\\s\\-\\(\\)]&#123;10,15&#125;)</div>
                <div>Order ID: order[\\s#]*([A-Z0-9]+)</div>
                <div>Number: (\\d+)</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <InboxConversationIcon className="h-3 w-3" />
                {t('flow_builder.data_capture_source_custom_prompt', 'Custom Prompt')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t(
                  'flow_builder.data_capture_help_custom_prompt',
                  'In form mode, asks the user a sequential question and stores their reply in the variable. Set the prompt in Description / Prompt.'
                )}
              </p>
              <div className="bg-muted rounded p-2 text-xs">
                {t(
                  'flow_builder.data_capture_help_custom_prompt_best',
                  'Use for structured data collection when regex is not enough — for example email, phone, or free-text answers to a specific question.'
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Data Types */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            {t('flow_builder.data_capture_help_data_types', 'Data Types & Validation')}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.data_capture_help_type_string', 'String (Text)')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_help_type_string_desc', 'Any text content, no validation')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.data_capture_type_number', 'Number')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_help_type_number_desc', 'Numeric values, validates format')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.data_capture_type_email', 'Email')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_help_type_email_desc', 'Validates email format (user@domain.com)')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.data_capture_type_phone', 'Phone')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_help_type_phone_desc', 'Validates phone number format')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                {t('flow_builder.data_capture_type_media', 'Media')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t(
                  'flow_builder.data_capture_help_type_media_desc',
                  'Stores the inbound attachment URL. Choose a specific media type (image, video, audio, document) or Any media. Validation uses the channel message type and file name when available.'
                )}
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Variable System */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Variable className="h-4 w-4 text-primary" />
            {t('flow_builder.data_capture_help_variable_system', 'Variable System')}
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.data_capture_help_variables_work', 'How Variables Work')}</h4>
              <p className="text-xs text-foreground mb-2">
                Once captured, data becomes available as <code className="bg-muted px-1 rounded">&#123;&#123;variable_name&#125;&#125;</code> tokens
                that can be used in any subsequent node in your flow.
              </p>
              <div className="bg-card rounded p-2 text-xs font-mono">
                Captured: user_name = "John"<br/>
                Usage: "Hello &#123;&#123;user_name&#125;&#125;, how can I help you today?"<br/>
                Result: "Hello John, how can I help you today?"
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.data_capture_help_variable_scoping', 'Variable Scoping')}</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">Session</Badge>
                  <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_scope_session', 'Available during the current conversation only')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">Flow</Badge>
                  <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_scope_flow', 'Available throughout the entire flow execution')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">Global</Badge>
                  <p className="text-xs text-muted-foreground">{t('flow_builder.data_capture_scope_global', 'Available across all flows for this contact')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Options */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            {t('flow_builder.data_capture_help_config_options', 'Configuration Options')}
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-primary" />
                {t('flow_builder.data_capture_overwrite_label', 'Overwrite Existing Variables')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('flow_builder.data_capture_help_overwrite', 'When enabled, will replace existing variables with the same name. When disabled, will skip capture if variable already exists.')}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-primary" />
                {t('flow_builder.data_capture_enable_validation', 'Enable Data Validation')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('flow_builder.data_capture_help_validation', 'Validates captured data against the specified data type (email format, phone format, etc.). Invalid data will be rejected.')}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <AlertCircle className="h-3 w-3 text-destructive" />
                {t('flow_builder.data_capture_help_required', 'Required Fields')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('flow_builder.data_capture_help_required_desc', 'When a field is marked as required, the flow will fail if the data cannot be captured. Use for critical information only.')}
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Practical Examples */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            {t('flow_builder.data_capture_help_examples', 'Practical Examples')}
          </h3>
          <div className="space-y-4">
            {/* Example 1 */}
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.data_capture_example1', 'Example 1: Contact Information Collection')}</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-card rounded p-2">
                  <strong>User Message:</strong> "Hi, my name is Abid Shafi and my email is abid@pointer.pk"
                </div>
                <div className="bg-muted rounded p-2 font-mono">
                  <strong>Capture Rules:</strong><br/>
                  Rule 1: user_name | Regex Extract | My name is ([\p&#123;L&#125;]+(?:[\s'-][\p&#123;L&#125;]+)*)<br/>
                  Rule 2: user_email | Regex Extract | ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]&#123;2,&#125;)
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Result:</strong><br/>
                  &#123;&#123;user_name&#125;&#125; = "Abid Shafi"<br/>
                  &#123;&#123;user_email&#125;&#125; = "abid@pointer.pk"
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Usage in Next Node:</strong><br/>
                  "Thank you &#123;&#123;user_name&#125;&#125;! I'll send the information to &#123;&#123;user_email&#125;&#125;."
                </div>
              </div>
            </div>

            {/* Example 2 */}
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.data_capture_example2', 'Example 2: Order Status Inquiry')}</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-card rounded p-2">
                  <strong>User Message:</strong> "I need help with order #ORD-12345"
                </div>
                <div className="bg-muted rounded p-2 font-mono">
                  <strong>Capture Rule:</strong><br/>
                  order_id | Regex Extract | order[\\s#]*([A-Z0-9-]+)
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Result:</strong> &#123;&#123;order_id&#125;&#125; = "ORD-12345"
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Usage:</strong> Pass to API call node to fetch order details
                </div>
              </div>
            </div>

            {/* Example 3 */}
            <div className="border rounded-lg p-4 bg-secondary/10 border-secondary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.data_capture_example3', 'Example 3: Guided questions (Custom Prompt)')}</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-muted rounded p-2 font-mono">
                  <strong>Capture Rules (form mode):</strong><br/>
                  visit_reason | Custom Prompt | “What brings you in today?”<br/>
                  preferred_contact | Custom Prompt | “Email or phone?”
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Usage:</strong>{' '}
                  {t(
                    'flow_builder.data_capture_example3_usage',
                    'Each rule is asked in order; replies are stored as variables for later nodes.'
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
