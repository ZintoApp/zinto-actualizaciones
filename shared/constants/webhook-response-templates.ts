import type { ResponseConfig } from '../types/webhook-trigger';
import { ResponseMode } from '../types/webhook-trigger';

export interface WebhookResponseTemplate {
  id: string;
  name: string;
  description: string;
  config: Partial<ResponseConfig>;
}

export interface WebhookSamplePayload {
  id: string;
  name: string;
  description: string;
  platform: string;
  eventType: string;
  payload: object;
}

export const WEBHOOK_SAMPLE_PAYLOADS: WebhookSamplePayload[] = [
  {
    id: 'shopify-order-created',
    name: 'Shopify Order Created',
    description: 'Order created webhook from Shopify',
    platform: 'Shopify',
    eventType: 'orders/create',
    payload: {
      id: 5123456789,
      order_number: 1001,
      email: 'customer@example.com',
      created_at: '2026-01-15T10:30:00Z',
      financial_status: 'pending',
      fulfillment_status: null,
      total_price: '99.99',
      currency: 'USD',
      customer: {
        id: 6012345678,
        email: 'customer@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '+15551234567'
      },
      line_items: [
        { id: 101, title: 'Sample Product', quantity: 2, price: '49.99' }
      ]
    }
  },
  {
    id: 'shopify-order-updated',
    name: 'Shopify Order Updated',
    description: 'Order updated webhook from Shopify',
    platform: 'Shopify',
    eventType: 'orders/updated',
    payload: {
      id: 5123456789,
      order_number: 1001,
      email: 'customer@example.com',
      updated_at: '2026-01-15T11:00:00Z',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '99.99',
      customer: {
        id: 6012345678,
        email: 'customer@example.com',
        first_name: 'Jane',
        last_name: 'Doe'
      }
    }
  },
  {
    id: 'shopify-order-paid',
    name: 'Shopify Order Paid',
    description: 'Order paid webhook from Shopify',
    platform: 'Shopify',
    eventType: 'orders/paid',
    payload: {
      id: 5123456790,
      order_number: 1002,
      financial_status: 'paid',
      total_price: '149.50',
      customer: { email: 'buyer@example.com', first_name: 'John', last_name: 'Smith' }
    }
  },
  {
    id: 'stripe-payment-succeeded',
    name: 'Stripe Payment Succeeded',
    description: 'Payment intent succeeded from Stripe',
    platform: 'Stripe',
    eventType: 'payment_intent.succeeded',
    payload: {
      id: 'evt_1ABC123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_3ABC123',
          amount: 9999,
          currency: 'usd',
          status: 'succeeded',
          metadata: { order_id: 'ord_123' }
        }
      }
    }
  },
  {
    id: 'stripe-payment-failed',
    name: 'Stripe Payment Failed',
    description: 'Payment intent failed from Stripe',
    platform: 'Stripe',
    eventType: 'payment_intent.payment_failed',
    payload: {
      id: 'evt_1ABC456',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_3ABC456',
          amount: 5000,
          currency: 'usd',
          status: 'requires_payment_method',
          last_payment_error: { message: 'Your card was declined.' }
        }
      }
    }
  },
  {
    id: 'stripe-charge-succeeded',
    name: 'Stripe Charge Succeeded',
    description: 'Charge succeeded from Stripe',
    platform: 'Stripe',
    eventType: 'charge.succeeded',
    payload: {
      id: 'evt_1ABC789',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_3ABC789',
          amount: 2500,
          currency: 'usd',
          paid: true,
          receipt_email: 'customer@example.com'
        }
      }
    }
  },
  {
    id: 'generic-rest',
    name: 'Generic REST API',
    description: 'Generic webhook with common fields',
    platform: 'Generic REST',
    eventType: 'event.created',
    payload: {
      id: 'ev_abc123',
      timestamp: new Date().toISOString(),
      event: 'event.created',
      data: {
        entity_id: 'ent_456',
        entity_type: 'order',
        status: 'created',
        metadata: {}
      }
    }
  },
  {
    id: 'custom-backend',
    name: 'Custom Backend',
    description: 'Customizable payload for testing your backend',
    platform: 'Custom Backend',
    eventType: 'custom',
    payload: {
      event_type: 'order.created',
      payload_id: 'pl_xyz',
      created_at: new Date().toISOString(),
      customer: { email: 'test@example.com', name: 'Test User', phone: '+15550000000' },
      custom_field_1: '',
      custom_field_2: ''
    }
  },
  {
    id: 'mastershop-order-created',
    name: 'Mastershop Pedido Creado',
    description: 'New order webhook from Mastershop',
    platform: 'Mastershop',
    eventType: 'order_created',
    payload: {
      id_order: 512345,
      id_user: 1001,
      id_business: 2001,
      id_status: 1,
      confirmation_status_name: 'Por Confirmar',
      is_test: true,
      origin_address: { city: 'Bogotá', country: 'CO' },
      shipping_address: { city: 'Medellín', country: 'CO' },
      billing_address: { city: 'Medellín', country: 'CO' },
      package: { weight: 1.2, units: 1 },
      order_transaction: { payment_method: 'cod', total: 150000, currency: 'COP' },
      order_logistics: {
        carrier_name: 'Coordinadora',
        url_tracking: 'https://tracking.example.com/MS-12345',
        carrier_tracking_code: 'MS-12345',
      },
      date_created_order: '2026-01-15T10:30:00Z',
      date_update_order: '2026-01-15T10:30:00Z',
      order_items: [{ id_product: 501, name: 'Sample Product', quantity: 1, price: 150000 }],
      customer: {
        full_name: 'Abid Shafi',
        email: 'admin@pointer.pk',
        phone: '+923059002132',
      },
    },
  },
  {
    id: 'mastershop-order-delivered',
    name: 'Mastershop Pedido Entregado',
    description: 'Delivered order webhook from Mastershop',
    platform: 'Mastershop',
    eventType: 'order_delivered',
    payload: {
      id_order: 512346,
      id_user: 1001,
      id_business: 2001,
      id_status: 8,
      confirmation_status_name: 'Entregada',
      is_test: false,
      order_transaction: { payment_method: 'cod', total: 99000, currency: 'COP' },
      order_logistics: {
        carrier_name: 'Coordinadora',
        url_tracking: 'https://tracking.example.com/MS-99999',
        carrier_tracking_code: 'MS-99999',
      },
      customer: {
        full_name: 'Arturo',
        email: 'john@example.com',
        phone: '+57 319 4111223',
      },
      date_created_order: '2026-01-10T08:00:00Z',
      date_update_order: '2026-01-15T14:00:00Z',
      order_items: [],
    },
  },
  {
    id: 'mastershop-order-out-for-delivery',
    name: 'Mastershop Pedido En Reparto',
    description: 'Out for delivery with carrier_status_info',
    platform: 'Mastershop',
    eventType: 'order_out_for_delivery',
    payload: {
      id_order: 512347,
      id_status: 6,
      confirmation_status_name: 'En Tránsito',
      order_transaction: { payment_method: 'cod' },
      order_logistics: { carrier_name: 'Servientrega', url_tracking: 'https://t.example/1' },
      carrier_status_info: { carrier_status: 'En reparto', carrier_status_code: 'OUT_FOR_DELIVERY' },
      customer: { full_name: 'Ana López', email: 'ana@example.com', phone: '+573001112233' },
    },
  },
  {
    id: 'mastershop-order-at-office',
    name: 'Mastershop Pedido En Oficina',
    description: 'At carrier office with carrier_status_info',
    platform: 'Mastershop',
    eventType: 'order_at_office',
    payload: {
      id_order: 512348,
      id_status: 6,
      confirmation_status_name: 'En Tránsito',
      order_transaction: { payment_method: 'transfer' },
      carrier_status_info: { carrier_status: 'En oficina', carrier_status_code: 'AT_OFFICE' },
      customer: { full_name: 'Carlos Ruiz', email: 'carlos@example.com', phone: '+573004445566' },
    },
  },
  {
    id: 'mastershop-order-novelty',
    name: 'Mastershop Pedido con Novedad',
    description: 'Carrier novelty reported',
    platform: 'Mastershop',
    eventType: 'order_with_novelty',
    payload: {
      id_order: 512349,
      id_status: 6,
      confirmation_status_name: 'En Tránsito',
      carrier_novelty: { description: 'Dirección incorrecta', code: 'BAD_ADDRESS' },
      customer: { full_name: 'María Gómez', email: 'maria@example.com', phone: '+573007778899' },
    },
  },
  {
    id: 'mastershop-order-cod',
    name: 'Mastershop Contra Entrega',
    description: 'COD payment method variant',
    platform: 'Mastershop',
    eventType: 'order_cod_status',
    payload: {
      id_order: 512350,
      id_status: 3,
      confirmation_status_name: 'Por Alistar',
      order_transaction: { payment_method: 'cod', total: 89000, currency: 'COP' },
      order_logistics: { carrier_name: 'Servientrega', url_tracking: 'https://t.example/cod' },
      customer: { full_name: 'Pedro COD', email: 'pedro@example.com', phone: '+573001110000' },
    },
  },
  {
    id: 'mastershop-order-prepaid',
    name: 'Mastershop Pago Anticipado',
    description: 'Prepaid / transfer payment method variant',
    platform: 'Mastershop',
    eventType: 'order_prepaid_status',
    payload: {
      id_order: 512351,
      id_status: 3,
      confirmation_status_name: 'Por Alistar',
      order_transaction: { payment_method: 'transfer', total: 120000, currency: 'COP' },
      order_logistics: { carrier_name: 'Interrapidisimo', url_tracking: 'https://t.example/pa' },
      customer: { full_name: 'Laura Prepaid', email: 'laura@example.com', phone: '+573002220000' },
    },
  },
];

