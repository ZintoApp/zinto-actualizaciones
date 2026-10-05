import { APP_ICONS } from '@/assets/icons';
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
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  HelpCircle,
  User,
  Tag,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  Edit,
  FileText,
  Variable,
  Settings
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useFlowContext } from "@/pages/flow-builder";
import { cn } from "@/lib/utils";
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Checkbox } from '@/components/ui/checkbox';

export type ManageContactData = {
  id: string;
  type: "manage_contact";
  operation: 'update_contact' | 'delete_contact';
  contactIdVariable: string;
  updateFields: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    tags?: string[];
    notes?: string;
    isActive?: boolean;
    isArchived?: boolean;
  };
  deleteConfirmation: boolean;
  errorHandling: 'continue' | 'stop';
  showAdvanced: boolean;
  skipEmptyValues?: boolean;
  tagInput?: string;
  customFieldsToSet?: Record<string, string | number | boolean | string[]>;
};

/**
 * Returns the list of configured fields for update operations.
 * @param data - The node data containing updateFields and customFieldsToSet
 * @returns Array of field names that are configured
 */
function getFieldsToUpdate(data: ManageContactData): string[] {
  const fields: string[] = [];
  if (data.updateFields?.name) fields.push('name');
  if (data.updateFields?.email) fields.push('email');
  if (data.updateFields?.phone) fields.push('phone');
  if (data.updateFields?.company) fields.push('company');
  if (data.updateFields?.tags && data.updateFields.tags.length > 0) fields.push('tags');
  if (data.updateFields?.notes) fields.push('notes');
  if (data.updateFields?.isActive !== undefined) fields.push('isActive');
  if (data.updateFields?.isArchived !== undefined) fields.push('isArchived');
  if (data.customFieldsToSet && Object.keys(data.customFieldsToSet).length > 0) fields.push('customFields');
  return fields;
}

/**
 * Calculates configuration progress percentage based on node setup.
 * @param data - The node data
 * @returns Progress percentage (0-100)
 */
function calculateConfigurationProgress(data: ManageContactData): number {
  let progress = 0;
  if (data.operation) progress += 20;
  if (data.contactIdVariable && data.contactIdVariable.trim()) progress += 20;

  if (data.operation === 'update_contact') {
    const fields = getFieldsToUpdate(data);
    if (fields.length > 0) progress += 30;
    const standardFields = ['name', 'email', 'phone', 'company', 'tags', 'notes'];
    const hasAllStandard = standardFields.every(f => fields.includes(f));
    if (hasAllStandard) progress += 30;
  } else if (data.operation === 'delete_contact') {
    if (data.deleteConfirmation) progress += 60;
  }

  return Math.min(100, progress);
}

/**
 * ManageContactNode - A flow builder node for updating or deleting contact information.
 * Supports field updates, custom fields, tags management, and delete operations with confirmation.
 */
