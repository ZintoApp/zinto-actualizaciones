/**
 * Flow Node Types and Utilities
 * Centralized node type definitions to replace string-based detection
 */

import type { VectorDatabaseProvider } from '../rag-defaults';
import type {
  CalendarAdvancedSettings,
  CalendarOfferingSettings,
  CalendarReminderSettings,
} from './calendar-types';
import {
  ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE,
  ERP_RESOURCES,
  type ErpResource,
} from '../erp-capabilities';

export enum NodeType {
  MESSAGE = 'message',
  QUICK_REPLY = 'quickReply',
  WHATSAPP_INTERACTIVE_BUTTONS = 'whatsappInteractiveButtons',
  WHATSAPP_INTERACTIVE_LIST = 'whatsappInteractiveList',
  WHATSAPP_CTA_URL = 'whatsappCTAURL',
  WHATSAPP_LOCATION_REQUEST = 'whatsappLocationRequest',
  WHATSAPP_POLL = 'whatsappPoll',
  FOLLOW_UP = 'followUp',

  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',

  CONDITION = 'condition',
  WAIT = 'wait',
  INPUT = 'input',
  ACTION = 'action',

  AI_ASSISTANT = 'aiAssistant',
  TRANSLATION = 'translation',
  WEBHOOK = 'webhook',
  HTTP_REQUEST = 'httpRequest',
  DATABASE_QUERY = 'databaseQuery',
  CODE_EXECUTION = 'codeExecution',

  SHOPIFY = 'shopify',
  WOOCOMMERCE = 'woocommerce',
  WHATSAPP_FLOWS = 'whatsappFlows',

  TYPEBOT = 'typebot',
  FLOWISE = 'flowise',
  N8N = 'n8n',
  MAKE = 'make',
  GOOGLE_SHEETS = 'google_sheets',
  DATA_CAPTURE = 'data_capture',
  DOCUMIND = 'documind',
  CHAT_PDF = 'chat_pdf',
  DOCUMENT_GENERATOR = 'document_generator',
  GAMMA = 'gamma',
  STRIPE = 'stripe',
  ERP = 'erp',
  MASTER_SHOP = 'mastershop',
  CALL_AGENT = 'callAgent',

  GOOGLE_CALENDAR = 'googleCalendar',

  BOT_DISABLE = 'botDisable',
  BOT_RESET = 'botReset',

  /**
   * Update Pipeline Stage node - Supports time-based stage reversion
   * Allows automatically reverting deals to a previous stage after a specified time period
   * if no activity occurs (optional)
   */
  UPDATE_PIPELINE_STAGE = 'updatePipelineStage',
  MOVE_DEAL_TO_PIPELINE = 'moveDealToPipeline',
  MANAGE_CONTACT = 'manageContact',
  MANAGE_TASK = 'manageTask',
  CONTACT_NOTIFICATION = 'contactNotification',

  TRIGGER = 'trigger',
  WEBHOOK_TRIGGER = 'webhookTrigger',
  MASTER_SHOP_WEBHOOK_TRIGGER = 'mastershopWebhookTrigger',
  FLOW_TRIGGER = 'flow_trigger',

  MCP_CLIENT_TOOL = 'mcp_client_tool',
  MCP_EXECUTE_TOOL = 'mcp_execute_tool',

  /** Canvas-only annotation; never executed at runtime */
  NOTES = 'notes'
}

/**
 * Node type categories for grouping and validation
 */
export enum NodeCategory {
  MESSAGE = 'message',
  MEDIA = 'media',
  LOGIC = 'logic',
  INTEGRATION = 'integration',
  ECOMMERCE = 'ecommerce',
  EXTERNAL = 'external',
  CALENDAR = 'calendar',
  BOT_CONTROL = 'bot_control',
  PIPELINE = 'pipeline',
  TRIGGER = 'trigger',
  ANNOTATION = 'annotation'
}

/**
 * Legacy node type mappings for backward compatibility
 */
export const LEGACY_NODE_TYPE_MAPPINGS: Record<string, NodeType> = {
  'messageNode': NodeType.MESSAGE,
  'message': NodeType.MESSAGE,
  'Message Node': NodeType.MESSAGE,
  'quickReplyNode': NodeType.QUICK_REPLY,
  'quick_reply': NodeType.QUICK_REPLY,
  'Quick Reply Node': NodeType.QUICK_REPLY,
  'Quick Reply Options': NodeType.QUICK_REPLY,
  'quickreply': NodeType.QUICK_REPLY,
  'Quickreply Node': NodeType.QUICK_REPLY,
  'whatsapp_poll': NodeType.WHATSAPP_POLL,
  'WhatsApp Poll': NodeType.WHATSAPP_POLL,
  'WhatsApp Poll Node': NodeType.WHATSAPP_POLL,
  'whatsapp_interactive_buttons': NodeType.WHATSAPP_INTERACTIVE_BUTTONS,
  'WhatsApp Interactive Buttons': NodeType.WHATSAPP_INTERACTIVE_BUTTONS,
  'WhatsApp Interactive Buttons Node': NodeType.WHATSAPP_INTERACTIVE_BUTTONS,
  'whatsapp_interactive_list': NodeType.WHATSAPP_INTERACTIVE_LIST,
  'WhatsApp Interactive List': NodeType.WHATSAPP_INTERACTIVE_LIST,
  'WhatsApp Interactive List Node': NodeType.WHATSAPP_INTERACTIVE_LIST,
  'whatsapp_cta_url': NodeType.WHATSAPP_CTA_URL,
  'WhatsApp CTA URL': NodeType.WHATSAPP_CTA_URL,
  'WhatsApp CTA URL Node': NodeType.WHATSAPP_CTA_URL,
  'whatsapp_location_request': NodeType.WHATSAPP_LOCATION_REQUEST,
  'WhatsApp Location Request': NodeType.WHATSAPP_LOCATION_REQUEST,
  'WhatsApp Location Request Node': NodeType.WHATSAPP_LOCATION_REQUEST,
  'followUpNode': NodeType.FOLLOW_UP,
  'follow_up': NodeType.FOLLOW_UP,
  'Follow Up Node': NodeType.FOLLOW_UP,
  'Follow-up Node': NodeType.FOLLOW_UP,
  'followup': NodeType.FOLLOW_UP,

  'imageNode': NodeType.IMAGE,
  'image': NodeType.IMAGE,
  'Image Node': NodeType.IMAGE,
  'videoNode': NodeType.VIDEO,
  'video': NodeType.VIDEO,
  'Video Node': NodeType.VIDEO,
  'audioNode': NodeType.AUDIO,
  'audio': NodeType.AUDIO,
  'Audio Node': NodeType.AUDIO,
  'documentNode': NodeType.DOCUMENT,
  'document': NodeType.DOCUMENT,
  'Document Node': NodeType.DOCUMENT,
  
  'conditionNode': NodeType.CONDITION,
  'condition': NodeType.CONDITION,
  'Condition Node': NodeType.CONDITION,
  'waitNode': NodeType.WAIT,
  'wait': NodeType.WAIT,
  'Wait Node': NodeType.WAIT,
  'inputNode': NodeType.INPUT,
  'input': NodeType.INPUT,
  'Input Node': NodeType.INPUT,
  'actionNode': NodeType.ACTION,
  'action': NodeType.ACTION,
  'Action Node': NodeType.ACTION,
  
  'aiAssistantNode': NodeType.AI_ASSISTANT,
  'aiAssistant': NodeType.AI_ASSISTANT,
  'ai_assistant': NodeType.AI_ASSISTANT,
  'AI Assistant': NodeType.AI_ASSISTANT,
  'AI Response': NodeType.AI_ASSISTANT,
  'Ai_assistant Node': NodeType.AI_ASSISTANT,
  'webhookNode': NodeType.WEBHOOK,
  'webhook': NodeType.WEBHOOK,
  'Webhook Node': NodeType.WEBHOOK,
  'httpRequestNode': NodeType.HTTP_REQUEST,
  'http_request': NodeType.HTTP_REQUEST,
  'HTTP Request Node': NodeType.HTTP_REQUEST,
  'databaseQueryNode': NodeType.DATABASE_QUERY,
  'database_query': NodeType.DATABASE_QUERY,
  'Database Query': NodeType.DATABASE_QUERY,
  'Database Query Node': NodeType.DATABASE_QUERY,
  'Database': NodeType.DATABASE_QUERY,
  'database': NodeType.DATABASE_QUERY,
  'codeExecutionNode': NodeType.CODE_EXECUTION,
  'code_execution': NodeType.CODE_EXECUTION,
  'Code Execution': NodeType.CODE_EXECUTION,
  'Code Execution Node': NodeType.CODE_EXECUTION,
  
  'shopifyNode': NodeType.SHOPIFY,
  'shopify': NodeType.SHOPIFY,
  'Shopify Node': NodeType.SHOPIFY,
  'woocommerceNode': NodeType.WOOCOMMERCE,
  'woocommerce': NodeType.WOOCOMMERCE,
  'WooCommerce Node': NodeType.WOOCOMMERCE,
  
  'whatsappFlowsNode': NodeType.WHATSAPP_FLOWS,
  'whatsappFlows': NodeType.WHATSAPP_FLOWS,
  'whatsapp_flows': NodeType.WHATSAPP_FLOWS,
  'WhatsApp Flows': NodeType.WHATSAPP_FLOWS,
  'WhatsApp Flows Node': NodeType.WHATSAPP_FLOWS,
  
  'typebotNode': NodeType.TYPEBOT,
  'typebot': NodeType.TYPEBOT,
  'Typebot Node': NodeType.TYPEBOT,
  'flowiseNode': NodeType.FLOWISE,
  'flowise': NodeType.FLOWISE,
  'Flowise Node': NodeType.FLOWISE,
  
  'googleCalendarNode': NodeType.GOOGLE_CALENDAR,
  'google_calendar': NodeType.GOOGLE_CALENDAR,
  'Google Calendar Node': NodeType.GOOGLE_CALENDAR,
  
  'stripeNode': NodeType.STRIPE,
  'stripe': NodeType.STRIPE,
  'Stripe Node': NodeType.STRIPE,
  'Stripe': NodeType.STRIPE,

  'erpNode': NodeType.ERP,
  'erp': NodeType.ERP,
  'ERP Node': NodeType.ERP,
  'ERP': NodeType.ERP,

  'mastershop': NodeType.MASTER_SHOP,
  'masterShop': NodeType.MASTER_SHOP,
  'master_shop': NodeType.MASTER_SHOP,
  'mastershopNode': NodeType.MASTER_SHOP,
  'masterShopNode': NodeType.MASTER_SHOP,
  'Master Shop': NodeType.MASTER_SHOP,
  'Master Shop Node': NodeType.MASTER_SHOP,
  'Mastershop': NodeType.MASTER_SHOP,
  'Mastershop Node': NodeType.MASTER_SHOP,
  
  'callAgentNode': NodeType.CALL_AGENT,
  'call_agent': NodeType.CALL_AGENT,
  'Call Agent Node': NodeType.CALL_AGENT,
  'Call Agent': NodeType.CALL_AGENT,

  'document_generator': NodeType.DOCUMENT_GENERATOR,
  'documentGenerator': NodeType.DOCUMENT_GENERATOR,
  'Document Generator': NodeType.DOCUMENT_GENERATOR,
  'Document Generator Node': NodeType.DOCUMENT_GENERATOR,
  
  'gamma': NodeType.GAMMA,
  'Gamma': NodeType.GAMMA,
  'Gamma Node': NodeType.GAMMA,
  'gammaNode': NodeType.GAMMA,
  
  'botDisableNode': NodeType.BOT_DISABLE,
  'bot_disable': NodeType.BOT_DISABLE,
  'Agent Handoff': NodeType.BOT_DISABLE,
  'Bot Disable': NodeType.BOT_DISABLE,
  'Disable Bot': NodeType.BOT_DISABLE,
  'endConversationNode': NodeType.BOT_DISABLE,
  'end_conversation': NodeType.BOT_DISABLE,
  'End Conversation': NodeType.BOT_DISABLE,
  'botResetNode': NodeType.BOT_RESET,
  'bot_reset': NodeType.BOT_RESET,
  'Reset Bot': NodeType.BOT_RESET,
  'Bot Reset': NodeType.BOT_RESET,
  'Re-enable Bot': NodeType.BOT_RESET,
  
  'updatePipelineStageNode': NodeType.UPDATE_PIPELINE_STAGE,
  'update_pipeline_stage': NodeType.UPDATE_PIPELINE_STAGE,
  'Pipeline': NodeType.UPDATE_PIPELINE_STAGE,
  'Move to Pipeline Stage': NodeType.UPDATE_PIPELINE_STAGE,
  'moveDealToPipelineNode': NodeType.MOVE_DEAL_TO_PIPELINE,
  'move_deal_to_pipeline': NodeType.MOVE_DEAL_TO_PIPELINE,
  'Move Deal to Pipeline': NodeType.MOVE_DEAL_TO_PIPELINE,
  
  'manageContactNode': NodeType.MANAGE_CONTACT,
  'manage_contact': NodeType.MANAGE_CONTACT,
  'Manage Contact': NodeType.MANAGE_CONTACT,
  'Contact Management': NodeType.MANAGE_CONTACT,
  'manageTaskNode': NodeType.MANAGE_TASK,
  'manage_task': NodeType.MANAGE_TASK,
  'Manage Task': NodeType.MANAGE_TASK,
  'Task Management': NodeType.MANAGE_TASK,
  
  'contactNotificationNode': NodeType.CONTACT_NOTIFICATION,
  'contact_notification': NodeType.CONTACT_NOTIFICATION,
  'Contact Notification': NodeType.CONTACT_NOTIFICATION,
  'Contact Notification Node': NodeType.CONTACT_NOTIFICATION,
  
  'translationNode': NodeType.TRANSLATION,
  'translation': NodeType.TRANSLATION,
  'Translation': NodeType.TRANSLATION,
  'Translation Node': NodeType.TRANSLATION,

  'triggerNode': NodeType.TRIGGER,
  'trigger': NodeType.TRIGGER,
  'Message Trigger': NodeType.TRIGGER,

  'webhookTriggerNode': NodeType.WEBHOOK_TRIGGER,
  'webhook_trigger': NodeType.WEBHOOK_TRIGGER,
  'Webhook Trigger': NodeType.WEBHOOK_TRIGGER,

  'mastershopWebhookTrigger': NodeType.MASTER_SHOP_WEBHOOK_TRIGGER,
  'mastershop_webhook_trigger': NodeType.MASTER_SHOP_WEBHOOK_TRIGGER,
  'mastershopWebhookTriggerNode': NodeType.MASTER_SHOP_WEBHOOK_TRIGGER,
  'masterShopWebhookTrigger': NodeType.MASTER_SHOP_WEBHOOK_TRIGGER,
  'Master Shop Webhook Trigger': NodeType.MASTER_SHOP_WEBHOOK_TRIGGER,
  'Mastershop Webhook Trigger': NodeType.MASTER_SHOP_WEBHOOK_TRIGGER,

  'mcp_client_tool': NodeType.MCP_CLIENT_TOOL,
  'mcpClientTool': NodeType.MCP_CLIENT_TOOL,
  'MCP Client Tool': NodeType.MCP_CLIENT_TOOL,
  'Mcp_client_tool Node': NodeType.MCP_CLIENT_TOOL,
  'mcp_execute_tool': NodeType.MCP_EXECUTE_TOOL,
  'mcpExecuteTool': NodeType.MCP_EXECUTE_TOOL,
  'MCP Execute Tool': NodeType.MCP_EXECUTE_TOOL,
  'MCP Execute Tool Node': NodeType.MCP_EXECUTE_TOOL,
  'Mcp_execute_tool Node': NodeType.MCP_EXECUTE_TOOL,

  'notesNode': NodeType.NOTES,
  'notes': NodeType.NOTES,
  'Notes Node': NodeType.NOTES,
  'Notes': NodeType.NOTES
};

