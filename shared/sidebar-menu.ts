import { z } from "zod";

export const SIDEBAR_MENU_ITEM_IDS = [
  "inbox",
  "flows",
  "contacts",
  "pipeline",
  "tasks",
  "calendar",
  "campaigns",
  "call_logs",
  "templates",
  "analytics",
  "reports",
  "captured_data",
  "erp",
] as const;

export type SidebarMenuItemId = (typeof SIDEBAR_MENU_ITEM_IDS)[number];

const sidebarMenuItemIdSet = new Set<string>(SIDEBAR_MENU_ITEM_IDS);

export const sidebarMenuOrderUpdateSchema = z.object({
  itemOrder: z
    .array(z.enum(SIDEBAR_MENU_ITEM_IDS))
    .max(SIDEBAR_MENU_ITEM_IDS.length)
    .refine((items) => new Set(items).size === items.length, "Menu item IDs must be unique"),
}).strict();

/**
 * Reconciles a saved order with the current product catalog. Missing entries are
 * inserted next to their nearest default successor, preserving the relative order
 * of every valid saved entry. Unknown and duplicate values are discarded.
 */
export function normalizeSidebarMenuOrder(value: unknown): SidebarMenuItemId[] {
  const saved = Array.isArray(value)
    ? value.filter((item, index, items): item is SidebarMenuItemId =>
        typeof item === "string" && sidebarMenuItemIdSet.has(item) && items.indexOf(item) === index,
      )
    : [];

  if (saved.length === 0) return [...SIDEBAR_MENU_ITEM_IDS];

  const result = [...saved];
  for (let defaultIndex = 0; defaultIndex < SIDEBAR_MENU_ITEM_IDS.length; defaultIndex += 1) {
    const missingId = SIDEBAR_MENU_ITEM_IDS[defaultIndex];
    if (result.includes(missingId)) continue;

    const successor = SIDEBAR_MENU_ITEM_IDS
      .slice(defaultIndex + 1)
      .find((candidate) => result.includes(candidate));

    if (successor) {
      result.splice(result.indexOf(successor), 0, missingId);
      continue;
    }

    const predecessor = [...SIDEBAR_MENU_ITEM_IDS]
      .slice(0, defaultIndex)
      .reverse()
      .find((candidate) => result.includes(candidate));
    const insertAt = predecessor ? result.indexOf(predecessor) + 1 : result.length;
    result.splice(insertAt, 0, missingId);
  }

  return result;
}

/** Reorders visible entries while leaving permission-hidden entries in their slots. */
export function reorderVisibleSidebarItems(
  fullOrder: readonly SidebarMenuItemId[],
  visibleIds: ReadonlySet<SidebarMenuItemId>,
  sourceIndex: number,
  destinationIndex: number,
): SidebarMenuItemId[] {
  const visibleOrder = fullOrder.filter((id) => visibleIds.has(id));
  if (
    sourceIndex < 0 ||
    destinationIndex < 0 ||
    sourceIndex >= visibleOrder.length ||
    destinationIndex >= visibleOrder.length ||
    sourceIndex === destinationIndex
  ) {
    return [...fullOrder];
  }

  const [moved] = visibleOrder.splice(sourceIndex, 1);
  visibleOrder.splice(destinationIndex, 0, moved);

  let visibleIndex = 0;
  return fullOrder.map((id) => (visibleIds.has(id) ? visibleOrder[visibleIndex++] : id));
}
