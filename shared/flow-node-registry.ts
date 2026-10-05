import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import {
  LEGACY_NODE_TYPE_MAPPINGS,
  MEDIA_ITEMS_DEFAULT_DELAY_MS,
  ERP_PRICE_INQUIRY_RESPONSE_DEFAULT,
  NodeTypeUtils,
  createDefaultConditionNodeData,
} from './types/node-types';
import type {
  FlowNodeDefinition,
  FlowNodeFieldDefinition,
  FlowNodeHandleDefinition,
} from './types/ai-flow-creator';
import { sha256Hex } from './sha256';
import {
  ERP_OPERATIONS,
  ERP_RESOURCES,
  ERP_RESOURCE_BUSINESS_TYPE,
} from './types/node-types';

export const FLOW_NODE_REGISTRY_VERSION = '2026-09-06.1';
export const FLOW_DEFAULT_TARGET_HANDLE_ID = 'flow-in';
export const FLOW_DEFAULT_SOURCE_HANDLE_ID = 'flow-out';
export const AI_TOOL_INPUT_HANDLE_ID = 'tool-input';

const target = (id = FLOW_DEFAULT_TARGET_HANDLE_ID, label?: string): FlowNodeHandleDefinition => ({
  id,
  kind: 'target',
  label,
  controlFlow: id !== AI_TOOL_INPUT_HANDLE_ID,
});
const source = (id = FLOW_DEFAULT_SOURCE_HANDLE_ID, label?: string): FlowNodeHandleDefinition => ({
  id,
  kind: 'source',
  label,
  controlFlow: true,
});

const f = (
  name: string,
  type: FlowNodeFieldDefinition['type'],
  description: string,
  options: Partial<FlowNodeFieldDefinition> = {},
): FlowNodeFieldDefinition => ({ name, type, description, ...options });

function schemaForFields(fields: FlowNodeFieldDefinition[]) {
  const shape: ZodRawShape = {};
  for (const field of fields) {
    let schema: ZodTypeAny;
    switch (field.type) {
      case 'string': schema = z.string(); break;
      case 'number': schema = z.number(); break;
      case 'boolean': schema = z.boolean(); break;
      case 'array': schema = z.array(z.unknown()); break;
      case 'object': schema = z.record(z.unknown()); break;
      case 'enum': schema = field.values?.length
        ? z.enum(field.values as [string, ...string[]])
        : z.string(); break;
    }
    shape[field.name] = field.required ? schema : schema.nullish();
  }
  return z.object(shape).passthrough() as unknown as FlowNodeDefinition['dataSchema'];
}

type DefinitionInput = Omit<FlowNodeDefinition, 'aliases' | 'fields' | 'handles' | 'credentials' | 'operations' | 'inputs' | 'outputs' | 'variableOutputs' | 'mappingFields' | 'behavior' | 'limitations' | 'examples' | 'keywords' | 'dataSchema'> &
  Partial<Pick<FlowNodeDefinition, 'aliases' | 'fields' | 'handles' | 'credentials' | 'operations' | 'inputs' | 'outputs' | 'variableOutputs' | 'mappingFields' | 'behavior' | 'limitations' | 'examples' | 'keywords'>>;

function define(input: DefinitionInput): FlowNodeDefinition {
  const fields = input.fields ?? [];
  return {
    aliases: [],
    handles: input.canvasOnly
      ? []
      : input.entryPoint
        ? [source()]
        : input.terminal
          ? [target()]
          : [target(), source()],
    credentials: [],
    operations: [],
    inputs: ['Execution context and {{variable}} expressions'],
    outputs: ['Passes execution context to connected nodes'],
    variableOutputs: input.outputs ?? ['Passes execution context to connected nodes'],
    mappingFields: Object.keys(input.defaultData()).filter((key) => /mappings|captureRules/i.test(key)),
    behavior: ['Executes once when reached by control-flow traversal'],
    limitations: [],
    examples: [],
    keywords: [],
    ...input,
    fields,
    dataSchema: schemaForFields(fields),
  };
}

const mediaDefaults = (label: string) => ({
  label,
  mediaItems: [],
  interItemDelayMs: MEDIA_ITEMS_DEFAULT_DELAY_MS,
});

const integrationCredential = (key: string, label: string, fields: string[]) => [{
  key,
  label,
  description: `${label} must be configured before activation.`,
  fields,
  requiredForActivation: true,
}];

