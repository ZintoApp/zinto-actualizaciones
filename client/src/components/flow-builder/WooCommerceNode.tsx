import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, Settings, X, Play, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Store, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';

/** Inline help copy (whitelabeled) */
const WOOCOMMERCE_INLINE_HELP = {
  connection: 'Use your WooCommerce REST API credentials. In WordPress: WooCommerce → Settings → Advanced → REST API. Create a key with Read/Write permission. Your site must have SSL and pretty permalinks enabled.',
  modules: 'Available modules: Coupons, Customers, Orders, Order notes, Products, Product attributes & terms, Product categories, Product variations, Reports, Payment gateways, Shipping zones, Tax rates.',
  operation: 'Choose what to do with the selected resource (e.g. search, get one, create, update, delete). The operation determines the HTTP method used for the API call.',
};

/** WooCommerce REST API resources */
const WOOCOMMERCE_RESOURCES = [
  { id: 'coupons', name: 'Coupons', endpoint: 'coupons' },
  { id: 'customers', name: 'Customers', endpoint: 'customers' },
  { id: 'orders', name: 'Orders', endpoint: 'orders' },
  { id: 'order_notes', name: 'Order notes', endpoint: 'orders' },
  { id: 'products', name: 'Products', endpoint: 'products' },
  { id: 'product_attributes', name: 'Product attributes', endpoint: 'products/attributes' },
  { id: 'product_attribute_terms', name: 'Product attribute terms', endpoint: 'products/attributes' },
  { id: 'product_categories', name: 'Product categories', endpoint: 'products/categories' },
  { id: 'product_variations', name: 'Product variations', endpoint: 'products' },
  { id: 'reports', name: 'Reports', endpoint: 'reports' },
  { id: 'payment_gateways', name: 'Payment Gateways', endpoint: 'payment_gateways' },
  { id: 'shipping_zones', name: 'Shipping Zones', endpoint: 'shipping/zones' },
  { id: 'tax_rates', name: 'Tax Rates', endpoint: 'taxes' }
];

