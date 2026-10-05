import { storage } from "../../storage";
import type {
  InsertProduct,
  InsertProductVariant,
  Product,
  ProductBrand,
  ProductCategory,
  ProductTagMaster,
  ProductUnit,
  RestaurantKitchenStation,
  RestaurantSection,
  RestaurantTable,
  Warehouse,
} from "@shared/schema";
import {
  ERP_DEMO_SEED_DENTAL_KEY,
  ERP_DEMO_SEED_RESTAURANT_FASTFOOD_KEY,
  ERP_DEMO_SEED_STANDARD_KEY,
} from "../../routes/erp/business-type";

type SeedMode = "standard" | "restaurant-fastfood" | "dental";
type SeedStatus = "created" | "already_seeded";

type SeedCounters = {
  created: number;
  reused: number;
};

export type ErpDemoSeedSummary = {
  mode: SeedMode;
  key: string;
  status: SeedStatus;
  created: number;
  reused: number;
};

type SeedMetadata = {
  mode: SeedMode;
  seedVersion: "v1";
  seededAt: string;
  created: number;
  reused: number;
};

type SeedContext = {
  companyId: number;
  userId?: number;
  mode: SeedMode;
  seedVersion: "v1";
  counters: SeedCounters;
  marker: { source: "erp-demo-seed"; mode: SeedMode; seedVersion: "v1" };
};

const nowIso = () => new Date().toISOString();
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

function incCreated(ctx: SeedContext) {
  ctx.counters.created += 1;
}
function incReused(ctx: SeedContext) {
  ctx.counters.reused += 1;
}