/**
 * Node type to category mapping
 */
export const NODE_TYPE_CATEGORIES: Record<NodeType, NodeCategory> = {
  [NodeType.MESSAGE]: NodeCategory.MESSAGE,
  [NodeType.QUICK_REPLY]: NodeCategory.MESSAGE,
  [NodeType.WHATSAPP_INTERACTIVE_BUTTONS]: NodeCategory.MESSAGE,
  [NodeType.WHATSAPP_INTERACTIVE_LIST]: NodeCategory.MESSAGE,
  [NodeType.WHATSAPP_CTA_URL]: NodeCategory.MESSAGE,
  [NodeType.WHATSAPP_LOCATION_REQUEST]: NodeCategory.MESSAGE,
  [NodeType.WHATSAPP_POLL]: NodeCategory.MESSAGE,
  [NodeType.FOLLOW_UP]: NodeCategory.MESSAGE,
  [NodeType.IMAGE]: NodeCategory.MEDIA,
  [NodeType.VIDEO]: NodeCategory.MEDIA,
  [NodeType.AUDIO]: NodeCategory.MEDIA,
  [NodeType.DOCUMENT]: NodeCategory.MEDIA,
  [NodeType.CONDITION]: NodeCategory.LOGIC,
  [NodeType.WAIT]: NodeCategory.LOGIC,
  [NodeType.INPUT]: NodeCategory.LOGIC,
  [NodeType.ACTION]: NodeCategory.LOGIC,
  [NodeType.AI_ASSISTANT]: NodeCategory.INTEGRATION,
  [NodeType.TRANSLATION]: NodeCategory.LOGIC,
  [NodeType.WEBHOOK]: NodeCategory.INTEGRATION,
  [NodeType.HTTP_REQUEST]: NodeCategory.INTEGRATION,
  [NodeType.DATABASE_QUERY]: NodeCategory.INTEGRATION,
  [NodeType.MCP_CLIENT_TOOL]: NodeCategory.INTEGRATION,
  [NodeType.MCP_EXECUTE_TOOL]: NodeCategory.INTEGRATION,
  [NodeType.CODE_EXECUTION]: NodeCategory.LOGIC,
  [NodeType.SHOPIFY]: NodeCategory.ECOMMERCE,
  [NodeType.WOOCOMMERCE]: NodeCategory.ECOMMERCE,
  [NodeType.WHATSAPP_FLOWS]: NodeCategory.MESSAGE,
  [NodeType.TYPEBOT]: NodeCategory.EXTERNAL,
  [NodeType.FLOWISE]: NodeCategory.EXTERNAL,
  [NodeType.N8N]: NodeCategory.EXTERNAL,
  [NodeType.MAKE]: NodeCategory.EXTERNAL,
  [NodeType.GOOGLE_SHEETS]: NodeCategory.EXTERNAL,
  [NodeType.DATA_CAPTURE]: NodeCategory.LOGIC,
  [NodeType.DOCUMIND]: NodeCategory.EXTERNAL,
  [NodeType.CHAT_PDF]: NodeCategory.EXTERNAL,
  [NodeType.DOCUMENT_GENERATOR]: NodeCategory.INTEGRATION,
  [NodeType.GAMMA]: NodeCategory.INTEGRATION,
  [NodeType.STRIPE]: NodeCategory.INTEGRATION,
  [NodeType.ERP]: NodeCategory.INTEGRATION,
  [NodeType.MASTER_SHOP]: NodeCategory.ECOMMERCE,
  [NodeType.CALL_AGENT]: NodeCategory.INTEGRATION,
  [NodeType.GOOGLE_CALENDAR]: NodeCategory.CALENDAR,
  [NodeType.BOT_DISABLE]: NodeCategory.BOT_CONTROL,
  [NodeType.BOT_RESET]: NodeCategory.BOT_CONTROL,
  [NodeType.UPDATE_PIPELINE_STAGE]: NodeCategory.PIPELINE,
  [NodeType.MOVE_DEAL_TO_PIPELINE]: NodeCategory.PIPELINE,
  [NodeType.MANAGE_CONTACT]: NodeCategory.LOGIC,
  [NodeType.MANAGE_TASK]: NodeCategory.LOGIC,
  [NodeType.CONTACT_NOTIFICATION]: NodeCategory.MESSAGE,
  [NodeType.TRIGGER]: NodeCategory.TRIGGER,
  [NodeType.WEBHOOK_TRIGGER]: NodeCategory.TRIGGER,
  [NodeType.MASTER_SHOP_WEBHOOK_TRIGGER]: NodeCategory.TRIGGER,
  [NodeType.FLOW_TRIGGER]: NodeCategory.LOGIC,
  [NodeType.NOTES]: NodeCategory.ANNOTATION
};

/**
 * Utility functions for node type detection and validation
 */
export class NodeTypeUtils {
  /**
   * Normalize a node type from legacy string to enum
   */
  static normalizeNodeType(nodeType: string, nodeLabel?: string): NodeType | null {
    if (Object.values(NodeType).includes(nodeType as NodeType)) {
      return nodeType as NodeType;
    }

    if (LEGACY_NODE_TYPE_MAPPINGS[nodeType]) {
      return LEGACY_NODE_TYPE_MAPPINGS[nodeType];
    }

    if (nodeLabel && LEGACY_NODE_TYPE_MAPPINGS[nodeLabel]) {
      return LEGACY_NODE_TYPE_MAPPINGS[nodeLabel];
    }

    
    return null;
  }

  /**
   * Check if a node type is valid
   */
  static isValidNodeType(nodeType: string): boolean {
    return Object.values(NodeType).includes(nodeType as NodeType);
  }

  /**
   * Get the category for a node type
   */
  static getNodeCategory(nodeType: NodeType): NodeCategory {
    return NODE_TYPE_CATEGORIES[nodeType];
  }

  /**
   * Check if a node type belongs to a specific category
   */
  static isNodeInCategory(nodeType: NodeType, category: NodeCategory): boolean {
    return NODE_TYPE_CATEGORIES[nodeType] === category;
  }

  /**
   * Get all node types in a category
   */
  static getNodeTypesInCategory(category: NodeCategory): NodeType[] {
    return Object.entries(NODE_TYPE_CATEGORIES)
      .filter(([_, nodeCategory]) => nodeCategory === category)
      .map(([nodeType, _]) => nodeType as NodeType);
  }

  /**
   * Check if a node type requires user input (should pause execution)
   * Note: Webhook nodes are NOT included here as they are action nodes that execute asynchronously
   * and should not block flow execution or wait for user input.
   */
  static requiresUserInput(nodeType: NodeType): boolean {
    return [NodeType.INPUT, NodeType.QUICK_REPLY, NodeType.WHATSAPP_INTERACTIVE_BUTTONS, NodeType.WHATSAPP_POLL].includes(nodeType);
  }

