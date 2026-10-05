import { storage, ErpValidationError } from "../../storage";
import type { TaxRule } from "@shared/schema";
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {invoiceLineSubtotalValue} from '../../invoice-discount-math';

const INTERNAL_SCALE = 8;

function stripToScaled(s: string, scale: number): bigint {
  let t = String(s).trim();
  const neg = t.startsWith("-");
  if (neg) t = t.slice(1);
  const [ip, fp = ""] = t.split(".");
  const ipClean = ip.replace(/^0+(\d)/, "$1") || (fp ? "0" : "0");
  const fpPadded = (fp + "0".repeat(scale)).slice(0, scale);
  const combined = (ipClean + fpPadded).replace(/^0+(\d)/, "$1") || "0";
  let v = BigInt(combined);
  if (neg) v = -v;
  return v;
}

function scaledToString(v: bigint, scale: number): string {
  if(scale===0)return v.toString();
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(scale + 1, "0");
  const ip = s.slice(0, -scale) || "0";
  let fp = s.slice(-scale).replace(/0+$/, "");
  let out = fp ? `${ip}.${fp}` : ip;
  if (neg) out = `-${out}`;
  return out;
}

// ERP money rounds half away from zero, without binary floating-point ties.
function roundScaled(v: bigint, sourceScale: number, digits: number): string {
  const factor = 10n ** BigInt(sourceScale - digits);
  const absolute = v < 0n ? -v : v;
  const rounded = (absolute + factor / 2n) / factor;
  const value = (v < 0n ? -rounded : rounded);
  const raw = scaledToString(value, digits);
  const [whole, fraction = ""] = raw.split(".");
  return digits?`${whole}.${fraction.padEnd(digits, "0")}`:whole;
}

function addDecimal(a: string, b: string): string {
  const sa = stripToScaled(a, INTERNAL_SCALE);
  const sb = stripToScaled(b, INTERNAL_SCALE);
  return scaledToString(sa + sb, INTERNAL_SCALE);
}

function mulDecimal(a: string, b: string, outFracDigits: number): string {
  const sa = stripToScaled(a, INTERNAL_SCALE);
  const sb = stripToScaled(b, INTERNAL_SCALE);
  const prod = (sa * sb) / 10n ** BigInt(INTERNAL_SCALE);
  return roundScaled(prod, INTERNAL_SCALE, outFracDigits);
}

function divDecimalToRate(amount: string, base: string, outFracDigits: number): string {
  const sa = stripToScaled(amount, INTERNAL_SCALE);
  const sb = stripToScaled(base, INTERNAL_SCALE);
  if (sb === 0n) return "0";
  const quot = (sa * 100n * 10n ** BigInt(INTERNAL_SCALE)) / sb;
  return roundScaled(quot, INTERNAL_SCALE, outFracDigits);
}

function lineSubtotal(quantity: string, unitPrice: string, discountPercent?: string,decimalPlaces=2): string {
  const discount=discountPercent==null||discountPercent===''?'0':discountPercent;
  for(const value of [quantity,unitPrice,discount])if(!/^-?\d+(\.\d{1,8})?$/.test(value))throw new ErpValidationError('Enter valid ERP invoice line amounts');
  return invoiceLineSubtotalValue({quantity,unitPrice,discountPercent:discount},{discountValueExplicit:false,decimalPlaces});
}

function isRuleInEffect(rule: TaxRule, asOf: Date): boolean {
  if (rule.effectiveFrom && asOf < new Date(rule.effectiveFrom)) return false;
  if (rule.effectiveTo && asOf > new Date(rule.effectiveTo)) return false;
  return true;
}

function appliesToMatches(rule: TaxRule, productType?: string): boolean {
  if (!productType) return true;
  const pt = productType === "service" ? "services" : ["product", "physical", "digital"].includes(productType) ? "products" : productType;
  if (rule.appliesTo === "both") return true;
  return rule.appliesTo === pt;
}