async function getOrCreateCategory(
  ctx: SeedContext,
  name: string,
  opts?: { isMenuCategory?: boolean; menuSortOrder?: number }
): Promise<ProductCategory> {
  const slug = slugify(name);
  const all = await storage.getProductCategories(ctx.companyId);
  const found = all.find((item) => normalize(item.slug) === slug);
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createProductCategory({
    companyId: ctx.companyId,
    name,
    slug,
    isActive: true,
    sortOrder: 0,
    isMenuCategory: opts?.isMenuCategory ?? false,
    menuSortOrder: opts?.menuSortOrder ?? 0,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateBrand(ctx: SeedContext, name: string): Promise<ProductBrand> {
  const slug = slugify(name);
  const all = await storage.getProductBrands(ctx.companyId);
  const found = all.find((item) => normalize(item.slug) === slug || normalize(item.name) === normalize(name));
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createProductBrand({
    companyId: ctx.companyId,
    name,
    slug,
    isActive: true,
    sortOrder: 0,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateUnit(
  ctx: SeedContext,
  input: { name: string; code?: string; symbol?: string }
): Promise<ProductUnit> {
  const all = await storage.getProductUnits(ctx.companyId);
  const codeNorm = normalize(input.code);
  const found = all.find(
    (item) =>
      (codeNorm && normalize(item.code) === codeNorm) || normalize(item.name) === normalize(input.name)
  );
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createProductUnit({
    companyId: ctx.companyId,
    name: input.name,
    code: input.code ?? null,
    symbol: input.symbol ?? null,
    isActive: true,
    sortOrder: 0,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateTag(ctx: SeedContext, name: string): Promise<ProductTagMaster> {
  const all = await storage.getProductTagsMaster(ctx.companyId);
  const found = all.find((item) => normalize(item.name) === normalize(name));
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createProductTagMaster({
    companyId: ctx.companyId,
    name,
    isActive: true,
    sortOrder: 0,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateWarehouse(ctx: SeedContext, names: string[]): Promise<Warehouse> {
  const all = await storage.getWarehouses(ctx.companyId);
  const defaultWarehouse = all.find((item) => item.isDefault);
  if (defaultWarehouse) {
    incReused(ctx);
    return defaultWarehouse;
  }
  const byName = all.find((item) => names.some((name) => normalize(item.name) === normalize(name)));
  if (byName) {
    incReused(ctx);
    return byName;
  }
  const created = await storage.createWarehouse({
    companyId: ctx.companyId,
    name: names[0] ?? "Main Warehouse",
    isDefault: true,
    isActive: true,
    notes: "Auto-created by ERP demo seed",
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateStation(
  ctx: SeedContext,
  warehouseId: number,
  code: string,
  name: string,
  sortOrder: number
): Promise<RestaurantKitchenStation> {
  const all = await storage.getRestaurantKitchenStations(ctx.companyId);
  const normalizedCode = normalize(code);
  const normalizedName = normalize(name);
  // Reusing inactive rows is acceptable for idempotent demo seeding.
  const found = all.find(
    (item) => normalize(item.code) === normalizedCode || normalize(item.name) === normalizedName
  );
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createRestaurantKitchenStation({
    companyId: ctx.companyId,
    warehouseId,
    code,
    name,
    sortOrder,
    isActive: true,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateSection(
  ctx: SeedContext,
  code: string,
  name: string,
  sortOrder: number
): Promise<RestaurantSection> {
  const all = await storage.getRestaurantSections(ctx.companyId);
  const normalizedCode = normalize(code);
  const normalizedName = normalize(name);
  // Reusing inactive rows is acceptable for idempotent demo seeding.
  const found = all.find(
    (item) => normalize(item.code) === normalizedCode || normalize(item.name) === normalizedName
  );
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createRestaurantSection({
    companyId: ctx.companyId,
    code,
    name,
    sortOrder,
    isActive: true,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateTable(
  ctx: SeedContext,
  sectionId: number,
  code: string,
  label: string,
  sortOrder: number,
  capacity: number
): Promise<RestaurantTable> {
  const all = await storage.getRestaurantTables(ctx.companyId);
  const normalizedCode = normalize(code);
  const normalizedLabel = normalize(label);
  // Reusing inactive rows is acceptable for idempotent demo seeding.
  const found = all.find(
    (item) => normalize(item.code) === normalizedCode || normalize(item.label) === normalizedLabel
  );
  if (found) {
    incReused(ctx);
    return found;
  }
  const created = await storage.createRestaurantTable({
    companyId: ctx.companyId,
    sectionId,
    code,
    label,
    capacity,
    sortOrder,
    isActive: true,
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateProduct(ctx: SeedContext, data: InsertProduct): Promise<Product> {
  if (!data.sku) {
    throw new Error("Demo seed product requires a SKU");
  }
  const existing = await storage.getProductBySku(ctx.companyId, data.sku);
  if (existing) {
    incReused(ctx);
    return existing;
  }
  const created = await storage.createProduct({
    ...data,
    customFields: {
      ...(typeof data.customFields === "object" && data.customFields ? data.customFields : {}),
      demoSeed: ctx.marker,
    },
  });
  incCreated(ctx);
  return created;
}

async function getOrCreateVariant(ctx: SeedContext, data: InsertProductVariant) {
  if (!data.sku) {
    throw new Error("Demo seed variant requires a SKU");
  }
  const existing = await storage.getVariantBySku(ctx.companyId, data.sku);
  if (existing) {
    incReused(ctx);
    return existing;
  }
  const created = await storage.createProductVariant(data);
  incCreated(ctx);
  return created;
}

async function seedInitialStock(
  ctx: SeedContext,
  warehouseId: number,
  productId: number,
  quantity: string,
  variantId: number | null = null
) {
  const existing = await storage.getStockLevelByProductWarehouse(productId, variantId, warehouseId);
  if (existing) {
    incReused(ctx);
    return existing;
  }
  const created = await storage.upsertStockLevel({
    companyId: ctx.companyId,
    productId,
    variantId,
    warehouseId,
    quantity,
    reservedQty: "0",
  });
  incCreated(ctx);
  return created;
}

async function seedStandardErpDemoData(ctx: SeedContext) {
  const unitUnit = await getOrCreateUnit(ctx, { name: "Unit", code: "UNIT", symbol: "u" });
  const unitBox = await getOrCreateUnit(ctx, { name: "Box", code: "BOX", symbol: "bx" });
  const unitHour = await getOrCreateUnit(ctx, { name: "Hour", code: "HOUR", symbol: "hr" });
  const unitKg = await getOrCreateUnit(ctx, { name: "Kilogram", code: "KG", symbol: "kg" });

  const catElectronics = await getOrCreateCategory(ctx, "Electronics");
  const catApparel = await getOrCreateCategory(ctx, "Apparel");
  const catOffice = await getOrCreateCategory(ctx, "Office Supplies");
  const catServices = await getOrCreateCategory(ctx, "Services");

  const brandTech = await getOrCreateBrand(ctx, "TechLine");
  const brandOffice = await getOrCreateBrand(ctx, "OfficePro");
  const brandWear = await getOrCreateBrand(ctx, "UrbanWear");

  await Promise.all([
    getOrCreateTag(ctx, "Demo"),
    getOrCreateTag(ctx, "Featured"),
    getOrCreateTag(ctx, "Inventory"),
    getOrCreateTag(ctx, "Service"),
  ]);

  const warehouse = await getOrCreateWarehouse(ctx, ["Main Warehouse"]);

  const laptop = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catElectronics.id,
    brandId: brandTech.id,
    unitId: unitUnit.id,
    sku: "STD-LAPTOP-14",
    name: "Laptop Pro 14",
    type: "physical",
    status: "active",
    unitPrice: "1299.00",
    costPrice: "980.00",
    tags: ["Demo", "Featured", "Inventory"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });
  const mouse = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catElectronics.id,
    brandId: brandTech.id,
    unitId: unitUnit.id,
    sku: "STD-MOUSE-WL",
    name: "Wireless Mouse",
    type: "physical",
    status: "active",
    unitPrice: "39.00",
    costPrice: "18.00",
    tags: ["Demo", "Inventory"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });
  const chair = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catOffice.id,
    brandId: brandOffice.id,
    unitId: unitUnit.id,
    sku: "STD-CHAIR-OFFICE",
    name: "Office Chair",
    type: "physical",
    status: "active",
    unitPrice: "219.00",
    costPrice: "145.00",
    tags: ["Demo", "Inventory"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });
  const tshirt = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catApparel.id,
    brandId: brandWear.id,
    unitId: unitBox.id,
    sku: "STD-TSHIRT",
    name: "Company T-Shirt",
    type: "physical",
    status: "active",
    unitPrice: "24.00",
    costPrice: "10.00",
    tags: ["Demo", "Inventory"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });
  await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catServices.id,
    brandId: brandOffice.id,
    unitId: unitHour.id,
    sku: "STD-INSTALL-SVC",
    name: "Installation Service",
    type: "service",
    status: "active",
    unitPrice: "85.00",
    costPrice: "45.00",
    tags: ["Demo", "Service"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "hour",
    createdBy: ctx.userId ?? null,
  });

  await seedInitialStock(ctx, warehouse.id, laptop.id, "30");
  await seedInitialStock(ctx, warehouse.id, mouse.id, "160");
  await seedInitialStock(ctx, warehouse.id, chair.id, "45");

  const sizes = [
    { label: "S", sku: "STD-TSHIRT-S", qty: "40" },
    { label: "M", sku: "STD-TSHIRT-M", qty: "55" },
    { label: "L", sku: "STD-TSHIRT-L", qty: "60" },
    { label: "XL", sku: "STD-TSHIRT-XL", qty: "35" },
    { label: "XXL", sku: "STD-TSHIRT-XXL", qty: "20" },
  ];
  for (let i = 0; i < sizes.length; i += 1) {
    const size = sizes[i]!;
    const variant = await getOrCreateVariant(ctx, {
      companyId: ctx.companyId,
      productId: tshirt.id,
      sku: size.sku,
      name: `Size ${size.label}`,
      status: "active",
      sortOrder: i,
      attributes: { size: size.label },
      unitPrice: "24.00",
      costPrice: "10.00",
    });
    await seedInitialStock(ctx, warehouse.id, tshirt.id, size.qty, variant.id);
  }

  void unitKg;
}

async function seedRestaurantFastFoodDemoData(ctx: SeedContext) {
  const unitEach = await getOrCreateUnit(ctx, { name: "Each", code: "EA", symbol: "ea" });
  const unitPortion = await getOrCreateUnit(ctx, { name: "Portion", code: "PORTION", symbol: "portion" });
  const unitGram = await getOrCreateUnit(ctx, { name: "Gram", code: "G", symbol: "g" });
  const unitKg = await getOrCreateUnit(ctx, { name: "Kilogram", code: "KG", symbol: "kg" });
  const unitMl = await getOrCreateUnit(ctx, { name: "Milliliter", code: "ML", symbol: "ml" });
  const unitLiter = await getOrCreateUnit(ctx, { name: "Liter", code: "L", symbol: "l" });
  const unitBox = await getOrCreateUnit(ctx, { name: "Box", code: "BOX", symbol: "bx" });

  const catBurgers = await getOrCreateCategory(ctx, "Burgers", { isMenuCategory: true, menuSortOrder: 1 });
  const catSides = await getOrCreateCategory(ctx, "Sides", { isMenuCategory: true, menuSortOrder: 2 });
  const catDrinks = await getOrCreateCategory(ctx, "Drinks", { isMenuCategory: true, menuSortOrder: 3 });
  const catCombos = await getOrCreateCategory(ctx, "Combos", { isMenuCategory: true, menuSortOrder: 4 });
  const catIngredients = await getOrCreateCategory(ctx, "Ingredients");
  const catPackaging = await getOrCreateCategory(ctx, "Packaging");

  const brandFastFood = await getOrCreateBrand(ctx, "FastFood House");
  const brandGrill = await getOrCreateBrand(ctx, "Grill Line");
  const brandBeverage = await getOrCreateBrand(ctx, "Beverage Bar");

  await Promise.all([
    getOrCreateTag(ctx, "Demo"),
    getOrCreateTag(ctx, "Fast Food"),
    getOrCreateTag(ctx, "Popular"),
    getOrCreateTag(ctx, "Spicy"),
    getOrCreateTag(ctx, "Vegetarian"),
    getOrCreateTag(ctx, "Combo"),
  ]);

  const warehouse = await getOrCreateWarehouse(ctx, ["Main Stockroom", "Main Warehouse"]);

  const grill = await getOrCreateStation(ctx, warehouse.id, "GRILL", "Grill", 1);
  const fryer = await getOrCreateStation(ctx, warehouse.id, "FRYER", "Fryer", 2);
  const beverage = await getOrCreateStation(ctx, warehouse.id, "BEVERAGE", "Beverage", 3);
  const packing = await getOrCreateStation(ctx, warehouse.id, "PACKING", "Packing", 4);

  const mainDining = await getOrCreateSection(ctx, "MAIN-DINING", "Main Dining", 1);
  await Promise.all([
    getOrCreateTable(ctx, mainDining.id, "T1", "Table 1", 1, 2),
    getOrCreateTable(ctx, mainDining.id, "T2", "Table 2", 2, 4),
    getOrCreateTable(ctx, mainDining.id, "T3", "Table 3", 3, 4),
    getOrCreateTable(ctx, mainDining.id, "T4", "Table 4", 4, 6),
  ]);

  const ingredientRows = [
    { sku: "FF-ING-BUN", name: "Burger Bun", categoryId: catIngredients.id, unitId: unitEach.id, qty: "500" },
    { sku: "FF-ING-BEEF-PATTY", name: "Beef Patty", categoryId: catIngredients.id, unitId: unitEach.id, qty: "220" },
    { sku: "FF-ING-CHICKEN-FILLET", name: "Chicken Fillet", categoryId: catIngredients.id, unitId: unitEach.id, qty: "180" },
    { sku: "FF-ING-CHEESE", name: "Cheese Slice", categoryId: catIngredients.id, unitId: unitEach.id, qty: "360" },
    { sku: "FF-ING-LETTUCE", name: "Lettuce", categoryId: catIngredients.id, unitId: unitGram.id, qty: "12000" },
    { sku: "FF-ING-TOMATO", name: "Tomato", categoryId: catIngredients.id, unitId: unitGram.id, qty: "9000" },
    { sku: "FF-ING-POTATO", name: "Fries Potato", categoryId: catIngredients.id, unitId: unitKg.id, qty: "180" },
    { sku: "FF-ING-SODA-SYRUP", name: "Soda Syrup", categoryId: catIngredients.id, unitId: unitLiter.id, qty: "70" },
    { sku: "FF-PACK-CUP", name: "Drink Cup", categoryId: catPackaging.id, unitId: unitEach.id, qty: "1000" },
    { sku: "FF-PACK-BURGER-BOX", name: "Burger Box", categoryId: catPackaging.id, unitId: unitBox.id, qty: "200" },
  ] as const;
  const ingredientsBySku: Record<string, Product> = {};
  for (const row of ingredientRows) {
    const product = await getOrCreateProduct(ctx, {
      companyId: ctx.companyId,
      categoryId: row.categoryId,
      brandId: brandFastFood.id,
      unitId: row.unitId,
      sku: row.sku,
      name: row.name,
      type: "physical",
      status: "active",
      unitPrice: "0.00",
      costPrice: "0.00",
      tags: ["Demo", "Fast Food"],
      isTaxable: false,
      isMenuItem: false,
      unitOfMeasure: row.unitId === unitGram.id ? "gram" : "unit",
      createdBy: ctx.userId ?? null,
    });
    ingredientsBySku[row.sku] = product;
    await seedInitialStock(ctx, warehouse.id, product.id, row.qty);
  }

  const classicBurger = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catBurgers.id,
    brandId: brandGrill.id,
    unitId: unitPortion.id,
    sku: "FF-MENU-CLASSIC-CHEESEBURGER",
    name: "Classic Cheeseburger",
    type: "physical",
    status: "active",
    unitPrice: "8.99",
    costPrice: "3.20",
    tags: ["Demo", "Fast Food", "Popular"],
    isTaxable: true,
    isMenuItem: true,
    preparationTimeMinutes: 8,
    kitchenStationId: grill.id,
    modifiers: [
      {
        name: "Sauce",
        required: true,
        minSelections: 1,
        maxSelections: 2,
        options: [
          { label: "Classic Sauce", priceDelta: 0, isDefault: true },
          { label: "Smoky BBQ", priceDelta: 0.5, isDefault: false },
          { label: "Spicy Mayo", priceDelta: 0.5, isDefault: false },
        ],
      },
      {
        name: "Cheese Add-on",
        required: false,
        minSelections: 0,
        maxSelections: 2,
        options: [{ label: "Extra Cheese", priceDelta: 1.0, isDefault: false }],
      },
    ],
    recipeIngredients: [
      { productId: ingredientsBySku["FF-ING-BUN"]!.id, productName: "Burger Bun", variantId: null, quantity: 1, unit: "each", wastagePercent: 1, yieldPercent: 99 },
      { productId: ingredientsBySku["FF-ING-BEEF-PATTY"]!.id, productName: "Beef Patty", variantId: null, quantity: 1, unit: "each", wastagePercent: 2, yieldPercent: 98 },
      { productId: ingredientsBySku["FF-ING-CHEESE"]!.id, productName: "Cheese Slice", variantId: null, quantity: 1, unit: "each", wastagePercent: 0, yieldPercent: 100 },
      { productId: ingredientsBySku["FF-ING-LETTUCE"]!.id, productName: "Lettuce", variantId: null, quantity: 20, unit: "gram", wastagePercent: 8, yieldPercent: 92 },
      { productId: ingredientsBySku["FF-ING-TOMATO"]!.id, productName: "Tomato", variantId: null, quantity: 25, unit: "gram", wastagePercent: 10, yieldPercent: 90 },
      { productId: ingredientsBySku["FF-PACK-BURGER-BOX"]!.id, productName: "Burger Box", variantId: null, quantity: 1, unit: "each", wastagePercent: 0, yieldPercent: 100 },
    ],
    unitOfMeasure: "portion",
    createdBy: ctx.userId ?? null,
  });

  const crispyChicken = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catBurgers.id,
    brandId: brandGrill.id,
    unitId: unitPortion.id,
    sku: "FF-MENU-CRISPY-CHICKEN-BURGER",
    name: "Crispy Chicken Burger",
    type: "physical",
    status: "active",
    unitPrice: "9.49",
    costPrice: "3.35",
    tags: ["Demo", "Fast Food", "Spicy"],
    isTaxable: true,
    isMenuItem: true,
    preparationTimeMinutes: 9,
    kitchenStationId: grill.id,
    modifiers: [
      {
        name: "Sauce",
        required: true,
        minSelections: 1,
        maxSelections: 2,
        options: [
          { label: "Garlic Mayo", priceDelta: 0, isDefault: true },
          { label: "Chipotle", priceDelta: 0.5, isDefault: false },
        ],
      },
      {
        name: "Spice Level",
        required: false,
        minSelections: 0,
        maxSelections: 1,
        options: [
          { label: "Mild", priceDelta: 0, isDefault: true },
          { label: "Hot", priceDelta: 0, isDefault: false },
          { label: "Extra Hot", priceDelta: 0.25, isDefault: false },
        ],
      },
    ],
    recipeIngredients: [
      { productId: ingredientsBySku["FF-ING-BUN"]!.id, productName: "Burger Bun", variantId: null, quantity: 1, unit: "each", wastagePercent: 1, yieldPercent: 99 },
      { productId: ingredientsBySku["FF-ING-CHICKEN-FILLET"]!.id, productName: "Chicken Fillet", variantId: null, quantity: 1, unit: "each", wastagePercent: 2, yieldPercent: 98 },
      { productId: ingredientsBySku["FF-ING-LETTUCE"]!.id, productName: "Lettuce", variantId: null, quantity: 18, unit: "gram", wastagePercent: 8, yieldPercent: 92 },
      { productId: ingredientsBySku["FF-PACK-BURGER-BOX"]!.id, productName: "Burger Box", variantId: null, quantity: 1, unit: "each", wastagePercent: 0, yieldPercent: 100 },
    ],
    unitOfMeasure: "portion",
    createdBy: ctx.userId ?? null,
  });

  const fries = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catSides.id,
    brandId: brandFastFood.id,
    unitId: unitPortion.id,
    sku: "FF-MENU-FRENCH-FRIES",
    name: "French Fries",
    type: "physical",
    status: "active",
    unitPrice: "3.99",
    costPrice: "1.1",
    tags: ["Demo", "Fast Food", "Vegetarian"],
    isTaxable: true,
    isMenuItem: true,
    preparationTimeMinutes: 5,
    kitchenStationId: fryer.id,
    modifiers: [
      {
        name: "Size",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { label: "Regular", priceDelta: 0, isDefault: true },
          { label: "Large", priceDelta: 1.5, isDefault: false },
        ],
      },
    ],
    recipeIngredients: [
      { productId: ingredientsBySku["FF-ING-POTATO"]!.id, productName: "Fries Potato", variantId: null, quantity: 0.2, unit: "kilogram", wastagePercent: 12, yieldPercent: 88 },
      { productId: ingredientsBySku["FF-PACK-CUP"]!.id, productName: "Drink Cup", variantId: null, quantity: 1, unit: "each", wastagePercent: 0, yieldPercent: 100 },
    ],
    unitOfMeasure: "portion",
    createdBy: ctx.userId ?? null,
  });

  const nuggets = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catSides.id,
    brandId: brandFastFood.id,
    unitId: unitPortion.id,
    sku: "FF-MENU-CHICKEN-NUGGETS",
    name: "Chicken Nuggets",
    type: "physical",
    status: "active",
    unitPrice: "5.49",
    costPrice: "2.15",
    tags: ["Demo", "Fast Food", "Popular"],
    isTaxable: true,
    isMenuItem: true,
    preparationTimeMinutes: 6,
    kitchenStationId: fryer.id,
    modifiers: [
      {
        name: "Size",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { label: "6 pcs", priceDelta: 0, isDefault: true },
          { label: "10 pcs", priceDelta: 2.0, isDefault: false },
        ],
      },
    ],
    unitOfMeasure: "portion",
    createdBy: ctx.userId ?? null,
  });

  const softDrink = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catDrinks.id,
    brandId: brandBeverage.id,
    unitId: unitMl.id,
    sku: "FF-MENU-SOFT-DRINK",
    name: "Soft Drink",
    type: "physical",
    status: "active",
    unitPrice: "2.49",
    costPrice: "0.6",
    tags: ["Demo", "Fast Food", "Popular"],
    isTaxable: true,
    isMenuItem: true,
    preparationTimeMinutes: 2,
    kitchenStationId: beverage.id,
    modifiers: [
      {
        name: "Size",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { label: "Small", priceDelta: 0, isDefault: true },
          { label: "Medium", priceDelta: 0.5, isDefault: false },
          { label: "Large", priceDelta: 1.0, isDefault: false },
        ],
      },
    ],
    recipeIngredients: [
      { productId: ingredientsBySku["FF-ING-SODA-SYRUP"]!.id, productName: "Soda Syrup", variantId: null, quantity: 0.03, unit: "liter", wastagePercent: 2, yieldPercent: 98 },
      { productId: ingredientsBySku["FF-PACK-CUP"]!.id, productName: "Drink Cup", variantId: null, quantity: 1, unit: "each", wastagePercent: 0, yieldPercent: 100 },
    ],
    unitOfMeasure: "milliliter",
    createdBy: ctx.userId ?? null,
  });

  await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catCombos.id,
    brandId: brandFastFood.id,
    unitId: unitEach.id,
    sku: "FF-COMBO-CLASSIC",
    name: "Classic Burger Combo",
    type: "physical",
    status: "active",
    unitPrice: "13.99",
    costPrice: "5.2",
    tags: ["Demo", "Fast Food", "Combo"],
    isTaxable: true,
    isMenuItem: true,
    preparationTimeMinutes: 10,
    kitchenStationId: packing.id,
    comboItems: [
      { productId: classicBurger.id, productName: classicBurger.name, variantId: null, quantity: 1, unit: "portion" },
      { productId: fries.id, productName: fries.name, variantId: null, quantity: 1, unit: "portion" },
      { productId: softDrink.id, productName: softDrink.name, variantId: null, quantity: 1, unit: "portion" },
    ],
    unitOfMeasure: "combo",
    createdBy: ctx.userId ?? null,
  });

  await seedInitialStock(ctx, warehouse.id, crispyChicken.id, "70");
  await seedInitialStock(ctx, warehouse.id, fries.id, "120");
  await seedInitialStock(ctx, warehouse.id, nuggets.id, "110");
}

async function seedDentalDemoData(ctx: SeedContext) {
  const unitUnit = await getOrCreateUnit(ctx, { name: "Unit", code: "UNIT", symbol: "u" });
  const catServices = await getOrCreateCategory(ctx, "Dental Services");
  await getOrCreateTag(ctx, "Demo");
  await getOrCreateTag(ctx, "Dental");
  await getOrCreateTag(ctx, "Service");

  const exam = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catServices.id,
    unitId: unitUnit.id,
    sku: "DENTAL-EXAM",
    name: "Comprehensive Exam",
    type: "service",
    status: "active",
    unitPrice: "85.00",
    costPrice: "0",
    tags: ["Demo", "Dental", "Service"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });
  const cleaning = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catServices.id,
    unitId: unitUnit.id,
    sku: "DENTAL-CLEANING",
    name: "Prophylaxis (Cleaning)",
    type: "service",
    status: "active",
    unitPrice: "120.00",
    costPrice: "0",
    tags: ["Demo", "Dental", "Service"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });
  const filling = await getOrCreateProduct(ctx, {
    companyId: ctx.companyId,
    categoryId: catServices.id,
    unitId: unitUnit.id,
    sku: "DENTAL-FILLING-COMP",
    name: "Composite Filling",
    type: "service",
    status: "active",
    unitPrice: "180.00",
    costPrice: "0",
    tags: ["Demo", "Dental", "Service"],
    isTaxable: true,
    isMenuItem: false,
    unitOfMeasure: "unit",
    createdBy: ctx.userId ?? null,
  });

  const chairs = await storage.listDentalChairs(ctx.companyId);
  const ensureChair = async (code: string, name: string, sortOrder: number) => {
    const found = chairs.find((c) => (c.code || "").toLowerCase() === code.toLowerCase());
    if (found) {
      incReused(ctx);
      return found;
    }
    const created = await storage.createDentalChair({
      companyId: ctx.companyId,
      code,
      name,
      sortOrder,
      isActive: true,
    });
    chairs.push(created);
    incCreated(ctx);
    return created;
  };
  await ensureChair("CHAIR-1", "Operatory 1", 1);
  await ensureChair("CHAIR-2", "Operatory 2", 2);

  const contactSearch = await storage.getContacts({
    companyId: ctx.companyId,
    search: "Abid Patient",
    limit: 5,
    page: 1,
  });
  let patientContact = contactSearch.contacts.find((c) => c.name === "Abid Patient");
  if (!patientContact) {
    patientContact = await storage.createContact({
      companyId: ctx.companyId,
      name: "Abid Shafi",
      phone: "+923059002132",
      email: "admin@app.com",
      identifier: "dental-demo-abid",
      identifierType: "custom",
      source: "erp-demo-seed",
    } as any);
    incCreated(ctx);
  } else {
    incReused(ctx);
  }

  const existingProfile = await storage.getDentalPatientByContactId(ctx.companyId, patientContact.id);
  if (!existingProfile) {
    await storage.createDentalPatientProfile({
      companyId: ctx.companyId,
      contactId: patientContact.id,
      allergies: "None known",
      medicalHistorySummary: "Demo dental patient",
    });
    incCreated(ctx);
  } else {
    incReused(ctx);
  }

  const plans = await storage.listDentalTreatmentPlans(ctx.companyId, {
    contactId: patientContact.id,
    search: "Demo hygiene plan",
    limit: 5,
  });
  const hasPlan = plans.data.some((p) => p.title === "Demo hygiene plan");
  if (!hasPlan) {
    await storage.createDentalTreatmentPlan(
      {
        companyId: ctx.companyId,
        contactId: patientContact.id,
        title: "Demo hygiene plan",
        description: "Sample plan seeded for dental demo mode",
        status: "planned",
        currency: "USD",
        createdBy: ctx.userId ?? null,
        updatedBy: ctx.userId ?? null,
      },
      [
        {
          productId: exam.id,
          description: exam.name,
          phase: 1,
          status: "planned",
          quantity: "1",
          unitPrice: exam.unitPrice ?? "85.00",
          sortOrder: 0,
        },
        {
          productId: cleaning.id,
          description: cleaning.name,
          phase: 1,
          status: "planned",
          quantity: "1",
          unitPrice: cleaning.unitPrice ?? "120.00",
          sortOrder: 1,
        },
        {
          productId: filling.id,
          description: filling.name,
          phase: 2,
          status: "planned",
          quantity: "1",
          unitPrice: filling.unitPrice ?? "180.00",
          toothRefs: ["16"],
          sortOrder: 2,
        },
      ],
    );
    incCreated(ctx);
  } else {
    incReused(ctx);
  }
}

function buildSummary(mode: SeedMode, key: string, status: SeedStatus, counters: SeedCounters): ErpDemoSeedSummary {
  return {
    mode,
    key,
    status,
    created: counters.created,
    reused: counters.reused,
  };
}

export async function ensureErpDemoDataSeeded(params: {
  companyId: number;
  businessType: "standard" | "restaurant" | "dental";
  userId?: number;
}): Promise<ErpDemoSeedSummary> {
  const mode: SeedMode =
    params.businessType === "restaurant"
      ? "restaurant-fastfood"
      : params.businessType === "dental"
        ? "dental"
        : "standard";
  const key =
    mode === "restaurant-fastfood"
      ? ERP_DEMO_SEED_RESTAURANT_FASTFOOD_KEY
      : mode === "dental"
        ? ERP_DEMO_SEED_DENTAL_KEY
        : ERP_DEMO_SEED_STANDARD_KEY;

  const existing = await storage.getCompanySetting(params.companyId, key);
  if (existing?.value) {
    return buildSummary(mode, key, "already_seeded", { created: 0, reused: 0 });
  }

  const ctx: SeedContext = {
    companyId: params.companyId,
    userId: params.userId,
    mode,
    seedVersion: "v1",
    counters: { created: 0, reused: 0 },
    marker: { source: "erp-demo-seed", mode, seedVersion: "v1" },
  };

  if (mode === "restaurant-fastfood") {
    await seedRestaurantFastFoodDemoData(ctx);
  } else if (mode === "standard") {
    await seedStandardErpDemoData(ctx);
  } else if (mode === "dental") {
    await seedDentalDemoData(ctx);
  }

  const metadata: SeedMetadata = {
    mode,
    seedVersion: ctx.seedVersion,
    seededAt: nowIso(),
    created: ctx.counters.created,
    reused: ctx.counters.reused,
  };
  await storage.saveCompanySetting(params.companyId, key, metadata);
  return buildSummary(mode, key, "created", ctx.counters);
}
