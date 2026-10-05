/**
 * Sample payload generator for webhook testing.
 * Supports Shopify, Stripe, Generic REST, Custom Backend, and CRM-style payloads.
 */

export type SamplePayloadPlatform =
  | 'Shopify'
  | 'Stripe'
  | 'Generic REST'
  | 'Custom Backend'
  | 'CRM'
  | 'Mastershop';

export interface SamplePayloadTemplate {
  platform: SamplePayloadPlatform;
  eventType: string;
  name: string;
  generate: () => object;
}

const now = () => new Date().toISOString();
const randomId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

function baseMastershopOrderPayload(overrides: Record<string, unknown> = {}): object {
  return {
    id_order: Math.floor(Math.random() * 900000) + 100000,
    id_user: 1001,
    id_business: 2001,
    id_status: 1,
    confirmation_status_name: 'Por Confirmar',
    is_test: true,
    origin_address: { city: 'Bogotá', country: 'CO' },
    shipping_address: { city: 'Medellín', country: 'CO', address: 'Calle 10 #20-30' },
    billing_address: { city: 'Medellín', country: 'CO' },
    package: { weight: 1.2, units: 1 },
    order_transaction: { payment_method: 'cod', total: 150000, currency: 'COP' },
    order_logistics: {
      carrier_name: 'Coordinadora',
      url_tracking: 'https://tracking.example.com/MS-12345',
      carrier_tracking_code: 'MS-12345',
    },
    date_created_order: now(),
    date_update_order: now(),
    order_items: [{ id_product: 501, name: 'Sample Product', quantity: 1, price: 150000 }],
    customer: {
      full_name: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '+573001234567',
    },
    carrier_status_info: {
      carrier_status: 'En tránsito',
      carrier_status_code: 'IN_TRANSIT',
    },
    carrier_novelty: {
      description: 'Cliente no disponible',
      code: 'NO_AVAIL',
    },
    ...overrides,
  };
}