export async function calculateTax(
  companyId: number,
  lineAmount: string,
  taxGroupId: number | null,
  taxRate?: string,
  options: { asOf?: Date; productType?: string; country?: string; region?: string; decimalPlaces?:number } = {}
): Promise<{
  taxAmount: string;
  effectiveRate: string;
  breakdown: Array<{ ruleName: string; rate: string; amount: string }>;
}> {
  const digits=erpCurrencyDigits(options.decimalPlaces);
  const zero=digits?`0.${"0".repeat(digits)}`:"0";
  const breakdown: Array<{ ruleName: string; rate: string; amount: string }> = [];
  if (!/^-?\d+(\.\d{1,8})?$/.test(lineAmount)) throw new ErpValidationError("Enter a valid tax base amount");
  const asOf = options.asOf ?? new Date();
  if (!Number.isFinite(asOf.getTime())) throw new ErpValidationError("Enter a valid tax calculation date");
   if (taxGroupId != null) {
    const group = await storage.getTaxGroup(taxGroupId);
    if (!group || group.companyId !== companyId || !group.isActive) throw new ErpValidationError("Select an active company ERP tax group");
    const links = await storage.getTaxGroupRules(taxGroupId);
    const sorted = [...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let priorTaxTotal = "0";
    let totalTax = "0";
    for (const link of sorted) {
      const rule = await storage.getTaxRule(link.taxRuleId);
      if (!rule || rule.companyId !== companyId || !rule.isActive) continue;
      if (!isRuleInEffect(rule, asOf) || !appliesToMatches(rule, options.productType)) continue;
      if (options.country && rule.country && rule.country !== options.country) continue;
      if (options.region && rule.region && rule.region !== options.region) continue;
      if (rule.type === "exempt" || Number(rule.rate) === 0) {
        breakdown.push({ ruleName: rule.name, rate: String(rule.rate), amount: zero });
        continue;
      }
      const rateFrac = mulDecimal(String(rule.rate), "0.01", 8);
      const base = rule.isCompound ? addDecimal(lineAmount, priorTaxTotal) : lineAmount;
      const part = mulDecimal(base, rateFrac, INTERNAL_SCALE);
      breakdown.push({ ruleName: rule.name, rate: String(rule.rate), amount: roundScaled(stripToScaled(part, INTERNAL_SCALE), INTERNAL_SCALE, 4) });
      totalTax = addDecimal(totalTax, part);
      priorTaxTotal = addDecimal(priorTaxTotal, part);
    }
    const eff = Number(lineAmount) === 0 ? "0.00" : divDecimalToRate(totalTax, lineAmount, 4);
    return { taxAmount: roundScaled(stripToScaled(totalTax, INTERNAL_SCALE), INTERNAL_SCALE, digits), effectiveRate: eff, breakdown };
  }
  if (taxRate != null && taxRate !== "") {
    if (!/^\d+(\.\d{1,8})?$/.test(taxRate)) throw new ErpValidationError("Enter a valid tax percentage");
    const rateFrac = mulDecimal(String(taxRate), "0.01", 8);
    const taxAmount = mulDecimal(lineAmount, rateFrac, INTERNAL_SCALE);
    return {
      taxAmount: roundScaled(stripToScaled(taxAmount, INTERNAL_SCALE), INTERNAL_SCALE, digits),
      effectiveRate: roundScaled(stripToScaled(taxRate, INTERNAL_SCALE), INTERNAL_SCALE, 2),
      breakdown: [{ ruleName: "Flat rate", rate: String(taxRate), amount: roundScaled(stripToScaled(taxAmount, INTERNAL_SCALE), INTERNAL_SCALE, digits) }],
    };
  }
  return { taxAmount: zero, effectiveRate: "0.00", breakdown: [] };
}

export async function getApplicableTaxRules(
  companyId: number,
  options: { productType?: string; country?: string; region?: string }
): Promise<TaxRule[]> {
  const all = await storage.getTaxRules(companyId, { isActive: true });
  const asOf = new Date();
  return all.filter((rule) => {
    if (!isRuleInEffect(rule, asOf)) return false;
    if (!appliesToMatches(rule, options.productType)) return false;
    if (options.country && rule.country && rule.country !== options.country) return false;
    if (options.region && rule.region && rule.region !== options.region) return false;
    return true;
  });
}

export async function calculateLineTotals(
  companyId: number,
  items: Array<{
    quantity: string;
    unitPrice: string;
    discountPercent?: string;
    taxGroupId?: number;
    taxRate?: string;
    productType?: string;
  }>,
  options: { asOf?: Date; country?: string; region?: string; decimalPlaces?:number } = {}
): Promise<{
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  itemTotals: Array<{ lineTotal: string; taxAmount: string; effectiveRate: string }>;
}> {
  const digits=erpCurrencyDigits(options.decimalPlaces);
  let subtotal = "0.00";
  let taxAmount = "0.00";
  const itemTotals: Array<{ lineTotal: string; taxAmount: string; effectiveRate: string }> = [];
  for (const it of items) {
    const lineTotal = lineSubtotal(it.quantity, it.unitPrice, it.discountPercent,digits);
    const tax = await calculateTax(companyId, lineTotal, it.taxGroupId ?? null, it.taxRate, {...options,productType:it.productType});
    subtotal = roundScaled(stripToScaled(addDecimal(subtotal,lineTotal),INTERNAL_SCALE),INTERNAL_SCALE,digits);
    taxAmount = roundScaled(stripToScaled(addDecimal(taxAmount,tax.taxAmount),INTERNAL_SCALE),INTERNAL_SCALE,digits);
    itemTotals.push({ lineTotal, taxAmount: tax.taxAmount, effectiveRate:tax.effectiveRate });
  }
  const totalAmount = roundScaled(stripToScaled(addDecimal(subtotal,taxAmount),INTERNAL_SCALE),INTERNAL_SCALE,digits);
  return { subtotal, taxAmount, totalAmount, itemTotals };
}
