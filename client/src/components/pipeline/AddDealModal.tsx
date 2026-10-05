import { readContactAddResult, contactAddFeedback, contactCreationErrorMessage, refreshContactQueries } from '@/components/contacts/contact-add-result';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CalendarIcon, Plus, X, Upload, AlertCircle, CheckCircle, Loader2, User } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';
import { Deal } from '@shared/schema';
import { CustomFieldFileSelect, uploadCustomFieldFile } from '@/components/contacts/CustomFieldFileSelect';
import { missingRequiredContactCustomFields, type ContactCustomFieldDefinition } from '@shared/contact-custom-fields';
import { normalizeUsername, validateUsername } from '@/lib/username-utils';
import { requiresWhatsAppContactIdentity } from '@shared/whatsapp-contact-identity';

const createAddDealSchema = (
  t: (key: string, fallback?: string) => string,
  requireValue = false,
) => z.object({
  title: z.string().min(2, t('pipeline.validation.title_min', 'Title must be at least 2 characters')),
  stage: z.string().min(1, t('pipeline.validation.stage_required', 'Please select a pipeline stage')),
  value: requireValue
    ? z.number({
        required_error: t('pipeline.validation.deal_value_required', 'Deal value is required'),
        invalid_type_error: t('pipeline.validation.deal_value_required', 'Deal value is required'),
      }).min(0, t('pipeline.validation.deal_value_min', 'Deal value must be 0 or greater'))
    : z.number().min(0, t('pipeline.validation.deal_value_min', 'Deal value must be 0 or greater')).optional().nullable(),
  contactId: z.number().min(1, t('pipeline.validation.contact_required', 'Please select a contact')),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.date().optional().nullable(),
  assignedToUserId: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

type AddDealFormValues = z.infer<ReturnType<typeof createAddDealSchema>>;

type AddDealModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activePipelineId?: number | null;
  showPipelineSelector?: boolean;
  onDealCreated?: (deal: Deal) => void;
} & (
  | {
      inboxCreateMode: true;
      initialContactId: number;
    }
  | {
      inboxCreateMode?: false;
      initialContactId?: number | null;
    }
);

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let normalized = phone.replace(/[^\d+]/g, '');
  if (normalized && !normalized.startsWith('+')) {
    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) {
      normalized = '+' + normalized;
    }
  }
  return normalized;
}

function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  if (!phone) return { isValid: true };
  const numericOnly = phone.replace(/[^0-9]/g, '');
  if (numericOnly.length < 7 || numericOnly.length > 15) {
    return { isValid: false, error: 'Phone number must be between 7 and 15 digits' };
  }
  return { isValid: true };
}