  /**
   * Check if a node type should stop flow execution
   * Note: Webhook nodes are NOT included here as they are action nodes that should allow
   * the flow to continue immediately after execution.
   */
  static stopsExecution(nodeType: NodeType): boolean {
    return [NodeType.BOT_DISABLE, NodeType.STRIPE].includes(nodeType);
  }

  /**
   * Check if a node type is a media node
   */
  static isMediaNode(nodeType: NodeType): boolean {
    return this.isNodeInCategory(nodeType, NodeCategory.MEDIA);
  }

  /**
   * Check if a node type is a message node
   */
  static isMessageNode(nodeType: NodeType): boolean {
    return this.isNodeInCategory(nodeType, NodeCategory.MESSAGE);
  }

  /** Canvas-only nodes that are persisted but never executed */
  static isAnnotationNode(nodeType: NodeType): boolean {
    return nodeType === NodeType.NOTES;
  }

  /**
   * Check if a node type is an asynchronous action node
   * These nodes execute actions (like HTTP requests, webhooks, code execution) without blocking the flow.
   * They should execute once when reached and continue immediately to the next node.
   * @param nodeType The node type to check
   * @returns True if the node is an async action node (webhook, HTTP request, code execution, etc.)
   */
  static isAsyncActionNode(nodeType: NodeType): boolean {
    return [
      NodeType.WEBHOOK,
      NodeType.HTTP_REQUEST,
      NodeType.DATABASE_QUERY,
      NodeType.CODE_EXECUTION,
      NodeType.CONTACT_NOTIFICATION,
      NodeType.MCP_EXECUTE_TOOL
    ].includes(nodeType);
  }
}

/**
 * Node execution result interface
 */
export interface NodeExecutionResult {
  success: boolean;
  shouldContinue: boolean;
  nextNodeId?: string;
  waitForUserInput?: boolean;
  error?: string;
  data?: any;
}

/**
 * Node execution configuration
 */
export interface NodeExecutionConfig {
  timeout?: number;
  retryCount?: number;
  skipOnError?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Represents one media payload inside an `IMAGE | VIDEO | AUDIO | DOCUMENT` node. A node may contain up to `MEDIA_ITEMS_MAX` items, each sent as a separate consecutive message at runtime.
 */
export interface MediaItem {
  id: string;
  mediaUrl: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  size?: number;
  originalName?: string;
}

/**
 * Envelope shape for `NodeType.IMAGE | VIDEO | AUDIO | DOCUMENT` nodes. `mediaItems` is the new canonical field; the legacy single-item fields are kept solely for backward-compatible reads of flows persisted before the multi-item rollout.
 */
export interface MediaNodeData {
  // New shape (preferred, written by all new nodes):
  mediaItems?: MediaItem[];
  interItemDelayMs?: number;

  // Legacy single-item shape (read-only fallback for flows saved before this change):
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  originalName?: string;
  mimetype?: string;
  size?: number;

  // Pass-through routing fields already in use by the existing nodes (preserve so consumers don't lose them):
  /**
   * Keyword routing entries persisted by media/message nodes; mirrors the `MessageKeyword` interface in `client/src/pages/flow-builder.tsx` (`id`, `text`, `value`, `caseSensitive`). Do not use a `keyword` string property — it is not part of the persisted shape; use `value` / `text` / `id` / `caseSensitive` as in `flow-executor.ts`.
   */
  keywords?: Array<{
    id?: string;
    text?: string;
    value?: string;
    caseSensitive?: boolean;
    [k: string]: unknown;
  }>;
  enableKeywordTriggers?: boolean;

  [key: string]: unknown;
}

/** ERP flow node: invoice payment methods (aligned with `server/routes/erp/invoices.ts` PAYMENT_METHODS). */
export const ERP_INVOICE_PAYMENT_METHODS = [
  'cash',
  'check',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'stripe',
  'paypal',
  'mercadopago',
  'moyasar',
  'mpesa',
  'paystack',
  'other',
] as const;

export {
  ERP_OPERATIONS,
  ERP_SHARED_RESOURCES,
  ERP_RESTAURANT_RESOURCES,
  ERP_DENTAL_RESOURCES,
  ERP_RESOURCES,
  ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE,
  ERP_RESOURCE_BUSINESS_TYPE,
  getErpRequiredBusinessType,
  isErpResourceAvailable,
} from '../erp-capabilities';
export type { ErpResource, ErpBusinessType } from '../erp-capabilities';

/** Target statuses for `sales_order` / `set_status` in flows and AI ERP tools. */
export const ERP_SET_STATUS_TARGET_STATUSES = [
  'quotation',
  'processing',
  'shipped',
  'delivered',
  'returned',
] as const;

/** AI Assistant ERP tool family tag for the function registry. */
export const ERP_AI_FUNCTION_FAMILY = 'erp' as const;

/** Canonical OpenAI-style function names exposed when AI Assistant `enableErp` is on. */
export const ERP_AI_FUNCTION_NAMES = [
  'erp_search_products',
  'erp_send_product_image',
  'erp_list_my_orders',
  'erp_get_order',
  'erp_create_order',
  'erp_add_order_item',
  'erp_update_order',
  'erp_confirm_order',
  'erp_set_order_status',
  'erp_cancel_order',
  'erp_generate_invoice_from_order',
  'erp_create_invoice',
  'erp_send_invoice',
  'erp_record_invoice_payment',
  'erp_void_invoice',
  'erp_cancel_invoice',
  'erp_get_invoice',
  'erp_send_order_confirmation',
  'erp_send_invoice_to_customer',
  'erp_restaurant_check_table_availability',
  'erp_restaurant_list_my_reservations',
  'erp_restaurant_get_reservation',
  'erp_restaurant_create_reservation',
  'erp_restaurant_update_reservation',
  'erp_restaurant_cancel_reservation',
  'erp_restaurant_get_waitlist_status',
  'erp_restaurant_join_waitlist',
  'erp_restaurant_update_waitlist',
  'erp_restaurant_leave_waitlist',
  'erp_restaurant_get_delivery_status',
  'erp_dental_get_my_patient_status',
  'erp_dental_list_my_treatment_plans',
  'erp_dental_get_treatment_plan',
  'erp_dental_get_treatment_plan_billing_status',
  'erp_dental_request_treatment_plan_approval',
] as const;

export type ErpAiFunctionName = (typeof ERP_AI_FUNCTION_NAMES)[number];

/** When the AI Assistant should attach ERP product images in replies. */
export const ERP_PRODUCT_IMAGE_SEND_WHEN_VALUES = [
  'single_product_recommendation',
  'product_search_results',
  'explicit_request_only',
  'menu_catalog_replies',
] as const;

export type ErpProductImageSendWhen = (typeof ERP_PRODUCT_IMAGE_SEND_WHEN_VALUES)[number];

export const ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT: ErpProductImageSendWhen = 'explicit_request_only';

/** How many product images to send when ERP search returns multiple matches. */
export const ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_VALUES = [
  'first_match_only',
  'up_to_three',
  'every_match',
  'text_only',
] as const;

export type ErpProductImageMultiMatchMode = (typeof ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_VALUES)[number];

export const ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT: ErpProductImageMultiMatchMode = 'text_only';

/** Caption placement when sending one or more images for a product. */
export const ERP_PRODUCT_IMAGE_CAPTION_MODE_VALUES = [
  'first_only',
  'every_image',
  'none',
] as const;

export type ErpProductImageCaptionMode = (typeof ERP_PRODUCT_IMAGE_CAPTION_MODE_VALUES)[number];

export const ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT: ErpProductImageCaptionMode = 'first_only';

/** Default / bounds for how many images to send per selected product. */
export const ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT = 5;
export const ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MIN = 1;
export const ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MAX = 10;

/** Default customer-facing guidance when ERP catalog price sharing is disabled. */
export const ERP_PRICE_INQUIRY_RESPONSE_DEFAULT =
  'First, an assessment needs to be done where the doctor will evaluate your case and provide an exact price for the treatment.';

/** Resolved document types for generation (excludes Auto). */
export type DocumentGeneratorResolvedType = 'presentation' | 'quote' | 'report';

/** Builder-selected document type; `auto` defers resolution to runtime (later phase). */
export type DocumentGeneratorDocumentType = DocumentGeneratorResolvedType | 'auto';

/** Builder-owned full system prompts keyed by resolved document type. */
export type DocumentGeneratorSystemPrompts = Record<DocumentGeneratorResolvedType, string>;

/** Quote design backend: Gemini HTML/CSS→PDF or Gemini native image→PDF. */
export type DocumentGeneratorQuoteDesignMode = 'html_pdf' | 'image_pdf';

export type DocumentGeneratorOutputFormat =
  | 'pdf'
  | 'pptx'
  | 'google_slides_link'
  | 'png_per_slide';

export interface DocumentGeneratorNodeData {
  label?: string;
  /** GCP project ID for Vertex AI + Google Slides (presentations/reports). */
  gcpProjectId?: string;
  /** GCP region, e.g. us-central1 */
  gcpLocation?: string;
  /** Service account JSON key for Vertex AI, Slides, and Drive export. */
  gcpServiceAccountJson?: string;
  /** Vertex Gemini model for deck content generation. */
  vertexTextModel?: string;
  /** Vertex Imagen model for slide visuals. */
  vertexImagenModel?: string;
  /** Primary output format delivered to the contact. */
  outputFormat?: DocumentGeneratorOutputFormat;
  /** Built-in Slides theme preset id. */
  slidesThemeId?: string;
  /** Optional Drive folder id for created presentations. */
  slidesFolderId?: string;
  documentType?: DocumentGeneratorDocumentType;
  /**
   * @deprecated Legacy slide/section count — preserved for saved-flow compatibility only.
   * Enforced card counts come from shared `DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS`, not this field.
   */
  slideCount?: number;
  tone?: string;
  verbosity?: string;
  language?: string;
  /**
   * @deprecated Legacy single prompt field — use `systemPrompts` keyed by resolved type.
   * Migrated via `normalizeDocumentGeneratorSystemPrompts` when `systemPrompts` is absent.
   */
  instructions?: string;
  /** Builder-owned editable full prompts per resolved document type (merged over Spanish defaults). */
  systemPrompts?: Partial<DocumentGeneratorSystemPrompts>;
  contentTemplate?: string;
  useInboundAttachment?: boolean;
  /**
   * When true, Document Generator runs an interactive multi-turn wizard
   * (quotes: logo → paste/structured fields → Gemini design; other types: Vertex Slides/clone).
   */
  interactiveWizard?: boolean;
  /**
   * Quote generation backend when document type is quote (or auto→quote).
   * `html_pdf` = Gemini designs HTML/CSS → Playwright PDF.
   * `image_pdf` = Gemini native image → embed PNG in A4 PDF.
   */
  quoteDesignMode?: DocumentGeneratorQuoteDesignMode;
  logoSource?: 'inbound' | 'url' | 'none' | 'ask';
  logoUrl?: string;
  imageType?: 'stock' | 'ai-generated';
  includeTitleSlide?: boolean;
  includeTableOfContents?: boolean;
  ackMessage?: string;
  /** Template for the delivered PDF filename, e.g. "{{contact.name}}-itinerary.pdf" */
  outputFileName?: string;
  /** Google AI Studio Gemini API key for quote design and own-template PDF cloning. */
  geminiApiKey?: string;
  /** Gemini text model id for HTML quote design / PDF cloning (default: gemini-3.1-pro-preview). */
  geminiModel?: string;
  /** Gemini image model id for quoteDesignMode=image_pdf (e.g. gemini-2.5-flash-image). */
  geminiImageModel?: string;
  connectionStatus?: 'idle' | 'testing' | 'success' | 'error';
  connectionMessage?: string;
  gcpConnectionStatus?: 'idle' | 'testing' | 'success' | 'error';
  gcpConnectionMessage?: string;
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
  [key: string]: unknown;
}

/** Hard cap on items per media node (matches WhatsApp media-group convention). */
export const MEDIA_ITEMS_MAX = 10;

/** Default inter-item delay applied to **newly created** nodes in the UI. Legacy nodes that omit `interItemDelayMs` are treated as `0` by the executor. */
export const MEDIA_ITEMS_DEFAULT_DELAY_MS = 500;

/** Upper bound used by both the editor's `<input type="number" max>` and the executor's clamp. */
export const MEDIA_ITEMS_MAX_DELAY_MS = 10000;

/**
 * Normalizes a media node's payload into a uniform `MediaItem[]` regardless of whether the node was saved with the new `mediaItems` shape or the legacy single-item `mediaUrl/caption` fields. Returns an empty array when neither is present so callers can simply `for (const item of items)` without null-checks. The synthetic legacy item uses the literal `id: 'legacy'` so it is identifiable in logs and metadata.
 */
export function normalizeMediaNodeItems(data: MediaNodeData): MediaItem[] {
  if (data == null) {
    return [];
  }
  if (Array.isArray(data.mediaItems) && data.mediaItems.length > 0) {
    return data.mediaItems;
  }
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim().length > 0) {
    const item: MediaItem = { id: 'legacy', mediaUrl: data.mediaUrl };
    if (data.caption !== undefined) {
      item.caption = data.caption;
    }
    if (data.fileName !== undefined) {
      item.fileName = data.fileName;
    }
    if (data.originalName !== undefined) {
      item.originalName = data.originalName;
    }
    if (data.mimetype !== undefined) {
      item.mimetype = data.mimetype;
    }
    if (data.size !== undefined) {
      item.size = data.size;
    }
    return [item];
  }
  return [];
}

