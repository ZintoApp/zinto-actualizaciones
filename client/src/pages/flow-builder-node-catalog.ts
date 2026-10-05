import { APP_ICONS } from '@/assets/icons';
/**
 * Node picker catalog for the flow builder sidebar. Plain data only (no inline React
 * components) so list items reconcile across parent re-renders. Icons are bundled locally.
 */
import { getFlowNodeDefinition } from '@shared/flow-node-registry';

/** Shared with Manage Task node canvas header so sidebar and node use the same asset. */
export const MANAGE_TASK_FLOW_NODE_ICON_SRC =
  APP_ICONS.manageTask;

/** POS / ERP flow node palette + canvas header icon (Flaticon). */
export const ERP_FLOW_NODE_ICON_SRC =
  APP_ICONS.erp;

/** Document Generator flow node palette + canvas header icon (Flaticon). */
export const DOCUMENT_GENERATOR_FLOW_NODE_ICON_SRC =
  APP_ICONS.documentGenerator;

/** Gamma flow node palette + canvas header icon (Flaticon). */
export const GAMMA_FLOW_NODE_ICON_SRC = `data:image/svg+xml;base64,${btoa(`<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">
<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="48.000000pt" height="48.000000pt" viewBox="0 0 48.000000 48.000000" preserveAspectRatio="xMidYMid meet">
<rect width="100%" height="100%" rx="6" ry="6" fill="#ffffff"/>
<g transform="translate(5.000000,43.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none">
<path d="M115 361 c-77 -35 -123 -115 -111 -196 10 -63 43 -106 106 -138 45 -23 63 -27 100 -23 152 20 219 196 119 311 -37 41 -49 44 -49 11 0 -19 -7 -26 -30 -30 -16 -3 -43 -9 -60 -12 -87 -17 -74 -134 15 -134 28 0 35 4 35 20 0 16 -7 20 -30 20 -25 0 -30 4 -30 24 0 26 7 30 71 40 42 7 43 5 55 -96 7 -62 10 -60 -86 -73 -83 -11 -153 47 -153 127 0 74 43 119 128 133 63 10 73 16 50 25 -34 14 -88 10 -130 -9z"/>
</g>
</svg>`)}`;

/** Notes annotation node palette + canvas header icon (Flaticon). */
export const NOTES_FLOW_NODE_ICON_SRC =
  APP_ICONS.triggerFlow;

/** Master Shop flow node palette + canvas header icon (mastershop.com favicon). */
export const MASTER_SHOP_FLOW_NODE_ICON_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAMFBMVEVHcEwAAAAAAAAAAAAAAAAAAAAAAAAP/1UAAAADRBYIkzEMz0UGbCQKsjsO8lAN4kvhLuLQAAAAB3RSTlMAd7/qFhgaD8RXWQAAAvZJREFUeJztmw2SqjAQhAXZDQmg97/tQ32CYsL89ISp2rIPYH/VGZJJYk6nh7qmPfeH6dw23elVP+1x5k+1P6t/c7z9TY2z/0Lg5v+f4NfPv+9/ZwCH+lvVzh+Ap3/fd54VcFPjOwK3MThw/svpfPL17/svwBfgLwHE6AswhHBRIFgBxEuYNbgBpHDXxQtgePh7JfCI/yafGkhPe00ABgDD4q8JAAaIq70qABRgevFXBQACDAENAAIYQ4ADQACmd39dAADA9d0/jMcCbOIP4ar8ISXAtPXXBqADiNv49QGoAD7iBwLQAHzGr1qHtQCZ+GelwwBy8SMBSAFy8UMByADWzmMjvb8IIBXsw3QMwFDyRwLgAxTjxwJgAxTjBwPgApTjBwPgAezEH7SNiARgL351IyIA2IsfDoABUJj8FmH+NEB+8l8FLAM8gN36OyCBSPkjCxEHYP8LMIiAAqBKMOgOZkwB5qlA3RGaDMFdU622nC7CZSSmOrvjbA9a0FXxRZAA/AjuEpcDPRVzq2CRbCgYi5GYQDQUnOWYWg5yYg8FryNizQYbXXgxMFuyqEFg7Zj5bflINCY5McpRtDNKkkmBSSDcG8aJ7A/eZQ0waxSVA9mzq45oJOVQBaAXlAM1H+jPCWNilQM1BtBZcWQMRVUAzjpRGYDaNtWsgYfIdoH6AfjKhqhEckWqDECvRzAANgA4wG6zwtm4ogB7CwNr41zxM+Rt3FEA1B8FKE8D3BsMy4tLjT8KUCoB/g0OCFDwFxzdYQCFEpAcHWIA+dVYdHRpeHmt8gcBcH+wJcv4S8/OIYBMCYjP7iGAzxKQ3x1AAAb+EMBHCWjuThCAbQmoTo0RgMHAHwKw8EcAooU/ApAs/BGA1xLQH5cDACb+yPmAiT8AMJn4AwCDiT8A8PSvfnNa0GjjrwdINv56gGjjD9RAQm8MUYA5BNz+b/29/wvwBVACuD/1cn/s5v7cr/MF6PyffPo/enV/9uv/8Nn/6bf/43fP5///APpq9gXvN8alAAAAAElFTkSuQmCC';

