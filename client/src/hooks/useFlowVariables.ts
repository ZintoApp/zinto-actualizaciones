import * as React from 'react';
import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useMemo, useState, useEffect } from 'react';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';
import { getCodeExecutionVariableNamesFromNodes } from '@shared/flow-code-output-variables';
import { normalizeAiAssistantVariables } from '@shared/ai-assistant-variables';

export interface FlowVariable {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'contact' | 'message' | 'system' | 'company' | 'conversation' | 'appointment' | 'erp' | 'flow' | 'captured' | 'observed' | 'custom' | 'media';
  dataType?: string;
  nodeId?: string;
}


export const BASE_VARIABLES: FlowVariable[] = [

  { value: 'contact.name', label: 'Contact Name', description: 'Full name of the contact', icon: null, category: 'contact' },
  { value: 'contact.phone', label: 'Contact Phone', description: 'Phone number of the contact', icon: null, category: 'contact' },
  { value: 'contact.email', label: 'Contact Email', description: 'Email address of the contact', icon: null, category: 'contact' },
  { value: 'contact.username', label: 'Contact WhatsApp Username', description: 'WhatsApp @username of the contact', icon: null, category: 'contact' },
  { value: 'contact.company', label: 'Contact Company', description: 'Company name of the contact', icon: null, category: 'contact' },


  { value: 'message.content', label: 'Message Content', description: 'Text content of the message', icon: null, category: 'message' },
  { value: 'message.type', label: 'Message Type', description: 'Type of message (text, image, etc.)', icon: null, category: 'message' },
  { value: 'message.timestamp', label: 'Message Timestamp', description: 'When the message was sent', icon: null, category: 'message' },


  { value: 'current.timestamp', label: 'Current Timestamp', description: 'Current date and time', icon: null, category: 'system' },
  { value: 'current.date', label: 'Current Date', description: 'Current date (YYYY-MM-DD)', icon: null, category: 'system' },
  { value: 'current.time', label: 'Current Time', description: 'Current time (HH:MM:SS)', icon: null, category: 'system' },
  { value: 'date.today', label: 'Current Date (Legacy)', description: 'Current date using the legacy runtime alias', icon: null, category: 'system' },
  { value: 'time.now', label: 'Current Time (Legacy)', description: 'Current time using the legacy runtime alias', icon: null, category: 'system' },


  { value: 'flow.result', label: 'Flow Result', description: 'Result from previous flow node', icon: null, category: 'flow' },
  { value: 'pipeline.currentPipelineId', label: 'Current Pipeline ID', description: 'Current pipeline ID', icon: null, category: 'flow' },
  { value: 'pipeline.previousPipelineId', label: 'Previous Pipeline ID', description: 'Previous pipeline ID, when available', icon: null, category: 'flow' },
  { value: 'pipeline.currentStageId', label: 'Current Stage ID', description: 'Current pipeline stage ID', icon: null, category: 'flow' },
  { value: 'pipeline.previousStageId', label: 'Previous Stage ID', description: 'Previous pipeline stage ID, when available', icon: null, category: 'flow' },
  { value: 'pipeline.pipelineChanged', label: 'Pipeline Changed', description: 'Whether the deal moved between pipelines', icon: null, category: 'flow', dataType: 'boolean' },
  { value: 'pipeline.stageChanged', label: 'Stage Changed', description: 'Whether the deal moved between stages', icon: null, category: 'flow', dataType: 'boolean' },
  { value: 'pipeline.movedBetweenPipelines', label: 'Moved Between Pipelines', description: 'Legacy alias indicating whether the deal moved between pipelines', icon: null, category: 'flow', dataType: 'boolean' },
];

export const BASE_VARIABLE_VALUE_SET = new Set(BASE_VARIABLES.map((v) => v.value));

/**
 * Variables shared with Flow Builder plus template-specific business context.
 * Runtime-only values remain selectable because a Flow/API workflow can supply
 * them; sends without that context fail safely during resolution.
 */