/** Operations per resource; method used for API call */
const RESOURCE_OPERATIONS: Record<string, { id: string; name: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE' }[]> = {
  coupons: [
    { id: 'search', name: 'Search for a coupon', method: 'GET' },
    { id: 'get', name: 'Get a coupon', method: 'GET' },
    { id: 'create', name: 'Create a coupon', method: 'POST' },
    { id: 'update', name: 'Update a coupon', method: 'PUT' },
    { id: 'delete', name: 'Delete a coupon', method: 'DELETE' }
  ],
  customers: [
    { id: 'search', name: 'Search for a customer', method: 'GET' },
    { id: 'get', name: 'Get a customer', method: 'GET' },
    { id: 'create', name: 'Create a customer', method: 'POST' },
    { id: 'update', name: 'Update a customer', method: 'PUT' },
    { id: 'delete', name: 'Delete a customer', method: 'DELETE' }
  ],
  orders: [
    { id: 'search', name: 'Search for an order', method: 'GET' },
    { id: 'get', name: 'Get an order', method: 'GET' },
    { id: 'create', name: 'Create an order', method: 'POST' },
    { id: 'update', name: 'Update an order', method: 'PUT' },
    { id: 'update_status', name: 'Update an order status', method: 'PUT' },
    { id: 'delete', name: 'Delete an order', method: 'DELETE' }
  ],
  order_notes: [
    { id: 'list', name: 'List order notes', method: 'GET' },
    { id: 'get', name: 'Get an order note', method: 'GET' },
    { id: 'create', name: 'Create an order note', method: 'POST' },
    { id: 'delete', name: 'Delete an order note', method: 'DELETE' }
  ],
  products: [
    { id: 'search', name: 'Search for a product', method: 'GET' },
    { id: 'get', name: 'Get a product', method: 'GET' },
    { id: 'create', name: 'Create a product', method: 'POST' },
    { id: 'update', name: 'Update a product', method: 'PUT' },
    { id: 'delete', name: 'Delete a product', method: 'DELETE' },
    { id: 'batch_create', name: 'Create products (batch)', method: 'POST' },
    { id: 'batch_update', name: 'Update products (batch)', method: 'PUT' },
    { id: 'batch_delete', name: 'Delete products (batch)', method: 'DELETE' }
  ],
  product_attributes: [
    { id: 'list', name: 'List product attributes', method: 'GET' },
    { id: 'get', name: 'Get a product attribute', method: 'GET' },
    { id: 'create', name: 'Create a product attribute', method: 'POST' },
    { id: 'update', name: 'Update a product attribute', method: 'PUT' },
    { id: 'delete', name: 'Delete a product attribute', method: 'DELETE' },
    { id: 'batch_create', name: 'Create product attributes (batch)', method: 'POST' }
  ],
  product_attribute_terms: [
    { id: 'list', name: 'List product attribute terms', method: 'GET' },
    { id: 'get', name: 'Get a product attribute term', method: 'GET' },
    { id: 'create', name: 'Create a product attribute term', method: 'POST' },
    { id: 'update', name: 'Update a product attribute term', method: 'PUT' },
    { id: 'delete', name: 'Delete a product attribute term', method: 'DELETE' },
    { id: 'batch_create', name: 'Create product attribute terms (batch)', method: 'POST' }
  ],
  product_categories: [
    { id: 'search', name: 'Search product categories', method: 'GET' },
    { id: 'get', name: 'Get a product category', method: 'GET' },
    { id: 'create', name: 'Create a product category', method: 'POST' },
    { id: 'update', name: 'Update a product category', method: 'PUT' },
    { id: 'delete', name: 'Delete a product category', method: 'DELETE' }
  ],
  product_variations: [
    { id: 'list', name: 'List product variations', method: 'GET' },
    { id: 'get', name: 'Get a product variation', method: 'GET' },
    { id: 'create', name: 'Create a product variation', method: 'POST' },
    { id: 'update', name: 'Update a product variation', method: 'PUT' },
    { id: 'delete', name: 'Delete a product variation', method: 'DELETE' }
  ],
  reports: [
    { id: 'get', name: 'Get reports', method: 'GET' }
  ],
  payment_gateways: [
    { id: 'list', name: 'List payment gateways', method: 'GET' },
    { id: 'get', name: 'Get a payment gateway', method: 'GET' },
    { id: 'update', name: 'Update a payment gateway', method: 'PUT' }
  ],
  shipping_zones: [
    { id: 'list', name: 'List shipping zones', method: 'GET' },
    { id: 'get', name: 'Get a shipping zone', method: 'GET' },
    { id: 'create', name: 'Create a shipping zone', method: 'POST' },
    { id: 'update', name: 'Update a shipping zone', method: 'PUT' },
    { id: 'delete', name: 'Delete a shipping zone', method: 'DELETE' }
  ],
  tax_rates: [
    { id: 'list', name: 'List tax rates', method: 'GET' },
    { id: 'get', name: 'Get a tax rate', method: 'GET' },
    { id: 'create', name: 'Create a tax rate', method: 'POST' },
    { id: 'update', name: 'Update a tax rate', method: 'PUT' },
    { id: 'delete', name: 'Delete a tax rate', method: 'DELETE' }
  ],
  categories: [
    { id: 'search', name: 'Search product categories', method: 'GET' },
    { id: 'get', name: 'Get a product category', method: 'GET' },
    { id: 'create', name: 'Create a product category', method: 'POST' },
    { id: 'update', name: 'Update a product category', method: 'PUT' },
    { id: 'delete', name: 'Delete a product category', method: 'DELETE' }
  ],
  variations: [
    { id: 'list', name: 'List product variations', method: 'GET' },
    { id: 'get', name: 'Get a product variation', method: 'GET' },
    { id: 'create', name: 'Create a product variation', method: 'POST' },
    { id: 'update', name: 'Update a product variation', method: 'PUT' },
    { id: 'delete', name: 'Delete a product variation', method: 'DELETE' }
  ]
};

