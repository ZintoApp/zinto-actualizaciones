import { useMemo } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { EnhancedVariablePicker } from '@/components/flow-builder/EnhancedVariablePicker';
import { WHATSAPP_TEMPLATE_CONTEXT_VARIABLES, type FlowVariable } from '@/hooks/useFlowVariables';
import { useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { useCompanyDealCustomFields } from '@/hooks/use-company-deal-custom-fields';
import {
  mappingToTemplateExpression,
  templateExpressionToMapping,
  type WhatsAppTemplateVariableMapping,
} from '@shared/whatsapp-template-variables';

export function TemplateVariableMappingField({
  mapping,
  onChange,
  disabled = false,
  placeholder = '{{contact.name}}',
}: {
  mapping?: WhatsAppTemplateVariableMapping;
  onChange: (mapping: WhatsAppTemplateVariableMapping) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { data: contactFields = [] } = useCompanyContactCustomFields();
  const { data: dealFields = [] } = useCompanyDealCustomFields();
  const availableVariables = useMemo<FlowVariable[]>(() => [
    ...WHATSAPP_TEMPLATE_CONTEXT_VARIABLES,
    ...contactFields.map(field => ({
      value: `contact.custom.${field.fieldName}`,
      label: field.fieldLabel,
      description: 'Contact custom field',
      icon: null,
      category: 'custom' as const,
      dataType: field.fieldType,
    })),
    ...dealFields.map(field => ({
      value: `deal.custom.${field.fieldName}`,
      label: field.fieldLabel,
      description: 'Deal custom field (requires a deal context)',
      icon: null,
      category: 'custom' as const,
      dataType: field.fieldType,
    })),
  ], [contactFields, dealFields]);

  return (
    <ReactFlowProvider>
      <EnhancedVariablePicker
        value={mappingToTemplateExpression(mapping)}
        onChange={value => onChange(templateExpressionToMapping(value))}
        availableVariables={availableVariables}
        placeholder={placeholder}
        disabled={disabled}
        className="min-w-0"
      />
    </ReactFlowProvider>
  );
}

export function TemplateVariableTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  multiline = false,
  className,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  maxLength?: number;
}) {
  const { data: contactFields = [] } = useCompanyContactCustomFields();
  const { data: dealFields = [] } = useCompanyDealCustomFields();
  const availableVariables = useMemo<FlowVariable[]>(() => [
    ...WHATSAPP_TEMPLATE_CONTEXT_VARIABLES,
    ...contactFields.map(field => ({
      value: `contact.custom.${field.fieldName}`,
      label: field.fieldLabel,
      description: 'Contact custom field',
      icon: null,
      category: 'custom' as const,
      dataType: field.fieldType,
    })),
    ...dealFields.map(field => ({
      value: `deal.custom.${field.fieldName}`,
      label: field.fieldLabel,
      description: 'Deal custom field (requires a deal context)',
      icon: null,
      category: 'custom' as const,
      dataType: field.fieldType,
    })),
  ], [contactFields, dealFields]);
  return (
    <ReactFlowProvider>
      <EnhancedVariablePicker
        value={value}
        onChange={onChange}
        availableVariables={availableVariables}
        placeholder={placeholder}
        disabled={disabled}
        multiline={multiline}
        className={className}
        maxLength={maxLength}
      />
    </ReactFlowProvider>
  );
}
