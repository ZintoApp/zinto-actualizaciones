import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { ChannelConnection } from '@shared/schema';
import { isChannelAvailable } from '@shared/channel-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Loader2,
  Phone,
  User,
  Search,
  ChevronDown,
  X,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';
import { parseRecipientInput } from '@/lib/username-utils';
import type { WhatsAppTemplateComponentValues } from '@shared/whatsapp-template-variables';
import {
  getTemplateVariables,
  toTemplateComponentValues,
  translatedTemplateValidationError,
} from '@/lib/whatsapp-template-ui';
import { WhatsAppTemplateVariableDialog } from '@/components/templates/WhatsAppTemplateVariableDialog';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConversationCreated?: (conversation: any) => void;
  initialContact?: { id: number; name: string; phone?: string | null; identifier?: string | null };
}

export default function NewConversationModal({
  isOpen,
  onClose,
  onConversationCreated,
  initialContact,
}: NewConversationModalProps) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [usernameKey, setUsernameKey] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [initialMessage, setInitialMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  useEffect(() => {
    if (isOpen && initialContact) {
      setName(initialContact.name);
      setPhoneNumber(initialContact.phone || initialContact.identifier || '');
    }
  }, [isOpen, initialContact]);
  

  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const getChannelDisplayName = (channelType: string) => {
    switch (channelType) {
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return t('new_conversation.channel_unofficial', 'Unofficial');
      case 'whatsapp_official':
        return t('new_conversation.channel_official', 'Business API');
      default:
        return channelType;
    }
  };

  const { data: channelConnections = [], isLoading: isLoadingConnections } = useQuery<ChannelConnection[]>({
    queryKey: ['/api/channel-connections'],
    staleTime: 1000 * 60 * 5,
  });

  const activeWhatsAppConnections = channelConnections.filter(
    (conn: ChannelConnection) =>
      (conn.channelType === 'whatsapp_unofficial' ||
       conn.channelType === 'whatsapp' ||
       conn.channelType === 'whatsapp_official') &&
      isChannelAvailable(conn)
  );


  const selectedConnection = activeWhatsAppConnections.find(conn => conn.id === selectedChannelId);
  const isOfficialAPI = selectedConnection?.channelType === 'whatsapp_official';

  const parsedRecipient = parseRecipientInput(phoneNumber);
  const isUsernameInput = parsedRecipient?.type === 'username';


  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['/api/whatsapp-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/whatsapp-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      return data.data || data || [];
    },
    staleTime: 30000,
    enabled: isOfficialAPI, // Only fetch when Official API is selected
  });


  const filteredTemplates = templates.filter((template: WhatsAppTemplate) => {
    const matchesStatus = template.whatsappTemplateStatus === 'approved';
    const matchesConnection = template.connectionId === selectedChannelId;
    const matchesChannelType = template.whatsappChannelType === 'official';
    return matchesStatus && matchesConnection && matchesChannelType;
  });


  const searchFilteredTemplates = filteredTemplates.filter((template: WhatsAppTemplate) => {
    const matchesSearch = template.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
                         template.content.toLowerCase().includes(templateSearchTerm.toLowerCase());
    return matchesSearch;
  });


  const groupedTemplates = searchFilteredTemplates.reduce((acc: Record<string, WhatsAppTemplate[]>, template: WhatsAppTemplate) => {
    const category = template.whatsappTemplateCategory || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  useEffect(() => {
    if (activeWhatsAppConnections.length > 0 && !selectedChannelId) {
      setSelectedChannelId(activeWhatsAppConnections[0].id);
    }
  }, [activeWhatsAppConnections, selectedChannelId]);


  useEffect(() => {
    setSelectedTemplate(null);
    setVariableValues({});
    setTemplateSearchTerm('');
    setIsTemplatePopoverOpen(false);
    setIsVariableModalOpen(false);
  }, [selectedChannelId]);

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow phone characters plus @username handles (letters, digits, ., _)
    const value = e.target.value.replace(/[^\w\s\-().+@]/g, '');
    setPhoneNumber(value);

    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!name.trim()) {
      errors.push(t('new_conversation.name_required', 'Contact name is required'));
    }

    if (!phoneNumber.trim()) {
      errors.push(t('new_conversation.recipient_required', 'Phone number or @username is required'));
    } else {
      const parsed = parseRecipientInput(phoneNumber);
      if (!parsed) {
        errors.push(t('new_conversation.recipient_invalid', 'Enter a valid phone number or @username (letters, numbers, . and _)'));
      } else if (parsed.type === 'phone' && parsed.value.length < 10) {
        errors.push(t('new_conversation.phone_invalid', 'Please enter a valid phone number with at least 10 digits'));
      }
    }

    if (!selectedChannelId) {
      errors.push(t('new_conversation.connection_required', 'Please select a WhatsApp connection'));
    }

    if (activeWhatsAppConnections.length === 0) {
      errors.push(t('new_conversation.no_connections', 'No active WhatsApp connections found. Please connect WhatsApp in Settings first.'));
    }


    if (isOfficialAPI && !selectedTemplate) {
      errors.push(t('new_conversation.template_required', 'A template is required for WhatsApp Business API conversations'));
    }
    if (isOfficialAPI && selectedTemplate) {
      const templateError = translatedTemplateValidationError(t, getTemplateVariables(selectedTemplate));
      if (templateError) errors.push(templateError);
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const createConversationMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      phoneNumber: string;
      recipient: string;
      usernameKey?: string;
      channelConnectionId: number;
      initialMessage?: string;
    }) => {
      const res = await apiRequest('POST', '/api/conversations/whatsapp/initiate', data);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || t('new_conversation.create_failed', 'Failed to create conversation'));
      }

      return res.json();
    },
    onSuccess: async (data) => {

      if (isOfficialAPI && selectedTemplate && data.conversation?.id) {
        try {
          await sendTemplateMutation.mutateAsync({
            conversationId: data.conversation.id,
            templateId: selectedTemplate.id,
            templateName: selectedTemplate.whatsappTemplateName || selectedTemplate.name,
            languageCode: selectedTemplate.whatsappTemplateLanguage || 'en',
            variables: variableValues,
            componentValues: toTemplateComponentValues(getTemplateVariables(selectedTemplate), variableValues),
            skipBroadcast: true, // Skip broadcast to prevent duplicate message display when initiating conversation
          });
        } catch (templateError: any) {

          toast({
            title: t('common.warning', 'Warning'),
            description: t('new_conversation.template_send_failed', 'Conversation created but template message failed to send. You can send it manually.'),
            variant: "default"
          });
        }
      }

      toast({
        title: t('common.success', 'Success'),
        description: t('new_conversation.success_message', 'WhatsApp conversation initiated successfully.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });

      if (onConversationCreated) {
        onConversationCreated(data.conversation);
      }

      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('new_conversation.create_error', 'Failed to create conversation. Please try again.'),
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async (payload: {
      conversationId: number;
      templateId: number;
      templateName: string;
      languageCode: string;
      variables: Record<string, string>;
      componentValues?: WhatsAppTemplateComponentValues;
      skipBroadcast?: boolean;
    }) => {
      const response = await apiRequest(
        'POST',
        `/api/conversations/${payload.conversationId}/send-template`,
        {
          templateId: payload.templateId,
          templateName: payload.templateName,
          languageCode: payload.languageCode,
          variables: payload.variables,
          componentValues: payload.componentValues,
          skipBroadcast: payload.skipBroadcast,
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to send template');
      }
      return response.json();
    },
  });

  const resetForm = () => {
    setName('');
    setPhoneNumber('');
    setUsernameKey('');
    setInitialMessage('');
    setValidationErrors([]);
    setSelectedChannelId(activeWhatsAppConnections.length > 0 ? activeWhatsAppConnections[0].id : null);
    setSelectedTemplate(null);
    setVariableValues({});
    setTemplateSearchTerm('');
    setIsTemplatePopoverOpen(false);
    setIsVariableModalOpen(false);
  };

  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    

    const definitions = getTemplateVariables(template);
    if (definitions.length > 0) {

      const initialValues: Record<string, string> = {};
      definitions.forEach((variable) => {
        initialValues[variable.id] = '';
      });
      setVariableValues(initialValues);
      setIsVariableModalOpen(true);
      setIsTemplatePopoverOpen(false);
    } else {

      setIsTemplatePopoverOpen(false);
    }
  };

  const selectedTemplateValidationError = selectedTemplate
    ? translatedTemplateValidationError(t, getTemplateVariables(selectedTemplate))
    : undefined;

  const getStatusBadge = (status?: string) => {
    if (status === 'approved') {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {t('templates.status.approved', 'Approved')}
        </Badge>
      );
    }
    return null;
  };

  const getCategoryBadge = (category?: string) => {
    switch (category) {
      case 'marketing':
        return <Badge variant="secondary">{t('templates.category.marketing', 'Marketing')}</Badge>;
      case 'utility':
        return <Badge variant="default">{t('templates.category.utility', 'Utility')}</Badge>;
      case 'authentication':
        return <Badge variant="outline">{t('templates.category.authentication', 'Authentication')}</Badge>;
      default:
        return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!selectedChannelId) {
      toast({
        title: t('new_conversation.no_connection_selected', 'No Connection Selected'),
        description: t('new_conversation.select_connection', 'Please select a WhatsApp connection.'),
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      await createConversationMutation.mutateAsync({
        ...(initialContact ? { contactId: initialContact.id } : {}),
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        recipient: phoneNumber.trim(),
        usernameKey: isUsernameInput && usernameKey.trim() ? usernameKey.trim() : undefined,
        channelConnectionId: selectedChannelId,
        initialMessage: initialMessage.trim() || undefined
      });

    } catch (error) {
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent data-tour="components-conversations-newconversationmodal.dialogcontent.new_conversation.title" className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <InboxConversationIcon className="w-5 h-5 text-green-600" />
            {t('new_conversation.title', 'Start New WhatsApp Conversation')}
          </DialogTitle>
          <DialogDescription>
            {t('new_conversation.description', 'Enter contact details to initiate a new WhatsApp conversation.')}
          </DialogDescription>
        </DialogHeader>

        {validationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {!isLoadingConnections && activeWhatsAppConnections.length === 0 && (
          <Alert>
            <AlertDescription>
              {t('new_conversation.no_connections', 'No active WhatsApp connections found. Please connect WhatsApp in Settings first.')}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {t('new_conversation.contact_name_required', 'Contact Name *')}
            </Label>
            <Input data-tour="components-conversations-newconversationmodal.input.new_conversation.enter_contact_name"
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
              placeholder={t('new_conversation.enter_contact_name', "Enter contact's full name")}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              {t('new_conversation.recipient_required_label', 'Phone Number or @Username *')}
            </Label>
            <Input data-tour="components-conversations-newconversationmodal.input.new_conversation.enter_recipient"
              id="phone"
              type="text"
              value={phoneNumber}
              onChange={handlePhoneNumberChange}
              placeholder={t('new_conversation.enter_recipient', 'e.g., +1234567890 or @username')}
              required
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-500">
              {isUsernameInput
                ? isOfficialAPI
                  ? t('new_conversation.username_official_hint', 'Business API cannot look up usernames - the username must belong to a contact who has messaged you before')
                  : t('new_conversation.username_hint', 'The username will be looked up on WhatsApp')
                : t('new_conversation.include_country_code', 'Include country code for international numbers, or use a @username')}
            </p>
          </div>

          {isUsernameInput && !isOfficialAPI && (
            <div className="space-y-2">
              <Label htmlFor="username-key" className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                {t('new_conversation.username_key_optional', 'Username Key (Optional)')}
              </Label>
              <Input data-tour="components-conversations-newconversationmodal.input.new_conversation.enter_username_key"
                id="username-key"
                type="text"
                value={usernameKey}
                onChange={(e) => setUsernameKey(e.target.value)}
                placeholder={t('new_conversation.enter_username_key', 'Enter the key if this user requires one')}
                disabled={isSubmitting}
              />
              <p className="text-sm text-gray-500">
                {t('new_conversation.username_key_help', 'Some users require a key from first-time contacts. Leave empty if not needed.')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="connection" className="flex items-center gap-2">
              <i className="ri-whatsapp-line w-4 h-4 text-green-600"></i>
              {t('new_conversation.whatsapp_connection_required', 'WhatsApp Connection *')}
            </Label>
            {isLoadingConnections ? (
              <div className="flex items-center gap-2 p-2 border rounded">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('new_conversation.loading_connections', 'Loading connections...')}
              </div>
            ) : activeWhatsAppConnections.length > 0 ? (
              <Select
                value={selectedChannelId?.toString() || ''}
                onValueChange={(value) => setSelectedChannelId(parseInt(value))}
                disabled={isSubmitting}
              >
                <SelectTrigger data-tour="components-conversations-newconversationmodal.selecttrigger.new_conversation.select_whatsapp_connection">
                  <SelectValue placeholder={t('new_conversation.select_whatsapp_connection', 'Select WhatsApp connection')} />
                </SelectTrigger>
                <SelectContent>
                  {activeWhatsAppConnections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        {conn.accountName || `WhatsApp ${conn.id}`}
                        <span className="text-xs text-gray-500">({getChannelDisplayName(conn.channelType)})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="p-2 border rounded bg-gray-50 text-gray-600 text-sm">
                {t('new_conversation.no_connections_available', 'No active WhatsApp connections available')}
              </div>
            )}
          </div>

          {/* Template selection for Official API */}
          {isOfficialAPI && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <InboxConversationIcon className="w-4 h-4" />
                {t('new_conversation.template_required', 'WhatsApp Template *')}
              </Label>
              <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button data-tour="components-conversations-newconversationmodal.button.templates.loading"
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    disabled={isSubmitting || isLoadingTemplates || !selectedChannelId}
                  >
                    {selectedTemplate ? (
                      <span className="truncate">{selectedTemplate.name}</span>
                    ) : (
                      <span className="text-gray-500">
                        {isLoadingTemplates 
                          ? t('templates.loading', 'Loading templates...')
                          : t('templates.select_template', 'Select Template')}
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm text-gray-900">
                        {t('templates.select_template', 'Select Template')}
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsTemplatePopoverOpen(false)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Command>
                      <CommandInput
                        placeholder={t('templates.search_placeholder', 'Search templates...')}
                        value={templateSearchTerm}
                        onValueChange={setTemplateSearchTerm}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {t('templates.no_templates', 'No templates found')}
                        </CommandEmpty>
                        {(Object.entries(groupedTemplates) as [string, WhatsAppTemplate[]][]).map(([category, categoryTemplates]) => (
                          <CommandGroup key={category} heading={category.charAt(0).toUpperCase() + category.slice(1)}>
                            {categoryTemplates.map((template) => (
                              <CommandItem
                                key={template.id}
                                value={template.name}
                                onSelect={() => handleSelectTemplate(template)}
                                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-medium text-sm">{template.name}</span>
                                  <div className="flex items-center gap-1">
                                    {getStatusBadge(template.whatsappTemplateStatus)}
                                    {getCategoryBadge(template.whatsappTemplateCategory)}
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                                  {template.content}
                                </p>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </div>
                </PopoverContent>
              </Popover>
              <p className="text-sm text-gray-500">
                {t('new_conversation.template_help', 'WhatsApp Business API requires a template message to start conversations')}
              </p>
            </div>
          )}

          {/* Initial message for non-Official API */}
          {!isOfficialAPI && (
            <div className="space-y-2">
              <Label htmlFor="message" className="flex items-center gap-2">
                <InboxConversationIcon className="w-4 h-4" />
                {t('new_conversation.initial_message_optional', 'Initial Message (Optional)')}
              </Label>
              <Textarea data-tour="components-conversations-newconversationmodal.textarea.new_conversation.enter_initial_message"
                id="message"
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                placeholder={t('new_conversation.enter_initial_message', 'Enter an optional first message to send...')}
                rows={3}
                disabled={isSubmitting}
              />
              <p className="text-sm text-gray-500">
                {t('new_conversation.initial_message_help', 'This message will be sent immediately after creating the conversation')}
              </p>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button data-tour="components-conversations-newconversationmodal.button.common.cancel"
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-conversations-newconversationmodal.button.new_conversation.creating"
              type="submit"
              disabled={isSubmitting || activeWhatsAppConnections.length === 0 || (isOfficialAPI && (!selectedTemplate || Boolean(selectedTemplateValidationError)))}
              className="w-full sm:w-auto btn-brand-primary"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('new_conversation.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <InboxConversationIcon className="w-4 h-4 mr-2" />
                  {t('new_conversation.start_conversation', 'Start Conversation')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>

        <WhatsAppTemplateVariableDialog
          open={isVariableModalOpen}
          onOpenChange={setIsVariableModalOpen}
          template={selectedTemplate}
          values={variableValues}
          onValuesChange={setVariableValues}
          context={{ contact: { name, phone: parsedRecipient?.value || phoneNumber } }}
          onCancel={() => {
            setSelectedTemplate(null);
            setVariableValues({});
          }}
          onConfirm={() => setIsVariableModalOpen(false)}
          confirmLabel={t('common.confirm', 'Confirm')}
          elevated
        />
      </DialogContent>
    </Dialog>
  );
}
