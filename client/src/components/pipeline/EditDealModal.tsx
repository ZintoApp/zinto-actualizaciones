import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { Deal } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { useTranslation } from '@/hooks/use-translation';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
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
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { CustomFieldFileSelect } from '@/components/contacts/CustomFieldFileSelect';

const createEditDealSchema = (t: (key: string, fallback?: string) => string) => z.object({
  title: z.string().min(2, t('pipeline.validation.title_min', 'Title must be at least 2 characters')),
  stageId: z.string().min(1, t('pipeline.validation.stage_required', 'Please select a pipeline stage')),
  value: z.number().min(0).optional().nullable(),
  contactId: z.number().min(1, t('pipeline.validation.contact_required', 'Please select a contact')),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.date().optional().nullable(),
  assignedToUserId: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

type EditDealFormValues = z.infer<ReturnType<typeof createEditDealSchema>>;

interface EditDealModalProps {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
  activePipelineId?: number | null;
  showPipelineSelector?: boolean;
  lockContact?: boolean;
  onDealUpdated?: (deal: Deal) => void;
}

export default function EditDealModal({ deal, isOpen, onClose, activePipelineId, showPipelineSelector = false, lockContact = false, onDealUpdated }: EditDealModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pipelines, isLoading: isLoadingPipelines } = usePipeline();
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(deal?.pipelineId ?? activePipelineId ?? null);
  const effectivePipelineId = showPipelineSelector ? selectedPipelineId : (deal?.pipelineId || activePipelineId || null);
  const effectivePipeline = pipelines.find((p) => p.id === effectivePipelineId);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [dealCustomFields, setDealCustomFields] = useState<Record<string, any>>({});
  const userChangedPipelineRef = useRef(false);

  const { data: contactsData } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: () => apiRequest('GET', '/api/contacts')
      .then(res => res.json()),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: () => apiRequest('GET', '/api/team-members')
      .then(res => res.json()),
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
        .then(res => res.json());
    },
    enabled: isOpen && !!effectivePipelineId,
  });

  useEffect(() => {
    if (!deal || !isOpen) return;
    setSelectedPipelineId(deal.pipelineId ?? activePipelineId ?? null);
    userChangedPipelineRef.current = false;
  }, [deal?.id, deal?.pipelineId, activePipelineId, isOpen]);

  const editDealSchema = createEditDealSchema(t);
  const form = useForm<EditDealFormValues>({
    resolver: zodResolver(editDealSchema),
    defaultValues: {
      title: '',
      stageId: '',
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
    if (deal && isOpen) {
      form.reset({
        title: deal.title || '',
        stageId: deal.stageId?.toString() || '',
        value: deal.value || null,
        contactId: deal.contactId || undefined,
        priority: deal.priority || 'medium',
        dueDate: deal.dueDate ? new Date(deal.dueDate) : null,
        assignedToUserId: deal.assignedToUserId || null,
        description: deal.description || '',
        tags: deal.tags || [],
      });
      setSelectedTags(deal.tags || []);
      setDealCustomFields(deal.customFields && typeof deal.customFields === 'object' ? { ...deal.customFields } : {});
    }
  }, [deal, isOpen, form]);

  useEffect(() => {
    if (!deal || !isOpen || !lockContact || !deal.contactId) return;
    if (form.getValues('contactId') === deal.contactId) return;

    form.setValue('contactId', deal.contactId, { shouldDirty: false, shouldValidate: false });
  }, [deal, form, isOpen, lockContact]);

  useEffect(() => {
    if (!Array.isArray(pipelineStages) || isLoadingStages) return;

    const currentStage = form.getValues('stageId');
    const currentStageExists = pipelineStages.some((stage: any) => stage.id.toString() === currentStage);

    if (currentStageExists) return;

    if (pipelineStages.length > 0) {
      form.setValue('stageId', pipelineStages[0].id.toString());
      userChangedPipelineRef.current = false;
      return;
    }

    if (currentStage && userChangedPipelineRef.current) {
      form.setValue('stageId', '');
      userChangedPipelineRef.current = false;
    }
  }, [pipelineStages, form, isLoadingStages]);

  const resetForm = () => {
    form.reset();
    setSelectedTags([]);
    setTagInput('');
    setDealCustomFields({});
  };

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

  const updateDealMutation = useMutation({
    mutationFn: async (data: EditDealFormValues) => {
      if (!deal) throw new Error('No deal to update');
      const response = await apiRequest('PATCH', `/api/deals/${deal.id}`, data);
      return response.json();
    },
    onSuccess: (updatedDeal: Deal) => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deal_updated', 'Deal has been updated'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      // Invalidate contacts query to refresh contact tags that were synced
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      resetForm();
      onDealUpdated?.(updatedDeal);
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deal_update_failed_edit', 'Failed to update deal: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: EditDealFormValues) => {
    if (isLoadingStages) return;

    const stageBelongsToPipeline = pipelineStages.some(
      (stage: any) => stage.id.toString() === values.stageId
    );
    if (!stageBelongsToPipeline) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.validation.stage_required', 'Please select a pipeline stage'),
        variant: 'destructive',
      });
      return;
    }

    const customFieldsSanitized = Object.fromEntries(
      Object.entries(dealCustomFields).filter(
        ([_, v]) => v !== undefined && v !== null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
      )
    );
    const submitData = {
      ...values,
      contactId: lockContact ? deal?.contactId ?? values.contactId : values.contactId,
      tags: selectedTags,
      customFields: Object.keys(customFieldsSanitized).length > 0 ? customFieldsSanitized : undefined,
      ...(showPipelineSelector && effectivePipelineId ? { pipelineId: effectivePipelineId } : {}),
    };
    updateDealMutation.mutate(submitData as any);
  };

  const contacts = contactsData?.contacts || [];
  const lockedContactName = contacts.find((contact: any) => contact.id === deal?.contactId)?.name || (deal?.contactId ? `#${deal.contactId}` : '');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
      if (open) {
        resetForm();
      }
    }}>
      <DialogContent data-tour="components-pipeline-editdealmodal.dialogcontent.pipeline.edit_deal" className="sm:max-w-[600px] max-h-[90vh] md:max-h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-8 pt-6 pb-4">
          <DialogTitle>{t('pipeline.edit_deal', 'Edit Deal')}</DialogTitle>
          <DialogDescription>
            {effectivePipeline ? (
              <div className="flex items-center gap-2 mt-1">
                <span>{t('pipeline.deal_in', 'Deal in')}</span>
                {effectivePipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: effectivePipeline.color }}
                  />
                )}
                <Badge variant="secondary">{effectivePipeline.name}</Badge>
              </div>
            ) : (
              t('pipeline.update_deal_information', 'Update the deal information')
            )}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 px-4 py-6 overflow-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 m-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t('pipeline.deal_title', 'Deal Title')}</FormLabel>
                    <FormControl>
                      <Input data-tour="components-pipeline-editdealmodal.input.pipeline.enter_deal_title" {...field} placeholder={t('pipeline.enter_deal_title', 'Enter deal title')} />
                    </FormControl>
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
                      {lockContact ? (
                        <FormControl>
                          <Input data-tour="components-pipeline-editdealmodal.input.lockedContactName" value={lockedContactName} readOnly disabled />
                        </FormControl>
                      ) : (
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString() || undefined}>
                          <FormControl>
                            <SelectTrigger data-tour="components-pipeline-editdealmodal.selecttrigger.pipeline.select_contact">
                              <SelectValue placeholder={t('pipeline.select_contact', 'Select a contact')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contacts.map((contact: any) => (
                              <SelectItem key={contact.id} value={contact.id.toString()}>
                                {contact.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showPipelineSelector && (
                  <FormItem>
                    <FormLabel>{t('pipeline.pipeline', 'Pipeline')}</FormLabel>
                    <Select
                      value={effectivePipelineId?.toString() || undefined}
                      onValueChange={(value) => {
                        setSelectedPipelineId(parseInt(value));
                        form.setValue('stageId', '');
                        userChangedPipelineRef.current = true;
                      }}
                      disabled={isLoadingPipelines}
                    >
                      <FormControl>
                        <SelectTrigger data-tour="components-pipeline-editdealmodal.selecttrigger.pipeline.select_pipeline">
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
                  name="stageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.pipeline_stage_label', 'Pipeline Stage')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                        disabled={isLoadingStages || !effectivePipelineId || pipelineStages.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger data-tour="components-pipeline-editdealmodal.selecttrigger.pipeline.select_stage">
                            <SelectValue placeholder={t('pipeline.select_stage', 'Select a stage')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pipelineStages.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.id.toString()}>
                              <div className="flex items-center">
                                <div
                                  className="w-3 h-3 rounded-full mr-2"
                                  style={{ backgroundColor: stage.color }}
                                />
                                {stage.name}
                              </div>
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
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.deal_value_dollar', 'Deal Value ($)')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
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
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-tour="components-pipeline-editdealmodal.selecttrigger.pipeline.select_priority">
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
                  name="assignedToUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.assigned_to', 'Assigned To')}</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === 'unassigned' ? null : parseInt(value))}
                        value={field.value?.toString() || 'unassigned'}
                      >
                        <FormControl>
                          <SelectTrigger data-tour="components-pipeline-editdealmodal.selecttrigger.pipeline.select_assignee">
                            <SelectValue placeholder={t('pipeline.select_assignee', 'Select assignee')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">{t('pipeline.unassigned', 'Unassigned')}</SelectItem>
                          {teamMembers.map((member: any) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.fullName || member.username}
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
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.due_date', 'Due Date')}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pipeline.description', 'Description')}</FormLabel>
                    <FormControl>
                      <Textarea data-tour="components-pipeline-editdealmodal.textarea.pipeline.enter_deal_description_placeholder"
                        placeholder={t('pipeline.enter_deal_description_placeholder', 'Enter deal description...')}
                        className="resize-none"
                        rows={3}
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {dealCustomFieldsSchema.length > 0 && (
                <div className="space-y-3">
                  <Label>{t('pipeline.custom_fields', 'Custom Fields')}</Label>
                  <div className="space-y-3">
                    {dealCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; required?: boolean; options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } }) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={`edit-deal-cf-${field.fieldName}`} className="text-sm font-medium">
                          {field.fieldLabel}
                          {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                          {field.fieldType === 'multi_select' && ' (select multiple)'}
                        </Label>
                        {field.fieldType === 'file_select' && deal ? (
                          <CustomFieldFileSelect
                            ownerType="deal"
                            ownerId={deal.id}
                            value={dealCustomFields[field.fieldName]}
                            onChange={(value) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: value }))}
                          />
                        ) : field.fieldType === 'text' && (
                          <Input data-tour="components-pipeline-editdealmodal.input.pipeline.enter_value"
                            id={`edit-deal-cf-${field.fieldName}`}
                            value={dealCustomFields[field.fieldName] ?? ''}
                            onChange={(e) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: e.target.value }))}
                            placeholder={t('pipeline.enter_value', 'Enter value...')}
                          />
                        )}
                        {field.fieldType === 'number' && (
                          <Input data-tour="components-pipeline-editdealmodal.input.pipeline.enter_value"
                            id={`edit-deal-cf-${field.fieldName}`}
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
                            <SelectTrigger data-tour="components-pipeline-editdealmodal.selecttrigger.pipeline.select_option" id={`edit-deal-cf-${field.fieldName}`}>
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
                                    id={`edit-deal-cf-${field.fieldName}-${optVal}`}
                                    checked={selected}
                                    onCheckedChange={(checked) => {
                                      const current = Array.isArray(dealCustomFields[field.fieldName]) ? dealCustomFields[field.fieldName] : [];
                                      const next = checked ? [...current, optVal] : current.filter((v: string) => v !== optVal);
                                      setDealCustomFields(prev => ({ ...prev, [field.fieldName]: next }));
                                    }}
                                  />
                                  <label htmlFor={`edit-deal-cf-${field.fieldName}-${optVal}`} className="text-sm cursor-pointer">
                                    {optLab}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {field.fieldType === 'date' && (
                          <Input
                            id={`edit-deal-cf-${field.fieldName}`}
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
                                id={`edit-deal-cf-${field.fieldName}`}
                                checked={!!dealCustomFields[field.fieldName]}
                                onCheckedChange={(checked) => setDealCustomFields(prev => ({ ...prev, [field.fieldName]: !!checked }))}
                              />
                              <label htmlFor={`edit-deal-cf-${field.fieldName}`} className="text-sm">
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

              <div className="space-y-2">
                <FormLabel>{t('pipeline.tags', 'Tags')}</FormLabel>
                <div className="flex gap-2">
                  <Input data-tour="components-pipeline-editdealmodal.input.pipeline.add_tag_placeholder"
                    placeholder={t('pipeline.add_tag_placeholder', 'Add a tag...')}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1 !bg-muted !text-muted-foreground">
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-muted-foreground/80"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </form>
          </Form>
        </ScrollArea>
        <DialogFooter className="px-8 py-4">
          <Button data-tour="components-pipeline-editdealmodal.button.common.cancel" type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-pipeline-editdealmodal.button.pipeline.updating_deal"
            type="submit"
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateDealMutation.isPending || isLoadingStages}
          >
            {updateDealMutation.isPending ? t('pipeline.updating_deal', 'Updating...') : t('pipeline.update_deal', 'Update Deal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

