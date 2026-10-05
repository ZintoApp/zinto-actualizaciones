export type ContactSalesOrderSummary = {
  id: number;
  orderNumber: string;
  status: string;
  currency: string | null;
  totalAmount: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type ContactInvoiceSummary = {
  id: number;
  invoiceNumber: string;
  status: string;
  currency: string | null;
  totalAmount: string;
  createdAt: string;
};

export type ContactSalesTimelineItem = {
  key: string;
  id: number;
  kind: 'quotation' | 'order' | 'invoice';
  number: string;
  status: string;
  currency: string;
  total: string;
  date: string;
  order?: ContactSalesOrderSummary;
};

export function buildContactSalesTimeline(
  salesOrders: ContactSalesOrderSummary[],
  invoices: ContactInvoiceSummary[],
): ContactSalesTimelineItem[] {
  const orderItems: ContactSalesTimelineItem[] = salesOrders.map((order) => ({
    key: `order-${order.id}`,
    id: order.id,
    kind: order.status === 'quotation' ? 'quotation' : 'order',
    number: order.orderNumber,
    status: order.status,
    currency: order.currency || 'USD',
    total: order.totalAmount,
    date: order.updatedAt || order.createdAt,
    order,
  }));
  const invoiceItems: ContactSalesTimelineItem[] = invoices.map((invoice) => ({
    key: `invoice-${invoice.id}`,
    id: invoice.id,
    kind: 'invoice',
    number: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency || 'USD',
    total: invoice.totalAmount,
    date: invoice.createdAt,
  }));
  return [...orderItems, ...invoiceItems].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
}