const visibleDefinitions: FlowNodeDefinition[] = [
  define({
    canvasType: 'trigger', canonicalType: 'trigger', displayName: 'Message Trigger', category: 'Triggers',
    description: 'Starts a flow from an incoming channel message and optional keyword, stage, or Meta Ad routing rules.',
    visible: true, generatable: true, entryPoint: true,
    aliases: ['triggerNode', 'Message Trigger'],
    fields: [
      f('channelTypes', 'array', 'Accepted channel types', { required: true, defaultValue: ['whatsapp_unofficial'] }),
      f('conditionType', 'enum', 'Message matching mode', { required: true, values: ['any', 'keyword', 'multiple_keywords'], defaultValue: 'any' }),
      f('conditionValue', 'string', 'Keyword or expression', { defaultValue: '' }),
    ],
    handles: [source(), source('initial-message', 'Initial message')],
    outputs: ['message.*', 'contact.*', 'conversation.*', 'flow.*'],
    behavior: ['Multiple Message Trigger nodes are supported by the executor, although the current manual palette limits creation to one.'],
    keywords: ['incoming message', 'keyword', 'conversation', 'whatsapp', 'facebook', 'instagram'],
    examples: ['When a customer sends any message, begin the support flow.'],
    defaultData: () => ({ label: 'Message Trigger', channelTypes: ['whatsapp_unofficial'], conditionType: 'any', conditionValue: '', enableSessionPersistence: true, sessionTimeout: 30, sessionTimeoutUnit: 'minutes', enableInitialMessageOutput: false, initialMessageSourceMode: 'generic', metaAdRoutingKeys: [] }),
  }),
  define({
    canvasType: 'webhookTrigger', canonicalType: 'webhookTrigger', displayName: 'Webhook Trigger', category: 'Triggers',
    description: 'Starts a flow from an inbound, persisted webhook endpoint.', visible: true, generatable: true, entryPoint: true,
    aliases: ['webhookTriggerNode', 'webhook_trigger'],
    fields: [f('method', 'enum', 'Allowed HTTP method', { values: ['POST', 'GET', 'PUT', 'PATCH'], defaultValue: 'POST' })],
    outputs: ['webhook.body', 'webhook.query', 'webhook.headers', 'webhook.params'], keywords: ['incoming webhook', 'api callback'],
    defaultData: () => ({ label: 'Webhook Trigger', method: 'POST', authentication: 'none', responseMode: 'immediate' }),
  }),
  define({
    canvasType: 'mastershopWebhookTrigger', canonicalType: 'mastershopWebhookTrigger', displayName: 'Master Shop Webhook Trigger', category: 'Triggers',
    description: 'Starts a flow from a Master Shop webhook event.', visible: true, generatable: true, entryPoint: true,
    aliases: ['mastershop_webhook_trigger', 'mastershopWebhookTriggerNode'],
    fields: [f('eventTypes', 'array', 'Master Shop event types')],
    credentials: integrationCredential('mastershop-connection', 'Master Shop connection', ['connectionId']),
    outputs: ['mastershop.event', 'mastershop.payload'], keywords: ['master shop event', 'order webhook'],
    defaultData: () => ({ label: 'Master Shop Webhook Trigger', eventTypes: [], connectionId: null }),
  }),
  define({
    canvasType: 'ai_assistant', canonicalType: 'aiAssistant', displayName: 'AI Assistant', category: 'Messages',
    description: 'Generates conversational responses and can use configured tasks, calendars, knowledge, and MCP tools.', visible: true, generatable: true,
    aliases: ['aiAssistant', 'aiAssistantNode'],
    fields: [
      f('provider', 'enum', 'LLM provider', { required: true, values: ['openai', 'openrouter', 'azure'], defaultValue: 'openai' }),
      f('model', 'string', 'Model or Azure deployment', { required: true, defaultValue: 'gpt-5.6-luna' }),
      f('prompt', 'string', 'System prompt', { required: true, defaultValue: 'You are a helpful assistant.' }),
      f('timezone', 'string', 'IANA timezone used for assistant date/time context and booking tools. Empty inherits the company timezone.', { defaultValue: '' }),
      f('aiVariables', 'array', 'Text outputs inferred from unknown placeholders in the system prompt.', { defaultValue: [] }),
      f('customFieldBindings', 'array', 'Company contact and deal custom fields explicitly exposed to the assistant. Use only customFieldId, entity, and fieldName values from accessibleResources.contactCustomFields or accessibleResources.dealCustomFields.', {
        defaultValue: [],
        itemFields: [
          f('id', 'string', 'Stable binding ID. Use ai_custom_field_<entity>_<customFieldId>.', { required: true }),
          f('customFieldId', 'number', 'Existing company custom-field ID from the matching accessible custom-field resource.', { required: true }),
          f('entity', 'enum', 'Owner of the custom field.', { required: true, values: ['contact', 'deal'] }),
          f('fieldName', 'string', 'Immutable storage key from the matching accessible custom-field resource.', { required: true }),
          f('mode', 'enum', 'read exposes the current value, write lets the assistant populate it, and read_write enables both.', { required: true, values: ['read', 'write', 'read_write'] }),
          f('required', 'boolean', 'For write or read_write only: require a populated value before the Variables Complete route can run. Always false for read.', { defaultValue: false }),
        ],
      }),
      f('credentialSource', 'enum', 'Credential resolution source', { values: ['auto', 'company', 'system', 'manual'], defaultValue: 'auto' }),
      f('enableErp', 'boolean', 'Enable mode-aware ERP Automation tools.', { defaultValue: false }),
      f('erpCatalogPriceSharingEnabled', 'boolean', 'Allow the assistant to disclose product and service catalog prices.', { condition: 'enableErp=true', defaultValue: true }),
      f('erpPriceInquiryResponse', 'string', 'Guidance used for catalog-price questions when price sharing is disabled.', { condition: 'enableErp=true and erpCatalogPriceSharingEnabled=false', defaultValue: ERP_PRICE_INQUIRY_RESPONSE_DEFAULT }),
      f('enableLocalDentalBooking', 'boolean', 'Use the local Dental booking adapter. Dental mode only; requires enableErp=true and enableGoogleCalendar=false.', { condition: 'active ERP mode=dental', defaultValue: false }),
      f('localDentalProviderDetailsSharingEnabled', 'boolean', 'Allow local Dental booking replies to identify providers.', { condition: 'enableLocalDentalBooking=true', defaultValue: true }),
      f('localDentalServiceDetailsSharingEnabled', 'boolean', 'Allow local Dental booking replies to enumerate service details.', { condition: 'enableLocalDentalBooking=true', defaultValue: true }),
      f('localDentalSingleSlotOfferingEnabled', 'boolean', 'Offer one available local Dental appointment time per reply.', { condition: 'enableLocalDentalBooking=true', defaultValue: false }),
      f('enableGoogleCalendar', 'boolean', 'Enable Google Calendar tools. Disable this when local Dental booking is enabled.', { defaultValue: false }),
    ],
    handles: [target(), target(AI_TOOL_INPUT_HANDLE_ID, 'MCP tool input'), source(), source('variables-complete', 'Variables complete'), source('calendar-booking-completed', 'Calendar booking complete')],
    credentials: integrationCredential('assistant-llm', 'AI provider credential', ['apiKey']),
    operations: ['respond', 'execute_tasks', 'calendar_tools', 'knowledge_search', 'erp_automation'],
    outputs: ['ai.response', 'ai.* task variables', 'configured output variables'],
    variableOutputs: ['Dynamic text variables named by aiVariables[].name', 'ai.* response and routing metadata'],
    behavior: [
      'May pause while tools run and can route from task, variable-complete, or calendar-complete handles.',
      'Configured readable custom fields are available at contact.customFields.<fieldName> or deal.customFields.<fieldName>; configured writable fields can be populated with values validated against their company field definition.',
      'Custom-field writes require the executing user to have permission for the entity. Deal bindings require an active deal for the current contact; without one, deal values cannot be read or populated.',
      'ERP tools are derived from the active company mode. For a local Dental booking workflow set enableErp=true, enableLocalDentalBooking=true, and enableGoogleCalendar=false.',
    ],
    limitations: [
      'Generate customFieldBindings only from accessibleResources.contactCustomFields and accessibleResources.dealCustomFields; never invent a customFieldId or fieldName.',
      'Set required=true only on write or read_write bindings that must be populated before the Variables Complete route runs.',
    ],
    examples: [
      'Read a contact loyalty tier while answering the customer.',
      'Populate a required contact lead-source field before routing through Variables Complete.',
      'Read and update an active deal qualification field.',
    ],
    keywords: ['ai', 'chatbot', 'answer questions', 'calendar', 'knowledge base', 'erp automation', 'dental booking', 'contact custom fields', 'deal custom fields', 'populate fields'],
    defaultData: () => ({ label: 'AI Assistant', provider: 'openai', model: 'gpt-5.6-luna', credentialSource: 'auto', apiKey: '', prompt: 'You are a helpful assistant. Answer accurately and concisely.', timezone: '', aiVariables: [], customFieldBindings: [], enableHistory: true, enableAudio: false, enableImage: false, enableTaskExecution: false, tasks: [], taskGroups: [], enableErp: false, erpCatalogPriceSharingEnabled: true, erpPriceInquiryResponse: ERP_PRICE_INQUIRY_RESPONSE_DEFAULT, enableLocalDentalBooking: false, localDentalProviderDetailsSharingEnabled: true, localDentalServiceDetailsSharingEnabled: true, localDentalSingleSlotOfferingEnabled: false, enableGoogleCalendar: false, googleCalendarId: 'primary', calendarFunctions: [] }),
  }),
  define({
    canvasType: 'mcp_client_tool', canonicalType: 'mcp_client_tool', displayName: 'MCP Client Tool', category: 'AI Tools',
    description: 'Declares MCP servers and exposes their tools to a connected AI Assistant.', visible: true, generatable: true,
    aliases: ['mcpClientTool'], fields: [f('servers', 'array', 'MCP server definitions', { required: true, setupRequired: true })],
    handles: [source()], credentials: integrationCredential('mcp-server', 'MCP server connection', ['servers']),
    behavior: ['Configuration-only tool edge; it is not a normal control-flow action.'], limitations: ['Only connects to the AI Assistant tool-input handle.'],
    keywords: ['mcp', 'model context protocol', 'tools'],
    defaultData: () => ({ label: 'MCP Client Tool', servers: [{ id: 'server-1', name: '', url: '', transport: 'streamable-http', authMode: 'none', headers: [], toolFilter: { mode: 'all', tools: [] } }] }),
  }),
  define({
    canvasType: 'mcp_execute_tool', canonicalType: 'mcp_execute_tool', displayName: 'MCP Execute Tool', category: 'AI Tools',
    description: 'Executes one selected MCP tool as a normal control-flow node.', visible: true, generatable: true,
    aliases: ['mcpExecuteTool'],
    fields: [f('serverConfig', 'object', 'MCP server configuration', { required: true, setupRequired: true }), f('toolName', 'string', 'Tool name', { setupRequired: true }), f('argumentsJson', 'string', 'JSON arguments', { defaultValue: '{}' })],
    credentials: integrationCredential('mcp-execute-server', 'MCP server and tool', ['serverConfig', 'toolName']), outputs: ['mcp.*'], keywords: ['execute mcp tool'],
    defaultData: () => ({ label: 'MCP Execute Tool', serverConfig: { id: 'server-1', name: '', url: '', transport: 'streamable-http', authMode: 'none', headers: [], toolFilter: { mode: 'all', tools: [] } }, toolName: '', argumentsJson: '{}', outputVariablePrefix: 'mcp' }),
  }),
  define({
    canvasType: 'message', canonicalType: 'message', displayName: 'Text Message', category: 'Messages',
    description: 'Sends a text message with variable interpolation.', visible: true, generatable: true,
    aliases: ['messageNode'], fields: [f('message', 'string', 'Message text', { required: true, defaultValue: 'Hello! How can I help you?' })],
    inputs: ['{{message.*}}, {{contact.*}}, and flow variables'], keywords: ['send text', 'reply', 'message'],
    defaultData: () => ({ label: 'Text Message', message: 'Hello! How can I help you?' }),
  }),
  define({
    canvasType: 'quickreply', canonicalType: 'quickReply', displayName: 'Quick Reply Options', category: 'Messages',
    description: 'Sends selectable quick replies and waits for a valid user response.', visible: true, generatable: true,
    aliases: ['quickReplyNode', 'quick_reply'], fields: [f('message', 'string', 'Prompt', { required: true }), f('options', 'array', 'Reply options', { required: true })],
    outputs: ['selected option value'], behavior: ['Pauses until the user chooses an option.'], keywords: ['menu', 'choices', 'quick replies'],
    defaultData: () => ({ label: 'Quick Reply Options', message: 'Please select an option:', options: [{ text: 'Option 1', value: 'option_1' }, { text: 'Option 2', value: 'option_2' }], invalidResponseMessage: 'Please choose one of the available options.', enableGoBack: false, goBackText: '← Go Back', goBackValue: 'go_back' }),
  }),
  define({
    canvasType: 'whatsapp_poll', canonicalType: 'whatsappPoll', displayName: 'WhatsApp Poll', category: 'Messages',
    description: 'Sends a WhatsApp poll and waits for a choice.', visible: true, generatable: true,
    aliases: ['whatsappPoll'], fields: [f('question', 'string', 'Poll question', { required: true }), f('options', 'array', 'Poll options', { required: true })],
    outputs: ['selected poll option'], behavior: ['Pauses for user input.'], keywords: ['poll', 'vote'],
    defaultData: () => ({ label: 'WhatsApp Poll', question: 'Please answer:', message: 'Please answer:', options: [{ text: 'Option 1', value: 'option1' }, { text: 'Option 2', value: 'option2' }], invalidResponseMessage: 'Please choose one of the available options.', enableGoBack: false }),
  }),
  define({
    canvasType: 'whatsapp_interactive_buttons', canonicalType: 'whatsappInteractiveButtons', displayName: 'WhatsApp Buttons', category: 'Messages',
    description: 'Sends WhatsApp interactive buttons and waits for a selection.', visible: true, generatable: true,
    aliases: ['whatsappInteractiveButtons'], fields: [f('bodyText', 'string', 'Message body', { required: true }), f('buttons', 'array', 'Up to the channel-supported number of buttons', { required: true })],
    outputs: ['selected button payload'], behavior: ['Pauses for user input.'], keywords: ['whatsapp buttons', 'choices'],
    defaultData: () => ({ label: 'WhatsApp Buttons', headerText: '', bodyText: 'Please select an option:', footerText: '', buttons: [{ id: '1', title: 'Option 1', payload: 'option_1' }, { id: '2', title: 'Option 2', payload: 'option_2' }] }),
  }),
  define({
    canvasType: 'whatsapp_interactive_list', canonicalType: 'whatsappInteractiveList', displayName: 'WhatsApp List', category: 'Messages',
    description: 'Sends a sectioned WhatsApp list and waits for a row selection.', visible: true, generatable: true,
    aliases: ['whatsappInteractiveList'], fields: [f('bodyText', 'string', 'Message body', { required: true }), f('buttonText', 'string', 'List button label', { required: true }), f('sections', 'array', 'Sections and rows', { required: true })],
    outputs: ['selected row payload'], behavior: ['Pauses for user input.'], keywords: ['whatsapp list', 'menu sections'],
    defaultData: () => ({ label: 'WhatsApp List', headerText: '', bodyText: 'Please select an option:', footerText: '', buttonText: 'View Options', sections: [{ id: '1', title: 'Options', rows: [{ id: '1', title: 'Option 1', description: '', payload: 'option_1' }] }] }),
  }),
  define({
    canvasType: 'whatsapp_cta_url', canonicalType: 'whatsappCTAURL', displayName: 'WhatsApp CTA URL', category: 'Messages',
    description: 'Sends a WhatsApp call-to-action button that opens a URL.', visible: true, generatable: true,
    aliases: ['whatsappCTAURL'], fields: [f('bodyText', 'string', 'Message body', { required: true }), f('buttonText', 'string', 'CTA label', { required: true }), f('url', 'string', 'Destination URL', { setupRequired: true })],
    keywords: ['call to action', 'open url', 'website button'],
    defaultData: () => ({ label: 'WhatsApp CTA URL', bodyText: 'Open the link below:', buttonText: 'Open', url: '' }),
  }),
  define({
    canvasType: 'whatsapp_location_request', canonicalType: 'whatsappLocationRequest', displayName: 'WA Location Request', category: 'Messages',
    description: 'Requests the customer’s location and waits for a location response.', visible: true, generatable: true,
    aliases: ['whatsappLocationRequest'], fields: [f('bodyText', 'string', 'Request text', { required: true })],
    outputs: ['location.latitude', 'location.longitude', 'location.name', 'location.address'], behavior: ['Pauses for a location response.'], keywords: ['request location', 'gps'],
    defaultData: () => ({ label: 'WA Location Request', bodyText: 'Please share your location.' }),
  }),
  define({
    canvasType: 'whatsapp_flows', canonicalType: 'whatsappFlows', displayName: 'WhatsApp Flows', category: 'Messages',
    description: 'Sends a configured WhatsApp interactive Flow form.', visible: true, generatable: true,
    aliases: ['whatsappFlows'], fields: [f('flowName', 'string', 'Display name', { required: true }), f('flowId', 'string', 'Published WhatsApp Flow ID', { setupRequired: true }), f('flowJSON', 'object', 'WhatsApp Flow JSON', { required: true })],
    credentials: integrationCredential('whatsapp-flow', 'Published WhatsApp Flow', ['flowId']), outputs: ['WhatsApp Flow submission data'], keywords: ['whatsapp form', 'interactive flow'],
    defaultData: () => ({ label: 'WhatsApp Flows', flowName: 'Customer Form', flowId: '', screens: [{ id: 'WELCOME_SCREEN', title: 'Welcome', terminal: true, layout: { type: 'SingleColumnLayout', children: [{ type: 'TextHeading', text: 'Welcome' }] } }], flowJSON: { version: '7.2', screens: [{ id: 'WELCOME_SCREEN', title: 'Welcome', terminal: true, layout: { type: 'SingleColumnLayout', children: [{ type: 'TextHeading', text: 'Welcome' }] } }] } }),
  }),
  ...(['image', 'video', 'audio', 'document'] as const).map((canvasType) => define({
    canvasType, canonicalType: canvasType, displayName: `${canvasType[0].toUpperCase()}${canvasType.slice(1)} Message`, category: 'Messages',
    description: `Sends one or more ${canvasType} media items.`, visible: true, generatable: true,
    aliases: [`${canvasType}Node`], fields: [f('mediaItems', 'array', 'Uploaded or remote media items', { setupRequired: true }), f('interItemDelayMs', 'number', 'Delay between multiple items')],
    credentials: integrationCredential(`${canvasType}-media`, `${canvasType} media`, ['mediaItems']), keywords: [canvasType, 'send media'],
    defaultData: () => mediaDefaults(`${canvasType[0].toUpperCase()}${canvasType.slice(1)} Message`),
  })),
  define({
    canvasType: 'condition', canonicalType: 'condition', displayName: 'Condition', category: 'Flow Control',
    description: 'Evaluates a rule tree and routes through yes or no handles.', visible: true, generatable: true,
    aliases: ['conditionNode'], fields: [f('conditionRuleTree', 'object', 'Nested condition rule tree', { required: true })],
    handles: [target(), source('yes', 'Yes'), source('no', 'No')], operations: ['all', 'any', 'not'], outputs: ['yes branch', 'no branch'], keywords: ['if', 'branch', 'rule'],
    defaultData: () => ({ label: 'Condition', ...createDefaultConditionNodeData() }),
  }),
  define({
    canvasType: 'wait', canonicalType: 'wait', displayName: 'Wait', category: 'Flow Control',
    description: 'Delays execution by a configured duration.', visible: true, generatable: true,
    aliases: ['waitNode'], fields: [f('timeValue', 'number', 'Duration', { required: true, defaultValue: 5 }), f('timeUnit', 'enum', 'Duration unit', { required: true, values: ['seconds', 'minutes', 'hours', 'days'], defaultValue: 'minutes' })],
    behavior: ['Schedules or pauses execution for the requested duration.'], keywords: ['delay', 'pause', 'wait'],
    defaultData: () => ({ label: 'Wait', timeValue: 5, timeUnit: 'minutes' }),
  }),
  define({
    canvasType: 'follow_up', canonicalType: 'followUp', displayName: 'Follow-up Message', category: 'Flow Control',
    description: 'Schedules a follow-up message after a delay or at a configured time.', visible: true, generatable: true,
    aliases: ['followUpNode'], fields: [f('message', 'string', 'Follow-up text', { required: true }), f('delayValue', 'number', 'Delay value'), f('delayUnit', 'enum', 'Delay unit', { values: ['minutes', 'hours', 'days'] })],
    behavior: ['Persists a scheduled follow-up.'], keywords: ['follow up', 'reminder', 'schedule message'],
    defaultData: () => ({ label: 'Follow-up Message', message: 'Just checking in—do you still need help?', delayValue: 1, delayUnit: 'days' }),
  }),
  define({
    canvasType: 'translation', canonicalType: 'translation', displayName: 'Translation', category: 'Flow Control',
    description: 'Translates the incoming message into a target language.', visible: true, generatable: true,
    aliases: ['translationNode'], fields: [f('targetLanguage', 'string', 'Target language code', { required: true, defaultValue: 'en' }), f('translationMode', 'enum', 'Replace or append translation', { values: ['replace', 'append'], defaultValue: 'append' })],
    handles: [target('input'), source()], credentials: integrationCredential('translation-api', 'Translation API credential', ['apiKey']), outputs: ['translation.text', 'translated message content'], limitations: ['The flow input must come from a Message Trigger.'], keywords: ['translate', 'language'],
    defaultData: () => ({ label: 'Translation', enabled: true, apiKey: '', targetLanguage: 'en', translationMode: 'append' }),
  }),
  define({
    canvasType: 'update_pipeline_stage', canonicalType: 'updatePipelineStage', displayName: 'Pipeline', category: 'Flow Control',
    description: 'Creates and updates CRM deals, changes stages, creates stages, and manages deal/contact tags in company pipelines.', visible: true, generatable: true,
    aliases: ['updatePipelineStageNode'],
    operations: ['update_stage', 'create_stage', 'create_deal', 'update_deal', 'manage_tags'],
    fields: [
      f('operation', 'enum', 'Pipeline operation', { required: true, values: ['update_stage', 'create_stage', 'create_deal', 'update_deal', 'manage_tags'], defaultValue: 'update_stage' }),
      f('pipelineId', 'number', 'Company pipeline ID from accessible resources. For create_deal it scopes duplicate detection and the new deal; for update_deal it can move the deal to another pipeline.', { condition: 'operation is update_stage, create_deal, or update_deal' }),
      f('stageId', 'number', 'Stage ID from accessible resources. Required by update_stage, initial placement for create_deal, and optional replacement stage for update_deal. It must belong to pipelineId or the deal pipeline.', { condition: 'operation is update_stage, create_deal, or update_deal' }),
      f('dealIdVariable', 'string', 'A variable/expression resolving to a numeric deal ID or phone number. If it does not resolve a deal, runtime falls back to the current contact’s active or most recent company deal.', { defaultValue: '{{contact.phone}}', condition: 'operation is update_stage, update_deal, or manage_tags' }),
      f('createDealIfNotExists', 'boolean', 'Create a deal for the current contact when update_deal or update_stage cannot find one; duplicate prevention still applies', { defaultValue: false, condition: 'operation is update_stage or update_deal' }),
      f('stageName', 'string', 'Name of a new stage. Required by create_stage and used by update_stage only when createStageIfNotExists is enabled.', { condition: 'operation=create_stage or createStageIfNotExists=true' }),
      f('stageColor', 'string', 'Color for a new stage', { defaultValue: '#3a86ff', condition: 'operation=create_stage' }),
      f('createStageIfNotExists', 'boolean', 'Allow update_stage to create stageName in pipelineId when the requested stage is absent', { defaultValue: false, condition: 'operation=update_stage' }),
      f('dealTitle', 'string', 'Deal title with variable interpolation. create_deal defaults to “<contact name> - New Deal”; update_deal leaves the current title unchanged when omitted.', { condition: 'operation=create_deal or update_deal' }),
      f('dealValue', 'string', 'Integer deal value or variable expression. Omit during update_deal to preserve the current value.', { condition: 'operation=create_deal or update_deal' }),
      f('dealPriority', 'enum', 'Deal priority. create_deal defaults to medium; omit during update_deal to preserve the current priority.', { values: ['low', 'medium', 'high'], defaultValue: 'medium', condition: 'operation=create_deal or update_deal' }),
      f('dealDescription', 'string', 'Deal description with variable interpolation. Omit during update_deal to preserve the current description.', { condition: 'operation=create_deal or update_deal' }),
      f('tagsToAdd', 'array', 'Literal or variable-interpolated tags. create_deal adds them to the new/existing active deal; manage_tags adds them to the contact and synchronizes its deals.', { condition: 'operation=create_deal or manage_tags' }),
      f('tagsToRemove', 'array', 'Literal or variable-interpolated contact tags to remove; contact tags are synchronized to associated deals', { condition: 'operation=manage_tags' }),
      f('customFieldsToSet', 'object', 'Map accessible deal custom-field names to strings, numbers, booleans, string arrays, or variable expressions. Empty resolved values are skipped and numeric strings are coerced.', { condition: 'operation=create_deal or update_deal' }),
      f('enableStageRevert', 'boolean', 'Schedule an automatic stage revert after creating, updating, or moving a staged deal', { defaultValue: false, condition: 'operation is update_stage, create_deal, or update_deal' }),
      f('revertTimeAmount', 'number', 'Revert delay from 1 through 999', { defaultValue: 24, condition: 'enableStageRevert=true' }),
      f('revertTimeUnit', 'enum', 'Revert delay unit', { values: ['hours', 'days'], defaultValue: 'hours', condition: 'enableStageRevert=true' }),
      f('revertToStageId', 'number', 'Destination stage ID for the scheduled revert', { condition: 'enableStageRevert=true' }),
      f('revertOnlyIfNoActivity', 'boolean', 'Cancel/skip the scheduled revert when deal activity occurs after the stage change', { defaultValue: false, condition: 'enableStageRevert=true' }),
      f('errorHandling', 'enum', 'Whether execution continues or stops after an operation error', { values: ['continue', 'stop'], defaultValue: 'continue' }),
    ],
    credentials: [],
    inputs: ['Current contact, conversation, and channel user context', 'Data Capture, Code Execution, system, contact, and custom variables interpolated in deal fields', 'Accessible pipeline IDs, ordered stage IDs, deal custom-field schema, and existing tag names'],
    outputs: ['No dedicated named variable; the unchanged execution context continues to downstream nodes after the CRM side effect'],
    behavior: [
      'create_deal always associates the deal with the current contact and assigns a newly created deal to the current channel connection user.',
      'create_deal first searches for an active deal for the same contact, company, and selected pipeline. When found it updates supported supplied fields instead of creating a duplicate; database race-condition conflicts also resolve to the existing active deal.',
      'create_deal resolves pipelineId from stageId when pipelineId is omitted. When both are supplied, runtime verifies that the stage belongs to the pipeline and the pipeline belongs to the company.',
      'update_deal resolves dealIdVariable as a deal ID or phone number, then falls back to the current contact’s active deal and finally its most recent deal. createDealIfNotExists may delegate to create_deal.',
      'update_deal changes only non-empty supplied title, integer value, priority, stage, description, custom fields, and optional pipeline. Omitted values preserve existing deal data.',
      'When update_deal changes pipelineId without a compatible stageId, runtime selects the first ordered stage of the destination pipeline. Pipeline and stage ownership are validated before persistence.',
      'Custom-field values support variable interpolation. Booleans remain booleans, arrays are interpolated item by item, empty values are skipped, and numeric-looking scalar values become numbers.',
      'Stage changes emit native pipeline trigger events and create deal activity records. create_deal and update_deal also create CRM activity records.',
      'Stage revert is scheduled only when a stage was created/changed and enableStageRevert, revertToStageId, revertTimeAmount, and revertTimeUnit are all configured. A scheduling failure does not roll back the main deal operation.',
      'For lead capture, select the company default pipeline and its first ordered suitable stage from accessible company resources.',
    ],
    limitations: [
      'Never invent pipeline, stage, or custom-field identifiers. Use only accessible company resources.',
      'dealValue is parsed as an integer by the current executor; decimal currency precision is not supported by this node.',
      'dealDueDate, dealAssignedToUserId, and targetPipelineId exist in historical UI types but are not consumed by create_deal/update_deal runtime and must not be generated.',
      'update_deal does not modify tags; use manage_tags. Deal status changes are not supported by this node.',
      'Use Move Deal to Pipeline for an explicit cross-pipeline move when no other deal fields need updating.',
    ],
    examples: [
      'Create lead: operation=create_deal, pipelineId=<default pipeline ID>, stageId=<first ordered stage ID>, dealTitle={{lead_name}} - New Lead, dealPriority=medium, dealDescription={{lead_requirements}}, customFieldsToSet mapped only from accessible deal custom fields.',
      'Update current deal after qualification: operation=update_deal, dealIdVariable={{contact.phone}}, dealPriority=high, dealValue={{qualified_value}}, dealDescription={{qualification_summary}}; omit fields that should remain unchanged.',
      'Update a known deal and stage with rollback: operation=update_deal, dealIdVariable={{deal.id}}, pipelineId=<pipeline ID>, stageId=<qualified stage ID>, enableStageRevert=true, revertTimeAmount=24, revertTimeUnit=hours, revertToStageId=<previous stage ID>.',
    ],
    keywords: ['move stage', 'pipeline', 'lead', 'create deal', 'update deal', 'crm', 'qualify lead', 'deal value', 'deal priority', 'deal custom fields'],
    defaultData: () => ({ label: 'Pipeline', operation: 'update_stage', pipelineId: null, stageId: null, dealIdVariable: '{{contact.phone}}', createDealIfNotExists: false, stageName: '', stageColor: '#3a86ff', createStageIfNotExists: false, dealTitle: '', dealValue: '', dealPriority: 'medium', dealDescription: '', tagsToAdd: [], tagsToRemove: [], customFieldsToSet: {}, enableStageRevert: false, revertTimeAmount: 24, revertTimeUnit: 'hours', revertToStageId: null, revertOnlyIfNoActivity: false, errorHandling: 'continue', type: 'update_pipeline_stage' }),
  }),
  define({
    canvasType: 'move_deal_to_pipeline', canonicalType: 'moveDealToPipeline', displayName: 'Move Deal to Pipeline', category: 'Flow Control',
    description: 'Moves a deal to a different pipeline and stage.', visible: true, generatable: true,
    aliases: ['moveDealToPipelineNode'], fields: [f('pipelineId', 'number', 'Target pipeline', { setupRequired: true }), f('stageId', 'number', 'Target stage', { setupRequired: true })],
    credentials: integrationCredential('pipeline-destination', 'Pipeline and stage', ['pipelineId', 'stageId']), keywords: ['move deal', 'change pipeline'],
    defaultData: () => ({ label: 'Move Deal to Pipeline', pipelineId: null, stageId: null, dealIdVariable: '{{deal.id}}' }),
  }),
  define({
    canvasType: 'manage_contact', canonicalType: 'manageContact', displayName: 'Manage Contact', category: 'Flow Control',
    description: 'Updates or safely deletes the current contact.', visible: true, generatable: true,
    aliases: ['manageContactNode'], operations: ['update_contact', 'delete_contact'],
    fields: [f('operation', 'enum', 'Contact operation', { required: true, values: ['update_contact', 'delete_contact'], defaultValue: 'update_contact' }), f('contactIdVariable', 'string', 'Contact ID expression', { required: true, defaultValue: '{{contact.id}}' })],
    outputs: ['contact management result'], keywords: ['update contact', 'delete contact', 'tags'],
    defaultData: () => ({ label: 'Manage Contact', operation: 'update_contact', contactIdVariable: '{{contact.id}}', fieldsToUpdate: [], customFields: [], tagsToAdd: [], tagsToRemove: [], skipEmptyValues: true, deleteConfirmation: false, onError: 'continue' }),
  }),
  define({
    canvasType: 'manage_task', canonicalType: 'manageTask', displayName: 'Manage Task', category: 'Flow Control',
    description: 'Creates, updates, or safely deletes a task.', visible: true, generatable: true,
    aliases: ['manageTaskNode'], operations: ['create_task', 'update_task', 'delete_task'],
    fields: [f('operation', 'enum', 'Task operation', { required: true, values: ['create_task', 'update_task', 'delete_task'], defaultValue: 'create_task' }), f('title', 'string', 'Task title', { condition: 'operation=create_task' }), f('taskIdVariable', 'string', 'Task ID expression', { condition: 'operation is update_task or delete_task' })],
    outputs: ['task.id', 'task operation result'], keywords: ['create task', 'update task', 'delete task'],
    defaultData: () => ({ label: 'Manage Task', operation: 'create_task', title: 'Follow up with {{contact.name}}', contactIdVariable: '{{contact.id}}', taskIdVariable: '{{task.id}}', skipEmptyValues: true, deleteConfirmation: false, onError: 'continue' }),
  }),
  define({
    canvasType: 'bot_disable', canonicalType: 'botDisable', displayName: 'Agent Handoff', category: 'Flow Control',
    description: 'Disables bot handling and optionally assigns or notifies a human agent.', visible: true, generatable: true, terminal: true,
    aliases: ['botDisableNode'], fields: [f('disableDuration', 'string', 'Disable duration', { required: true, defaultValue: '30' })], behavior: ['Stops automated execution for this conversation.'], keywords: ['human handoff', 'disable bot', 'agent'],
    defaultData: () => ({ label: 'Agent Handoff', disableDuration: '30', customDuration: 60, customDurationUnit: 'minutes', triggerMethod: 'always', keyword: 'agent', caseSensitive: false, assignToAgent: 'auto', autoAssignAgentIds: [], notifyAgent: true, handoffMessage: 'A customer is requesting human assistance.' }),
  }),
  define({
    canvasType: 'end_conversation', canonicalType: 'botDisable', displayName: 'End Conversation', category: 'Flow Control',
    description: 'Closes the current bot conversation without assigning an agent.', visible: true, generatable: true, terminal: true,
    aliases: ['endConversationNode', 'End Conversation'], fields: [], behavior: ['Normalizes to botDisable runtime behavior with end-conversation data flags.'], keywords: ['end', 'close conversation', 'finish'],
    defaultData: () => ({ label: 'End Conversation', disableDuration: 'manual', customDuration: 60, customDurationUnit: 'minutes', triggerMethod: 'always', keyword: 'agent', caseSensitive: false, assignToAgent: '', autoAssignAgentIds: [], notifyAgent: false, handoffMessage: 'This conversation is closed. Thanks!', __hideAgentAssignment: true }),
  }),
  define({
    canvasType: 'n8n', canonicalType: 'n8n', displayName: 'n8n', category: 'Integrations',
    description: 'Triggers an n8n workflow or webhook and maps its response.', visible: true, generatable: true,
    operations: ['execute_workflow', 'webhook_trigger'], fields: [f('operation', 'enum', 'Invocation mode', { required: true, values: ['execute_workflow', 'webhook_trigger'], defaultValue: 'webhook_trigger' }), f('instanceUrl', 'string', 'n8n instance URL', { setupRequired: true }), f('workflowName', 'string', 'Workflow name', { setupRequired: true })],
    credentials: integrationCredential('n8n', 'n8n connection', ['instanceUrl', 'apiKey', 'webhookUrl', 'workflowName']), outputs: ['n8n response mappings'], keywords: ['n8n', 'automation workflow'],
    defaultData: () => ({ label: 'n8n', instanceUrl: '', apiKey: '', webhookUrl: '', workflowId: '', workflowName: '', operation: 'webhook_trigger', config: {}, variableMappings: [], timeout: 30 }),
  }),
  define({
    canvasType: 'make', canonicalType: 'make', displayName: 'Make.com', category: 'Integrations',
    description: 'Executes a Make.com scenario through its webhook/API.', visible: true, generatable: true,
    operations: ['execute_scenario'], fields: [f('operation', 'enum', 'Operation', { required: true, values: ['execute_scenario'], defaultValue: 'execute_scenario' }), f('scenarioName', 'string', 'Scenario name', { setupRequired: true })],
    credentials: integrationCredential('make', 'Make.com scenario', ['apiToken', 'webhookUrl', 'scenarioName']), outputs: ['Make response variables'], keywords: ['make.com', 'scenario', 'automation'],
    defaultData: () => ({ label: 'Make.com', apiToken: '', webhookUrl: '', scenarioId: '', scenarioName: '', operation: 'execute_scenario', customParameters: [], timeout: 30, region: 'us1' }),
  }),
  define({
    canvasType: 'http_request', canonicalType: 'httpRequest', displayName: 'HTTP Request', category: 'Integrations',
    description: 'Calls an HTTP API with authentication, retry, timeout, and response mappings.', visible: true, generatable: true,
    aliases: ['httpRequestNode'], operations: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    fields: [f('url', 'string', 'Request URL', { setupRequired: true }), f('method', 'enum', 'HTTP method', { required: true, values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], defaultValue: 'GET' }), f('headers', 'array', 'Request headers'), f('body', 'string', 'Request body')],
    credentials: integrationCredential('http-endpoint', 'HTTP endpoint/authentication', ['url']), outputs: ['response status/body/headers', 'configured variable mappings'], behavior: ['Supports retry, timeout, redirects, and response type configuration.'], keywords: ['api request', 'rest', 'http'],
    defaultData: () => ({ label: 'HTTP Request', url: '', method: 'GET', headers: [{ key: 'Accept', value: 'application/json' }], body: '', authType: 'none', authToken: '', authUsername: '', authPassword: '', authApiKey: '', authApiKeyHeader: 'X-API-Key', timeout: 30, followRedirects: true, responseType: 'auto', retryCount: 0, retryDelay: 1000, variableMappings: [] }),
  }),
  define({
    canvasType: 'database_query', canonicalType: 'databaseQuery', displayName: 'Database', category: 'Integrations',
    description: 'Executes a parameterized database query and maps result fields.', visible: true, generatable: true,
    aliases: ['databaseQueryNode'], operations: ['query'], fields: [f('engine', 'enum', 'Database engine', { required: true, values: ['postgres', 'mysql'], defaultValue: 'postgres' }), f('query', 'string', 'SQL query', { setupRequired: true })],
    credentials: integrationCredential('database', 'Database connection', ['connectionString', 'host', 'database', 'username', 'password']), outputs: ['database.rows', 'database.rowCount', 'configured mappings'], keywords: ['sql', 'database query', 'postgres', 'mysql'],
    defaultData: () => ({ label: 'Database', engine: 'postgres', connectionMode: 'fields', connectionString: '', host: '', port: 5432, database: '', username: '', password: '', ssl: false, query: '', parameters: [], rowLimit: 100, timeout: 30, variableMappings: [] }),
  }),
  define({
    canvasType: 'code_execution', canonicalType: 'codeExecution', displayName: 'Code Execution', category: 'Flow Control',
    description: 'Runs JavaScript in the restricted flow sandbox with variables and fetch.', visible: true, generatable: true,
    aliases: ['codeExecutionNode'], fields: [f('code', 'string', 'Sandbox JavaScript', { required: true, defaultValue: '// Set flow variables here\nvariables.result = true;' })],
    outputs: ['code_execution_output', 'Direct variables.* mutations'], limitations: ['No Node.js, DOM, filesystem, process, require, or import.'], keywords: ['javascript', 'transform data', 'custom logic'],
    defaultData: () => ({ label: 'Code Execution', code: '// Set flow variables here\nvariables.result = true;', timeout: 30 }),
  }),
  define({
    canvasType: 'google_sheets', canonicalType: 'google_sheets', displayName: 'Google Sheets', category: 'Integrations',
    description: 'Reads, appends, updates, or inspects a Google Sheet through company OAuth.', visible: true, generatable: true,
    operations: ['append_row', 'read_rows', 'update_row', 'get_sheet_info'], fields: [f('operation', 'enum', 'Sheets operation', { required: true, values: ['append_row', 'read_rows', 'update_row', 'get_sheet_info'], defaultValue: 'append_row' }), f('spreadsheetId', 'string', 'Spreadsheet ID', { setupRequired: true }), f('sheetName', 'string', 'Sheet/tab name', { setupRequired: true })],
    credentials: [{ key: 'google-sheets-oauth', label: 'Google Sheets OAuth', description: 'Connect Google Sheets and select a spreadsheet.', fields: ['spreadsheetId', 'sheetName'], oauthService: 'google_sheets', requiredForActivation: true }], outputs: ['sheets.rows', 'sheets.rowCount', 'configured mappings'], keywords: ['spreadsheet', 'google sheets', 'append row'],
    defaultData: () => ({ label: 'Google Sheets', operation: 'append_row', spreadsheetId: '', sheetName: '', config: {}, variableMappings: [] }),
  }),
  define({
    canvasType: 'data_capture', canonicalType: 'data_capture', displayName: 'Data Capture', category: 'Flow Control',
    description: 'Runs a sequential conversational form, validates each answer, and stores the results as named flow variables.', visible: true, generatable: true,
    aliases: ['DataCapture', 'dataCapture', 'Data Capture'],
    fields: [
      f('captureRules', 'array', 'One or more ordered form fields. Each rule asks one question and stores one answer.', {
        required: true,
        defaultValue: [],
        itemFields: [
          f('id', 'string', 'Stable rule ID. The compiler creates one deterministically when omitted.'),
          f('variableName', 'string', 'Output variable name, using letters/numbers/underscore with optional dots or hyphens.', { required: true }),
          f('sourceType', 'enum', 'custom_prompt asks for the answer; regex_extract applies sourceValue to the reply and stores the first capture group, or the full match when no group exists.', { required: true, values: ['custom_prompt', 'regex_extract'], defaultValue: 'custom_prompt' }),
          f('sourceValue', 'string', 'Regex pattern for regex_extract. For custom_prompt it is normalized from description.', { condition: 'sourceType = regex_extract' }),
          f('description', 'string', 'The question sent to the user. Required for custom_prompt and recommended for regex_extract retry context.', { condition: 'sourceType = custom_prompt' }),
          f('dataType', 'enum', 'Answer type used for coercion and validation.', { required: true, values: ['string', 'number', 'email', 'phone', 'media'], defaultValue: 'string' }),
          f('mediaKind', 'enum', 'Accepted attachment category when dataType is media.', { condition: 'dataType = media', values: ['any', 'image', 'video', 'audio', 'document'], defaultValue: 'any' }),
          f('required', 'boolean', 'Required fields retry until a valid answer; optional fields accept skip, omit, -, or /skip.', { defaultValue: false }),
          f('validationErrorMessage', 'string', 'Optional retry message sent when extraction or type validation fails.'),
        ],
      }),
      f('storageScope', 'enum', 'The current editor stores captured values for the conversation session.', { required: true, values: ['session'], defaultValue: 'session' }),
      f('overwriteExisting', 'boolean', 'Replace an existing variable with the same name.', { defaultValue: false }),
      f('enableValidation', 'boolean', 'Validate number, email, phone, and media answers before storing them.', { defaultValue: true }),
      f('formMode', 'boolean', 'The current editor always runs Data Capture as a sequential form.', { required: true, defaultValue: true }),
    ],
    inputs: ['Inbound message text', 'Inbound media URL and message type', 'Conversation/session context', 'Optional AI delegation data_capture.structuredInput object'],
    outputs: ['Each captureRules[].variableName directly in execution context', 'data_capture.success', 'data_capture.capturedVariables', 'data_capture.capturedCount', 'data_capture.errors', 'data_capture.errorCount', 'data_capture.skipped', 'data_capture.skippedCount'],
    variableOutputs: ['Dynamic variables named by captureRules[].variableName', 'data_capture.* result metadata'],
    behavior: [
      'Form mode asks capture rules in array order and waits for one user reply per rule.',
      'custom_prompt stores the reply; regex_extract stores its first capture group or full match.',
      'Optional rules can be skipped with skip, omit, -, or /skip.',
      'Media rules store the inbound attachment URL and can restrict image, video, audio, document, or any media.',
      'Completed form submissions are persisted for review in addition to setting flow variables.',
    ],
    limitations: [
      'Creator output supports only the source and data types exposed by the current editor; legacy types remain executable but are not generated.',
      'The current editor fixes formMode to true and storageScope to session.',
      'Data Capture cannot connect directly to another Data Capture node in the editor.',
      'There are no success/error branch handles; inspect data_capture.* variables downstream when needed.',
    ],
    examples: [
      'Collect an email: {variableName: "user_email", sourceType: "custom_prompt", description: "What is your email address?", sourceValue: "What is your email address?", dataType: "email", required: true}.',
      'Extract an order ID: {variableName: "order_id", sourceType: "regex_extract", sourceValue: "order[\\\\s#]*([A-Z0-9-]+)", description: "Please provide your order ID.", dataType: "string", required: true}.',
      'Collect an image: {variableName: "receipt_image", sourceType: "custom_prompt", description: "Please upload a receipt image.", sourceValue: "Please upload a receipt image.", dataType: "media", mediaKind: "image", required: true}.',
    ],
    keywords: ['collect information', 'form', 'capture email', 'capture phone', 'ask questions', 'user input', 'regex extract', 'media upload', 'attachment'],
    defaultData: () => ({ label: 'Data Capture', captureRules: [], storageScope: 'session', overwriteExisting: false, enableValidation: true, formMode: true }),
  }),
  define({
    canvasType: 'webhook', canonicalType: 'webhook', displayName: 'Webhook', category: 'Integrations',
    description: 'Sends an outbound webhook request with authentication and templated data.', visible: true, generatable: true,
    aliases: ['webhookNode'], operations: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], fields: [f('url', 'string', 'Webhook URL', { setupRequired: true }), f('method', 'enum', 'HTTP method', { required: true, values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], defaultValue: 'POST' })],
    credentials: integrationCredential('webhook-endpoint', 'Webhook endpoint/authentication', ['url']), outputs: ['webhook response'], keywords: ['outbound webhook', 'send callback'],
    defaultData: () => ({ label: 'Webhook', url: '', method: 'POST', headers: [], body: '{"message":"{{message.content}}"}', authType: 'none', authToken: '', authUsername: '', authPassword: '', authApiKey: '', authApiKeyHeader: 'X-API-Key', timeout: 30, followRedirects: true }),
  }),
  define({
    canvasType: 'stripe', canonicalType: 'stripe', displayName: 'Stripe', category: 'Integrations',
    description: 'Performs Stripe customer, payment, subscription, refund, or balance operations.', visible: true, generatable: true, terminal: true,
    operations: ['create', 'get', 'update', 'delete', 'createCharge', 'createPaymentIntent', 'refund', 'cancel', 'getBalance', 'listTransactions'], fields: [f('resource', 'enum', 'Stripe resource', { required: true, values: ['customer', 'payment', 'subscription', 'balance'], defaultValue: 'customer' }), f('operation', 'string', 'Resource operation', { required: true, defaultValue: 'create' })],
    credentials: integrationCredential('stripe', 'Stripe secret key', ['apiKey']), outputs: ['stripe.*'], behavior: ['Terminal node: execution stops after the operation.'], keywords: ['payment', 'stripe', 'subscription', 'refund'],
    defaultData: () => ({ label: 'Stripe', resource: 'customer', operation: 'create', apiKey: '', email: '{{contact.email}}', currency: 'usd' }),
  }),
  define({
    canvasType: 'erp', canonicalType: 'erp', displayName: 'ERP', category: 'Integrations',
    description: 'Performs company-scoped ERP catalog, sales, Restaurant, or Dental operations allowed by the active ERP business type.', visible: true, generatable: true,
    operations: [...new Set(Object.values(ERP_OPERATIONS).flat())],
    fields: [
      f('resource', 'enum', 'ERP resource. Restaurant and Dental resources require the matching active company ERP mode.', { required: true, values: ERP_RESOURCES, defaultValue: 'sales_order' }),
      f('operation', 'string', 'Operation allowed for the selected ERP resource.', { required: true, defaultValue: 'create' }),
      f('requiredBusinessType', 'enum', 'Persisted compatibility marker for mode-specific resources.', { values: ['restaurant', 'dental'] }),
      f('contactId', 'string', 'Contact expression; defaults to the current flow contact where relevant.', { defaultValue: '{{contact.id}}' }),
      f('query', 'string', 'Catalog search query.', { condition: 'resource=catalog' }),
      f('productType', 'enum', 'Optional catalog product type.', { values: ['physical', 'service', 'digital'], condition: 'resource=catalog' }),
      f('reservationId', 'string', 'Restaurant reservation ID or expression.', { condition: 'resource=restaurant_reservation' }),
      f('reservationAt', 'string', 'Restaurant reservation date/time as ISO text.', { condition: 'resource=restaurant_reservation or restaurant_table' }),
      f('expectedDurationMinutes', 'number', 'Reservation duration; defaults to 90 minutes.', { condition: 'resource=restaurant_reservation or restaurant_table', defaultValue: 90 }),
      f('guestCount', 'number', 'Reservation or waitlist party size.', { condition: 'resource=restaurant_reservation or restaurant_table or restaurant_waitlist', defaultValue: 1 }),
      f('tableId', 'string', 'Restaurant table ID or expression.', { condition: 'resource=restaurant_reservation or restaurant_table' }),
      f('waitlistEntryId', 'string', 'Restaurant waitlist entry ID or expression.', { condition: 'resource=restaurant_waitlist' }),
      f('deliveryDispatchId', 'string', 'Restaurant delivery dispatch ID or expression.', { condition: 'resource=restaurant_delivery' }),
      f('appointmentId', 'string', 'Dental appointment ID or expression.', { condition: 'resource=dental_booking' }),
      f('providerUserId', 'string', 'Dental specialist user ID or expression.', { condition: 'resource=dental_booking' }),
      f('catalogItemId', 'string', 'Dental booking catalog item ID.', { condition: 'resource=dental_booking' }),
      f('scheduledAt', 'string', 'Dental appointment date/time as ISO text.', { condition: 'resource=dental_booking' }),
      f('treatmentPlanId', 'string', 'Dental treatment plan ID or expression.', { condition: 'resource=dental_treatment_plan' }),
      f('approvalDecision', 'enum', 'Requested treatment-plan decision for staff review.', { values: ['approved', 'rejected'], condition: 'operation=request_approval' }),
    ],
    outputs: ['erp.lastResponse', 'erp.error', 'erp.catalog.*', 'erp.salesOrder.*', 'erp.invoice.*', 'erp.restaurant.*', 'erp.dental.*'],
    behavior: ['Uses one control-flow output and writes structured operation results to erp.* variables.', 'Mode-specific operations fail closed when the company ERP mode no longer matches requiredBusinessType.'],
    limitations: ['Kitchen/dispatch control, clinical charts/notes/documents, inventory, purchasing, accounting, HR, payroll, and ERP administration are knowledge-only and cannot be generated in v1.'],
    keywords: ['erp', 'catalog', 'sales order', 'invoice', 'quotation', 'restaurant', 'reservation', 'waitlist', 'table', 'delivery', 'dental', 'patient', 'appointment', 'treatment plan'],
    defaultData: () => ({ label: 'ERP', resource: 'sales_order', operation: 'create', outputVariablePrefix: 'erp' }),
  }),
  define({
    canvasType: 'mastershop', canonicalType: 'mastershop', displayName: 'Master Shop', category: 'Integrations',
    description: 'Searches Master Shop products, creates/lists orders, checks wallets, or validates customer phone numbers.', visible: true, generatable: true,
    operations: ['products_list_search', 'create_order', 'list_orders', 'wallet_movements_list', 'validate_customer_phone'], fields: [f('operation', 'enum', 'Master Shop operation', { required: true, values: ['products_list_search', 'create_order', 'list_orders', 'wallet_movements_list', 'validate_customer_phone'], defaultValue: 'products_list_search' })],
    credentials: integrationCredential('mastershop', 'Master Shop connection', ['connectionId']), outputs: ['mastershop.*'], keywords: ['master shop', 'products', 'orders', 'wallet'],
    defaultData: () => ({ label: 'Master Shop', operation: 'products_list_search', connectionId: null, outputVariablePrefix: 'mastershop' }),
  }),
  define({
    canvasType: 'woocommerce', canonicalType: 'woocommerce', displayName: 'WooCommerce', category: 'Integrations',
    description: 'Searches and manages WooCommerce orders, products, customers, and coupons.', visible: true, generatable: true,
    aliases: ['woocommerceNode'], operations: ['search', 'list', 'get', 'create', 'update', 'delete', 'update_status'], fields: [f('resource', 'string', 'WooCommerce resource', { required: true, defaultValue: 'orders' }), f('operation', 'string', 'Resource operation', { required: true, defaultValue: 'get' })],
    credentials: integrationCredential('woocommerce', 'WooCommerce store credentials', ['storeUrl', 'consumerKey', 'consumerSecret']), outputs: ['woocommerce.*'], keywords: ['woocommerce', 'store', 'orders', 'products'],
    defaultData: () => ({ label: 'WooCommerce', resource: 'orders', operation: 'get', storeUrl: '', consumerKey: '', consumerSecret: '', outputVariablePrefix: 'woocommerce' }),
  }),
  define({
    canvasType: 'call_agent', canonicalType: 'callAgent', displayName: 'Call Agent', category: 'Integrations',
    description: 'Starts an AI-powered outbound phone call through a configured voice provider.', visible: true, generatable: true,
    aliases: ['callAgentNode'], fields: [f('provider', 'enum', 'Voice stack', { required: true, values: ['twilio-elevenlabs', 'telnyx-vapi'], defaultValue: 'twilio-elevenlabs' }), f('toNumber', 'string', 'Destination number or expression', { required: true, defaultValue: '{{contact.phone}}' })],
    credentials: integrationCredential('call-agent', 'Call Agent provider integration', ['connectionId']), outputs: ['call_agent.*'], behavior: ['Can run in blocking or async mode.'], keywords: ['phone call', 'voice agent', 'outbound call'],
    defaultData: () => ({ label: 'Call Agent', provider: 'twilio-elevenlabs', toNumber: '{{contact.phone}}', executionMode: 'blocking', connectionId: null, promptMode: 'customPrompt', customPrompt: 'Assist the customer professionally.' }),
  }),
  define({
    canvasType: 'contactNotification', canonicalType: 'contactNotification', displayName: 'Contact Notification', category: 'Messages',
    description: 'Sends an internal notification about the current contact.', visible: true, generatable: true,
    aliases: ['contactNotificationNode', 'contact_notification'], fields: [f('message', 'string', 'Notification text', { required: true, defaultValue: 'Contact {{contact.name}} needs attention.' })], keywords: ['notify agent', 'internal notification'],
    defaultData: () => ({ label: 'Contact Notification', message: 'Contact {{contact.name}} needs attention.', recipientType: 'assigned_agent' }),
  }),
  define({
    canvasType: 'documind', canonicalType: 'documind', displayName: 'Documind PDF Chat', category: 'Integrations',
    description: 'Asks questions, analyzes documents, or searches content in Documind.', visible: true, generatable: true,
    operations: ['ask_question', 'analyze_documents', 'search_content'], fields: [f('operation', 'enum', 'Documind operation', { required: true, values: ['ask_question', 'analyze_documents', 'search_content'], defaultValue: 'ask_question' }), f('selectedFolder', 'string', 'Folder or document selection', { setupRequired: true })],
    credentials: integrationCredential('documind', 'Documind API key and folder', ['apiKey', 'selectedFolder']), outputs: ['documind.answer', 'documind.sources'], keywords: ['pdf chat', 'documind', 'document search'],
    defaultData: () => ({ label: 'Documind PDF Chat', apiKey: '', selectedFolder: '', operation: 'ask_question', systemPrompt: '', enableHistory: true, historyLimit: 10 }),
  }),
  define({
    canvasType: 'chat_pdf', canonicalType: 'chat_pdf', displayName: 'Chat PDF AI', category: 'Integrations',
    description: 'Asks questions, summarizes, or analyzes a configured PDF document.', visible: true, generatable: true,
    operations: ['ask_question', 'summarize', 'analyze_content'], fields: [f('operation', 'enum', 'PDF operation', { required: true, values: ['ask_question', 'summarize', 'analyze_content'], defaultValue: 'ask_question' }), f('selectedDocument', 'string', 'Document selection', { setupRequired: true })],
    credentials: integrationCredential('chat-pdf', 'Chat PDF API key and document', ['apiKey', 'selectedDocument']), outputs: ['chat_pdf.answer', 'chat_pdf.summary'], keywords: ['chat pdf', 'summarize pdf', 'analyze document'],
    defaultData: () => ({ label: 'Chat PDF AI', apiKey: '', selectedDocument: '', operation: 'ask_question', gptModel: 'gpt-4o-mini', enableOcr: false }),
  }),
  define({
    canvasType: 'gamma', canonicalType: 'gamma', displayName: 'Gamma', category: 'Integrations',
    description: 'Generates a Gamma presentation, report, or quote and exports it.', visible: true, generatable: true,
    aliases: ['gammaNode'], operations: ['generate'], fields: [f('inputText', 'string', 'Source prompt or content', { required: true, defaultValue: '{{message.content}}' }), f('artifactType', 'enum', 'Artifact type', { required: true, values: ['presentation', 'report', 'quote'], defaultValue: 'presentation' })],
    credentials: integrationCredential('gamma', 'Gamma API key', ['apiKey']), outputs: ['gamma.url', 'gamma.exportUrl', 'gamma.artifactId'], behavior: ['Generation may wait for Gamma to complete.'], keywords: ['presentation', 'slides', 'report', 'gamma'],
    defaultData: () => ({ label: 'Gamma', apiKey: '', inputText: '{{message.content}}', artifactType: 'presentation', exportFormat: 'pdf', generationMode: 'generate', outputVariablePrefix: 'gamma' }),
  }),
  define({
    canvasType: 'flow_trigger', canonicalType: 'flow_trigger', displayName: 'Trigger Flow', category: 'Flow Control',
    description: 'Invokes another saved flow as a sub-flow action.', visible: true, generatable: true,
    aliases: [], fields: [f('targetFlowId', 'number', 'Target flow ID', { setupRequired: true }), f('targetFlowName', 'string', 'Target flow name')],
    credentials: integrationCredential('target-flow', 'Target flow', ['targetFlowId']), outputs: ['flowTrigger.targetFlowId and target flow variables'], limitations: ['Not an entry trigger; cannot target the current flow.'], keywords: ['subflow', 'invoke flow', 'trigger another flow'],
    defaultData: () => ({ label: 'Trigger Flow', targetFlowId: null, targetFlowName: null }),
  }),
  define({
    canvasType: 'notes', canonicalType: 'notes', displayName: 'Notes', category: 'Annotations',
    description: 'Canvas-only annotation that is never executed.', visible: true, generatable: true, canvasOnly: true,
    aliases: ['notesNode'], fields: [f('title', 'string', 'Note title', { required: true, defaultValue: 'Note' }), f('body', 'string', 'Note body')],
    inputs: [], outputs: [], behavior: ['Ignored by execution and connection validation.'], limitations: ['Cannot connect to flow nodes.'], keywords: ['annotation', 'documentation', 'note'],
    defaultData: () => ({ label: 'Notes', title: 'Note', body: '', backgroundColor: 'yellow', pinned: false, width: 300, height: 220 }),
  }),
];

