import type {
  AIAssistantErpCatalogItem,
  AIAssistantErpContext,
} from './types/flow-execution';

function redactCatalogItem(item: AIAssistantErpCatalogItem): AIAssistantErpCatalogItem {
  const redacted = { ...item };
  delete redacted.unitPrice;
  delete redacted.currency;
  return redacted;
}

export function getErpCatalogPriceFields(
  item: AIAssistantErpCatalogItem,
  catalogPriceSharingEnabled: boolean
): Pick<AIAssistantErpCatalogItem, 'unitPrice' | 'currency'> | Record<string, never> {
  return catalogPriceSharingEnabled
    ? {
        unitPrice: item.unitPrice ?? null,
        currency: item.currency ?? null,
      }
    : {};
}

/** Returns an AI-safe copy while retaining the unmodified ERP context for server-side operations. */
export function redactErpCatalogPrices(
  context: AIAssistantErpContext | undefined
): AIAssistantErpContext | undefined {
  if (!context) return undefined;
  return {
    ...context,
    menuCatalogItems: context.menuCatalogItems?.map(redactCatalogItem),
    lastProductSearch: context.lastProductSearch
      ? {
          ...context.lastProductSearch,
          imageMatchItems: context.lastProductSearch.imageMatchItems?.map(redactCatalogItem),
        }
      : undefined,
  };
}