// ---------------------------------------------------------------------------
// AI Assistant node — canonical editor/runtime persisted data contract
// ---------------------------------------------------------------------------

export const AI_ASSISTANT_DEFAULT_PROVIDER = 'openai';
export const AI_ASSISTANT_DEFAULT_MODEL = 'gpt-5.6-luna';
export const AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL = 'openai/gpt-5.6-luna';
export const AI_ASSISTANT_DEFAULT_HISTORY_LIMIT = 10;

export type AiAssistantCredentialSource = 'manual' | 'company' | 'system' | 'auto';

export interface AiAssistantTaskGroup {
  id: string;
  name: string;
}

export interface AiAssistantTaskDefinition {
  id: string;
  name: string;
  description: string;
  functionDefinition: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
  outputHandle: string;
  enabled: boolean;
  /** When missing or not matching a defined group, task is shown under Ungrouped. */
  groupId?: string | null;
}

export interface AiAssistantVariableDefinition {
  id: string;
  name: string;
  dataType: 'text';
  required: boolean;
}

export type AiAssistantCustomFieldMode = 'read' | 'write' | 'read_write';

export interface AiAssistantCustomFieldBinding {
  id: string;
  customFieldId: number;
  entity: 'contact' | 'deal';
  /** Immutable custom-field storage key snapshot, used for display and safe fallback. */
  fieldName: string;
  mode: AiAssistantCustomFieldMode;
  /** Whether this writable field participates in the Variables Complete route. */
  required: boolean;
}

export interface AiAssistantKnowledgeBaseConfig {
  maxRetrievedChunks?: number;
  similarityThreshold?: number;
  contextPosition?: 'before_system' | 'after_system' | 'before_user';
  contextTemplate?: string;
  greetingAcknowledgementExpressions?: string[];
  embeddingModel?: string;
  vectorDatabase?: VectorDatabaseProvider | null;
  hybridEnabled?: boolean;
  denseTopK?: number;
  lexicalTopK?: number;
  rrfK?: number;
  denseWeight?: number;
  lexicalWeight?: number;
  candidatePoolSize?: number;
  dedupeEnabled?: boolean;
  dedupeSimilarity?: number;
  mmrEnabled?: boolean;
  mmrLambda?: number;
  rerankEnabled?: boolean;
  rerankModel?: string;
  rerankTopN?: number;
  confidenceThreshold?: number;
  queryRewriteEnabled?: boolean;
  answerValidationEnabled?: boolean;
  hnswEfSearch?: number;
  /** Forward-compatible nested RAG fields preserved across editor saves. */
  [key: string]: unknown;
}

/**
 * Canonical persisted shape for `NodeType.AI_ASSISTANT` flow nodes.
 * Unknown fields are preserved via the index signature for forward/backward compatibility.
 */
export interface AiAssistantNodeData {
  label?: string;

  // Provider / runtime
  provider?: string;
  model?: string;
  apiKey?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  credentialSource?: AiAssistantCredentialSource;

  // Prompt / conversation
  prompt?: string;
  language?: string;
  enableHistory?: boolean;
  historyLimit?: number;
  maxOutputTokens?: number;
  /** Text outputs inferred from otherwise-unknown placeholders in the system prompt. */
  aiVariables?: AiAssistantVariableDefinition[];
  customFieldBindings?: AiAssistantCustomFieldBinding[];

  // Voice / image
  enableTextToSpeech?: boolean;
  /** Speech-to-text / voice input; runtime defaults to provider-open when omitted. */
  enableVoiceProcessing?: boolean;
  ttsProvider?: string;
  ttsVoice?: string;
  voiceResponseMode?: string;
  maxAudioDuration?: number;
  enableImage?: boolean;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsCustomVoiceId?: string;
  elevenLabsModel?: string;
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsUseSpeakerBoost?: boolean;
  elevenLabsPromptInfluence?: number;
  elevenLabsEnableAudioTags?: boolean;
  elevenLabsAudioTagsInstructions?: string;

  // Tools / routing
  enableTaskExecution?: boolean;
  /** When false, task branches run but no AI follow-up message is sent after completion. Defaults to enabled. */
  enableTaskFollowUpMessage?: boolean;
  tasks?: AiAssistantTaskDefinition[];
  taskGroups?: AiAssistantTaskGroup[];
  exitOutputHandle?: string;
  enableSessionTakeover?: boolean;
  stopKeyword?: string;

  // RAG
  knowledgeBaseEnabled?: boolean;
  knowledgeBaseConfig?: AiAssistantKnowledgeBaseConfig;
  /** Legacy top-level mirror; runtime may still read this. */
  vectorDatabase?: VectorDatabaseProvider | null;
  pineconeApiKey?: string;
  pineconeEnvironment?: string;
  pineconeIndexName?: string;

  timezone?: string;

  // Google Calendar
  enableGoogleCalendar?: boolean;
  googleCalendarId?: string;
  calendarBusinessHours?: { start: string; end: string };
  calendarDefaultDuration?: number;
  calendarBufferMinutes?: number;
  calendarTimeZone?: string;
  calendarAdvancedMode?: boolean;
  calendarAdvancedSettings?: CalendarAdvancedSettings;
  /** Max time options the agent offers per message (default 5) */
  calendarOfferingSettings?: CalendarOfferingSettings;
  /** Appointment reminder settings for Google Calendar bookings */
  calendarReminderSettings?: CalendarReminderSettings;
  calendarFunctions?: unknown[];

  // Calendar assignment (persisted empty string = company default)
  assignmentStrategy?: string;
  targetAgentUserId?: number | null;
  bookableAgentUserIds?: number[] | string | unknown;

  // Zoho Calendar
  enableZohoCalendar?: boolean;
  zohoCalendarBusinessHours?: { start: string; end: string };
  zohoCalendarDefaultDuration?: number;
  zohoCalendarTimeZone?: string;
  zohoCalendarAdvancedMode?: boolean;
  zohoCalendarAdvancedSettings?: CalendarAdvancedSettings;
  zohoCalendarOfferingSettings?: CalendarOfferingSettings;
  zohoCalendarReminderSettings?: CalendarReminderSettings;
  zohoCalendarFunctions?: unknown[];

  // ERP
  enableErp?: boolean;
  /** Use the clinic's local Dental booking policy and schedule. */
  enableLocalDentalBooking?: boolean;
  /** Whether local Dental booking replies may identify the selected provider. */
  localDentalProviderDetailsSharingEnabled?: boolean;
  /** Whether local Dental booking replies may enumerate service catalog details. */
  localDentalServiceDetailsSharingEnabled?: boolean;
  /** Offer one available local Dental appointment time per reply. */
  localDentalSingleSlotOfferingEnabled?: boolean;
  /** Whether the assistant may disclose pre-transaction product and service catalog prices. */
  erpCatalogPriceSharingEnabled?: boolean;
  /** Guidance whose meaning the assistant uses for catalog-price questions when sharing is disabled. */
  erpPriceInquiryResponse?: string;
  erpMessageTemplate?: string;
  erpIncludePdfLink?: boolean;
  erpProductImageSendWhen?: ErpProductImageSendWhen;
  erpProductImageMultiMatchMode?: ErpProductImageMultiMatchMode;
  /** Max images to send per selected product (1–10). */
  erpProductImageMaxPerProduct?: number;
  /** Where to place product name/description captions on media. */
  erpProductImageCaptionMode?: ErpProductImageCaptionMode;

  // Editor-only callbacks (not part of saved flow JSON)
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;

  [key: string]: unknown;
}

export interface TranslationNodeData {
  label?: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  apiKey?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  credentialSource?: AiAssistantCredentialSource;
  outputVariable?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  translationMode?: string;
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Gamma node — canonical editor/runtime persisted data contract
// ---------------------------------------------------------------------------

export type GammaGenerationType = 'presentation' | 'document';
export type GammaExportFormat = 'pdf' | 'pptx' | 'png';

/**
 * Canonical persisted shape for `NodeType.GAMMA` flow nodes.
 * Generates presentations and documents via Gamma API during chat flows.
 */
export type GammaLogoPlacementMode = 'header' | 'prompt' | 'both' | 'none';
export type GammaLogoHeaderPosition =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';
export type GammaLogoHeaderSize = 'sm' | 'md' | 'lg' | 'xl';

/** Document types the Gamma Gemini assistant can soft-lock from conversation. */
export type GammaAssistantDocumentType = 'presentation' | 'report' | 'quote';

/** Editable full system prompts keyed by assistant document type. */
export type GammaAssistantSystemPrompts = Record<GammaAssistantDocumentType, string>;

export interface GammaNodeData {
  label?: string;

  // Credentials
  apiKey?: string;
  connectionStatus?: 'idle' | 'testing' | 'success' | 'error';
  connectionMessage?: string;

  // Generation settings
  generationType?: GammaGenerationType;
  exportFormat?: GammaExportFormat;
  prompt?: string;
  includeConversation?: boolean;
  textMode?: 'generate' | 'condense' | 'preserve';

  // Advanced settings
  themeId?: string;
  folderId?: string;
  cardCount?: number;
  tone?: string;
  language?: string;