const compatibilityOnlyDefinitions: FlowNodeDefinition[] = [
  ['input', 'Input', 'Waits for legacy user input.'],
  ['action', 'Action', 'Runs a legacy action.'],
  ['shopify', 'Shopify', 'Legacy Shopify integration.'],
  ['typebot', 'Typebot', 'Legacy Typebot integration.'],
  ['flowise', 'Flowise', 'Legacy Flowise integration.'],
  ['document_generator', 'Document Generator', 'Legacy document-generation node.'],
  ['googleCalendar', 'Google Calendar', 'Legacy standalone calendar node.'],
  ['botReset', 'Bot Reset', 'Legacy bot reset node.'],
].map(([canonicalType, displayName, description]) => define({
  canvasType: canonicalType,
  canonicalType,
  displayName,
  category: 'Compatibility',
  description,
  visible: false,
  generatable: false,
  fields: [],
  defaultData: () => ({ label: displayName }),
}));

export const FLOW_NODE_DEFINITIONS: readonly FlowNodeDefinition[] = Object.freeze([
  ...visibleDefinitions,
  ...compatibilityOnlyDefinitions,
]);

export const GENERATABLE_FLOW_NODE_DEFINITIONS = FLOW_NODE_DEFINITIONS.filter((definition) => definition.generatable);
export const VISIBLE_FLOW_NODE_TYPES = GENERATABLE_FLOW_NODE_DEFINITIONS.map((definition) => definition.canvasType);