export type FlowNodeCatalogEntry = {
  type: string;
  name: string;
  section: string;
  iconSrc: string;
  iconAlt: string;
  color: string;
  disabled: boolean;
  tooltip: string;
};

type FlowNodeCatalogNodeRef = {
  type?: string;
  data?: { label?: string };
};

export function isMessageTriggerNode(node: FlowNodeCatalogNodeRef): boolean {
  return (
    node.type === 'trigger' ||
    node.type === 'triggerNode' ||
    node.data?.label === 'Message Trigger'
  );
}

export function flowHasMessageTrigger(nodes: FlowNodeCatalogNodeRef[]): boolean {
  return nodes.some(isMessageTriggerNode);
}

function getSingletonNodeState(
  nodeType: string,
  ctx: { hasMessageTrigger: boolean },
  t: (key: string, defaultValue?: string) => string
): Pick<FlowNodeCatalogEntry, 'disabled' | 'tooltip'> {
  switch (nodeType) {
    case 'trigger':
      if (ctx.hasMessageTrigger) {
        return {
          disabled: true,
          tooltip: t(
            'flow_builder.singleton_errors.trigger_exists',
            'Only one Message Trigger allowed per flow'
          ),
        };
      }
      return { disabled: false, tooltip: '' };
    default:
      return { disabled: false, tooltip: '' };
  }
}

