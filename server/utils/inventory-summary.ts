export type InventorySummarySourceRow = {
  companyId: number;
  productId: number;
  totalStock: string | number | null;
  reservedStock: string | number | null;
  minimumStock: string | number | null;
};

export type InventorySummaryResult = {
  totalProducts: number;
  totalStock: number;
  availableStock: number;
  lowStockProducts: number;
};

export function summarizeInventoryProducts(
  rows: InventorySummarySourceRow[],
  companyId: number,
): InventorySummaryResult {
  const products = new Map<number, { totalStock: number; reservedStock: number; minimumStock: number | null }>();

  for (const row of rows) {
    if (row.companyId !== companyId) continue;
    const totalStock = Number(row.totalStock ?? 0);
    const reservedStock = Number(row.reservedStock ?? 0);
    const minimumStock = row.minimumStock == null ? null : Number(row.minimumStock);
    products.set(row.productId, {
      totalStock: Number.isFinite(totalStock) ? totalStock : 0,
      reservedStock: Number.isFinite(reservedStock) ? reservedStock : 0,
      minimumStock: minimumStock != null && Number.isFinite(minimumStock) ? minimumStock : null,
    });
  }

  let totalStock = 0;
  let availableStock = 0;
  let lowStockProducts = 0;
  for (const product of products.values()) {
    totalStock += product.totalStock;
    availableStock += product.totalStock - product.reservedStock;
    if (product.minimumStock != null && product.totalStock <= product.minimumStock) {
      lowStockProducts += 1;
    }
  }

  return {
    totalProducts: products.size,
    totalStock,
    availableStock,
    lowStockProducts,
  };
}