const definitionByCanvasType = new Map(FLOW_NODE_DEFINITIONS.map((definition) => [definition.canvasType, definition]));
const definitionByAlias = new Map<string, FlowNodeDefinition>();
for (const definition of FLOW_NODE_DEFINITIONS) {
  for (const alias of definition.aliases) definitionByAlias.set(alias, definition);
}
for (const [alias, canonical] of Object.entries(LEGACY_NODE_TYPE_MAPPINGS)) {
  const definition = FLOW_NODE_DEFINITIONS.find((candidate) => candidate.canonicalType === canonical);
  if (definition && !definitionByAlias.has(alias)) definitionByAlias.set(alias, definition);
}

export function getFlowNodeDefinition(type: string, label?: string): FlowNodeDefinition | null {
  const exact = definitionByCanvasType.get(type) ?? definitionByAlias.get(type);
  if (exact) return exact;
  if (label) {
    const byLabel = definitionByAlias.get(label) ?? FLOW_NODE_DEFINITIONS.find((definition) => definition.displayName === label);
    if (byLabel) return byLabel;
  }
  const normalized = NodeTypeUtils.normalizeNodeType(type, label);
  if (!normalized) return null;
  return FLOW_NODE_DEFINITIONS.find((definition) => definition.canonicalType === normalized) ?? null;
}

