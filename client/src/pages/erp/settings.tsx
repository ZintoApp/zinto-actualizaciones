import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  GripVertical,
  Layers,
  Upload,
  Bell as TabIconBell,
  BookOpen as TabIconBookOpen,
  Coins as TabIconCoins,
  CreditCard as TabIconCreditCard,
  FileCheck as TabIconFileCheck,
  FileSignature as TabIconFileSignature,
  FileText as TabIconFileText,
  LayoutTemplate as TabIconLayoutTemplate,
  ListPlus as TabIconListPlus,
  NotebookPen as TabIconNotebookPen,
  Percent as TabIconPercent,
  Printer as TabIconPrinter,
  UtensilsCrossed as TabIconUtensilsCrossed,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { getBrowserTimezone } from '@/utils/timezones';
import CatalogSetupPanel from '@/components/erp/settings/CatalogSetupPanel';
import ErpCustomFieldsSettings from '@/components/erp/settings/ErpCustomFieldsSettings';
import RestaurantKitchenStationsSettingsPanel from '@/components/erp/settings/RestaurantKitchenStationsSettingsPanel';
import ErpPaymentGatewaysPanel from '@/components/erp/settings/ErpPaymentGatewaysPanel';
import ElectronicInvoicingSettingsPanel from '@/components/erp/settings/ElectronicInvoicingSettingsPanel';
import DentalProgressNoteTemplatesPanel from '@/components/erp/settings/DentalProgressNoteTemplatesPanel';
import DentalConsentTemplatesPanel from '@/components/erp/settings/DentalConsentTemplatesPanel';
import { InvoicePrintTemplate } from '@/components/erp/InvoicePrintTemplate';
import type { InvoicePrintInvoice, InvoicePrintItem } from '@/components/erp/InvoicePrintTemplate';
import {
  INVOICE_TEMPLATE_DEFAULTS,
  type InvoiceTemplateSettings,
  type InvoiceTemplateType,
} from '@/lib/erp-invoice-template-defaults';
import { INVOICE_PAYMENT_NOTIFICATION_DEFAULTS } from '@/lib/erp-invoice-notification-defaults';
import { QUOTATION_NOTIFICATION_DEFAULTS } from '@/lib/erp-quotation-notification-defaults';
import { resolveMediaUrl } from '@/utils/mediaUrl';

type CurrencyRow = {
  id: number;
  companyId: number;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: string;
  isBaseCurrency: boolean | null;
  isActive: boolean | null;
  decimalPlaces: number | null;
};

type ExchangeRateRow = {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string | null;
};

type TaxRuleRow = {
  id: number;
  name: string;
  rate: string;
  type: string;
  region: string | null;
  country: string | null;
  isDefault: boolean | null;
  isCompound: boolean | null;
  appliesTo: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean | null;
};

type TaxGroupRow = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean | null;
  rulesCount?: number;
};

type TaxGroupRuleEnriched = {
  id: number;
  taxGroupId: number;
  taxRuleId: number;
  order: number | null;
  rule: TaxRuleRow;
};

type ErpSeedSummary = {
  mode: 'standard' | 'restaurant-fastfood' | 'dental';
  status: 'created' | 'already_seeded';
  created: number;
  reused: number;
};

const TAX_TYPES = ['VAT', 'GST', 'sales_tax', 'withholding', 'exempt'] as const;
const APPLIES_TO = ['products', 'services', 'both'] as const;
const EMPTY_GROUP_RULES: TaxGroupRuleEnriched[] = [];

