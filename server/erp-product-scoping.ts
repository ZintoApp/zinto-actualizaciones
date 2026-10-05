import { and, eq } from "drizzle-orm";
import { productCategories, productVariants } from "@shared/schema";
import { getDb } from "./db";

export class ErpProductScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpProductScopeError";
  }
}

export async function assertProductCategoryInCompany(
  categoryId: number,
  companyId: number
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.id, categoryId), eq(productCategories.companyId, companyId)));
  if (!row) {
    throw new ErpProductScopeError("Category does not belong to this company");
  }
}

export async function assertVariantBelongsToProductAndCompany(
  variantId: number,
  productId: number,
  companyId: number
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
        eq(productVariants.companyId, companyId)
      )
    );
  if (!row) {
    throw new ErpProductScopeError("Variant does not belong to this product");
  }
}