export const WHATSAPP_TEMPLATE_CONTEXT_VARIABLES: FlowVariable[] = [
  ...BASE_VARIABLES,
  { value: 'contact.id', label: 'Contact ID', description: 'Internal contact ID', icon: null, category: 'contact' },
  { value: 'contact.identifier', label: 'Contact Identifier', description: 'Channel identifier for the contact', icon: null, category: 'contact' },
  { value: 'conversation.id', label: 'Conversation ID', description: 'Current conversation ID when available', icon: null, category: 'conversation' },
  { value: 'conversation.channelType', label: 'Conversation Channel', description: 'Current conversation channel type', icon: null, category: 'conversation' },
  { value: 'conversation.status', label: 'Conversation Status', description: 'Current conversation status', icon: null, category: 'conversation' },
  { value: 'company.name', label: 'Company Name', description: 'Name of the current company', icon: null, category: 'company' },
  { value: 'company.timezone', label: 'Company Time Zone', description: 'Configured company time zone', icon: null, category: 'company' },
  { value: 'appointment.id', label: 'Appointment ID', description: 'Selected or unambiguous upcoming appointment', icon: null, category: 'appointment' },
  { value: 'appointment.date', label: 'Appointment Date', description: 'Appointment date in the company time zone', icon: null, category: 'appointment' },
  { value: 'appointment.start_time', label: 'Appointment Start Time', description: 'Appointment start time in the company time zone', icon: null, category: 'appointment' },
  { value: 'appointment.end_time', label: 'Appointment End Time', description: 'Appointment end time in the company time zone', icon: null, category: 'appointment' },
  { value: 'appointment.duration', label: 'Appointment Duration', description: 'Appointment duration in minutes', icon: null, category: 'appointment' },
  { value: 'appointment.service', label: 'Appointment Service', description: 'Booked service or appointment title', icon: null, category: 'appointment' },
  { value: 'appointment.provider', label: 'Appointment Provider', description: 'Assigned provider', icon: null, category: 'appointment' },
  { value: 'appointment.office', label: 'Appointment Office', description: 'Assigned chair, office, or location', icon: null, category: 'appointment' },
  { value: 'appointment.status', label: 'Appointment Status', description: 'Current appointment status', icon: null, category: 'appointment' },
  { value: 'appointment.notes', label: 'Appointment Notes', description: 'Appointment notes', icon: null, category: 'appointment' },
  { value: 'erp.catalog.productId', label: 'ERP Product ID', description: 'Product selected by an ERP workflow', icon: null, category: 'erp' },
  { value: 'erp.catalog.count', label: 'ERP Product Count', description: 'Number of products returned by an ERP workflow', icon: null, category: 'erp' },
  { value: 'erp.salesOrder.id', label: 'ERP Sales Order ID', description: 'Current sales order ID', icon: null, category: 'erp' },
  { value: 'erp.invoice.id', label: 'ERP Invoice ID', description: 'Current invoice ID', icon: null, category: 'erp' },
  { value: 'erp.restaurant.reservation.id', label: 'Reservation ID', description: 'Current restaurant reservation ID', icon: null, category: 'erp' },
  { value: 'erp.restaurant.reservation.count', label: 'Reservation Count', description: 'Number of restaurant reservations returned', icon: null, category: 'erp' },
  { value: 'erp.restaurant.waitlist.id', label: 'Waitlist Entry ID', description: 'Current restaurant waitlist entry ID', icon: null, category: 'erp' },
  { value: 'erp.restaurant.waitlist.count', label: 'Waitlist Count', description: 'Number of waitlist entries returned', icon: null, category: 'erp' },
  { value: 'erp.restaurant.delivery.id', label: 'Delivery ID', description: 'Current restaurant delivery ID', icon: null, category: 'erp' },
  { value: 'erp.restaurant.delivery.status', label: 'Delivery Status', description: 'Current restaurant delivery status', icon: null, category: 'erp' },
  { value: 'erp.dental.patient.isPatient', label: 'Dental Patient', description: 'Whether the contact is a dental patient', icon: null, category: 'erp' },
  { value: 'erp.dental.appointment.id', label: 'ERP Appointment ID', description: 'Appointment ID produced by an ERP workflow', icon: null, category: 'erp' },
  { value: 'erp.dental.appointment.count', label: 'ERP Appointment Count', description: 'Number of appointments returned by an ERP workflow', icon: null, category: 'erp' },
  { value: 'erp.dental.treatmentPlan.id', label: 'Treatment Plan ID', description: 'Current dental treatment plan ID', icon: null, category: 'erp' },
  { value: 'erp.dental.treatmentPlan.count', label: 'Treatment Plan Count', description: 'Number of treatment plans returned', icon: null, category: 'erp' },
];