export default function AddDealModal({
  isOpen,
  onClose,
  activePipelineId,
  initialContactId,
  showPipelineSelector = false,
  inboxCreateMode = false,
  onDealCreated,
}: AddDealModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { activePipelineId: contextActivePipelineId, activePipeline, pipelines, isLoading: isLoadingPipelines } = usePipeline();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [dealCustomFields, setDealCustomFields] = useState<Record<string, any>>({});
  const [pendingDealFiles, setPendingDealFiles] = useState<Record<string, File | null>>({});
  const [createdDealDraft, setCreatedDealDraft] = useState<Deal | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(activePipelineId ?? contextActivePipelineId ?? null);
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    whatsappUsername: '',
    whatsappUsernameKey: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: '',
    customFields: {} as Record<string, any>,
    avatarFile: null as File | null,
    avatarPreview: '' as string
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [pendingContactFiles, setPendingContactFiles] = useState<Record<string, File | null>>({});
  const [createdContactDraft, setCreatedContactDraft] = useState<any | null>(null);
  const shouldShowPipelineSelector = showPipelineSelector || inboxCreateMode;
  const lockedContactId = inboxCreateMode ? initialContactId ?? null : null;
  const effectivePipelineId = shouldShowPipelineSelector ? selectedPipelineId : (activePipelineId ?? contextActivePipelineId ?? null);
  const effectivePipeline = pipelines.find((pipeline: any) => pipeline.id === effectivePipelineId) || (!shouldShowPipelineSelector ? activePipeline : null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPipelineId(activePipelineId ?? contextActivePipelineId ?? null);
  }, [activePipelineId, contextActivePipelineId, isOpen]);

  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: () => apiRequest('GET', '/api/contacts')
      .then(res => res.json()),
  });

  const { data: initialContact, isLoading: isLoadingInitialContact } = useQuery({
    queryKey: ['/api/contacts', initialContactId],
    queryFn: () => apiRequest('GET', `/api/contacts/${initialContactId}`)
      .then(res => res.json()),
    enabled: isOpen && !!initialContactId,
  });

  const { data: dealsData, isLoading: isLoadingDeals, isFetching: isFetchingDeals } = useQuery({
    queryKey: ['/api/deals', effectivePipelineId],
    queryFn: () => {
      const queryParams = new URLSearchParams();
      if (effectivePipelineId) {
        queryParams.append('pipelineId', effectivePipelineId.toString());
      }
      const url = `/api/deals${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      return apiRequest('GET', url)
        .then(res => res.json());
    },
  });

  const { data: teamMembers = [], isLoading: isLoadingTeam } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: () => apiRequest('GET', '/api/team-members')
      .then(res => res.json()),
  });

  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: dealCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'deal'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=deal');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: pipelineStages = [], isLoading: isLoadingStages } = useQuery({
    queryKey: ['/api/pipeline/stages', effectivePipelineId],
    queryFn: () => {
      const queryParams = new URLSearchParams();
      if (effectivePipelineId) {
        queryParams.append('pipelineId', effectivePipelineId.toString());
      }
      const url = `/api/pipeline/stages${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      return apiRequest('GET', url)
        .then(res => res.json())
        .then(data => {
          return data;
        });
    },
    enabled: !!effectivePipelineId,
  });

  const addDealSchema = createAddDealSchema(t, inboxCreateMode);
  const form = useForm<AddDealFormValues>({
    resolver: zodResolver(addDealSchema),
    defaultValues: {
      title: '',
      stage: '',
      value: null,
      contactId: undefined,
      priority: 'medium',
      dueDate: null,
      assignedToUserId: null,
      description: '',
      tags: [],
    },
  });

  useEffect(() => {
    if (!Array.isArray(pipelineStages)) return;

    const currentStage = form.getValues('stage');
    const currentStageExists = pipelineStages.some((stage: any) => stage.id.toString() === currentStage);

    if (pipelineStages.length > 0 && (!currentStage || !currentStageExists)) {
      form.setValue('stage', pipelineStages[0].id.toString());
      return;
    }

    if (pipelineStages.length === 0 && currentStage) {
      form.setValue('stage', '');
    }
  }, [pipelineStages, form]);

  const resetForm = (contactId: number | null = null) => {
    const nextContactId = inboxCreateMode ? lockedContactId : contactId;
    form.reset({
      title: '',
      stage: Array.isArray(pipelineStages) && pipelineStages.length > 0 ? pipelineStages[0].id.toString() : '',
      value: null,
      contactId: nextContactId ?? undefined,
      priority: 'medium',
      dueDate: null,
      assignedToUserId: null,
      description: '',
      tags: [],
    });
    setSelectedTags([]);
    setTagInput('');
    setDealCustomFields({});
    setPendingDealFiles({});
    setCreatedDealDraft(null);
  };

  useEffect(() => {
    if (isOpen) {
      resetForm(initialContactId ?? null);
    }
  }, [initialContactId, inboxCreateMode, isOpen, lockedContactId]);

  useEffect(() => {
    if (!isOpen || !inboxCreateMode || !lockedContactId) return;
    if (form.getValues('contactId') === lockedContactId) return;

    form.setValue('contactId', lockedContactId, { shouldDirty: false, shouldValidate: false });
  }, [form, inboxCreateMode, isOpen, lockedContactId]);

  const handleAddTag = () => {
    if (tagInput.trim() && !selectedTags.includes(tagInput.trim())) {
      const newTags = [...selectedTags, tagInput.trim()];
      setSelectedTags(newTags);
      form.setValue('tags', newTags);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = selectedTags.filter(t => t !== tag);
    setSelectedTags(newTags);
    form.setValue('tags', newTags);
  };

  const createDealMutation = useMutation({
    mutationFn: async (data: AddDealFormValues & { customFields?: Record<string, unknown> }) => {
      if (!effectivePipelineId) {
        throw new Error('No active pipeline selected');
      }
      let createdDeal = createdDealDraft;
      if (!createdDeal) {
        const response = await apiRequest('POST', '/api/deals', {
          ...data,
          pipelineId: effectivePipelineId,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.message || 'Failed to create deal');
        createdDeal = json as Deal;
        setCreatedDealDraft(createdDeal);
      }
      for (const [fieldName, file] of Object.entries(pendingDealFiles)) {
        if (!file) continue;
        const reference = await uploadCustomFieldFile('deal', createdDeal.id, file, t);
        const response = await apiRequest('PUT', '/api/custom-field-attachments/value', {
          ownerType: 'deal', ownerId: createdDeal.id, fieldName, value: reference,
        });
        if (!response.ok) throw new Error(t('custom_fields.file.assign_failed', 'Failed to assign {{name}}', { name: file.name }));
        setDealCustomFields((current) => ({ ...current, [fieldName]: reference }));
        setPendingDealFiles((current) => ({ ...current, [fieldName]: null }));
      }
      return createdDeal;
    },
    onSuccess: (createdDeal: Deal) => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deal_created', 'Deal has been created'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      // Invalidate contacts query to refresh contact tags that were synced
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      resetForm(lockedContactId);
      onDealCreated?.(createdDeal);
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deal_create_failed', 'Failed to create deal: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: AddDealFormValues) => {
    if (inboxCreateMode && !lockedContactId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.contact_required_inbox', 'A contact is required to create a deal in inbox mode, but none was provided.'),
        variant: 'destructive',
      });
      return;
    }

    const customFieldsSanitized = Object.fromEntries(
      Object.entries(dealCustomFields).filter(
        ([_, v]) => v !== undefined && v !== null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
      )
    );
    createDealMutation.mutate({
      ...values,
      contactId: lockedContactId ?? values.contactId,
      tags: selectedTags,
      customFields: Object.keys(customFieldsSanitized).length > 0 ? customFieldsSanitized : undefined,
    } as any);
  };

  const resetAddContactForm = () => {
    setAddContactForm({
      name: '',
      email: '',
      phone: '',
      whatsappUsername: '',
      whatsappUsernameKey: '',
      company: '',
      identifierType: '',
      identifier: '',
      notes: '',
      tags: '',
      customFields: {},
      avatarFile: null,
      avatarPreview: ''
    });
    setPendingContactFiles({});
    setCreatedContactDraft(null);
  };

  const handleAvatarUpload = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('pipeline.file_too_large', 'File too large'),
        description: t('pipeline.avatar_must_be_less_than_5mb', 'Avatar must be less than 5MB'),
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('pipeline.invalid_file_type', 'Invalid file type'),
        description: t('pipeline.please_select_image_file', 'Please select an image file (JPG, PNG)'),
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setAddContactForm(prev => ({
        ...prev,
        avatarFile: file,
        avatarPreview: e.target?.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const addContactMutation = useMutation({
    mutationFn: async (contactData: any) => {
      let newContact = createdContactDraft;
      let creationMeta = newContact?.creationMeta;
      if (!newContact) {
        const response = await apiRequest('POST', '/api/contacts', contactData);
        const result = await readContactAddResult<any>(response);
        if (!result.created) return result;
        newContact = result.contact;
        creationMeta = result.creationMeta;
        setCreatedContactDraft(newContact);
      }

      if (addContactForm.avatarFile) {
        const formData = new FormData();
        formData.append('avatar', addContactForm.avatarFile);

        const avatarResponse = await apiRequest('POST', `/api/contacts/${newContact.id}/avatar`, formData);

        if (avatarResponse.ok) {
          const avatarData = await avatarResponse.json();
          newContact.avatarUrl = avatarData.avatarUrl;
        }
      }

      for (const [fieldName, file] of Object.entries(pendingContactFiles)) {
        if (!file) continue;
        const reference = await uploadCustomFieldFile('contact', newContact.id, file, t);
        const response = await apiRequest('PUT', '/api/custom-field-attachments/value', {
          ownerType: 'contact', ownerId: newContact.id, fieldName, value: reference,
        });
        if (!response.ok) throw new Error(t('custom_fields.file.assign_failed', 'Failed to assign {{name}}', { name: file.name }));
        setAddContactForm((current) => ({
          ...current,
          customFields: { ...current.customFields, [fieldName]: reference },
        }));
        setPendingContactFiles((current) => ({ ...current, [fieldName]: null }));
      }

      return { contact: newContact, created: true, creationMeta };
    },
    onMutate: () => {
      setIsSubmittingContact(true);
    },
    onSuccess: (result) => {
      const newContact = result.contact;
      toast(contactAddFeedback(result, t));
      refreshContactQueries(queryClient);

      setIsAddContactDialogOpen(false);
      resetAddContactForm();
      
      // Select the newly created contact
      form.setValue('contactId', newContact.id);
    },
    onError: (error: Error & { errorCode?: string }) => {
      toast({
        title: t('pipeline.creation_failed', 'Creation failed'),
        description: contactCreationErrorMessage(error, t),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmittingContact(false);
    }
  });

  const handleAddContactSubmit = () => {
    if (!addContactForm.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.contact_name_required', 'Contact name is required'),
        variant: 'destructive'
      });
      return;
    }

    if (addContactForm.phone) {
      const phoneValidation = validatePhoneNumber(addContactForm.phone);
      if (!phoneValidation.isValid) {
        toast({
          title: t('common.error', 'Error'),
          description: phoneValidation.error,
          variant: 'destructive'
        });
        return;
      }
    }

    if (addContactForm.whatsappUsername && !validateUsername(addContactForm.whatsappUsername)) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.creation.error.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores.'),
        variant: 'destructive',
      });
      return;
    }

    if (requiresWhatsAppContactIdentity(addContactForm)) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.creation.error.identity_required', 'Enter a phone number or WhatsApp username.'),
        variant: 'destructive',
      });
      return;
    }

    if (missingRequiredContactCustomFields(contactCustomFieldsSchema as ContactCustomFieldDefinition[], {
      ...addContactForm.customFields,
      ...Object.fromEntries(Object.entries(pendingContactFiles).filter(([, file]) => Boolean(file))),
    }).length > 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('custom_fields.editor.complete_required', 'Complete all required custom fields.'),
        variant: 'destructive',
      });
      return;
    }

    const tagsArray = addContactForm.tags
      ? addContactForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];

    const normalizedPhone = addContactForm.phone ? normalizePhoneNumber(addContactForm.phone) : '';

    const customFieldsSanitized = Object.fromEntries(
      Object.entries(addContactForm.customFields || {}).filter(
        ([_, v]) => v !== undefined && v !== null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
      )
    );

    addContactMutation.mutate({
      ...addContactForm,
      phone: normalizedPhone,
      whatsappUsername: addContactForm.whatsappUsername
        ? normalizeUsername(addContactForm.whatsappUsername)
        : undefined,
      tags: tagsArray,
      customFields: customFieldsSanitized
    });
  };

  const selectableContacts = useMemo(() => {
    const contacts = Array.isArray(contactsData?.contacts) ? [...contactsData.contacts] : [];

    if (initialContact && !contacts.some((contact: any) => contact.id === initialContact.id)) {
      contacts.unshift(initialContact);
    }

    return contacts;
  }, [contactsData?.contacts, initialContact]);

  const contactHasActiveDealConflict = useCallback((contactId: number) => {
    if (!dealsData || !Array.isArray(dealsData)) return false;

    if (!effectivePipelineId) {
      return dealsData.some((deal: any) =>
        deal.contactId === contactId && deal.status === 'active'
      );
    }

    return dealsData.some((deal: any) =>
      deal.contactId === contactId &&
      deal.status === 'active' &&
      deal.pipelineId === effectivePipelineId
    );
  }, [dealsData, effectivePipelineId]);

  // Filter out contacts that already have active deals in the current pipeline
  const availableContacts = useMemo(() => selectableContacts.filter((contact: any) => {
    if (!dealsData || !Array.isArray(dealsData)) return true;
    return !contactHasActiveDealConflict(contact.id);
  }), [selectableContacts, dealsData, contactHasActiveDealConflict]);

  useEffect(() => {
    if (!isOpen || isLoadingContacts || isLoadingDeals || isFetchingDeals) return;
    if (!Array.isArray(dealsData)) return;

    const currentContactId = form.getValues('contactId');
    if (!currentContactId) return;

    if (inboxCreateMode && lockedContactId === currentContactId) return;

    if (contactHasActiveDealConflict(currentContactId)) {
      form.setValue('contactId', undefined as unknown as AddDealFormValues['contactId'], { shouldDirty: true, shouldValidate: true });
    }
  }, [contactHasActiveDealConflict, dealsData, form, inboxCreateMode, isFetchingDeals, isLoadingContacts, isLoadingDeals, isOpen, lockedContactId]);

  const stageLabel = inboxCreateMode
    ? t('pipeline.pipeline_stage_label', 'Pipeline Stage')
    : t('pipeline.stage', 'Stage');
  const titleFieldClassName = inboxCreateMode ? undefined : 'md:col-span-2';

  const isLoadingData = isLoadingStages || isLoadingContacts || isLoadingInitialContact || isLoadingDeals || isFetchingDeals || isLoadingTeam || isLoadingPipelines;
  const isCreateDisabled = createDealMutation.isPending || isLoadingData || !effectivePipelineId || !form.watch('stage') ||
    (inboxCreateMode && !lockedContactId) ||
    missingRequiredContactCustomFields(dealCustomFieldsSchema as ContactCustomFieldDefinition[], {
      ...dealCustomFields,
      ...Object.fromEntries(Object.entries(pendingDealFiles).filter(([, file]) => Boolean(file))),
    }).length > 0;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent data-tour="components-pipeline-adddealmodal.dialogcontent.pipeline.add_new_deal" className="sm:max-w-[600px] max-h-[90vh] md:max-h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-8 pt-6 pb-4">
          <DialogTitle>{t('pipeline.add_new_deal', 'Add New Deal')}</DialogTitle>
          <DialogDescription>
            {effectivePipeline ? (
              <div className="flex items-center gap-2 mt-1">
                <span>{t('pipeline.adding_deal_to', 'Adding deal to')}</span>
                {effectivePipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: effectivePipeline.color }}
                  />
                )}
                <Badge variant="secondary">{effectivePipeline.name}</Badge>
              </div>
            ) : (
              t('pipeline.create_new_deal', 'Create a new deal in your pipeline')
            )}
          </DialogDescription>
        </DialogHeader>
        {isLoadingData && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">{t('pipeline.loading_form_data', 'Loading form data...')}</span>
          </div>
        )}
        <ScrollArea className="flex-1 px-4 py-6 overflow-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 m-2">
              {inboxCreateMode ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {!lockedContactId && (
                    <div className="md:col-span-2 flex items-start gap-2 p-3 bg-destructive/15 text-destructive rounded-md text-sm border border-destructive/20">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">{t('pipeline.error', 'Error')}</p>
                        <p>{t('pipeline.contact_required_inbox', 'A contact is required to create a deal in inbox mode, but none was provided.')}</p>
                      </div>
                    </div>
                  )}
                  {shouldShowPipelineSelector && (
                    <FormItem>
                      <FormLabel>{t('pipeline.pipeline', 'Pipeline')}</FormLabel>
                      <Select
                        value={effectivePipelineId?.toString() || undefined}
                        onValueChange={(value) => {
                          setSelectedPipelineId(parseInt(value));
                          form.setValue('stage', '');
                        }}
                        disabled={isLoadingPipelines}
                      >
                        <FormControl>
                          <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_pipeline">
                            <SelectValue placeholder={t('pipeline.select_pipeline', 'Select pipeline')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pipelines.map((pipeline: any) => (
                            <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                              {pipeline.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}

                  <FormField
                    control={form.control}
                    name="stage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{stageLabel}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={isLoadingStages || !effectivePipelineId || pipelineStages.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_stage">
                              <SelectValue placeholder={t('pipeline.select_stage', 'Select stage')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {pipelineStages.map((stage: any) => (
                              <SelectItem key={stage.id} value={stage.id.toString()}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className={titleFieldClassName}>
                        <FormLabel>{t('pipeline.deal_title', 'Deal Title')}</FormLabel>
                        <FormControl>
                          <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_deal_title" {...field} placeholder={t('pipeline.enter_deal_title', 'Enter deal title')} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pipeline.deal_value', 'Deal Value')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0.00"
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseFloat(e.target.value);
                              field.onChange(value);
                            }}
                            value={field.value === null ? '' : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className={titleFieldClassName}>
                        <FormLabel>{t('pipeline.deal_title', 'Deal Title')}</FormLabel>
                        <FormControl>
                          <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_deal_title" {...field} placeholder={t('pipeline.enter_deal_title', 'Enter deal title')} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pipeline.deal_value', 'Deal Value')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0.00"
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseFloat(e.target.value);
                              field.onChange(value);
                            }}
                            value={field.value === null ? '' : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {shouldShowPipelineSelector && (
                    <FormItem>
                      <FormLabel>{t('pipeline.pipeline', 'Pipeline')}</FormLabel>
                      <Select
                        value={effectivePipelineId?.toString() || undefined}
                        onValueChange={(value) => {
                          setSelectedPipelineId(parseInt(value));
                          form.setValue('stage', '');
                        }}
                        disabled={isLoadingPipelines}
                      >
                        <FormControl>
                          <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_pipeline">
                            <SelectValue placeholder={t('pipeline.select_pipeline', 'Select pipeline')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pipelines.map((pipeline: any) => (
                            <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                              {pipeline.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}

                  <FormField
                    control={form.control}
                    name="stage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{stageLabel}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={isLoadingStages || !effectivePipelineId || pipelineStages.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_stage">
                              <SelectValue placeholder={t('pipeline.select_stage', 'Select stage')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {pipelineStages.map((stage: any) => (
                              <SelectItem key={stage.id} value={stage.id.toString()}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pipeline.contact', 'Contact')}</FormLabel>
                        <div className="flex gap-2">
                          <Select
                            onValueChange={(value) => field.onChange(value === 'none' ? null : parseInt(value))}
                            value={field.value?.toString() || 'none'}
                          >
                            <FormControl>
                              <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_contact" className="flex-1">
                                <SelectValue placeholder={t('pipeline.select_contact', 'Select contact')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableContacts.length > 0 ? (
                                <>
                                  <SelectItem value="none">{t('pipeline.none', 'None')}</SelectItem>
                                  {availableContacts.map((contact: any) => (
                                    <SelectItem key={contact.id} value={contact.id.toString()}>
                                      {contact.name || contact.fullName || contact.phone || contact.phoneNumber}
                                    </SelectItem>
                                  ))}
                                </>
                              ) : (
                                <SelectItem value="no-contacts" disabled>
                                  {t('pipeline.no_contacts_available', 'No contacts available')}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <Button data-tour="components-pipeline-adddealmodal.button.pipeline.add_new_contact"
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setIsAddContactDialogOpen(true)}
                            className="flex-shrink-0"
                            title={t('pipeline.add_new_contact', 'Add new contact')}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pipeline.priority', 'Priority')}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_priority">
                              <SelectValue placeholder={t('pipeline.select_priority', 'Select priority')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">{t('pipeline.low', 'Low')}</SelectItem>
                            <SelectItem value="medium">{t('pipeline.medium', 'Medium')}</SelectItem>
                            <SelectItem value="high">{t('pipeline.high', 'High')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t('pipeline.due_date', 'Due Date')}</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button data-tour="components-pipeline-adddealmodal.button.pipeline.pick_date"
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>{t('pipeline.pick_date', 'Pick a date')}</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date(new Date().setHours(0, 0, 0, 0))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assignedToUserId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pipeline.assigned_to', 'Assigned To')}</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === 'unassigned' ? null : parseInt(value))}
                          value={field.value?.toString() || 'unassigned'}
                        >
                          <FormControl>
                            <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.assign_to">
                              <SelectValue placeholder={t('pipeline.assign_to', 'Assign to')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="unassigned">{t('pipeline.unassigned', 'Unassigned')}</SelectItem>
                            {teamMembers.map((user: any) => (
                              <SelectItem key={user.id} value={user.id.toString()}>
                                {user.fullName || user.username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('pipeline.tags', 'Tags')}</FormLabel>
                    <div className="flex gap-2">
                      <Input data-tour="components-pipeline-adddealmodal.input.pipeline.add_tags"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder={t('pipeline.add_tags', 'Add tags')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button type="button" size="sm" onClick={handleAddTag}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="flex items-center !bg-muted !text-muted-foreground">
                          {tag}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                            onClick={() => handleRemoveTag(tag)}
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <FormDescription>{t('pipeline.press_enter_to_add_tag', 'Press Enter or click Add to add a tag')}</FormDescription>
                  </FormItem>

                  {dealCustomFieldsSchema.length > 0 && (
                    <div className="space-y-3 md:col-span-2">
                      <Label>{t('pipeline.custom_fields', 'Custom Fields')}</Label>
                      <div className="space-y-3">
                        {dealCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; required?: boolean; options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } }) => (
                          <div key={field.id} className="space-y-2">
                            <Label htmlFor={`add-deal-dcf-${field.fieldName}`} className="text-sm font-medium">
                              {field.fieldLabel}
                              {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                              {field.fieldType === 'multi_select' && ' (select multiple)'}
                            </Label>
                            {field.fieldType === 'file_select' ? (
                              <CustomFieldFileSelect
                                ownerType="deal"
                                ownerId={createdDealDraft?.id}
                                value={dealCustomFields[field.fieldName]}
                                pendingFile={pendingDealFiles[field.fieldName]}
                                onChange={(value) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: value }))}
                                onPendingFileChange={(file) => setPendingDealFiles(prev => ({ ...prev, [field.fieldName]: file }))}
                              />
                            ) : field.fieldType === 'text' && (
                              <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_value"
                                id={`add-deal-dcf-${field.fieldName}`}
                                value={dealCustomFields[field.fieldName] ?? ''}
                                onChange={(e) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: e.target.value }))}
                                placeholder={t('pipeline.enter_value', 'Enter value...')}
                              />
                            )}
                            {field.fieldType === 'number' && (
                              <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_value"
                                id={`add-deal-dcf-${field.fieldName}`}
                                type="number"
                                value={dealCustomFields[field.fieldName] ?? ''}
                                onChange={(e) => setDealCustomFields(prev => ({
                                  ...prev,
                                  [field.fieldName]: e.target.value === '' ? undefined : parseFloat(e.target.value)
                                }))}
                                placeholder={t('pipeline.enter_value', 'Enter value...')}
                              />
                            )}
                            {field.fieldType === 'select' && (
                              <Select
                                value={dealCustomFields[field.fieldName] ?? ''}
                                onValueChange={(value) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: value }))}
                              >
                                <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_option" id={`add-deal-dcf-${field.fieldName}`}>
                                  <SelectValue placeholder={t('pipeline.select_option', 'Select...')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                                    const val = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                                    const lab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                                    return (
                                      <SelectItem key={val} value={val}>
                                        {lab}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                            {field.fieldType === 'multi_select' && (
                              <div className="flex flex-wrap gap-2">
                                {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                                  const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                                  const optLab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                                  const selected = Array.isArray(dealCustomFields[field.fieldName])
                                    ? dealCustomFields[field.fieldName].includes(optVal)
                                    : false;
                                  return (
                                    <div key={optVal} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`add-deal-dcf-${field.fieldName}-${optVal}`}
                                        checked={selected}
                                        onCheckedChange={(checked) => {
                                          const current = Array.isArray(dealCustomFields[field.fieldName]) ? dealCustomFields[field.fieldName] : [];
                                          const next = checked ? [...current, optVal] : current.filter((v: string) => v !== optVal);
                                          setDealCustomFields(prev => ({ ...prev, [field.fieldName]: next }));
                                        }}
                                      />
                                      <label htmlFor={`add-deal-dcf-${field.fieldName}-${optVal}`} className="text-sm cursor-pointer">
                                        {optLab}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {field.fieldType === 'date' && (
                              <Input
                                id={`add-deal-dcf-${field.fieldName}`}
                                type="date"
                                value={dealCustomFields[field.fieldName] ?? ''}
                                onChange={(e) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: e.target.value || undefined }))}
                              />
                            )}
                            {field.fieldType === 'boolean' && (() => {
                              const boolOpts = field.options && !Array.isArray(field.options) ? (field.options as { trueLabel?: string; falseLabel?: string }) : null;
                              const trueLabel = boolOpts?.trueLabel ?? t('common.yes', 'Yes');
                              const falseLabel = boolOpts?.falseLabel ?? t('common.no', 'No');
                              return (
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`add-deal-dcf-${field.fieldName}`}
                                    checked={!!dealCustomFields[field.fieldName]}
                                    onCheckedChange={(checked) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: !!checked }))}
                                  />
                                  <label htmlFor={`add-deal-dcf-${field.fieldName}`} className="text-sm">
                                    {dealCustomFields[field.fieldName] ? trueLabel : falseLabel}
                                  </label>
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>{t('pipeline.description', 'Description')}</FormLabel>
                        <FormControl>
                          <Textarea data-tour="components-pipeline-adddealmodal.textarea.pipeline.enter_deal_description"
                            {...field}
                            placeholder={t('pipeline.enter_deal_description', 'Enter deal description')}
                            className="min-h-[100px]"
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
          </form>
        </Form>
        </ScrollArea>

        <div className="border-t border-border mt-2">
          <DialogFooter className="px-8 py-6 flex flex-row justify-end gap-3 sm:gap-2">
            <Button data-tour="components-pipeline-adddealmodal.button.pipeline.cancel" type="button" variant="outline"  onClick={onClose}>
              {t('pipeline.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-pipeline-adddealmodal.button.pipeline.creating"  variant="outline" className="btn-brand-primary"
              type="submit"
              disabled={isCreateDisabled}
              onClick={form.handleSubmit(onSubmit)}
            >
              {createDealMutation.isPending ? t('pipeline.creating', 'Creating...') : t('pipeline.create_deal', 'Create Deal')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={isAddContactDialogOpen} onOpenChange={setIsAddContactDialogOpen}>
        <DialogContent data-tour="components-pipeline-adddealmodal.dialogcontent.pipeline.add_new_contact_title" className="w-[95vw] max-w-[500px] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>{t('pipeline.add_new_contact_title', 'Add New Contact')}</DialogTitle>
            <DialogDescription>
              {t('pipeline.create_new_contact_desc', 'Create a new contact with the information below.')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-6 pb-4">
            {/* Contact Avatar Upload Section */}
              <div className="flex flex-col items-center space-y-3 p-4 border-2 border-dashed border-border rounded-lg hover:border-border/80 transition-colors">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {addContactForm.avatarPreview ? (
                    <img
                      src={addContactForm.avatarPreview}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm text-foreground">{t('pipeline.upload_contact_photo', 'Upload contact photo')}</p>
                  <p className="text-xs text-muted-foreground">{t('pipeline.optional_jpg_png', 'Optional - JPG, PNG up to 5MB')}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button data-tour="components-pipeline-adddealmodal.button.pipeline.choose_photo"
                    variant="outline"
                    size="sm"
                    disabled={isSubmittingContact}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleAvatarUpload(file);
                      };
                      input.click();
                    }}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('pipeline.choose_photo', 'Choose Photo')}
                  </Button>
                  {addContactForm.avatarPreview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSubmittingContact}
                      onClick={() => setAddContactForm(prev => ({ ...prev, avatarFile: null, avatarPreview: '' }))}
                      className="w-full sm:w-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-name">{t('pipeline.name_required', 'Name *')}</Label>
                  <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_contact_name"
                    id="add-name"
                    value={addContactForm.name}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('pipeline.enter_contact_name', 'Enter contact name')}
                    disabled={isSubmittingContact}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-email">{t('pipeline.email', 'Email')}</Label>
                  <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_email_address"
                    id="add-email"
                    type="email"
                    value={addContactForm.email}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder={t('pipeline.enter_email_address', 'Enter email address')}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-phone">{t('pipeline.phone', 'Phone')}</Label>
                  <LocalizedPhoneInput
                    id="add-phone"
                    value={addContactForm.phone}
                    onChange={(phone) => setAddContactForm(prev => ({ ...prev, phone }))}
                    placeholder="+1234567890"
                    disabled={isSubmittingContact}
                  />
                  {addContactForm.phone && (
                    <div className="text-xs">
                      {validatePhoneNumber(addContactForm.phone).isValid ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {t('pipeline.valid_phone_number', 'Valid phone number')}
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {validatePhoneNumber(addContactForm.phone).error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-whatsapp-username">
                    {t('contacts.add.whatsapp_username_label', 'WhatsApp Username')}
                  </Label>
                  <Input data-tour="components-pipeline-adddealmodal.input.contacts.add.whatsapp_username_placeholder"
                    id="add-whatsapp-username"
                    value={addContactForm.whatsappUsername}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, whatsappUsername: e.target.value }))}
                    placeholder={t('contacts.add.whatsapp_username_placeholder', '@username')}
                    disabled={isSubmittingContact}
                  />
                </div>

                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  {t('contacts.creation.identity_help', 'Enter at least a phone number or WhatsApp username. You may provide both.')}
                </p>

                {addContactForm.whatsappUsername.trim() ? (
                  <div className="sm:col-span-2 space-y-2">
                    <Label htmlFor="add-whatsapp-username-key">
                      {t('contacts.creation.username_key_label', 'Username key (optional)')}
                    </Label>
                    <Input data-tour="components-pipeline-adddealmodal.input.contacts.creation.username_key_placeholder"
                      id="add-whatsapp-username-key"
                      value={addContactForm.whatsappUsernameKey}
                      onChange={(e) => setAddContactForm(prev => ({ ...prev, whatsappUsernameKey: e.target.value }))}
                      placeholder={t('contacts.creation.username_key_placeholder', 'Key shared by the contact')}
                      autoComplete="off"
                      disabled={isSubmittingContact}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('contacts.creation.username_key_help', 'Used only to verify protected usernames and never stored.')}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="add-company">{t('pipeline.company', 'Company')}</Label>
                  <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_company_name"
                    id="add-company"
                    value={addContactForm.company}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, company: e.target.value }))}
                    placeholder={t('pipeline.enter_company_name', 'Enter company name')}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>

              {addContactForm.identifierType === 'whatsapp_official' && addContactForm.whatsappUsername.trim() && !addContactForm.phone.trim() ? (
                <p className="text-xs text-amber-600">
                  {t('contacts.creation.official_help', 'WhatsApp Official cannot initiate by username until the contact messages you first.')}
                </p>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-channel">{t('pipeline.channel', 'Channel')}</Label>
                  <Select
                    value={addContactForm.identifierType}
                    onValueChange={(value) => setAddContactForm(prev => ({ ...prev, identifierType: value }))}
                    disabled={isSubmittingContact}
                  >
                    <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_channel" className="w-full">
                      <SelectValue placeholder={t('pipeline.select_channel', 'Select channel')} />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="whatsapp_official">{t('pipeline.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                      <SelectItem value="whatsapp_unofficial">{t('pipeline.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                      <SelectItem value="messenger">{t('pipeline.facebook_messenger', 'Facebook Messenger')}</SelectItem>
                      <SelectItem value="instagram">{t('pipeline.instagram', 'Instagram')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-identifier">{t('pipeline.channel_identifier', 'Channel Identifier')}</Label>
                  <Input data-tour="components-pipeline-adddealmodal.input.pipeline.phone_number_or_id"
                    id="add-identifier"
                    value={addContactForm.identifier}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, identifier: e.target.value }))}
                    placeholder={t('pipeline.phone_number_or_id', 'Phone number or ID')}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-tags">{t('pipeline.tags', 'Tags')}</Label>
                <Input data-tour="components-pipeline-adddealmodal.input.pipeline.type_tags_separated"
                  id="add-tags"
                  value={addContactForm.tags}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder={t('pipeline.type_tags_separated', 'Type tags separated by commas...')}
                  disabled={isSubmittingContact}
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {['lead', 'customer', 'prospect', 'vip', 'partner'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const currentTags = addContactForm.tags ? addContactForm.tags.split(',').map(t => t.trim()) : [];
                        if (!currentTags.includes(tag)) {
                          const newTags = [...currentTags, tag].join(', ');
                          setAddContactForm(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className="px-2 py-1 text-xs bg-muted hover:bg-accent text-foreground rounded-full transition-colors"
                      disabled={isSubmittingContact}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {contactCustomFieldsSchema.length > 0 && (
                <div className="space-y-3">
                  <Label>{t('pipeline.custom_fields', 'Custom Fields')}</Label>
                  <div className="space-y-3">
                    {contactCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; required?: boolean; options?: { value: string; label: string }[] }) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={`add-deal-cf-${field.fieldName}`} className="text-sm font-medium">
                          {field.fieldLabel}
                          {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                          {field.fieldType === 'multi_select' && ' (select multiple)'}
                        </Label>
                        {field.fieldType === 'file_select' ? (
                          <CustomFieldFileSelect
                            ownerType="contact"
                            ownerId={createdContactDraft?.id}
                            value={addContactForm.customFields[field.fieldName]}
                            pendingFile={pendingContactFiles[field.fieldName]}
                            onChange={(value) => setAddContactForm(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: value },
                            }))}
                            onPendingFileChange={(file) => setPendingContactFiles(prev => ({ ...prev, [field.fieldName]: file }))}
                            disabled={isSubmittingContact}
                          />
                        ) : field.fieldType === 'text' && (
                          <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_value"
                            id={`add-deal-cf-${field.fieldName}`}
                            value={addContactForm.customFields[field.fieldName] ?? ''}
                            onChange={(e) => setAddContactForm(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: e.target.value }
                            }))}
                            placeholder={t('pipeline.enter_value', 'Enter value...')}
                            disabled={isSubmittingContact}
                          />
                        )}
                        {field.fieldType === 'number' && (
                          <Input data-tour="components-pipeline-adddealmodal.input.pipeline.enter_value"
                            id={`add-deal-cf-${field.fieldName}`}
                            type="number"
                            value={addContactForm.customFields[field.fieldName] ?? ''}
                            onChange={(e) => setAddContactForm(prev => ({
                              ...prev,
                              customFields: {
                                ...prev.customFields,
                                [field.fieldName]: e.target.value === '' ? undefined : parseFloat(e.target.value)
                              }
                            }))}
                            placeholder={t('pipeline.enter_value', 'Enter value...')}
                            disabled={isSubmittingContact}
                          />
                        )}
                        {field.fieldType === 'select' && (
                          <Select
                            value={addContactForm.customFields[field.fieldName] ?? ''}
                            onValueChange={(value) => setAddContactForm(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: value }
                            }))}
                            disabled={isSubmittingContact}
                          >
                            <SelectTrigger data-tour="components-pipeline-adddealmodal.selecttrigger.pipeline.select_option" id={`add-deal-cf-${field.fieldName}`}>
                              <SelectValue placeholder={t('pipeline.select_option', 'Select...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                                const val = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                                const lab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                                return (
                                  <SelectItem key={val} value={val}>
                                    {lab}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                        {field.fieldType === 'multi_select' && (
                          <div className="flex flex-wrap gap-2">
                            {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                              const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                              const optLab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                              const selected = Array.isArray(addContactForm.customFields[field.fieldName])
                                ? addContactForm.customFields[field.fieldName].includes(optVal)
                                : false;
                              return (
                                <div key={optVal} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`add-deal-cf-${field.fieldName}-${optVal}`}
                                    checked={selected}
                                    onCheckedChange={(checked) => {
                                      const current = Array.isArray(addContactForm.customFields[field.fieldName])
                                        ? addContactForm.customFields[field.fieldName]
                                        : [];
                                      const next = checked
                                        ? [...current, optVal]
                                        : current.filter((v: string) => v !== optVal);
                                      setAddContactForm(prev => ({
                                        ...prev,
                                        customFields: { ...prev.customFields, [field.fieldName]: next }
                                      }));
                                    }}
                                    disabled={isSubmittingContact}
                                  />
                                  <label htmlFor={`add-deal-cf-${field.fieldName}-${optVal}`} className="text-sm cursor-pointer">
                                    {optLab}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {field.fieldType === 'date' && (
                          <Input
                            id={`add-deal-cf-${field.fieldName}`}
                            type="date"
                            value={addContactForm.customFields[field.fieldName] ?? ''}
                            onChange={(e) => setAddContactForm(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: e.target.value || undefined }
                            }))}
                            disabled={isSubmittingContact}
                          />
                        )}
                        {field.fieldType === 'boolean' && (() => {
                          const boolOpts = field.options && !Array.isArray(field.options) ? (field.options as { trueLabel?: string; falseLabel?: string }) : null;
                          const trueLabel = boolOpts?.trueLabel ?? t('common.yes', 'Yes');
                          const falseLabel = boolOpts?.falseLabel ?? t('common.no', 'No');
                          return (
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`add-deal-cf-${field.fieldName}`}
                                checked={!!addContactForm.customFields[field.fieldName]}
                                onCheckedChange={(checked) => setAddContactForm(prev => ({
                                  ...prev,
                                  customFields: { ...prev.customFields, [field.fieldName]: !!checked }
                                }))}
                                disabled={isSubmittingContact}
                              />
                              <label htmlFor={`add-deal-cf-${field.fieldName}`} className="text-sm">
                                {addContactForm.customFields[field.fieldName] ? trueLabel : falseLabel}
                              </label>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="add-notes">{t('pipeline.notes', 'Notes')}</Label>
                <Textarea data-tour="components-pipeline-adddealmodal.textarea.pipeline.additional_notes_contact"
                  id="add-notes"
                  value={addContactForm.notes}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('pipeline.additional_notes_contact', 'Additional notes about this contact...')}
                  rows={3}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4 border-t flex-col sm:flex-row gap-2">
            <Button data-tour="components-pipeline-adddealmodal.button.pipeline.cancel"
              variant="outline"
              onClick={() => {
                setIsAddContactDialogOpen(false);
                resetAddContactForm();
              }}
              disabled={isSubmittingContact}
              className="w-full sm:w-auto"
            >
              {t('pipeline.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-pipeline-adddealmodal.button.pipeline.creating"
              onClick={handleAddContactSubmit}
              disabled={isSubmittingContact || requiresWhatsAppContactIdentity(addContactForm)}
              className="w-full sm:w-auto"
            >
              {isSubmittingContact ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('pipeline.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('pipeline.create_contact', 'Create Contact')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
