import type {
  WhatsAppParameterFormat,
  WhatsAppTemplateVariableDefinition,
  WhatsAppTemplateVariableMappings,
} from '@shared/whatsapp-template-variables';

export interface WhatsAppTemplate {
  id: number;
  name: string;
  description?: string;
  content: string;
  category: string;
  whatsappTemplateCategory?: 'marketing' | 'utility' | 'authentication';
  whatsappTemplateStatus?: 'pending' | 'approved' | 'rejected' | 'disabled';
  whatsappTemplateId?: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  variables: string[];
  whatsappTemplateComponents?: any[];
  whatsappTemplateVariables?: WhatsAppTemplateVariableDefinition[];
  whatsappTemplateVariableMappings?: WhatsAppTemplateVariableMappings;
  whatsappParameterFormat?: WhatsAppParameterFormat;
  mediaUrls?: string[];
  mediaHandle?: string;
  whatsappChannelType: 'official' | 'unofficial';
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
  connectionId?: number;
}

