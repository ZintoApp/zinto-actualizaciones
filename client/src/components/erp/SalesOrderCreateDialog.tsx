import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { ProductPicker, type ProductPickerOption } from '@/components/erp/product-picker';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type ContactOption = { id: number; name: string };
type DealOption = { id: number; title: string; contactId?: number | null };
type TeamMember = { id: number; fullName: string | null; username: string };
type CurrencyOption = { code: string; isBaseCurrency: boolean | null; isActive: boolean | null };
type VariantOption = { id: number; name: string; unitPrice: string | null };

type StagedLineItem = {
  productId: number;
  variantId: number | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
  modifierSelections: never[];
  specialInstructions: null;
  productName: string;
};

export type CreatedSalesOrder = {
  id: number;
  orderNumber: string;
  contactId: number | null;
  status: string;
  currency: string | null;
  totalAmount: string;
  validUntil: string | null;
  createdAt: string;
};

export type SalesOrderCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'order' | 'quotation';
  fixedContact?: ContactOption | null;
  requireLineItems?: boolean;
  allowCreateAndSend?: boolean;
  onCreated?: (order: CreatedSalesOrder, intent: 'save' | 'send') => void;
};

function lineTotal(item: StagedLineItem): string {
  const base = Number(item.quantity || 0) * Number(item.unitPrice || 0);
  return (base - base * (Number(item.discountPercent || 0) / 100)).toFixed(2);
}

function linePayload(item: StagedLineItem) {
  const { productName: _productName, ...payload } = item;
  return payload;
}