export function buildFlowNodeCatalog(
  t: (key: string, defaultValue?: string) => string,
  options?: { nodes?: FlowNodeCatalogNodeRef[] }
): FlowNodeCatalogEntry[] {
  const catalogContext = {
    hasMessageTrigger: flowHasMessageTrigger(options?.nodes ?? []),
  };
  const entries: FlowNodeCatalogEntry[] = [
    {
      type: 'trigger',
      name: t('flow_builder.node_types.trigger_node', 'Message Trigger'),
      section: t('flow_builder.sections.triggers', 'Triggers'),
      iconSrc: APP_ICONS.messageTrigger,
      iconAlt: 'Message Trigger',
      color: 'text-green-500',
      ...getSingletonNodeState('trigger', catalogContext, t),
    },
    {
      type: 'webhookTrigger',
      name: t('flow_builder.node_types.webhook_trigger', 'Webhook Trigger'),
      section: t('flow_builder.sections.triggers', 'Triggers'),
      iconSrc: APP_ICONS.webhookTrigger,
      iconAlt: 'Webhook Trigger',
      color: 'text-purple-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'mastershopWebhookTrigger',
      name: t('flow_builder.node_types.mastershop_webhook_trigger', 'Master Shop Webhook Trigger'),
      section: t('flow_builder.sections.triggers', 'Triggers'),
      iconSrc: MASTER_SHOP_FLOW_NODE_ICON_SRC,
      iconAlt: 'Master Shop Webhook Trigger',
      color: 'text-purple-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'ai_assistant',
      name: t('flow_builder.node_types.ai_assistant', 'AI Assistant'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.aiAssistant,
      iconAlt: 'AI Assistant',
      color: 'text-violet-500',
      ...getSingletonNodeState('ai_assistant', catalogContext, t),
    },
    {
      type: 'mcp_client_tool',
      name: t('flow_builder.node_types.mcp_client_tool', 'MCP Client Tool'),
      section: t('flow_builder.sections.ai_tools', 'AI Tools'),
      iconSrc: APP_ICONS.mcpClientTool,
      iconAlt: 'MCP Client Tool',
      color: 'text-teal-500',
      ...getSingletonNodeState('mcp_client_tool', catalogContext, t),
    },
    {
      type: 'mcp_execute_tool',
      name: t('flow_builder.node_types.mcp_execute_tool', 'MCP Execute Tool'),
      section: t('flow_builder.sections.ai_tools', 'AI Tools'),
      iconSrc: APP_ICONS.mcpExecuteTool,
      iconAlt: 'MCP Execute Tool',
      color: 'text-purple-500',
      ...getSingletonNodeState('mcp_execute_tool', catalogContext, t),
    },
    {
      type: 'message',
      name: t('flow_builder.node_types.text_message', 'Text Message'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.textMessage,
      iconAlt: 'Text Message',
      color: 'text-secondry',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'quickreply',
      name: t('flow_builder.node_types.quick_reply_options', 'Quick Reply Options'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.quickReplyOptions,
      iconAlt: 'Quick Reply Options',
      color: 'text-blue-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'whatsapp_poll',
      name: t('flow_builder.node_types.whatsapp_poll', 'WhatsApp Poll'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.whatsappPoll,
      iconAlt: 'WhatsApp Poll',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'whatsapp_interactive_buttons',
      name: t('flow_builder.node_types.whatsapp_interactive_buttons', 'WhatsApp Buttons'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.whatsappButtons,
      iconAlt: 'WhatsApp Buttons',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'whatsapp_interactive_list',
      name: t('flow_builder.node_types.whatsapp_interactive_list', 'WhatsApp List'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.whatsappList,
      iconAlt: 'WhatsApp List',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'whatsapp_cta_url',
      name: t('flow_builder.node_types.whatsapp_cta_url', 'WhatsApp CTA URL'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.whatsappCtaUrl,
      iconAlt: 'WhatsApp CTA URL',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'whatsapp_location_request',
      name: t('flow_builder.node_types.whatsapp_location_request', 'WA Location Request'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.whatsappLocationRequest,
      iconAlt: 'WA Location Request',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'whatsapp_flows',
      name: t('flow_builder.node_types.whatsapp_flows', 'WhatsApp Flows'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.whatsappFlows,
      iconAlt: 'WhatsApp Flows',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'image',
      name: t('flow_builder.node_types.image_message', 'Image Message'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.imageMessage,
      iconAlt: 'Image Message',
      color: 'text-blue-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'video',
      name: t('flow_builder.node_types.video_message', 'Video Message'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.videoMessage,
      iconAlt: 'Video Message',
      color: 'text-red-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'audio',
      name: t('flow_builder.node_types.audio_message', 'Audio Message'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.audioMessage,
      iconAlt: 'Audio Message',
      color: 'text-purple-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'document',
      name: t('flow_builder.node_types.document_message', 'Document Message'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.documentMessage,
      iconAlt: 'Document Message',
      color: 'text-amber-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'ai_assistant',
      name: t('flow_builder.node_types.ai_assistant', 'AI Assistant'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.aiAssistant,
      iconAlt: 'AI Assistant',
      color: 'text-violet-500',
      ...getSingletonNodeState('ai_assistant', catalogContext, t),
    },
    {
      type: 'condition',
      name: t('flow_builder.node_types.condition', 'Condition'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.condition,
      iconAlt: 'Condition',
      color: 'text-amber-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'wait',
      name: t('flow_builder.node_types.wait', 'Wait'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.wait,
      iconAlt: 'Wait',
      color: 'text-orange-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'follow_up',
      name: t('flow_builder.node_types.follow_up', 'Follow-up Message'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.followUpMessage,
      iconAlt: 'Follow-up Message',
      color: 'text-orange-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'translation',
      name: t('flow_builder.node_types.translation', 'Translation'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.translation,
      iconAlt: 'Translation',
      color: 'text-blue-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'update_pipeline_stage',
      name: t('flow_builder.node_types.pipeline', 'Pipeline'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.pipeline,
      iconAlt: 'Pipeline',
      color: 'text-teal-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'move_deal_to_pipeline',
      name: t('flow_builder.node_types.move_deal_to_pipeline', 'Move Deal to Pipeline'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.pipeline,
      iconAlt: 'Move Deal to Pipeline',
      color: 'text-purple-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'manage_contact',
      name: t('flow_builder.node_types.manage_contact', 'Manage Contact'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.manageContact,
      iconAlt: 'Manage Contact',
      color: 'text-indigo-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'manage_task',
      name: t('flow_builder.node_types.manage_task', 'Manage Task'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: MANAGE_TASK_FLOW_NODE_ICON_SRC,
      iconAlt: 'Manage Task',
      color: 'text-emerald-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'bot_disable',
      name: t('flow_builder.node_types.agent_handoff', 'Agent Handoff'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.agentHandoff,
      iconAlt: 'Agent Handoff',
      color: 'text-orange-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'end_conversation',
      name: t('flow_builder.node_types.end_conversation', 'End Conversation'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.endConversation,
      iconAlt: 'End Conversation',
      color: 'text-orange-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'n8n',
      name: t('flow_builder.node_types.n8n', 'n8n'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.n8n,
      iconAlt: 'n8n',
      color: 'text-orange-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'make',
      name: t('flow_builder.node_types.make_com', 'Make.com'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.makeCom,
      iconAlt: 'Make.com',
      color: 'text-blue-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'http_request',
      name: t('flow_builder.node_types.http_request', 'HTTP Request'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.httpRequest,
      iconAlt: 'HTTP Request',
      color: 'text-purple-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'database_query',
      name: t('flow_builder.node_types.database_query', 'Database'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.database,
      iconAlt: 'Database',
      color: 'text-sky-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'code_execution',
      name: t('flow_builder.node_types.code_execution', 'Code Execution'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.codeExecution,
      iconAlt: t('flow_builder.code_execution.alt', 'Code Execution'),
      color: 'text-foreground',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'google_sheets',
      name: t('flow_builder.node_types.google_sheets', 'Google Sheets'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.googleSheets,
      iconAlt: 'Google Sheets',
      color: 'text-green-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'data_capture',
      name: t('flow_builder.node_types.data_capture', 'Data Capture'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.dataCapture,
      iconAlt: 'Data Capture',
      color: 'text-blue-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'webhook',
      name: t('flow_builder.node_types.webhook', 'Webhook'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.webhookTrigger,
      iconAlt: 'Webhook',
      color: 'text-blue-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'stripe',
      name: t('flow_builder.node_types.stripe', 'Stripe'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.stripe,
      iconAlt: 'Stripe',
      color: 'text-blue-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'erp',
      name: t('flow_builder.node_types.erp', 'ERP'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: ERP_FLOW_NODE_ICON_SRC,
      iconAlt: 'ERP',
      color: 'text-emerald-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'mastershop',
      name: t('flow_builder.node_types.mastershop', 'Master Shop'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: MASTER_SHOP_FLOW_NODE_ICON_SRC,
      iconAlt: 'Master Shop',
      color: 'text-emerald-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'woocommerce',
      name: t('flow_builder.node_types.woocommerce', 'WooCommerce'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.woocommerce,
      iconAlt: 'WooCommerce',
      color: 'text-purple-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'call_agent',
      name: t('flow_builder.node_types.call_agent', 'Call Agent'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.callAgent,
      iconAlt: 'Call Agent',
      color: 'text-blue-500',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'contactNotification',
      name: t('flow_builder.contact_notification', 'Contact Notification'),
      section: t('flow_builder.sections.messages', 'Messages'),
      iconSrc: APP_ICONS.contactNotification,
      iconAlt: 'Contact Notification',
      color: 'text-purple-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'documind',
      name: t('flow_builder.node_types.documind_pdf_chat', 'Documind PDF Chat'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.documentMessage,
      iconAlt: 'Documind PDF Chat',
      color: 'text-orange-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'chat_pdf',
      name: t('flow_builder.node_types.chat_pdf_ai', 'Chat PDF AI'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: APP_ICONS.documentMessage,
      iconAlt: 'Chat PDF AI',
      color: 'text-blue-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'gamma',
      name: t('flow_builder.node_types.gamma', 'Gamma'),
      section: t('flow_builder.sections.integrations', 'Integrations'),
      iconSrc: GAMMA_FLOW_NODE_ICON_SRC,
      iconAlt: 'Gamma',
      color: 'text-violet-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'flow_trigger',
      name: t('flow_builder.node_types.flow_trigger', 'Trigger Flow'),
      section: t('flow_builder.sections.flow_control', 'Flow Control'),
      iconSrc: APP_ICONS.triggerFlow,
      iconAlt: 'Trigger Flow',
      color: 'text-indigo-600',
      disabled: false,
      tooltip: '',
    },
    {
      type: 'notes',
      name: t('flow_builder.node_types.notes', 'Notes'),
      section: t('flow_builder.sections.annotations', 'Annotations'),
      iconSrc: NOTES_FLOW_NODE_ICON_SRC,
      iconAlt: t('flow_builder.notes_icon_alt', 'Notes'),
      color: 'text-amber-600',
      disabled: false,
      tooltip: '',
    },
  ];
  return entries.filter((entry) => {
    const definition = getFlowNodeDefinition(entry.type);
    return Boolean(definition?.visible && definition.generatable);
  });
}
