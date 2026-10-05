import { useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductPicker, type ProductPickerOption } from '@/components/erp/product-picker';
import { VariantPicker } from '@/components/erp/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

type TFunction = (key: string, fallback: string, vars?: Record<string, string>) => string;

const optionSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1),
  priceDelta: z.number().finite(),
  isDefault: z.boolean(),
});

const groupSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  required: z.boolean(),
  minSelections: z.number().int().min(0),
  maxSelections: z.number().int().min(1),
  options: z.array(optionSchema).min(1),
});

const comboItemSchema = z.object({
  id: z.string(),
  productId: z.number().int().positive(),
  productName: z.string().trim().min(1),
  variantId: z.number().int().positive().nullable(),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
});

const recipeIngredientSchema = z.object({
  id: z.string(),
  productId: z.number().int().positive(),
  productName: z.string().trim().min(1),
  variantId: z.number().int().positive().nullable(),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  wastagePercent: z.number().min(0).max(100).nullable(),
  yieldPercent: z.number().min(0).max(100).nullable(),
});

export type ModifierOptionModel = z.infer<typeof optionSchema>;
export type ModifierGroupModel = z.infer<typeof groupSchema>;
export type ComboItemModel = z.infer<typeof comboItemSchema>;
export type RecipeIngredientModel = z.infer<typeof recipeIngredientSchema>;

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeModifierGroups(input: unknown[] | null | undefined): ModifierGroupModel[] {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
      const optionsRaw = Array.isArray(source.options) ? source.options : [];
      const options = optionsRaw
        .map((option, optionIndex) => {
          const opt = option && typeof option === 'object' ? (option as Record<string, unknown>) : {};
          return {
            id: typeof opt.id === 'string' ? opt.id : `opt-${index + 1}-${optionIndex + 1}-${newId()}`,
            label: typeof opt.label === 'string' ? opt.label : '',
            priceDelta: toFiniteNumber(opt.priceDelta, 0),
            isDefault: opt.isDefault === true,
          };
        })
        .filter((option) => option.label.trim().length > 0);
      return {
        id: typeof source.id === 'string' ? source.id : `grp-${index + 1}-${newId()}`,
        name: typeof source.name === 'string' ? source.name : '',
        required: source.required === true,
        minSelections: Math.max(0, Math.floor(toFiniteNumber(source.minSelections, 0))),
        maxSelections: Math.max(1, Math.floor(toFiniteNumber(source.maxSelections, Math.max(options.length, 1)))),
        options: options.length > 0 ? options : [{ id: `opt-${newId()}`, label: '', priceDelta: 0, isDefault: false }],
      };
    })
    .filter((group) => group.name.trim().length > 0 || group.options.some((option) => option.label.trim().length > 0));

  return normalized;
}

export function normalizeComboItems(input: unknown[] | null | undefined): ComboItemModel[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
      return {
        id: typeof source.id === 'string' ? source.id : newId(),
        productId: Math.floor(toFiniteNumber(source.productId, 0)),
        productName: typeof source.productName === 'string' ? source.productName : '',
        variantId:
          source.variantId == null
            ? null
            : Math.floor(toFiniteNumber(source.variantId, 0)) > 0
              ? Math.floor(toFiniteNumber(source.variantId, 0))
              : null,
        quantity: toFiniteNumber(source.quantity, 1),
        unit: typeof source.unit === 'string' && source.unit.trim() ? source.unit.trim() : 'unit',
      };
    })
    .filter((item) => item.productId > 0);
}