const ORDER_STATUSES = [
  'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'any'
];

const PRODUCT_STATUSES = [
  'draft', 'pending', 'private', 'publish', 'any'
];

const WOOCOMMERCE_TEMPLATES = [
  {
    id: 'recent_orders',
    name: 'Get Recent Orders',
    resource: 'orders',
    operation: 'search',
    filters: { status: 'any', per_page: '10', after: '{{date.last_week}}' }
  },
  {
    id: 'update_product_stock',
    name: 'Update Product Stock',
    resource: 'products',
    operation: 'update',
    filters: { id: '{{product.id}}', stock_quantity: '{{inventory.new_quantity}}', manage_stock: 'true' }
  },
  {
    id: 'create_customer',
    name: 'Create Customer',
    resource: 'customers',
    operation: 'create',
    filters: { email: '{{contact.email}}', first_name: '{{contact.first_name}}', last_name: '{{contact.last_name}}' }
  },
  {
    id: 'create_coupon',
    name: 'Create Discount Coupon',
    resource: 'coupons',
    operation: 'create',
    filters: { code: '{{coupon.code}}', discount_type: 'percent', amount: '{{coupon.amount}}' }
  },
  {
    id: 'order_completed',
    name: 'Mark Order as Completed',
    resource: 'orders',
    operation: 'update_status',
    filters: { id: '{{order.id}}', status: 'completed' }
  }
];

interface ResourceFilter {
  key: string;
  label: string;
  type: string;
  options?: string[];
  default?: string;
}

