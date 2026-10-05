import React, { useCallback, useEffect, useState } from "react";
import {
  NodeProps,
  Handle,
  Position,
  useReactFlow
} from "reactflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Edit,
  FileText,
  Variable,
  Settings,
  ListTodo,
  Calendar,
  Flag,
  Layers,
  X
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useFlowContext } from "@/pages/flow-builder";
import { MANAGE_TASK_FLOW_NODE_ICON_SRC } from "@/pages/flow-builder-node-catalog";
import { cn } from "@/lib/utils";
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format, isValid, parse } from 'date-fns';

/** Parse YYYY-MM-DD for calendar display; non-date text is not pre-selected. */
function parseDueDateForCalendar(raw: string): Date | undefined {
  const s = raw.trim();
  if (!s || s.includes('{{')) return undefined;
  const d = parse(s, 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : undefined;
}

/** Select sentinel: do not send this field on update_task (leave existing task value unchanged). */
const MANAGE_TASK_FIELD_OMIT = '__manage_task_field_omit__';

/** Assignee dropdown: no one assigned (stored as empty string on the node). */
const MANAGE_TASK_ASSIGNED_UNASSIGNED = '__manage_task_assigned_unassigned__';

/** Category dropdown: no category selected. */
const MANAGE_TASK_CATEGORY_NONE = '__manage_task_category_none__';

const MANAGE_TASK_CONFIGURED_FIELD_LABEL_KEYS: Record<string, string> = {
  title: 'flow_builder.manage_task_config_field_title',
  description: 'flow_builder.manage_task_config_field_description',
  priority: 'flow_builder.manage_task_config_field_priority',
  status: 'flow_builder.manage_task_config_field_status',
  dueDate: 'flow_builder.manage_task_config_field_due_date',
  assignedTo: 'flow_builder.manage_task_config_field_assigned_to',
  category: 'flow_builder.manage_task_config_field_category',
};

function labelConfiguredManageTaskField(
  field: string,
  t: (key: string, fallback?: string, params?: Record<string, unknown>) => string
): string {
  const trKey = MANAGE_TASK_CONFIGURED_FIELD_LABEL_KEYS[field];
  return trKey ? t(trKey, field) : field;
}

export type ManageTaskData = {
  id: string;
  type: "manage_task";
  operation: 'create_task' | 'update_task' | 'delete_task';
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
  /** When operation is update_task, only include priority in the update payload if true. */
  updatePriority?: boolean;
  /** When operation is update_task, only include status in the update payload if true. */
  updateStatus?: boolean;
  dueDate: string;
  assignedTo: string;
  category: string;
  taskIdVariable: string;
  deleteConfirmation: boolean;
  errorHandling: 'continue' | 'stop';
  showAdvanced: boolean;
  skipEmptyValues: boolean;
};

function getConfiguredFields(data: ManageTaskData): string[] {
  const fields: string[] = [];
  if (data.title?.trim()) fields.push('title');
  if (data.description?.trim()) fields.push('description');
  if (data.operation === 'update_task') {
    if (data.updatePriority === true && data.priority) fields.push('priority');
    if (data.updateStatus === true && data.status) fields.push('status');
  } else if (data.operation === 'create_task') {
    if (data.priority) fields.push('priority');
    if (data.status) fields.push('status');
  }
  if (data.dueDate?.trim()) fields.push('dueDate');
  if (data.assignedTo?.trim()) fields.push('assignedTo');
  if (data.category?.trim()) fields.push('category');
  return fields;
}

function calculateConfigurationProgress(data: ManageTaskData): number {
  let progress = 0;
  if (data.operation) progress += 20;

  if (data.operation === 'create_task') {
    if (data.title?.trim()) progress += 20;
    if (data.priority) progress += 20;
    if (data.status) progress += 20;
    const hasExtra =
      !!(data.description?.trim()) ||
      !!(data.dueDate?.trim()) ||
      !!(data.assignedTo?.trim()) ||
      !!(data.category?.trim());
    if (hasExtra) progress += 20;
  } else if (data.operation === 'update_task') {
    if (data.taskIdVariable?.trim()) progress += 20;
    const configured = getConfiguredFields(data);
    if (configured.length > 0) progress += 40;
  } else if (data.operation === 'delete_task') {
    if (data.taskIdVariable?.trim()) progress += 20;
    if (data.deleteConfirmation) progress += 60;
  }

  return Math.min(100, progress);
}

function priorityFlagClass(p: ManageTaskData['priority'] | undefined): string {
  switch (p) {
    case 'low': return 'text-slate-500';
    case 'medium': return 'text-blue-500';
    case 'high': return 'text-orange-500';
    case 'urgent': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}

function ManageTaskNode({
  id,
  data,
  selected,
  isConnectable
}: NodeProps<ManageTaskData>) {
  const { t } = useTranslation();
  const taskIdPlaceholder = t('flow_builder.task_id_variable_placeholder', '{{task.id}}');
  const { onDeleteNode, onDuplicateNode, customVariables } = useFlowContext();
  const { getNodes, setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  const { data: taskCategories = [] } = useQuery({
    queryKey: ['/api/task-categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/task-categories');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60 * 1000,
  });

  const { data: teamMembers = [], isLoading: isLoadingTeamMembers } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60 * 1000,
  });

  const updateNodeData = useCallback((updates: Partial<ManageTaskData>) => {
    const nodes = getNodes();
    const updatedNodes = nodes.map((node: any) => {
      if (node.id === id) {
        return {
          ...node,
          data: { ...node.data, ...updates }
        };
      }
      return node;
    });
    setNodes(updatedNodes);
  }, [id, getNodes, setNodes]);

  useEffect(() => {
    if (!data) return;
    const op = data.operation || 'create_task';
    const patch: Partial<ManageTaskData> = {};

    if (!data.operation) patch.operation = 'create_task';
    if (data.title === undefined) patch.title = '';
    if (data.description === undefined) patch.description = '';
    if (data.dueDate === undefined) patch.dueDate = '';
    if (data.assignedTo === undefined) patch.assignedTo = '';
    if (data.category === undefined) patch.category = '';
    if (data.taskIdVariable === undefined || !(String(data.taskIdVariable).trim())) {
      patch.taskIdVariable = '{{task.id}}';
    }
    if (data.deleteConfirmation === undefined) patch.deleteConfirmation = false;
    if (!data.errorHandling) patch.errorHandling = 'continue';
    if (data.showAdvanced === undefined) patch.showAdvanced = false;
    if (data.skipEmptyValues === undefined) patch.skipEmptyValues = true;

    if (op === 'create_task') {
      if (data.priority === undefined) patch.priority = 'medium';
      if (data.status === undefined) patch.status = 'not_started';
    }

    if (op === 'update_task') {
      if (data.updatePriority !== true && data.priority !== undefined) {
        patch.priority = undefined;
      }
      if (data.updateStatus !== true && data.status !== undefined) {
        patch.status = undefined;
      }
    }

    if (Object.keys(patch).length > 0) {
      updateNodeData(patch);
    }
  }, [data, id, updateNodeData]);

  const handleDelete = useCallback(() => {
    onDeleteNode(id);
  }, [id, onDeleteNode]);

  const handleDuplicate = useCallback(() => {
    onDuplicateNode(id);
  }, [id, onDuplicateNode]);

  const handleOperationChange = useCallback((value: string) => {
    const op = value as 'create_task' | 'update_task' | 'delete_task';
    if (op === 'update_task') {
      updateNodeData({
        operation: op,
        updatePriority: false,
        updateStatus: false,
        priority: undefined,
        status: undefined,
      });
    } else if (op === 'create_task') {
      updateNodeData({
        operation: op,
        priority: data.priority ?? 'medium',
        status: data.status ?? 'not_started',
        updatePriority: undefined,
        updateStatus: undefined,
      });
    } else {
      updateNodeData({
        operation: op,
        updatePriority: undefined,
        updateStatus: undefined,
      });
    }
  }, [updateNodeData, data.priority, data.status]);

  const handleSwitchChange = useCallback((field: keyof ManageTaskData) =>
    (checked: boolean) => {
      updateNodeData({ [field]: checked });
    }, [updateNodeData]);

  const getOperationTitle = () => {
    switch (data.operation) {
      case 'update_task': return t('flow_builder.update_task', 'Update Task');
      case 'delete_task': return t('flow_builder.delete_task', 'Delete Task');
      default: return t('flow_builder.create_task', 'Create Task');
    }
  };

  const getOperationDescription = () => {
    switch (data.operation) {
      case 'delete_task': return t('flow_builder.manage_task_description_delete', 'Permanently delete the task');
      case 'update_task': return t('flow_builder.manage_task_description_update', 'Update task fields for the current contact');
      default: return t('flow_builder.manage_task_description_create', 'Create a task linked to the current contact');
    }
  };

  const configuredFields = getConfiguredFields(data);
  const configurationProgress = calculateConfigurationProgress(data);

  const isReadyCompact = (() => {
    if (data.operation === 'create_task') return !!(data.title?.trim());
    if (data.operation === 'update_task') {
      return !!(data.taskIdVariable?.trim()) && configuredFields.length > 0;
    }
    return !!(data.taskIdVariable?.trim()) && !!data.deleteConfirmation;
  })();

  const statusCompactLabel = (() => {
    if (data.operation === 'delete_task' && !data.deleteConfirmation) {
      return t('flow_builder.confirmation_required', 'Confirmation required');
    }
    if (data.operation === 'create_task' && !(data.title?.trim())) {
      return t('flow_builder.setup_required', 'Setup required');
    }
    if (data.operation === 'update_task' && (!(data.taskIdVariable?.trim()) || configuredFields.length === 0)) {
      return t('flow_builder.setup_required', 'Setup required');
    }
    if (data.operation === 'delete_task' && !(data.taskIdVariable?.trim())) {
      return t('flow_builder.setup_required', 'Setup required');
    }
    return t('flow_builder.ready', 'Ready');
  })();

  return (
    <TooltipProvider>
      <div
        className={cn(
          "node-manage-task p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group relative",
          selected && ' shadow-lg'
        )}
      >
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
                <DialogContent data-tour="components-flow-builder-managetasknode.dialogcontent.flow_builder.manage_task_help_title" className="max-w-4xl max-h-[90vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ListTodo className="h-5 w-5 text-primary" />
                      {t('flow_builder.manage_task_help_title', 'Manage Task Node - Help & Documentation')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('flow_builder.manage_task_help_description', 'Learn how to create, update, or delete tasks linked to the current contact in your flows')}
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[70vh] pr-4">
                    <ManageTaskHelpContent t={t} />
                  </ScrollArea>
                </DialogContent>
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
                  onClick={handleDuplicate}
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
                  onClick={handleDelete}
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
          style={standardHandleStyle}
          isConnectable={isConnectable}
        />

        <div className="font-medium flex items-center gap-2 mb-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20">
                  <img
                    src={MANAGE_TASK_FLOW_NODE_ICON_SRC}
                    alt=""
                    className="w-4 h-4 object-contain"
                    draggable={false}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{getOperationTitle()}</p>
                <p className="text-xs text-muted-foreground">{getOperationDescription()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span>{getOperationTitle()}</span>

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
                    {configurationProgress === 100 ? t('flow_builder.fully_configured_ready', 'Fully configured and ready') : t('flow_builder.complete_configuration', 'Complete configuration for full functionality')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button data-tour="components-flow-builder-managetasknode.button.flow_builder.hide"
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

        <div className="text-sm p-2 bg-card rounded border border-border">
          <div className="flex items-center gap-1 mb-1">
            {data.operation !== 'create_task' ? (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        <Variable className="h-3 w-3 text-primary" />
                        <span className="font-medium text-primary truncate">
                          {data.taskIdVariable || taskIdPlaceholder}
                        </span>
                        {data.taskIdVariable?.trim() && (
                          <span className="text-xs text-primary font-medium">{'\u2713'}</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.task_id_variable', 'Task ID Variable')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('flow_builder.task_id_variable_target', 'Variable containing the task ID to update or delete')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-muted-foreground">•</span>
              </>
            ) : (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 min-w-0">
                        <ListTodo className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-medium text-primary truncate">
                          {data.title?.trim() || t('flow_builder.task_title_placeholder', 'Task title')}
                        </span>
                        {data.title?.trim() && (
                          <span className="text-xs text-primary font-medium">{'\u2713'}</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.task_title', 'Task title')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-muted-foreground">•</span>
              </>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {isReadyCompact ? (
                      <CheckCircle className="h-3 w-3 text-primary" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {statusCompactLabel}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {isReadyCompact
                      ? t('flow_builder.manage_task_compact_ready', 'Node is configured for this operation')
                      : t('flow_builder.manage_task_compact_incomplete', 'Complete required fields for this operation')}
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
                    {data.operation === 'create_task'
                      ? t('flow_builder.badge_create_task', '\u{1F4DD} Create')
                      : data.operation === 'update_task'
                        ? t('flow_builder.badge_update_task', '\u270F\uFE0F Update')
                        : t('flow_builder.badge_delete_task', '\u{1F5D1}\uFE0F Delete')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{getOperationTitle()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {(data.operation === 'create_task' || data.operation === 'update_task') && configuredFields.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {'\u{1F517}'} {configuredFields.length} {t('flow_builder.fields', 'fields')}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.configured_fields', 'Configured fields')}</p>
                    <p className="text-xs text-muted-foreground">
                      {configuredFields.map((f) => labelConfiguredManageTaskField(f, t)).join(', ')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {data.skipEmptyValues !== false && data.operation === 'update_task' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {t('flow_builder.badge_skip_empty', '\u23ED\uFE0F Skip empty')}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.skip_empty_values_enabled', 'Skip empty values enabled')}</p>
                    <p className="text-xs text-muted-foreground">{t('flow_builder.skip_empty_values_help', 'Prevents overwriting with empty data')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {data.deleteConfirmation && data.operation === 'delete_task' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {t('flow_builder.badge_confirmed', '\u2705 Confirmed')}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.delete_confirmation_enabled', 'Delete confirmation enabled')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="mt-3 text-xs space-y-3 border border-border rounded p-2 bg-card">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <ListTodo className="w-3 h-3" />
                {t('flow_builder.operation_type', 'Operation Type')}
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('flow_builder.manage_task_operation_type_help', 'Choose whether to create, update, or delete a task for the current contact')}</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={data.operation || 'create_task'}
                onValueChange={handleOperationChange}
              >
                <SelectTrigger data-tour="components-flow-builder-managetasknode.selecttrigger.flow_builder.select_operation" className="h-8">
                  <SelectValue placeholder={t('flow_builder.select_operation', 'Select operation')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_task">
                    <div className="flex items-center gap-2">
                      <ListTodo className="w-3 h-3" />
                      {t('flow_builder.create_task', 'Create Task')}
                    </div>
                  </SelectItem>
                  <SelectItem value="update_task">
                    <div className="flex items-center gap-2">
                      <Edit className="w-3 h-3" />
                      {t('flow_builder.update_task', 'Update Task')}
                    </div>
                  </SelectItem>
                  <SelectItem value="delete_task">
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-3 h-3" />
                      {t('flow_builder.delete_task', 'Delete Task')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(data.operation === 'update_task' || data.operation === 'delete_task') && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Variable className="w-3 h-3" />
                  {t('flow_builder.task_id_variable', 'Task ID Variable')}
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{t('flow_builder.task_id_variable_help', 'Variable containing the task ID to update or delete')}</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <EnhancedVariablePicker customVariables={customVariables}
                  value={data.taskIdVariable || ''}
                  onChange={(value) => updateNodeData({ taskIdVariable: value })}
                  placeholder={taskIdPlaceholder}
                  className="h-8"
                />
              </div>
            )}

            {(data.operation === 'create_task' || data.operation === 'update_task') && (
              <Collapsible open={true} onOpenChange={() => {}}>
                <CollapsibleTrigger asChild>
                  <Button data-tour="components-flow-builder-managetasknode.button.flow_builder.task_fields" variant="ghost" size="sm" className="w-full justify-between h-8">
                    <span className="text-xs flex items-center gap-1">
                      <Edit className="w-3 h-3" />
                      {t('flow_builder.task_fields', 'Task fields')}
                    </span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 mt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      {t('flow_builder.task_title', 'Title')}
                      {data.operation === 'create_task' && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.title || ''}
                      onChange={(value) => updateNodeData({ title: value })}
                      placeholder={t('flow_builder.task_title_picker_placeholder', 'Enter task title or {{variable}}')}
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.task_description', 'Description')}</Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.description || ''}
                      onChange={(value) => updateNodeData({ description: value })}
                      placeholder={t('flow_builder.enter_description', 'Enter description...')}
                      className="h-16"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.task_priority', 'Priority')}</Label>
                    <Select
                      value={
                        data.operation === 'update_task'
                          ? (data.updatePriority === true && data.priority ? data.priority : MANAGE_TASK_FIELD_OMIT)
                          : (data.priority || 'medium')
                      }
                      onValueChange={(value) => {
                        if (data.operation === 'update_task') {
                          if (value === MANAGE_TASK_FIELD_OMIT) {
                            updateNodeData({ updatePriority: false, priority: undefined });
                          } else {
                            updateNodeData({
                              updatePriority: true,
                              priority: value as NonNullable<ManageTaskData['priority']>,
                            });
                          }
                        } else {
                          updateNodeData({ priority: value as NonNullable<ManageTaskData['priority']> });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.operation === 'update_task' && (
                          <SelectItem value={MANAGE_TASK_FIELD_OMIT}>
                            {t('flow_builder.task_field_no_change', 'No change')}
                          </SelectItem>
                        )}
                        {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                          <SelectItem key={p} value={p}>
                            <div className="flex items-center gap-2">
                              <Flag className={cn('w-3 h-3', priorityFlagClass(p))} />
                              {t(
                                `flow_builder.task_priority_${p}`,
                                p === 'low' ? 'Low' : p === 'medium' ? 'Medium' : p === 'high' ? 'High' : 'Urgent'
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.task_status', 'Status')}</Label>
                    <Select
                      value={
                        data.operation === 'update_task'
                          ? (data.updateStatus === true && data.status ? data.status : MANAGE_TASK_FIELD_OMIT)
                          : (data.status || 'not_started')
                      }
                      onValueChange={(value) => {
                        if (data.operation === 'update_task') {
                          if (value === MANAGE_TASK_FIELD_OMIT) {
                            updateNodeData({ updateStatus: false, status: undefined });
                          } else {
                            updateNodeData({
                              updateStatus: true,
                              status: value as NonNullable<ManageTaskData['status']>,
                            });
                          }
                        } else {
                          updateNodeData({ status: value as NonNullable<ManageTaskData['status']> });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.operation === 'update_task' && (
                          <SelectItem value={MANAGE_TASK_FIELD_OMIT}>
                            {t('flow_builder.task_field_no_change', 'No change')}
                          </SelectItem>
                        )}
                        {(['not_started', 'in_progress', 'completed', 'cancelled'] as const).map((s) => (
                          <SelectItem key={s} value={s}>
                            {t(
                              `flow_builder.task_status_${s}`,
                              s === 'not_started'
                                ? 'Not started'
                                : s === 'in_progress'
                                  ? 'In progress'
                                  : s === 'completed'
                                    ? 'Completed'
                                    : 'Cancelled'
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {t('flow_builder.task_due_date', 'Due date')}
                    </Label>
                    <div className="flex gap-1 items-center w-full min-w-0">
                      <Input data-tour="components-flow-builder-managetasknode.input.flow_builder.task_due_date_placeholder"
                        value={data.dueDate || ''}
                        onChange={(e) => updateNodeData({ dueDate: e.target.value })}
                        placeholder={t('flow_builder.task_due_date_placeholder', 'YYYY-MM-DD')}
                        className="h-8 min-w-0 flex-1 font-mono text-xs"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button data-tour="components-flow-builder-managetasknode.button.flow_builder.task_due_date_pick"
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            title={t('flow_builder.task_due_date_pick', 'Pick date')}
                            aria-label={t('flow_builder.task_due_date_pick', 'Pick date')}
                          >
                            <Calendar className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <CalendarPicker
                            mode="single"
                            selected={parseDueDateForCalendar(data.dueDate || '')}
                            onSelect={(date) => {
                              if (date) {
                                updateNodeData({ dueDate: format(date, 'yyyy-MM-dd') });
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <Button data-tour="components-flow-builder-managetasknode.button.flow_builder.task_due_date_clear"
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        disabled={!data.dueDate?.trim()}
                        title={t('flow_builder.task_due_date_clear', 'Clear due date')}
                        aria-label={t('flow_builder.task_due_date_clear', 'Clear due date')}
                        onClick={() => updateNodeData({ dueDate: '' })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.task_assigned_to', 'Assigned to')}</Label>
                    <Select
                      disabled={isLoadingTeamMembers}
                      value={
                        data.assignedTo?.trim()
                          ? data.assignedTo
                          : MANAGE_TASK_ASSIGNED_UNASSIGNED
                      }
                      onValueChange={(value) =>
                        updateNodeData({
                          assignedTo: value === MANAGE_TASK_ASSIGNED_UNASSIGNED ? '' : value,
                        })
                      }
                    >
                      <SelectTrigger data-tour="components-flow-builder-managetasknode.selecttrigger.flow_builder.task_assignee_placeholder" className="h-8">
                        <SelectValue
                          placeholder={t('flow_builder.task_assignee_placeholder', 'Select team member')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MANAGE_TASK_ASSIGNED_UNASSIGNED}>
                          {t('tasks.unassigned', 'Unassigned')}
                        </SelectItem>
                        {teamMembers.map((m: { id: number; email: string; fullName: string }) => (
                          <SelectItem key={m.id} value={m.email}>
                            {m.fullName?.trim() || m.email}
                          </SelectItem>
                        ))}
                        {data.assignedTo?.trim() &&
                          !teamMembers.some(
                            (m: { email: string }) => m.email === data.assignedTo
                          ) && (
                            <SelectItem value={data.assignedTo}>
                              {t(
                                'flow_builder.task_assignee_custom_value',
                                'Custom value: {{value}}',
                                { value: data.assignedTo }
                              )}
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.task_category', 'Category')}</Label>
                    <Select
                      value={
                        data.category?.trim() ? data.category : MANAGE_TASK_CATEGORY_NONE
                      }
                      onValueChange={(value) =>
                        updateNodeData({
                          category: value === MANAGE_TASK_CATEGORY_NONE ? '' : value,
                        })
                      }
                    >
                      <SelectTrigger data-tour="components-flow-builder-managetasknode.selecttrigger.tasks.selectCategory" className="h-8">
                        <SelectValue
                          placeholder={t('tasks.selectCategory', 'Select category')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MANAGE_TASK_CATEGORY_NONE}>
                          {t('tasks.noCategory', 'No Category')}
                        </SelectItem>
                        {taskCategories.map((c: { id: number; name: string }) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                        {data.category?.trim() &&
                          !taskCategories.some(
                            (c: { name: string }) => c.name === data.category
                          ) && (
                            <SelectItem value={data.category}>
                              {t(
                                'flow_builder.task_category_custom_value',
                                'Custom value: {{value}}',
                                { value: data.category }
                              )}
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                  </div>

                  {configuredFields.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-2">
                        {t('flow_builder.configured_fields_summary', 'Configured fields:')}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {configuredFields.map((field) => (
                          <Badge key={field} variant="outline" className="text-xs">
                            {labelConfiguredManageTaskField(field, t)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {data.operation === 'delete_task' && (
              <div className="space-y-3">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-red-800 dark:text-red-200">
                        {t('flow_builder.manage_task_delete_warning', 'Warning: This will permanently delete the task')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={data.deleteConfirmation || false}
                    onCheckedChange={handleSwitchChange('deleteConfirmation')}
                  />
                  <Label className="text-xs">
                    {t('flow_builder.manage_task_delete_confirmation', 'I understand this will permanently delete the task')}
                  </Label>
                </div>
              </div>
            )}

            <Collapsible
              open={data.showAdvanced}
              onOpenChange={(open) => updateNodeData({ showAdvanced: open })}
            >
              <CollapsibleTrigger asChild>
                <Button data-tour="components-flow-builder-managetasknode.button.flow_builder.advanced_options" variant="ghost" size="sm" className="w-full justify-between h-8 text-muted-foreground">
                  <span className="text-xs">{t('flow_builder.advanced_options', 'Advanced Options')}</span>
                  {data.showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-2">
                {data.operation === 'update_task' && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.skip_empty_values', 'Skip empty values')}</Label>
                    <Switch
                      checked={data.skipEmptyValues !== undefined ? data.skipEmptyValues : true}
                      onCheckedChange={handleSwitchChange('skipEmptyValues')}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-medium">{t('flow_builder.error_handling', 'Error Handling')}</Label>
                  <Select
                    value={data.errorHandling || 'continue'}
                    onValueChange={(value) => updateNodeData({ errorHandling: value as 'continue' | 'stop' })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="continue">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          {t('flow_builder.continue_on_error', 'Continue on error')}
                        </div>
                      </SelectItem>
                      <SelectItem value="stop">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3 h-3 text-red-500" />
                          {t('flow_builder.stop_on_error', 'Stop on error')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="text-[10px] text-muted-foreground mt-2">
              <p>
                {t('flow_builder.manage_task_inline_help', 'The Manage Task node creates, updates, or deletes tasks when reached in the flow. The task is automatically linked to the current contact. Use variables like {{task.id}} to target specific tasks.')}
              </p>
            </div>
          </div>
        )}

        <Handle
          type="source"
          position={Position.Right}
          style={standardHandleStyle}
          isConnectable={isConnectable}
        />
      </div>
    </TooltipProvider>
  );
}

function ManageTaskHelpContent({ t }: { t: (key: string, fallback?: string, params?: Record<string, unknown>) => string }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_task_help_node_overview', 'Node Overview')}
        </h3>
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm text-foreground mb-2">
            {t('flow_builder.manage_task_help_overview_desc', 'The Manage Task node creates, updates, or deletes tasks when a contact reaches this step. Tasks are scoped to the current contact in the conversation so follow-ups stay organized.')}
          </p>
          <p className="text-sm text-foreground">
            {t('flow_builder.manage_task_help_key_benefits', 'Use it to open follow-ups from captured data, change status as the flow progresses, assign work to teammates, or remove tasks that are no longer needed.')}
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_task_help_operations', 'Operations')}
        </h3>
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <ListTodo className="h-3 w-3" />
              {t('flow_builder.create_task', 'Create Task')}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t('flow_builder.manage_task_help_create_desc', 'Creates a new task linked to the current contact. Set a title (required), then optionally description, priority, status, due date, assignee, and category.')}
            </p>
            <div className="bg-muted rounded p-2 text-xs font-mono whitespace-pre-wrap">
              {t(
                'flow_builder.manage_task_help_code_create',
                'title: {{captured.task_title}}\npriority: medium\nstatus: not_started'
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Edit className="h-3 w-3" />
              {t('flow_builder.update_task', 'Update Task')}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t('flow_builder.manage_task_help_update_desc', 'Updates an existing task. Provide a task ID variable (for example from a previous step). Only fields you configure are sent; use Skip empty values to avoid clearing data with blanks.')}
            </p>
            <div className="bg-muted rounded p-2 text-xs font-mono whitespace-pre-wrap">
              {t(
                'flow_builder.manage_task_help_code_update',
                'taskIdVariable: {{task.id}}\nstatus: completed'
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Trash2 className="h-3 w-3" />
              {t('flow_builder.delete_task', 'Delete Task')}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t('flow_builder.manage_task_help_delete_desc', 'Permanently deletes a task by ID. Enable the confirmation switch so the action is intentional.')}
            </p>
            <div className="bg-destructive/10 rounded p-2 text-xs">
              {t('flow_builder.manage_task_help_delete_enable', 'Enable “I understand this will permanently delete the task” before running delete in production flows.')}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_task_help_field_types', 'Field Types')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> {t('flow_builder.manage_task_help_standard_fields', 'Standard Fields')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_task_help_standard_fields_list', 'title, description, assignedTo')}</p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <Flag className="h-3 w-3" /> {t('flow_builder.manage_task_help_enum_fields', 'Enum Fields')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_task_help_enum_fields_list', 'priority (low, medium, high, urgent), status (not_started, in_progress, completed, cancelled)')}</p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {t('flow_builder.manage_task_help_date_fields', 'Date Fields')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_task_help_date_fields_desc', 'dueDate — calendar date in YYYY-MM-DD format')}</p>
          </div>
        </div>
      </section>

      <Separator />

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Variable className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_task_help_variable_system', 'Variable System')}
        </h3>
        <div className="space-y-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_task_help_using_variables', 'Using Variables')}</h4>
            <p className="text-xs text-foreground mb-2">
              {t('flow_builder.manage_task_help_variables_desc', 'Use placeholders so values come from the conversation or earlier nodes. Task ID is required for update and delete.')}
            </p>
            <div className="bg-card rounded p-2 text-xs font-mono space-y-1">
              <div><strong>{t('flow_builder.manage_task_help_examples', 'Examples')}</strong></div>
              <div>
                {t('flow_builder.manage_task_help_variable_example_task_id', 'taskIdVariable: {{task.id}}')}
              </div>
              <div>
                {t('flow_builder.manage_task_help_variable_example_title', 'title: {{captured.task_title}}')}
              </div>
              <div>
                {t('flow_builder.manage_task_help_variable_example_assigned', 'assignedTo: {{agent.name}}')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          {t('flow_builder.manage_task_help_config_options', 'Configuration Options')}
        </h3>
        <div className="space-y-3">
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
              <CheckCircle className="h-3 w-3 text-primary" />
              {t('flow_builder.skip_empty_values', 'Skip Empty Values')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('flow_builder.manage_task_help_skip_empty_desc', 'For updates, when enabled, empty fields are not sent so existing task values stay unchanged.')}
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-destructive" />
              {t('flow_builder.error_handling', 'Error Handling')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('flow_builder.manage_task_help_error_handling_desc', 'Continue on error keeps the flow running if the task action fails; Stop on error halts the flow for debugging.')}
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
              <Trash2 className="h-3 w-3 text-destructive" />
              {t('flow_builder.manage_task_help_delete_confirmation', 'Delete Confirmation')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('flow_builder.manage_task_help_delete_confirm_desc', 'Delete requires an explicit confirmation toggle to reduce accidental data loss.')}
            </p>
          </div>
        </div>
      </section>

      <Separator />

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_task_help_practical_examples', 'Practical Examples')}
        </h3>
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_task_help_example1_title', 'Example 1: Create a task from captured data')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono whitespace-pre-wrap">
                {t(
                  'flow_builder.manage_task_help_example1_code',
                  'operation: Create\ntitle: {{captured.task_title}}\ndueDate: 2026-04-20'
                )}
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_task_help_example1_desc', 'Place after Data Capture so titles and dates come from the user.')}</p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_task_help_example2_title', 'Example 2: Mark a task complete')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono whitespace-pre-wrap">
                {t(
                  'flow_builder.manage_task_help_example2_code',
                  'taskIdVariable: {{task.id}}\nstatus: completed'
                )}
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_task_help_example2_desc', 'Use when the flow reaches a success milestone.')}</p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_task_help_example3_title', 'Example 3: Assign a task to an agent')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono whitespace-pre-wrap">
                {t(
                  'flow_builder.manage_task_help_example3_code',
                  'taskIdVariable: {{task.id}}\nassignedTo: {{agent.name}}'
                )}
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_task_help_example3_desc', 'Hand off ownership after routing or escalation.')}</p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-destructive/10 border-destructive/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_task_help_example4_title', 'Example 4: Delete a completed task')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono whitespace-pre-wrap">
                {t(
                  'flow_builder.manage_task_help_example4_code',
                  'operation: Delete\ntaskIdVariable: {{task.id}}\nconfirmation: on'
                )}
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_task_help_example4_desc', 'Pair with a Condition so only the intended tasks are removed.')}</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_task_help_best_practices', 'Best Practices')}
        </h3>
        <div className="space-y-3">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2 text-primary">{t('flow_builder.manage_task_help_dos', "Do's")}</h4>
            <ul className="text-xs text-foreground space-y-1">
              <li>• {t('flow_builder.manage_task_help_do1', 'Store task IDs from earlier steps when you need to update or delete later')}</li>
              <li>• {t('flow_builder.manage_task_help_do2', 'Keep Skip empty values on for partial updates')}</li>
              <li>• {t('flow_builder.manage_task_help_do3', 'Test create and delete paths with a test contact first')}</li>
              <li>• {t('flow_builder.manage_task_help_do4', 'Use categories from settings for consistent reporting')}</li>
            </ul>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2 text-destructive">{t('flow_builder.manage_task_help_donts', "Don'ts")}</h4>
            <ul className="text-xs text-foreground space-y-1">
              <li>• {t('flow_builder.manage_task_help_dont1', 'Do not run delete without confirmation in live flows')}</li>
              <li>• {t('flow_builder.manage_task_help_dont2', 'Do not leave task ID blank for update or delete')}</li>
              <li>• {t('flow_builder.manage_task_help_dont3', 'Do not assume due dates without timezone context—use explicit ISO dates when possible')}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ManageTaskNode;
