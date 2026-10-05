import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Search,
  ChevronDown,
  X,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';
import type { WhatsAppTemplateComponentValues } from '@shared/whatsapp-template-variables';
import {
  getTemplateVariables,
  toTemplateComponentValues,
  translatedTemplateValidationError,
} from '@/lib/whatsapp-template-ui';
import { WhatsAppTemplateVariableDialog } from '@/components/templates/WhatsAppTemplateVariableDialog';

interface BusinessTemplatePanelProps {
  conversationId: number;
  conversation: any;
  contact: any;
  className?: string;
  dentalAppointmentId?: number;
  disabled?: boolean;
}

export default function BusinessTemplatePanel({
  conversationId,
  conversation,
  contact,
  dentalAppointmentId,
  disabled = false,
  className = ''
}: BusinessTemplatePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();


  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['/api/whatsapp-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/whatsapp-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      return data.data || data || [];
    },
    staleTime: 30000,
  });


  const filteredTemplates = templates.filter((template: WhatsAppTemplate) => {
    const matchesStatus = template.whatsappTemplateStatus === 'approved';
    const matchesConnection = template.connectionId === conversation?.channelId;
    const matchesChannelType = template.whatsappChannelType === 'official';
    return matchesStatus && matchesConnection && matchesChannelType;
  });


  const searchFilteredTemplates = filteredTemplates.filter((template: WhatsAppTemplate) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.content.toLowerCase().includes(searchTerm.toLowerCase());
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

  const sendTemplateMutation = useMutation({
    mutationFn: async (payload: {
      templateId: number;
      templateName: string;
      languageCode: string;
      variables: Record<string, string>;
      componentValues?: WhatsAppTemplateComponentValues;
    }) => {
      const response = await apiRequest(
        'POST',
        `/api/conversations/${conversationId}/send-template`,
        { ...payload, ...(dentalAppointmentId ? { dentalAppointmentId } : {}) }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to send template');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', conversationId, 'messages'] });
      setIsVariableModalOpen(false);
      setSelectedTemplate(null);
      setVariableValues({});
      setIsOpen(false);
      setSearchTerm('');
      toast({
        title: t('templates.sent', 'Template Sent'),
        description: t('templates.sent_success', 'WhatsApp template message has been sent successfully.'),
      });
    },
    onError: (error: any) => {
      if (error.errorCode === 'DENTAL_TIMEZONE_REQUIRED') {
        void queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/timezone'] });
        void queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/reminder-context'] });
      }
      toast({
        title: t('templates.send_error', 'Error'),
        description: error.errorCode === 'DENTAL_TIMEZONE_REQUIRED'
          ? t('erp.dental.reminders.timezoneRequired', 'Save a valid company timezone in General Settings before sending dental reminders.')
          : error.message || t('templates.send_error_desc', 'Failed to send template. Please try again.'),
        variant: 'destructive',
      });
    },
  });

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
    } else {

      handleSendTemplate(template, {});
    }
  };

  const handleSendTemplate = (template: WhatsAppTemplate, vars: Record<string, string>) => {
    if (disabled) return;
    const validationError = translatedTemplateValidationError(t, getTemplateVariables(template));
    if (validationError) {
      toast({ title: t('templates.send_error', 'Error'), description: validationError, variant: 'destructive' });
      return;
    }
    sendTemplateMutation.mutate({
      templateId: template.id,
      templateName: template.whatsappTemplateName || template.name,
      languageCode: template.whatsappTemplateLanguage || 'en',
      variables: vars,
      componentValues: toTemplateComponentValues(getTemplateVariables(template), vars),
    });
  };

  const getTemplatePreview = (template: WhatsAppTemplate) => {
    let preview = template.content;
    const bodyVariables = getTemplateVariables(template).filter(variable => variable.component === 'body');
    if (bodyVariables.length > 0) {
      bodyVariables.forEach((variable) => {
        const key = variable.name || variable.position;
        preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), `[${key}]`);
      });
    }
    return preview;
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'approved') {
      return (
        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
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

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button data-tour="components-conversations-businesstemplatepanel.button.templates.use_business_template"
            disabled={disabled}
            variant="ghost"
            size="sm"
            className={`flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-accent ${className}`}
            title={t('templates.use_business_template', 'Use WhatsApp Business Template')}
          >
            <InboxConversationIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t('templates.template', 'Template')}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="top">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm text-foreground">
                {t('templates.select_template', 'Select Template')}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input data-tour="components-conversations-businesstemplatepanel.input.templates.search"
                placeholder={t('templates.search', 'Search templates...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {t('templates.loading', 'Loading templates...')}
                </div>
              ) : searchFilteredTemplates.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {searchTerm
                    ? t('templates.no_results', 'No templates found')
                    : t('templates.no_templates_available', 'No approved templates available for this connection')
                  }
                </div>
              ) : (
                (Object.entries(groupedTemplates) as [string, WhatsAppTemplate[]][]).map(([category, categoryTemplates]) => (
                  <div key={category} className="mb-2">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
                      {t(`templates.category.${category}`, category)}
                    </div>
                    {categoryTemplates.map((template: WhatsAppTemplate) => (
                      <div
                        key={template.id}
                        className="p-3 rounded-lg hover:bg-accent cursor-pointer border border-transparent hover:border-border transition-colors"
                        onClick={() => handleSelectTemplate(template)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h5 className="font-medium text-sm text-foreground truncate pr-2">
                            {template.name}
                          </h5>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {getStatusBadge(template.whatsappTemplateStatus)}
                            {getCategoryBadge(template.whatsappTemplateCategory)}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {getTemplatePreview(template)}
                        </p>
                        {getTemplateVariables(template).length > 0 && (
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-primary">
                              {t('templates.variables_count', '{{count}} variables', { count: getTemplateVariables(template).length })}
                            </span>
                          </div>
                        )}
                        {translatedTemplateValidationError(t, getTemplateVariables(template)) && (
                          <div className="mt-1 text-xs text-destructive">
                            {t('templates.invalid_named_parameters', 'Invalid named parameters')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <WhatsAppTemplateVariableDialog
        open={isVariableModalOpen}
        onOpenChange={setIsVariableModalOpen}
        template={selectedTemplate}
        values={variableValues}
        onValuesChange={setVariableValues}
        context={{ contact }}
        onCancel={() => setVariableValues({})}
        onConfirm={() => selectedTemplate && handleSendTemplate(selectedTemplate, variableValues)}
        confirmLabel={t('common.send', 'Send')}
        pendingLabel={t('common.sending', 'Sending...')}
        pending={sendTemplateMutation.isPending}
        disabled={disabled}
      />
    </>
  );
}

