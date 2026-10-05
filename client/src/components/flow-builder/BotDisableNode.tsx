import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useNodes, useReactFlow } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Copy, Pause, Loader2, Users, Eye, EyeOff, Phone } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { apiRequest } from '@/lib/queryClient';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useChannelConnections } from '@/hooks/useChannelConnections';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { standardHandleStyle } from './StyledHandle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { getFlowNodeVariablesFromNodes, useFlowVariables, getCategoryLabel, getCategoryIcon, type FlowVariable } from '@/hooks/useFlowVariables';
import {
  Variable,
  RefreshCw,
  User,
  Workflow,
  Database,
  Settings,
  Wrench,
} from 'lucide-react';

interface Agent {
  id: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  username: string;
  whatsappNumber?: string;
}



interface BotDisableNodeProps {
  id: string;
  data: {
    label: string;
    disableDuration?: string;
    customDuration?: number;
    customDurationUnit?: string;
    triggerMethod?: string;
    keyword?: string;
    caseSensitive?: boolean;
    assignToAgent?: string;
    autoAssignAgentIds?: number[];
    notifyAgent?: boolean;
    handoffMessage?: string;
    notifyChannelId?: string;
    /** When true, hides agent-assignment / notify-agent UI (used by End Conversation). */
    __hideAgentAssignment?: boolean;
  };
  isConnectable: boolean;
}