export function createDefaultFlowNodeData(type: string): Record<string, unknown> {
  const definition = getFlowNodeDefinition(type);
  if (!definition) return { label: `${type.charAt(0).toUpperCase()}${type.slice(1)} Node` };
  return definition.defaultData();
}

export type FlowNodeKnowledgeChunk = {
  nodeType: string;
  chunkKey: 'overview' | 'configuration' | 'io' | 'behavior' | 'examples' | 'limitations';
  contentHash: string;
  text: string;
  metadata: Record<string, unknown>;
};

export function buildFlowNodeKnowledgeChunks(definition: FlowNodeDefinition): FlowNodeKnowledgeChunk[] {
  const chunks: Array<[FlowNodeKnowledgeChunk['chunkKey'], string]> = [
    ['overview', `${definition.displayName} (${definition.canvasType}). ${definition.description} Category: ${definition.category}. Operations: ${definition.operations.join(', ') || 'default execution'}.`],
    ['configuration', `Configuration for ${definition.displayName}: ${definition.fields.map((field) => `${field.name} (${field.type}${field.required ? ', structurally required' : ''}${field.setupRequired ? ', setup required' : ''}${field.condition ? `, when ${field.condition}` : ''}${field.values?.length ? `, allowed: ${field.values.join('|')}` : ''}) — ${field.description}${field.itemFields?.length ? ` Items: ${field.itemFields.map((item) => `${item.name} (${item.type}${item.required ? ', required' : ''}${item.condition ? `, when ${item.condition}` : ''}${item.values?.length ? `, allowed: ${item.values.join('|')}` : ''}) — ${item.description}`).join('; ')}` : ''}`).join('; ') || 'no configurable fields'}. Credentials: ${definition.credentials.map((credential) => `${credential.label}: ${credential.description}`).join('; ') || 'none'}.`],
    ['io', `Inputs: ${definition.inputs.join('; ') || 'none'}. Outputs: ${definition.outputs.join('; ') || 'none'}. Variable outputs: ${definition.variableOutputs.join('; ') || 'none'}. Mapping fields: ${definition.mappingFields.join(', ') || 'none'}. Handles: ${definition.handles.map((handle) => `${handle.kind}:${handle.id}${handle.label ? ` (${handle.label})` : ''}`).join(', ') || 'none'}.`],
    ['behavior', `Runtime behavior: ${definition.behavior.join('; ') || 'standard synchronous traversal'}. Entry point: ${Boolean(definition.entryPoint)}. Terminal: ${Boolean(definition.terminal)}. Canvas only: ${Boolean(definition.canvasOnly)}.`],
    ['examples', `Use ${definition.displayName} for: ${definition.examples.join('; ') || definition.keywords.join(', ') || definition.description}.`],
    ['limitations', `Limitations for ${definition.displayName}: ${definition.limitations.join('; ') || 'Only the operations and fields listed in this definition are supported.'}`],
  ];
  return chunks.map(([chunkKey, text]) => ({
    nodeType: definition.canvasType,
    chunkKey,
    text,
    contentHash: sha256Hex(`${FLOW_NODE_REGISTRY_VERSION}:${definition.canvasType}:${chunkKey}:${text}`),
    metadata: {
      version: FLOW_NODE_REGISTRY_VERSION,
      nodeType: definition.canvasType,
      canonicalType: definition.canonicalType,
      chunkKey,
      category: definition.category,
      name: definition.displayName,
      generatable: definition.generatable,
    },
  }));
}

export function buildAllFlowNodeKnowledgeChunks(): FlowNodeKnowledgeChunk[] {
  return GENERATABLE_FLOW_NODE_DEFINITIONS.flatMap(buildFlowNodeKnowledgeChunks);
}
