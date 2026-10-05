/**
 * Resolves which warehouse an inventory CSV import row should use.
 * Per-row CSV Warehouse ID wins; upload-level UI warehouse is fallback only.
 */

export type InventoryImportWarehouseResolveError =
  | 'warehouse_id_required'
  | 'invalid_warehouse_id';

export type InventoryImportWarehouseResolveResult =
  | { ok: true; warehouseId: number }
  | { ok: false; errorCode: InventoryImportWarehouseResolveError };

function parseStrictPositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) return null;
  return n;
}

export function resolveInventoryImportWarehouseId(params: {
  rowWarehouseIdRaw: string | undefined | null;
  uploadWarehouseId: number | undefined | null;
}): InventoryImportWarehouseResolveResult {
  const raw = params.rowWarehouseIdRaw?.trim();
  if (raw) {
    const parsed = parseStrictPositiveInt(raw);
    if (parsed == null) {
      return { ok: false, errorCode: 'invalid_warehouse_id' };
    }
    return { ok: true, warehouseId: parsed };
  }

  if (params.uploadWarehouseId != null) {
    return { ok: true, warehouseId: params.uploadWarehouseId };
  }

  return { ok: false, errorCode: 'warehouse_id_required' };
}