export function BotDisableNode({ id, data, isConnectable }: BotDisableNodeProps) {
  const { t } = useTranslation();
  const hideAgentAssignment = data.__hideAgentAssignment === true;
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [disableDuration, setDisableDuration] = useState(data.disableDuration || (hideAgentAssignment ? 'manual' : '30'));
  const [customDuration, setCustomDuration] = useState(data.customDuration || 60);
  const [customDurationUnit, setCustomDurationUnit] = useState(data.customDurationUnit || 'minutes');
  const [triggerMethod, setTriggerMethod] = useState(data.triggerMethod || 'always');
  const [keyword, setKeyword] = useState(data.keyword || 'agent');
  const [caseSensitive, setCaseSensitive] = useState(data.caseSensitive || false);
  const [assignToAgent, setAssignToAgent] = useState(data.assignToAgent || '');
  const [autoAssignAgentIds, setAutoAssignAgentIds] = useState<number[]>(data.autoAssignAgentIds || []);
  const [notifyAgent, setNotifyAgent] = useState(
    data.notifyAgent !== undefined ? data.notifyAgent : !hideAgentAssignment
  );
  const [handoffMessage, setHandoffMessage] = useState(
    data.handoffMessage ||
      (hideAgentAssignment
        ? t('flow_builder.end_conversation_default_final_message', 'This conversation is closed. Thanks!')
        : t('flow_builder.bot_disable_default_handoff_message', 'A customer is requesting human assistance.'))
  );
  const [notifyChannelId, setNotifyChannelId] = useState(data.notifyChannelId || '');
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const handoffTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const DURATION_OPTIONS = [
    { value: '5', label: t('flow_builder.bot_disable_5_minutes', '5 minutes') },
    { value: '15', label: t('flow_builder.bot_disable_15_minutes', '15 minutes') },
    { value: '30', label: t('flow_builder.bot_disable_30_minutes', '30 minutes') },
    { value: '60', label: t('flow_builder.bot_disable_1_hour', '1 hour') },
    { value: '120', label: t('flow_builder.bot_disable_2_hours', '2 hours') },
    { value: '240', label: t('flow_builder.bot_disable_4_hours', '4 hours') },
    { value: '480', label: t('flow_builder.bot_disable_8_hours', '8 hours') },
    { value: '1440', label: t('flow_builder.bot_disable_24_hours', '24 hours') },
    { value: 'manual', label: t('flow_builder.bot_disable_manual', 'Until manually re-enabled') },
    { value: 'custom', label: t('flow_builder.bot_disable_custom', 'Custom duration') }
  ];

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, customVariables } = useFlowContext();

  const canvasNodes = useNodes();
  const canvasOutputVariables = useMemo(() => getFlowNodeVariablesFromNodes(canvasNodes), [canvasNodes]);
  const {
    variables,
    capturedVariables,
    loading,
    error,
    fetchCapturedVariables,
  } = useFlowVariables(undefined, customVariables, canvasOutputVariables);

  const filteredVariables = variables.filter(variable =>
    variable.label.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.value.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, FlowVariable[]>);

  const getCategoryIconComponent = (category: FlowVariable['category']) => {
    switch (category) {
      case 'contact': return <User className="w-3 h-3" />;
      case 'message': return <InboxConversationIcon className="w-3 h-3" />;
      case 'system': return <Settings className="w-3 h-3" />;
      case 'flow': return <Workflow className="w-3 h-3" />;
      case 'captured': return <Database className="w-3 h-3" />;
      case 'custom': return <Wrench className="w-3 h-3" />;
      default: return <Variable className="w-3 h-3" />;
    }
  };

  const insertVariableIntoHandoff = (variable: string) => {
    const textarea = handoffTextareaRef.current;
    if (!textarea) {
      setHandoffMessage((prev) => `${prev || ''}{{${variable}}}`);
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const current = handoffMessage || '';
    const before = current.slice(0, start);
    const after = current.slice(end);
    const next = `${before}{{${variable}}}${after}`;
    setHandoffMessage(next);

    requestAnimationFrame(() => {
      const pos = start + variable.length + 4;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  const { data: agents = [], isLoading: isLoadingAgents, error: agentsError } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/agents');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch agents: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const { data: channelConnections = [] } = useChannelConnections();

  const whatsappChannels = channelConnections.filter((channel) =>
    (channel.channelType === 'whatsapp_unofficial' ||
      channel.channelType === 'whatsapp' ||
      channel.channelType === 'whatsapp_official') &&
    channel.status === 'active'
  );

  const availableAgents = [
    { id: 'auto', name: t('flow_builder.bot_disable_auto_assign', 'Auto-assign to available agent'), whatsappNumber: undefined as string | undefined },
    ...agents.map(agent => ({
      id: agent.id.toString(),
      name: `${agent.fullName} (${agent.role})`,
      whatsappNumber: agent.whatsappNumber,
    }))
  ];

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

  useEffect(() => {
    updateNodeData({
      disableDuration,
      customDuration,
      customDurationUnit,
      triggerMethod,
      keyword,
      caseSensitive,
      assignToAgent,
      autoAssignAgentIds,
      notifyAgent,
      handoffMessage,
      notifyChannelId,
      ...(hideAgentAssignment ? { __hideAgentAssignment: true } : {}),
    });
  }, [
    updateNodeData,
    disableDuration,
    customDuration,
    customDurationUnit,
    triggerMethod,
    keyword,
    caseSensitive,
    assignToAgent,
    autoAssignAgentIds,
    notifyAgent,
    handoffMessage,
    notifyChannelId,
    hideAgentAssignment,
  ]);

  const getDurationDisplay = () => {
    if (disableDuration === 'manual') {
      return 'Until manually re-enabled';
    } else if (disableDuration === 'custom') {
      return `${customDuration} ${customDurationUnit}`;
    } else {
      const option = DURATION_OPTIONS.find(opt => opt.value === disableDuration);
      return option?.label || '30 minutes';
    }
  };

  const getTriggerDisplay = () => {
    if (triggerMethod === 'keyword') {
      return `When "${keyword}" detected`;
    }
    return 'Always when executed';
  };

  return (
    <div className="node-bot-disable p-3 rounded-lg bg-card border border-border shadow-sm max-w-[420px] group">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
              <p className="text-xs">{t('flow_builder.bot_disable_duplicate_node', 'Duplicate node')}</p>
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
              <p className="text-xs">{t('flow_builder.bot_disable_delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src={hideAgentAssignment
            ? APP_ICONS.endConversation
            : APP_ICONS.agentHandoff}
          alt={hideAgentAssignment ? 'End Conversation' : 'Agent Handoff'} 
          className="h-4 w-4"
        />
        <span>
          {hideAgentAssignment
            ? t('flow_builder.end_conversation_node_title', 'End Conversation')
            : t('flow_builder.bot_disable_node_title', 'Agent Handoff')}
        </span>
       <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    Edit
                  </>
                )}
              </button>
      </div>

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <Pause className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-primary">
            {hideAgentAssignment
              ? t('flow_builder.end_conversation_summary', 'End Conversation')
              : t('flow_builder.bot_disable_disable_bot', 'Disable Bot')}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {getDurationDisplay()}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
            {getTriggerDisplay()}
          </span>
          {!hideAgentAssignment && assignToAgent && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {assignToAgent === 'auto' && autoAssignAgentIds.length > 0
                ? t('flow_builder.bot_disable_auto_assign_badge', 'Auto ({{count}} agents)', { count: autoAssignAgentIds.length })
                : availableAgents.find(a => a.id === assignToAgent)?.name.split(' ')[0] || t('flow_builder.bot_disable_agent_badge', 'Agent')}
            </span>
          )}
          {!hideAgentAssignment && notifyAgent && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.bot_disable_notify_agent_badge', 'Notify Agent')}
            </span>
          )}
          {hideAgentAssignment && handoffMessage && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.end_conversation_final_message_badge', 'Final Message')}
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <Label className="block mb-2 font-medium">
              {t('flow_builder.bot_disable_trigger_method', 'Trigger Method')}
            </Label>
            <RadioGroup
              value={triggerMethod}
              onValueChange={setTriggerMethod}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="always" id="always" />
                <Label htmlFor="always" className="text-xs">
                  {t('flow_builder.bot_disable_trigger_always', 'Always disable when this node executes')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keyword" id="keyword" />
                <Label htmlFor="keyword" className="text-xs">
                  {t('flow_builder.bot_disable_trigger_keyword', 'Disable only when specific keyword is detected')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {triggerMethod === 'keyword' && (
            <div className="space-y-2 pt-2 border-t">
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.bot_disable_trigger_keyword_label', 'Trigger Keyword')}
                </Label>
                <Input data-tour="components-flow-builder-botdisablenode.input.flow_builder.bot_disable_trigger_keyword_placeholder"
                  placeholder={t('flow_builder.bot_disable_trigger_keyword_placeholder', 'e.g., agent, human, help')}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="case-sensitive"
                  checked={caseSensitive}
                  onCheckedChange={setCaseSensitive}
                />
                <Label htmlFor="case-sensitive" className="text-xs">
                  {t('flow_builder.bot_disable_case_sensitive', 'Case sensitive matching')}
                </Label>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Label className="block mb-1 font-medium">
              {t('flow_builder.bot_disable_duration_label', 'Disable Duration')}
            </Label>
            <Select
              value={disableDuration}
              onValueChange={setDisableDuration}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select duration..." />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {disableDuration === 'custom' && (
              <div className="flex gap-2">
                <NumberInput
                  value={customDuration}
                  onChange={setCustomDuration}
                  fallbackValue={1}
                  min={1}
                  className="text-xs h-7 flex-1"
                />
                <Select
                  value={customDurationUnit}
                  onValueChange={setCustomDurationUnit}
                >
                  <SelectTrigger className="text-xs h-7 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">min</SelectItem>
                    <SelectItem value="hours">hrs</SelectItem>
                    <SelectItem value="days">days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {hideAgentAssignment ? (
            <div className="space-y-2 pt-2 border-t">
              <Label className="block mb-1 font-medium">
                {t('flow_builder.end_conversation_final_message_label', 'Final Message')}
              </Label>
              <div className="flex gap-2">
                <Textarea data-tour="components-flow-builder-botdisablenode.textarea.flow_builder.end_conversation_final_message_placeholder"
                  ref={handoffTextareaRef}
                  placeholder={t(
                    'flow_builder.end_conversation_final_message_placeholder',
                    'Optional message to send before ending the conversation'
                  )}
                  value={handoffMessage}
                  onChange={(e) => setHandoffMessage(e.target.value)}
                  className="text-xs min-h-[80px] resize-y font-mono flex-1"
                />
                <Popover open={variablePickerOpen} onOpenChange={setVariablePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 flex items-center gap-1"
                      type="button"
                      title="Insert variable"
                    >
                      <Variable className="w-3 h-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <Command>
                      <div className="flex items-center gap-2 p-2 border-b">
                        <CommandInput
                          placeholder="Search variables..."
                          value={searchValue}
                          onValueChange={setSearchValue}
                          className="flex-1"
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={fetchCapturedVariables}
                                disabled={loading}
                              >
                                {loading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Refresh captured variables</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      <CommandList>
                        <CommandEmpty>
                          {error ? (
                            <div className="text-center py-4">
                              <p className="text-xs text-destructive">Error loading variables</p>
                              <p className="text-xs text-muted-foreground">{error}</p>
                            </div>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-xs">No variables found.</p>
                            </div>
                          )}
                        </CommandEmpty>

                        {Object.entries(groupedVariables).map(([category, categoryVariables]) => (
                          <CommandGroup
                            key={category}
                            heading={
                              <div className="flex items-center gap-2">
                                <span>{getCategoryIcon(category as FlowVariable['category'])}</span>
                                <span>{getCategoryLabel(category as FlowVariable['category'])}</span>
                                {category === 'captured' && capturedVariables.length > 0 && (
                                  <Badge variant="secondary" className="text-[9px] px-1">
                                    {capturedVariables.length}
                                  </Badge>
                                )}
                              </div>
                            }
                          >
                            {categoryVariables.map((variable) => (
                              <CommandItem
                                key={variable.value}
                                value={variable.value}
                                onSelect={() => insertVariableIntoHandoff(variable.value)}
                                className="flex items-center gap-3 p-3"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {getCategoryIconComponent(variable.category)}
                                  <div className="flex-1">
                                    <div className="font-medium text-xs">{variable.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {variable.description}
                                    </div>
                                    {variable.dataType && (
                                      <div className="text-[10px] text-primary font-mono">
                                        {variable.dataType}
                                      </div>
                                    )}
                                  </div>
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {`{{${variable.value}}}`}
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {t(
                  'flow_builder.bot_disable_variable_syntax_help',
                  'Use {{variable}} syntax for dynamic values'
                )}
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-2 pt-2 border-t">
            <Label className="block mb-1 font-medium">Agent Assignment</Label>
            <Select
              value={assignToAgent}
              onValueChange={setAssignToAgent}
              disabled={isLoadingAgents}
            >
                  <SelectTrigger data-tour="components-flow-builder-botdisablenode.selecttrigger.flow_builder.bot_disable_loading_agents" className="text-xs h-7">
                    <SelectValue
                      placeholder={
                        isLoadingAgents
                          ? t('flow_builder.bot_disable_loading_agents', 'Loading agents...')
                          : t('flow_builder.bot_disable_select_agent', 'Select agent...')
                      }
                    />
              </SelectTrigger>
              <SelectContent>
                {isLoadingAgents ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center">
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      {t('flow_builder.bot_disable_loading_agents', 'Loading agents...')}
                    </div>
                  </SelectItem>
                ) : agentsError ? (
                  <SelectItem value="error" disabled>
                    <div className="flex items-center">
                      <Users className="h-3 w-3 mr-2" />
                      {t('flow_builder.bot_disable_error_loading_agents', 'Error loading agents')}
                    </div>
                  </SelectItem>
                ) : availableAgents.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    <div className="flex items-center">
                      <Users className="h-3 w-3 mr-2" />
                      {t('flow_builder.bot_disable_no_agents', 'No agents available')}
                    </div>
                  </SelectItem>
                ) : (
                  availableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.whatsappNumber && (
                        <Phone className="h-3 w-3 text-green-500 inline ml-1" />
                      )}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {assignToAgent === 'auto' && (
              <div className="space-y-2 mt-2 pl-1">
                <div>
                  <Label className="block text-xs font-medium">
                    {t('flow_builder.bot_disable_auto_assign_agents_label', 'Agents included in auto-assignment')}
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t(
                      'flow_builder.bot_disable_auto_assign_agents_help',
                      'Leave all unchecked to include every eligible agent.'
                    )}
                  </p>
                </div>
                {isLoadingAgents ? (
                  <div className="flex items-center text-xs text-muted-foreground py-1">
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    {t('flow_builder.bot_disable_loading_agents', 'Loading agents...')}
                  </div>
                ) : agentsError ? (
                  <div className="flex items-center text-xs text-muted-foreground py-1">
                    <Users className="h-3 w-3 mr-2" />
                    {t('flow_builder.bot_disable_error_loading_agents', 'Error loading agents')}
                  </div>
                ) : agents.length === 0 ? (
                  <div className="flex items-center text-xs text-muted-foreground py-1">
                    <Users className="h-3 w-3 mr-2" />
                    {t('flow_builder.bot_disable_no_agents', 'No agents available')}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1">
                      <Button data-tour="components-flow-builder-botdisablenode.button.flow_builder.bot_disable_auto_assign_select_all"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        type="button"
                        onClick={() => setAutoAssignAgentIds(agents.map(a => a.id))}
                      >
                        {t('flow_builder.bot_disable_auto_assign_select_all', 'Select all')}
                      </Button>
                      <Button data-tour="components-flow-builder-botdisablenode.button.flow_builder.bot_disable_auto_assign_clear"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        type="button"
                        onClick={() => setAutoAssignAgentIds([])}
                      >
                        {t('flow_builder.bot_disable_auto_assign_clear', 'Clear')}
                      </Button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 border rounded p-2">
                      {agents.map((agent) => (
                        <div key={agent.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`auto-assign-agent-${id}-${agent.id}`}
                            checked={autoAssignAgentIds.includes(agent.id)}
                            onCheckedChange={(checked) => {
                              setAutoAssignAgentIds((prev) =>
                                checked
                                  ? [...prev, agent.id]
                                  : prev.filter((agentId) => agentId !== agent.id)
                              );
                            }}
                          />
                          <Label
                            htmlFor={`auto-assign-agent-${id}-${agent.id}`}
                            className="text-xs cursor-pointer"
                          >
                            {agent.fullName} ({agent.role})
                          </Label>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="notify-agent"
                checked={notifyAgent}
                onCheckedChange={setNotifyAgent}
              />
              <Label htmlFor="notify-agent" className="text-xs font-medium">
                {t('flow_builder.bot_disable_notify_assigned_agent', 'Notify assigned agent')}
              </Label>
            </div>

            {notifyAgent && (
              <div className="space-y-2 mt-2">
                <div>
                  <Label className="block mb-1 text-xs">
                    {t('flow_builder.bot_disable_handoff_message_label', 'Handoff Message')}
                  </Label>
                  <div className="flex gap-2">
                    <Textarea data-tour="components-flow-builder-botdisablenode.textarea.flow_builder.bot_disable_handoff_message_placeholder"
                      ref={handoffTextareaRef}
                      placeholder={t(
                        'flow_builder.bot_disable_handoff_message_placeholder',
                        'Message to send to agent'
                      )}
                      value={handoffMessage}
                      onChange={(e) => setHandoffMessage(e.target.value)}
                      className="text-xs min-h-[80px] resize-y font-mono flex-1"
                    />
                    <Popover open={variablePickerOpen} onOpenChange={setVariablePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 flex items-center gap-1"
                          type="button"
                          title="Insert variable"
                        >
                          <Variable className="w-3 h-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <Command>
                          <div className="flex items-center gap-2 p-2 border-b">
                            <CommandInput
                              placeholder="Search variables..."
                              value={searchValue}
                              onValueChange={setSearchValue}
                              className="flex-1"
                            />
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={fetchCapturedVariables}
                                    disabled={loading}
                                  >
                                    {loading ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3 h-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs">Refresh captured variables</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <CommandList>
                            <CommandEmpty>
                              {error ? (
                                <div className="text-center py-4">
                                  <p className="text-xs text-destructive">Error loading variables</p>
                                  <p className="text-xs text-muted-foreground">{error}</p>
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <p className="text-xs">No variables found.</p>
                                </div>
                              )}
                            </CommandEmpty>

                            {Object.entries(groupedVariables).map(([category, categoryVariables]) => (
                              <CommandGroup
                                key={category}
                                heading={
                                  <div className="flex items-center gap-2">
                                    <span>{getCategoryIcon(category as FlowVariable['category'])}</span>
                                    <span>{getCategoryLabel(category as FlowVariable['category'])}</span>
                                    {category === 'captured' && capturedVariables.length > 0 && (
                                      <Badge variant="secondary" className="text-[9px] px-1">
                                        {capturedVariables.length}
                                      </Badge>
                                    )}
                                  </div>
                                }
                              >
                                {categoryVariables.map((variable) => (
                                  <CommandItem
                                    key={variable.value}
                                    value={variable.value}
                                    onSelect={() => insertVariableIntoHandoff(variable.value)}
                                    className="flex items-center gap-3 p-3"
                                  >
                                    <div className="flex items-center gap-2 flex-1">
                                      {getCategoryIconComponent(variable.category)}
                                      <div className="flex-1">
                                        <div className="font-medium text-xs">{variable.label}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {variable.description}
                                        </div>
                                        {variable.dataType && (
                                          <div className="text-[10px] text-primary font-mono">
                                            {variable.dataType}
                                          </div>
                                        )}
                                      </div>
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        {`{{${variable.value}}}`}
                                      </Badge>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {t(
                      'flow_builder.bot_disable_variable_syntax_help',
                      'Use {{variable}} syntax for dynamic values'
                    )}
                  </div>
                </div>

                <div>
                  <Label className="block mb-1 text-xs">
                    {t('flow_builder.bot_disable_whatsapp_channel_label', 'WhatsApp Channel')}
                  </Label>
                  <Select
                    value={notifyChannelId}
                    onValueChange={setNotifyChannelId}
                  >
                    <SelectTrigger data-tour="components-flow-builder-botdisablenode.selecttrigger.flow_builder.bot_disable_whatsapp_channel_placeholder" className="text-xs h-7">
                      <SelectValue
                        placeholder={t(
                          'flow_builder.bot_disable_whatsapp_channel_placeholder',
                          'Select WhatsApp channel...'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {whatsappChannels.length === 0 ? (
                        <SelectItem value="none" disabled>
                          {t(
                            'flow_builder.bot_disable_no_whatsapp_channels',
                            'No active WhatsApp channels'
                          )}
                        </SelectItem>
                      ) : (
                        whatsappChannels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id.toString()}>
                            {channel.accountName} ({channel.channelType})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          </>
          )}
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
