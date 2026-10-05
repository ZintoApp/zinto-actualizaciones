/**
 * Builds flat product-identifier rows for inventory CSV prep.
 * One row per stock target: simple products get a single row;
 * products with variants get one row per variant.
 */

export type ProductIdentifierSource = {
  id: number;
  name: string;
  sku: string | null;
  type: string;
};

export type VariantIdentifierSource = {
  productId: number;
  name: string;
  sku: string | null;
};

export type ProductIdentifierExportRow = {
  productId: number;
  sku: string;
  variantSku: string;
  name: string;
  type: string;
};

export const PRODUCT_IDENTIFIER_EXPORT_COLUMNS = [
  'Product ID',
  'SKU',
  'Variant SKU',
  'Name',
  'Type',
] as const;

function escapeCsvValue(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
    ? `"${escaped}"`
    : escaped;
}

export function buildProductIdentifierExportRows(
  products: ProductIdentifierSource[],
  variants: VariantIdentifierSource[]
): ProductIdentifierExportRow[] {
  const variantsByProduct = new Map<number, VariantIdentifierSource[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.productId) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.productId, list);
  }

  const rows: ProductIdentifierExportRow[] = [];
  for (const product of products) {
    const productVariants = variantsByProduct.get(product.id) ?? [];
    if (productVariants.length === 0) {
      rows.push({
        productId: product.id,
        sku: product.sku?.trim() || '',
        variantSku: '',
        name: product.name,
        type: product.type,
      });
      continue;
    }

    for (const variant of productVariants) {
      rows.push({
        productId: product.id,
        sku: product.sku?.trim() || '',
        variantSku: variant.sku?.trim() || '',
        name: variant.name?.trim() ? `${product.name} / ${variant.name}` : product.name,
        type: product.type,
      });
    }
  }

  return rows;
}

export function formatProductIdentifierExportCsv(rows: ProductIdentifierExportRow[]): string {
  const lines = [PRODUCT_IDENTIFIER_EXPORT_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        String(row.productId),
        escapeCsvValue(row.sku),
        escapeCsvValue(row.variantSku),
        escapeCsvValue(row.name),
        escapeCsvValue(row.type),
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}