const ORDER_NOTIF_STATUSES = [
  'quotation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;

type OrderNotifStatus = (typeof ORDER_NOTIF_STATUSES)[number];

const ORDER_NOTIF_DEFAULT_MESSAGES: Record<OrderNotifStatus, string> = {
  quotation:
    'Your order {{orderNumber}} is now a quotation. Total: {{currency}} {{totalAmount}}. Valid until: {{validUntil}}.',
  confirmed:
    'Hi {{contactName}}, your order {{orderNumber}} has been confirmed. Total: {{currency}} {{totalAmount}}.',
  processing: 'Your order {{orderNumber}} is now being prepared.',
  shipped: 'Your order {{orderNumber}} has been shipped.',
  delivered: 'Your order {{orderNumber}} has been delivered. Thank you!',
  cancelled: 'Your order {{orderNumber}} has been cancelled.',
  returned: 'Your order {{orderNumber}} has been marked as returned.',
};

function formatOrderNotifStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const SAMPLE_INVOICE_PREVIEW: InvoicePrintInvoice = {
  invoiceNumber: 'INV-10042',
  type: 'sales_invoice',
  status: 'sent',
  issueDate: '2026-04-15',
  dueDate: '2026-05-15',
  subtotal: '240.00',
  taxAmount: '38.40',
  discountAmount: '10.00',
  tipAmount: '12.00',
  serviceChargeAmount: '8.00',
  serviceChargeRate: '10',
  totalAmount: '288.40',
  amountPaid: '100.00',
  amountDue: '188.40',
  currency: 'USD',
  notes: 'Sample invoice for preview.',
  termsAndConditions: null,
  contactId: 1,
  supplierId: null,
  splitBillSeatLabel: null,
  splitBillGroupId: null,
};

const SAMPLE_ITEMS_PREVIEW: InvoicePrintItem[] = [
  {
    productId: 101,
    description: 'Large size',
    quantity: '2',
    unitPrice: '45.00',
    discountPercent: '0',
    taxRate: '16',
    lineTotal: '90.00',
  },
  {
    productId: 102,
    description: null,
    quantity: '1',
    unitPrice: '150.00',
    discountPercent: '5',
    taxRate: '16',
    lineTotal: '142.50',
  },
];

async function getApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    return json.error ?? json.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ERPSettingsPage() {
  const { user, company } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t, currentLanguage } = useTranslation();
  const canManage = hasPermission(PERMISSIONS.MANAGE_ERP_SETTINGS);
  const canViewOrderNotifications =
    canManage ||
    hasPermission(PERMISSIONS.VIEW_ERP_SETTINGS) ||
    hasPermission(PERMISSIONS.VIEW_ERP);
  const { businessType, queryKey: erpBusinessTypeQueryKey } = useErpBusinessType();
  const [pendingBusinessType, setPendingBusinessType] = useState<'standard' | 'restaurant' | 'dental' | 'real_estate'>('standard');
  const [confirmBusinessTypeOpen, setConfirmBusinessTypeOpen] = useState(false);

  const [orderNotifEnabled, setOrderNotifEnabled] = useState(true);
  const [orderNotifMessages, setOrderNotifMessages] = useState<Record<OrderNotifStatus, string>>(() => ({
    ...ORDER_NOTIF_DEFAULT_MESSAGES,
  }));

  const [invoicePayNotifEnabled, setInvoicePayNotifEnabled] = useState(true);
  const [invoicePayNotifPaidMessage, setInvoicePayNotifPaidMessage] = useState(
    () => INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.paid
  );
  const [invoicePlacedNotifMessage, setInvoicePlacedNotifMessage] = useState(
    () => INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.placed
  );

  const [quotationNotifEnabled, setQuotationNotifEnabled] = useState(true);
  const [quotationNotifMessageBody, setQuotationNotifMessageBody] = useState(
    () => QUOTATION_NOTIFICATION_DEFAULTS.messageBody
  );
  const [quotationNotifEmailSubject, setQuotationNotifEmailSubject] = useState(
    () => QUOTATION_NOTIFICATION_DEFAULTS.emailSubject
  );

  const [invoiceTplDefaultType, setInvoiceTplDefaultType] = useState<InvoiceTemplateType>(
    INVOICE_TEMPLATE_DEFAULTS.defaultTemplateType
  );
  const [invoiceTplHeader, setInvoiceTplHeader] = useState(() => ({
    ...INVOICE_TEMPLATE_DEFAULTS.header,
  }));
  const [invoiceTplFooter, setInvoiceTplFooter] = useState(() => ({
    ...INVOICE_TEMPLATE_DEFAULTS.footer,
  }));
  const [invoiceTplA4, setInvoiceTplA4] = useState(() => ({ ...INVOICE_TEMPLATE_DEFAULTS.a4 }));
  const [invoiceTplThermal, setInvoiceTplThermal] = useState(() => ({
    ...INVOICE_TEMPLATE_DEFAULTS.thermal,
  }));
  const [invoiceTplPreviewType, setInvoiceTplPreviewType] = useState<'a4' | 'thermal'>('a4');
  const [invoiceLogoUploading, setInvoiceLogoUploading] = useState(false);

  const currentInvoiceTplSettings: InvoiceTemplateSettings = useMemo(
    () => ({
      defaultTemplateType: invoiceTplDefaultType,
      header: invoiceTplHeader,
      footer: invoiceTplFooter,
      a4: invoiceTplA4,
      thermal: invoiceTplThermal,
    }),
    [invoiceTplDefaultType, invoiceTplHeader, invoiceTplFooter, invoiceTplA4, invoiceTplThermal]
  );

  const sampleContactName = useMemo(
    () => t('erp.settings.invoiceTemplates.previewSample.contactName', 'Abid Customer'),
    [t]
  );

  const sampleProductNameById = useMemo(() => {
    const m = new Map<number, string>();
    m.set(101, t('erp.settings.invoiceTemplates.previewSample.product1', 'Espresso blend (1kg)'));
    m.set(102, t('erp.settings.invoiceTemplates.previewSample.product2', 'Consulting hour'));
    return m;
  }, [t]);

  useEffect(() => {
    setPendingBusinessType(businessType);
  }, [businessType]);

  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyRow | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyRow | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [setBaseTarget, setSetBaseTarget] = useState<CurrencyRow | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formExchangeRate, setFormExchangeRate] = useState('1');
  const [formDecimalPlaces, setFormDecimalPlaces] = useState('2');
  const [formIsBase, setFormIsBase] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);

  const [newRateTo, setNewRateTo] = useState('');
  const [newRateValue, setNewRateValue] = useState('');
  const [newRateDate, setNewRateDate] = useState('');
  const [newRateSource, setNewRateSource] = useState('manual');
  const [editingRateId, setEditingRateId] = useState<number | null>(null);

  const [taxRuleDialogOpen, setTaxRuleDialogOpen] = useState(false);
  const [editingTaxRule, setEditingTaxRule] = useState<TaxRuleRow | null>(null);
  const [formRuleName, setFormRuleName] = useState('');
  const [formRuleRate, setFormRuleRate] = useState('');
  const [formRuleType, setFormRuleType] = useState<string>('VAT');
  const [formRuleCountry, setFormRuleCountry] = useState('');
  const [formRuleRegion, setFormRuleRegion] = useState('');
  const [formRuleDefault, setFormRuleDefault] = useState(false);
  const [formRuleCompound, setFormRuleCompound] = useState(false);
  const [formRuleApplies, setFormRuleApplies] = useState<string>('both');
  const [formRuleFrom, setFormRuleFrom] = useState('');
  const [formRuleTo, setFormRuleTo] = useState('');
  const [formRuleActive, setFormRuleActive] = useState(true);

  const [taxGroupDialogOpen, setTaxGroupDialogOpen] = useState(false);
  const [editingTaxGroup, setEditingTaxGroup] = useState<TaxGroupRow | null>(null);
  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');
  const [formGroupActive, setFormGroupActive] = useState(true);

  const [selectedTaxGroup, setSelectedTaxGroup] = useState<TaxGroupRow | null>(null);
  const [localGroupRules, setLocalGroupRules] = useState<TaxGroupRuleEnriched[]>([]);
  const [addRuleId, setAddRuleId] = useState<string>('');

  const parsedCurrencyExchangeRate = useMemo(() => Number(formExchangeRate.trim()), [formExchangeRate]);
  const currencyRateError = useMemo(() => {
    if (!formExchangeRate.trim()) return t('erp.settings.validation.exchangeRateRequired', 'Exchange rate is required.');
    if (!Number.isFinite(parsedCurrencyExchangeRate)) return t('erp.settings.validation.exchangeRateValid', 'Exchange rate must be a valid number.');
    if (parsedCurrencyExchangeRate <= 0) return t('erp.settings.validation.exchangeRatePositive', 'Exchange rate must be greater than zero.');
    return null;
  }, [formExchangeRate, parsedCurrencyExchangeRate]);

  const parsedDecimalPlaces = useMemo(() => Number(formDecimalPlaces.trim()), [formDecimalPlaces]);
  const decimalPlacesError = useMemo(() => {
    if (!formDecimalPlaces.trim()) return t('erp.settings.validation.decimalPlacesRequired', 'Decimal places is required.');
    if (!Number.isFinite(parsedDecimalPlaces) || !Number.isInteger(parsedDecimalPlaces)) {
      return t('erp.settings.validation.decimalPlacesWhole', 'Decimal places must be a whole number.');
    }
    if (parsedDecimalPlaces < 0) return t('erp.settings.validation.decimalPlacesMin', 'Decimal places must be zero or greater.');
    return null;
  }, [formDecimalPlaces, parsedDecimalPlaces]);

  const parsedNewRateValue = useMemo(() => Number(newRateValue.trim()), [newRateValue]);
  const newRateValueError = useMemo(() => {
    if (!newRateValue.trim()) return t('erp.settings.validation.rateRequired', 'Rate is required.');
    if (!Number.isFinite(parsedNewRateValue)) return t('erp.settings.validation.rateValid', 'Rate must be a valid number.');
    if (parsedNewRateValue <= 0) return t('erp.settings.validation.ratePositive', 'Rate must be greater than zero.');
    return null;
  }, [newRateValue, parsedNewRateValue]);

  const resetCurrencyForm = () => {
    setFormCode('');
    setFormName('');
    setFormSymbol('');
    setFormExchangeRate('1');
    setFormDecimalPlaces('2');
    setFormIsBase(false);
    setFormIsActive(true);
  };

  const openCreateCurrency = () => {
    setEditingCurrency(null);
    resetCurrencyForm();
    setCurrencyDialogOpen(true);
  };

  const openEditCurrency = (c: CurrencyRow) => {
    setEditingCurrency(c);
    setFormCode(c.code);
    setFormName(c.name);
    setFormSymbol(c.symbol);
    setFormExchangeRate(String(c.exchangeRate));
    setFormDecimalPlaces(String(c.decimalPlaces ?? 2));
    setFormIsBase(!!c.isBaseCurrency);
    setFormIsActive(c.isActive !== false);
    setCurrencyDialogOpen(true);
  };

  const { data: currencies = [], isLoading: loadingCurrencies, error: currenciesError } = useQuery({
    queryKey: ['/api/erp/currencies', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/currencies');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.loadCurrencies', 'Failed to load currencies')));
      const json = await res.json();
      return (json.data ?? []) as CurrencyRow[];
    },
    enabled: !!companyId,
  });

  const erpBaseCurrencyRow = useMemo(() => {
    return currencies.find((currency) => currency.isBaseCurrency);
  }, [currencies]);

  const erpBaseCurrencyCode = useMemo(() => {
    const code = erpBaseCurrencyRow?.code?.trim().toUpperCase();
    return code || SAMPLE_INVOICE_PREVIEW.currency?.trim().toUpperCase() || 'USD';
  }, [erpBaseCurrencyRow]);

  const invoicePreviewCurrencyMeta = useMemo(() => {
    if (!erpBaseCurrencyRow) return undefined;
    return {
      name: erpBaseCurrencyRow.name,
      symbol: erpBaseCurrencyRow.symbol,
      decimalPlaces: erpBaseCurrencyRow.decimalPlaces,
    };
  }, [erpBaseCurrencyRow]);

  const sampleInvoicePreview = useMemo(
    () => ({
      ...SAMPLE_INVOICE_PREVIEW,
      currency: erpBaseCurrencyCode,
      notes: t('erp.settings.invoiceTemplates.previewSample.notes', 'Sample invoice for preview.'),
    }),
    [erpBaseCurrencyCode, t]
  );

  const { data: rateHistory, isLoading: loadingRates } = useQuery({
    queryKey: ['/api/erp/currencies/exchange-rates', companyId, selectedCurrency?.code],
    queryFn: async () => {
      if (!selectedCurrency) return { data: [] as ExchangeRateRow[], total: 0 };
      const params = new URLSearchParams();
      params.set('fromCurrency', selectedCurrency.code);
      params.set('limit', '25');
      const res = await apiRequest('GET', `/api/erp/currencies/exchange-rates?${params}`);
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.loadExchangeRates', 'Failed to load exchange rates')));
      const json = await res.json();
      return { data: (json.data ?? []) as ExchangeRateRow[], total: json.total ?? 0 };
    },
    enabled: !!companyId && !!selectedCurrency && ratesOpen,
  });

  const { data: orderNotifData, isLoading: orderNotifLoading } = useQuery({
    queryKey: ['/api/erp/sales-orders/status-notifications', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/sales-orders/status-notifications');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      const json = await res.json();
      return json.data as { enabled: boolean; messages: Record<OrderNotifStatus, string> };
    },
    enabled: !!companyId && canViewOrderNotifications,
  });

  useEffect(() => {
    if (orderNotifData) {
      setOrderNotifEnabled(orderNotifData.enabled);
      setOrderNotifMessages({ ...orderNotifData.messages });
    }
  }, [orderNotifData]);

  const { data: invoicePayNotifData, isLoading: invoicePayNotifLoading } = useQuery({
    queryKey: ['/api/erp/invoices/payment-notification-settings', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/invoices/payment-notification-settings');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      const json = await res.json();
      return json.data as { enabled: boolean; messages: { paid: string; placed: string } };
    },
    enabled: !!companyId && canViewOrderNotifications,
  });

  useEffect(() => {
    if (!invoicePayNotifData) return;
    setInvoicePayNotifEnabled(invoicePayNotifData.enabled);
    setInvoicePayNotifPaidMessage(invoicePayNotifData.messages.paid ?? INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.paid);
    setInvoicePlacedNotifMessage(invoicePayNotifData.messages.placed ?? INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.placed);
  }, [invoicePayNotifData]);

  const saveInvoicePayNotifMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', '/api/erp/invoices/payment-notification-settings', {
        enabled: invoicePayNotifEnabled,
        messages: { paid: invoicePayNotifPaidMessage, placed: invoicePlacedNotifMessage },
      });
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices/payment-notification-settings', companyId] });
      toast({
        title: t('erp.settings.invoicePaymentNotifications.saved', 'Invoice notifications saved'),
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const { data: quotationNotifData, isLoading: quotationNotifLoading } = useQuery({
    queryKey: ['/api/erp/quotation-notifications', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/quotation-notifications');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      const json = await res.json();
      return json.data as { enabled: boolean; messageBody: string; emailSubject: string };
    },
    enabled: !!companyId && canViewOrderNotifications,
  });

  useEffect(() => {
    if (!quotationNotifData) return;
    setQuotationNotifEnabled(quotationNotifData.enabled);
    setQuotationNotifMessageBody(
      quotationNotifData.messageBody ?? QUOTATION_NOTIFICATION_DEFAULTS.messageBody
    );
    setQuotationNotifEmailSubject(
      quotationNotifData.emailSubject ?? QUOTATION_NOTIFICATION_DEFAULTS.emailSubject
    );
  }, [quotationNotifData]);

  const saveQuotationNotifMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', '/api/erp/quotation-notifications', {
        enabled: quotationNotifEnabled,
        messageBody: quotationNotifMessageBody,
        emailSubject: quotationNotifEmailSubject,
      });
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/erp/quotation-notifications', companyId],
      });
      toast({
        title: t('erp.settings.quotationNotifications.saved', 'Quotation notifications saved'),
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const saveOrderNotifMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', '/api/erp/sales-orders/status-notifications', {
        enabled: orderNotifEnabled,
        messages: orderNotifMessages,
      });
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders/status-notifications', companyId] });
      toast({ title: t('erp.settings.orderNotifications.saved', 'Order notifications saved') });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const { data: invoiceTplData, isLoading: invoiceTplLoading } = useQuery({
    queryKey: ['/api/erp/invoices/template-settings', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/invoices/template-settings');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      const json = await res.json();
      return json.data as InvoiceTemplateSettings;
    },
    enabled: !!companyId && canViewOrderNotifications,
  });

  useEffect(() => {
    if (!invoiceTplData) return;
    setInvoiceTplDefaultType(invoiceTplData.defaultTemplateType);
    setInvoiceTplHeader({ ...invoiceTplData.header });
    setInvoiceTplFooter({ ...invoiceTplData.footer });
    setInvoiceTplA4({ ...invoiceTplData.a4 });
    setInvoiceTplThermal({ ...invoiceTplData.thermal });
  }, [invoiceTplData]);

  const saveInvoiceTplMut = useMutation({
    mutationFn: async (body: InvoiceTemplateSettings) => {
      const res = await apiRequest('PUT', '/api/erp/invoices/template-settings', body);
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.requestFailed', 'Failed')));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices/template-settings', companyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices/template-settings'] });
      toast({ title: t('erp.settings.invoiceTemplates.saved', 'Invoice templates saved') });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const handleInvoiceLogoUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('erp.settings.invoiceTemplates.invalidLogo', 'Only image files are allowed.'),
        variant: 'destructive',
      });
      return;
    }
    try {
      setInvoiceLogoUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? t('erp.settings.invoiceTemplates.logoUploadFailed', 'Upload failed'));
      }
      setInvoiceTplHeader((h) => ({ ...h, logoUrl: data.url }));
      toast({ title: t('erp.settings.invoiceTemplates.logoUploaded', 'Logo uploaded') });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : t('erp.settings.invoiceTemplates.logoUploadFailed', 'Upload failed'),
        variant: 'destructive',
      });
    } finally {
      setInvoiceLogoUploading(false);
    }
  };

  const resetInvoiceTplToDefaults = () => {
    const d = JSON.parse(JSON.stringify(INVOICE_TEMPLATE_DEFAULTS)) as InvoiceTemplateSettings;
    setInvoiceTplDefaultType(d.defaultTemplateType);
    setInvoiceTplHeader({ ...d.header });
    setInvoiceTplFooter({
      ...d.footer,
      thankYouNote: t(
        'erp.settings.invoiceTemplates.defaultThankYou',
        INVOICE_TEMPLATE_DEFAULTS.footer.thankYouNote ?? 'Thank you for your business.'
      ),
    });
    setInvoiceTplA4({ ...d.a4 });
    setInvoiceTplThermal({ ...d.thermal });
  };

  const invalidateCurrencies = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/currencies', companyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/currencies/exchange-rates', companyId] });
  };

  const createCurrencyMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest('POST', '/api/erp/currencies', body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.currencyCreated', 'Currency created') });
      invalidateCurrencies();
      setCurrencyDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const updateCurrencyMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/erp/currencies/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.currencyUpdated', 'Currency updated') });
      invalidateCurrencies();
      setCurrencyDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const deleteCurrencyMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/currencies/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.currencyDeleted', 'Currency deleted') });
      invalidateCurrencies();
      setSelectedCurrency(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const setBaseMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/currencies/${id}/set-base`, {});
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.baseCurrencyUpdated', 'Base currency updated') });
      invalidateCurrencies();
      setSetBaseTarget(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const recordRateMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest('POST', '/api/erp/currencies/exchange-rates', body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.rateRecorded', 'Exchange rate recorded') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/currencies/exchange-rates', companyId] });
      invalidateCurrencies();
      setNewRateTo('');
      setNewRateValue('');
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const updateRateMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/erp/currencies/exchange-rates/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.rateUpdated', 'Exchange rate updated') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/currencies/exchange-rates', companyId] });
      invalidateCurrencies();
      setEditingRateId(null);
      setNewRateTo('');
      setNewRateValue('');
      setNewRateDate('');
      setNewRateSource('manual');
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const saveCurrency = () => {
    if (currencyRateError || decimalPlacesError) {
      toast({
        title: t('erp.settings.validation.fixCurrencyFields', 'Fix the highlighted currency fields'),
        description: currencyRateError ?? decimalPlacesError ?? undefined,
        variant: 'destructive',
      });
      return;
    }
    const base = {
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      symbol: formSymbol,
      exchangeRate: formExchangeRate,
      decimalPlaces: parsedDecimalPlaces,
      isBaseCurrency: formIsBase,
      isActive: formIsActive,
    };
    if (editingCurrency) {
      updateCurrencyMut.mutate({ id: editingCurrency.id, body: base });
    } else {
      createCurrencyMut.mutate(base);
    }
  };

  const { data: taxRules = [], isLoading: loadingRules, error: taxRulesError } = useQuery({
    queryKey: ['/api/erp/tax/rules', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/tax/rules');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.loadTaxRules', 'Failed to load tax rules')));
      const json = await res.json();
      return (json.data ?? []) as TaxRuleRow[];
    },
    enabled: !!companyId,
  });

  const { data: taxGroups = [], isLoading: loadingGroups, error: taxGroupsError } = useQuery({
    queryKey: ['/api/erp/tax/groups', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/tax/groups');
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.loadTaxGroups', 'Failed to load tax groups')));
      const json = await res.json();
      return (json.data ?? []) as TaxGroupRow[];
    },
    enabled: !!companyId,
  });

  const { data: groupRulesData, isLoading: loadingGroupRules } = useQuery({
    queryKey: ['/api/erp/tax/groups', selectedTaxGroup?.id, 'rules', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/tax/groups/${selectedTaxGroup!.id}/rules`);
      if (!res.ok) throw new Error(await getApiError(res, t('erp.settings.errors.loadTaxGroupRules', 'Failed to load tax group rules')));
      const json = await res.json();
      return (json.data ?? []) as TaxGroupRuleEnriched[];
    },
    enabled: !!companyId && !!selectedTaxGroup,
  });

  useEffect(() => {
    const nextRules = groupRulesData ?? EMPTY_GROUP_RULES;
    setLocalGroupRules((prev) => (prev === nextRules ? prev : nextRules));
  }, [groupRulesData]);

  const invalidateTax = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/tax/rules', companyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/tax/groups', companyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/tax/groups', selectedTaxGroup?.id, 'rules', companyId] });
  };

  const invalidateErpStarterDataQueries = () => {
    const keys: string[] = [
      '/api/erp/products',
      '/api/erp/products/categories',
      '/api/erp/products/brands',
      '/api/erp/products/tags',
      '/api/erp/products/units',
      '/api/erp/inventory/warehouses',
      '/api/erp/inventory/stock-levels',
      '/api/erp/restaurant/layout/kitchen-stations',
      '/api/erp/restaurant/layout/sections',
      '/api/erp/restaurant/layout/tables',
    ];
    keys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  };

  const createRuleMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest('POST', '/api/erp/tax/rules', body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxRuleSaved', 'Tax rule saved') });
      invalidateTax();
      setTaxRuleDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const updateRuleMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/erp/tax/rules/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxRuleUpdated', 'Tax rule updated') });
      invalidateTax();
      setTaxRuleDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const deleteRuleMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/tax/rules/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxRuleDeleted', 'Tax rule deleted') });
      invalidateTax();
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const createGroupMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest('POST', '/api/erp/tax/groups', body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxGroupSaved', 'Tax group saved') });
      invalidateTax();
      setTaxGroupDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const updateGroupMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/erp/tax/groups/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxGroupUpdated', 'Tax group updated') });
      invalidateTax();
      setTaxGroupDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const deleteGroupMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/tax/groups/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxGroupDeleted', 'Tax group deleted') });
      setSelectedTaxGroup(null);
      invalidateTax();
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const saveGroupRulesMut = useMutation({
    mutationFn: async ({ groupId, rules }: { groupId: number; rules: { taxRuleId: number; order: number }[] }) => {
      const res = await apiRequest('PUT', `/api/erp/tax/groups/${groupId}/rules`, rules);
      if (!res.ok) throw new Error((await res.json()).error ?? t('erp.settings.errors.requestFailed', 'Failed'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.toast.taxGroupRulesSaved', 'Tax group rules saved') });
      invalidateTax();
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const businessTypeLabel = (value: 'standard' | 'restaurant' | 'dental' | 'real_estate') =>
    value === 'real_estate' ? t('erp.settings.businessType.real_estate', 'Real Estate') :
    value === 'restaurant'
      ? t('erp.settings.businessType.restaurant', 'Restaurant')
      : value === 'dental'
        ? t('erp.settings.businessType.dental', 'Dental')
        : t('erp.settings.businessType.standard', 'Standard');

  const saveBusinessTypeMut = useMutation({
    mutationFn: async (nextBusinessType: 'standard' | 'restaurant' | 'dental' | 'real_estate') => {
      const res = await apiRequest('POST', '/api/company-settings/erp-business-type', {
        businessType: nextBusinessType,
        ...(nextBusinessType === 'real_estate' ? { browserTimezone: getBrowserTimezone() } : {}),
      });
      if (!res.ok) {
        throw new Error(await getApiError(res, t('erp.settings.businessType.errors.saveFailed', 'Failed to save ERP business type')));
      }
      const json = await res.json();
      const saved = json?.businessType === 'real_estate' ? 'real_estate' :
        json?.businessType === 'restaurant'
          ? 'restaurant'
          : json?.businessType === 'dental'
            ? 'dental'
            : 'standard';
      return {
        businessType: saved as 'standard' | 'restaurant' | 'dental' | 'real_estate',
        seedSummary: (json?.seedSummary ?? null) as ErpSeedSummary | null,
      };
    },
    onSuccess: ({ businessType: savedBusinessType, seedSummary }) => {
      queryClient.setQueryData(erpBusinessTypeQueryKey, savedBusinessType);
      queryClient.invalidateQueries({ queryKey: erpBusinessTypeQueryKey });
      if (savedBusinessType === 'real_estate') {
        queryClient.invalidateQueries({ queryKey: ['/api/company-settings/default-timezone'] });
        queryClient.invalidateQueries({ queryKey: ['real-estate', companyId] });
      }
      invalidateErpStarterDataQueries();
      const seedDescription = seedSummary
        ? t(
            seedSummary.mode === 'restaurant-fastfood'
              ? 'erp.settings.businessType.seedSummary.restaurant'
              : seedSummary.mode === 'dental'
                ? 'erp.settings.businessType.seedSummary.dental'
                : 'erp.settings.businessType.seedSummary.standard',
            'Created {{created}} records and reused {{reused}} existing records.',
            { created: String(seedSummary.created), reused: String(seedSummary.reused) }
          )
        : undefined;
      if (seedSummary?.status === 'created') {
        toast({
          title: t('erp.settings.businessType.toast.seedCreated', 'Starter data created'),
          description: seedDescription,
        });
      } else if (seedSummary?.status === 'already_seeded') {
        toast({
          title: t('erp.settings.businessType.toast.seedAlreadyAvailable', 'Starter data already available'),
          description: seedDescription,
        });
      } else {
        toast({ title: t('erp.settings.businessType.toast.saved', 'ERP business type updated') });
      }
    },
    onError: (e: Error) =>
      toast({
        title: t('erp.settings.businessType.toast.seedFailed', 'Failed to create starter data'),
        description: e.message,
        variant: 'destructive',
      }),
  });

  const hasBusinessTypeChange = pendingBusinessType !== businessType;

  const requestBusinessTypeSave = () => {
    if (!hasBusinessTypeChange || saveBusinessTypeMut.isPending) return;
    setConfirmBusinessTypeOpen(true);
  };

  const confirmBusinessTypeSave = () => {
    if (!hasBusinessTypeChange || saveBusinessTypeMut.isPending) return;
    setConfirmBusinessTypeOpen(false);
    saveBusinessTypeMut.mutate(pendingBusinessType);
  };

  const resetTaxRuleForm = () => {
    setFormRuleName('');
    setFormRuleRate('');
    setFormRuleType('VAT');
    setFormRuleCountry('');
    setFormRuleRegion('');
    setFormRuleDefault(false);
    setFormRuleCompound(false);
    setFormRuleApplies('both');
    setFormRuleFrom('');
    setFormRuleTo('');
    setFormRuleActive(true);
  };

  const openCreateRule = () => {
    setEditingTaxRule(null);
    resetTaxRuleForm();
    setTaxRuleDialogOpen(true);
  };

  const openEditRule = (r: TaxRuleRow) => {
    setEditingTaxRule(r);
    setFormRuleName(r.name);
    setFormRuleRate(String(r.rate));
    setFormRuleType(r.type);
    setFormRuleCountry(r.country ?? '');
    setFormRuleRegion(r.region ?? '');
    setFormRuleDefault(!!r.isDefault);
    setFormRuleCompound(!!r.isCompound);
    setFormRuleApplies(r.appliesTo);
    setFormRuleFrom(r.effectiveFrom ? r.effectiveFrom.slice(0, 16) : '');
    setFormRuleTo(r.effectiveTo ? r.effectiveTo.slice(0, 16) : '');
    setFormRuleActive(r.isActive !== false);
    setTaxRuleDialogOpen(true);
  };

  const saveTaxRule = () => {
    const body: Record<string, unknown> = {
      name: formRuleName.trim(),
      rate: formRuleRate,
      type: formRuleType,
      country: formRuleCountry || null,
      region: formRuleRegion || null,
      isDefault: formRuleDefault,
      isCompound: formRuleCompound,
      appliesTo: formRuleApplies,
      effectiveFrom: formRuleFrom ? new Date(formRuleFrom).toISOString() : null,
      effectiveTo: formRuleTo ? new Date(formRuleTo).toISOString() : null,
      isActive: formRuleActive,
    };
    if (editingTaxRule) updateRuleMut.mutate({ id: editingTaxRule.id, body });
    else createRuleMut.mutate(body);
  };

  const openCreateGroup = () => {
    setEditingTaxGroup(null);
    setFormGroupName('');
    setFormGroupDesc('');
    setFormGroupActive(true);
    setTaxGroupDialogOpen(true);
  };

  const openEditGroup = (g: TaxGroupRow) => {
    setEditingTaxGroup(g);
    setFormGroupName(g.name);
    setFormGroupDesc(g.description ?? '');
    setFormGroupActive(g.isActive !== false);
    setTaxGroupDialogOpen(true);
  };

  const saveTaxGroup = () => {
    const body = {
      name: formGroupName.trim(),
      description: formGroupDesc || null,
      isActive: formGroupActive,
    };
    if (editingTaxGroup) updateGroupMut.mutate({ id: editingTaxGroup.id, body });
    else createGroupMut.mutate(body);
  };

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !selectedTaxGroup) return;
      const items = Array.from(localGroupRules);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      setLocalGroupRules(items);
    },
    [localGroupRules, selectedTaxGroup]
  );

  const persistRuleOrder = () => {
    if (!selectedTaxGroup) return;
    const payload = localGroupRules.map((r, i) => ({ taxRuleId: r.taxRuleId, order: i }));
    saveGroupRulesMut.mutate({ groupId: selectedTaxGroup.id, rules: payload });
  };

  const addRuleToGroup = () => {
    if (!selectedTaxGroup || !addRuleId) return;
    const id = parseInt(addRuleId, 10);
    const exists = localGroupRules.some((r) => r.taxRuleId === id);
    if (exists) {
      toast({ title: t('erp.settings.errors.ruleAlreadyInGroup', 'Rule already in group'), variant: 'destructive' });
      return;
    }
    const rule = taxRules.find((r) => r.id === id);
    if (!rule) return;
    const next: TaxGroupRuleEnriched = {
      id: -Date.now(),
      taxGroupId: selectedTaxGroup.id,
      taxRuleId: id,
      order: localGroupRules.length,
      rule,
    };
    setLocalGroupRules([...localGroupRules, next]);
    setAddRuleId('');
  };

  const removeRuleFromGroup = (taxRuleId: number) => {
    setLocalGroupRules(localGroupRules.filter((r) => r.taxRuleId !== taxRuleId));
  };

  const availableRulesToAdd = useMemo(() => {
    const inGroup = new Set(localGroupRules.map((r) => r.taxRuleId));
    return taxRules.filter((r) => !inGroup.has(r.id));
  }, [taxRules, localGroupRules]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <h1 data-tour="pages-erp-settings.h1.erp.settings.title" className="mb-4 text-2xl sm:mb-6">{t('erp.settings.title', 'ERP Settings')}</h1>
          <Card className="mb-4 sm:mb-6">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h2 data-tour="pages-erp-settings.h2.erp.settings.businessType.title" className="text-lg font-semibold">{t('erp.settings.businessType.title', 'Business type')}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(
                    'erp.settings.businessType.description',
                    'Choose how ERP navigation is prioritized for your company. Restaurant mode emphasizes order-centric workflows.'
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t(
                    'erp.settings.businessType.seedHelp',
                    'Starter data is created once per company for each mode and can be edited afterward.'
                  )}
                </p>
              </div>
              <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="w-full md:max-w-xs">
                  <Label>{t('erp.settings.businessType.label', 'ERP mode')}</Label>
                  <Select
                    value={pendingBusinessType}
                    onValueChange={(value) => {
                      if (!canManage) return;
                      setPendingBusinessType(
                        value === 'real_estate' ? 'real_estate' : value === 'restaurant' ? 'restaurant' : value === 'dental' ? 'dental' : 'standard'
                      );
                    }}
                    disabled={!canManage || saveBusinessTypeMut.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{t('erp.settings.businessType.standard', 'Standard')}</SelectItem>
                      <SelectItem value="restaurant">{t('erp.settings.businessType.restaurant', 'Restaurant')}</SelectItem>
                      <SelectItem value="real_estate">{t('erp.settings.businessType.real_estate', 'Real Estate')}</SelectItem>
                      <SelectItem value="dental">{t('erp.settings.businessType.dental', 'Dental')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {canManage && (
                  <Button data-tour="pages-erp-settings.button.erp.settings.businessType.saving"
                    onClick={requestBusinessTypeSave}
                    disabled={saveBusinessTypeMut.isPending || !hasBusinessTypeChange}
                  >
                    {saveBusinessTypeMut.isPending ? t('erp.settings.businessType.saving', 'Saving...') : t('erp.common.save', 'Save')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <Tabs defaultValue="currencies" className="space-y-4 sm:space-y-6">
            <div className="-mx-1 px-1 sm:mx-0 sm:px-0">
              <TabsList>
                <TabsTrigger icon={TabIconCoins} data-tour="pages-erp-settings.tabstrigger.currencies" value="currencies">
                  {t('erp.settings.tabs.currencies', 'Currencies')}
                </TabsTrigger>
                <TabsTrigger icon={TabIconPercent} data-tour="pages-erp-settings.tabstrigger.tax" value="tax">
                  {t('erp.settings.tabs.taxConfiguration', 'Tax configuration')}
                </TabsTrigger>
                {canManage ? (
                  <TabsTrigger icon={TabIconCreditCard} data-tour="pages-erp-settings.tabstrigger.paymentGateways" value="paymentGateways">
                    {t('erp.settings.paymentGateways.tab', 'Payment gateways')}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger icon={TabIconBookOpen} data-tour="pages-erp-settings.tabstrigger.catalog" value="catalog">
                  {t('erp.settings.catalog.title', 'Catalog setup')}
                </TabsTrigger>
                {canViewOrderNotifications ? (
                  <TabsTrigger icon={TabIconBell} data-tour="pages-erp-settings.tabstrigger.orderNotifications" value="orderNotifications">
                    {t('erp.settings.orderNotifications.tab', 'Order notifications')}
                  </TabsTrigger>
                ) : null}
                {canViewOrderNotifications ? (
                  <TabsTrigger icon={TabIconLayoutTemplate} data-tour="pages-erp-settings.tabstrigger.invoiceTemplates" value="invoiceTemplates">
                    {t('erp.settings.invoiceTemplates.tab', 'Invoice templates')}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger icon={TabIconListPlus} data-tour="pages-erp-settings.tabstrigger.customFields" value="customFields">
                  {t('erp.settings.tabs.customFields', 'Custom fields')}
                </TabsTrigger>
                <TabsTrigger icon={TabIconFileCheck} data-tour="pages-erp-settings.tabstrigger.electronicInvoicing" value="electronicInvoicing">
                  {t('erp.electronicInvoicing.title', 'Electronic invoicing')}
                </TabsTrigger>
                {businessType === 'dental' ? (
                  <TabsTrigger icon={TabIconFileSignature} data-tour="pages-erp-settings.tabstrigger.consentTemplates" value="consentTemplates">
                    {t('erp.dental.consent.settingsTitle')}
                  </TabsTrigger>
                ) : null}
                {businessType === 'dental' ? (
                  <TabsTrigger icon={TabIconNotebookPen} data-tour="pages-erp-settings.tabstrigger.progressNoteTemplates" value="progressNoteTemplates">
                    {t('erp.dental.clinical.templates.tab', 'Progress Note Templates')}
                  </TabsTrigger>
                ) : null}
                {businessType === 'restaurant' ? (
                  <TabsTrigger icon={TabIconUtensilsCrossed} data-tour="pages-erp-settings.tabstrigger.restaurant" value="restaurant">
                    {t('erp.settings.restaurant.title', 'Restaurant')}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>

             <TabsContent data-tour="pages-erp-settings.tabscontent.currencies" value="currencies">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 data-tour="pages-erp-settings.h2.erp.settings.currencies.title" className="text-lg font-semibold">{t('erp.settings.currencies.title', 'Currencies')}</h2>
                    {canManage && (
                      <Button data-tour="pages-erp-settings.button.erp.settings.currencies.actions.addCurrency" size="sm" onClick={openCreateCurrency}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t('erp.settings.currencies.actions.addCurrency', 'Add currency')}
                      </Button>
                    )}
                  </div>
                  {loadingCurrencies ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : currenciesError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      {(currenciesError as Error).message}
                    </div>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <Table data-tour="pages-erp-settings.table.erp.settings.currencies.table.code" className="min-w-[820px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('erp.settings.currencies.table.code', 'Code')}</TableHead>
                            <TableHead>{t('erp.common.name', 'Name')}</TableHead>
                            <TableHead>{t('erp.settings.currencies.table.symbol', 'Symbol')}</TableHead>
                            <TableHead>{t('erp.settings.currencies.table.exchangeRate', 'Exchange rate')}</TableHead>
                            <TableHead>{t('erp.settings.currencies.table.base', 'Base')}</TableHead>
                            <TableHead>{t('erp.common.active', 'Active')}</TableHead>
                            {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currencies.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">
                                {canManage
                                  ? t('erp.settings.currencies.empty.manage', 'No currencies configured yet. Add a currency to get started.')
                                  : t('erp.settings.currencies.empty.readonly', 'No currencies configured yet.')}
                              </TableCell>
                            </TableRow>
                          ) : currencies.map((c) => (
                            <TableRow
                              key={c.id}
                              className={selectedCurrency?.id === c.id ? 'bg-muted/50' : ''}
                              onClick={() => {
                                setSelectedCurrency(c);
                                setRatesOpen(true);
                              }}
                            >
                              <TableCell className="font-mono">{c.code}</TableCell>
                              <TableCell>{c.name}</TableCell>
                              <TableCell>{c.symbol}</TableCell>
                              <TableCell>{c.exchangeRate}</TableCell>
                              <TableCell>
                                {c.isBaseCurrency ? <Badge>{t('erp.settings.currencies.table.base', 'Base')}</Badge> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>{c.isActive !== false ? t('erp.common.yes', 'Yes') : t('erp.common.no', 'No')}</TableCell>
                              {canManage && (
                                <TableCell className="text-right space-x-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditCurrency(c);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {!c.isBaseCurrency && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSetBaseTarget(c);
                                      }}
                                    >
                                      <Layers className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!c.isBaseCurrency) deleteCurrencyMut.mutate(c.id);
                                    }}
                                    disabled={!!c.isBaseCurrency}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {selectedCurrency && (
                    <Collapsible open={ratesOpen} onOpenChange={setRatesOpen}>
                      <CollapsibleTrigger asChild>
                        <Button data-tour="pages-erp-settings.button.erp.settings.currencies.rateHistoryTitle" variant="outline" className="w-full justify-between">
                          {t('erp.settings.currencies.rateHistoryTitle', 'Exchange rate history: {{code}}', { code: selectedCurrency.code })}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-4">
                        {loadingRates ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <div className="w-full overflow-x-auto">
                            <Table data-tour="pages-erp-settings.table.erp.settings.currencies.history.from" className="min-w-[760px]">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t('erp.settings.currencies.history.from', 'From')}</TableHead>
                                  <TableHead>{t('erp.settings.currencies.history.to', 'To')}</TableHead>
                                  <TableHead>{t('erp.settings.currencies.history.rate', 'Rate')}</TableHead>
                                  <TableHead>{t('erp.settings.currencies.history.effective', 'Effective')}</TableHead>
                                  <TableHead>{t('erp.settings.currencies.history.source', 'Source')}</TableHead>
                                  {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(rateHistory?.data ?? []).length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={canManage ? 6 : 5} className="py-6 text-center text-muted-foreground">
                                      {t('erp.settings.currencies.history.empty', 'No exchange rate history recorded yet.')}
                                    </TableCell>
                                  </TableRow>
                                ) : (rateHistory?.data ?? []).map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell>{r.fromCurrency}</TableCell>
                                    <TableCell>{r.toCurrency}</TableCell>
                                    <TableCell>{r.rate}</TableCell>
                                    <TableCell>{new Date(r.effectiveDate).toLocaleString()}</TableCell>
                                    <TableCell>{r.source ?? '—'}</TableCell>
                                    {canManage && (
                                      <TableCell className="text-right">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => {
                                            setEditingRateId(r.id);
                                            setNewRateTo(r.toCurrency);
                                            setNewRateValue(String(r.rate));
                                            setNewRateDate(new Date(r.effectiveDate).toISOString().slice(0, 16));
                                            setNewRateSource(r.source ?? 'manual');
                                          }}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        {canManage && (
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end border rounded-lg p-4">
                            <div className="md:max-w-[180px]">
                              <Label>{t('erp.settings.currencies.form.toCurrency', 'To currency')}</Label>
                              <Select value={newRateTo || '__none__'} onValueChange={(v) => setNewRateTo(v === '__none__' ? '' : v)}>
                                <SelectTrigger data-tour="pages-erp-settings.selecttrigger.erp.settings.currencies.form.toCurrencyPlaceholder">
                                  <SelectValue placeholder={t('erp.settings.currencies.form.toCurrencyPlaceholder', 'Select currency')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                                  {currencies
                                    .filter((currency) => currency.isActive !== false && currency.code !== selectedCurrency.code)
                                    .map((currency) => (
                                      <SelectItem key={currency.id} value={currency.code}>
                                        {currency.code} - {currency.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('erp.settings.currencies.form.pair', 'Pair: {{code}} -> target', { code: selectedCurrency.code })}
                              </p>
                            </div>
                            <div className="md:max-w-[140px]">
                              <Label>{t('erp.settings.currencies.history.rate', 'Rate')}</Label>
                              <Input data-tour="pages-erp-settings.input.erp.settings.currencies.form.ratePlaceholder"
                                placeholder={t('erp.settings.currencies.form.ratePlaceholder', '1.0')}
                                value={newRateValue}
                                onChange={(e) => setNewRateValue(e.target.value)}
                              />
                              {newRateValueError && (
                                <p className="mt-1 text-sm text-destructive">{newRateValueError}</p>
                              )}
                            </div>
                            <div>
                              <Label>{t('erp.settings.currencies.form.effectiveDate', 'Effective date')}</Label>
                              <Input data-tour="pages-erp-settings.input.erp.settings.currencies.form.toCurrency"
                                type="datetime-local"
                                value={newRateDate}
                                onChange={(e) => setNewRateDate(e.target.value)}
                              />
                            </div>
                            <div>
                              <Label>{t('erp.settings.currencies.history.source', 'Source')}</Label>
                              <Input data-tour="pages-erp-settings.input.erp.settings.currencies.form.toCurrency" value={newRateSource} onChange={(e) => setNewRateSource(e.target.value)} />
                            </div>
                            <Button data-tour="pages-erp-settings.button.erp.settings.currencies.actions.updateRate"
                              className="md:col-span-4"
                              disabled={!newRateTo.trim() || !newRateDate || !!newRateValueError || updateRateMut.isPending || recordRateMut.isPending}
                              onClick={() => {
                                if (newRateValueError) return;
                                const target = newRateTo.trim().toUpperCase();
                                if (editingRateId) {
                                  updateRateMut.mutate({
                                    id: editingRateId,
                                    body: {
                                      fromCurrency: selectedCurrency.code,
                                      toCurrency: target,
                                      rate: newRateValue.trim(),
                                      effectiveDate: new Date(newRateDate).toISOString(),
                                      source: newRateSource || null,
                                    },
                                  });
                                } else {
                                  recordRateMut.mutate({
                                    fromCurrency: selectedCurrency.code,
                                    toCurrency: target,
                                    rate: newRateValue.trim(),
                                    effectiveDate: new Date(newRateDate).toISOString(),
                                    source: newRateSource || null,
                                  });
                                }
                              }}
                            >
                              {editingRateId
                                ? t('erp.settings.currencies.actions.updateRate', 'Update rate')
                                : t('erp.settings.currencies.actions.recordRate', 'Record rate')}
                            </Button>
                            {editingRateId && (
                              <Button data-tour="pages-erp-settings.button.ui.common.cancel"
                                type="button"
                                variant="outline"
                                className="md:col-span-4"
                                onClick={() => {
                                  setEditingRateId(null);
                                  setNewRateTo('');
                                  setNewRateValue('');
                                  setNewRateDate('');
                                  setNewRateSource('manual');
                                }}
                              >
                                {t('ui.common.cancel', 'Cancel')}
                              </Button>
                            )}
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent data-tour="pages-erp-settings.tabscontent.tax" value="tax" className="space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 data-tour="pages-erp-settings.h2.erp.settings.taxRules.title" className="text-lg font-semibold">{t('erp.settings.taxRules.title', 'Tax rules')}</h2>
                    {canManage && (
                      <Button data-tour="pages-erp-settings.button.erp.settings.taxRules.actions.addRule" size="sm" onClick={openCreateRule}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t('erp.settings.taxRules.actions.addRule', 'Add rule')}
                      </Button>
                    )}
                  </div>
                  {loadingRules ? (
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  ) : taxRulesError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      {(taxRulesError as Error).message}
                    </div>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <Table data-tour="pages-erp-settings.table.erp.common.name" className="min-w-[1120px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('erp.common.name', 'Name')}</TableHead>
                            <TableHead>{t('erp.common.type', 'Type')}</TableHead>
                            <TableHead>{t('erp.settings.taxRules.table.ratePercent', 'Rate %')}</TableHead>
                            <TableHead>{t('erp.common.country', 'Country')}</TableHead>
                            <TableHead>{t('erp.common.region', 'Region')}</TableHead>
                            <TableHead>{t('erp.settings.taxRules.table.applies', 'Applies')}</TableHead>
                            <TableHead>{t('erp.settings.taxRules.table.compound', 'Compound')}</TableHead>
                            <TableHead>{t('erp.settings.taxRules.table.default', 'Default')}</TableHead>
                            <TableHead>{t('erp.common.active', 'Active')}</TableHead>
                            {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {taxRules.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={canManage ? 10 : 9} className="py-8 text-center text-muted-foreground">
                                {canManage
                                  ? t('erp.settings.taxRules.empty.manage', 'No tax rules configured yet. Add a rule to get started.')
                                  : t('erp.settings.taxRules.empty.readonly', 'No tax rules configured yet.')}
                              </TableCell>
                            </TableRow>
                          ) : taxRules.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>{r.name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{t(`erp.settings.taxType.${r.type}`, r.type)}</Badge>
                              </TableCell>
                              <TableCell>{r.rate}</TableCell>
                              <TableCell>{r.country ?? '—'}</TableCell>
                              <TableCell>{r.region ?? '—'}</TableCell>
                              <TableCell>{t(`erp.settings.appliesTo.${r.appliesTo}`, r.appliesTo)}</TableCell>
                              <TableCell>{r.isCompound ? t('erp.common.yes', 'Yes') : '—'}</TableCell>
                              <TableCell>{r.isDefault ? <Badge>{t('erp.settings.taxRules.table.default', 'Default')}</Badge> : '—'}</TableCell>
                              <TableCell>{r.isActive !== false ? t('erp.common.yes', 'Yes') : t('erp.common.no', 'No')}</TableCell>
                              {canManage && (
                                <TableCell className="text-right space-x-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditRule(r)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => deleteRuleMut.mutate(r.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 data-tour="pages-erp-settings.h2.erp.settings.taxGroups.title" className="text-lg font-semibold">{t('erp.settings.taxGroups.title', 'Tax groups')}</h2>
                    {canManage && (
                      <Button data-tour="pages-erp-settings.button.erp.settings.taxGroups.actions.addGroup" size="sm" onClick={openCreateGroup}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t('erp.settings.taxGroups.actions.addGroup', 'Add group')}
                      </Button>
                    )}
                  </div>
                  {loadingGroups ? (
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  ) : taxGroupsError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      {(taxGroupsError as Error).message}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="w-full overflow-x-auto">
                        <Table data-tour="pages-erp-settings.table.erp.common.name" className="min-w-[560px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.common.name', 'Name')}</TableHead>
                              <TableHead>{t('erp.settings.taxGroups.table.rules', 'Rules')}</TableHead>
                              <TableHead>{t('erp.common.active', 'Active')}</TableHead>
                              {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {taxGroups.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={canManage ? 4 : 3} className="py-8 text-center text-muted-foreground">
                                  {canManage
                                    ? t('erp.settings.taxGroups.empty.manage', 'No tax groups configured yet. Add a group to get started.')
                                    : t('erp.settings.taxGroups.empty.readonly', 'No tax groups configured yet.')}
                                </TableCell>
                              </TableRow>
                            ) : taxGroups.map((g) => (
                              <TableRow
                                key={g.id}
                                className={selectedTaxGroup?.id === g.id ? 'bg-muted/50' : 'cursor-pointer'}
                                onClick={() => setSelectedTaxGroup(g)}
                              >
                                <TableCell>{g.name}</TableCell>
                                <TableCell>{g.rulesCount ?? '—'}</TableCell>
                                <TableCell>{g.isActive !== false ? t('erp.common.yes', 'Yes') : t('erp.common.no', 'No')}</TableCell>
                                {canManage && (
                                  <TableCell className="text-right space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditGroup(g);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteGroupMut.mutate(g.id);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="border rounded-lg p-4 min-h-[200px]">
                        {!selectedTaxGroup ? (
                          <p className="text-muted-foreground text-sm">{t('erp.settings.taxGroups.selectPrompt', 'Select a tax group to manage rules.')}</p>
                        ) : loadingGroupRules ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <div className="space-y-3">
                            <div className="font-medium">{selectedTaxGroup.name}</div>
                            {canManage && (
                              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                <div className="flex-1">
                                  <Label>{t('erp.settings.taxGroups.actions.addRule', 'Add rule')}</Label>
                                  <Select value={addRuleId} onValueChange={setAddRuleId}>
                                    <SelectTrigger data-tour="pages-erp-settings.selecttrigger.erp.settings.taxGroups.chooseTaxRule">
                                      <SelectValue placeholder={t('erp.settings.taxGroups.chooseTaxRule', 'Choose tax rule')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableRulesToAdd.map((r) => (
                                        <SelectItem key={r.id} value={String(r.id)}>
                                          {r.name} ({r.type} {r.rate}%)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button data-tour="pages-erp-settings.button.erp.common.add" type="button" variant="secondary" onClick={addRuleToGroup}>
                                  {t('erp.common.add', 'Add')}
                                </Button>
                                <Button data-tour="pages-erp-settings.button.erp.settings.taxGroups.actions.saveOrder" type="button" onClick={persistRuleOrder} disabled={saveGroupRulesMut.isPending}>
                                  {t('erp.settings.taxGroups.actions.saveOrder', 'Save order')}
                                </Button>
                              </div>
                            )}
                            <DragDropContext onDragEnd={onDragEnd}>
                              <Droppable droppableId="tax-group-rules">
                                {(provided) => (
                                  <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                                    {localGroupRules.map((item, index) => (
                                      <Draggable
                                        key={`${item.id}-${item.taxRuleId}`}
                                        draggableId={`rule-${item.id}-${item.taxRuleId}`}
                                        index={index}
                                      >
                                        {(dragProvided) => (
                                          <li
                                            ref={dragProvided.innerRef}
                                            {...dragProvided.draggableProps}
                                            className="flex items-center gap-2 border rounded-md p-2 bg-background"
                                          >
                                            <span {...dragProvided.dragHandleProps} className="cursor-grab">
                                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                            <span className="flex-1 text-sm">
                                              {item.rule.name}{' '}
                                              <span className="text-muted-foreground">
                                                ({item.rule.type} {item.rule.rate}%)
                                              </span>
                                            </span>
                                            {canManage && (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeRuleFromGroup(item.taxRuleId)}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </li>
                                        )}
                                      </Draggable>
                                    ))}
                                    {provided.placeholder}
                                  </ul>
                                )}
                              </Droppable>
                            </DragDropContext>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            {canManage ? (
              <TabsContent data-tour="pages-erp-settings.tabscontent.paymentGateways" value="paymentGateways">
                <ErpPaymentGatewaysPanel />
              </TabsContent>
            ) : null}
            <TabsContent data-tour="pages-erp-settings.tabscontent.catalog" value="catalog">
              <CatalogSetupPanel canManage={canManage} isRestaurant={businessType === 'restaurant'} />
            </TabsContent>
             <TabsContent data-tour="pages-erp-settings.tabscontent.customFields" value="customFields">
               <ErpCustomFieldsSettings canManage={canManage} />
             </TabsContent>
             <TabsContent data-tour="pages-erp-settings.tabscontent.electronicInvoicing" value="electronicInvoicing">
               <ElectronicInvoicingSettingsPanel canManage={canManage} isDental={businessType === 'dental'} />
             </TabsContent>
            {businessType === 'dental' ? (
              <TabsContent data-tour="pages-erp-settings.tabscontent.consentTemplates" value="consentTemplates">
                <DentalConsentTemplatesPanel canManage={canManage} />
              </TabsContent>
            ) : null}
            {businessType === 'dental' ? (
              <TabsContent data-tour="pages-erp-settings.tabscontent.progressNoteTemplates" value="progressNoteTemplates">
                <DentalProgressNoteTemplatesPanel canManage={canManage} />
              </TabsContent>
            ) : null}
            {canViewOrderNotifications ? (
            <TabsContent data-tour="pages-erp-settings.tabscontent.orderNotifications" value="orderNotifications">
              <Card>
                <CardContent className="pt-6 space-y-6">
                  {orderNotifLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Label htmlFor="order-notif-enabled" className="text-base">
                            {t('erp.settings.orderNotifications.enableLabel', 'Customer status messages')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t(
                              'erp.settings.orderNotifications.enableHelp',
                              'Send status updates to the customer on the originating channel.'
                            )}
                          </p>
                        </div>
                        <Switch
                          id="order-notif-enabled"
                          checked={orderNotifEnabled}
                          onCheckedChange={setOrderNotifEnabled}
                          disabled={!canManage}
                        />
                      </div>

                      {ORDER_NOTIF_STATUSES.map((status) => (
                        <div key={status} className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={`order-notif-${status}`}>{formatOrderNotifStatusLabel(status)}</Label>
                            <Button data-tour="pages-erp-settings.button.erp.settings.orderNotifications.resetRow"
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canManage}
                              onClick={() =>
                                setOrderNotifMessages((m) => ({
                                  ...m,
                                  [status]: ORDER_NOTIF_DEFAULT_MESSAGES[status],
                                }))
                              }
                            >
                              {t('erp.settings.orderNotifications.resetRow', 'Reset to default')}
                            </Button>
                          </div>
                          <Textarea data-tour="pages-erp-settings.textarea.erp.settings.orderNotifications.resetRow"
                            id={`order-notif-${status}`}
                            value={orderNotifMessages[status] ?? ''}
                            onChange={(e) =>
                              setOrderNotifMessages((m) => ({ ...m, [status]: e.target.value }))
                            }
                            disabled={!canManage}
                            rows={3}
                          />
                        </div>
                      ))}

                      <p className="text-xs text-muted-foreground">
                        {t(
                          'erp.settings.orderNotifications.placeholdersHelp',
                          'Placeholders: {{orderNumber}}, {{status}}, {{statusLabel}}, {{contactName}}, {{currency}}, {{totalAmount}}, {{validUntil}}, {{notes}}'
                        )}
                      </p>

                      {canManage && (
                        <Button data-tour="pages-erp-settings.button.erp.common.saving"
                          type="button"
                          onClick={() => saveOrderNotifMut.mutate()}
                          disabled={saveOrderNotifMut.isPending}
                        >
                          {saveOrderNotifMut.isPending
                            ? t('erp.common.saving', 'Saving…')
                            : t('erp.common.save', 'Save')}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <div className="text-base font-medium">
                      {t('erp.settings.invoicePaymentNotifications.title', 'Invoice notifications')}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(
                        'erp.settings.invoicePaymentNotifications.description',
                        'When an order is placed (confirmed) or a sales invoice becomes fully paid, send the customer the A4 invoice PDF on the same channel as their order (when supported).'
                      )}
                    </p>
                  </div>

                  {invoicePayNotifLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Label htmlFor="invoice-pay-notif-enabled" className="text-base">
                          {t('erp.settings.invoicePaymentNotifications.enabledLabel', 'Notify when invoice is paid in full')}
                        </Label>
                        <Switch
                          id="invoice-pay-notif-enabled"
                          checked={invoicePayNotifEnabled}
                          onCheckedChange={setInvoicePayNotifEnabled}
                          disabled={!canManage}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label htmlFor="invoice-pay-notif-msg">
                            {t('erp.settings.invoicePaymentNotifications.paidMessageLabel', 'Invoice paid message')}
                          </Label>
                          <Button data-tour="pages-erp-settings.button.erp.settings.orderNotifications.resetRow"
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManage}
                            onClick={() =>
                              setInvoicePayNotifPaidMessage(INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.paid)
                            }
                          >
                            {t('erp.settings.orderNotifications.resetRow', 'Reset to default')}
                          </Button>
                        </div>
                        <Textarea data-tour="pages-erp-settings.textarea.invoice-pay-notif-msg"
                          id="invoice-pay-notif-msg"
                          value={invoicePayNotifPaidMessage}
                          onChange={(e) => setInvoicePayNotifPaidMessage(e.target.value)}
                          disabled={!canManage}
                          rows={4}
                          placeholder={t(
                            'erp.settings.invoicePaymentNotifications.paidMessagePlaceholder',
                            INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.paid
                          )}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'erp.settings.invoicePaymentNotifications.placeholderHint',
                            'Placeholders: {{invoiceNumber}}, {{currency}}, {{totalAmount}}, {{contactName}}, {{paidDate}}'
                          )}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label htmlFor="invoice-placed-notif-msg">
                            {t(
                              'erp.settings.invoicePaymentNotifications.placedMessageLabel',
                              'Order placed (invoice attached) message'
                            )}
                          </Label>
                          <Button data-tour="pages-erp-settings.button.erp.settings.orderNotifications.resetRow"
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManage}
                            onClick={() =>
                              setInvoicePlacedNotifMessage(INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.placed)
                            }
                          >
                            {t('erp.settings.orderNotifications.resetRow', 'Reset to default')}
                          </Button>
                        </div>
                        <Textarea data-tour="pages-erp-settings.textarea.invoice-placed-notif-msg"
                          id="invoice-placed-notif-msg"
                          value={invoicePlacedNotifMessage}
                          onChange={(e) => setInvoicePlacedNotifMessage(e.target.value)}
                          disabled={!canManage}
                          rows={4}
                          placeholder={t(
                            'erp.settings.invoicePaymentNotifications.placedMessagePlaceholder',
                            INVOICE_PAYMENT_NOTIFICATION_DEFAULTS.placed
                          )}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'erp.settings.invoicePaymentNotifications.placedPlaceholderHint',
                            'Placeholders: {{orderNumber}}, {{invoiceNumber}}, {{currency}}, {{totalAmount}}, {{contactName}}'
                          )}
                        </p>
                      </div>

                      {canManage && (
                        <Button data-tour="pages-erp-settings.button.erp.common.saving"
                          type="button"
                          onClick={() => saveInvoicePayNotifMut.mutate()}
                          disabled={saveInvoicePayNotifMut.isPending}
                        >
                          {saveInvoicePayNotifMut.isPending
                            ? t('erp.common.saving', 'Saving…')
                            : t('erp.common.save', 'Save')}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <div className="text-base font-medium">
                      {t('erp.settings.quotationNotifications.title', 'Quotation notifications')}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(
                        'erp.settings.quotationNotifications.description',
                        'When you press “Send quotation” on a sales order, deliver the quotation PDF on the customer\'s connected channel using this default subject and message.'
                      )}
                    </p>
                  </div>

                  {quotationNotifLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <Label htmlFor="quotation-notif-enabled" className="text-base">
                            {t(
                              'erp.settings.quotationNotifications.enabledLabel',
                              'Enable quotation notifications'
                            )}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t(
                              'erp.settings.quotationNotifications.enabledHint',
                              'Reserved for future automatic sends. The manual “Send quotation” button always sends.'
                            )}
                          </p>
                        </div>
                        <Switch
                          id="quotation-notif-enabled"
                          checked={quotationNotifEnabled}
                          onCheckedChange={setQuotationNotifEnabled}
                          disabled={!canManage}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label htmlFor="quotation-notif-subject">
                            {t('erp.settings.quotationNotifications.emailSubjectLabel', 'Email subject')}
                          </Label>
                          <Button data-tour="pages-erp-settings.button.erp.settings.orderNotifications.resetRow"
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManage}
                            onClick={() =>
                              setQuotationNotifEmailSubject(QUOTATION_NOTIFICATION_DEFAULTS.emailSubject)
                            }
                          >
                            {t('erp.settings.orderNotifications.resetRow', 'Reset to default')}
                          </Button>
                        </div>
                        <Input data-tour="pages-erp-settings.input.quotation-notif-subject"
                          id="quotation-notif-subject"
                          value={quotationNotifEmailSubject}
                          onChange={(e) => setQuotationNotifEmailSubject(e.target.value)}
                          disabled={!canManage}
                          placeholder={QUOTATION_NOTIFICATION_DEFAULTS.emailSubject}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label htmlFor="quotation-notif-body">
                            {t('erp.settings.quotationNotifications.messageBodyLabel', 'Message body')}
                          </Label>
                          <Button data-tour="pages-erp-settings.button.erp.settings.orderNotifications.resetRow"
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManage}
                            onClick={() =>
                              setQuotationNotifMessageBody(QUOTATION_NOTIFICATION_DEFAULTS.messageBody)
                            }
                          >
                            {t('erp.settings.orderNotifications.resetRow', 'Reset to default')}
                          </Button>
                        </div>
                        <Textarea data-tour="pages-erp-settings.textarea.quotation-notif-body"
                          id="quotation-notif-body"
                          value={quotationNotifMessageBody}
                          onChange={(e) => setQuotationNotifMessageBody(e.target.value)}
                          disabled={!canManage}
                          rows={6}
                          placeholder={QUOTATION_NOTIFICATION_DEFAULTS.messageBody}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'erp.settings.quotationNotifications.placeholderHint',
                            'Placeholders: {{contactName}}, {{orderNumber}}, {{currency}}, {{totalAmount}}, {{validUntil}}, {{companyName}}'
                          )}
                        </p>
                      </div>

                      {canManage && (
                        <Button data-tour="pages-erp-settings.button.erp.common.saving"
                          type="button"
                          onClick={() => saveQuotationNotifMut.mutate()}
                          disabled={saveQuotationNotifMut.isPending}
                        >
                          {saveQuotationNotifMut.isPending
                            ? t('erp.common.saving', 'Saving…')
                            : t('erp.common.save', 'Save')}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            ) : null}
            {canViewOrderNotifications ? (
              <TabsContent data-tour="pages-erp-settings.tabscontent.invoiceTemplates" value="invoiceTemplates">
                <Card>
                  <CardContent className="pt-6">
                    {invoiceTplLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="grid gap-6 lg:gap-8 lg:grid-cols-2">
                        <div className="space-y-6 min-w-0 lg:overflow-y-auto lg:pr-2">
                          <div className="space-y-2">
                            <Label>{t('erp.settings.invoiceTemplates.defaultType', 'Default template')}</Label>
                            <Select
                              value={invoiceTplDefaultType}
                              onValueChange={(v) => setInvoiceTplDefaultType(v as InvoiceTemplateType)}
                              disabled={!canManage}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="a4">
                                  {t('erp.settings.invoiceTemplates.defaultTemplateA4Letter', 'A4 / Letter')}
                                </SelectItem>
                                <SelectItem value="thermal">
                                  {t('erp.settings.invoiceTemplates.templateThermalOption', 'Thermal')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-3 rounded-md border p-4">
                            <div className="font-medium">{t('erp.settings.invoiceTemplates.sharedHeader', 'Shared header')}</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="space-y-1 sm:col-span-2">
                                <Label>{t('erp.settings.invoiceTemplates.businessName', 'Business name')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.businessName ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, businessName: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.address1', 'Address line 1')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.addressLine1 ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, addressLine1: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.address2', 'Address line 2')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.addressLine2 ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, addressLine2: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.city', 'City')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.city ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, city: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.country', 'Country')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.country ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, country: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.phone', 'Phone')}</Label>
                                <LocalizedPhoneInput
                                  value={invoiceTplHeader.phone ?? ''}
                                  onChange={(phone) =>
                                    setInvoiceTplHeader((h) => ({ ...h, phone: phone || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.email', 'Email')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.email ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, email: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.website', 'Website')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.website ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, website: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{t('erp.settings.invoiceTemplates.taxId', 'Tax ID')}</Label>
                                <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.businessName"
                                  value={invoiceTplHeader.taxId ?? ''}
                                  onChange={(e) =>
                                    setInvoiceTplHeader((h) => ({ ...h, taxId: e.target.value || null }))
                                  }
                                  disabled={!canManage}
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label>{t('erp.settings.invoiceTemplates.logoUrl', 'Logo URL')}</Label>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button data-tour="pages-erp-settings.button.erp.settings.invoiceTemplates.uploadLogo"
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canManage || invoiceLogoUploading}
                                    onClick={() => {
                                      document.getElementById('invoice-logo-upload')?.click();
                                    }}
                                  >
                                    {invoiceLogoUploading ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                    <span className="ml-1">{t('erp.settings.invoiceTemplates.uploadLogo', 'Upload')}</span>
                                  </Button>
                                  <input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.uploadLogo"
                                    id="invoice-logo-upload"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleInvoiceLogoUpload(f);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.logoUrlPlaceholder"
                                    value={invoiceTplHeader.logoUrl ?? ''}
                                    onChange={(e) =>
                                      setInvoiceTplHeader((h) => ({ ...h, logoUrl: e.target.value || null }))
                                    }
                                    disabled={!canManage}
                                    placeholder={t(
                                      'erp.settings.invoiceTemplates.logoUrlPlaceholder',
                                      '/media/…'
                                    )}
                                  />
                                </div>
                                {invoiceTplHeader.logoUrl ? (
                                  <img
                                    src={resolveMediaUrl(invoiceTplHeader.logoUrl)}
                                    alt=""
                                    className="mt-2 h-16 w-auto max-w-[200px] rounded border object-contain"
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 rounded-md border p-4">
                            <div className="font-medium">{t('erp.settings.invoiceTemplates.sharedFooter', 'Shared footer')}</div>
                            <div className="space-y-2">
                              <Label>{t('erp.settings.invoiceTemplates.thankYou', 'Thank-you note')}</Label>
                              <Textarea data-tour="pages-erp-settings.textarea.erp.settings.invoiceTemplates.thankYou"
                                value={invoiceTplFooter.thankYouNote ?? ''}
                                onChange={(e) =>
                                  setInvoiceTplFooter((f) => ({ ...f, thankYouNote: e.target.value || null }))
                                }
                                disabled={!canManage}
                                rows={2}
                              />
                              <Label>{t('erp.settings.invoiceTemplates.terms', 'Terms')}</Label>
                              <Textarea data-tour="pages-erp-settings.textarea.erp.settings.invoiceTemplates.thankYou"
                                value={invoiceTplFooter.terms ?? ''}
                                onChange={(e) =>
                                  setInvoiceTplFooter((f) => ({ ...f, terms: e.target.value || null }))
                                }
                                disabled={!canManage}
                                rows={3}
                              />
                              <Label>{t('erp.settings.invoiceTemplates.additionalInfo', 'Additional info')}</Label>
                              <Textarea data-tour="pages-erp-settings.textarea.erp.settings.invoiceTemplates.thankYou"
                                value={invoiceTplFooter.additionalInfo ?? ''}
                                onChange={(e) =>
                                  setInvoiceTplFooter((f) => ({ ...f, additionalInfo: e.target.value || null }))
                                }
                                disabled={!canManage}
                                rows={2}
                              />
                            </div>
                          </div>

                          <Tabs defaultValue="a4" className="w-full">
                            <TabsList>
                              <TabsTrigger icon={TabIconFileText} data-tour="pages-erp-settings.tabstrigger.a4" value="a4">
                                {t('erp.settings.invoiceTemplates.tabs.a4Short', 'A4')}
                              </TabsTrigger>
                              <TabsTrigger icon={TabIconPrinter} data-tour="pages-erp-settings.tabstrigger.thermal" value="thermal">
                                {t('erp.settings.invoiceTemplates.tabs.thermalShort', 'Thermal')}
                              </TabsTrigger>
                            </TabsList>
                            <TabsContent data-tour="pages-erp-settings.tabscontent.a4" value="a4" className="space-y-3 mt-4 rounded-md border p-4">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.paperSize', 'Paper size')}</Label>
                                  <Select
                                    value={invoiceTplA4.paperSize}
                                    onValueChange={(v) =>
                                      setInvoiceTplA4((a) => ({ ...a, paperSize: v as 'a4' | 'letter' }))
                                    }
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="a4">{t('erp.settings.invoiceTemplates.a4Paper', 'A4')}</SelectItem>
                                      <SelectItem value="letter">
                                        {t('erp.settings.invoiceTemplates.paperLetter', 'Letter')}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.accentColor', 'Accent color')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperSize"
                                    type="color"
                                    value={invoiceTplA4.accentColor}
                                    onChange={(e) =>
                                      setInvoiceTplA4((a) => ({ ...a, accentColor: e.target.value }))
                                    }
                                    disabled={!canManage}
                                    className="h-9"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.fontFamily', 'Font family')}</Label>
                                  <Select
                                    value={invoiceTplA4.fontFamily}
                                    onValueChange={(v) =>
                                      setInvoiceTplA4((a) => ({ ...a, fontFamily: v as 'sans' | 'serif' | 'mono' }))
                                    }
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="sans">{t('erp.settings.invoiceTemplates.fontSans', 'Sans')}</SelectItem>
                                      <SelectItem value="serif">{t('erp.settings.invoiceTemplates.fontSerif', 'Serif')}</SelectItem>
                                      <SelectItem value="mono">{t('erp.settings.invoiceTemplates.fontMono', 'Mono')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.fontSizePt', 'Font size (pt)')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperSize"
                                    type="number"
                                    min={6}
                                    max={24}
                                    value={invoiceTplA4.fontSizePt}
                                    onChange={(e) =>
                                      setInvoiceTplA4((a) => ({
                                        ...a,
                                        fontSizePt: Number(e.target.value) || a.fontSizePt,
                                      }))
                                    }
                                    disabled={!canManage}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.marginMm', 'Page margin (mm)')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperSize"
                                    type="number"
                                    min={0}
                                    max={40}
                                    value={invoiceTplA4.marginMm}
                                    onChange={(e) =>
                                      setInvoiceTplA4((a) => ({
                                        ...a,
                                        marginMm: Number(e.target.value) || a.marginMm,
                                      }))
                                    }
                                    disabled={!canManage}
                                  />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                  <Label>{t('erp.settings.invoiceTemplates.watermark', 'Watermark text')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperSize"
                                    value={invoiceTplA4.watermarkText ?? ''}
                                    onChange={(e) =>
                                      setInvoiceTplA4((a) => ({ ...a, watermarkText: e.target.value || null }))
                                    }
                                    disabled={!canManage}
                                  />
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(
                                  [
                                    ['showLogo', t('erp.settings.invoiceTemplates.showLogo', 'Show logo')],
                                    ['showHeader', t('erp.settings.invoiceTemplates.showHeader', 'Show header')],
                                    ['showFooter', t('erp.settings.invoiceTemplates.showFooter', 'Show footer')],
                                    ['showTaxColumn', t('erp.settings.invoiceTemplates.showTaxColumn', 'Tax column')],
                                    ['showDiscountColumn', t('erp.settings.invoiceTemplates.showDiscountColumn', 'Discount column')],
                                    ['showItemDescription', t('erp.settings.invoiceTemplates.showItemDescription', 'Item description')],
                                    ['showPaymentsTable', t('erp.settings.invoiceTemplates.showPaymentsTable', 'Payments table')],
                                    ['showAmountInWords', t('erp.settings.invoiceTemplates.showAmountInWords', 'Amount in words')],
                                    ['showSignatureLine', t('erp.settings.invoiceTemplates.showSignatureLine', 'Signature line')],
                                  ] as const
                                ).map(([key, label]) => (
                                  <div key={key} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                                    <Label className="text-sm font-normal">{label}</Label>
                                    <Switch
                                      checked={invoiceTplA4[key]}
                                      onCheckedChange={(c) =>
                                        setInvoiceTplA4((a) => ({ ...a, [key]: c }))
                                      }
                                      disabled={!canManage}
                                    />
                                  </div>
                                ))}
                              </div>
                            </TabsContent>
                            <TabsContent data-tour="pages-erp-settings.tabscontent.thermal" value="thermal" className="space-y-3 mt-4 rounded-md border p-4">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.paperWidth', 'Paper width')}</Label>
                                  <Select
                                    value={String(invoiceTplThermal.paperWidthMm)}
                                    onValueChange={(v) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        paperWidthMm: Number(v) as 58 | 80,
                                      }))
                                    }
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="58">
                                        {t('erp.settings.invoiceTemplates.paperWidth58', '58 mm')}
                                      </SelectItem>
                                      <SelectItem value="80">
                                        {t('erp.settings.invoiceTemplates.paperWidth80', '80 mm')}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.fontFamily', 'Font family')}</Label>
                                  <Select
                                    value={invoiceTplThermal.fontFamily}
                                    onValueChange={(v) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        fontFamily: v as 'mono' | 'sans',
                                      }))
                                    }
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="mono">{t('erp.settings.invoiceTemplates.fontMono', 'Mono')}</SelectItem>
                                      <SelectItem value="sans">{t('erp.settings.invoiceTemplates.fontSans', 'Sans')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.fontSizePt', 'Font size (pt)')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperWidth"
                                    type="number"
                                    min={6}
                                    max={20}
                                    value={invoiceTplThermal.fontSizePt}
                                    onChange={(e) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        fontSizePt: Number(e.target.value) || th.fontSizePt,
                                      }))
                                    }
                                    disabled={!canManage}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.charsPerLine', 'Characters per line')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperWidth"
                                    type="number"
                                    min={20}
                                    max={64}
                                    value={invoiceTplThermal.charsPerLine}
                                    onChange={(e) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        charsPerLine: Math.max(20, Math.round(Number(e.target.value) || th.charsPerLine)),
                                      }))
                                    }
                                    disabled={!canManage}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.headerAlign', 'Header alignment')}</Label>
                                  <Select
                                    value={invoiceTplThermal.headerAlign}
                                    onValueChange={(v) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        headerAlign: v as 'left' | 'center' | 'right',
                                      }))
                                    }
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="left">{t('erp.common.left', 'Left')}</SelectItem>
                                      <SelectItem value="center">{t('erp.common.center', 'Center')}</SelectItem>
                                      <SelectItem value="right">{t('erp.common.right', 'Right')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('erp.settings.invoiceTemplates.lineSpacing', 'Line spacing')}</Label>
                                  <Select
                                    value={invoiceTplThermal.lineSpacing}
                                    onValueChange={(v) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        lineSpacing: v as 'tight' | 'normal' | 'loose',
                                      }))
                                    }
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="tight">{t('erp.settings.invoiceTemplates.spacingTight', 'Tight')}</SelectItem>
                                      <SelectItem value="normal">{t('erp.settings.invoiceTemplates.spacingNormal', 'Normal')}</SelectItem>
                                      <SelectItem value="loose">{t('erp.settings.invoiceTemplates.spacingLoose', 'Loose')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                  <Label>{t('erp.settings.invoiceTemplates.footerNote', 'Footer note')}</Label>
                                  <Input data-tour="pages-erp-settings.input.erp.settings.invoiceTemplates.paperWidth"
                                    value={invoiceTplThermal.footerNote ?? ''}
                                    onChange={(e) =>
                                      setInvoiceTplThermal((th) => ({
                                        ...th,
                                        footerNote: e.target.value || null,
                                      }))
                                    }
                                    disabled={!canManage}
                                  />
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(
                                  [
                                    ['showLogo', t('erp.settings.invoiceTemplates.showLogo', 'Show logo')],
                                    ['showTaxLine', t('erp.settings.invoiceTemplates.showTaxLine', 'Tax line')],
                                    ['showDiscountLine', t('erp.settings.invoiceTemplates.showDiscountLine', 'Discount line')],
                                    ['showQrCode', t('erp.settings.invoiceTemplates.showQrCode', 'QR code')],
                                  ] as const
                                ).map(([key, label]) => (
                                  <div key={key} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                                    <Label className="text-sm font-normal">{label}</Label>
                                    <Switch
                                      checked={invoiceTplThermal[key]}
                                      onCheckedChange={(c) =>
                                        setInvoiceTplThermal((th) => ({ ...th, [key]: c }))
                                      }
                                      disabled={!canManage}
                                    />
                                  </div>
                                ))}
                              </div>
                            </TabsContent>
                          </Tabs>

                          <div className="flex flex-wrap gap-2">
                            <Button data-tour="pages-erp-settings.button.erp.settings.invoiceTemplates.reset"
                              type="button"
                              variant="outline"
                              onClick={resetInvoiceTplToDefaults}
                            >
                              {t('erp.settings.invoiceTemplates.reset', 'Reset to defaults')}
                            </Button>
                            <Button data-tour="pages-erp-settings.button.erp.common.saving"
                              type="button"
                              onClick={() => saveInvoiceTplMut.mutate(currentInvoiceTplSettings)}
                              disabled={!canManage || saveInvoiceTplMut.isPending}
                            >
                              {saveInvoiceTplMut.isPending
                                ? t('erp.common.saving', 'Saving…')
                                : t('erp.common.save', 'Save')}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2 min-w-0 lg:sticky lg:top-4 lg:self-start">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">{t('erp.settings.invoiceTemplates.livePreview', 'Live preview')}</span>
                            <div className="flex gap-1 rounded-md border p-1">
                              <Button data-tour="pages-erp-settings.button.erp.settings.invoiceTemplates.preview.pickA4"
                                type="button"
                                size="sm"
                                variant={invoiceTplPreviewType === 'a4' ? 'secondary' : 'ghost'}
                                onClick={() => setInvoiceTplPreviewType('a4')}
                              >
                                {t('erp.settings.invoiceTemplates.preview.pickA4', 'A4')}
                              </Button>
                              <Button data-tour="pages-erp-settings.button.erp.settings.invoiceTemplates.preview.pickThermal"
                                type="button"
                                size="sm"
                                variant={invoiceTplPreviewType === 'thermal' ? 'secondary' : 'ghost'}
                                onClick={() => setInvoiceTplPreviewType('thermal')}
                              >
                                {t('erp.settings.invoiceTemplates.preview.pickThermal', 'Thermal')}
                              </Button>
                            </div>
                          </div>
                          <div
                            className="invoice-preview overflow-auto rounded-md border bg-muted/30 p-2 sm:p-4"
                            style={{ maxHeight: 'min(80vh, 900px)' }}
                          >
                            <div
                              className="bg-white text-black shadow-sm mx-auto p-4"
                              style={{
                                width: '100%',
                                maxWidth: invoiceTplPreviewType === 'thermal' ? `${invoiceTplThermal.paperWidthMm * 1.2}px` : '210mm',
                              }}
                            >
                              <InvoicePrintTemplate
                                templateType={invoiceTplPreviewType}
                                settings={currentInvoiceTplSettings}
                                invoice={sampleInvoicePreview}
                                items={SAMPLE_ITEMS_PREVIEW}
                                payments={[]}
                                contactName={sampleContactName}
                                supplierName={t('erp.invoicePrint.placeholder.dash', '—')}
                                companyName={
                                  company?.name ??
                                  user?.username ??
                                  t(
                                    'erp.settings.invoiceTemplates.preview.companyFallback',
                                    'Your company'
                                  )
                                }
                                productNameById={sampleProductNameById}
                                language={currentLanguage?.code ?? 'en'}
                                currencyMeta={invoicePreviewCurrencyMeta}
                                t={t}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
            {businessType === 'restaurant' ? (
              <TabsContent data-tour="pages-erp-settings.tabscontent.restaurant" value="restaurant">
                <RestaurantKitchenStationsSettingsPanel canManage={canManage} />
              </TabsContent>
            ) : null}
          </Tabs>

          <Dialog open={currencyDialogOpen} onOpenChange={setCurrencyDialogOpen}>
            <DialogContent data-tour="pages-erp-settings.dialogcontent.erp.settings.currencyDialog.editTitle">
              <DialogHeader>
                <DialogTitle>{editingCurrency ? t('erp.settings.currencyDialog.editTitle', 'Edit currency') : t('erp.settings.currencyDialog.addTitle', 'Add currency')}</DialogTitle>
                <DialogDescription>
                  {t('erp.settings.currencyDialog.description', 'Configure currency details and exchange behavior for ERP transactions.')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>{t('erp.settings.currencyDialog.code', 'Code (ISO4217)')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.settings.currencyDialog.code"
                    value={formCode}
                    onChange={(e) => {
                      const normalizedCode = e.target.value.replace(/[^a-z]/gi, '').toUpperCase();
                      setFormCode(normalizedCode);
                    }}
                    maxLength={3}
                    placeholder="USD"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('erp.settings.currencyDialog.codeHelp', 'Use a 3-letter ISO 4217 code (for example: USD, EUR, GBP).')}
                  </p>
                </div>
                <div>
                  <Label>{t('erp.common.name', 'Name')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.settings.currencyDialog.code" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.settings.currencies.table.symbol', 'Symbol')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.settings.currencyDialog.code" value={formSymbol} onChange={(e) => setFormSymbol(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.settings.currencyDialog.exchangeRateToBase', 'Exchange rate (to base)')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.settings.currencyDialog.code" value={formExchangeRate} onChange={(e) => setFormExchangeRate(e.target.value)} />
                  {currencyRateError && (
                    <p className="mt-1 text-sm text-destructive">{currencyRateError}</p>
                  )}
                </div>
                <div>
                  <Label>{t('erp.settings.currencyDialog.decimalPlaces', 'Decimal places')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.settings.currencyDialog.code" value={formDecimalPlaces} onChange={(e) => setFormDecimalPlaces(e.target.value)} />
                  {decimalPlacesError && (
                    <p className="mt-1 text-sm text-destructive">{decimalPlacesError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formIsBase} onCheckedChange={setFormIsBase} id="cur-base" />
                  <Label htmlFor="cur-base">{t('erp.settings.currencyDialog.baseCurrency', 'Base currency')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formIsActive} onCheckedChange={setFormIsActive} id="cur-active" />
                  <Label htmlFor="cur-active">{t('erp.common.active', 'Active')}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button data-tour="pages-erp-settings.button.ui.common.cancel" variant="outline" onClick={() => setCurrencyDialogOpen(false)}>
                  {t('ui.common.cancel', 'Cancel')}
                </Button>
                <Button data-tour="pages-erp-settings.button.erp.common.save"
                  onClick={saveCurrency}
                  disabled={
                    createCurrencyMut.isPending ||
                    updateCurrencyMut.isPending ||
                    !!currencyRateError ||
                    !!decimalPlacesError
                  }
                >
                  {t('erp.common.save', 'Save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!setBaseTarget} onOpenChange={() => setSetBaseTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('erp.settings.baseCurrencyDialog.title', 'Set base currency')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'erp.settings.baseCurrencyDialog.description',
                    'Setting {{code}} as base will mark other currencies as non-base. Update exchange rates so amounts stay consistent relative to the new base.',
                    { code: setBaseTarget?.code ?? '' }
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (setBaseTarget) setBaseMut.mutate(setBaseTarget.id);
                  }}
                >
                  {t('erp.common.continue', 'Continue')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={confirmBusinessTypeOpen}
            onOpenChange={(open) => {
              if (!saveBusinessTypeMut.isPending) setConfirmBusinessTypeOpen(open);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('erp.settings.businessType.confirm.title', 'Confirm ERP mode switch')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'erp.settings.businessType.confirm.description',
                    'Switch ERP mode from {{from}} to {{to}}? This may create starter data and update restaurant QR availability.',
                    {
                      from: businessTypeLabel(businessType),
                      to: businessTypeLabel(pendingBusinessType),
                    }
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saveBusinessTypeMut.isPending}>
                  {t('ui.common.cancel', 'Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmBusinessTypeSave} disabled={saveBusinessTypeMut.isPending}>
                  {t('erp.common.continue', 'Continue')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={taxRuleDialogOpen} onOpenChange={setTaxRuleDialogOpen}>
            <DialogContent data-tour="pages-erp-settings.dialogcontent.erp.settings.taxRuleDialog.editTitle" className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingTaxRule ? t('erp.settings.taxRuleDialog.editTitle', 'Edit tax rule') : t('erp.settings.taxRuleDialog.addTitle', 'Add tax rule')}</DialogTitle>
                <DialogDescription>
                  {t('erp.settings.taxRuleDialog.description', 'Define tax rule type, rate, and applicability for products and services.')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>{t('erp.common.name', 'Name')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" value={formRuleName} onChange={(e) => setFormRuleName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.settings.taxRules.table.ratePercent', 'Rate %')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" value={formRuleRate} onChange={(e) => setFormRuleRate(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.common.type', 'Type')}</Label>
                  <Select value={formRuleType} onValueChange={setFormRuleType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {TAX_TYPES.map((taxType) => (
                        <SelectItem key={taxType} value={taxType}>
                          {t(`erp.settings.taxType.${taxType}`, taxType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('erp.common.country', 'Country')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" value={formRuleCountry} onChange={(e) => setFormRuleCountry(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.common.region', 'Region')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" value={formRuleRegion} onChange={(e) => setFormRuleRegion(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.settings.taxRuleDialog.appliesTo', 'Applies to')}</Label>
                  <Select value={formRuleApplies} onValueChange={setFormRuleApplies}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {APPLIES_TO.map((appliesTo) => (
                        <SelectItem key={appliesTo} value={appliesTo}>
                          {t(`erp.settings.appliesTo.${appliesTo}`, appliesTo)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('erp.settings.taxRuleDialog.effectiveFrom', 'Effective from')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" type="datetime-local" value={formRuleFrom} onChange={(e) => setFormRuleFrom(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.settings.taxRuleDialog.effectiveTo', 'Effective to')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" type="datetime-local" value={formRuleTo} onChange={(e) => setFormRuleTo(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formRuleDefault} onCheckedChange={setFormRuleDefault} id="rule-def" />
                  <Label htmlFor="rule-def">{t('erp.settings.taxRuleDialog.defaultRule', 'Default rule')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formRuleCompound} onCheckedChange={setFormRuleCompound} id="rule-comp" />
                  <Label htmlFor="rule-comp">{t('erp.settings.taxRules.table.compound', 'Compound')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formRuleActive} onCheckedChange={setFormRuleActive} id="rule-act" />
                  <Label htmlFor="rule-act">{t('erp.common.active', 'Active')}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button data-tour="pages-erp-settings.button.ui.common.cancel" variant="outline" onClick={() => setTaxRuleDialogOpen(false)}>
                  {t('ui.common.cancel', 'Cancel')}
                </Button>
                <Button data-tour="pages-erp-settings.button.erp.common.save" onClick={saveTaxRule} disabled={createRuleMut.isPending || updateRuleMut.isPending}>
                  {t('erp.common.save', 'Save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={taxGroupDialogOpen} onOpenChange={setTaxGroupDialogOpen}>
            <DialogContent data-tour="pages-erp-settings.dialogcontent.erp.settings.taxGroupDialog.editTitle">
              <DialogHeader>
                <DialogTitle>{editingTaxGroup ? t('erp.settings.taxGroupDialog.editTitle', 'Edit tax group') : t('erp.settings.taxGroupDialog.addTitle', 'Add tax group')}</DialogTitle>
                <DialogDescription>
                  {t('erp.settings.taxGroupDialog.description', 'Organize multiple tax rules into a reusable group configuration.')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>{t('erp.common.name', 'Name')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.common.description', 'Description')}</Label>
                  <Input data-tour="pages-erp-settings.input.erp.common.name" value={formGroupDesc} onChange={(e) => setFormGroupDesc(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formGroupActive} onCheckedChange={setFormGroupActive} id="grp-act" />
                  <Label htmlFor="grp-act">{t('erp.common.active', 'Active')}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button data-tour="pages-erp-settings.button.ui.common.cancel" variant="outline" onClick={() => setTaxGroupDialogOpen(false)}>
                  {t('ui.common.cancel', 'Cancel')}
                </Button>
                <Button data-tour="pages-erp-settings.button.erp.common.save" onClick={saveTaxGroup} disabled={createGroupMut.isPending || updateGroupMut.isPending}>
                  {t('erp.common.save', 'Save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
    </div>
  );
}
