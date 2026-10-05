import {
  ERP_AI_FUNCTION_FAMILY,
  ERP_AI_FUNCTION_NAMES,
  ERP_INVOICE_PAYMENT_METHODS,
  ERP_SET_STATUS_TARGET_STATUSES,
} from '@shared/types/node-types';
import type { ErpBusinessType } from '@shared/erp-capabilities';

type FunctionDefinitionTier = 'pinned' | 'standard' | 'low';

export interface ErpAiFunctionDefinitionCandidate {
  definition: { name: string; description: string; parameters: Record<string, unknown> };
  name: string;
  family: string;
  tier: FunctionDefinitionTier;
}

const orderLineItemProperties = {
  productId: {
    type: 'number',
    description: 'Product ID from erp_search_products when known. Never invent IDs.',
  },
  productName: {
    type: 'string',
    description: 'Product name for lookup when productId is unknown.',
  },
  variantId: { type: 'number', description: 'Optional product variant ID.' },
  quantity: { type: 'number' },
  unitPrice: { type: 'string', description: 'Decimal amount as string (required for new lines).' },
  discountPercent: { type: 'string', description: 'Percent as string, default 0.' },
  discountType: {
    type: 'string',
    enum: ['percentage', 'fixed_amount'],
    description: 'Optional line discount mode; prefers discountValue when set.',
  },
  discountValue: { type: 'string', description: 'Decimal discount as string (% or currency amount depending on discountType).' },
  taxRate: { type: 'string', description: 'Percent as string, default 0.' },
  specialInstructions: {
    type: 'string',
    description:
      "Per-line preparation/handling notes from the customer (e.g. 'no onions', 'gift wrap', 'rush delivery'). Capture verbatim from the conversation when the customer specifies anything about how this specific item should be prepared, packed, delivered, customised, or any allergy/dietary remark.",
  },
};

const shippingAddressProperties = {
  name: { type: 'string' },
  line1: { type: 'string' },
  line2: { type: 'string' },
  city: { type: 'string' },
  state: { type: 'string' },
  postalCode: { type: 'string' },
  country: { type: 'string' },
  phone: { type: 'string' },
};

const shippingAddressDescription =
  "Customer delivery address — populate this whenever the customer provides an address for a delivery order. The same data appears in the Sales Orders 'Delivery address' column. Leave the parameter out for pickup/dine-in or when the customer did not share an address.";

const invoiceLineProperties = {
  productId: { type: 'number' },
  productName: { type: 'string' },
  description: { type: 'string' },
  quantity: { type: 'number' },
  unitPrice: { type: 'string' },
  discountPercent: { type: 'string' },
  discountType: { type: 'string', enum: ['percentage', 'fixed_amount'] },
  discountValue: { type: 'string' },
  taxRate: { type: 'string' },
};

function erpToolDef(
  name: (typeof ERP_AI_FUNCTION_NAMES)[number],
  description: string,
  parameters: Record<string, unknown>
): ErpAiFunctionDefinitionCandidate {
  return {
    definition: { name, description, parameters },
    name,
    family: ERP_AI_FUNCTION_FAMILY,
    tier: 'pinned',
  };
}