export function normalizeRecipeIngredients(input: unknown[] | null | undefined): RecipeIngredientModel[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
      const wastageNumeric = source.wastagePercent == null ? null : toFiniteNumber(source.wastagePercent, 0);
      const yieldNumeric = source.yieldPercent == null ? null : toFiniteNumber(source.yieldPercent, 100);
      return {
        id: typeof source.id === 'string' ? source.id : newId(),
        productId: Math.floor(toFiniteNumber(source.productId, 0)),
        productName: typeof source.productName === 'string' ? source.productName : '',
        variantId:
          source.variantId == null
            ? null
            : Math.floor(toFiniteNumber(source.variantId, 0)) > 0
              ? Math.floor(toFiniteNumber(source.variantId, 0))
              : null,
        quantity: toFiniteNumber(source.quantity, 1),
        unit: typeof source.unit === 'string' && source.unit.trim() ? source.unit.trim() : 'unit',
        wastagePercent: wastageNumeric == null ? null : Math.min(100, Math.max(0, wastageNumeric)),
        yieldPercent: yieldNumeric == null ? null : Math.min(100, Math.max(0, yieldNumeric)),
      };
    })
    .filter((ingredient) => ingredient.productId > 0);
}

export function validateRestaurantStructuredFields(data: {
  modifiers: ModifierGroupModel[];
  comboItems: ComboItemModel[];
  recipeIngredients: RecipeIngredientModel[];
}) {
  return z
    .object({
      modifiers: z.array(groupSchema),
      comboItems: z.array(comboItemSchema),
      recipeIngredients: z.array(recipeIngredientSchema),
    })
    .safeParse(data);
}

export function serializeModifierGroups(groups: ModifierGroupModel[]): unknown[] {
  return groups.map((group) => ({
    name: group.name.trim(),
    required: group.required,
    minSelections: Math.max(0, Math.floor(group.minSelections)),
    maxSelections: Math.max(1, Math.floor(group.maxSelections)),
    options: group.options
      .map((option) => ({
        label: option.label.trim(),
        priceDelta: option.priceDelta,
        isDefault: option.isDefault,
      }))
      .filter((option) => option.label.length > 0),
  }));
}

export function serializeComboItems(items: ComboItemModel[]): unknown[] {
  return items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    variantId: item.variantId,
    quantity: item.quantity,
    unit: item.unit.trim(),
  }));
}

export function serializeRecipeIngredients(items: RecipeIngredientModel[]): unknown[] {
  return items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    variantId: item.variantId,
    quantity: item.quantity,
    unit: item.unit.trim(),
    wastagePercent: item.wastagePercent,
    yieldPercent: item.yieldPercent,
  }));
}

type Props = {
  companyId?: number;
  t: TFunction;
  modifiers: ModifierGroupModel[];
  onModifiersChange: (value: ModifierGroupModel[]) => void;
  comboItems: ComboItemModel[];
  onComboItemsChange: (value: ComboItemModel[]) => void;
  recipeIngredients: RecipeIngredientModel[];
  onRecipeIngredientsChange: (value: RecipeIngredientModel[]) => void;
};