export const WEBHOOK_RESPONSE_TEMPLATES: WebhookResponseTemplate[] = [
  {
    id: 'shopify-order',
    name: 'Shopify Order Confirmation',
    description: 'For Shopify order webhooks',
    config: {
      statusCode: 200,
      bodyTemplate: JSON.stringify({
        order_id: '{{webhook.payload.order.id}}',
        status: 'processing',
        customer: '{{webhook.payload.customer.email}}'
      }, null, 2),
      headers: { 'Content-Type': 'application/json' },
      mode: ResponseMode.ASYNC
    }
  },
  {
    id: 'generic-success',
    name: 'Generic Success',
    description: 'Simple success with request ID and timestamp',
    config: {
      statusCode: 200,
      bodyTemplate: '{"success": true, "requestId": "{{webhook.requestId}}", "timestamp": "{{current.timestamp}}"}',
      headers: { 'Content-Type': 'application/json' },
      mode: ResponseMode.ASYNC
    }
  },
  {
    id: 'stripe-webhook',
    name: 'Stripe Webhook',
    description: 'For Stripe event webhooks',
    config: {
      statusCode: 200,
      bodyTemplate: '{"received": true, "event_id": "{{webhook.payload.id}}", "type": "{{webhook.payload.type}}"}',
      headers: { 'Content-Type': 'application/json' },
      mode: ResponseMode.ASYNC
    }
  },
  {
    id: 'xml-response',
    name: 'XML Response',
    description: 'XML format response',
    config: {
      statusCode: 200,
      bodyTemplate: '<?xml version="1.0"?>\n<response>\n  <status>success</status>\n  <requestId>{{webhook.requestId}}</requestId>\n</response>',
      headers: { 'Content-Type': 'application/xml' },
      mode: ResponseMode.ASYNC
    }
  },
  {
    id: 'plain-text',
    name: 'Plain Text',
    description: 'Simple plain text acknowledgment',
    config: {
      statusCode: 200,
      bodyTemplate: 'Webhook received. Request ID: {{webhook.requestId}}. Flow executed successfully.',
      headers: { 'Content-Type': 'text/plain' },
      mode: ResponseMode.ASYNC
    }
  },
  {
    id: 'mastershop-order-ack',
    name: 'Mastershop Order Acknowledgment',
    description: 'Acknowledge Mastershop order webhooks with mapped variables',
    config: {
      statusCode: 200,
      bodyTemplate: JSON.stringify(
        {
          success: true,
          requestId: '{{webhook.requestId}}',
          orderId: '{{mastershop.webhook.idOrder}}',
          status: '{{mastershop.webhook.idStatus}}',
          statusName: '{{mastershop.webhook.statusName}}',
          customerPhone: '{{mastershop.webhook.customerPhone}}',
        },
        null,
        2
      ),
      headers: { 'Content-Type': 'application/json' },
      mode: ResponseMode.ASYNC,
    },
  },
];
