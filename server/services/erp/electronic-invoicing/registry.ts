import type { IElectronicInvoiceProvider } from './types';

export class ElectronicInvoicingRegistry {
  private static invoiceProviders = new Map<string, IElectronicInvoiceProvider>();

  static registerInvoiceProvider(countryCode: string, provider: IElectronicInvoiceProvider): void {
    this.invoiceProviders.set(countryCode.toUpperCase(), provider);
  }

  static getInvoiceProvider(countryCode: string): IElectronicInvoiceProvider | undefined {
    return this.invoiceProviders.get(countryCode.toUpperCase());
  }
}
