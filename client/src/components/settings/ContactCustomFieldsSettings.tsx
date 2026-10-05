import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Loader2, Plus, Pencil, Trash2, GripVertical, User, Briefcase } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const FIELD_TYPES = [
  { value: 'text', key: 'settings.custom_fields.types.text', fallback: 'Text' },
  { value: 'number', key: 'settings.custom_fields.types.number', fallback: 'Number' },
  { value: 'select', key: 'settings.custom_fields.types.select', fallback: 'Single Select' },
  { value: 'multi_select', key: 'settings.custom_fields.types.multi_select', fallback: 'Multi Select' },
  { value: 'date', key: 'settings.custom_fields.types.date', fallback: 'Date' },
  { value: 'boolean', key: 'settings.custom_fields.types.boolean', fallback: 'Yes/No' },
  { value: 'file_select', key: 'settings.custom_fields.types.file_select', fallback: 'File Select' },
] as const;

interface CustomField {
  id: number;
  entity?: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } | null;
  required?: boolean;
  displayOrder: number;
}

type EntityType = 'contact' | 'deal';

export function ContactCustomFieldsSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [deletingField, setDeletingField] = useState<CustomField | null>(null);
  const [activeEntity, setActiveEntity] = useState<EntityType>('contact');
  const [formData, setFormData] = useState({
    fieldLabel: '',
    fieldType: 'text' as string,
    optionsText: '',
    booleanTrueLabel: 'Yes',
    booleanFalseLabel: 'No',
    required: false,
  });
  const fieldTypeLabel = (fieldType: string) => {
    const type = FIELD_TYPES.find((item) => item.value === fieldType);
    return type ? t(type.key, type.fallback) : fieldType;
  };

  const { data: customFields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ['/api/company/custom-fields', activeEntity],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/company/custom-fields?entity=${activeEntity}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { entity: EntityType; fieldLabel: string; fieldType: string; required: boolean; options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } }) => {
      const res = await apiRequest('POST', '/api/company/custom-fields', {
        entity: data.entity,
        fieldLabel: data.fieldLabel,
        fieldType: data.fieldType,
        options: data.options || null,
        required: data.required,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.custom_fields.created', 'Custom field created'),
        description: t('settings.custom_fields.created_desc', 'The field will appear in contact forms.'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company/custom-fields', activeEntity] });
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: (e: Error) => {
      toast({
        title: t('settings.custom_fields.error', 'Error'),
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { fieldLabel?: string; fieldType?: string; required?: boolean; options?: any } }) => {
      const res = await apiRequest('PATCH', `/api/company/custom-fields/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.custom_fields.updated', 'Custom field updated'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company/custom-fields', activeEntity] });
      setEditingField(null);
      resetForm();
    },
    onError: (e: Error) => {
      toast({
        title: t('settings.custom_fields.error', 'Error'),
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedFields: CustomField[]) => {
      const res = await apiRequest('PUT', '/api/company/custom-fields/reorder', {
        entity: activeEntity,
        customFieldIds: reorderedFields.map((f) => f.id),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to reorder');
      }
    },
    onSuccess: () => {
      toast({
        title: t('settings.custom_fields.reordered', 'Custom fields reordered'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company/custom-fields', 'contact'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company/custom-fields', 'deal'] });
    },
    onError: (e: Error) => {
      toast({
        title: t('settings.custom_fields.error', 'Error'),
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/company/custom-fields/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to delete');
      }
    },
    onSuccess: () => {
      toast({
        title: t('settings.custom_fields.deleted', 'Custom field deleted'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company/custom-fields', 'contact'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company/custom-fields', 'deal'] });
      setDeletingField(null);
    },
    onError: (e: Error) => {
      toast({
        title: t('settings.custom_fields.error', 'Error'),
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      fieldLabel: '',
      fieldType: 'text',
      optionsText: '',
      booleanTrueLabel: 'Yes',
      booleanFalseLabel: 'No',
      required: false,
    });
  };

  const parseOptions = (text: string): { value: string; label: string }[] => {
    if (!text.trim()) return [];
    return text.split('\n').map((line) => {
      const trimmed = line.trim();
      if (trimmed.includes(':')) {
        const [label, value] = trimmed.split(':').map((s) => s.trim());
        return { value: value || label, label: label || value };
      }
      return { value: trimmed, label: trimmed };
    }).filter((o) => o.value && o.label);
  };

  const formatOptionsForDisplay = (opts: { value: string; label: string }[] | null | undefined): string => {
    if (!opts || opts.length === 0) return '';
    return opts.map((o) => (o.label !== o.value ? `${o.label}: ${o.value}` : o.label)).join('\n');
  };

  const handleAdd = () => {
    if (!formData.fieldLabel.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.custom_fields.label_required', 'Label is required'),
        variant: 'destructive',
      });
      return;
    }
    let options: any = undefined;
    if (['select', 'multi_select'].includes(formData.fieldType)) {
      options = parseOptions(formData.optionsText);
    } else if (formData.fieldType === 'boolean') {
      options = {
        trueLabel: (formData.booleanTrueLabel || 'Yes').trim(),
        falseLabel: (formData.booleanFalseLabel || 'No').trim(),
      };
    }
    createMutation.mutate({
      entity: activeEntity,
      fieldLabel: formData.fieldLabel.trim(),
      fieldType: formData.fieldType,
      options,
      required: formData.required,
    });
  };

  const handleUpdate = () => {
    if (!editingField) return;
    if (!formData.fieldLabel.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.custom_fields.label_required', 'Label is required'),
        variant: 'destructive',
      });
      return;
    }
    let options: any = null;
    if (['select', 'multi_select'].includes(formData.fieldType)) {
      options = parseOptions(formData.optionsText);
    } else if (formData.fieldType === 'boolean') {
      options = {
        trueLabel: (formData.booleanTrueLabel || 'Yes').trim(),
        falseLabel: (formData.booleanFalseLabel || 'No').trim(),
      };
    }
    updateMutation.mutate({
      id: editingField.id,
      data: {
        fieldLabel: formData.fieldLabel.trim(),
        fieldType: formData.fieldType,
        options,
        required: formData.required,
      },
    });
  };

  const getBooleanOptions = (opts: CustomField['options']) => {
    if (opts && typeof opts === 'object' && !Array.isArray(opts) && ('trueLabel' in opts || 'falseLabel' in opts)) {
      return opts as { trueLabel?: string; falseLabel?: string };
    }
    return null;
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.source?.index === result.destination.index) return;

    const items = Array.from(customFields);
    const [reorderedItem] = items.splice(result.source!.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    reorderMutation.mutate(items);
  };

  const openEditModal = (field: CustomField) => {
    setEditingField(field);
    const boolOpts = getBooleanOptions(field.options);
    setFormData({
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
      optionsText: formatOptionsForDisplay(Array.isArray(field.options) ? field.options : undefined),
      booleanTrueLabel: boolOpts?.trueLabel ?? 'Yes',
      booleanFalseLabel: boolOpts?.falseLabel ?? 'No',
      required: Boolean(field.required),
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('settings.custom_fields.title', 'Custom Fields')}
          </CardTitle>
          <CardDescription>
            {t('settings.custom_fields.description', 'Define custom fields for contacts and deals. Choose the section (Contacts or Deals) when adding a field.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeEntity} onValueChange={(v) => setActiveEntity(v as EntityType)}>
            <TabsList className="mb-4">
              <TabsTrigger data-tour="components-settings-contactcustomfieldssettings.tabstrigger.contact" value="contact">
                <User className="h-4 w-4" />
                {t('settings.custom_fields.contacts', 'Contacts')}
              </TabsTrigger>
              <TabsTrigger data-tour="components-settings-contactcustomfieldssettings.tabstrigger.deal" value="deal">
                <Briefcase className="h-4 w-4" />
                {t('settings.custom_fields.deals', 'Deals')}
              </TabsTrigger>
            </TabsList>
            <TabsContent data-tour="components-settings-contactcustomfieldssettings.tabscontent.contact" value="contact" className="mt-0">
              <div className="space-y-4">
            <Button data-tour="components-settings-contactcustomfieldssettings.button.settings.custom_fields.add_field" onClick={() => { setActiveEntity('contact'); resetForm(); setIsAddModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.custom_fields.add_field', 'Add Custom Field')}
            </Button>

            {isLoading && activeEntity === 'contact' ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading', 'Loading...')}
              </div>
            ) : customFields.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <p className="font-medium">{t('settings.custom_fields.no_fields', 'No custom fields yet')}</p>
                <p className="text-sm mt-1">{t('settings.custom_fields.no_fields_desc', 'Add custom fields to capture additional contact information like industry, lead source, or budget.')}</p>
                <Button data-tour="components-settings-contactcustomfieldssettings.button.settings.custom_fields.add_first" variant="outline" className="mt-4" onClick={() => { setActiveEntity('contact'); resetForm(); setIsAddModalOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('settings.custom_fields.add_first', 'Add your first field')}
                </Button>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId={`custom-fields-${activeEntity}`}>
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {customFields.map((field, index) => (
                        <Draggable
                          key={field.id}
                          draggableId={field.id.toString()}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors ${
                                snapshot.isDragging ? 'shadow-lg' : ''
                              }`}
                            >
                              <div {...provided.dragHandleProps} className="cursor-grab">
                                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{field.fieldLabel}</p>
                                <p className="text-xs text-muted-foreground">
                                  {field.fieldName} • {fieldTypeLabel(field.fieldType)}
                                  {Array.isArray(field.options) && field.options.length > 0 && ` • ${t('settings.custom_fields.options_count', '{{count}} options', { count: field.options.length })}`}
                                  {field.required && ` • ${t('settings.custom_fields.required', 'Required')}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditModal(field)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeletingField(field)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
            </TabsContent>
            <TabsContent data-tour="components-settings-contactcustomfieldssettings.tabscontent.deal" value="deal" className="mt-0">
          <div className="space-y-4">
            <Button data-tour="components-settings-contactcustomfieldssettings.button.settings.custom_fields.add_field" onClick={() => { setActiveEntity('deal'); resetForm(); setIsAddModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.custom_fields.add_field', 'Add Custom Field')}
            </Button>

            {isLoading && activeEntity === 'deal' ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading', 'Loading...')}
              </div>
            ) : customFields.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <p className="font-medium">{t('settings.custom_fields.no_fields', 'No custom fields yet')}</p>
                <p className="text-sm mt-1">{t('settings.custom_fields.no_fields_desc_deals', 'Add custom fields for deals like expected close date, decision maker, or contract type.')}</p>
                <Button data-tour="components-settings-contactcustomfieldssettings.button.settings.custom_fields.add_first" variant="outline" className="mt-4" onClick={() => { setActiveEntity('deal'); resetForm(); setIsAddModalOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('settings.custom_fields.add_first', 'Add your first field')}
                </Button>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId={`custom-fields-${activeEntity}`}>
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {customFields.map((field, index) => (
                        <Draggable
                          key={field.id}
                          draggableId={field.id.toString()}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors ${
                                snapshot.isDragging ? 'shadow-lg' : ''
                              }`}
                            >
                              <div {...provided.dragHandleProps} className="cursor-grab">
                                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{field.fieldLabel}</p>
                                <p className="text-xs text-muted-foreground">
                                  {field.fieldName} • {fieldTypeLabel(field.fieldType)}
                                  {Array.isArray(field.options) && field.options.length > 0 && ` • ${t('settings.custom_fields.options_count', '{{count}} options', { count: field.options.length })}`}
                                  {field.required && ` • ${t('settings.custom_fields.required', 'Required')}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditModal(field)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeletingField(field)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent data-tour="components-settings-contactcustomfieldssettings.dialogcontent.settings.custom_fields.add_field" className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('settings.custom_fields.add_field', 'Add Custom Field')}</DialogTitle>
            <DialogDescription>
              {activeEntity === 'contact' ? t('settings.custom_fields.add_desc_contact', 'Create a new custom field for contacts.') : t('settings.custom_fields.add_desc_deal', 'Create a new custom field for deals.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fieldLabel">{t('settings.custom_fields.label', 'Field Label')} *</Label>
              <Input data-tour="components-settings-contactcustomfieldssettings.input.settings.custom_fields.label_placeholder"
                id="fieldLabel"
                value={formData.fieldLabel}
                onChange={(e) => setFormData((p) => ({ ...p, fieldLabel: e.target.value }))}
                placeholder={t('settings.custom_fields.label_placeholder', 'e.g. Industry')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fieldType">{t('settings.custom_fields.type', 'Field Type')}</Label>
              <Select value={formData.fieldType} onValueChange={(v) => setFormData((p) => ({ ...p, fieldType: v }))}>
                <SelectTrigger data-tour="components-settings-contactcustomfieldssettings.selecttrigger.fieldType" id="fieldType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {t(ft.key, ft.fallback)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {['select', 'multi_select'].includes(formData.fieldType) && (
              <div className="space-y-2">
                <Label htmlFor="options">{t('settings.custom_fields.options', 'Options')}</Label>
                <textarea data-tour="components-settings-contactcustomfieldssettings.textarea.settings.custom_fields.options"
                  id="options"
                  value={formData.optionsText}
                  onChange={(e) => setFormData((p) => ({ ...p, optionsText: e.target.value }))}
                  placeholder={t('settings.custom_fields.options_placeholder', 'One per line. Use "Label: value" for display, or just the value.')}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  rows={4}
                />
              </div>
            )}
            {formData.fieldType === 'boolean' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="booleanTrueLabel">{t('settings.custom_fields.boolean_true_label', 'Label when checked')}</Label>
                  <Input data-tour="components-settings-contactcustomfieldssettings.input.booleanTrueLabel"
                    id="booleanTrueLabel"
                    value={formData.booleanTrueLabel}
                    onChange={(e) => setFormData((p) => ({ ...p, booleanTrueLabel: e.target.value }))}
                    placeholder="Yes"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booleanFalseLabel">{t('settings.custom_fields.boolean_false_label', 'Label when unchecked')}</Label>
                  <Input data-tour="components-settings-contactcustomfieldssettings.input.booleanFalseLabel"
                    id="booleanFalseLabel"
                    value={formData.booleanFalseLabel}
                    onChange={(e) => setFormData((p) => ({ ...p, booleanFalseLabel: e.target.value }))}
                    placeholder="No"
                  />
                </div>
              </div>
            )}
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={formData.required}
                onCheckedChange={(checked) => setFormData((previous) => ({ ...previous, required: checked === true }))}
              />
              {t('settings.custom_fields.required', 'Required')}
            </Label>
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-contactcustomfieldssettings.button.common.cancel" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-contactcustomfieldssettings.button.common.add"
              onClick={handleAdd}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.add', 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent data-tour="components-settings-contactcustomfieldssettings.dialogcontent.settings.custom_fields.edit_field" className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('settings.custom_fields.edit_field', 'Edit Custom Field')}</DialogTitle>
            <DialogDescription>
              {t('settings.custom_fields.edit_desc', 'Update the field configuration.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fieldLabel">{t('settings.custom_fields.label', 'Field Label')} *</Label>
              <Input data-tour="components-settings-contactcustomfieldssettings.input.settings.custom_fields.label_placeholder"
                id="edit-fieldLabel"
                value={formData.fieldLabel}
                onChange={(e) => setFormData((p) => ({ ...p, fieldLabel: e.target.value }))}
                placeholder={t('settings.custom_fields.label_placeholder', 'e.g. Industry')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-fieldType">{t('settings.custom_fields.type', 'Field Type')}</Label>
              <Select value={formData.fieldType} onValueChange={(v) => setFormData((p) => ({ ...p, fieldType: v }))}>
                <SelectTrigger data-tour="components-settings-contactcustomfieldssettings.selecttrigger.edit-fieldType" id="edit-fieldType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {t(ft.key, ft.fallback)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {['select', 'multi_select'].includes(formData.fieldType) && (
              <div className="space-y-2">
                <Label htmlFor="edit-options">{t('settings.custom_fields.options', 'Options')}</Label>
                <textarea data-tour="components-settings-contactcustomfieldssettings.textarea.settings.custom_fields.options"
                  id="edit-options"
                  value={formData.optionsText}
                  onChange={(e) => setFormData((p) => ({ ...p, optionsText: e.target.value }))}
                  placeholder={t('settings.custom_fields.options_placeholder', 'One per line. Use "Label: value" for display, or just the value.')}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  rows={4}
                />
              </div>
            )}
            {formData.fieldType === 'boolean' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-booleanTrueLabel">{t('settings.custom_fields.boolean_true_label', 'Label when checked')}</Label>
                  <Input data-tour="components-settings-contactcustomfieldssettings.input.edit-booleanTrueLabel"
                    id="edit-booleanTrueLabel"
                    value={formData.booleanTrueLabel}
                    onChange={(e) => setFormData((p) => ({ ...p, booleanTrueLabel: e.target.value }))}
                    placeholder="Yes"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-booleanFalseLabel">{t('settings.custom_fields.boolean_false_label', 'Label when unchecked')}</Label>
                  <Input data-tour="components-settings-contactcustomfieldssettings.input.edit-booleanFalseLabel"
                    id="edit-booleanFalseLabel"
                    value={formData.booleanFalseLabel}
                    onChange={(e) => setFormData((p) => ({ ...p, booleanFalseLabel: e.target.value }))}
                    placeholder="No"
                  />
                </div>
              </div>
            )}
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={formData.required}
                onCheckedChange={(checked) => setFormData((previous) => ({ ...previous, required: checked === true }))}
              />
              {t('settings.custom_fields.required', 'Required')}
            </Label>
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-contactcustomfieldssettings.button.common.cancel" variant="outline" onClick={() => setEditingField(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-contactcustomfieldssettings.button.common.save"
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingField} onOpenChange={(open) => !open && setDeletingField(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.custom_fields.delete_title', 'Delete Custom Field')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.custom_fields.delete_desc', 'Are you sure? Existing contact data for this field will be preserved but no longer visible in forms.')}
              {deletingField && <span className="block mt-2 font-medium">&quot;{deletingField.fieldLabel}&quot;</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingField && deleteMutation.mutate(deletingField.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
