import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Copy,
  Zap,
  Star,
  ChevronDown,
  X,
  Variable,
  User,
  Phone,
  Mail,
  Building,
  Calendar,
  Clock3,
  Loader2,
  MapPin,
  Stethoscope
} from 'lucide-react';
import { 
  replaceVariables, 
  createVariableContext, 
  previewTemplate,
  hasVariables,
  type VariableContext 
} from '@/services/variableSubstitution';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

interface QuickReplyTemplate {
  id: number;
  name: string;
  content: string;
  category: string;
  variables: string[];
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface QuickReplyPanelProps {
  onSelectTemplate: (content: string) => void;
  conversation?: any;
  contact?: any;
  className?: string;
}

export default function QuickReplyPanel({
  onSelectTemplate,
  conversation,
  contact,
  className = ''
}: QuickReplyPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '', category: 'general' });
  const [variableContext, setVariableContext] = useState<VariableContext>({});

  const [hoveredTemplateId, setHoveredTemplateId] = useState<number | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QuickReplyTemplate | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<QuickReplyTemplate | null>(null);

  const [isCreateVariableOpen, setIsCreateVariableOpen] = useState(false);
  const [isEditVariableOpen, setIsEditVariableOpen] = useState(false);
  const [resolvingTemplateId, setResolvingTemplateId] = useState<number | null>(null);
  const createContentRef = useRef<HTMLTextAreaElement>(null);
  const editContentRef = useRef<HTMLTextAreaElement>(null);

  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const variableOptions = [
    {
      value: 'contact.name',
      label: t('variables.contact_name', 'Contact Name'),
      description: t('variables.contact_name_desc', 'Full name of the contact'),
      icon: <User className="w-4 h-4" />,
      category: 'contact'
    },
    {
      value: 'contact.phone',
      label: t('variables.phone_number', 'Phone Number'),
      description: t('variables.phone_number_desc', 'Contact phone number'),
      icon: <Phone className="w-4 h-4" />,
      category: 'contact'
    },
    {
      value: 'contact.username',
      label: t('variables.whatsapp_username', 'WhatsApp Username'),
      description: t('variables.whatsapp_username_desc', 'Contact WhatsApp @username'),
      icon: <User className="w-4 h-4" />,
      category: 'contact'
    },
    {
      value: 'contact.email',
      label: t('variables.email_address', 'Email Address'),
      description: t('variables.email_address_desc', 'Contact email address'),
      icon: <Mail className="w-4 h-4" />,
      category: 'contact'
    },
    {
      value: 'contact.company',
      label: t('variables.company_name', 'Company Name'),
      description: t('variables.company_name_desc', 'Contact company or organization'),
      icon: <Building className="w-4 h-4" />,
      category: 'contact'
    },
    {
      value: 'date.today',
      label: t('variables.current_date', 'Current Date'),
      description: t('variables.current_date_desc', 'Today\'s date'),
      icon: <Calendar className="w-4 h-4" />,
      category: 'system'
    },
    {
      value: 'time.now',
      label: t('variables.current_time', 'Current Time'),
      description: t('variables.current_time_desc', 'Current time'),
      icon: <Calendar className="w-4 h-4" />,
      category: 'system'
    },
    {
      value: 'datetime.now',
      label: t('variables.current_datetime', 'Current Date & Time'),
      description: t('variables.current_datetime_desc', 'Current date and time'),
      icon: <Calendar className="w-4 h-4" />,
      category: 'system'
    },
    {
      value: 'appointment.date',
      label: t('variables.appointment_date', 'Appointment Date'),
      description: t('variables.appointment_date_desc', 'Date of the next active dental appointment'),
      icon: <Calendar className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.start_time',
      label: t('variables.appointment_start_time', 'Appointment Start Time'),
      description: t('variables.appointment_start_time_desc', 'Start time of the next active dental appointment'),
      icon: <Clock3 className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.end_time',
      label: t('variables.appointment_end_time', 'Appointment End Time'),
      description: t('variables.appointment_end_time_desc', 'End time of the next active dental appointment'),
      icon: <Clock3 className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.duration',
      label: t('variables.appointment_duration', 'Appointment Duration'),
      description: t('variables.appointment_duration_desc', 'Duration in minutes'),
      icon: <Clock3 className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.service',
      label: t('variables.appointment_service', 'Appointment Service'),
      description: t('variables.appointment_service_desc', 'Booked dental service'),
      icon: <Stethoscope className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.provider',
      label: t('variables.appointment_provider', 'Appointment Provider'),
      description: t('variables.appointment_provider_desc', 'Assigned dental provider'),
      icon: <User className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.office',
      label: t('variables.appointment_office', 'Appointment Office'),
      description: t('variables.appointment_office_desc', 'Assigned office or location'),
      icon: <MapPin className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.status',
      label: t('variables.appointment_status', 'Appointment Status'),
      description: t('variables.appointment_status_desc', 'Current appointment status'),
      icon: <Calendar className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'appointment.notes',
      label: t('variables.appointment_notes', 'Appointment Notes'),
      description: t('variables.appointment_notes_desc', 'Appointment notes'),
      icon: <Calendar className="w-4 h-4" />,
      category: 'appointment'
    },
    {
      value: 'company.name',
      label: t('variables.company_name', 'Company Name'),
      description: t('variables.company_name_desc', 'Your company name'),
      icon: <Building className="w-4 h-4" />,
      category: 'company'
    },
    {
      value: 'company.timezone',
      label: t('variables.company_timezone', 'Company Timezone'),
      description: t('variables.company_timezone_desc', 'Timezone used for appointment dates and times'),
      icon: <Clock3 className="w-4 h-4" />,
      category: 'company'
    }
  ];

  const groupedVariables = variableOptions.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, typeof variableOptions>);
  const variableCategoryLabel = (category: string) => {
    if (category === 'contact') return t('variables.contact_info', 'Contact Information');
    if (category === 'appointment') return t('variables.appointment_info', 'Dental Appointment');
    if (category === 'company') return t('variables.company_info', 'Company Information');
    return t('variables.system_info', 'System Information');
  };
  const variableCategoryIcon = (category: string) => {
    if (category === 'contact') return <User className="w-4 h-4" />;
    if (category === 'appointment') return <Calendar className="w-4 h-4" />;
    if (category === 'company') return <Building className="w-4 h-4" />;
    return <Clock3 className="w-4 h-4" />;
  };

  useEffect(() => {
    if (conversation || contact) {
      const context = createVariableContext(conversation, contact);
      setVariableContext(context);
    }
  }, [conversation, contact]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['quick-reply-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/quick-replies');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      return data.data || [];
    },
    staleTime: 30000,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: { name: string; content: string; category: string }) => {
      const response = await apiRequest('POST', '/api/quick-replies', templateData);
      if (!response.ok) throw new Error('Failed to create template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      setIsCreateModalOpen(false);
      setNewTemplate({ name: '', content: '', category: 'general' });
      toast({
        title: t('quick_replies.template_created', 'Template Created'),
        description: t('quick_replies.template_created_desc', 'Your quick reply template has been created successfully.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('quick_replies.create_error', 'Error'),
        description: t('quick_replies.create_error_desc', 'Failed to create template. Please try again.'),
        variant: 'destructive',
      });
    },
  });



  const editTemplateMutation = useMutation({
    mutationFn: async (templateData: { id: number; name: string; content: string; category: string }) => {
      const response = await apiRequest('PUT', `/api/quick-replies/${templateData.id}`, {
        name: templateData.name,
        content: templateData.content,
        category: templateData.category
      });
      if (!response.ok) throw new Error('Failed to update template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      setIsEditModalOpen(false);
      setEditingTemplate(null);
      toast({
        title: t('quick_replies.template_updated', 'Template Updated'),
        description: t('quick_replies.template_updated_desc', 'Your quick reply template has been updated successfully.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('quick_replies.update_error', 'Error'),
        description: t('quick_replies.update_error_desc', 'Failed to update template. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await apiRequest('DELETE', `/api/quick-replies/${templateId}`);
      if (!response.ok) throw new Error('Failed to delete template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      setIsDeleteDialogOpen(false);
      setTemplateToDelete(null);
      toast({
        title: t('quick_replies.template_deleted', 'Template Deleted'),
        description: t('quick_replies.template_deleted_desc', 'Your quick reply template has been deleted successfully.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('quick_replies.delete_error', 'Error'),
        description: t('quick_replies.delete_error_desc', 'Failed to delete template. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async (template: QuickReplyTemplate) => {
      const response = await apiRequest('POST', '/api/quick-replies', {
        name: `Copy of ${template.name}`,
        content: template.content,
        category: template.category
      });
      if (!response.ok) throw new Error('Failed to duplicate template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      toast({
        title: t('quick_replies.template_duplicated', 'Template Duplicated'),
        description: t('quick_replies.template_duplicated_desc', 'Your quick reply template has been duplicated successfully.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('quick_replies.duplicate_error', 'Error'),
        description: t('quick_replies.duplicate_error_desc', 'Failed to duplicate template. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const filteredTemplates = templates.filter((template: QuickReplyTemplate) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleSelectTemplate = useCallback(async (template: QuickReplyTemplate) => {
    if (!hasVariables(template.content)) {
      onSelectTemplate(template.content);
      setIsOpen(false);
      setSearchTerm('');
      return;
    }

    setResolvingTemplateId(template.id);
    try {
      const response = await apiRequest('POST', `/api/quick-replies/${template.id}/render`, {
        conversationId: conversation?.id,
        locale: currentLanguage?.code || 'en',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || 'QUICK_REPLY_RENDER_FAILED');
      onSelectTemplate(data.data.content);
      setIsOpen(false);
      setSearchTerm('');
    } catch (error) {
      const code = (error as Error & { errorCode?: string })?.errorCode || 'QUICK_REPLY_RENDER_FAILED';
      toast({
        title: t('quick_replies.variable_resolution_failed', 'Could not prepare quick response'),
        description: code === 'DENTAL_APPOINTMENT_NOT_FOUND'
          ? t('quick_replies.no_upcoming_dental_appointment', 'This patient has no upcoming active dental appointment to use for these variables.')
          : code === 'DENTAL_APPOINTMENT_ACCESS_DENIED'
            ? t('quick_replies.dental_appointment_access_denied', 'You do not have permission to use dental appointment details in messages.')
          : t('quick_replies.variable_resolution_failed_desc', 'Some template variables could not be resolved. The message was not inserted.'),
        variant: 'destructive',
      });
    } finally {
      setResolvingTemplateId(null);
    }
  }, [conversation?.id, currentLanguage?.code, onSelectTemplate, t, toast]);

  const handleCreateTemplate = () => {
    if (!newTemplate.name.trim() || !newTemplate.content.trim()) {
      toast({
        title: t('quick_replies.validation_error', 'Validation Error'),
        description: t('quick_replies.name_content_required', 'Name and content are required.'),
        variant: 'destructive',
      });
      return;
    }

    createTemplateMutation.mutate(newTemplate);
  };

  const handleEditTemplate = (template: QuickReplyTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTemplate(template);
    setIsEditModalOpen(true);
  };

  const handleSaveEditedTemplate = () => {
    if (!editingTemplate || !editingTemplate.name.trim() || !editingTemplate.content.trim()) {
      toast({
        title: t('quick_replies.validation_error', 'Validation Error'),
        description: t('quick_replies.name_content_required', 'Name and content are required.'),
        variant: 'destructive',
      });
      return;
    }

    editTemplateMutation.mutate({
      id: editingTemplate.id,
      name: editingTemplate.name,
      content: editingTemplate.content,
      category: editingTemplate.category
    });
  };

  const handleDeleteTemplate = (template: QuickReplyTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setTemplateToDelete(template);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (templateToDelete) {
      deleteTemplateMutation.mutate(templateToDelete.id);
    }
  };

  const handleDuplicateTemplate = (template: QuickReplyTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateTemplateMutation.mutate(template);
  };

  const handleInsertVariableCreate = (variableValue: string) => {
    const textarea = createContentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variableText = `{{${variableValue}}}`;

    const newValue = newTemplate.content.substring(0, start) + variableText + newTemplate.content.substring(end);
    setNewTemplate(prev => ({ ...prev, content: newValue }));

    setTimeout(() => {
      const newCursorPosition = start + variableText.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);

    setIsCreateVariableOpen(false);
  };

  const handleInsertVariableEdit = (variableValue: string) => {
    const textarea = editContentRef.current;
    if (!textarea || !editingTemplate) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variableText = `{{${variableValue}}}`;

    const newValue = editingTemplate.content.substring(0, start) + variableText + editingTemplate.content.substring(end);
    setEditingTemplate(prev => prev ? { ...prev, content: newValue } : null);

    setTimeout(() => {
      const newCursorPosition = start + variableText.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);

    setIsEditVariableOpen(false);
  };

  const getTemplatePreview = (template: QuickReplyTemplate) => {
    if (hasVariables(template.content)) {
      const preview = previewTemplate(template.content, variableContext);
      return preview.preview;
    }
    return template.content;
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button data-tour="components-conversations-quickreplypanel.button.quick_replies.use_quick_response"
            variant="ghost"
            size="sm"
            className={`flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-accent ${className}`}
            title={t('quick_replies.use_quick_response', 'Use a Quick Response')}
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">{t('quick_replies.quick_reply', 'Quick Reply')}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="top">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm text-foreground">
                {t('quick_replies.use_quick_response', 'Use a Quick Response')}
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
              <Input data-tour="components-conversations-quickreplypanel.input.quick_replies.search"
                placeholder={t('quick_replies.search', 'Search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {t('quick_replies.loading', 'Loading templates...')}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {searchTerm 
                    ? t('quick_replies.no_results', 'No templates found')
                    : t('quick_replies.no_templates', 'No templates available')
                  }
                </div>
              ) : (
                filteredTemplates.map((template: QuickReplyTemplate) => (
                  <div
                    key={template.id}
                    className={cn('relative rounded-lg border border-transparent p-3 transition-colors group', resolvingTemplateId === template.id ? 'cursor-wait bg-accent/70' : 'cursor-pointer hover:border-border hover:bg-accent')}
                    onClick={() => { if (resolvingTemplateId == null) void handleSelectTemplate(template); }}
                    onMouseEnter={() => setHoveredTemplateId(template.id)}
                    onMouseLeave={() => setHoveredTemplateId(null)}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h5 className="font-medium text-sm text-foreground truncate pr-2">
                        {template.name}
                      </h5>
                      <div className="flex items-center gap-1">
                        {resolvingTemplateId === template.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                        <div className={`flex items-center gap-1 transition-opacity duration-200 ${
                          hoveredTemplateId === template.id ? 'opacity-100' : 'opacity-0'
                        }`}>
                          <button data-tour="components-conversations-quickreplypanel.button.quick_replies.edit_template"
                            onClick={(e) => handleEditTemplate(template, e)}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title={t('quick_replies.edit_template', 'Edit template')}
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button data-tour="components-conversations-quickreplypanel.button.quick_replies.duplicate_template"
                            onClick={(e) => handleDuplicateTemplate(template, e)}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title={t('quick_replies.duplicate_template', 'Duplicate template')}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button data-tour="components-conversations-quickreplypanel.button.quick_replies.delete_template"
                            onClick={(e) => handleDeleteTemplate(template, e)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title={t('quick_replies.delete_template', 'Delete template')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {getTemplatePreview(template)}
                    </p>
                    {hasVariables(template.content) && (
                      <div className="flex items-center mt-1">
                        <Star className="h-3 w-3 text-yellow-500 mr-1" />
                        <span className="text-xs text-yellow-600">
                          {t('quick_replies.contains_variables', 'Contains variables')}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <Separator className="my-3" />

            <Button data-tour="components-conversations-quickreplypanel.button.quick_replies.create_new"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('quick_replies.create_new', 'Create a new quick response')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent data-tour="components-conversations-quickreplypanel.dialogcontent.quick_replies.create_template" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('quick_replies.create_template', 'Create Quick Reply Template')}</DialogTitle>
            <DialogDescription>
              {t('quick_replies.create_template_desc', 'Create a new quick reply template for faster responses.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                {t('quick_replies.template_name', 'Template Name')}
              </label>
              <Input data-tour="components-conversations-quickreplypanel.input.quick_replies.template_name_placeholder"
                placeholder={t('quick_replies.template_name_placeholder', 'e.g., Welcome Message')}
                value={newTemplate.name}
                onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                {t('quick_replies.template_content', 'Template Content')}
              </label>
              <Textarea data-tour="components-conversations-quickreplypanel.textarea.quick_replies.template_content_placeholder"
                ref={createContentRef}
                placeholder={t('quick_replies.template_content_placeholder', 'Enter your template content here...')}
                value={newTemplate.content}
                onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
              />

              <div className="mt-2">
                <Popover open={isCreateVariableOpen} onOpenChange={setIsCreateVariableOpen}>
                  <PopoverTrigger asChild>
                    <Button data-tour="components-conversations-quickreplypanel.button.variables.insert_variable"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      type="button"
                    >
                      <Variable className="w-4 h-4" />
                      {t('variables.insert_variable', 'Insert Variable')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder={t('variables.search_placeholder', 'Search variables...')}
                      />
                      <CommandList>
                        <CommandEmpty>{t('variables.no_variables_found', 'No variables found.')}</CommandEmpty>

                        {Object.entries(groupedVariables).map(([category, variables]) => (
                          <CommandGroup
                            key={category}
                            heading={
                              <div className="flex items-center gap-2">
                                {variableCategoryIcon(category)}
                                {variableCategoryLabel(category)}
                              </div>
                            }
                          >
                            {variables.map((variable) => (
                              <CommandItem
                                key={variable.value}
                                value={variable.value}
                                onSelect={() => handleInsertVariableCreate(variable.value)}
                                className="flex items-center gap-3 p-3"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {variable.icon}
                                  <div className="flex-1">
                                    <div className="font-medium">{variable.label}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {variable.description}
                                    </div>
                                  </div>
                                  <code className="text-xs bg-muted px-2 py-1 rounded">
                                    {`{{${variable.value}}}`}
                                  </code>
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
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="components-conversations-quickreplypanel.button.common.cancel" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-conversations-quickreplypanel.button.common.creating"
              onClick={handleCreateTemplate}
              disabled={createTemplateMutation.isPending}
            >
              {createTemplateMutation.isPending 
                ? t('common.creating', 'Creating...') 
                : t('common.create', 'Create')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent data-tour="components-conversations-quickreplypanel.dialogcontent.quick_replies.edit_template" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('quick_replies.edit_template', 'Edit Quick Reply Template')}</DialogTitle>
            <DialogDescription>
              {t('quick_replies.edit_template_desc', 'Update your quick reply template.')}
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  {t('quick_replies.template_name', 'Template Name')}
                </label>
                <Input data-tour="components-conversations-quickreplypanel.input.quick_replies.template_name_placeholder"
                  placeholder={t('quick_replies.template_name_placeholder', 'e.g., Welcome Message')}
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  {t('quick_replies.template_content', 'Template Content')}
                </label>
                <Textarea data-tour="components-conversations-quickreplypanel.textarea.quick_replies.template_content_placeholder"
                  ref={editContentRef}
                  placeholder={t('quick_replies.template_content_placeholder', 'Enter your template content here...')}
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, content: e.target.value } : null)}
                  rows={4}
                />

                <div className="mt-2">
                  <Popover open={isEditVariableOpen} onOpenChange={setIsEditVariableOpen}>
                    <PopoverTrigger asChild>
                      <Button data-tour="components-conversations-quickreplypanel.button.variables.insert_variable"
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        type="button"
                      >
                        <Variable className="w-4 h-4" />
                        {t('variables.insert_variable', 'Insert Variable')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t('variables.search_placeholder', 'Search variables...')}
                        />
                        <CommandList>
                          <CommandEmpty>{t('variables.no_variables_found', 'No variables found.')}</CommandEmpty>

                          {Object.entries(groupedVariables).map(([category, variables]) => (
                            <CommandGroup
                              key={category}
                              heading={
                                <div className="flex items-center gap-2">
                                  {variableCategoryIcon(category)}
                                  {variableCategoryLabel(category)}
                                </div>
                              }
                            >
                              {variables.map((variable) => (
                                <CommandItem
                                  key={variable.value}
                                  value={variable.value}
                                  onSelect={() => handleInsertVariableEdit(variable.value)}
                                  className="flex items-center gap-3 p-3"
                                >
                                  <div className="flex items-center gap-2 flex-1">
                                    {variable.icon}
                                    <div className="flex-1">
                                      <div className="font-medium">{variable.label}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {variable.description}
                                      </div>
                                    </div>
                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                      {`{{${variable.value}}}`}
                                    </code>
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
              </div>
            </div>
          )}

          <DialogFooter>
            <Button data-tour="components-conversations-quickreplypanel.button.common.cancel" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-conversations-quickreplypanel.button.common.saving"
              onClick={handleSaveEditedTemplate}
              disabled={editTemplateMutation.isPending}
            >
              {editTemplateMutation.isPending
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('quick_replies.delete_template_title', 'Delete Template')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('quick_replies.delete_template_desc', 'Are you sure you want to delete this template? This action cannot be undone.')}
              {templateToDelete && (
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  <strong>{templateToDelete.name}</strong>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending
                ? t('common.deleting', 'Deleting...')
                : t('common.delete', 'Delete')
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
