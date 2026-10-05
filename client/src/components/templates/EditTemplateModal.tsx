import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TemplateVariableMappingField } from './TemplateVariableMappingField';
import { WhatsAppTemplatePreview } from './WhatsAppTemplatePreview';
import type { WhatsAppTemplateVariableDefinition, WhatsAppTemplateVariableMappings } from '@shared/whatsapp-template-variables';

interface EditTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
}

export function EditTemplateModal({ isOpen, onClose, template }: EditTemplateModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [variableMappings, setVariableMappings] = useState<WhatsAppTemplateVariableMappings>({});
  const [mappingsChanged, setMappingsChanged] = useState(false);

  useEffect(() => {
    if (template && isOpen) {
      setDescription(template.description || '');
      setIsActive(template.isActive ?? true);
      setVariableMappings(template.whatsappTemplateVariableMappings || {});
      setMappingsChanged(false);
    }
  }, [template, isOpen]);

  const updateTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PATCH', `/api/whatsapp-templates/${template.id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('templates.update_failed', 'Failed to update template'));
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('templates.updated', 'Template Updated'),
        description: t('templates.updated_success', 'Template has been updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updateTemplateMutation.mutate({
      description: description.trim() || undefined,
      isActive,
      ...(mappingsChanged ? { variableMappings } : {}),
    });
  };

  if (!template) return null;

  const isPending = template.whatsappTemplateStatus === 'pending';
  const isRejected = template.whatsappTemplateStatus === 'rejected';
  const variableDefinitions = ((template.whatsappTemplateVariables || []) as WhatsAppTemplateVariableDefinition[]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-templates-edittemplatemodal.dialogcontent.templates.edit_title" className="custom-scrollbar max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t('templates.edit_title', 'Edit Template')}</DialogTitle>
          <DialogDescription>
            {t('templates.edit_description', 'Update template settings. Note: Template content cannot be modified after submission.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)] lg:items-start">
            <div className="min-w-0 space-y-4">
          {isRejected && template.rejectionReason && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{t('templates.rejected', 'Rejected by Meta:')}</strong> {template.rejectionReason}
              </AlertDescription>
            </Alert>
          )}

          {isPending && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('templates.pending_notice', 'This template is pending approval from Meta. Changes are limited until approved.')}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t('templates.name', 'Template Name')}</Label>
              <Input data-tour="components-templates-edittemplatemodal.input.templates.name" value={template.name} disabled />
              <p className="text-xs text-gray-500">
                {t('templates.name_readonly', 'Template name cannot be changed')}
              </p>
            </div>

            {variableDefinitions.length > 0 && (
              <div className="grid gap-3 rounded border p-3">
                <div>
                  <Label>{t('templates.variable_mappings', 'Default Variable Mappings')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('templates.variable_mappings_help', 'These defaults resolve automatically wherever this template is sent. A workflow can still override them.')}
                  </p>
                </div>
                {variableDefinitions.map(variable => (
                  <div key={variable.id} className="grid gap-2 md:grid-cols-[minmax(130px,.7fr)_minmax(220px,1.5fr)] md:items-center">
                    <span className="font-mono text-sm">{variable.id}</span>
                    <TemplateVariableMappingField
                      mapping={variableMappings[variable.id]}
                      onChange={mapping => {
                        setVariableMappings(previous => ({ ...previous, [variable.id]: mapping }));
                        setMappingsChanged(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="description">{t('templates.description_label', 'Description')}</Label>
              <Input data-tour="components-templates-edittemplatemodal.input.templates.description_placeholder"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('templates.description_placeholder', 'Brief description of this template')}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.category', 'Category')}</Label>
              <Input data-tour="components-templates-edittemplatemodal.input.common.na"
                value={template.whatsappTemplateCategory || t('common.na', 'N/A')} 
                disabled 
                className="capitalize"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.status', 'Status')}</Label>
              <Input data-tour="components-templates-edittemplatemodal.input.templates.name"
                value={template.whatsappTemplateStatus || 'draft'} 
                disabled 
                className="capitalize"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.language', 'Language')}</Label>
              <Input data-tour="components-templates-edittemplatemodal.input.templates.name"
                value={template.whatsappTemplateLanguage || 'en'}
                disabled
                className="uppercase"
              />
            </div>

            {template.connection && (
              <div className="grid gap-2">
                <Label>{t('templates.whatsapp_connection', 'WhatsApp Connection')}</Label>
                <Input data-tour="components-templates-edittemplatemodal.input.templates.connection_fallback"
                  value={template.connection.phoneNumber || template.connection.accountName || t('templates.connection_fallback', 'Connection {{id}}', { id: template.connection.id })}
                  disabled
                />
                <p className="text-xs text-gray-500">
                  {t('templates.connection_readonly', 'Connection used to submit this template')}
                </p>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input data-tour="components-templates-edittemplatemodal.input.templates.active_for_campaigns"
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                {t('templates.active_for_campaigns', 'Active (available for use in campaigns)')}
              </Label>
            </div>
          </div>
            </div>

            <aside className="min-w-0 space-y-2 lg:sticky lg:top-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" />
                {t('templates.preview', 'Template Preview')}
              </div>
              <WhatsAppTemplatePreview template={template} resolveMappings={false} />
              <p className="text-xs text-muted-foreground">
                {t('templates.preview_uses_examples', 'The preview uses the example values submitted to Meta. Default mappings are shown beside the template details.')}
              </p>
            </aside>
          </div>

          <DialogFooter>
            <Button data-tour="components-templates-edittemplatemodal.button.common.cancel" type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-templates-edittemplatemodal.button.common.save" type="submit" disabled={updateTemplateMutation.isPending} className="btn-brand-primary">
              {updateTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save', 'Save Changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

