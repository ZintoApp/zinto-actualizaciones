import {erpMinorUnits,erpMinorUnitsToAmount} from '../../shared/erp-carrying-amount';
import type {ErpOnlineGateway} from '../../shared/erp-payment-gateway';
/** Provider encoding is distinct from configurable ERP ledger precision.
 * Reject unsupported fractions instead of silently changing the amount charged. */
export function gatewayAmount(value:string,currency:string,gateway:ErpOnlineGateway){
 const code=currency.toUpperCase();let digits=new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits??2;
 if(gateway==='mpesa')digits=0;
 if(gateway==='moyasar')digits=2;
 if(gateway==='stripe'&&['ISK','UGX'].includes(code))digits=2;
 const minor=erpMinorUnits(value,digits);
 if(minor<=0n||minor>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Gateway amount is outside the supported range');
 if(gateway==='stripe'&&['ISK','UGX'].includes(code)&&minor%100n!==0n)throw new Error('Gateway does not support fractional '+code+' amounts');
 return {digits,minor:Number(minor),amount:erpMinorUnitsToAmount(minor,digits)};
}

export type ErpGatewayEvidence={paid:boolean;amountText?:string;minorAmount?:number;currency?:string;externalSessionId?:string;referenceNumber?:string;metadata?:Record<string,string>;externalReference?:string};
/** Call only with a signature-verified event or a server-side provider response. */
export function assertErpGatewayEvidence(session:{id:number;companyId:number;invoiceId:number;gateway:string;amount:string;currency:string;externalSessionId:string|null},companyId:number,gateway:ErpOnlineGateway,evidence:ErpGatewayEvidence){
 if(session.companyId!==companyId||session.gateway!==gateway)throw new Error('Checkout company or gateway does not match');
 if(!evidence.paid||evidence.currency?.toUpperCase()!==session.currency.toUpperCase())throw new Error('Provider payment status or currency does not match');
 const encoded=gatewayAmount(session.amount,session.currency,gateway);
 if(evidence.minorAmount!=null){if(!Number.isSafeInteger(evidence.minorAmount)||evidence.minorAmount!==encoded.minor)throw new Error('Provider payment amount does not match');}
 else if(evidence.amountText==null||erpMinorUnits(evidence.amountText,encoded.digits)!==erpMinorUnits(encoded.amount,encoded.digits))throw new Error('Provider payment amount does not match');
 const meta=evidence.metadata;
 if(meta?.checkoutSessionId!==String(session.id)&&evidence.externalReference!==String(session.id))throw new Error('Provider checkout identity does not match');
 if((meta?.companyId!=null&&meta.companyId!==String(companyId))||(meta?.invoiceId!=null&&meta.invoiceId!==String(session.invoiceId)))throw new Error('Provider invoice scope does not match');
 if(['stripe','paystack','paypal'].includes(gateway)&&(!session.externalSessionId||evidence.externalSessionId!==session.externalSessionId))throw new Error('Provider external session does not match');
 if(!evidence.referenceNumber)throw new Error('Provider payment reference is missing');
}
