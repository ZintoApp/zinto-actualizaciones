import { storage } from '../../../storage';
import type { FactusSettingsInput } from '../../../../shared/factus';
import { getFactusRuntimeSettings, getFactusSettingsForApi } from './factus-settings';
import { ElectronicInvoicingUserError, IElectronicInvoiceProvider, type ElectronicInvoiceContext, type ElectronicInvoiceSubmission } from './types';
import { ElectronicInvoicingRegistry } from './registry';
export { ElectronicInvoicingRegistry } from './registry';

export class ElectronicInvoicingService {
  async getConfiguration(companyId: number) {
    return getFactusSettingsForApi(companyId);
  }

  async getRuntimeConfiguration(companyId: number): Promise<FactusSettingsInput | undefined> {
    return getFactusRuntimeSettings(companyId);
  }

  async getContext(companyId: number, settings?: FactusSettingsInput): Promise<ElectronicInvoiceContext> {
    const runtime = settings || await this.getRuntimeConfiguration(companyId);
    if (!runtime) throw new Error('Factus is not configured');
    const company = await storage.getCompany(companyId);
    if (!company) throw new Error('Company not found');
    return { companyId, company, settings: runtime };
  }

  async getInvoiceProvider(companyId: number): Promise<IElectronicInvoiceProvider | undefined> {
    const config = await this.getRuntimeConfiguration(companyId);
    if (!config?.enabled) {
      return undefined;
    }
    return ElectronicInvoicingRegistry.getInvoiceProvider(config.country);
  }

  async loadInvoiceSubmission(companyId: number, invoiceId: number, referenceCode: string): Promise<ElectronicInvoiceSubmission> {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || invoice.companyId !== companyId) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.invoiceNotFound', 'Invoice not found');
    if (!invoice.contactId) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.customerRequired', 'A customer is required for Factus electronic invoicing');

    const customer = await storage.getContact(invoice.contactId);
    if (!customer || customer.companyId !== companyId) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.customerNotFound', 'Invoice customer was not found');

    const invoiceItems = await storage.getInvoiceItems(invoiceId);
    const productIds = [...new Set(invoiceItems.map((item) => item.productId).filter((value): value is number => value != null))];
    const productRows = await Promise.all(productIds.map((productId) => storage.getProduct(productId)));
    const productsById = new Map(
      productRows
        .filter((product) => product?.companyId === companyId)
        .map((product) => [product!.id, product!])
    );

    return {
      invoice,
      customer,
      referenceCode,
      items: invoiceItems.map((item) => ({
        ...item,
        product: item.productId ? productsById.get(item.productId) ?? null : null,
      })),
    };
  }
}

export const electronicInvoicingService = new ElectronicInvoicingService();
