import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useNodes, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FileUpload } from '@/components/ui/file-upload';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Clock,
  Calendar,
  Image,
  Video,
  FileAudio,
  FileText,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ShieldAlert,
  HelpCircle,
  X,
  Info,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, dialogCloseButtonClassName } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { standardHandleStyle } from '../StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { toast } from '@/hooks/use-toast';
import { useFlowContext } from '../../../pages/flow-builder';
import { TimezoneSelector } from '@/components/ui/timezone-selector';
import { getBrowserTimezone } from '@/utils/timezones';
import { getFlowNodeVariablesFromNodes } from '@/hooks/useFlowVariables';

interface FollowUpNodeData {
  label: string;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
  messageContent: string;
  mediaUrl?: string;
  caption?: string;
  templateId?: number;
  triggerEvent: 'conversation_start' | 'specific_datetime' | 'relative_delay';
  delayAmount: number;
  delayUnit: 'minutes' | 'hours' | 'days' | 'weeks';
  specificDatetime?: string;
  timezone?: string;
  maxRetries: number;
  cancelOnUserResponse?: boolean;
  cancelCondition?: 'any_message' | 'specific_topic' | 'none';
}

interface FollowUpNodeProps {
  id: string;
  data: FollowUpNodeData;
  isConnectable: boolean;
}