export function SalesOrderCreateDialog({
  open,
  onOpenChange,
  mode = 'quotation',
  fixedContact = null,
  requireLineItems = false,
  allowCreateAndSend = false,
  onCreated,
}: SalesOrderCreateDialogProps) {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [contactId, setContactId] = useState('');
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [dealId, setDealId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [validUntil, setValidUntil] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingLine, setShippingLine] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [billingLine, setBillingLine] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [product, setProduct] = useState<ProductPickerOption | null>(null);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<StagedLineItem[]>([]);
  const [intent, setIntent] = useState<'save' | 'send'>('save');

  const { data: contactsResult } = useQuery({
    queryKey: ['/api/contacts', companyId, 'sales-order-create-dialog'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/contacts?page=1&limit=500');
      return res.json() as Promise<{ contacts: ContactOption[] }>;
    },
    enabled: open && !!companyId && !fixedContact,
  });
  const contacts = contactsResult?.contacts ?? [];

  const { data: deals = [] } = useQuery({
    queryKey: ['/api/deals', companyId, 'sales-order-create-dialog'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/deals');
      return res.json() as Promise<DealOption[]>;
    },
    enabled: open && !!companyId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['/api/team-members', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      return res.json() as Promise<TeamMember[]>;
    },
    enabled: open && !!companyId,
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['/api/erp/currencies', companyId, 'sales-order-create-dialog'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/currencies');
      const json = await res.json();
      return (json.data ?? []) as CurrencyOption[];
    },
    enabled: open && !!companyId,
  });

  const currencyCodes = useMemo(() => {
    const codes = currencies.filter((entry) => entry.isActive !== false).map((entry) => entry.code.toUpperCase());
    return codes.length ? codes : ['USD'];
  }, [currencies]);
  const baseCurrency = currencies.find((entry) => entry.isBaseCurrency)?.code?.toUpperCase() || currencyCodes[0] || 'USD';
  const productId = product ? String(product.id) : '';

  const { data: variants = [] } = useQuery({
    queryKey: ['/api/erp/products', companyId, productId, 'variants'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/products/${productId}/variants`);
      const json = await res.json();
      return (json.data ?? []) as VariantOption[];
    },
    enabled: open && !!companyId && !!productId,
  });

  const reset = () => {
    setContactId(fixedContact ? String(fixedContact.id) : '');
    setContactPickerOpen(false);
    setDealId('');
    setCurrency(baseCurrency);
    setValidUntil('');
    setAssignedTo('');
    setNotes('');
    setShippingLine('');
    setShippingCity('');
    setBillingLine('');
    setBillingCity('');
    setProduct(null);
    setVariantId('');
    setQuantity('1');
    setUnitPrice('');
    setDiscount('0');
    setTax('0');
    setDescription('');
    setItems([]);
    setIntent('save');
  };

  useEffect(() => {
    if (open) {
      setContactId(fixedContact ? String(fixedContact.id) : '');
      setCurrency(baseCurrency);
    }
  }, [open, fixedContact?.id, baseCurrency]);

  const pendingItem = (): StagedLineItem | null => {
    if (!product || !unitPrice.trim()) return null;
    return {
      productId: product.id,
      variantId: variantId ? Number(variantId) : null,
      description: description.trim() || null,
      quantity,
      unitPrice,
      discountPercent: discount,
      taxRate: tax,
      modifierSelections: [],
      specialInstructions: null,
      productName: product.name,
    };
  };

  const clearLine = () => {
    setProduct(null);
    setVariantId('');
    setQuantity('1');
    setUnitPrice('');
    setDiscount('0');
    setTax('0');
    setDescription('');
  };

  const createMutation = useMutation({
    mutationFn: async (submitIntent: 'save' | 'send') => {
      setIntent(submitIntent);
      const pending = pendingItem();
      const allItems = pending ? [...items, pending] : items;
      if (requireLineItems && allItems.length === 0) {
        throw new Error(t('contacts.sales.validation.lineRequired', 'Add at least one product or service.'));
      }
      const body = {
        status: mode === 'quotation' ? 'quotation' : 'draft',
        contactId: contactId ? Number(contactId) : null,
        dealId: dealId ? Number(dealId) : null,
        currency,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        assignedToUserId: assignedTo ? Number(assignedTo) : null,
        notes: notes.trim() || undefined,
        shippingAddress: shippingLine.trim() || shippingCity.trim() ? { line1: shippingLine, city: shippingCity } : undefined,
        billingAddress: billingLine.trim() || billingCity.trim() ? { line1: billingLine, city: billingCity } : undefined,
        lineItems: allItems.map(linePayload),
      };
      const res = await apiRequest('POST', '/api/erp/sales-orders', body);
      const json = await res.json();
      return { order: json.data as CreatedSalesOrder, submitIntent };
    },
    onSuccess: ({ order, submitIntent }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders'] });
      toast({ title: t('erp.salesOrders.quotationCreated', 'Quotation created') });
      onOpenChange(false);
      reset();
      onCreated?.(order, submitIntent);
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const selectedContactName = fixedContact?.name || contacts.find((entry) => String(entry.id) === contactId)?.name;
  const availableDeals = fixedContact ? deals.filter((deal) => deal.contactId == null || deal.contactId === fixedContact.id) : deals;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent data-tour="components-erp-salesordercreatedialog.dialogcontent.erp.salesOrders.newQuotation" className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === 'quotation' ? t('erp.salesOrders.newQuotation', 'New quotation') : t('erp.salesOrders.newOrder', 'New sales order')}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('erp.salesOrders.form.contact', 'Contact')}</Label>
            {fixedContact ? (
              <Input data-tour="components-erp-salesordercreatedialog.input.erp.salesOrders.form.contact" value={fixedContact.name} disabled aria-label={t('erp.salesOrders.form.contact', 'Contact')} />
            ) : (
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild><Button data-tour="components-erp-salesordercreatedialog.button.erp.salesOrders.form.selectContact" type="button" variant="outline" role="combobox" className="w-full justify-between font-normal"><span className="truncate">{selectedContactName || t('erp.salesOrders.form.selectContact', 'Select contact')}</span><ChevronsUpDown className="h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput placeholder={t('erp.salesOrders.form.searchContact', 'Search contact...')} /><CommandList><CommandEmpty>{t('erp.common.noResults', 'No results')}</CommandEmpty>{contacts.map((entry) => <CommandItem key={entry.id} value={`${entry.name} ${entry.id}`} onSelect={() => { setContactId(String(entry.id)); setContactPickerOpen(false); }}><Check className={cn('mr-2 h-4 w-4', contactId === String(entry.id) ? 'opacity-100' : 'opacity-0')} />{entry.name}</CommandItem>)}</CommandList></Command></PopoverContent>
              </Popover>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label>{t('erp.salesOrders.form.dealOptional', 'Deal (optional)')}</Label><Select value={dealId || '__none__'} onValueChange={(value) => setDealId(value === '__none__' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>{availableDeals.map((deal) => <SelectItem key={deal.id} value={String(deal.id)}>{deal.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t('erp.salesOrders.form.assignedTo', 'Assigned to')}</Label><Select value={assignedTo || '__none__'} onValueChange={(value) => setAssignedTo(value === '__none__' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={String(member.id)}>{member.fullName || member.username}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t('erp.common.currency', 'Currency')}</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencyCodes.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t('erp.salesOrders.form.validUntil', 'Valid until')}</Label><Input data-tour="components-erp-salesordercreatedialog.input.erp.common.currency" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>{t('erp.common.notes', 'Notes')}</Label><Textarea data-tour="components-erp-salesordercreatedialog.textarea.erp.salesOrders.form.contact" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label>{t('erp.salesOrders.form.shipping', 'Shipping')}</Label><Input data-tour="components-erp-salesordercreatedialog.input.erp.salesOrders.form.addressLine" placeholder={t('erp.salesOrders.form.addressLine', 'Address line')} value={shippingLine} onChange={(event) => setShippingLine(event.target.value)} /><Input data-tour="components-erp-salesordercreatedialog.input.erp.salesOrders.form.city" placeholder={t('erp.salesOrders.form.city', 'City')} value={shippingCity} onChange={(event) => setShippingCity(event.target.value)} /></div>
            <div className="space-y-2"><Label>{t('erp.salesOrders.form.billing', 'Billing')}</Label><Input data-tour="components-erp-salesordercreatedialog.input.erp.salesOrders.form.addressLine" placeholder={t('erp.salesOrders.form.addressLine', 'Address line')} value={billingLine} onChange={(event) => setBillingLine(event.target.value)} /><Input data-tour="components-erp-salesordercreatedialog.input.erp.salesOrders.form.city" placeholder={t('erp.salesOrders.form.city', 'City')} value={billingCity} onChange={(event) => setBillingCity(event.target.value)} /></div>
          </div>
          <div className="space-y-3 border-t pt-4">
            <Label>{t('contacts.sales.productsRequired', 'Products / services')}</Label>
            <ProductPicker companyId={companyId} value={product} onChange={(value) => { setProduct(value); setVariantId(''); setUnitPrice(value?.unitPrice || ''); }} queryKeyScope="shared-sales-order-create" />
            {productId && variants.length > 0 && <Select value={variantId || '__none__'} onValueChange={(value) => { const next = value === '__none__' ? '' : value; setVariantId(next); const variant = variants.find((entry) => String(entry.id) === next); if (variant?.unitPrice) setUnitPrice(variant.unitPrice); }}><SelectTrigger data-tour="components-erp-salesordercreatedialog.selecttrigger.erp.common.variant"><SelectValue placeholder={t('erp.common.variant', 'Variant')} /></SelectTrigger><SelectContent><SelectItem value="__none__">{t('erp.salesOrders.form.defaultOrNone', 'Default / none')}</SelectItem>{variants.map((variant) => <SelectItem key={variant.id} value={String(variant.id)}>{variant.name}</SelectItem>)}</SelectContent></Select>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Input data-tour="components-erp-salesordercreatedialog.input.erp.common.qty" aria-label={t('erp.common.qty', 'Qty')} placeholder={t('erp.common.qty', 'Qty')} value={quantity} onChange={(event) => setQuantity(event.target.value)} /><Input data-tour="components-erp-salesordercreatedialog.input.erp.common.unitPrice" aria-label={t('erp.common.unitPrice', 'Unit price')} placeholder={t('erp.common.unitPrice', 'Unit price')} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /><Input data-tour="components-erp-salesordercreatedialog.input.erp.common.discountPercent" aria-label={t('erp.common.discountPercent', 'Discount %')} placeholder={t('erp.common.discountPercent', 'Discount %')} value={discount} onChange={(event) => setDiscount(event.target.value)} /><Input data-tour="components-erp-salesordercreatedialog.input.erp.common.taxPercent" aria-label={t('erp.common.taxPercent', 'Tax %')} placeholder={t('erp.common.taxPercent', 'Tax %')} value={tax} onChange={(event) => setTax(event.target.value)} /></div>
            <Input data-tour="components-erp-salesordercreatedialog.input.erp.common.description" placeholder={t('erp.common.description', 'Description')} value={description} onChange={(event) => setDescription(event.target.value)} />
            <Button data-tour="components-erp-salesordercreatedialog.button.erp.salesOrders.form.addItem" type="button" variant="outline" size="sm" disabled={!product || !unitPrice.trim()} onClick={() => { const item = pendingItem(); if (item) { setItems((current) => [...current, item]); clearLine(); } }}><Plus className="mr-1 h-4 w-4" />{t('erp.salesOrders.form.addItem', 'Add item')}</Button>
            {items.length > 0 && <div className="overflow-x-auto"><Table data-tour="components-erp-salesordercreatedialog.table.erp.common.product" erpSortable={false}><TableHeader><TableRow><TableHead>{t('erp.common.product', 'Product')}</TableHead><TableHead>{t('erp.common.qty', 'Qty')}</TableHead><TableHead>{t('erp.common.unitPrice', 'Unit price')}</TableHead><TableHead>{t('erp.common.total', 'Total')}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{items.map((item, index) => <TableRow key={`${item.productId}-${index}`}><TableCell>{item.productName}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{item.unitPrice}</TableCell><TableCell>{lineTotal(item)}</TableCell><TableCell><Button type="button" variant="ghost" size="icon" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button data-tour="components-erp-salesordercreatedialog.button.ui.common.cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('ui.common.cancel', 'Cancel')}</Button>
          <Button data-tour="components-erp-salesordercreatedialog.button.contacts.sales.saveQuotation" type="button" variant={allowCreateAndSend ? 'outline' : 'default'} disabled={createMutation.isPending} onClick={() => createMutation.mutate('save')}>{createMutation.isPending && intent === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('contacts.sales.saveQuotation', 'Save quotation')}</Button>
          {allowCreateAndSend && <Button data-tour="components-erp-salesordercreatedialog.button.contacts.sales.saveAndSend" type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate('send')}>{createMutation.isPending && intent === 'send' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('contacts.sales.saveAndSend', 'Save & send')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