export function RestaurantStructuredFieldsEditor({
  companyId,
  t,
  modifiers,
  onModifiersChange,
  comboItems,
  onComboItemsChange,
  recipeIngredients,
  onRecipeIngredientsChange,
}: Props) {
  const [modifiersDialogOpen, setModifiersDialogOpen] = useState(false);
  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);

  const addModifierGroup = () => {
    onModifiersChange([
      ...modifiers,
      {
        id: `grp-${newId()}`,
        name: '',
        required: false,
        minSelections: 0,
        maxSelections: 1,
        options: [{ id: `opt-${newId()}`, label: '', priceDelta: 0, isDefault: false }],
      },
    ]);
  };

  const modifierSummary = useMemo(
    () =>
      modifiers
        .filter((group) => group.name.trim().length > 0)
        .map((group) =>
          t('erp.products.structured.modifierSummary', '{{name}} ({{rules}})', {
            name: group.name,
            rules: `${group.required ? t('erp.products.structured.required', 'required') : t('erp.products.structured.optional', 'optional')}, ${group.minSelections}-${group.maxSelections}`,
          })
        ),
    [modifiers, t]
  );

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium">{t('erp.products.modifiers', 'Modifiers')}</span>
          <div className="flex gap-2">
            <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.products.structured.advancedEditor" type="button" size="sm" variant="outline" onClick={() => setModifiersDialogOpen(true)}>
              {t('erp.products.structured.advancedEditor', 'Advanced editor')}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {modifierSummary.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t('erp.products.structured.noModifierGroups', 'No modifier groups yet.')}</span>
          ) : (
            modifierSummary.map((summary) => (
              <Badge key={summary} variant="secondary">
                {summary}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium">{t('erp.products.comboItems', 'Combo items')}</span>
          <div className="flex gap-2">
            <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.products.structured.advancedEditor" type="button" size="sm" variant="outline" onClick={() => setComboDialogOpen(true)}>
              {t('erp.products.structured.advancedEditor', 'Advanced editor')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {comboItems.length > 0
            ? t('erp.products.structured.comboCount', '{{count}} combo items configured', { count: String(comboItems.length) })
            : t('erp.products.structured.noComboItems', 'No combo items yet.')}
        </p>
      </div>

      <div className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium">{t('erp.products.recipeIngredients', 'Recipe ingredients')}</span>
          <div className="flex gap-2">
            <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.products.structured.advancedEditor" type="button" size="sm" variant="outline" onClick={() => setRecipeDialogOpen(true)}>
              {t('erp.products.structured.advancedEditor', 'Advanced editor')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {recipeIngredients.length > 0
            ? t('erp.products.structured.recipeCount', '{{count}} ingredients configured', { count: String(recipeIngredients.length) })
            : t('erp.products.structured.noRecipeIngredients', 'No recipe ingredients yet.')}
        </p>
      </div>

      <ModifierGroupsDialog
        open={modifiersDialogOpen}
        onOpenChange={setModifiersDialogOpen}
        t={t}
        value={modifiers}
        onChange={onModifiersChange}
      />
      <InventoryItemsDialog
        open={comboDialogOpen}
        onOpenChange={setComboDialogOpen}
        t={t}
        title={t('erp.products.comboItems', 'Combo items')}
        addLabel={t('erp.products.structured.addItem', 'Add item')}
        value={comboItems}
        onChange={onComboItemsChange}
        companyId={companyId}
        queryScope="product-combo-items"
        includeCostingFields={false}
      />
      <InventoryItemsDialog
        open={recipeDialogOpen}
        onOpenChange={setRecipeDialogOpen}
        t={t}
        title={t('erp.products.recipeIngredients', 'Recipe ingredients')}
        addLabel={t('erp.products.structured.addIngredient', 'Add ingredient')}
        value={recipeIngredients}
        onChange={onRecipeIngredientsChange}
        companyId={companyId}
        queryScope="product-recipe-items"
        includeCostingFields
      />
    </div>
  );
}

type ModifierDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TFunction;
  value: ModifierGroupModel[];
  onChange: (value: ModifierGroupModel[]) => void;
};

function ModifierGroupsDialog({ open, onOpenChange, t, value, onChange }: ModifierDialogProps) {
  const addGroup = () => {
    onChange([
      ...value,
      {
        id: `grp-${newId()}`,
        name: '',
        required: false,
        minSelections: 0,
        maxSelections: 1,
        options: [{ id: `opt-${newId()}`, label: '', priceDelta: 0, isDefault: false }],
      },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-erp-restaurant-product-structured-editors.dialogcontent.erp.products.structured.modifierGroupsTitle" className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>{t('erp.products.structured.modifierGroupsTitle', 'Modifier groups')}</DialogTitle>
          <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.products.structured.addGroup" type="button" size="sm" variant="outline" onClick={addGroup}>
            <Plus className="mr-1 h-4 w-4" />
            {t('erp.products.structured.addGroup', 'Add group')}
          </Button>
        </DialogHeader>
        <div className="space-y-4">
          {value.map((group, groupIndex) => (
            <div key={group.id} className="rounded-md border p-3">
              <div className="mb-3 grid gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <Label>{t('erp.products.structured.groupName', 'Group name')}</Label>
                  <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.groupName"
                    value={group.name}
                    onChange={(event) => {
                      const next = [...value];
                      next[groupIndex] = { ...group, name: event.target.value };
                      onChange(next);
                    }}
                  />
                </div>
                <div>
                  <Label>{t('erp.products.structured.minSelections', 'Min selections')}</Label>
                  <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.groupName"
                    type="number"
                    value={group.minSelections}
                    onChange={(event) => {
                      const next = [...value];
                      next[groupIndex] = { ...group, minSelections: Math.max(0, Math.floor(toFiniteNumber(event.target.value, 0))) };
                      onChange(next);
                    }}
                  />
                </div>
                <div>
                  <Label>{t('erp.products.structured.maxSelections', 'Max selections')}</Label>
                  <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.groupName"
                    type="number"
                    value={group.maxSelections}
                    onChange={(event) => {
                      const next = [...value];
                      next[groupIndex] = { ...group, maxSelections: Math.max(1, Math.floor(toFiniteNumber(event.target.value, 1))) };
                      onChange(next);
                    }}
                  />
                </div>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={group.required}
                    onCheckedChange={(checked) => {
                      const next = [...value];
                      next[groupIndex] = { ...group, required: checked === true };
                      onChange(next);
                    }}
                  />
                  <span>{t('erp.products.structured.required', 'Required')}</span>
                </div>
                <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.common.delete"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onChange(value.filter((entry) => entry.id !== group.id))}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {t('erp.common.delete', 'Delete')}
                </Button>
              </div>

              <div className="space-y-2">
                {group.options.map((option, optionIndex) => (
                  <div key={option.id} className="grid gap-2 md:grid-cols-12">
                    <div className="md:col-span-6">
                      <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.optionLabel"
                        placeholder={t('erp.products.structured.optionLabel', 'Option label')}
                        value={option.label}
                        onChange={(event) => {
                          const next = [...value];
                          const options = [...group.options];
                          options[optionIndex] = { ...option, label: event.target.value };
                          next[groupIndex] = { ...group, options };
                          onChange(next);
                        }}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.priceDelta"
                        type="number"
                        step="0.01"
                        placeholder={t('erp.products.structured.priceDelta', 'Price delta')}
                        value={option.priceDelta}
                        onChange={(event) => {
                          const next = [...value];
                          const options = [...group.options];
                          options[optionIndex] = { ...option, priceDelta: toFiniteNumber(event.target.value, 0) };
                          next[groupIndex] = { ...group, options };
                          onChange(next);
                        }}
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2">
                      <Checkbox
                        checked={option.isDefault}
                        onCheckedChange={(checked) => {
                          const next = [...value];
                          const options = [...group.options];
                          options[optionIndex] = { ...option, isDefault: checked === true };
                          next[groupIndex] = { ...group, options };
                          onChange(next);
                        }}
                      />
                      <span className="text-xs">{t('erp.products.structured.default', 'Default')}</span>
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          const next = [...value];
                          const options = group.options.filter((entry) => entry.id !== option.id);
                          next[groupIndex] = { ...group, options: options.length > 0 ? options : [{ id: `opt-${newId()}`, label: '', priceDelta: 0, isDefault: false }] };
                          onChange(next);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.products.structured.addOption"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = [...value];
                    next[groupIndex] = {
                      ...group,
                      options: [...group.options, { id: `opt-${newId()}`, label: '', priceDelta: 0, isDefault: false }],
                    };
                    onChange(next);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t('erp.products.structured.addOption', 'Add option')}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.common.close" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('erp.common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type InventoryDialogProps<T extends ComboItemModel | RecipeIngredientModel> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TFunction;
  title: string;
  addLabel: string;
  value: T[];
  onChange: (value: T[]) => void;
  companyId?: number;
  queryScope: string;
  includeCostingFields: boolean;
};

function InventoryItemsDialog<T extends ComboItemModel | RecipeIngredientModel>({
  open,
  onOpenChange,
  t,
  title,
  addLabel,
  value,
  onChange,
  companyId,
  queryScope,
  includeCostingFields,
}: InventoryDialogProps<T>) {
  const addRow = () => {
    if (includeCostingFields) {
      onChange([
        ...value,
        {
          id: newId(),
          productId: 0,
          productName: '',
          variantId: null,
          quantity: 1,
          unit: 'unit',
          wastagePercent: null,
          yieldPercent: null,
        } as T,
      ]);
      return;
    }
    onChange([
      ...value,
      {
        id: newId(),
        productId: 0,
        productName: '',
        variantId: null,
        quantity: 1,
        unit: 'unit',
      } as T,
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>{title}</DialogTitle>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" />
            {addLabel}
          </Button>
        </DialogHeader>
        <div className="space-y-3">
          {value.map((item, index) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-5">
                  <Label>{t('erp.products.structured.product', 'Product')}</Label>
                  <ProductPicker
                    companyId={companyId}
                    value={
                      item.productId > 0
                        ? ({
                            id: item.productId,
                            name: item.productName || `#${item.productId}`,
                            sku: null,
                            unitPrice: null,
                          } as ProductPickerOption)
                        : null
                    }
                    onChange={(product) => {
                      const next = [...value];
                      const current = next[index]!;
                      const nextProductId = product?.id ?? 0;
                      const productChanged = current.productId !== nextProductId;
                      next[index] = {
                        ...current,
                        productId: nextProductId,
                        productName: product?.name ?? '',
                        variantId: productChanged ? null : current.variantId,
                      };
                      onChange(next);
                    }}
                    queryKeyScope={`${queryScope}-${index}`}
                    placeholder={t('erp.products.structured.selectProduct', 'Select product')}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>{t('erp.common.quantity', 'Quantity')}</Label>
                  <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.product"
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(event) => {
                      const next = [...value];
                      next[index] = { ...next[index]!, quantity: Math.max(0.01, toFiniteNumber(event.target.value, 1)) };
                      onChange(next);
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>{t('erp.products.structured.unit', 'Unit')}</Label>
                  <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.product"
                    value={item.unit}
                    onChange={(event) => {
                      const next = [...value];
                      next[index] = { ...next[index]!, unit: event.target.value || 'unit' };
                      onChange(next);
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>{t('erp.products.structured.variant', 'Variant')}</Label>
                  <VariantPicker
                    productId={item.productId > 0 ? item.productId : null}
                    value={item.variantId != null ? String(item.variantId) : ''}
                    onChange={(nextVariantId) => {
                      const next = [...value];
                      const parsed = parseInt(nextVariantId, 10);
                      next[index] = { ...next[index]!, variantId: Number.isFinite(parsed) && parsed > 0 ? parsed : null };
                      onChange(next);
                    }}
                    includeBaseOption
                    placeholder={t('erp.products.structured.selectVariant', 'Select variant')}
                  />
                </div>
                <div className="md:col-span-1 flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onChange(value.filter((entry) => entry.id !== item.id) as T[])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {includeCostingFields ? (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>{t('erp.products.structured.wastagePercent', 'Wastage %')}</Label>
                    <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.wastagePercent"
                      type="number"
                      step="0.1"
                      value={(item as RecipeIngredientModel).wastagePercent ?? ''}
                      onChange={(event) => {
                        const next = [...value] as RecipeIngredientModel[];
                        const numeric = event.target.value.trim() === '' ? null : Math.min(100, Math.max(0, toFiniteNumber(event.target.value, 0)));
                        next[index] = { ...next[index]!, wastagePercent: numeric };
                        onChange(next as T[]);
                      }}
                    />
                  </div>
                  <div>
                    <Label>{t('erp.products.structured.yieldPercent', 'Yield %')}</Label>
                    <Input data-tour="components-erp-restaurant-product-structured-editors.input.erp.products.structured.wastagePercent"
                      type="number"
                      step="0.1"
                      value={(item as RecipeIngredientModel).yieldPercent ?? ''}
                      onChange={(event) => {
                        const next = [...value] as RecipeIngredientModel[];
                        const numeric = event.target.value.trim() === '' ? null : Math.min(100, Math.max(0, toFiniteNumber(event.target.value, 100)));
                        next[index] = { ...next[index]!, yieldPercent: numeric };
                        onChange(next as T[]);
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {value.length === 0 ? (
            <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
              {t('erp.products.structured.noRowsYet', 'No rows added yet.')}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button data-tour="components-erp-restaurant-product-structured-editors.button.erp.common.close" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('erp.common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
