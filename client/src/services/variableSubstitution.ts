/**
 * Variable substitution service for Quick Reply templates
 * Consistent with the existing campaign variable system
 */

export interface VariableContext {
  contact?: {
    id?: number;
    name?: string;
    phone?: string;
    email?: string;
    identifier?: string;
    company?: string;
  };
  conversation?: {
    id?: number;
    channelType?: string;
    status?: string;
  };
  system?: {
    date?: string;
    time?: string;
    datetime?: string;
  };
  custom?: Record<string, any>;
}

export interface VariableOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'contact' | 'system' | 'custom';
}

/**
 * Get default variables available for quick replies
 * Matches the existing campaign variable system
 */
export const getDefaultQuickReplyVariables = (t: (key: string, fallback: string) => string): VariableOption[] => [

  {
    value: 'contact.name',
    label: t('variables.contact_name', 'Contact Name'),
    description: t('variables.contact_name_desc', 'Full name of the contact'),
    icon: '👤',
    category: 'contact'
  },
  {
    value: 'contact.phone',
    label: t('variables.phone_number', 'Phone Number'),
    description: t('variables.phone_number_desc', 'Contact phone number'),
    icon: '📞',
    category: 'contact'
  },
  {
    value: 'contact.email',
    label: t('variables.email_address', 'Email Address'),
    description: t('variables.email_address_desc', 'Contact email address'),
    icon: '📧',
    category: 'contact'
  },
  {
    value: 'contact.company',
    label: t('variables.company_name', 'Company Name'),
    description: t('variables.company_name_desc', 'Contact company or organization'),
    icon: '🏢',
    category: 'contact'
  },

  {
    value: 'date.today',
    label: t('variables.current_date', 'Current Date'),
    description: t('variables.current_date_desc', 'Today\'s date'),
    icon: '📅',
    category: 'system'
  },
  {
    value: 'time.now',
    label: t('variables.current_time', 'Current Time'),
    description: t('variables.current_time_desc', 'Current time'),
    icon: '🕐',
    category: 'system'
  },
  {
    value: 'datetime.now',
    label: t('variables.current_datetime', 'Current Date & Time'),
    description: t('variables.current_datetime_desc', 'Current date and time'),
    icon: '📅',
    category: 'system'
  }
];

/**
 * Create variable context from conversation and contact data
 */
export const createVariableContext = (conversation: any, contact: any): VariableContext => {
  const now = new Date();
  
  return {
    contact: {
      id: contact?.id,
      name: contact?.name || '',
      phone: contact?.phone || contact?.identifier || '',
      email: contact?.email || '',
      identifier: contact?.identifier || '',
      company: contact?.company || ''
    },
    conversation: {
      id: conversation?.id,
      channelType: conversation?.channelType || '',
      status: conversation?.status || ''
    },
    system: {
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      datetime: now.toLocaleString()
    },
    custom: {}
  };
};

/**
 * Replace variables in template content with actual values
 * Uses the same pattern as the existing flow executor
 */
export const replaceVariables = (template: string, context: VariableContext): string => {
  if (!template) return '';

  try {
    let result = template;


    if (context.contact) {
      result = result.replace(/\{\{contact\.name\}\}/g, context.contact.name || '');
      result = result.replace(/\{\{contact\.phone\}\}/g, context.contact.phone || '');
      result = result.replace(/\{\{contact\.email\}\}/g, context.contact.email || '');
      result = result.replace(/\{\{contact\.identifier\}\}/g, context.contact.identifier || '');
      result = result.replace(/\{\{contact\.company\}\}/g, context.contact.company || '');
      result = result.replace(/\{\{contact\.id\}\}/g, context.contact.id?.toString() || '');
    }


    if (context.system) {
      result = result.replace(/\{\{date\.today\}\}/g, context.system.date || '');
      result = result.replace(/\{\{time\.now\}\}/g, context.system.time || '');
      result = result.replace(/\{\{datetime\.now\}\}/g, context.system.datetime || '');
    }


    if (context.conversation) {
      result = result.replace(/\{\{conversation\.id\}\}/g, context.conversation.id?.toString() || '');
      result = result.replace(/\{\{conversation\.channelType\}\}/g, context.conversation.channelType || '');
      result = result.replace(/\{\{conversation\.status\}\}/g, context.conversation.status || '');
    }


    if (context.custom) {
      Object.entries(context.custom).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g');
        result = result.replace(regex, String(value || ''));
      });
    }


    result = result.replace(/\{\{name\}\}/g, context.contact?.name || '');
    result = result.replace(/\{\{phone\}\}/g, context.contact?.phone || '');
    result = result.replace(/\{\{email\}\}/g, context.contact?.email || '');
    result = result.replace(/\{\{company\}\}/g, context.contact?.company || '');
    result = result.replace(/\{\{date\}\}/g, context.system?.date || '');
    result = result.replace(/\{\{time\}\}/g, context.system?.time || '');

    return result;
  } catch (error) {
    console.error('Error replacing variables in quick reply template:', error);
    return template; // Return original template if replacement fails
  }
};

/**
 * Escape special regex characters
 */
const escapeRegex = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Extract variables from template content
 */
export const extractVariables = (template: string): string[] => {
  if (!template) return [];

  const variablePattern = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variablePattern.exec(template)) !== null) {
    const variable = match[1].trim();
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }

  return variables;
};

/**
 * Validate if all variables in template can be resolved
 */
export const validateVariables = (template: string, context: VariableContext): { 
  isValid: boolean; 
  missingVariables: string[];
  warnings: string[];
} => {
  const variables = extractVariables(template);
  const missingVariables: string[] = [];
  const warnings: string[] = [];

  variables.forEach(variable => {
    const testResult = replaceVariables(`{{${variable}}}`, context);
    

    if (testResult === `{{${variable}}}`) {
      missingVariables.push(variable);
    }
    

    if (testResult === '') {
      warnings.push(`Variable "${variable}" is empty`);
    }
  });

  return {
    isValid: missingVariables.length === 0,
    missingVariables,
    warnings
  };
};

/**
 * Preview template with variable substitution
 */
export const previewTemplate = (template: string, context: VariableContext): {
  preview: string;
  variables: string[];
  validation: ReturnType<typeof validateVariables>;
} => {
  const variables = extractVariables(template);
  const validation = validateVariables(template, context);
  const preview = replaceVariables(template, context);

  return {
    preview,
    variables,
    validation
  };
};

/**
 * Format variable for display in UI
 */
export const formatVariableForDisplay = (variable: string): string => {
  return `{{${variable}}}`;
};

/**
 * Check if template contains variables
 */
export const hasVariables = (template: string): boolean => {
  return /\{\{[^}]+\}\}/.test(template);
};
