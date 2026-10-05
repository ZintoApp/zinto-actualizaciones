import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/use-translation';
import {
  getTemplateVariables,
  templateVariableHasValue,
  templateVariableLabel,
  translatedTemplateValidationError,
} from '@/lib/whatsapp-template-ui';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';
import {
  mappingToTemplateExpression,
  resolveTemplateVariableMapping,
  WHATSAPP_NAMED_PARAMETER_MAX_LENGTH,
} from '@shared/whatsapp-template-variables';
import { Loader2 } from 'lucide-react';
import { WhatsAppTemplatePreview } from './WhatsAppTemplatePreview';

interface WhatsAppTemplateVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: WhatsAppTemplate | null;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  context?: Record<string, any>;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  requireMappedResolution?: boolean | string[];
  elevated?: boolean;
}

export function WhatsAppTemplateVariableDialog({
  open,
  onOpenChange,
  template,
  values,
  onValuesChange,
  context = {},
  onConfirm,
  onCancel,
  confirmLabel,
  pendingLabel,
  pending = false,
  disabled = false,
  requireMappedResolution = false,
  elevated = false,
}: WhatsAppTemplateVariableDialogProps) {
  const { t } = useTranslation();
  const definitions = template ? getTemplateVariables(template) : [];
  const validationError = template ? translatedTemplateValidationError(t, definitions) : undefined;
  const missingDefinitions = template
    ? definitions.filter(definition => !templateVariableHasValue(
        template,
        definition,
        values,
        context,
        requireMappedResolution,
      ))
    : [];

  const close = () => {
    onOpenChange(false);
    onCancel?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-templates-whatsapptemplatevariabledialog.dialogcontent.templates.fill_variables"
        className={`${elevated ? 'z-[10001] ' : ''}max-h-[92dvh] overflow-y-auto sm:max-w-[500px]`}
        overlayClassName={elevated ? 'z-[10000]' : undefined}
      >
        <DialogHeader>
          <DialogTitle>{t('templates.fill_variables', 'Fill Template Variables')}</DialogTitle>
          <DialogDescription>{t('templates.fill_variables_desc', 'Review automatic values and enter any missing template variables.')}</DialogDescription>
        </DialogHeader>

        {validationError && <Alert variant="destructive"><AlertDescription>{validationError}</AlertDescription></Alert>}

        {template && <WhatsAppTemplatePreview template={template} values={values} context={context} />}

        <div className="space-y-4 py-2">
          {template && definitions.map(definition => {
            const mapping = template.whatsappTemplateVariableMappings?.[definition.id];
            const resolved = resolveTemplateVariableMapping(mapping, context);
            const missing = missingDefinitions.some(item => item.id === definition.id);
            return (
              <div key={definition.id} className="space-y-2">
                <Label
                  htmlFor={`template-variable-${definition.id}`}
                  className={definition.name && definition.name.length > WHATSAPP_NAMED_PARAMETER_MAX_LENGTH ? 'text-destructive' : undefined}
                >
                  {templateVariableLabel(t, definition)}
                </Label>
                <Input data-tour="components-templates-whatsapptemplatevariabledialog.input.templates.automatic"
                  id={`template-variable-${definition.id}`}
                  value={values[definition.id] || ''}
                  onChange={event => onValuesChange({ ...values, [definition.id]: event.target.value })}
                  placeholder={mapping
                    ? `${t('templates.automatic', 'Automatic')}: ${resolved || mappingToTemplateExpression(mapping)}`
                    : definition.example || t('templates.variable_placeholder', 'Enter variable value')}
                  aria-invalid={missing}
                />
                {mapping && (
                  <p className="text-xs text-muted-foreground">
                    {resolved
                      ? t('templates.automatic_value_help', 'Resolved automatically as “{{value}}”. Enter a value to override it.', { value: resolved })
                      : t('templates.manual_override_help', 'Leave blank to resolve automatically, or enter a manual override.')}
                  </p>
                )}
                {missing && (
                  <p className="text-xs text-destructive">
                    {t('templates.variable_required', 'A value is required for {{variable}}.', { variable: definition.name || definition.position || definition.id })}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button data-tour="components-templates-whatsapptemplatevariabledialog.button.common.cancel" type="button" variant="outline" onClick={close} disabled={pending}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-templates-whatsapptemplatevariabledialog.button.common.sending" type="button" onClick={onConfirm} disabled={disabled || pending || Boolean(validationError) || missingDefinitions.length > 0}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pending ? pendingLabel || t('common.sending', 'Sending...') : confirmLabel || t('common.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