/** Static provider-neutral function schemas for AI Assistant ERP mode. contactId/companyId are injected server-side. */
export function buildErpAiFunctionDefinitionCandidates(
  businessType: ErpBusinessType = 'standard',
  catalogPriceSharingEnabled = true
): ErpAiFunctionDefinitionCandidate[] {
  const effectiveOrderLineItemProperties = {
    ...orderLineItemProperties,
    unitPrice: catalogPriceSharingEnabled
      ? orderLineItemProperties.unitPrice
      : {
          type: 'string',
          description: 'Omit this field. The server resolves the stored catalog price without exposing it.',
        },
  };
  const effectiveInvoiceLineProperties = {
    ...invoiceLineProperties,
    unitPrice: catalogPriceSharingEnabled
      ? invoiceLineProperties.unitPrice
      : {
          type: 'string',
          description: 'Omit this field for catalog products. The server resolves the stored catalog price.',
        },
  };
  const shared = [
    erpToolDef('erp_search_products', 'Search active products by name/SKU for this company. When the user asks for the menu, catalog, or available products without naming an item, omit query or pass an empty string to list active menu items. For booking flows, search with type=service and select a service product before checking availability.', {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search text (name, SKU, or keywords). Leave empty to list active menu items.' },
        type: { type: 'string', enum: ['physical', 'service', 'digital'], description: 'Optional product type filter. Use service for appointment booking services.' },
        limit: { type: 'number', description: 'Max results (default 20, max 50).' },
      },
      required: [],
    }),
    erpToolDef(
      'erp_send_product_image',
      'Send all uploaded photos for a product to the customer as native channel media (album when supported, otherwise sequential images). Call this whenever the customer asks to see a product photo, picture, or image in any language. The system attaches the actual images automatically — never write image URLs, file paths, or markdown image syntax in your reply.',
      {
        type: 'object',
        properties: {
          productId: {
            type: 'number',
            description: 'Product ID from erp_search_products or pinned ERP context. Never invent IDs.',
          },
          productName: {
            type: 'string',
            description: 'Product name for lookup when productId is unknown.',
          },
        },
        required: [],
      }
    ),
    erpToolDef(
      'erp_list_my_orders',
      'List sales orders for the current conversation contact. Use before referencing order IDs.',
      {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Optional status filter (e.g. draft, confirmed).' },
          limit: { type: 'number', description: 'Max orders (default 20).' },
        },
        required: [],
      }
    ),
    erpToolDef('erp_get_order', 'Load one sales order with line items by ID (must belong to this contact).', {
      type: 'object',
      properties: {
        salesOrderId: { type: 'number' },
      },
      required: ['salesOrderId'],
    }),
    erpToolDef(
      'erp_create_order',
      "Create a draft or quotation sales order for the current contact. Use erp_search_products first when product IDs are unknown. Customer preferences must appear both in order-level `notes` (for the Sales Orders list and header) and in `items[].specialInstructions` when they apply only to a specific line—line specials are also merged into order-level notes automatically for Sales Orders visibility. When the customer mentions a delivery address (street, neighbourhood, city, landmark, phone for the rider, etc.), capture it into `shippingAddress` — don't dump it into `notes`.",
      {
        type: 'object',
        properties: {
          notes: {
            type: 'string',
            description:
              'Order-level notes the customer mentions about the whole order (delivery instructions, address remarks, preferred time, gift message, internal references, allergies, etc.). Always populate from the conversation when the customer provides such information; leave empty only if they truly said nothing of the sort. These notes show in Sales Orders together with any line `specialInstructions`.',
          },
          shippingAddress: {
            type: 'object',
            properties: shippingAddressProperties,
            additionalProperties: false,
            description: shippingAddressDescription,
          },
          orderStatus: { type: 'string', enum: ['draft', 'quotation'], description: 'Default draft.' },
          ...(businessType === 'restaurant' ? {
            serviceType: { type: 'string', enum: ['dine_in', 'takeaway', 'delivery'], description: 'Restaurant service mode.' },
            tableId: { type: 'number', description: 'Optional Restaurant table ID for dine-in.' },
            reservationId: { type: 'number', description: 'Optional Restaurant reservation linked to this order.' },
            guestCount: { type: 'number', description: 'Optional dine-in party size.' },
          } : {}),
          items: {
            type: 'array',
            description: 'Line items; first item becomes initial line, rest added via add_line_item.',
            items: { type: 'object', properties: effectiveOrderLineItemProperties, additionalProperties: false },
          },
        },
        required: [],
      }
    ),
    erpToolDef(
      'erp_add_order_item',
      'Add a line item to an existing editable order for this contact. When the customer gives preparation, packing, customization, delivery, or dietary remarks for that specific line, put them in `specialInstructions` and rely on the system to mirror them into order-level notes for Sales Orders visibility when they are not already present.',
      {
        type: 'object',
        properties: {
          salesOrderId: { type: 'number' },
          ...effectiveOrderLineItemProperties,
        },
        required: ['salesOrderId'],
      }
    ),
    erpToolDef(
      'erp_update_order',
      "Update order header fields when the order is editable. Use `notes` for preferences that apply to the whole order or that should appear in the Sales Orders list; use `specialInstructions` on line tools only when a remark applies to a specific product line. When the customer mentions a delivery address (street, neighbourhood, city, landmark, phone for the rider, etc.), capture it into `shippingAddress` — don't dump it into `notes`. Supplied `shippingAddress` fields are merged with the currently stored delivery address.",
      {
        type: 'object',
        properties: {
          salesOrderId: { type: 'number' },
          notes: {
            type: 'string',
            description:
              'Order-level notes the customer mentions about the whole order (delivery instructions, address remarks, preferred time, gift message, internal references, allergies, etc.). Always populate from the conversation when the customer provides such information; leave empty only if they truly said nothing of the sort. This field drives the Sales Orders Notes column.',
          },
          validUntil: { type: 'string', description: 'ISO date string' },
          assignedToUserId: { type: 'number' },
          shippingAddress: {
            type: 'object',
            properties: shippingAddressProperties,
            additionalProperties: false,
            description: shippingAddressDescription,
          },
          ...(businessType === 'restaurant' ? {
            serviceType: { type: 'string', enum: ['dine_in', 'takeaway', 'delivery'], description: 'Restaurant service mode.' },
            tableId: { type: 'number', description: 'Optional Restaurant table ID for dine-in.' },
            reservationId: { type: 'number', description: 'Optional Restaurant reservation linked to this order.' },
            guestCount: { type: 'number', description: 'Optional dine-in party size.' },
          } : {}),
        },
        required: ['salesOrderId'],
      }
    ),
    erpToolDef('erp_confirm_order', 'Confirm a sales order (requires at least one line).', {
      type: 'object',
      properties: { salesOrderId: { type: 'number' } },
      required: ['salesOrderId'],
    }),
    erpToolDef(
      'erp_set_order_status',
      'Transition sales order status (e.g. to processing, shipped). Confirm with the user before destructive changes.',
      {
        type: 'object',
        properties: {
          salesOrderId: { type: 'number' },
          targetStatus: {
            type: 'string',
            enum: [...ERP_SET_STATUS_TARGET_STATUSES],
            description: 'Next workflow status.',
          },
        },
        required: ['salesOrderId', 'targetStatus'],
      }
    ),
    erpToolDef(
      'erp_cancel_order',
      'Cancel a sales order for this contact. Confirm with the user first. Requires a clear reason string.',
      {
        type: 'object',
        properties: {
          salesOrderId: { type: 'number' },
          reason: { type: 'string', description: 'Why the order is being cancelled.' },
        },
        required: ['salesOrderId', 'reason'],
      }
    ),
    erpToolDef(
      'erp_generate_invoice_from_order',
      'Generate an invoice from a confirmed sales order linked to this contact.',
      {
        type: 'object',
        properties: { salesOrderId: { type: 'number' } },
        required: ['salesOrderId'],
      }
    ),
    erpToolDef(
      'erp_create_invoice',
      'Create a draft invoice for the current contact. Prefer line items with productId or description + unitPrice.',
      {
        type: 'object',
        properties: {
          notes: { type: 'string' },
          invoiceType: { type: 'string', description: 'Default sales_invoice.' },
          issueDate: { type: 'string' },
          dueDate: { type: 'string' },
          subtotal: { type: 'string' },
          taxAmount: { type: 'string' },
          discountAmount: { type: 'string' },
          discountType: { type: 'string', enum: ['none', 'percentage', 'fixed_amount'] },
          discountValue: { type: 'string' },
          tipAmount: { type: 'string' },
          lines: {
            type: 'array',
            items: { type: 'object', properties: effectiveInvoiceLineProperties, additionalProperties: false },
          },
          salesOrderId: { type: 'number', description: 'Optional link to sales order.' },
        },
        required: [],
      }
    ),
    erpToolDef('erp_send_invoice', 'Mark an invoice as sent in the ERP workflow (must belong to this contact).', {
      type: 'object',
      properties: { invoiceId: { type: 'number' } },
      required: ['invoiceId'],
    }),
    erpToolDef(
      'erp_record_invoice_payment',
      'Record a payment on an invoice for this contact.',
      {
        type: 'object',
        properties: {
          invoiceId: { type: 'number' },
          paymentAmount: { type: 'number' },
          paymentMethod: {
            type: 'string',
            enum: [...ERP_INVOICE_PAYMENT_METHODS],
            description: 'Payment method code.',
          },
          paymentReferenceNumber: { type: 'string' },
          paymentNotes: { type: 'string' },
        },
        required: ['invoiceId', 'paymentAmount'],
      }
    ),
    erpToolDef(
      'erp_void_invoice',
      'Void an invoice. Confirm with the user. Requires a reason string.',
      {
        type: 'object',
        properties: {
          invoiceId: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['invoiceId', 'reason'],
      }
    ),
    erpToolDef(
      'erp_cancel_invoice',
      'Cancel an invoice. Confirm with the user. Requires a reason string.',
      {
        type: 'object',
        properties: {
          invoiceId: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['invoiceId', 'reason'],
      }
    ),
    erpToolDef('erp_get_invoice', 'Load invoice details, lines, and payments (must belong to this contact).', {
      type: 'object',
      properties: { invoiceId: { type: 'number' } },
      required: ['invoiceId'],
    }),
    erpToolDef(
      'erp_send_order_confirmation',
      'Send an order confirmation message to the customer on this channel. Uses default template from flow when message not given.',
      {
        type: 'object',
        properties: {
          salesOrderId: { type: 'number' },
          messageTemplate: { type: 'string', description: 'Overrides flow default when set.' },
          includePdfLink: { type: 'boolean' },
        },
        required: ['salesOrderId'],
      }
    ),
    erpToolDef(
      'erp_send_invoice_to_customer',
      'Send invoice message to the customer on this channel. When includePdfLink is true, attaches the invoice as a PDF on WhatsApp/Telegram/Email/Messenger/WebChat when supported; otherwise sends the invoice link in the message body.',
      {
        type: 'object',
        properties: {
          invoiceId: { type: 'number' },
          messageTemplate: { type: 'string' },
          includePdfLink: { type: 'boolean' },
        },
        required: ['invoiceId'],
      }
    ),
  ];
  if (businessType === 'restaurant') {
    const reservationIdentity = { reservationId: { type: 'number', description: 'Reservation ID belonging to the current contact.' } };
    return [...shared,
      erpToolDef('erp_restaurant_check_table_availability', 'Find active reservable tables with enough capacity and no overlapping reservation.', { type: 'object', properties: { reservationAt: { type: 'string', description: 'ISO date/time.' }, expectedDurationMinutes: { type: 'number', default: 90 }, guestCount: { type: 'number', default: 1 } }, required: ['reservationAt', 'guestCount'] }),
      erpToolDef('erp_restaurant_list_my_reservations', 'List reservations belonging to the current conversation contact.', { type: 'object', properties: {}, required: [] }),
      erpToolDef('erp_restaurant_get_reservation', 'Get one reservation belonging to the current contact.', { type: 'object', properties: reservationIdentity, required: ['reservationId'] }),
      erpToolDef('erp_restaurant_create_reservation', 'Create a conflict-safe restaurant reservation for the current contact. Omit tableId to auto-select a suitable table.', { type: 'object', properties: { reservationAt: { type: 'string' }, expectedDurationMinutes: { type: 'number', default: 90 }, guestCount: { type: 'number' }, tableId: { type: 'number' }, notes: { type: 'string' } }, required: ['reservationAt', 'guestCount'] }),
      erpToolDef('erp_restaurant_update_reservation', 'Reschedule or update a reservation belonging to the current contact, rejecting table/time conflicts.', { type: 'object', properties: { ...reservationIdentity, reservationAt: { type: 'string' }, expectedDurationMinutes: { type: 'number' }, guestCount: { type: 'number' }, tableId: { type: 'number' }, notes: { type: 'string' } }, required: ['reservationId'] }),
      erpToolDef('erp_restaurant_cancel_reservation', 'Cancel a reservation belonging to the current contact. Confirm with the user first and provide a reason.', { type: 'object', properties: { ...reservationIdentity, reason: { type: 'string' } }, required: ['reservationId', 'reason'] }),
      erpToolDef('erp_restaurant_get_waitlist_status', 'List active waitlist entries belonging to the current contact.', { type: 'object', properties: {}, required: [] }),
      erpToolDef('erp_restaurant_join_waitlist', 'Join the restaurant waitlist for the current contact.', { type: 'object', properties: { guestCount: { type: 'number' }, quotedWaitMinutes: { type: 'number' }, tableId: { type: 'number' }, notes: { type: 'string' } }, required: ['guestCount'] }),
      erpToolDef('erp_restaurant_update_waitlist', 'Update a waitlist entry belonging to the current contact.', { type: 'object', properties: { waitlistEntryId: { type: 'number' }, guestCount: { type: 'number' }, quotedWaitMinutes: { type: 'number' }, notes: { type: 'string' } }, required: ['waitlistEntryId'] }),
      erpToolDef('erp_restaurant_leave_waitlist', 'Mark a current-contact waitlist entry as left. Confirm with the user first and provide a reason.', { type: 'object', properties: { waitlistEntryId: { type: 'number' }, reason: { type: 'string' } }, required: ['waitlistEntryId', 'reason'] }),
      erpToolDef('erp_restaurant_get_delivery_status', 'Get customer-safe delivery status for a dispatch linked to the current contact.', { type: 'object', properties: { deliveryDispatchId: { type: 'number' } }, required: ['deliveryDispatchId'] }),
    ];
  }
  if (businessType === 'dental') {
    const planIdentity = { treatmentPlanId: { type: 'number', description: 'Treatment-plan ID belonging to the current patient.' } };
    return [...shared,
      erpToolDef('erp_dental_get_my_patient_status', 'Check whether the current contact is a dental patient and return only non-clinical identity/configuration fields.', { type: 'object', properties: {}, required: [] }),
      erpToolDef('erp_dental_list_my_treatment_plans', 'List treatment plans belonging to the current conversation contact.', { type: 'object', properties: {}, required: [] }),
      erpToolDef('erp_dental_get_treatment_plan', 'Get a treatment plan belonging to the current contact. Does not return clinical notes, documents, or odontograms.', { type: 'object', properties: planIdentity, required: ['treatmentPlanId'] }),
      erpToolDef('erp_dental_get_treatment_plan_billing_status', 'Get treatment-plan, quotation, invoice, and balance status for the current contact.', { type: 'object', properties: planIdentity, required: ['treatmentPlanId'] }),
      erpToolDef('erp_dental_request_treatment_plan_approval', 'Create a staff review task for the current contact’s requested treatment-plan approval or rejection. This never finalizes the decision.', { type: 'object', properties: { ...planIdentity, decision: { type: 'string', enum: ['approved', 'rejected'] }, notes: { type: 'string' } }, required: ['treatmentPlanId', 'decision'] }),
    ];
  }
  return shared;
}