export const SAMPLE_PAYLOAD_TEMPLATES: SamplePayloadTemplate[] = [
  {
    platform: 'Shopify',
    eventType: 'orders/create',
    name: 'Order Created',
    generate: () => ({
      id: Math.floor(Math.random() * 9000000000) + 1000000000,
      order_number: Math.floor(Math.random() * 9000) + 1000,
      email: 'customer@example.com',
      created_at: now(),
      financial_status: 'pending',
      fulfillment_status: null,
      total_price: '99.99',
      currency: 'USD',
      customer: {
        id: Math.floor(Math.random() * 9000000000) + 1000000000,
        email: 'customer@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '+15551234567'
      },
      line_items: [{ id: 101, title: 'Sample Product', quantity: 2, price: '49.99' }]
    })
  },
  {
    platform: 'Shopify',
    eventType: 'orders/updated',
    name: 'Order Updated',
    generate: () => ({
      id: Math.floor(Math.random() * 9000000000) + 1000000000,
      order_number: Math.floor(Math.random() * 9000) + 1000,
      email: 'customer@example.com',
      updated_at: now(),
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '99.99',
      customer: { id: 6012345678, email: 'customer@example.com', first_name: 'Jane', last_name: 'Doe' }
    })
  },
  {
    platform: 'Shopify',
    eventType: 'orders/paid',
    name: 'Order Paid',
    generate: () => ({
      id: Math.floor(Math.random() * 9000000000) + 1000000000,
      order_number: Math.floor(Math.random() * 9000) + 1000,
      financial_status: 'paid',
      total_price: '149.50',
      customer: { email: 'buyer@example.com', first_name: 'John', last_name: 'Smith' }
    })
  },
  {
    platform: 'Shopify',
    eventType: 'orders/fulfilled',
    name: 'Order Fulfilled',
    generate: () => ({
      id: Math.floor(Math.random() * 9000000000) + 1000000000,
      fulfillment_status: 'fulfilled',
      fulfillments: [{ id: 1, status: 'success' }],
      customer: { email: 'customer@example.com' }
    })
  },
  {
    platform: 'Stripe',
    eventType: 'payment_intent.succeeded',
    name: 'Payment Intent Succeeded',
    generate: () => ({
      id: randomId('evt'),
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: randomId('pi'),
          amount: Math.floor(Math.random() * 10000) + 1000,
          currency: 'usd',
          status: 'succeeded',
          metadata: { order_id: randomId('ord') }
        }
      }
    })
  },
  {
    platform: 'Stripe',
    eventType: 'payment_intent.payment_failed',
    name: 'Payment Intent Failed',
    generate: () => ({
      id: randomId('evt'),
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: randomId('pi'),
          amount: 5000,
          currency: 'usd',
          status: 'requires_payment_method',
          last_payment_error: { message: 'Your card was declined.' }
        }
      }
    })
  },
  {
    platform: 'Stripe',
    eventType: 'charge.succeeded',
    name: 'Charge Succeeded',
    generate: () => ({
      id: randomId('evt'),
      type: 'charge.succeeded',
      data: {
        object: {
          id: randomId('ch'),
          amount: 2500,
          currency: 'usd',
          paid: true,
          receipt_email: 'customer@example.com'
        }
      }
    })
  },
  {
    platform: 'Generic REST',
    eventType: 'event.created',
    name: 'Generic Event',
    generate: () => ({
      id: randomId('ev'),
      timestamp: now(),
      event: 'event.created',
      data: {
        entity_id: randomId('ent'),
        entity_type: 'order',
        status: 'created',
        metadata: {}
      }
    })
  },
  {
    platform: 'Custom Backend',
    eventType: 'custom',
    name: 'Custom Payload',
    generate: () => ({
      event_type: 'order.created',
      payload_id: randomId('pl'),
      created_at: now(),
      customer: { email: 'test@example.com', name: 'Test User', phone: '+15550000000' },
      custom_field_1: '',
      custom_field_2: ''
    })
  },
  {
    platform: 'CRM',
    eventType: 'contact.created',
    name: 'Contact Created',
    generate: () => ({
      event: 'contact.created',
      contact: {
        id: randomId('con'),
        email: 'lead@example.com',
        name: 'New Lead',
        phone: '+15559876543',
        created_at: now()
      }
    })
  },
  {
    platform: 'Mastershop',
    eventType: 'order_created',
    name: 'Pedido Creado',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 1,
        confirmation_status_name: 'Por Confirmar',
        order_transaction: { payment_method: 'cod', total: 150000, currency: 'COP' },
        carrier_status_info: undefined,
        carrier_novelty: undefined,
      }),
  },
  {
    platform: 'Mastershop',
    eventType: 'order_delivered',
    name: 'Pedido Entregado',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 8,
        confirmation_status_name: 'Entregada',
      }),
  },
  {
    platform: 'Mastershop',
    eventType: 'order_out_for_delivery',
    name: 'Pedido En Reparto',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 6,
        confirmation_status_name: 'En Tránsito',
        carrier_status_info: {
          carrier_status: 'En reparto',
          carrier_status_code: 'OUT_FOR_DELIVERY',
        },
      }),
  },
  {
    platform: 'Mastershop',
    eventType: 'order_at_office',
    name: 'Pedido En Oficina',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 6,
        confirmation_status_name: 'En Tránsito',
        carrier_status_info: {
          carrier_status: 'En oficina',
          carrier_status_code: 'AT_OFFICE',
        },
      }),
  },
  {
    platform: 'Mastershop',
    eventType: 'order_with_novelty',
    name: 'Pedido con Novedad',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 6,
        confirmation_status_name: 'En Tránsito',
        carrier_novelty: {
          description: 'Dirección incorrecta',
          code: 'BAD_ADDRESS',
        },
      }),
  },
  {
    platform: 'Mastershop',
    eventType: 'order_cod_status',
    name: 'Contra Entrega status variant',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 3,
        confirmation_status_name: 'Por Alistar',
        order_transaction: { payment_method: 'cod', total: 89000, currency: 'COP' },
        order_logistics: {
          carrier_name: 'Servientrega',
          url_tracking: 'https://tracking.example.com/COD-99',
          carrier_tracking_code: 'COD-99',
        },
      }),
  },
  {
    platform: 'Mastershop',
    eventType: 'order_prepaid_status',
    name: 'Pago Anticipado status variant',
    generate: () =>
      baseMastershopOrderPayload({
        id_status: 3,
        confirmation_status_name: 'Por Alistar',
        order_transaction: { payment_method: 'transfer', total: 120000, currency: 'COP' },
        order_logistics: {
          carrier_name: 'Interrapidisimo',
          url_tracking: 'https://tracking.example.com/PA-42',
          carrier_tracking_code: 'PA-42',
        },
      }),
  },
];

/**
 * Generate a sample payload for the given platform and event type.
 */
export function generateSamplePayload(platform: string, eventType: string): object {
  const t = SAMPLE_PAYLOAD_TEMPLATES.find(
    (x) => x.platform === platform && x.eventType === eventType
  );
  if (t) return t.generate();
  const byPlatform = SAMPLE_PAYLOAD_TEMPLATES.find((x) => x.platform === platform);
  if (byPlatform) return byPlatform.generate();
  return SAMPLE_PAYLOAD_TEMPLATES[0].generate();
}
