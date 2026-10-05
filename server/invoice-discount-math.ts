/** Shared invoice discount calculations for routes, Flowbuilder, and storage. */
import {multiplyErpDecimals, roundErpDecimal, sumErpDecimals} from './services/erp/decimal-math';
import {erpCurrencyDigits} from '../shared/erp-currency-precision';

/** Persisted ERP invoice lines round before header aggregation. */
export function invoiceLineSubtotalValue(input:{quantity?:unknown;unitPrice?:unknown;discountType?:unknown;discountValue?:unknown;discountPercent?:unknown},opts?:{discountValueExplicit?:boolean;decimalPlaces?:number}):string {
 const digits=erpCurrencyDigits(opts?.decimalPlaces);
 if(digits!==2){
  const base=multiplyErpDecimals(String(input.quantity??1),String(input.unitPrice??0),8);
  const positiveBase=Number(base)>0?base:'0';
  const explicit=opts?.discountValueExplicit??Object.prototype.hasOwnProperty.call(input,'discountValue');
  const value=String(explicit?input.discountValue??0:input.discountPercent??0);
  const discount=String(input.discountType??'percentage')==='fixed_amount'?value:multiplyErpDecimals(positiveBase,multiplyErpDecimals(value,'0.01',8),8);
  const bounded=Number(discount)<=0?'0':Number(discount)>=Number(positiveBase)?positiveBase:discount;
  return sumErpDecimals([base,`-${bounded}`],digits);
 }
 const quantity=Number(input.quantity??1),unitPrice=Number(input.unitPrice??0);
 const explicit=opts?.discountValueExplicit??Object.prototype.hasOwnProperty.call(input,'discountValue');
 const discount=invoiceLineDiscountAmount({quantity,unitPrice,discountType:input.discountType==null?undefined:String(input.discountType),discountValue:explicit?Number(input.discountValue??0):undefined,discountPercent:Number(input.discountPercent??0)});
 return (quantity*unitPrice-discount).toFixed(2);
}

export function invoiceHeaderDiscountAmount(subtotal: number, discountType: string, discountValue: number): number {
  const s = Math.max(0, Number.isFinite(subtotal) ? subtotal : 0);
  const v = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
  if (discountType === 'none') return 0;
  if (discountType === 'percentage') {
    const raw = s * (v / 100);
    return Math.min(Math.max(0, raw), s);
  }
  if (discountType === 'fixed_amount') {
    return Math.min(Math.max(0, v), s);
  }
  return 0;
}

export function invoiceLineDiscountAmount(params: {
  quantity: number;
  unitPrice: number;
  discountType: string | null | undefined;
  /** When omitted (and not `null`), percentage lines use legacy `discountPercent` even if it is 0. */
  discountValue?: number | null;
  discountPercent: number;
}): number {
  const qty = Number.isFinite(params.quantity) ? params.quantity : 0;
  const price = Number.isFinite(params.unitPrice) ? params.unitPrice : 0;
  const base = Math.max(0, qty * price);
  const dtype = String(params.discountType ?? 'percentage');
  const rawVal = params.discountValue;
  const valueSupplied = rawVal !== undefined && rawVal !== null;
  if (dtype === 'fixed_amount') {
    const v = valueSupplied && Number.isFinite(Number(rawVal)) ? Math.max(0, Number(rawVal)) : 0;
    return Math.min(v, base);
  }
  let pct: number;
  if (valueSupplied) {
    const parsed = Number(rawVal);
    pct = Number.isFinite(parsed) ? parsed : 0;
  } else {
    pct = Number.isFinite(params.discountPercent) ? params.discountPercent : 0;
  }
  const raw = base * ((Number.isFinite(pct) ? pct : 0) / 100);
  return Math.min(Math.max(0, raw), base);
}