const RESOURCE_FILTERS: Record<string, ResourceFilter[]> = {
  orders: [
    { key: 'status', label: 'Order Status', type: 'select', options: ORDER_STATUSES, default: '' },
    { key: 'customer', label: 'Customer ID', type: 'number', default: '' },
    { key: 'product', label: 'Product ID', type: 'number', default: '' },
    { key: 'after', label: 'Created After', type: 'date', default: '' },
    { key: 'before', label: 'Created Before', type: 'date', default: '' }
  ],
  products: [
    { key: 'status', label: 'Product Status', type: 'select', options: PRODUCT_STATUSES, default: '' },
    { key: 'category', label: 'Category ID', type: 'number', default: '' },
    { key: 'tag', label: 'Tag ID', type: 'number', default: '' },
    { key: 'featured', label: 'Featured Only', type: 'select', options: ['true', 'false'], default: '' },
    { key: 'on_sale', label: 'On Sale Only', type: 'select', options: ['true', 'false'], default: '' },
    { key: 'min_price', label: 'Minimum Price', type: 'number', default: '' },
    { key: 'max_price', label: 'Maximum Price', type: 'number', default: '' },
    { key: 'stock_status', label: 'Stock Status', type: 'select', options: ['instock', 'outofstock', 'onbackorder'], default: '' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Products', type: 'text', default: '' }
  ],
  customers: [
    { key: 'email', label: 'Email Address', type: 'email' },
    { key: 'role', label: 'User Role', type: 'select', options: ['customer', 'subscriber', 'administrator'] },
    { key: 'orderby', label: 'Order By', type: 'select', options: ['id', 'include', 'name', 'registered_date'] },
    { key: 'order', label: 'Sort Order', type: 'select', options: ['asc', 'desc'] },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Customers', type: 'text' }
  ],
  coupons: [
    { key: 'code', label: 'Coupon Code', type: 'text' },
    { key: 'after', label: 'Created After', type: 'date' },
    { key: 'before', label: 'Created Before', type: 'date' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Coupons', type: 'text' }
  ],
  categories: [
    { key: 'parent', label: 'Parent Category ID', type: 'number' },
    { key: 'product', label: 'Product ID', type: 'number' },
    { key: 'hide_empty', label: 'Hide Empty Categories', type: 'select', options: ['true', 'false'] },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Categories', type: 'text' }
  ],
  product_categories: [
    { key: 'parent', label: 'Parent Category ID', type: 'number' },
    { key: 'product', label: 'Product ID', type: 'number' },
    { key: 'hide_empty', label: 'Hide Empty Categories', type: 'select', options: ['true', 'false'] },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Categories', type: 'text' }
  ],
  order_notes: [
    { key: 'order_id', label: 'Order ID', type: 'number' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' }
  ],
  product_attributes: [
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search', type: 'text' }
  ],
  product_attribute_terms: [
    { key: 'attribute_id', label: 'Attribute ID', type: 'number' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search', type: 'text' }
  ],
  product_variations: [
    { key: 'product_id', label: 'Product ID', type: 'number' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' }
  ],
  reports: [
    { key: 'period', label: 'Report Period', type: 'select', options: ['week', 'month', 'last_month', 'year'] },
    { key: 'date_min', label: 'Start Date', type: 'date' },
    { key: 'date_max', label: 'End Date', type: 'date' }
  ]
};

interface FilterValue {
  [key: string]: string;
}

interface WooCommerceNodeProps {
  id: string;
  data: {
    label: string;
    siteUrl?: string;
    consumerKey?: string;
    consumerSecret?: string;
    resource?: string;
    action?: string;
    operation?: string;
    filters?: FilterValue;
    apiVersion?: string;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function WooCommerceNode({ id, data, isConnectable }: WooCommerceNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [siteUrl, setSiteUrl] = useState(data.siteUrl || '');
  const [consumerKey, setConsumerKey] = useState(data.consumerKey || '');
  const [consumerSecret, setConsumerSecret] = useState(data.consumerSecret || '');
  const [resource, setResource] = useState(data.resource || 'orders');
  const operationsForResource = RESOURCE_OPERATIONS[resource] || RESOURCE_OPERATIONS.orders;
  const [operation, setOperation] = useState(data.operation || data.action || 'get');
  const currentMethod = operationsForResource.find(op => op.id === operation)?.method ?? 'GET';
  useEffect(() => {
    const ops = RESOURCE_OPERATIONS[resource];
    if (!ops?.length) return;
    const valid = ops.some(op => op.id === operation);
    if (!valid) setOperation(ops[0].id);
  }, [resource]);
  const [filters, setFilters] = useState<FilterValue>(data.filters || {});
  const apiVersion = 'v3';

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
    responseCount?: number;
    apiVersion?: string;
    siteInfo?: any;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [showVariablePreview, setShowVariablePreview] = useState(false);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const { toast } = useToast();
  const { t } = useTranslation();

  const copyVariableToClipboard = useCallback(async (variable: string) => {
    try {
      await navigator.clipboard.writeText(variable);
      toast({
        title: t('flow_builder.woocommerce.copied', 'Copied'),
        description: t('flow_builder.woocommerce.copied_description', 'Variable copied to clipboard'),
      });
    } catch {
      toast({
        title: t('flow_builder.woocommerce.copy_failed', 'Copy failed'),
        description: t('flow_builder.woocommerce.copy_failed_description', 'Could not copy to clipboard'),
        variant: 'destructive',
      });
    }
  }, [toast, t]);

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  useEffect(() => {
    updateNodeData({
      siteUrl,
      consumerKey,
      consumerSecret,
      resource,
      action: currentMethod.toLowerCase(),
      operation,
      filters,
      apiVersion
    });
  }, [
    updateNodeData,
    siteUrl,
    consumerKey,
    consumerSecret,
    resource,
    operation,
    currentMethod,
    filters
  ]);

  const applyTemplate = (templateId: string) => {
    const template = WOOCOMMERCE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setResource(template.resource);
      setOperation(template.operation);
      setFilters(Object.fromEntries(
        Object.entries(template.filters).filter(([_, v]) => v !== undefined)
      ));
    }
  };

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const removeFilter = (key: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  };

  const isValidSiteUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const replaceVariables = (text: string): string => {
    const testData: Record<string, string> = {
      'contact.email': 'test@example.com',
      'contact.first_name': 'John',
      'contact.last_name': 'Doe',
      'contact.phone': '+1234567890',
      'order.id': '123',
      'product.id': '456',
      'customer.id': '789',
      'coupon.code': 'SAVE10',
      'coupon.amount': '10',
      'inventory.new_quantity': '50',
      'date.last_week': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      'date.today': new Date().toISOString().split('T')[0],
      'date.now': new Date().toISOString()
    };

    let result = text;
    Object.entries(testData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  };

  const buildApiUrl = (siteUrl: string, resource: string, resourceId?: string): string => {
    const cleanUrl = siteUrl.replace(/\/$/, '');
    const baseUrl = `${cleanUrl}/wp-json/wc/${apiVersion}/`;

    if (resourceId) {
      return `${baseUrl}${resource}/${resourceId}`;
    }
    return `${baseUrl}${resource}`;
  };

  const buildQueryParams = (filters: FilterValue): string => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value.trim()) {
        const processedValue = replaceVariables(value);
        params.append(key, processedValue);
      }
    });

    return params.toString();
  };

  const getOperationColor = (opId: string) => {
    const method = operationsForResource.find(op => op.id === opId)?.method;
    if (!method) return 'text-muted-foreground';
    switch (method) {
      case 'GET': return 'text-blue-600 dark:text-blue-400';
      case 'POST': return 'text-green-600 dark:text-green-400';
      case 'PUT': return 'text-orange-600 dark:text-orange-400';
      case 'DELETE': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const testConnection = async () => {
    if (!siteUrl.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter your WordPress site URL (e.g., https://mystore.com)'
      });
      setShowTestResult(true);
      return;
    }

    if (!isValidSiteUrl(siteUrl)) {
      setTestResult({
        success: false,
        error: 'Please enter a valid URL (must include http:// or https://)'
      });
      setShowTestResult(true);
      return;
    }

    if (!consumerKey.trim() || !consumerSecret.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter both Consumer Key and Consumer Secret'
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const resourceEndpoint = WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.endpoint || resource;
      const apiUrl = buildApiUrl(siteUrl, resourceEndpoint);
      const queryParams = buildQueryParams(filters);
      const fullUrl = queryParams ? `${apiUrl}?${queryParams}` : apiUrl;

      const credentials = btoa(`${consumerKey}:${consumerSecret}`);

      const response = await fetch(fullUrl, {
        method: currentMethod,
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      let responseData: any;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }

      if (response.ok) {
        let responseCount = 0;
        if (Array.isArray(responseData)) {
          responseCount = responseData.length;
        } else if (responseData && typeof responseData === 'object') {
          responseCount = 1;
        }

        let siteInfo = null;
        try {
          const siteInfoUrl = buildApiUrl(siteUrl, 'system_status');
          const siteInfoResponse = await fetch(siteInfoUrl, {
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Accept': 'application/json'
            }
          });
          if (siteInfoResponse.ok) {
            siteInfo = await siteInfoResponse.json();
          }
        } catch {
        }

        setTestResult({
          success: true,
          data: responseData,
          responseCount,
          apiVersion: apiVersion,
          siteInfo
        });
      } else {
        let errorMessage = 'Request failed';
        if (responseData?.message) {
          errorMessage = responseData.message;
        } else if (responseData?.error) {
          errorMessage = responseData.error;
        } else if (response.status === 401) {
          errorMessage = 'Authentication failed. Please check your Consumer Key and Secret.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please check your API permissions.';
        } else if (response.status === 404) {
          errorMessage = 'Resource not found. Please check your site URL and WooCommerce installation.';
        } else if (response.status === 400) {
          errorMessage = 'Bad request. Please check your filters and parameters.';
        }

        setTestResult({
          success: false,
          error: errorMessage
        });
      }

    } catch (error: any) {
      let errorMessage = 'Connection failed';
      if (error.message) {
        if (error.message.includes('CORS')) {
          errorMessage = 'CORS error. Please ensure your WordPress site allows API access.';
        } else if (error.message.includes('SSL')) {
          errorMessage = 'SSL certificate error. Please check your site\'s SSL configuration.';
        } else {
          errorMessage = error.message;
        }
      }

      setTestResult({
        success: false,
        error: errorMessage
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="node-woocommerce p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
      <div className="absolute -top-8 -right-2 bg-background border border-border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.woocommerce.duplicate_node', 'Duplicate node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.woocommerce.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2 text-foreground">
        <img
          src={APP_ICONS.woocommerce}
          alt="WooCommerce"
          className="h-4 w-4"
        />
        <span>{t('flow_builder.node_types.woocommerce', 'WooCommerce')}</span>
       <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.hide"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {t('flow_builder.woocommerce.hide', 'Hide')}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t('flow_builder.woocommerce.edit', 'Edit')}
                  </>
                )}
              </button>
      </div>

      <div className="text-sm p-2 rounded border border-border bg-muted/30">
        <div className="flex items-center gap-1 mb-1">
          <Store className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("font-medium", getOperationColor(operation))}>{operationsForResource.find(op => op.id === operation)?.name ?? operation}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.name || resource}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {siteUrl && (
            <span className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 px-1 py-0.5 rounded">
              {new URL(siteUrl).hostname}
            </span>
          )}
          {Object.keys(filters).length > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-1 py-0.5 rounded">
              {Object.keys(filters).length === 1
                ? t('flow_builder.woocommerce.filter_count', '{{count}} filter', { count: 1 })
                : t('flow_builder.woocommerce.filters_count', '{{count}} filters', { count: Object.keys(filters).length })}
            </span>
          )}
          <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
            API {apiVersion}
          </span>
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border border-border rounded-md p-3 bg-muted/20">
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-foreground/90">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              {t('flow_builder.woocommerce.help', 'Help')}
              <ChevronDown className="h-3 w-3 ml-auto data-[state=open]:rotate-180 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 pt-2 border-t border-border space-y-2 text-[11px] text-muted-foreground">
                <p><strong className="text-foreground">Connection:</strong> {t('flow_builder.woocommerce.help_connection', WOOCOMMERCE_INLINE_HELP.connection)}</p>
                <p><strong className="text-foreground">Modules:</strong> {t('flow_builder.woocommerce.help_modules', WOOCOMMERCE_INLINE_HELP.modules)}</p>
                <p><strong className="text-foreground">Operation:</strong> {t('flow_builder.woocommerce.help_operation', WOOCOMMERCE_INLINE_HELP.operation)}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div>
            <Label className="block mb-1 font-medium text-foreground">{t('flow_builder.woocommerce.quick_templates', 'Quick Templates')}</Label>
            <Select
              value=""
              onValueChange={applyTemplate}
            >
              <SelectTrigger data-tour="components-flow-builder-woocommercenode.selecttrigger.flow_builder.woocommerce.template_placeholder" className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.woocommerce.template_placeholder', 'Choose a WooCommerce operation...')} />
              </SelectTrigger>
              <SelectContent>
                {WOOCOMMERCE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <Label className="block font-medium text-foreground">{t('flow_builder.woocommerce.wordpress_config', 'WordPress Site Configuration')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {t('flow_builder.woocommerce.help_connection', WOOCOMMERCE_INLINE_HELP.connection)}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <Label className="block mb-1 text-xs">{t('flow_builder.woocommerce.site_url', 'Site URL')}</Label>
              <Input data-tour="components-flow-builder-woocommercenode.input.flow_builder.woocommerce.wordpress_config"
                placeholder="https://mystore.com"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">{t('flow_builder.woocommerce.consumer_key', 'Consumer Key')}</Label>
              <Input data-tour="components-flow-builder-woocommercenode.input.flow_builder.woocommerce.wordpress_config"
                placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">{t('flow_builder.woocommerce.consumer_secret', 'Consumer Secret')}</Label>
              <Input data-tour="components-flow-builder-woocommercenode.input.flow_builder.woocommerce.wordpress_config"
                type="password"
                placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div className="flex gap-2">
              <Button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.test_connection_title"
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-1"
                onClick={testConnection}
                disabled={isTesting || !siteUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()}
                title={t('flow_builder.woocommerce.test_connection_title', 'Test connection to your WooCommerce store')}
              >
                {isTesting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                {t('flow_builder.woocommerce.test_connection', 'Test Connection')}
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Label className="block font-medium text-foreground">{t('flow_builder.woocommerce.resource_label', 'WooCommerce Resource')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                        <HelpCircle className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {t('flow_builder.woocommerce.help_modules', WOOCOMMERCE_INLINE_HELP.modules)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={resource}
                onValueChange={setResource}
              >
                <SelectTrigger data-tour="components-flow-builder-woocommercenode.selecttrigger.flow_builder.woocommerce.select_resource" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.woocommerce.select_resource', 'Select resource')} />
                </SelectTrigger>
                <SelectContent>
                  {WOOCOMMERCE_RESOURCES.map((res) => (
                    <SelectItem key={res.id} value={res.id}>
                      {res.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Label className="block font-medium text-foreground">{t('flow_builder.woocommerce.operation_label', 'Operation')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                        <HelpCircle className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {t('flow_builder.woocommerce.help_operation', WOOCOMMERCE_INLINE_HELP.operation)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={operation}
                onValueChange={setOperation}
              >
                <SelectTrigger data-tour="components-flow-builder-woocommercenode.selecttrigger.flow_builder.woocommerce.select_operation" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.woocommerce.select_operation', 'Select operation')} />
                </SelectTrigger>
                <SelectContent>
                  {operationsForResource.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      <span className={getOperationColor(op.id)}>{op.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {RESOURCE_FILTERS[resource as keyof typeof RESOURCE_FILTERS] && (
            <Collapsible defaultOpen={Object.keys(filters).length > 0} className="pt-2 border-t border-border">
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-foreground/90 py-1">
                {t('flow_builder.woocommerce.filters_parameters', 'Filters & Parameters')}
                <ChevronDown className="h-3.5 w-3.5 ml-auto transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 pt-2">
                  {RESOURCE_FILTERS[resource as keyof typeof RESOURCE_FILTERS].map((filter) => (
                    <div key={filter.key} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <Label className="block mb-1 text-[10px] text-muted-foreground">
                          {filter.label}
                        </Label>
                        {filter.type === 'select' ? (
                          <Select
                            value={filters[filter.key] || ''}
                            onValueChange={(value) => updateFilter(filter.key, value)}
                          >
                            <SelectTrigger className="text-xs h-6">
                              <SelectValue placeholder={`Select ${filter.label.toLowerCase()}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {filter.type === 'select' && 'options' in filter && filter.options?.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={filter.type}
                            placeholder={`Enter ${filter.label.toLowerCase()}`}
                            value={filters[filter.key] || filter.default || ''}
                            onChange={(e) => updateFilter(filter.key, e.target.value)}
                            className="text-xs h-6"
                          />
                        )}
                      </div>
                      {filters[filter.key] && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 mt-4"
                          onClick={() => removeFilter(filter.key)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-2">
                  {t('flow_builder.woocommerce.variable_syntax_hint', 'Use {{variable}} syntax for dynamic values')}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="pt-2 border-t border-border">
            <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.available_output_variables"
              className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-full"
              onClick={() => setShowVariablePreview(!showVariablePreview)}
            >
              {t('flow_builder.woocommerce.available_output_variables', 'Available Output Variables')}
              {showVariablePreview ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showVariablePreview && (
              <div className="mt-2 text-[10px] bg-muted p-2 rounded-md border border-border space-y-0.5 text-foreground">
                <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy"
                  type="button"
                  onClick={() => copyVariableToClipboard(`{{woocommerce.${resource}.data}}`)}
                  className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}
                >
                  <code>&#123;&#123;woocommerce.{resource}.data&#125;&#125;</code> - {WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.name} data
                </button>
                <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy"
                  type="button"
                  onClick={() => copyVariableToClipboard('{{woocommerce.response.count}}')}
                  className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}
                >
                  <code>&#123;&#123;woocommerce.response.count&#125;&#125;</code> - Number of results returned
                </button>
                <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy"
                  type="button"
                  onClick={() => copyVariableToClipboard('{{woocommerce.site.url}}')}
                  className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}
                >
                  <code>&#123;&#123;woocommerce.site.url&#125;&#125;</code> - WordPress site URL
                </button>
                <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy"
                  type="button"
                  onClick={() => copyVariableToClipboard('{{woocommerce.success}}')}
                  className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}
                >
                  <code>&#123;&#123;woocommerce.success&#125;&#125;</code> - Request success status
                </button>
                {resource === 'orders' && (
                  <>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.order.id}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.order.id&#125;&#125;</code> - Order ID</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.order.total}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.order.total&#125;&#125;</code> - Order total</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.order.status}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.order.status&#125;&#125;</code> - Order status</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.order.customer_id}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.order.customer_id&#125;&#125;</code> - Customer ID</button>
                  </>
                )}
                {resource === 'products' && (
                  <>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.product.id}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.product.id&#125;&#125;</code> - Product ID</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.product.name}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.product.name&#125;&#125;</code> - Product name</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.product.price}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.product.price&#125;&#125;</code> - Product price</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.product.stock_quantity}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.product.stock_quantity&#125;&#125;</code> - Stock quantity</button>
                  </>
                )}
                {resource === 'customers' && (
                  <>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.customer.id}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.customer.id&#125;&#125;</code> - Customer ID</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.customer.email}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.customer.email&#125;&#125;</code> - Customer email</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.customer.first_name}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.customer.first_name&#125;&#125;</code> - First name</button>
                    <button data-tour="components-flow-builder-woocommercenode.button.flow_builder.woocommerce.click_to_copy" type="button" onClick={() => copyVariableToClipboard('{{woocommerce.customer.last_name}}')} className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  title={t('flow_builder.woocommerce.click_to_copy', 'Click to copy')}><code>&#123;&#123;woocommerce.customer.last_name&#125;&#125;</code> - Last name</button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground mt-2">
            <p>
              {t('flow_builder.woocommerce.node_description', "The WooCommerce Integration node connects to your WordPress/WooCommerce store's REST API. Response data will be available as variables in subsequent nodes.")}
            </p>
          </div>

          {/* Test Result Display */}
          {showTestResult && testResult && (
            <div className="mt-3 border border-border rounded-md p-3 bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {testResult.success ? t('flow_builder.woocommerce.connection_success', 'Connection Successful') : t('flow_builder.woocommerce.connection_failed', 'Connection Failed')}
                  </span>
                  {testResult.responseCount !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      ({testResult.responseCount} result{testResult.responseCount !== 1 ? 's' : ''})
                    </span>
                  )}
                  {testResult.apiVersion && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400">
                      API {testResult.apiVersion}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setShowTestResult(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {testResult.error ? (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-md border border-red-200 dark:border-red-800">
                  {testResult.error}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded-md border border-green-200 dark:border-green-800">
                    Successfully connected to WooCommerce store and retrieved {WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.name.toLowerCase()} data.
                  </div>

                  {/* Site Info */}
                  {testResult.siteInfo && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {t('flow_builder.woocommerce.store_information', 'Store Information:')}
                      </div>
                      <div className="text-[10px] bg-muted p-2 rounded-md border border-border text-foreground">
                        <div>WooCommerce Version: {testResult.siteInfo.environment?.wc_version || 'Unknown'}</div>
                        <div>WordPress Version: {testResult.siteInfo.environment?.wp_version || 'Unknown'}</div>
                        <div>PHP Version: {testResult.siteInfo.environment?.php_version || 'Unknown'}</div>
                      </div>
                    </div>
                  )}

                  {/* Sample Response Data */}
                  {testResult.data && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {t('flow_builder.woocommerce.sample_response_data', 'Sample Response Data:')}
                      </div>
                      <div className="text-[10px] bg-muted p-2 rounded-md border border-border font-mono max-h-32 overflow-y-auto text-foreground">
                        {JSON.stringify(testResult.data, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Handle for connecting input edges */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Handle for connecting output edges */}
      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}