export function FollowUpNode({ id, data, isConnectable }: FollowUpNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [messageType, setMessageType] = useState(data.messageType || 'text');
  const [messageContent, setMessageContent] = useState(data.messageContent || '');
  const [mediaUrl, setMediaUrl] = useState(data.mediaUrl || '');
  const [caption, setCaption] = useState(data.caption || '');
  const [templateId, setTemplateId] = useState(data.templateId);
  const [triggerEvent, setTriggerEvent] = useState(data.triggerEvent || 'conversation_start');
  const [delayAmount, setDelayAmount] = useState(data.delayAmount || 1);
  const [delayUnit, setDelayUnit] = useState(data.delayUnit || 'hours');
  const [specificDatetime, setSpecificDatetime] = useState(data.specificDatetime || '');
  const [timezone, setTimezone] = useState(data.timezone || getBrowserTimezone());
  const [maxRetries, setMaxRetries] = useState(data.maxRetries || 3);
  const [cancelOnUserResponse, setCancelOnUserResponse] = useState(data.cancelOnUserResponse || false);
  const [cancelCondition, setCancelCondition] = useState(data.cancelCondition || 'none');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const flowNodes = useNodes();
  const canvasOutputVariables = useMemo(() => getFlowNodeVariablesFromNodes(flowNodes), [flowNodes]);

  const availableVariables = useMemo(() => [
    { name: "contact.name", description: t('flow_builder.var_contact_name', "Contact's name") },
    { name: "contact.phone", description: t('flow_builder.var_contact_phone', "Contact's phone number") },
    { name: "contact.email", description: t('flow_builder.var_contact_email', "Contact's email address") },
    { name: "message.content", description: t('flow_builder.var_message_content', "Received message content") },
    { name: "date.today", description: t('flow_builder.var_date_today', "Current date") },
    { name: "time.now", description: t('flow_builder.var_time_now', "Current time") },
    { name: "availability", description: t('flow_builder.var_availability', "Google Calendar availability data from previous node") },
    ...canvasOutputVariables.map((variable) => ({ name: variable.value, description: variable.description })),
  ], [canvasOutputVariables, t]);

  const defaultTemplates = {
    text: t('flow_builder.followup_default_text_template', "Thank you for your interest! How can we help you further?")
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
    updateNodeData({
      messageType,
      messageContent,
      mediaUrl,
      caption,
      templateId,
      triggerEvent,
      delayAmount,
      delayUnit,
      specificDatetime,
      timezone,
      maxRetries,
      cancelOnUserResponse,
      cancelCondition
    });
  }, [
    updateNodeData,
    messageType,
    messageContent,
    mediaUrl,
    caption,
    templateId,
    triggerEvent,
    delayAmount,
    delayUnit,
    specificDatetime,
    timezone,
    maxRetries,
    cancelOnUserResponse,
    cancelCondition
  ]);

  const getMessageTypeIcon = () => {
    switch (messageType) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'audio': return <FileAudio className="h-4 w-4" />;
      case 'document': return <FileText className="h-4 w-4" />;
      default: return <InboxConversationIcon className="h-4 w-4" />;
    }
  };

  const getTriggerEventLabel = () => {
    switch (triggerEvent) {
      case 'conversation_start': return t('flow_builder.conversation_start', 'Conversation Start');
      case 'specific_datetime': return t('flow_builder.specific_datetime', 'Specific Date/Time');
      case 'relative_delay': return t('flow_builder.relative_delay', 'Relative Delay');
      default: return t('flow_builder.conversation_start', 'Conversation Start');
    }
  };

  const getDelayDisplay = () => {
    if (triggerEvent === 'specific_datetime') {
      return specificDatetime ?
        new Date(specificDatetime).toLocaleString() :
        t('flow_builder.no_date_set', 'No date set');
    }
    return `${delayAmount} ${delayUnit}`;
  };



  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setMediaUrl(response.url);
          toast({
            title: t('common.upload_complete', 'Upload complete'),
            description: t('flow_builder.media_uploaded_successfully', 'Media uploaded successfully')
          });
        } else {
          toast({
            title: t('common.upload_failed', 'Upload failed'),
            description: t('flow_builder.error_uploading_media', 'There was an error uploading your media'),
            variant: 'destructive'
          });
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        toast({
          title: t('common.upload_failed', 'Upload failed'),
          description: t('flow_builder.error_uploading_media', 'There was an error uploading your media'),
          variant: 'destructive'
        });
      };

      xhr.send(formData);
    } catch (error) {
      setIsUploading(false);
      toast({
        title: t('common.upload_failed', 'Upload failed'),
        description: t('flow_builder.error_uploading_media', 'There was an error uploading your media'),
        variant: 'destructive'
      });
    }
  };

  const getFileType = () => {
    switch (messageType) {
      case 'image': return 'image/*';
      case 'video': return 'video/*';
      case 'audio': return 'audio/*';
      case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar';
      default: return '*/*';
    }
  };

  const insertVariableIntoMessage = (variable: string) => {
    const textArea = document.getElementById(`followup-message-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newMessage = messageContent.substring(0, cursorPos) + variableText + messageContent.substring(cursorPos);

    setMessageContent(newMessage);

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const insertVariableIntoCaption = (variable: string) => {
    const textArea = document.getElementById(`followup-caption-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newCaption = caption.substring(0, cursorPos) + variableText + caption.substring(cursorPos);

    setCaption(newCaption);

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const applyTemplate = () => {
    if (messageType === 'text') {
      setMessageContent(defaultTemplates.text);
    }
  };



  return (
    <div className="node-follow-up rounded-lg bg-card border border-orange-200 dark:border-orange-900 shadow-sm min-w-[380px] max-w-[480px] group relative">
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
                <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      {t('flow_builder.followup_help_title', 'Follow-Up Node - Help & Documentation')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('flow_builder.followup_help_description', 'Learn how to effectively schedule and manage automated follow-up messages')}
                    </DialogDescription>
                  </DialogHeader>
                  <FollowUpHelpContent />
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

      <div className="p-3 border-b border-orange-100 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-900/10">
        <div className="font-medium flex items-center gap-2">
          <img src={APP_ICONS.followUpMessage} alt="Follow-up Message" className="h-4 w-4" />
          <span>{t('flow_builder.follow_up_message', 'Follow-up Message')}</span>
        <button data-tour="components-flow-builder-nodes-followupnode.button.common.hide"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {t('common.hide', 'Hide')}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t('common.edit', 'Edit')}
                  </>
                )}
              </button>
        </div>
      </div>

      <div className={`${isEditing ? 'max-h-[500px]' : 'max-h-[200px]'} overflow-y-auto custom-scrollbar`}>
        <div className="p-3 space-y-3">

          {!isEditing && (
            <div className="flex flex-wrap gap-2 mb-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] flex items-center gap-1 cursor-help">
                      {getMessageTypeIcon()}
                      <span>{messageType.charAt(0).toUpperCase() + messageType.slice(1)}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('flow_builder.summary_message_type', 'Message Type')}: {messageType}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] flex items-center gap-1 cursor-help">
                      <Calendar className="h-3 w-3" />
                      <span>{getTriggerEventLabel()}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('flow_builder.summary_timing_strategy', 'Timing Strategy')}: {getTriggerEventLabel()} - {getDelayDisplay()}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={cancelOnUserResponse ? "outline" : "secondary"} className="text-[9px] flex items-center gap-1 cursor-help">
                      <ShieldAlert className="h-3 w-3" />
                      <span>
                        {cancelOnUserResponse 
                          ? cancelCondition === 'any_message' 
                            ? t('flow_builder.cancel_any_message_short', 'Cancel on Reply')
                            : cancelCondition === 'specific_topic'
                            ? t('flow_builder.cancel_no_response_short', 'Cancel if No Response')
                            : t('flow_builder.cancel_never_short', 'Never Cancel')
                          : t('flow_builder.cancellation_disabled', 'No Cancellation')}
                      </span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {cancelOnUserResponse 
                        ? cancelCondition === 'any_message' 
                          ? t('flow_builder.summary_cancellation_any', 'Will cancel if user sends any message')
                          : cancelCondition === 'specific_topic'
                          ? t('flow_builder.summary_cancellation_no_response', 'Will send only if no user response')
                          : t('flow_builder.summary_cancellation_never', 'Will always send regardless of activity')
                        : t('flow_builder.summary_cancellation_disabled', 'Cancellation is disabled')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] flex items-center gap-1 cursor-help">
                      <Clock className="h-3 w-3" />
                      <span>{t('flow_builder.retries', 'Retries')}: {maxRetries}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('flow_builder.summary_retries', 'Maximum retry attempts')}: {maxRetries}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-2 mb-2">
              {getMessageTypeIcon()}
              <span className="font-medium">
                {messageType.charAt(0).toUpperCase() + messageType.slice(1)} {t('flow_builder.message', 'Message')}
              </span>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>{getTriggerEventLabel()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>{getDelayDisplay()}</span>
              </div>
            </div>

            {messageContent && (
              <div className="text-xs bg-background/80 p-2 rounded border border-border mt-2">
                {messageContent.length > 50
                  ? `${messageContent.substring(0, 50)}...`
                  : messageContent}
              </div>
            )}
          </div>

          {isEditing && (
            <>
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  {getMessageTypeIcon()}
                  {t('flow_builder.message_config', 'Message Configuration')}
                </h3>
                <div className="space-y-3">
                  <div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                            {t('flow_builder.message_type', 'Message Type')}
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </Label>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">{t('flow_builder.message_type_tooltip', 'Choose the type of content to send in the follow-up message')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Select
                      value={messageType}
                      onValueChange={(value: any) => setMessageType(value)}
                    >
                      <SelectTrigger className="text-xs h-7 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">{t('flow_builder.text_message', 'Text Message')}</SelectItem>
                      <SelectItem value="image">{t('flow_builder.image', 'Image')}</SelectItem>
                      <SelectItem value="video">{t('flow_builder.video', 'Video')}</SelectItem>
                      <SelectItem value="audio">{t('flow_builder.audio', 'Audio')}</SelectItem>
                      <SelectItem value="document">{t('flow_builder.document', 'Document')}</SelectItem>
                    </SelectContent>
                    </Select>
                  </div>

                  <div className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      {messageType === 'text' && t('flow_builder.text_message_desc', 'Sends a text message with optional variable substitution')}
                      {messageType === 'image' && t('flow_builder.image_message_desc', 'Sends an uploaded image file with optional caption')}
                      {messageType === 'video' && t('flow_builder.video_message_desc', 'Sends an uploaded video file with optional caption')}
                      {messageType === 'audio' && t('flow_builder.audio_message_desc', 'Sends an uploaded audio file (no caption support)')}
                      {messageType === 'document' && t('flow_builder.document_message_desc', 'Sends an uploaded document file with optional caption')}
                    </span>
                  </div>

                {messageType === 'text' ? (
                  <div className="space-y-3">
                    <div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.template', 'Template')}
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.template_tooltip', 'Apply a pre-configured message template for quick setup')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button data-tour="components-flow-builder-nodes-followupnode.button.flow_builder.use_default_template"
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyTemplate()}
                        className="w-full text-xs h-7 justify-start mt-1"
                      >
                        {t('flow_builder.use_default_template', 'Use Default Template')}
                      </Button>
                    </div>

                    <div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.message_content', 'Message Content')}
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.message_content_tooltip', 'Compose your follow-up message. Use {{variable}} syntax to insert dynamic content')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Textarea data-tour="components-flow-builder-nodes-followupnode.textarea.flow_builder.enter_follow_up_message"
                        id={`followup-message-textarea-${id}`}
                        placeholder={t('flow_builder.enter_follow_up_message', 'Enter your follow-up message...')}
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        className="text-xs h-20 resize-none mt-1"
                      />
                    </div>

                    <div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.insert_variable', 'Insert Variable:')}
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.insert_variable_tooltip', 'Click any variable to insert it at cursor position in your message')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {availableVariables.map((variable) => (
                          <TooltipProvider key={variable.name}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="text-[10px] px-2 py-1 bg-muted hover:bg-accent text-foreground rounded transition-colors"
                                  onClick={() => insertVariableIntoMessage(variable.name)}
                                >
                                  {variable.name}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">{variable.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{t('flow_builder.variables_replaced_desc', 'Variables will be replaced with actual values when message is sent.')}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.upload_media', 'Upload Media')}
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.upload_media_tooltip', 'Upload media files (max 30MB). Supported formats vary by type')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[9px]">{t('flow_builder.max_file_size', 'Max 30MB')}</Badge>
                        <Badge variant="outline" className="text-[9px]">
                          {messageType === 'image' && t('flow_builder.image_formats', 'JPG, PNG, GIF')}
                          {messageType === 'video' && t('flow_builder.video_formats', 'MP4, MOV, AVI')}
                          {messageType === 'audio' && t('flow_builder.audio_formats', 'MP3, WAV, OGG')}
                          {messageType === 'document' && t('flow_builder.document_formats', 'PDF, DOC, XLS, PPT')}
                        </Badge>
                      </div>
                      <FileUpload
                        onFileSelected={handleFileSelected}
                        fileType={getFileType()}
                        maxSize={30}
                        className="w-full mt-1"
                        showProgress={isUploading}
                        progress={uploadProgress}
                      />
                      {mediaUrl && !isUploading && (
                        <div className="text-[10px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-1 rounded mt-1">
                          ✓ {t('flow_builder.file_uploaded', 'File uploaded successfully')}
                        </div>
                      )}
                    </div>

                    {messageType !== 'audio' && (
                      <>
                        <div>
                          <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.caption_optional', 'Caption (Optional)')}</Label>
                          <Textarea data-tour="components-flow-builder-nodes-followupnode.textarea.flow_builder.enter_caption"
                            id={`followup-caption-textarea-${id}`}
                            placeholder={t('flow_builder.enter_caption', 'Enter caption for media...')}
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            className="text-xs h-16 resize-none mt-1"
                          />
                        </div>

                        <div>
                          <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.insert_variable', 'Insert Variable:')}</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {availableVariables.map((variable) => (
                              <button
                                key={variable.name}
                                className="text-[10px] px-2 py-1 bg-muted hover:bg-accent text-foreground rounded transition-colors"
                                title={variable.description}
                                onClick={() => insertVariableIntoCaption(variable.name)}
                              >
                                {variable.name}
                              </button>
                            ))}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {t('flow_builder.variables_replaced_desc', 'Variables will be replaced with actual values when message is sent.')}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t('flow_builder.timing_config', 'Timing Configuration')}
                </h3>

                <div className="space-y-3">
                  <div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                            {t('flow_builder.trigger_event', 'Trigger Event')}
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </Label>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">{t('flow_builder.trigger_event_tooltip', 'Choose when the follow-up should be scheduled relative to this node\'s execution')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Select
                      value={triggerEvent}
                      onValueChange={(value: any) => setTriggerEvent(value)}
                    >
                      <SelectTrigger className="text-xs h-7 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conversation_start">{t('flow_builder.conversation_start', 'Conversation Start')}</SelectItem>
                      <SelectItem value="relative_delay">{t('flow_builder.relative_delay', 'Relative Delay')}</SelectItem>
                      <SelectItem value="specific_datetime">{t('flow_builder.specific_datetime', 'Specific Date/Time')}</SelectItem>
                    </SelectContent>
                    </Select>
                  </div>

                {triggerEvent === 'specific_datetime' ? (
                  <div className="space-y-3">
                    <div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.date_and_time', 'Date and Time')}
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.date_and_time_tooltip', 'Enter the exact date and time when the follow-up should be sent')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Input data-tour="components-flow-builder-nodes-followupnode.input.flow_builder.date_and_time"
                        type="datetime-local"
                        value={specificDatetime}
                        onChange={(e) => {
                          setSpecificDatetime(e.target.value);
                        }}
                        className="text-xs h-7 mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>
                          {t('flow_builder.datetime_timezone_note',
                            `Enter time as it should appear in ${timezone || 'UTC'} timezone`)}
                        </span>
                      </p>
                    </div>

                    <div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.timezone', 'Timezone')}
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.timezone_tooltip', 'Select the timezone for scheduling. Message will be sent at the specified time in this timezone')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TimezoneSelector
                        value={timezone}
                        onValueChange={setTimezone}
                        placeholder={t('flow_builder.select_timezone', 'Select timezone...')}
                        className="w-full mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{t('flow_builder.timezone_desc', 'Message will be sent at the specified time in this timezone')}</span>
                      </p>
                    </div>

                    {specificDatetime && timezone && (
                      <div className="text-[10px] p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-900">
                        <div className="font-medium text-blue-800 dark:text-blue-300">{t('flow_builder.scheduled_time_preview', 'Scheduled Time Preview:')}</div>
                        <div className="text-blue-700 dark:text-blue-400">
                          {t('flow_builder.local_time', 'Local')}: {new Date(specificDatetime).toLocaleString()} ({timezone})
                        </div>
                        <div className="text-blue-600 dark:text-blue-500">
                          {t('flow_builder.utc_time', 'UTC')}: {new Date(specificDatetime).toISOString()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                                {t('flow_builder.delay_amount', 'Delay Amount')}
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </Label>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{t('flow_builder.delay_amount_tooltip', 'How long to wait before sending the follow-up')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <NumberInput
                          min={1}
                          value={delayAmount}
                          onChange={setDelayAmount}
                          fallbackValue={1}
                          className="text-xs h-7 mt-1"
                        />
                      </div>
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                                {t('flow_builder.delay_unit', 'Delay Unit')}
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </Label>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{t('flow_builder.delay_unit_tooltip', 'Time unit for the delay period')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Select
                          value={delayUnit}
                          onValueChange={(value: any) => setDelayUnit(value)}
                        >
                          <SelectTrigger className="text-xs h-7 mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">{t('flow_builder.minutes', 'Minutes')}</SelectItem>
                            <SelectItem value="hours">{t('flow_builder.hours', 'Hours')}</SelectItem>
                            <SelectItem value="days">{t('flow_builder.days', 'Days')}</SelectItem>
                            <SelectItem value="weeks">{t('flow_builder.weeks', 'Weeks')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {delayAmount > 0 && (
                      <div className="text-[10px] p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-900">
                        <div className="text-blue-800 dark:text-blue-300">
                          {t('flow_builder.calculated_send_time', 'Will send approximately at:')} {
                            (() => {
                              const now = new Date();
                              const delayMs = delayAmount * (
                                delayUnit === 'minutes' ? 60000 :
                                delayUnit === 'hours' ? 3600000 :
                                delayUnit === 'days' ? 86400000 :
                                604800000 // weeks
                              );
                              const sendTime = new Date(now.getTime() + delayMs);
                              return sendTime.toLocaleString();
                            })()
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  {t('flow_builder.cancellation_settings', 'Cancellation Settings')}
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                              {t('flow_builder.cancel_on_user_response', 'Cancel if User Responds')}
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.cancel_on_user_response_tooltip', 'Enable smart cancellation to avoid sending follow-ups when users have already responded')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{t('flow_builder.cancel_on_user_response_desc', 'Automatically cancel this follow-up if user responds before scheduled time')}</span>
                      </p>
                    </div>
                    <Switch
                      checked={cancelOnUserResponse}
                      onCheckedChange={setCancelOnUserResponse}
                    />
                  </div>

                  {!cancelOnUserResponse && (
                    <div className="text-[10px] text-muted-foreground pl-4 border-l-2 border-amber-200 dark:border-amber-900">
                      {t('flow_builder.cancellation_disabled_help', 'Enable to automatically cancel follow-ups based on user activity')}
                    </div>
                  )}

                  {cancelOnUserResponse && (
                    <div className="pl-4 border-l-2 border-amber-200 dark:border-amber-900 space-y-3">
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                                {t('flow_builder.cancel_condition', 'Cancellation Condition')}
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </Label>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{t('flow_builder.cancel_condition_tooltip', 'Define the specific condition that will trigger automatic cancellation')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <RadioGroup
                          value={cancelCondition}
                          onValueChange={(value: 'any_message' | 'specific_topic' | 'none') => setCancelCondition(value)}
                          className="space-y-2 mt-1"
                        >
                          <div className="flex items-start space-x-2">
                            <RadioGroupItem value="any_message" id="cancel-any-message" />
                            <div className="space-y-0.5 flex-1">
                              <Label htmlFor="cancel-any-message" className="text-[10px] font-medium text-foreground cursor-pointer flex items-center gap-1">
                                {t('flow_builder.cancel_any_message', 'Cancel on any user message')}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{t('flow_builder.cancel_any_message_tooltip', 'Most responsive - cancels as soon as user sends any message')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </Label>
                              <p className="text-[10px] text-muted-foreground">
                                {t('flow_builder.cancel_any_message_desc', 'Follow-up will be cancelled if user sends any message before scheduled time')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <RadioGroupItem value="specific_topic" id="cancel-no-response" />
                            <div className="space-y-0.5 flex-1">
                              <Label htmlFor="cancel-no-response" className="text-[10px] font-medium text-foreground cursor-pointer flex items-center gap-1">
                                {t('flow_builder.cancel_no_response', 'Cancel only if no response')}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{t('flow_builder.cancel_no_response_tooltip', 'Balanced - sends only if user hasn\'t engaged after the delay')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </Label>
                              <p className="text-[10px] text-muted-foreground">
                                {t('flow_builder.cancel_no_response_desc', 'Follow-up will be sent only if user hasn\'t responded after the delay period')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <RadioGroupItem value="none" id="cancel-never" />
                            <div className="space-y-0.5 flex-1">
                              <Label htmlFor="cancel-never" className="text-[10px] font-medium text-foreground cursor-pointer flex items-center gap-1">
                                {t('flow_builder.cancel_never', 'Never cancel automatically')}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{t('flow_builder.cancel_never_tooltip', 'Guaranteed delivery - always sends at scheduled time')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </Label>
                              <p className="text-[10px] text-muted-foreground">
                                {t('flow_builder.cancel_never_desc', 'Follow-up will always be sent at scheduled time regardless of user activity')}
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="text-[10px] p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-900">
                        <div className="flex items-start gap-2">
                          <Info className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-800 dark:text-amber-300" />
                          <div className="text-amber-800 dark:text-amber-300">
                            {cancelCondition === 'any_message' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{t('flow_builder.will_cancel_if_user_replies', 'Will cancel if user replies')}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">{t('flow_builder.cancellation_behavior_any_message', 'The follow-up will be automatically cancelled as soon as the user sends any message before the scheduled send time. This is the most responsive option.')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {cancelCondition === 'specific_topic' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{t('flow_builder.will_send_if_no_response', 'Will send only if no user response')}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">{t('flow_builder.cancellation_behavior_no_response', 'The follow-up will only be sent if the user has not responded after the delay period. If they respond, it will be cancelled.')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {cancelCondition === 'none' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{t('flow_builder.will_send_regardless', 'Will send regardless of user activity')}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">{t('flow_builder.cancellation_behavior_never', 'The follow-up will always be sent at the scheduled time, regardless of any user activity. Use this for critical announcements or appointment reminders.')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t('flow_builder.advanced_config', 'Advanced Configuration')}
                </h3>

                <div className="space-y-3">
                  <div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 cursor-help">
                            {t('flow_builder.max_retries', 'Max Retries')}
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </Label>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">{t('flow_builder.max_retries_tooltip', 'Number of automatic retry attempts if message delivery fails (0-10)')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Input data-tour="components-flow-builder-nodes-followupnode.input.flow_builder.max_retries"
                      type="number"
                      min="0"
                      max="10"
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
                      className="text-xs h-7 mt-1"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                      <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{t('flow_builder.retry_attempts_desc', 'Number of retry attempts if message delivery fails')}</span>
                    </p>
                    {maxRetries > 5 && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                          {t('flow_builder.high_retry_warning', 'High retry count may delay failure detection')}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

function FollowUpHelpContent() {
  const { t } = useTranslation();
  
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Node Overview */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            {t('flow_builder.followup_help_overview_title', 'Node Overview')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              {t('flow_builder.followup_help_overview_desc', 'The Follow-Up Node enables automated re-engagement by scheduling messages to be sent at specific times or after delays. It helps you maintain conversations, send reminders, and create drip campaigns without manual intervention.')}
            </p>
            <p className="text-sm text-foreground">
              <strong>{t('flow_builder.key_benefits', 'Key Benefits')}:</strong> {t('flow_builder.followup_key_benefits', 'Automated re-engagement, scheduled reminders, drip campaigns, timezone-aware scheduling, and smart cancellation based on user activity.')}
            </p>
          </div>
        </section>

        {/* Timing Strategies */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            {t('flow_builder.followup_help_timing_title', 'Timing Strategies')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {t('flow_builder.conversation_start', 'Conversation Start')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.conversation_start_help_desc', 'Schedule immediately when the flow reaches this node. Perfect for instant follow-ups or immediate responses.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono">
                {t('flow_builder.conversation_start_flow', 'Flow reaches node → Message scheduled immediately → Sent right away')}
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {t('flow_builder.relative_delay', 'Relative Delay')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.relative_delay_help_desc', 'Schedule based on time elapsed from node execution. Choose minutes, hours, days, or weeks.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>{t('flow_builder.example', 'Example')}:</strong> {t('flow_builder.relative_delay_example', '24 hours delay')}</div>
                <div>{t('flow_builder.relative_delay_flow', 'Node executes at 2:00 PM → Message scheduled for 2:00 PM next day')}</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {t('flow_builder.specific_datetime', 'Specific Date/Time')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.specific_datetime_help_desc', 'Schedule for an exact date and time in a specific timezone. Ideal for appointment reminders and scheduled announcements.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>{t('flow_builder.example', 'Example')}:</strong> {t('flow_builder.specific_datetime_example', 'January 15, 2026 at 3:00 PM (America/New_York)')}</div>
                <div>{t('flow_builder.specific_datetime_flow', 'Message will be sent at exactly 3:00 PM EST on that date')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Message Types */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <InboxConversationIcon className="h-4 w-4 text-primary" />
            {t('flow_builder.followup_help_message_types_title', 'Message Types')}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <InboxConversationIcon className="h-3 w-3" />
                {t('flow_builder.text_message', 'Text Message')}
              </h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.text_message_help_desc', 'Simple text messages with variable substitution support')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <Image className="h-3 w-3" />
                {t('flow_builder.image', 'Image')}
              </h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.image_help_desc', 'Visual content with optional captions')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <Video className="h-3 w-3" />
                {t('flow_builder.video', 'Video')}
              </h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.video_help_desc', 'Video messages for tutorials and demos')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <FileAudio className="h-3 w-3" />
                {t('flow_builder.audio', 'Audio')}
              </h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.audio_help_desc', 'Voice messages (no caption support)')}</p>
            </div>
            <div className="border rounded-lg p-3 col-span-2">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <FileText className="h-3 w-3" />
                {t('flow_builder.document', 'Document')}
              </h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.document_help_desc', 'File attachments (PDFs, docs, spreadsheets, etc.) with optional captions')}</p>
            </div>
          </div>
        </section>

        {/* Cancellation Logic */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            {t('flow_builder.followup_help_cancellation_title', 'Cancellation Logic')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{t('flow_builder.cancel_any_message', 'Cancel on any user message')}</Badge>
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.cancel_any_message_help_desc', 'Most responsive option - cancels as soon as the user sends any message before the scheduled time. Best for flows where any user engagement indicates they\'re active.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono">
                {t('flow_builder.cancel_any_message_flow', 'Scheduled for 3:00 PM → User sends message at 2:30 PM → Follow-up cancelled')}
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{t('flow_builder.cancel_no_response', 'Cancel only if no response')}</Badge>
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.cancel_no_response_help_desc', 'Balanced approach - sends only if the user hasn\'t engaged after the delay period. Perfect for re-engagement campaigns where you want to reach inactive users.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div>{t('flow_builder.cancel_no_response_flow_1', 'Delay: 24 hours → User hasn\'t responded → Follow-up sent')}</div>
                <div>{t('flow_builder.cancel_no_response_flow_2', 'Delay: 24 hours → User responded → Follow-up cancelled')}</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{t('flow_builder.cancel_never', 'Never cancel automatically')}</Badge>
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.cancel_never_help_desc', 'Guaranteed delivery - always sends at the scheduled time regardless of user activity. Use for critical announcements, appointment reminders, or time-sensitive information.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono">
                {t('flow_builder.cancel_never_flow', 'Scheduled for 3:00 PM → Always sent at 3:00 PM regardless of user activity')}
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Variable System */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <InboxConversationIcon className="h-4 w-4 text-primary" />
            {t('flow_builder.followup_help_variables_title', 'Variable System')}
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.how_variables_work', 'How Variables Work')}</h4>
              <p className="text-xs text-foreground mb-2">
                {t('flow_builder.variables_work_desc', 'Use {{variable_name}} syntax to insert dynamic content into your follow-up messages. Variables are replaced with actual values when the message is sent.')}
              </p>
              <div className="bg-card rounded p-2 text-xs font-mono">
                {t('flow_builder.variables_example', 'Message: "Hello {{contact.name}}, your appointment is on {{date.today}}"')}<br/>
                {t('flow_builder.variables_result', 'Result: "Hello John, your appointment is on January 15, 2026"')}
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.available_variables', 'Available Variables')}</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">{'{{contact.name}}'}</Badge>
                  <p className="text-muted-foreground">{t('flow_builder.var_contact_name', "Contact's name")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">{'{{contact.phone}}'}</Badge>
                  <p className="text-muted-foreground">{t('flow_builder.var_contact_phone', "Contact's phone number")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">{'{{contact.email}}'}</Badge>
                  <p className="text-muted-foreground">{t('flow_builder.var_contact_email', "Contact's email address")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">{'{{message.content}}'}</Badge>
                  <p className="text-muted-foreground">{t('flow_builder.var_message_content', "Received message content")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">{'{{date.today}}'}</Badge>
                  <p className="text-muted-foreground">{t('flow_builder.var_date_today', "Current date")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">{'{{time.now}}'}</Badge>
                  <p className="text-muted-foreground">{t('flow_builder.var_time_now', "Current time")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Practical Examples */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            {t('flow_builder.followup_help_examples_title', 'Practical Examples')}
          </h3>
          <div className="space-y-4">
            {/* Example 1 */}
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.example_1_title', 'Example 1: Appointment Reminder')}</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-card rounded p-2">
                  <strong>{t('flow_builder.scenario', 'Scenario')}:</strong> {t('flow_builder.example_1_scenario', 'Remind user about appointment scheduled for January 20, 2026 at 2:00 PM EST')}
                </div>
                <div className="bg-muted rounded p-2 font-mono space-y-1">
                  <div><strong>{t('flow_builder.configuration', 'Configuration')}:</strong></div>
                  <div>{t('flow_builder.example_1_config_trigger', 'Trigger: Specific Date/Time')}</div>
                  <div>{t('flow_builder.example_1_config_datetime', 'Date/Time: January 20, 2026, 2:00 PM')}</div>
                  <div>{t('flow_builder.example_1_config_timezone', 'Timezone: America/New_York')}</div>
                  <div>{t('flow_builder.example_1_config_message', 'Message: "Hi {{contact.name}}, this is a reminder about your appointment tomorrow at 2:00 PM EST."')}</div>
                  <div>{t('flow_builder.example_1_config_cancellation', 'Cancellation: Never Cancel')}</div>
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>{t('flow_builder.result', 'Result')}:</strong> {t('flow_builder.example_1_result', 'User receives reminder exactly at 2:00 PM EST on January 20, 2026')}
                </div>
              </div>
            </div>

            {/* Example 2 */}
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.example_2_title', 'Example 2: Re-engagement After 24 Hours')}</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-card rounded p-2">
                  <strong>{t('flow_builder.scenario', 'Scenario')}:</strong> {t('flow_builder.example_2_scenario', 'Send follow-up if user hasn\'t responded after 24 hours')}
                </div>
                <div className="bg-muted rounded p-2 font-mono space-y-1">
                  <div><strong>{t('flow_builder.configuration', 'Configuration')}:</strong></div>
                  <div>{t('flow_builder.example_2_config_trigger', 'Trigger: Relative Delay')}</div>
                  <div>{t('flow_builder.example_2_config_delay', 'Delay: 24 hours')}</div>
                  <div>{t('flow_builder.example_2_config_message', 'Message: "Hi {{contact.name}}, we noticed you haven\'t responded. Is there anything we can help with?"')}</div>
                  <div>{t('flow_builder.example_2_config_cancellation', 'Cancellation: No Response (only send if user hasn\'t responded)')}</div>
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>{t('flow_builder.result', 'Result')}:</strong> {t('flow_builder.example_2_result', 'If user responds within 24 hours, follow-up is cancelled. Otherwise, sent after 24 hours.')}
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </ScrollArea>
  );
}

export default FollowUpNode;