  // Message configuration
  ackMessage?: string;
  outputFileName?: string;

  // Gemini Assistant
  useGeminiAssistant?: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
  /**
   * @deprecated Prefer `systemPrompts` keyed by presentation/report/quote.
   * Ignored when seeding new defaults (do not auto-migrate into systemPrompts).
   */
  systemPrompt?: string;
  /** Editable full system prompts per assistant document type. */
  systemPrompts?: Partial<GammaAssistantSystemPrompts>;
  customLogoUrl?: string;
  appBaseUrl?: string;
  assistantHistoryLimit?: number;

  /**
   * How to apply an uploaded/configured logo.
   * - header: Gamma cardOptions.headerFooter API (all cards, optionally hide first/last)
   * - prompt: logoPrompt / additionalInstructions only (e.g. first+last only)
   * - both: headerFooter + logoPrompt
   * - none: do not apply logo placement automatically
   */
  logoPlacementMode?: GammaLogoPlacementMode;
  /** Header/footer slot for API logo placement. */
  logoHeaderPosition?: GammaLogoHeaderPosition;
  /** Header/footer image size: sm | md | lg | xl */
  logoHeaderSize?: GammaLogoHeaderSize;
  /** When using header mode: hide logo on the first card. */
  logoHideFromFirstCard?: boolean;
  /** When using header mode: hide logo on the last card. */
  logoHideFromLastCard?: boolean;
  /**
   * Extra instructions for Gamma about the logo (things the headerFooter API cannot express).
   * Use {{logoUrl}} as a placeholder for the resolved public logo URL.
   */
  logoPrompt?: string;

