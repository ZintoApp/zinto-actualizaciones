import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useNodes, useReactFlow } from 'reactflow';
import {
  Trash2,
  Copy,
  Settings,
  Eye,
  EyeOff,
  Variable,
  Loader2,
  RefreshCw,
  User,
  Workflow,
  Database,
  Wrench,
} from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { FLOW_DEFAULT_SOURCE_HANDLE_ID, FLOW_DEFAULT_TARGET_HANDLE_ID } from './flowHandleIds';
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { getFlowNodeVariablesFromNodes, useFlowVariables, getCategoryLabel, getCategoryIcon, type FlowVariable } from '@/hooks/useFlowVariables';
import { useChannelConnections } from '@/hooks/useChannelConnections';

const ALLOWED_CONTACT_NOTIFICATION_CHANNEL_TYPES = new Set([
  'whatsapp_official',
  'whatsapp_unofficial',
  'telegram',
  'twilio_sms',
]);

function contactNotificationChannelIcon(channelType: string) {
  switch (channelType) {
    case 'whatsapp_official':
    case 'whatsapp_unofficial':
      return <i className="ri-whatsapp-line shrink-0" />;
    case 'telegram':
      return <i className="ri-telegram-line shrink-0" />;
    case 'twilio_sms':
      return <InboxConversationIcon className="h-4 w-4 shrink-0" />;
    default:
      return <InboxConversationIcon className="h-4 w-4 shrink-0" />;
  }
}

interface ContactNotificationNodeData {
  label: string;
  phoneNumber: string;
  channelConnectionId?: number | null;
  channelType?: string | null;
  messageContent: string;
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
}

interface ContactNotificationNodeProps {
  id: string;
  data: ContactNotificationNodeData;
  isConnectable: boolean;
}