function ManageContactNode({
  id,
  data,
  selected,
  isConnectable
}: NodeProps<ManageContactData>) {
  const { t } = useTranslation();
  const { onDeleteNode, onDuplicateNode, customVariables } = useFlowContext();
  const { getNodes, setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [showContactCustomFields, setShowContactCustomFields] = useState(false);

  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (data && (!data.operation || !data.contactIdVariable)) {
      const updatedData = {
        ...data,
        operation: data.operation || 'update_contact',
        contactIdVariable: data.contactIdVariable || "{{contact.id}}",
        updateFields: data.updateFields || {},
        deleteConfirmation: data.deleteConfirmation !== undefined ? data.deleteConfirmation : false,
        errorHandling: data.errorHandling || 'continue',
        showAdvanced: data.showAdvanced || false,
        skipEmptyValues: data.skipEmptyValues !== undefined ? data.skipEmptyValues : true
      };

      updateNodeData(updatedData);
    }
  }, [data, id, getNodes, setNodes]);

  const updateNodeData = useCallback((updates: Partial<ManageContactData>) => {
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

  const handleDelete = useCallback(() => {
    onDeleteNode(id);
  }, [id, onDeleteNode]);

  const handleDuplicate = useCallback(() => {
    onDuplicateNode(id);
  }, [id, onDuplicateNode]);

  const handleOperationChange = useCallback((value: string) => {
    updateNodeData({ operation: value as 'update_contact' | 'delete_contact' });
  }, [updateNodeData]);

  const handleSwitchChange = useCallback((field: keyof ManageContactData) =>
    (checked: boolean) => {
      updateNodeData({ [field]: checked });
    }, [updateNodeData]);

  const handleUpdateFieldChange = useCallback((field: keyof ManageContactData['updateFields'], value: string) => {
    updateNodeData({
      updateFields: {
        ...data.updateFields,
        [field]: value
      }
    });
  }, [data.updateFields, updateNodeData]);

  const handleAddTag = useCallback((tag: string) => {
    if (tag.trim()) {
      const currentTags = data.updateFields?.tags || [];
      if (!currentTags.includes(tag.trim())) {
        updateNodeData({
          updateFields: {
            ...data.updateFields,
            tags: [...currentTags, tag.trim()]
          },
          tagInput: ''
        });
      }
    }
  }, [data.updateFields, updateNodeData]);

  const handleRemoveTag = useCallback((tag: string) => {
    const currentTags = data.updateFields?.tags || [];
    updateNodeData({
      updateFields: {
        ...data.updateFields,
        tags: currentTags.filter(t => t !== tag)
      }
    });
  }, [data.updateFields, updateNodeData]);

  const getOperationIcon = () => {
    switch (data.operation) {
      case 'delete_contact': return <UserX className="w-4 h-4" />;
      default: return <img src={APP_ICONS.manageContact} alt="Manage Contact" className="w-4 h-4" />;
    }
  };

  const getOperationTitle = () => {
    switch (data.operation) {
      case 'delete_contact': return t('flow_builder.delete_contact', 'Delete Contact');
      default: return t('flow_builder.update_contact', 'Update Contact');
    }
  };

  const getOperationDescription = () => {
    switch (data.operation) {
      case 'delete_contact': return t('flow_builder.manage_contact_description', 'Permanently delete contact and associated data');
      default: return t('flow_builder.manage_contact_description', 'Update or delete contact information');
    }
  };

  const fieldsToUpdate = getFieldsToUpdate(data);
  const configurationProgress = calculateConfigurationProgress(data);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "node-manage-contact p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group relative",
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
                <DialogContent data-tour="components-flow-builder-managecontactnode.dialogcontent.flow_builder.manage_contact_help_title" className="max-w-4xl max-h-[90vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      {t('flow_builder.manage_contact_help_title', 'Manage Contact Node - Help & Documentation')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('flow_builder.manage_contact_help_description', 'Learn how to update or delete contact information in your flows')}
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[70vh] pr-4">
                    <ManageContactHelpContent t={t} />
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
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20">
                  {getOperationIcon()}
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
                <button data-tour="components-flow-builder-managecontactnode.button.flow_builder.hide"
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Variable className="h-3 w-3 text-primary" />
                    <span className="font-medium text-primary truncate">
                      {data.contactIdVariable || '{{contact.id}}'}
                    </span>
                    {data.contactIdVariable && (
                      <span className="text-xs text-primary font-medium">✓</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.contact_id_variable', 'Contact ID Variable')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.contact_id_variable_target', 'Variable containing the contact ID or phone number to target')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-muted-foreground">•</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {data.operation === 'update_contact' && fieldsToUpdate.length > 0 ? (
                      <CheckCircle className="h-3 w-3 text-primary" />
                    ) : data.operation === 'delete_contact' && data.deleteConfirmation ? (
                      <CheckCircle className="h-3 w-3 text-primary" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {data.operation === 'update_contact'
                        ? (fieldsToUpdate.length > 0 ? t('flow_builder.ready', 'Ready') : t('flow_builder.setup_required', 'Setup required'))
                        : (data.deleteConfirmation ? t('flow_builder.ready', 'Ready') : t('flow_builder.confirmation_required', 'Confirmation required'))}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {data.operation === 'update_contact'
                      ? (fieldsToUpdate.length > 0 ? t('flow_builder.configured_with_fields', 'Configured with {{count}} field(s)', { count: fieldsToUpdate.length }) : t('flow_builder.configure_fields_to_update', 'Configure fields to update'))
                      : (data.deleteConfirmation ? t('flow_builder.delete_confirmation_enabled', 'Delete confirmation enabled') : t('flow_builder.enable_delete_confirmation', 'Enable delete confirmation'))}
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
                    {data.operation === 'update_contact' ? t('flow_builder.badge_update', '📝 Update') : t('flow_builder.badge_delete', '🗑️ Delete')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{getOperationTitle()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {data.operation === 'update_contact' && fieldsToUpdate.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      🔗 {fieldsToUpdate.length} fields
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.configured_fields', 'Configured fields')}</p>
                    <p className="text-xs text-muted-foreground">
                      {fieldsToUpdate.join(', ')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {data.skipEmptyValues !== false && data.operation === 'update_contact' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {t('flow_builder.badge_skip_empty', '⏭️ Skip empty')}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.skip_empty_values_enabled', 'Skip empty values enabled')}</p>
                    <p className="text-xs text-muted-foreground">{t('flow_builder.skip_empty_values_help', 'Prevents overwriting with empty data')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {data.deleteConfirmation && data.operation === 'delete_contact' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {t('flow_builder.badge_confirmed', '✅ Confirmed')}
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
                <User className="w-3 h-3" />
                {t('flow_builder.operation_type', 'Operation Type')}
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('flow_builder.operation_type_help', 'Choose what action to perform on the contact')}</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={data.operation || 'update_contact'}
                onValueChange={handleOperationChange}
              >
                <SelectTrigger data-tour="components-flow-builder-managecontactnode.selecttrigger.flow_builder.select_operation" className="h-8">
                  <SelectValue placeholder={t('flow_builder.select_operation', 'Select operation')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="update_contact">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3 h-3" />
                      {t('flow_builder.update_contact', 'Update Contact')}
                    </div>
                  </SelectItem>
                  <SelectItem value="delete_contact">
                    <div className="flex items-center gap-2">
                      <UserX className="w-3 h-3" />
                      {t('flow_builder.delete_contact', 'Delete Contact')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <User className="w-3 h-3" />
                {t('flow_builder.contact_id_variable', 'Contact ID Variable')}
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('flow_builder.contact_id_variable_help', 'Variable containing the contact ID or phone number')}</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <EnhancedVariablePicker customVariables={customVariables}
                value={data.contactIdVariable || ''}
                onChange={(value) => updateNodeData({ contactIdVariable: value })}
                placeholder="{{contact.id}}"
                className="h-8"
              />
            </div>

            {data.operation === 'update_contact' && (
              <Collapsible
                open={true}
                onOpenChange={() => {}}
              >
                <CollapsibleTrigger asChild>
                  <Button data-tour="components-flow-builder-managecontactnode.button.flow_builder.fields_to_update" variant="ghost" size="sm" className="w-full justify-between h-8">
                    <span className="text-xs flex items-center gap-1">
                      <Edit className="w-3 h-3" />
                      {t('flow_builder.fields_to_update', 'Fields to Update')}
                    </span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 mt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_name', 'Contact Name')}</Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.updateFields?.name || ''}
                      onChange={(value) => handleUpdateFieldChange('name', value)}
                      placeholder="{{contact.name}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_email', 'Contact Email')}</Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.updateFields?.email || ''}
                      onChange={(value) => handleUpdateFieldChange('email', value)}
                      placeholder="{{contact.email}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_phone', 'Contact Phone')}</Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.updateFields?.phone || ''}
                      onChange={(value) => handleUpdateFieldChange('phone', value)}
                      placeholder="{{contact.phone}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_company', 'Contact Company')}</Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.updateFields?.company || ''}
                      onChange={(value) => handleUpdateFieldChange('company', value)}
                      placeholder="{{contact.company}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_tags', 'Contact Tags')}</Label>
                    <div className="flex gap-1">
                      <Input data-tour="components-flow-builder-managecontactnode.input.flow_builder.enter_tag_name"
                        value={data.tagInput || ''}
                        onChange={(e) => updateNodeData({ tagInput: e.target.value })}
                        placeholder={t('flow_builder.enter_tag_name', 'Enter tag name')}
                        className="h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag(data.tagInput || '');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => handleAddTag(data.tagInput || '')}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {data.updateFields?.tags && data.updateFields.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {data.updateFields.tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-3 w-3 p-0 ml-1"
                              onClick={() => handleRemoveTag(tag)}
                            >
                              <X className="w-2 h-2" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_notes', 'Contact Notes')}</Label>
                    <EnhancedVariablePicker customVariables={customVariables}
                      value={data.updateFields?.notes || ''}
                      onChange={(value) => handleUpdateFieldChange('notes', value)}
                      placeholder={t('flow_builder.enter_notes', 'Enter notes...')}
                      className="h-16"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_is_active', 'Is Active')}</Label>
                    <Switch
                      checked={data.updateFields?.isActive !== undefined ? data.updateFields.isActive : true}
                      onCheckedChange={(checked) => updateNodeData({
                        updateFields: {
                          ...data.updateFields,
                          isActive: checked
                        }
                      })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_is_archived', 'Is Archived')}</Label>
                    <Switch
                      checked={data.updateFields?.isArchived !== undefined ? data.updateFields.isArchived : false}
                      onCheckedChange={(checked) => updateNodeData({
                        updateFields: {
                          ...data.updateFields,
                          isArchived: checked
                        }
                      })}
                    />
                  </div>

                  {contactCustomFieldsSchema.length > 0 && (
                    <Collapsible open={showContactCustomFields} onOpenChange={setShowContactCustomFields}>
                      <CollapsibleTrigger asChild>
                        <Button data-tour="components-flow-builder-managecontactnode.button.flow_builder.custom_fields" variant="ghost" size="sm" className="w-full justify-between h-8">
                          <span className="text-xs flex items-center gap-1">
                            {t('flow_builder.custom_fields', 'Custom Fields')}
                          </span>
                          {showContactCustomFields ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 mt-2">
                        {contactCustomFieldsSchema.filter((field: { fieldType: string }) => field.fieldType !== 'file_select').map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } }) => (
                          <div key={field.id} className="space-y-2">
                            <Label className="text-xs font-medium">
                              {field.fieldLabel}
                              {field.fieldType === 'multi_select' && t('flow_builder.select_multiple', ' (select multiple)')}
                            </Label>
                            {field.fieldType === 'text' && (
                              <EnhancedVariablePicker customVariables={customVariables}
                                value={String(data.customFieldsToSet?.[field.fieldName] ?? '')}
                                onChange={(value) => updateNodeData({
                                  customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: value }
                                })}
                                placeholder={t('flow_builder.enter_value_or_variable', 'Enter value or {{variable}}')}
                                className="h-8"
                              />
                            )}
                            {field.fieldType === 'number' && (
                              <EnhancedVariablePicker customVariables={customVariables}
                                value={String(data.customFieldsToSet?.[field.fieldName] ?? '')}
                                onChange={(value) => updateNodeData({
                                  customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: value }
                                })}
                                placeholder={t('flow_builder.placeholder_number_or_variable', '0 or {{variable}}')}
                                className="h-8"
                              />
                            )}
                            {field.fieldType === 'date' && (
                              <EnhancedVariablePicker customVariables={customVariables}
                                value={String(data.customFieldsToSet?.[field.fieldName] ?? '')}
                                onChange={(value) => updateNodeData({
                                  customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: value }
                                })}
                                placeholder={t('flow_builder.placeholder_date_or_variable', 'YYYY-MM-DD or {{date.today}}')}
                                className="h-8"
                              />
                            )}
                            {field.fieldType === 'select' && (
                              <div className="space-y-2">
                                <EnhancedVariablePicker customVariables={customVariables}
                                  value={String(data.customFieldsToSet?.[field.fieldName] ?? '')}
                                  onChange={(value) => updateNodeData({
                                    customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: value }
                                  })}
                                  placeholder={t('flow_builder.value_or_variable', 'Value or {{variable}}')}
                                  className="h-8"
                                />
                                {(field.options && Array.isArray(field.options) && field.options.length > 0) && (
                                  <div className="flex flex-wrap gap-1">
                                    {(field.options as { value?: string; label?: string }[]).map((opt) => {
                                      const val = opt.value ?? opt.label ?? '';
                                      const lab = opt.label ?? opt.value ?? '';
                                      return (
                                        <Button
                                          key={val}
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => updateNodeData({
                                            customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: val }
                                          })}
                                        >
                                          {lab}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            {field.fieldType === 'multi_select' && (
                              <div className="flex flex-wrap gap-2">
                                {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                                  const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                                  const optLab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                                  const selected = Array.isArray(data.customFieldsToSet?.[field.fieldName])
                                    ? (data.customFieldsToSet[field.fieldName] as string[]).includes(optVal)
                                    : false;
                                  return (
                                    <div key={optVal} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`contact-cf-${field.fieldName}-${optVal}`}
                                        checked={selected}
                                        onCheckedChange={(checked) => {
                                          const current = Array.isArray(data.customFieldsToSet?.[field.fieldName])
                                            ? (data.customFieldsToSet[field.fieldName] as string[])
                                            : [];
                                          const next = checked ? [...current, optVal] : current.filter((v: string) => v !== optVal);
                                          updateNodeData({
                                            customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: next }
                                          });
                                        }}
                                      />
                                      <label htmlFor={`contact-cf-${field.fieldName}-${optVal}`} className="text-xs cursor-pointer">
                                        {optLab}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {field.fieldType === 'boolean' && (() => {
                              const boolOpts = field.options && !Array.isArray(field.options) ? (field.options as { trueLabel?: string; falseLabel?: string }) : null;
                              const trueLabel = boolOpts?.trueLabel ?? t('common.yes', 'Yes');
                              const falseLabel = boolOpts?.falseLabel ?? t('common.no', 'No');
                              const checked = !!data.customFieldsToSet?.[field.fieldName];
                              return (
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`contact-cf-${field.fieldName}`}
                                    checked={checked}
                                    onCheckedChange={(isChecked) => updateNodeData({
                                      customFieldsToSet: { ...(data.customFieldsToSet || {}), [field.fieldName]: !!isChecked }
                                    })}
                                  />
                                  <label htmlFor={`contact-cf-${field.fieldName}`} className="text-xs">
                                    {checked ? trueLabel : falseLabel}
                                  </label>
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {fieldsToUpdate.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-2">
                        {t('flow_builder.fields_to_update_summary', 'Fields to update:')}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {fieldsToUpdate.map((field) => (
                          <Badge key={field} variant="outline" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {data.operation === 'delete_contact' && (
              <div className="space-y-3">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-red-800 dark:text-red-200">
                        {t('flow_builder.delete_warning', 'Warning: This will permanently delete the contact and all associated data')}
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-300 mt-1">
                        {t('flow_builder.delete_info', 'This action will delete the contact, conversations, messages, notes, and deals. This cannot be undone.')}
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
                    {t('flow_builder.delete_confirmation', 'I understand this will permanently delete the contact')}
                  </Label>
                </div>
              </div>
            )}

            <Collapsible
              open={data.showAdvanced}
              onOpenChange={(open) => updateNodeData({ showAdvanced: open })}
            >
              <CollapsibleTrigger asChild>
                <Button data-tour="components-flow-builder-managecontactnode.button.flow_builder.advanced_options" variant="ghost" size="sm" className="w-full justify-between h-8 text-muted-foreground">
                  <span className="text-xs">{t('flow_builder.advanced_options', 'Advanced Options')}</span>
                  {data.showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-2">
                {data.operation === 'update_contact' && (
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
                {t('flow_builder.manage_contact_inline_help', 'The Manage Contact node updates or deletes contact information when reached in the flow. Use variables like {{contact.id}} to dynamically target contacts. Changes are applied immediately and persist across all flows.')}
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

/**
 * ManageContactHelpContent - Comprehensive inline documentation for the Manage Contact node.
 * Covers node overview, operations, field types, variable usage, examples, and best practices.
 */
function ManageContactHelpContent({ t }: { t: (key: string, fallback?: string, params?: Record<string, unknown>) => string }) {
  return (
    <div className="space-y-6">
      {/* Node Overview */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_contact_help_node_overview', 'Node Overview')}
        </h3>
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm text-foreground mb-2">
            {t('flow_builder.manage_contact_help_overview_desc', 'The Manage Contact Node allows you to update or delete contact information when reached in your flow. It enables you to maintain contact data, manage the contact lifecycle, and update custom fields dynamically.')}
          </p>
          <p className="text-sm text-foreground">
            {t('flow_builder.manage_contact_help_key_benefits', 'Key Benefits: Maintain contact data accuracy, manage contact lifecycle (archive/activate), update custom fields from captured data, add or manage tags, and optionally delete contacts with confirmation.')}
          </p>
        </div>
      </section>

      {/* Operations Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_contact_help_operations', 'Operations')}
        </h3>
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <UserCheck className="h-3 w-3" />
              {t('flow_builder.update_contact', 'Update Contact')}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t('flow_builder.manage_contact_help_update_desc', 'Updates contact fields with new values. Supports standard fields (name, email, phone, company, notes), custom fields based on your schema, tags management, and boolean flags (isActive, isArchived).')}
            </p>
            <div className="bg-muted rounded p-2 text-xs font-mono">
              contactIdVariable: &#123;&#123;contact.id&#125;&#125;<br/>
              name: &#123;&#123;user_name&#125;&#125;<br/>
              email: &#123;&#123;user_email&#125;&#125;
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <UserX className="h-3 w-3" />
              {t('flow_builder.delete_contact', 'Delete Contact')}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t('flow_builder.manage_contact_help_delete_desc', 'Permanently deletes the contact and all associated data (conversations, messages, notes, deals). Requires explicit confirmation to prevent accidental deletions. This action cannot be undone.')}
            </p>
            <div className="bg-destructive/10 rounded p-2 text-xs">
              {t('flow_builder.manage_contact_help_delete_enable', 'Enable "I understand this will permanently delete the contact" before the node can execute.')}
            </div>
          </div>
        </div>
      </section>

      {/* Field Types Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_contact_help_field_types', 'Field Types')}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <User className="h-3 w-3" /> {t('flow_builder.manage_contact_help_standard_fields', 'Standard Fields')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_contact_help_standard_fields_list', 'name, email, phone, company, notes')}</p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> {t('flow_builder.manage_contact_help_boolean_fields', 'Boolean Fields')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_contact_help_boolean_fields_list', 'isActive, isArchived')}</p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <Tag className="h-3 w-3" /> {t('flow_builder.contact_tags', 'Tags')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_contact_help_tags_desc', 'Array of strings, add/remove tags')}</p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
              <Settings className="h-3 w-3" /> {t('flow_builder.custom_fields', 'Custom Fields')}
            </h4>
            <p className="text-xs text-muted-foreground">{t('flow_builder.manage_contact_help_custom_fields_desc', 'Dynamic based on your schema')}</p>
          </div>
        </div>
      </section>

      <Separator />

      {/* Variable System Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Variable className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_contact_help_variable_system', 'Variable System')}
        </h3>
        <div className="space-y-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_contact_help_using_variables', 'Using Variables')}</h4>
            <p className="text-xs text-foreground mb-2">
              {t('flow_builder.manage_contact_help_variables_desc', 'Use {{contact.id}}, {{contact.phone}}, etc. to dynamically target contacts. The contactIdVariable specifies which contact to update or delete.')}
            </p>
            <div className="bg-card rounded p-2 text-xs font-mono space-y-1">
              <div><strong>{t('flow_builder.manage_contact_help_examples', 'Examples')}</strong></div>
              <div>contactIdVariable: &#123;&#123;contact.id&#125;&#125;</div>
              <div>name: &#123;&#123;user_name&#125;&#125; (from Data Capture)</div>
              <div>email: &#123;&#123;captured.user_email&#125;&#125;</div>
            </div>
          </div>
        </div>
      </section>

      {/* Configuration Options Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          {t('flow_builder.manage_contact_help_config_options', 'Configuration Options')}
        </h3>
        <div className="space-y-3">
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
              <CheckCircle className="h-3 w-3 text-primary" />
              {t('flow_builder.skip_empty_values', 'Skip Empty Values')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('flow_builder.manage_contact_help_skip_empty_desc', 'When enabled, prevents overwriting existing contact data with empty values. Only non-empty values will be applied to the contact.')}
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-destructive" />
              {t('flow_builder.error_handling', 'Error Handling')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('flow_builder.manage_contact_help_error_handling_desc', 'Continue on error: Flow proceeds even if update/delete fails. Stop on error: Flow halts on failure.')}
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
              <UserX className="h-3 w-3 text-destructive" />
              {t('flow_builder.manage_contact_help_delete_confirmation', 'Delete Confirmation')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('flow_builder.manage_contact_help_delete_confirm_desc', 'Safety mechanism for delete operations. Must be enabled before the node can execute a delete.')}
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* Practical Examples Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_contact_help_practical_examples', 'Practical Examples')}
        </h3>
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_contact_help_example1_title', 'Example 1: Update contact name and email from captured data')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono">
                contactIdVariable: &#123;&#123;contact.id&#125;&#125;<br/>
                name: &#123;&#123;user_name&#125;&#125;<br/>
                email: &#123;&#123;user_email&#125;&#125;
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_contact_help_example1_desc', 'Use after a Data Capture node that collected user_name and user_email.')}</p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_contact_help_example2_title', 'Example 2: Add tags to a contact')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono">
                Add tags: &quot;vip&quot;, &quot;newsletter&quot;, &quot;promo-2024&quot;
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_contact_help_example2_desc', 'Tags are added to existing tags. Use for segmentation and filtering.')}</p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_contact_help_example3_title', 'Example 3: Archive inactive contacts')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono">
                isArchived: true<br/>
                isActive: false
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_contact_help_example3_desc', 'Use in a flow that identifies inactive contacts to archive them.')}</p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-destructive/10 border-destructive/20">
            <h4 className="font-medium text-sm mb-2">{t('flow_builder.manage_contact_help_example4_title', 'Example 4: Delete contact with confirmation')}</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-muted rounded p-2 font-mono">
                operation: Delete Contact<br/>
                contactIdVariable: &#123;&#123;contact.id&#125;&#125;<br/>
                Enable: I understand this will permanently delete the contact
              </div>
              <p className="text-muted-foreground">{t('flow_builder.manage_contact_help_example4_desc', 'Always enable confirmation. Consider adding a condition to prevent accidental deletion.')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Best Practices Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-primary" />
          {t('flow_builder.manage_contact_help_best_practices', 'Best Practices')}
        </h3>
        <div className="space-y-3">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2 text-primary">{t('flow_builder.manage_contact_help_dos', "Do's")}</h4>
            <ul className="text-xs text-foreground space-y-1">
              <li>• {t('flow_builder.manage_contact_help_do1', 'Use variables for dynamic updates ({{contact.id}}, {{user_name}})')}</li>
              <li>• {t('flow_builder.manage_contact_help_do2', 'Enable skip empty values to prevent overwriting with empty data')}</li>
              <li>• {t('flow_builder.manage_contact_help_do3', 'Test with sample data before deploying to production')}</li>
              <li>• {t('flow_builder.manage_contact_help_do4', 'Always enable delete confirmation for delete operations')}</li>
            </ul>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2 text-destructive">{t('flow_builder.manage_contact_help_donts', "Don'ts")}</h4>
            <ul className="text-xs text-foreground space-y-1">
              <li>• {t('flow_builder.manage_contact_help_dont1', "Don't hardcode values when variables are available")}</li>
              <li>• {t('flow_builder.manage_contact_help_dont2', "Don't skip delete confirmation in production flows")}</li>
              <li>• {t('flow_builder.manage_contact_help_dont3', "Don't update without validating the contact exists")}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ManageContactNode;
