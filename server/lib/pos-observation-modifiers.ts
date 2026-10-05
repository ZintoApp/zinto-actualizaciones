export type PosQuickModifierOption = {
  key: string;
  label: string;
  priceDelta: number;
};

/** English labels for POS fallback quick modifiers (server-authoritative pricing). */
export const FALLBACK_POS_QUICK_MODIFIERS: PosQuickModifierOption[] = [
  { key: 'no-onions', label: 'No onions', priceDelta: 0 },
  { key: 'with-onions', label: 'With onions', priceDelta: 0 },
  { key: 'extra-cheese', label: 'Extra cheese', priceDelta: 1.5 },
  { key: 'spicy', label: 'Spicy', priceDelta: 0 },
  { key: 'no-sauce', label: 'No sauce', priceDelta: 0 },
];

export function inferSelectedQuickModifiers(
  specialInstructions: string,
  available: PosQuickModifierOption[],
): PosQuickModifierOption[] {
  if (!specialInstructions.trim() || available.length === 0) return [];
  const parts = specialInstructions.split(',').map((part) => part.trim()).filter(Boolean);
  const labelToOption = new Map(available.map((option) => [option.label.toLowerCase(), option]));
  const selected: PosQuickModifierOption[] = [];
  const usedKeys = new Set<string>();
  for (const part of parts) {
    const option = labelToOption.get(part.toLowerCase());
    if (!option || usedKeys.has(option.key)) continue;
    selected.push(option);
    usedKeys.add(option.key);
  }
  return selected;
}

export function sumQuickModifierPriceDelta(modifiers: PosQuickModifierOption[]) {
  return modifiers.reduce(
    (sum, modifier) => sum + (Number.isFinite(modifier.priceDelta) ? modifier.priceDelta : 0),
    0,
  );
}

export function derivePosObservationUnitPriceFromModifiers(
  persistedUnitPrice: number,
  previousInstructions: string | null | undefined,
  nextInstructions: string | null | undefined,
  availableModifiers: PosQuickModifierOption[],
): string | null {
  if (availableModifiers.length === 0) return null;

  const oldModifiers = inferSelectedQuickModifiers(previousInstructions ?? '', availableModifiers);
  const newModifiers = inferSelectedQuickModifiers(nextInstructions ?? '', availableModifiers);
  const baseUnitPrice = Math.max(0, persistedUnitPrice - sumQuickModifierPriceDelta(oldModifiers));
  const adjustedUnitPrice = Math.max(0, baseUnitPrice + sumQuickModifierPriceDelta(newModifiers));
  return adjustedUnitPrice.toFixed(2);
}