export function ContactNotificationNode({ id, data, isConnectable }: ContactNotificationNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [phoneNumber, setPhoneNumber] = useState(data.phoneNumber || '');
  const [messageContent, setMessageContent] = useState(data.messageContent || '');
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    data.channelConnectionId ?? null
  );
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const messageTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const userClearedChannelRef = React.useRef(false);
  const skipLegacyChannelAutoMapRef = React.useRef(false);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, customVariables } = useFlowContext();

  const { data: allConnections = [] } = useChannelConnections();

  const availableChannels = useMemo(
    () =>
      allConnections.filter(
        (c) =>
          c.status === 'active' &&
          ALLOWED_CONTACT_NOTIFICATION_CHANNEL_TYPES.has(c.channelType)
      ),
    [allConnections]
  );

  const selectedConnection = useMemo(
    () => availableChannels.find((c) => c.id === selectedChannelId) ?? null,
    [availableChannels, selectedChannelId]
  );

  const canvasNodes = useNodes();
  const canvasOutputVariables = useMemo(() => getFlowNodeVariablesFromNodes(canvasNodes), [canvasNodes]);
  const {
    variables,
    capturedVariables,
    loading,
    error,
    fetchCapturedVariables,
    getVariablesByCategory
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
    setSelectedChannelId(data.channelConnectionId ?? null);
  }, [data.channelConnectionId]);

  useEffect(() => {
    if (data.channelConnectionId != null && data.channelConnectionId !== undefined) {
      return;
    }
    const legacyType = data.channelType;
    if (
      !legacyType ||
      typeof legacyType !== 'string' ||
      !ALLOWED_CONTACT_NOTIFICATION_CHANNEL_TYPES.has(legacyType)
    ) {
      return;
    }
    if (selectedChannelId != null) return;
    if (availableChannels.length === 0) return;
    if (skipLegacyChannelAutoMapRef.current) return;
    const first = availableChannels.find((c) => c.channelType === legacyType);
    if (first) {
      setSelectedChannelId(first.id);
    }
  }, [data.channelConnectionId, data.channelType, availableChannels, selectedChannelId]);

  useEffect(() => {
    const conn =
      availableChannels.find((c) => c.id === selectedChannelId) ?? null;
    const updates: Record<string, unknown> = {
      phoneNumber,
      messageContent,
      channelConnectionId: selectedChannelId,
    };
    if (selectedChannelId != null) {
      updates.channelType = conn?.channelType ?? null;
    } else if (userClearedChannelRef.current) {
      updates.channelType = null;
      userClearedChannelRef.current = false;
    }
    updateNodeData(updates);
  }, [
    updateNodeData,
    phoneNumber,
    messageContent,
    selectedChannelId,
    availableChannels,
  ]);

  const channelTypeLabel = (raw: string) => {
    const map: Record<string, string> = {
      whatsapp_official: 'WhatsApp Official',
      whatsapp_unofficial: 'WhatsApp',
      telegram: 'Telegram',
      twilio_sms: 'Twilio SMS',
    };
    return map[raw] ?? raw;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageContent(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  };

  const insertVariableIntoMessage = (variableValue: string) => {
    const currentValue = messageContent || '';
    const beforeCursor = currentValue.substring(0, cursorPosition);
    const afterCursor = currentValue.substring(cursorPosition);
    const newValue = `${beforeCursor}{{${variableValue}}}${afterCursor}`;
    
    setMessageContent(newValue);
    setVariablePickerOpen(false);
    
    // Set cursor position after the inserted variable
    setTimeout(() => {
      if (messageTextareaRef.current) {
        const newCursorPos = beforeCursor.length + variableValue.length + 4;
        messageTextareaRef.current.focus();
        messageTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      }
    }, 0);
  };

  return (
    <div
      className={`node-contact-notification p-3 rounded-lg bg-card border border-border shadow-sm group transition-[max-width,width] duration-200 ${
        isEditing ? 'min-w-[380px] w-[520px] max-w-[560px]' : 'w-fit max-w-[320px]'
      }`}
    >
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

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src={APP_ICONS.contactNotification}
          alt="Contact Notification" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.contact_notification', 'Contact Notification')}</span>
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

      <div className="text-sm p-2 rounded border border-border min-w-0">
        <div className="flex items-center gap-1 mb-1 min-w-0">
          {selectedConnection ? (
            <>
              {contactNotificationChannelIcon(selectedConnection.channelType)}
              <span className="text-xs truncate min-w-0">{selectedConnection.accountName}</span>
            </>
          ) : (
            <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 px-1 py-0.5 rounded">
              {t(
                'flow_builder.contact_notification.no_channel_selected',
                'No channel selected'
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 mb-1 min-w-0">
          <Settings className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">•</span>
          <span className="text-xs text-muted-foreground truncate min-w-0">
            {phoneNumber || t('flow_builder.phone_number_placeholder', 'No phone number')}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {messageContent && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.message_configured', 'Message configured')}
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <Label className="block mb-1 font-medium">
              {t('flow_builder.contact_notification.channel_label', 'Channel')}
            </Label>
            {availableChannels.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">
                {t(
                  'flow_builder.contact_notification.no_channels',
                  'No compatible active channels found. Connect WhatsApp, Telegram, or Twilio SMS in Settings.'
                )}
              </p>
            ) : (
              <select data-tour="components-flow-builder-contactnotificationnode.select.flow_builder.contact_notification.channel_placeholder"
                className="w-full p-2 text-xs border rounded bg-background"
                value={selectedChannelId ?? ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    userClearedChannelRef.current = true;
                    skipLegacyChannelAutoMapRef.current = true;
                    setSelectedChannelId(null);
                  } else {
                    userClearedChannelRef.current = false;
                    setSelectedChannelId(Number(e.target.value));
                  }
                }}
              >
                <option value="">
                  {t(
                    'flow_builder.contact_notification.channel_placeholder',
                    'Select a channel…'
                  )}
                </option>
                {availableChannels.map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.accountName} ({channelTypeLabel(conn.channelType)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.phone_number', 'Phone Number')}</Label>
            <EnhancedVariablePicker customVariables={customVariables}
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="{{contact.phone}}"
              className="h-7"
            />
          </div>


          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.message_content', 'Message Content')}</Label>
            <div className="flex gap-2">
              <Textarea data-tour="components-flow-builder-contactnotificationnode.textarea.flow_builder.message_placeholder"
                ref={messageTextareaRef}
                value={messageContent}
                onChange={handleTextareaChange}
                onSelect={handleTextareaSelect}
                onKeyUp={handleTextareaSelect}
                onClick={handleTextareaSelect}
                placeholder={t('flow_builder.message_placeholder', 'Enter your message...')}
                className="text-xs min-h-[80px] resize-y font-mono flex-1"
              />
              <Popover open={variablePickerOpen} onOpenChange={setVariablePickerOpen}>
                <PopoverTrigger asChild>
                  <Button data-tour="components-flow-builder-contactnotificationnode.button.flow_builder.insert_variable"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 flex items-center gap-1"
                    type="button"
                    title={t('flow_builder.insert_variable', 'Insert variable')}
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
                              onSelect={() => insertVariableIntoMessage(variable.value)}
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
              {t('flow_builder.variable_syntax_help', 'Use {{variable}} syntax for dynamic values')}
            </div>
          </div>

        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id={FLOW_DEFAULT_TARGET_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

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