type FlowNodeVariableSource = {
  id: string;
  type?: string;
  data?: unknown;
};

export function getDataCaptureVariablesFromNodes(nodes: FlowNodeVariableSource[]): FlowVariable[] {
  const variables = new Map<string, FlowVariable>();
  for (const node of nodes) {
    if (!['data_capture', 'dataCapture', 'DataCapture'].includes(String(node.type ?? ''))) continue;
    const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? node.data as Record<string, unknown>
      : {};
    const rules = Array.isArray(data.captureRules) ? data.captureRules : [];
    for (const entry of rules) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const rule = entry as Record<string, unknown>;
      const variableName = String(rule.variableName ?? '').trim();
      if (!variableName || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(variableName)) continue;
      const nodeName = String(data.label ?? '').trim() || `Data Capture ${node.id}`;
      variables.set(variableName, {
        value: variableName,
        label: variableName.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        description: String(rule.description ?? '').trim() || `Captured from ${nodeName}`,
        icon: null,
        category: 'captured',
        dataType: String(rule.dataType ?? 'string'),
        nodeId: node.id,
      });
    }
  }
  return [...variables.values()];
}

export function getAiAssistantVariablesFromNodes(nodes: FlowNodeVariableSource[]): FlowVariable[] {
  const variables = new Map<string, FlowVariable>();
  for (const node of nodes) {
    if (!['ai_assistant', 'aiAssistant', 'aiAssistantNode'].includes(String(node.type ?? ''))) continue;
    const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? node.data as Record<string, unknown>
      : {};
    for (const definition of normalizeAiAssistantVariables(data.aiVariables)) {
      const name = definition.name;
      const nodeName = String(data.label ?? '').trim() || `AI Assistant ${node.id}`;
      variables.set(name, {
        value: name,
        label: name.replace(/[_.]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        description: `Populated by ${nodeName}`,
        icon: null,
        category: 'captured',
        dataType: 'text',
        nodeId: node.id,
      });
    }
  }
  return [...variables.values()];
}

export function getCodeExecutionVariablesFromNodes(nodes: FlowNodeVariableSource[]): FlowVariable[] {
  const variables = new Map<string, FlowVariable>();
  for (const output of getCodeExecutionVariableNamesFromNodes(nodes)) {
    const label = output.variableName.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const description = `Created by ${output.nodeName}`;
    variables.set(output.variableName, {
      value: output.variableName,
      label,
      description,
      icon: null,
      category: 'flow',
      dataType: 'runtime',
      nodeId: output.nodeId,
    });
    variables.set(`code_execution_output.${output.variableName}`, {
      value: `code_execution_output.${output.variableName}`,
      label: `Code Output · ${label}`,
      description: `${description}; also available directly as {{${output.variableName}}}`,
      icon: null,
      category: 'flow',
      dataType: 'runtime',
      nodeId: output.nodeId,
    });
  }
  if (nodes.some((node) => ['code_execution', 'codeExecution', 'codeExecutionNode'].includes(String(node.type ?? '')))) {
    variables.set('code_execution_output', {
      value: 'code_execution_output',
      label: 'Code Execution Output',
      description: 'Complete output object from the latest Code Execution node',
      icon: null,
      category: 'flow',
      dataType: 'object',
    });
  }
  return [...variables.values()];
}

export function getFlowNodeVariablesFromNodes(nodes: FlowNodeVariableSource[]): FlowVariable[] {
  const variables = new Map<string, FlowVariable>();
  getDataCaptureVariablesFromNodes(nodes).forEach((variable) => variables.set(variable.value, variable));
  getAiAssistantVariablesFromNodes(nodes).forEach((variable) => variables.set(variable.value, variable));
  getCodeExecutionVariablesFromNodes(nodes).forEach((variable) => variables.set(variable.value, variable));
  return [...variables.values()];
}

export function getFlowVariableNamesExcludingNode(
  variables: FlowVariable[],
  nodeId: string,
): Set<string> {
  return new Set(
    variables
      .filter((variable) => variable.nodeId !== nodeId)
      .map((variable) => variable.value),
  );
}

export function useFlowVariables(flowId?: number, customVariables?: FlowCustomVariable[], additionalVariables: FlowVariable[] = []) {
  const [variables, setVariables] = useState<FlowVariable[]>(BASE_VARIABLES);
  const [capturedVariables, setCapturedVariables] = useState<FlowVariable[]>([]);
  const [fetchedServerCustomVariables, setFetchedServerCustomVariables] = useState<FlowVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variablesWithCustom = useMemo(() => {
    const merged = new Map<string, FlowVariable>();
    variables.forEach((variable) => merged.set(variable.value, variable));
    additionalVariables.forEach((variable) => merged.set(variable.value, variable));
    const propNames = new Set((customVariables ?? []).map((v) => v.name));
    fetchedServerCustomVariables.filter((variable) => !propNames.has(variable.value)).forEach((variable) => merged.set(variable.value, variable));
    const fromProp: FlowVariable[] = (customVariables ?? []).map((v) => ({
      value: v.name,
      label: v.label,
      description: v.description ?? '',
      icon: null,
      category: 'custom' as const,
      dataType: v.dataType,
    }));
    fromProp.forEach((variable) => merged.set(variable.value, variable));
    return [...merged.values()];
  }, [variables, customVariables, fetchedServerCustomVariables, additionalVariables]);

  const allCapturedVariables = useMemo(() => {
    const merged = new Map<string, FlowVariable>();
    capturedVariables.forEach((variable) => merged.set(variable.value, variable));
    additionalVariables.filter((variable) => variable.category === 'captured').forEach((variable) => merged.set(variable.value, variable));
    return [...merged.values()];
  }, [capturedVariables, additionalVariables]);


  const fetchCapturedVariables = async () => {
    if (!flowId) return;

    setLoading(true);
    setError(null);

    try {

      const response = await fetch(`/api/flows/${flowId}/variables`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch flow variables');
      }

      const data = await response.json();
      
      const captured: FlowVariable[] = data.variables?.map((variable: any) => ({
        value: variable.variableKey,
        label: variable.label || variable.variableKey,
        description: variable.description || `Captured variable of type ${variable.variableType}`,
        icon: null,
        category: variable.variableType === 'media' ? 'media' as const : 'captured' as const,
        dataType: variable.variableType,
        nodeId: variable.nodeId
      })) || [];

      const observed: FlowVariable[] = (data.runtimeVariables || []).map((variable: any) => ({
        value: variable.variableKey,
        label: variable.label || variable.variableKey,
        description: variable.description || 'From a recent flow run',
        icon: null,
        category: 'observed' as const,
        dataType: variable.variableType,
        nodeId: variable.nodeId
      }));

      const baseKeys = new Set(BASE_VARIABLES.map((v) => v.value));
      const capturedKeys = new Set(captured.map((v) => v.value));
      const observedDeduped = observed.filter(
        (v) => !baseKeys.has(v.value) && !capturedKeys.has(v.value)
      );

      const serverCustom: FlowVariable[] = (data.customVariables ?? []).map((entry: any) => ({
        value: entry.variableKey,
        label: entry.label || entry.variableKey,
        description: entry.description ?? '',
        icon: null,
        category: 'custom' as const,
        dataType: entry.variableType,
      }));

      setFetchedServerCustomVariables(serverCustom);
      setCapturedVariables(captured);
      setVariables([...BASE_VARIABLES, ...captured, ...observedDeduped]);
    } catch (err) {
      setFetchedServerCustomVariables([]);
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching flow variables:', err);
    } finally {
      setLoading(false);
    }
  };


  const addCapturedVariable = (variable: Omit<FlowVariable, 'category'>) => {
    const capturedVar: FlowVariable = {
      ...variable,
      category: 'captured'
    };

    setCapturedVariables(prev => {
      const existing = prev.find(v => v.value === variable.value);
      if (existing) {

        return prev.map(v => v.value === variable.value ? capturedVar : v);
      } else {

        return [...prev, capturedVar];
      }
    });

    setVariables(prev => {
      const existing = prev.find(v => v.value === variable.value);
      if (existing) {
        return prev.map(v => v.value === variable.value ? capturedVar : v);
      } else {
        return [...prev, capturedVar];
      }
    });
  };


  const removeCapturedVariable = (variableKey: string) => {
    setCapturedVariables(prev => prev.filter(v => v.value !== variableKey));
    setVariables(prev => prev.filter(v => v.value !== variableKey || v.category !== 'captured'));
  };


  const getVariablesByCategory = (category: FlowVariable['category']) => {
    return variablesWithCustom.filter(v => v.category === category);
  };


  const getVariableKeys = () => {
    return variablesWithCustom.map(v => v.value);
  };


  const hasVariable = (variableKey: string) => {
    return variablesWithCustom.some(v => v.value === variableKey);
  };


  const getVariable = (variableKey: string) => {
    return variablesWithCustom.find(v => v.value === variableKey);
  };

  useEffect(() => {
    fetchCapturedVariables();
  }, [flowId]);

  useEffect(() => {
    const refresh = () => void fetchCapturedVariables();
    window.addEventListener('flow-media-changed', refresh);
    return () => window.removeEventListener('flow-media-changed', refresh);
  }, [flowId]);

  return {
    variables: variablesWithCustom,
    capturedVariables: allCapturedVariables,
    loading,
    error,
    fetchCapturedVariables,
    addCapturedVariable,
    removeCapturedVariable,
    getVariablesByCategory,
    getVariableKeys,
    hasVariable,
    getVariable
  };
}

export const getCategoryLabel = (category: FlowVariable['category']): string => {
  switch (category) {
    case 'contact': return 'Contact Information';
    case 'message': return 'Message Data';
    case 'system': return 'System Variables';
    case 'company': return 'Company Information';
    case 'conversation': return 'Conversation';
    case 'appointment': return 'Appointment';
    case 'erp': return 'ERP Context';
    case 'flow': return 'Flow Variables';
    case 'captured': return 'Captured Variables';
    case 'observed': return 'Recent run variables';
    case 'custom': return 'Custom Variables';
    case 'media': return 'Media Gallery';
    default: return 'Other';
  }
};

export const getCategoryIcon = (category: FlowVariable['category']): React.ReactNode => {
  switch (category) {
    case 'contact': return '👤';
    case 'message': return React.createElement(InboxConversationIcon, { className: 'h-4 w-4' });
    case 'system': return '⚙️';
    case 'company': return '🏢';
    case 'conversation': return React.createElement(InboxConversationIcon, { className: 'h-4 w-4' });
    case 'appointment': return '📅';
    case 'erp': return '🗃️';
    case 'flow': return '🔄';
    case 'captured': return '📊';
    case 'observed': return '🔭';
    case 'custom': return '🔧';
    case 'media': return '🖼️';
    default: return '📝';
  }
};