  // Editor-only callbacks (not part of saved flow JSON)
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;

  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Message Trigger node — optional pipeline stage scope (persisted in flows.nodes)
// ---------------------------------------------------------------------------

/** Generic first-inbound-message routing (legacy default when field is absent). */
export const MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC = 'generic_initial_message' as const;
/** Route initial inbound messages by exact Meta ad routing key from message metadata. */
export const MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD = 'meta_ad_routing' as const;

export type MessageTriggerInitialSourceMode =
  | typeof MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC
  | typeof MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD;

export const MESSAGE_TRIGGER_INITIAL_SOURCE_MODES: readonly MessageTriggerInitialSourceMode[] = [
  MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC,
  MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD,
];

/** Meta-capable channel types for Meta ad routing configuration in the flow editor. */
export const MESSAGE_TRIGGER_META_AD_CHANNELS = [
  'messenger',
  'instagram',
  'whatsapp_official',
  'whatsapp_unofficial',
] as const;

/** Generic initial-message branch handle id on Message Trigger nodes. */
export const MESSAGE_TRIGGER_INITIAL_HANDLE_ID = 'initial-message';

/** Prefix for Meta ad routing-key output handles derived from `metaAdRoutingKeys`. */
export const MESSAGE_TRIGGER_META_AD_ROUTING_HANDLE_PREFIX = 'meta-ad-routing:' as const;

/** Derive a stable Message Trigger output handle id from an exact Meta ad routing key. */
export function deriveMessageTriggerMetaAdRoutingHandleId(routingKey: string): string {
  const trimmed = routingKey.trim();
  if (!trimmed) {
    throw new Error('Meta ad routing key must be a non-empty string');
  }
  return `${MESSAGE_TRIGGER_META_AD_ROUTING_HANDLE_PREFIX}${encodeURIComponent(trimmed)}`;
}

/** True when a handle id belongs to Meta ad routing (not the generic initial-message handle). */
export function isMessageTriggerMetaAdRoutingHandleId(handleId: string): boolean {
  return handleId.startsWith(MESSAGE_TRIGGER_META_AD_ROUTING_HANDLE_PREFIX);
}

/** Recover the routing key encoded in a Meta ad routing handle id, or null when not applicable. */
export function parseMessageTriggerMetaAdRoutingKeyFromHandleId(handleId: string): string | null {
  if (!isMessageTriggerMetaAdRoutingHandleId(handleId)) {
    return null;
  }
  const encoded = handleId.slice(MESSAGE_TRIGGER_META_AD_ROUTING_HANDLE_PREFIX.length);
  if (!encoded) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** Resolve the effective initial branch handle for a trigger match. */
export function resolveMessageTriggerInitialHandleId(params: {
  sourceMode: MessageTriggerInitialSourceMode;
  matchedRoutingKey?: string | null;
}): string {
  if (params.sourceMode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD) {
    const key = params.matchedRoutingKey?.trim();
    if (!key) {
      throw new Error('Meta ad routing mode requires a matched routing key');
    }
    return deriveMessageTriggerMetaAdRoutingHandleId(key);
  }
  return MESSAGE_TRIGGER_INITIAL_HANDLE_ID;
}

/** True for generic initial-message or any Meta ad routing-key handle. */
export function isMessageTriggerInitialSourceHandleId(handleId: string): boolean {
  return (
    handleId === MESSAGE_TRIGGER_INITIAL_HANDLE_ID ||
    isMessageTriggerMetaAdRoutingHandleId(handleId)
  );
}

export interface MessageTriggerNodeData {
  label?: string;
  triggerType?: string;
  channelTypes?: string[];
  conditionType?: string;
  conditionValue?: string;
  multipleKeywords?: unknown;
  hardResetKeyword?: string;
  enableSessionPersistence?: boolean;
  sessionTimeout?: number;
  sessionTimeoutUnit?: string;
  enableInitialMessageOutput?: boolean;
  initialMessageSourceMode?: MessageTriggerInitialSourceMode;
  metaAdRoutingKeys?: string[];
  pipelineId?: number;
  stageId?: number;
  [key: string]: unknown;
}

function normalizeMessageTriggerChannelTypes(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  const asArray = Array.isArray(value) ? value : [value];
  const normalized = [
    ...new Set(
      asArray
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  ];
  return normalized.length > 0 ? [normalized[0]] : undefined;
}

function normalizeMessageTriggerRoutingKeys(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  const asArray = Array.isArray(value) ? value : [value];
  const normalized = [
    ...new Set(
      asArray
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  ];
  return normalized.length > 0 ? normalized : undefined;
}

export function resolveMessageTriggerInitialSourceMode(
  value: unknown
): MessageTriggerInitialSourceMode {
  if (value === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD) {
    return MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD;
  }
  return MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_GENERIC;
}

export type FlowTriggerStageScope =
  | { kind: 'unscoped' }
  | { kind: 'stage-scoped'; pipelineId: number; stageId: number }
  | { kind: 'invalid'; reason: 'partial' | 'malformed' };

function isBlankMessageTriggerScopeValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function normalizeMessageTriggerScopeId(value: unknown): number | undefined {
  if (isBlankMessageTriggerScopeValue(value)) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

/** Accepted Message Trigger node shapes: `trigger`, `triggerNode`, or `data.label === 'Message Trigger'`. */
export function isMessageTriggerNode(node: { type?: unknown; data?: unknown }): boolean {
  const nodeType = String(node.type ?? '');
  if (nodeType === 'trigger' || nodeType === 'triggerNode') {
    return true;
  }
  const data = node.data;
  return !!(data && typeof data === 'object' && (data as MessageTriggerNodeData).label === 'Message Trigger');
}

/** True when trigger node is (or defaults to) a message_received trigger — not legacy pipeline trigger variants. */
export function isMessageReceivedTriggerNode(node: { type?: unknown; data?: unknown }): boolean {
  if (!isMessageTriggerNode(node)) {
    return false;
  }
  const data = node.data;
  if (!data || typeof data !== 'object') {
    return true;
  }
  const triggerType = (data as MessageTriggerNodeData).triggerType;
  return !triggerType || triggerType === 'message_received';
}

/** Normalize Message Trigger persisted data (channels, routing keys, stage scope). */
export function normalizeMessageTriggerNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  if (isBlankMessageTriggerScopeValue(result.pipelineId)) {
    delete result.pipelineId;
  }
  if (isBlankMessageTriggerScopeValue(result.stageId)) {
    delete result.stageId;
  }

  const normalizedChannels = normalizeMessageTriggerChannelTypes(
    result.channelTypes ?? result.channels
  );
  if (normalizedChannels) {
    result.channelTypes = normalizedChannels;
  } else {
    delete result.channelTypes;
  }
  delete result.channels;

  result.initialMessageSourceMode = resolveMessageTriggerInitialSourceMode(
    result.initialMessageSourceMode
  );

  if (result.initialMessageSourceMode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD) {
    const channels = result.channelTypes as string[] | undefined;
    const metaChannelSet = new Set<string>(MESSAGE_TRIGGER_META_AD_CHANNELS);
    if (channels && channels.length > 0) {
      const firstMeta = channels.find((channel) => metaChannelSet.has(channel));
      result.channelTypes = firstMeta ? [firstMeta] : [];
    }
  }

  const normalizedRoutingKeys = normalizeMessageTriggerRoutingKeys(result.metaAdRoutingKeys);
  if (normalizedRoutingKeys) {
    result.metaAdRoutingKeys = normalizedRoutingKeys;
  } else {
    delete result.metaAdRoutingKeys;
  }

  return result;
}

/** Derive assignment scope from a flow's persisted nodes JSON. */
export function deriveFlowTriggerStageScopeFromNodes(nodes: unknown): FlowTriggerStageScope {
  if (!Array.isArray(nodes)) {
    return { kind: 'unscoped' };
  }

  const triggerNode = nodes.find((node) => isMessageTriggerNode(node as { type?: unknown; data?: unknown }));
  if (!triggerNode || typeof triggerNode !== 'object') {
    return { kind: 'unscoped' };
  }

  if (!isMessageReceivedTriggerNode(triggerNode as { type?: unknown; data?: unknown })) {
    return { kind: 'unscoped' };
  }

  const data = (triggerNode as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return { kind: 'unscoped' };
  }

  const triggerData = data as MessageTriggerNodeData;
  const rawPipelineId = triggerData.pipelineId;
  const rawStageId = triggerData.stageId;
  const hasPipelineField = !isBlankMessageTriggerScopeValue(rawPipelineId);
  const hasStageField = !isBlankMessageTriggerScopeValue(rawStageId);

  if (!hasPipelineField && !hasStageField) {
    return { kind: 'unscoped' };
  }

  if (hasPipelineField !== hasStageField) {
    return { kind: 'invalid', reason: 'partial' };
  }

  const pipelineId = normalizeMessageTriggerScopeId(rawPipelineId);
  const stageId = normalizeMessageTriggerScopeId(rawStageId);
  if (!pipelineId || !stageId) {
    return { kind: 'invalid', reason: 'malformed' };
  }

  return { kind: 'stage-scoped', pipelineId, stageId };
}

/** True when both pipelineId and stageId are valid positive integers on a Message Trigger node. */
export function isStageScopedMessageTriggerData(data: MessageTriggerNodeData): boolean {
  const scope = deriveFlowTriggerStageScopeFromNodes([{ type: 'trigger', data }]);
  return scope.kind === 'stage-scoped';
}

/** Default channel list when a Message Trigger omits channelTypes (matches product channel enum). */
export const MESSAGE_TRIGGER_DEFAULT_CHANNEL_FALLBACK = [
  'whatsapp_official',
  'whatsapp_unofficial',
  'messenger',
  'instagram',
  'email',
  'telegram',
  'tiktok',
  'webchat',
  'twilio_sms',
  'twilio_voice',
] as const;

/** Canonicalize channel names for trigger/assignment comparison (e.g. whatsapp → whatsapp_unofficial). */
export function canonicalizeMessageTriggerChannelType(channelType: string): string {
  if (channelType === 'whatsapp') {
    return 'whatsapp_unofficial';
  }
  return channelType;
}

/** True when a Meta-ad trigger has an explicit empty channel scope after normalization. */
export function isMetaAdTriggerWithEmptyChannelScope(data: Record<string, unknown>): boolean {
  const normalized = normalizeMessageTriggerNodeData({ ...data });
  if (
    resolveMessageTriggerInitialSourceMode(normalized.initialMessageSourceMode) !==
    MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD
  ) {
    return false;
  }
  return Array.isArray(normalized.channelTypes) && normalized.channelTypes.length === 0;
}

/** Effective Meta-ad routable channel scope: intersection of trigger channels and assigned channel. */
export function computeEffectiveMetaAdChannelScope(
  triggerChannelTypes: string[],
  assignedChannelType: string
): string[] {
  const canonicalAssigned = canonicalizeMessageTriggerChannelType(assignedChannelType);
  const canonicalTriggerChannels = triggerChannelTypes.map(canonicalizeMessageTriggerChannelType);

  if (canonicalTriggerChannels.length === 0) {
    return [];
  }

  const matching = canonicalTriggerChannels.filter((channel) => channel === canonicalAssigned);
  return [...new Set(matching)];
}

/** True when the trigger's normalized channel list supports the assigned connection type. */
export function messageTriggerSupportsChannelType(
  triggerNode: { data?: unknown },
  channelType: string
): boolean {
  const data = (
    triggerNode.data && typeof triggerNode.data === 'object'
      ? triggerNode.data
      : {}
  ) as Record<string, unknown>;
  const normalized = normalizeMessageTriggerNodeData({ ...data });
  const supportedChannels = normalized.channelTypes as string[] | undefined;
  const canonicalChannel = canonicalizeMessageTriggerChannelType(channelType);
  const sourceMode = resolveMessageTriggerInitialSourceMode(normalized.initialMessageSourceMode);

  if (sourceMode === MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD) {
    if (Array.isArray(supportedChannels) && supportedChannels.length === 0) {
      return false;
    }
  }

  if (!supportedChannels || supportedChannels.length === 0) {
    return MESSAGE_TRIGGER_DEFAULT_CHANNEL_FALLBACK.some(
      (channel) => canonicalizeMessageTriggerChannelType(channel) === canonicalChannel
    );
  }

  return supportedChannels.some(
    (channel) => canonicalizeMessageTriggerChannelType(channel) === canonicalChannel
  );
}

export type MetaAdRoutingTriggerConfig = {
  routingKeys: string[];
  channelTypes?: string[];
};

/** Meta-ad routing config from persisted nodes (same rules as editor/runtime normalization). */
export function deriveMetaAdRoutingTriggerConfigFromNodes(
  nodes: unknown
): MetaAdRoutingTriggerConfig | null {
  if (!Array.isArray(nodes)) {
    return null;
  }

  const triggerNode = nodes.find((node) =>
    isMessageTriggerNode(node as { type?: unknown; data?: unknown })
  );
  if (!triggerNode || typeof triggerNode !== 'object') {
    return null;
  }

  if (!isMessageReceivedTriggerNode(triggerNode as { type?: unknown; data?: unknown })) {
    return null;
  }

  const rawData = (triggerNode as { data?: unknown }).data;
  if (!rawData || typeof rawData !== 'object') {
    return null;
  }

  const triggerData = rawData as MessageTriggerNodeData;
  if (triggerData.enableInitialMessageOutput !== true) {
    return null;
  }

  const normalized = normalizeMessageTriggerNodeData({
    ...(rawData as Record<string, unknown>),
  });
  const sourceMode = resolveMessageTriggerInitialSourceMode(normalized.initialMessageSourceMode);
  if (sourceMode !== MESSAGE_TRIGGER_INITIAL_SOURCE_MODE_META_AD) {
    return null;
  }

  const routingKeys = normalized.metaAdRoutingKeys as string[] | undefined;
  if (!routingKeys || routingKeys.length === 0) {
    return null;
  }

  const channelTypes = normalized.channelTypes as string[] | undefined;
  return {
    routingKeys,
    channelTypes,
  };
}

export type MetaAdRoutingFootprint =
  | { kind: 'none' }
  | {
      kind: 'meta_ad';
      companyId: number;
      flowId: number;
      routingKeys: string[];
      effectiveChannelTypes: string[];
    };

/** Canonical Meta-ad routing footprint for validation (trigger ∩ assigned channel). */
export function buildMetaAdRoutingFootprint(params: {
  nodes: unknown;
  assignedChannelType: string;
  companyId: number;
  flowId: number;
}): MetaAdRoutingFootprint {
  const config = deriveMetaAdRoutingTriggerConfigFromNodes(params.nodes);
  if (!config) {
    return { kind: 'none' };
  }

  if (Array.isArray(config.channelTypes) && config.channelTypes.length === 0) {
    return { kind: 'none' };
  }

  const effectiveChannelTypes = computeEffectiveMetaAdChannelScope(
    config.channelTypes ?? [...MESSAGE_TRIGGER_DEFAULT_CHANNEL_FALLBACK],
    params.assignedChannelType
  );
  if (effectiveChannelTypes.length === 0) {
    return { kind: 'none' };
  }

  return {
    kind: 'meta_ad',
    companyId: params.companyId,
    flowId: params.flowId,
    routingKeys: config.routingKeys,
    effectiveChannelTypes,
  };
}

export function formatMetaAdRoutingConflictMessage(
  routingKey: string,
  channelType: string
): string {
  return `Meta ad routing key "${routingKey}" is already active for channel type "${channelType}" by another active flow in this company`;
}

// ---------------------------------------------------------------------------
// Condition node — canonical editor/runtime persisted data contract
// ---------------------------------------------------------------------------

export const CONDITION_RULE_TREE_VERSION = 1;

export type ConditionCombinator = 'and' | 'or';

/** Stable category id for condition rule kinds (display/legacy compatibility; runtime uses field + operator). */
export type ConditionCategoryId =
  | 'message_contains'
  | 'exact_match'
  | 'regex_match'
  | 'message_starts_with'
  | 'message_ends_with'
  | 'has_media'
  | 'media_type'
  | 'time_based'
  | 'contact_attribute'
  | 'contact_custom_field'
  | 'deal_field'
  | 'deal_custom_field'
  | 'pipeline_state'
  | 'task_state'
  | 'erp_sales_order'
  | 'erp_invoice'
  | 'erp_payment'
  | 'runtime_variable'
  | 'message_metadata'
  | 'conversation_field'
  | 'assignment'
  | 'presence';

/**
 * Canonical condition field identifiers. Dynamic keys (custom fields, metadata paths,
 * variable paths) use stable rule options instead of per-company field explosion.
 */
export type ConditionFieldId =
  // Message content and metadata
  | 'message.text'
  | 'message.media'
  | 'message.mediaType'
  | 'message.type'
  | 'message.direction'
  | 'message.metadata'
  // Contact standard and custom fields
  | 'contact.id'
  | 'contact.name'
  | 'contact.phone'
  | 'contact.email'
  | 'contact.tags'
  | 'contact.assignedTo'
  | 'contact.identifier'
  | 'contact.customField'
  // Deal standard and custom fields
  | 'deal.id'
  | 'deal.title'
  | 'deal.value'
  | 'deal.status'
  | 'deal.stageId'
  | 'deal.pipelineId'
  | 'deal.assignedTo'
  | 'deal.customField'
  // Pipeline / stage state (prefer trigger context)
  | 'pipeline.currentPipelineId'
  | 'pipeline.previousPipelineId'
  | 'pipeline.currentStageId'
  | 'pipeline.previousStageId'
  | 'pipeline.pipelineChanged'
  | 'pipeline.stageChanged'
  // Task state
  | 'task.id'
  | 'task.status'
  | 'task.priority'
  | 'task.title'
  | 'task.exists'
  // ERP sales orders, invoices, payments
  | 'erp.salesOrderId'
  | 'erp.salesOrderStatus'
  | 'erp.salesOrderTotal'
  | 'erp.invoiceId'
  | 'erp.invoiceStatus'
  | 'erp.invoiceTotal'
  | 'erp.invoicePaymentMethod'
  | 'erp.invoicePaymentAmount'
  | 'erp.lastResponse'
  // Conversation
  | 'conversation.id'
  | 'conversation.status'
  | 'conversation.assignedTo'
  // Runtime / captured variables (options.variablePath or dotted field path)
  | 'variable'
  // Time-of-day
  | 'time'
  /** Generic dotted paths resolved via execution context (e.g. code.output, data_capture.email). */
  | (string & {});

/** Operator registry ids grouped by value family at runtime. */
export type ConditionOperatorId =
  // String
  | 'contains'
  | 'notContains'
  | 'exactMatch'
  | 'regexMatch'
  | 'startsWith'
  | 'endsWith'
  // Number
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'between'
  // Boolean
  | 'isTrue'
  | 'isFalse'
  // Array
  | 'containsItem'
  | 'containsAny'
  | 'containsAll'
  | 'lengthEquals'
  | 'lengthGreaterThan'
  | 'lengthLessThan'
  // Date / time
  | 'timeBefore'
  | 'timeAfter'
  | 'timeBetween'
  | 'before'
  | 'after'
  | 'overdue'
  // Presence
  | 'hasMedia'
  | 'exists'
  | 'missing'
  | 'empty'
  | 'notEmpty'
  // Metadata / nested path
  | 'pathExists'
  | 'pathEquals';

export interface ConditionRuleOptions {
  caseSensitive?: boolean;
  timeZone?: string;
  /** Custom field key for contact.customField / deal.customField rules. */
  customFieldKey?: string;
  /** Dot-path into parsed message.metadata (e.g. channel, pipelineTrigger.stageId). */
  metadataPath?: string;
  /** Explicit deal id for deal-field rules; falls back to active deal for contact. */
  dealId?: string | number;
  /** Explicit task id for task-field rules. */
  taskId?: string | number;
  /** Dotted variable path for runtime/captured variable rules. */
  variablePath?: string;
  /** Invoice rule scope: header fields vs payment-entry collection. */
  entityScope?: 'header' | 'payment';
  /** ERP sales order id override when not in context. */
  salesOrderId?: string | number;
  /** ERP invoice id override when not in context. */
  invoiceId?: string | number;
  [key: string]: unknown;
}

export interface ConditionRule {
  type: 'rule';
  id: string;
  category: ConditionCategoryId;
  field: ConditionFieldId;
  operator: ConditionOperatorId;
  value?: string;
  options?: ConditionRuleOptions;
}

export interface ConditionRuleGroup {
  type: 'group';
  id: string;
  combinator: ConditionCombinator;
  children: Array<ConditionRule | ConditionRuleGroup>;
}

/**
 * Canonical persisted shape for `NodeType.CONDITION` flow nodes.
 * Legacy mirror fields are written during the editor migration phase for backward compatibility.
 */
export interface ConditionNodeData {
  label?: string;
  conditionRuleTree?: ConditionRuleGroup;
  conditionRuleTreeVersion?: number;

  /** Legacy mirrors — written for backward compatibility; runtime evaluates conditionRuleTree. */
  condition?: string;
  conditionType?: string;
  conditionValue?: string;
  caseSensitive?: boolean;
  mediaType?: string;
  timeOperator?: string;
  timeValue?: string;
  timeZone?: string;
  timezone?: string;
  contactAttribute?: string;
  attributeValue?: string;

  [key: string]: unknown;
}

export interface ConditionEditorState {
  category: ConditionCategoryId;
  conditionValue: string;
  caseSensitive: boolean;
  mediaType: string;
  timeOperator: 'before' | 'after' | 'between';
  timeValue: string;
  timeZone: string;
  contactAttribute: 'name' | 'phone' | 'email' | 'tags';
  attributeValue: string;
}

const CONDITION_MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;

const LEGACY_CONDITION_TYPE_LABELS: Record<ConditionCategoryId, string> = {
  message_contains: 'Message Contains',
  exact_match: 'Exact Match',
  regex_match: 'Regex Match',
  message_starts_with: 'Message Starts With',
  message_ends_with: 'Message Ends With',
  has_media: 'Has Media',
  media_type: 'Media Type Is',
  time_based: 'Time Condition',
  contact_attribute: 'Contact Attribute',
  contact_custom_field: 'Contact Custom Field',
  deal_field: 'Deal Field',
  deal_custom_field: 'Deal Custom Field',
  pipeline_state: 'Pipeline State',
  task_state: 'Task State',
  erp_sales_order: 'ERP Sales Order',
  erp_invoice: 'ERP Invoice',
  erp_payment: 'ERP Payment',
  runtime_variable: 'Runtime Variable',
  message_metadata: 'Message Metadata',
  conversation_field: 'Conversation Field',
  assignment: 'Assignment',
  presence: 'Presence',
};

const CATEGORY_ALIAS_ENTRIES: Array<{ category: ConditionCategoryId; aliases: string[] }> = [
  { category: 'message_contains', aliases: ['message_contains', 'message contains', 'contains', 'contains word'] },
  { category: 'exact_match', aliases: ['exact_match', 'exact match', 'exact'] },
  { category: 'regex_match', aliases: ['regex_match', 'regex match', 'regex', 'regex pattern'] },
  { category: 'message_starts_with', aliases: ['message_starts_with', 'message starts with', 'starts with'] },
  { category: 'message_ends_with', aliases: ['message_ends_with', 'message ends with', 'ends with'] },
  { category: 'has_media', aliases: ['has_media', 'has media', 'media'] },
  { category: 'media_type', aliases: ['media_type', 'media type', 'media type is'] },
  { category: 'time_based', aliases: ['time_based', 'time condition', 'time'] },
  { category: 'contact_attribute', aliases: ['contact_attribute', 'contact attribute'] },
];

function escapeConditionQuotes(value: string): string {
  return value.replace(/'/g, "\\'");
}

function unescapeConditionQuotes(value: string): string {
  return value.replace(/\\'/g, "'");
}

function resolveCategoryAlias(raw: unknown): ConditionCategoryId | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  for (const entry of CATEGORY_ALIAS_ENTRIES) {
    if (entry.aliases.some((alias) => alias === normalized)) {
      return entry.category;
    }
  }
  return null;
}

function defaultConditionEditorState(): ConditionEditorState {
  return {
    category: 'message_contains',
    conditionValue: 'help',
    caseSensitive: false,
    mediaType: CONDITION_MEDIA_TYPES[0],
    timeOperator: 'after',
    timeValue: '',
    timeZone: 'UTC',
    contactAttribute: 'name',
    attributeValue: '',
  };
}

function categoryToField(category: ConditionCategoryId, contactAttribute?: string): ConditionFieldId {
  switch (category) {
    case 'message_contains':
    case 'exact_match':
    case 'regex_match':
    case 'message_starts_with':
    case 'message_ends_with':
      return 'message.text';
    case 'has_media':
      return 'message.media';
    case 'media_type':
      return 'message.mediaType';
    case 'time_based':
      return 'time';
    case 'contact_attribute': {
      const attr = contactAttribute || 'name';
      if (attr === 'phone') return 'contact.phone';
      if (attr === 'email') return 'contact.email';
      if (attr === 'tags') return 'contact.tags';
      return 'contact.name';
    }
    default:
      return 'message.text';
  }
}

function categoryToOperator(category: ConditionCategoryId, timeOperator?: string): ConditionOperatorId {
  switch (category) {
    case 'message_contains':
      return 'contains';
    case 'exact_match':
      return 'exactMatch';
    case 'regex_match':
      return 'regexMatch';
    case 'message_starts_with':
      return 'startsWith';
    case 'message_ends_with':
      return 'endsWith';
    case 'has_media':
      return 'hasMedia';
    case 'media_type':
      return 'equals';
    case 'time_based': {
      const op = (timeOperator || 'after').toLowerCase();
      if (op === 'before') return 'timeBefore';
      if (op === 'between') return 'timeBetween';
      return 'timeAfter';
    }
    case 'contact_attribute':
      return 'equals';
    default:
      return 'contains';
  }
}

function operatorToTimeOperator(operator: ConditionOperatorId): 'before' | 'after' | 'between' {
  if (operator === 'timeBefore') return 'before';
  if (operator === 'timeBetween') return 'between';
  return 'after';
}

function fieldToContactAttribute(field: ConditionFieldId): 'name' | 'phone' | 'email' | 'tags' {
  if (field === 'contact.phone') return 'phone';
  if (field === 'contact.email') return 'email';
  if (field === 'contact.tags') return 'tags';
  return 'name';
}

function buildConditionExpression(rule: ConditionRule): string {
  const value = rule.value ?? '';
  const caseSuffix = rule.options?.caseSensitive ? ', true' : '';
  const tz = rule.options?.timeZone || 'UTC';

  switch (rule.category) {
    case 'message_contains':
      return `Contains('${escapeConditionQuotes(value)}'${caseSuffix})`;
    case 'exact_match':
      return `ExactMatch('${escapeConditionQuotes(value)}'${caseSuffix})`;
    case 'regex_match':
      return `RegexMatch('${escapeConditionQuotes(value)}')`;
    case 'message_starts_with':
      return `StartsWith('${escapeConditionQuotes(value)}'${caseSuffix})`;
    case 'message_ends_with':
      return `EndsWith('${escapeConditionQuotes(value)}'${caseSuffix})`;
    case 'has_media':
      return 'HasMedia()';
    case 'media_type':
      return `MediaType('${escapeConditionQuotes(value)}')`;
    case 'time_based': {
      if (rule.operator === 'timeBefore') {
        return `TimeBefore('${escapeConditionQuotes(value)}', '${escapeConditionQuotes(tz)}')`;
      }
      if (rule.operator === 'timeBetween') {
        return `TimeBetween('${escapeConditionQuotes(value)}', '${escapeConditionQuotes(tz)}')`;
      }
      return `TimeAfter('${escapeConditionQuotes(value)}', '${escapeConditionQuotes(tz)}')`;
    }
    case 'contact_attribute': {
      const attr = fieldToContactAttribute(rule.field);
      return `Contact.${attr} == '${escapeConditionQuotes(value)}'`;
    }
    default:
      return `Contains('${escapeConditionQuotes(value)}')`;
  }
}

function parseConditionExpression(expr: string): ConditionRule | null {
  const trimmed = expr.trim();
  if (!trimmed) {
    return null;
  }

  let match = trimmed.match(/^Contains\('((?:\\'|[^'])*)'\s*(?:,\s*(true|false))?\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'message_contains',
      field: 'message.text',
      operator: 'contains',
      value: unescapeConditionQuotes(match[1]),
      options: { caseSensitive: match[2] === 'true' },
    };
  }

  match = trimmed.match(/^ExactMatch\('((?:\\'|[^'])*)'\s*(?:,\s*(true|false))?\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'exact_match',
      field: 'message.text',
      operator: 'exactMatch',
      value: unescapeConditionQuotes(match[1]),
      options: { caseSensitive: match[2] === 'true' },
    };
  }

  match = trimmed.match(/^RegexMatch\('((?:\\'|[^'])*)'\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'regex_match',
      field: 'message.text',
      operator: 'regexMatch',
      value: unescapeConditionQuotes(match[1]),
    };
  }

  match = trimmed.match(/^StartsWith\('((?:\\'|[^'])*)'\s*(?:,\s*(true|false))?\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'message_starts_with',
      field: 'message.text',
      operator: 'startsWith',
      value: unescapeConditionQuotes(match[1]),
      options: { caseSensitive: match[2] === 'true' },
    };
  }

  match = trimmed.match(/^EndsWith\('((?:\\'|[^'])*)'\s*(?:,\s*(true|false))?\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'message_ends_with',
      field: 'message.text',
      operator: 'endsWith',
      value: unescapeConditionQuotes(match[1]),
      options: { caseSensitive: match[2] === 'true' },
    };
  }

  if (/^HasMedia\(\)$/i.test(trimmed)) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'has_media',
      field: 'message.media',
      operator: 'hasMedia',
    };
  }

  match = trimmed.match(/^MediaType\('((?:\\'|[^'])*)'\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'media_type',
      field: 'message.mediaType',
      operator: 'equals',
      value: unescapeConditionQuotes(match[1]),
    };
  }

  match = trimmed.match(/^TimeBefore\('((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)'\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'time_based',
      field: 'time',
      operator: 'timeBefore',
      value: unescapeConditionQuotes(match[1]),
      options: { timeZone: unescapeConditionQuotes(match[2]) },
    };
  }

  match = trimmed.match(/^TimeAfter\('((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)'\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'time_based',
      field: 'time',
      operator: 'timeAfter',
      value: unescapeConditionQuotes(match[1]),
      options: { timeZone: unescapeConditionQuotes(match[2]) },
    };
  }

  match = trimmed.match(/^TimeBetween\('((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)'\)$/i);
  if (match) {
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'time_based',
      field: 'time',
      operator: 'timeBetween',
      value: unescapeConditionQuotes(match[1]),
      options: { timeZone: unescapeConditionQuotes(match[2]) },
    };
  }

  match = trimmed.match(/^Contact\.(\w+)\s*==\s*'((?:\\'|[^'])*)'$/i);
  if (match) {
    const attr = match[1].toLowerCase();
    const field: ConditionFieldId =
      attr === 'phone' ? 'contact.phone'
        : attr === 'email' ? 'contact.email'
          : attr === 'tags' ? 'contact.tags'
            : 'contact.name';
    return {
      type: 'rule',
      id: 'rule-1',
      category: 'contact_attribute',
      field,
      operator: 'equals',
      value: unescapeConditionQuotes(match[2]),
    };
  }

  return null;
}

function isValidConditionRuleGroup(tree: unknown): tree is ConditionRuleGroup {
  return !!(
    tree
    && typeof tree === 'object'
    && (tree as ConditionRuleGroup).type === 'group'
    && Array.isArray((tree as ConditionRuleGroup).children)
  );
}

function findFirstLeafRule(node: ConditionRule | ConditionRuleGroup): ConditionRule | null {
  if (node.type === 'rule') {
    return node;
  }
  for (const child of node.children) {
    const found = findFirstLeafRule(child);
    if (found) {
      return found;
    }
  }
  return null;
}

function normalizeConditionRuleNode(node: unknown): ConditionRule | ConditionRuleGroup | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if ((node as ConditionRule).type === 'rule') {
    const rule = node as ConditionRule;
    return {
      type: 'rule',
      id: rule.id || 'rule-1',
      category: rule.category,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      options: rule.options,
    };
  }

  if ((node as ConditionRuleGroup).type === 'group') {
    const group = node as ConditionRuleGroup;
    const children = group.children
      .map((child) => normalizeConditionRuleNode(child))
      .filter((child): child is ConditionRule | ConditionRuleGroup => child !== null);
    if (children.length === 0) {
      return null;
    }
    return {
      type: 'group',
      id: group.id || 'group-1',
      combinator: group.combinator === 'or' ? 'or' : 'and',
      children,
    };
  }

  return null;
}

/** Recursively normalizes a canonical rule tree while preserving nested structure. */
export function normalizeConditionRuleTree(tree: ConditionRuleGroup): ConditionRuleGroup | null {
  const normalized = normalizeConditionRuleNode(tree);
  return normalized && normalized.type === 'group' ? normalized : null;
}

/** Returns the first leaf rule in depth-first order (editor reads one representative rule). */
export function getPrimaryConditionRule(data: ConditionNodeData): ConditionRule | null {
  const tree = data.conditionRuleTree;
  if (!isValidConditionRuleGroup(tree) || tree.children.length === 0) {
    return null;
  }
  return findFirstLeafRule(tree);
}

/** Replaces only the first leaf rule in a tree, preserving combinator and sibling/group structure. */
export function mergePrimaryRuleIntoTree(
  tree: ConditionRuleGroup | undefined,
  rule: ConditionRule,
): ConditionRuleGroup {
  if (!isValidConditionRuleGroup(tree)) {
    return buildDefaultConditionRuleTree(rule);
  }

  let replaced = false;
  const replaceFirstLeaf = (
    node: ConditionRule | ConditionRuleGroup,
  ): ConditionRule | ConditionRuleGroup => {
    if (node.type === 'rule' && !replaced) {
      replaced = true;
      return { ...rule, id: node.id || rule.id };
    }
    if (node.type === 'group') {
      return {
        ...node,
        children: node.children.map(replaceFirstLeaf),
      };
    }
    return node;
  };

  return {
    type: 'group',
    id: tree.id || 'root',
    combinator: tree.combinator === 'or' ? 'or' : 'and',
    children: tree.children.map(replaceFirstLeaf),
  };
}

function hasUsableLegacyFieldBundle(data: Record<string, unknown>): boolean {
  return !!(
    (typeof data.conditionType === 'string' && data.conditionType.trim())
    || (typeof data.conditionValue === 'string' && data.conditionValue.length > 0)
    || data.caseSensitive === true
    || (typeof data.mediaType === 'string' && data.mediaType.trim())
    || (typeof data.timeOperator === 'string' && data.timeOperator.trim())
    || (typeof data.timeValue === 'string' && data.timeValue.length > 0)
    || (typeof data.timeZone === 'string' && data.timeZone.trim())
    || (typeof data.timezone === 'string' && data.timezone.trim())
    || (typeof data.contactAttribute === 'string' && data.contactAttribute.trim())
    || (typeof data.attributeValue === 'string' && data.attributeValue.length > 0)
  );
}

export function conditionEditorStateFromRule(
  rule: ConditionRule | null,
  defaults?: Partial<ConditionEditorState>,
): ConditionEditorState {
  const base = { ...defaultConditionEditorState(), ...defaults };
  if (!rule) {
    return base;
  }

  const state: ConditionEditorState = {
    ...base,
    category: rule.category,
  };

  switch (rule.category) {
    case 'message_contains':
    case 'exact_match':
    case 'regex_match':
    case 'message_starts_with':
    case 'message_ends_with':
      state.conditionValue = rule.value ?? '';
      state.caseSensitive = !!rule.options?.caseSensitive;
      break;
    case 'has_media':
      break;
    case 'media_type':
      state.mediaType = rule.value || CONDITION_MEDIA_TYPES[0];
      break;
    case 'time_based':
      state.timeOperator = operatorToTimeOperator(rule.operator);
      state.timeValue = rule.value ?? '';
      state.timeZone = String(rule.options?.timeZone || base.timeZone);
      break;
    case 'contact_attribute':
      state.contactAttribute = fieldToContactAttribute(rule.field);
      state.attributeValue = rule.value ?? '';
      break;
    default:
      break;
  }

  return state;
}

export function buildConditionRuleFromEditorState(state: ConditionEditorState, ruleId = 'rule-1'): ConditionRule {
  return {
    type: 'rule',
    id: ruleId,
    category: state.category,
    field: categoryToField(state.category, state.contactAttribute),
    operator: categoryToOperator(state.category, state.timeOperator),
    value: (() => {
      switch (state.category) {
        case 'message_contains':
        case 'exact_match':
        case 'regex_match':
        case 'message_starts_with':
        case 'message_ends_with':
          return state.conditionValue;
        case 'media_type':
          return state.mediaType;
        case 'time_based':
          return state.timeValue;
        case 'contact_attribute':
          return state.attributeValue;
        default:
          return undefined;
      }
    })(),
    options: (() => {
      const options: ConditionRuleOptions = {};
      if (
        state.category === 'message_contains'
        || state.category === 'exact_match'
        || state.category === 'message_starts_with'
        || state.category === 'message_ends_with'
      ) {
        options.caseSensitive = state.caseSensitive;
      }
      if (state.category === 'time_based') {
        options.timeZone = state.timeZone;
      }
      return Object.keys(options).length > 0 ? options : undefined;
    })(),
  };
}

/** Compact summary text derived from canonical editor state (English, matches legacy display). */
export function formatConditionSummary(state: ConditionEditorState): string {
  switch (state.category) {
    case 'message_contains':
      return `Message contains: "${state.conditionValue}"${state.caseSensitive ? ' (case sensitive)' : ''}`;
    case 'exact_match':
      return `Message exactly matches: "${state.conditionValue}"${state.caseSensitive ? ' (case sensitive)' : ''}`;
    case 'regex_match':
      return `Message matches regex: "${state.conditionValue}"`;
    case 'message_starts_with':
      return `Message starts with: "${state.conditionValue}"${state.caseSensitive ? ' (case sensitive)' : ''}`;
    case 'message_ends_with':
      return `Message ends with: "${state.conditionValue}"${state.caseSensitive ? ' (case sensitive)' : ''}`;
    case 'has_media':
      return 'Message has media attachment';
    case 'media_type':
      return `Media type is: ${state.mediaType}`;
    case 'time_based':
      return `Time is ${state.timeOperator}: ${state.timeValue} (${state.timeZone})`;
    case 'contact_attribute':
      return `Contact ${state.contactAttribute} is: "${state.attributeValue}"`;
    default:
      return `Contains('${state.conditionValue}')`;
  }
}

function buildRuleFromLegacyFieldBundle(data: Record<string, unknown>): ConditionRule {
  const defaults = defaultConditionEditorState();
  const category =
    resolveCategoryAlias(data.conditionType)
    || (data.contactAttribute ? 'contact_attribute' as const : null)
    || (data.timeOperator || data.timeValue ? 'time_based' as const : null)
    || (data.mediaType ? 'media_type' as const : null)
    || defaults.category;

  const state: ConditionEditorState = {
    category,
    conditionValue: String(data.conditionValue ?? defaults.conditionValue),
    caseSensitive: !!data.caseSensitive,
    mediaType: String(data.mediaType ?? defaults.mediaType),
    timeOperator: (['before', 'after', 'between'].includes(String(data.timeOperator))
      ? String(data.timeOperator)
      : defaults.timeOperator) as ConditionEditorState['timeOperator'],
    timeValue: String(data.timeValue ?? defaults.timeValue),
    timeZone: String(data.timeZone ?? data.timezone ?? defaults.timeZone),
    contactAttribute: (['name', 'phone', 'email', 'tags'].includes(String(data.contactAttribute))
      ? String(data.contactAttribute)
      : defaults.contactAttribute) as ConditionEditorState['contactAttribute'],
    attributeValue: String(data.attributeValue ?? defaults.attributeValue),
  };

  return buildConditionRuleFromEditorState(state);
}

function deriveConditionLegacyFields(rule: ConditionRule): Partial<ConditionNodeData> {
  const legacy: Partial<ConditionNodeData> = {
    condition: buildConditionExpression(rule),
    conditionType: LEGACY_CONDITION_TYPE_LABELS[rule.category],
  };

  switch (rule.category) {
    case 'message_contains':
    case 'exact_match':
    case 'regex_match':
    case 'message_starts_with':
    case 'message_ends_with':
      legacy.conditionValue = rule.value ?? '';
      legacy.caseSensitive = !!rule.options?.caseSensitive;
      break;
    case 'media_type':
      legacy.mediaType = rule.value || CONDITION_MEDIA_TYPES[0];
      break;
    case 'time_based':
      legacy.timeOperator = operatorToTimeOperator(rule.operator);
      legacy.timeValue = rule.value ?? '';
      legacy.timeZone = rule.options?.timeZone || 'UTC';
      break;
    case 'contact_attribute':
      legacy.contactAttribute = fieldToContactAttribute(rule.field);
      legacy.attributeValue = rule.value ?? '';
      break;
    default:
      break;
  }

  return legacy;
}

function buildDefaultConditionRuleTree(rule: ConditionRule): ConditionRuleGroup {
  return {
    type: 'group',
    id: 'root',
    combinator: 'and',
    children: [rule],
  };
}

/** Factory for newly added condition nodes (includes canonical tree and legacy mirrors). */
export function createDefaultConditionNodeData(): ConditionNodeData {
  const rule = buildConditionRuleFromEditorState(defaultConditionEditorState());
  const tree = buildDefaultConditionRuleTree(rule);
  return {
    conditionRuleTree: tree,
    conditionRuleTreeVersion: CONDITION_RULE_TREE_VERSION,
    ...deriveConditionLegacyFields(rule),
  };
}

/**
 * Idempotent normalizer for condition node payloads.
 * Precedence: canonical tree → legacy field bundle → raw expression → default single rule.
 */
export function normalizeConditionNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  let rule: ConditionRule | null = null;
  let tree: ConditionRuleGroup | null = null;

  if (isValidConditionRuleGroup(result.conditionRuleTree)) {
    tree = normalizeConditionRuleTree(result.conditionRuleTree as ConditionRuleGroup);
    if (tree) {
      rule = getPrimaryConditionRule({ conditionRuleTree: tree } as ConditionNodeData);
    }
  }

  if (!rule && hasUsableLegacyFieldBundle(result)) {
    rule = buildRuleFromLegacyFieldBundle(result);
  }

  if (!rule && typeof result.condition === 'string' && result.condition.trim()) {
    rule = parseConditionExpression(result.condition);
  }

  if (!rule) {
    rule = buildConditionRuleFromEditorState(defaultConditionEditorState());
  }

  if (!tree) {
    tree = buildDefaultConditionRuleTree({
      ...rule,
      id: rule.id || 'rule-1',
    });
  }

  result.conditionRuleTree = tree;
  result.conditionRuleTreeVersion = CONDITION_RULE_TREE_VERSION;

  const legacyRule = getPrimaryConditionRule({ conditionRuleTree: tree } as ConditionNodeData) ?? rule;
  const legacy = deriveConditionLegacyFields(legacyRule);
  Object.assign(result, legacy);

  delete result.timezone;

  return result;
}
