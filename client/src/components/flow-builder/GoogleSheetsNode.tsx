import { APP_ICONS } from '@/assets/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Table,
  Trash2,
  X,
  XCircle,
  Download,
  Search,
  Minus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { standardHandleStyle } from './StyledHandle';
import { useFlowContext } from '../../pages/flow-builder';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { GoogleSheetsOAuthStatus } from './GoogleSheetsOAuthStatus';
import { useGoogleSheetsAuth } from '@/hooks/useGoogleSheetsAuth';
import { useToast } from '@/hooks/use-toast';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import React from 'react';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';

const GOOGLE_SHEETS_OPERATIONS = [
  {
    id: 'append_row',
    name: 'Append Row',
    description: 'Add new data row to sheet',
    tooltip: 'Add a new row of data to the end of your Google Sheet. Sets variables: {{google_sheets.success}} (true/false), {{google_sheets.appendedRange}} (cell range), {{google_sheets.rowsAdded}} (count).',
    icon: '➕',
    color: 'text-primary'
  },
  {
    id: 'read_rows',
    name: 'Read Rows',
    description: 'Fetch data with optional filters',
    tooltip: 'Read data from your Google Sheet with optional filtering and row range selection. Sets variables: {{google_sheets.rows}} (all data), {{google_sheets.headers}} (column names), {{google_sheets.totalRows}} (count), {{google_sheets.row_1}} (first row), {{google_sheets.column_Name}} (column data).',
    icon: '📖',
    color: 'text-primary'
  },
  {
    id: 'update_row',
    name: 'Update Row',
    description: 'Modify existing row data',
    tooltip: 'Update existing rows in your Google Sheet by matching column values. Sets variables: {{google_sheets.success}} (true/false), {{google_sheets.matchingRows}} (found), {{google_sheets.updatedRows}} (modified).',
    icon: '✏️',
    color: 'text-secondary'
  },
  {
    id: 'get_sheet_info',
    name: 'Get Sheet Info',
    description: 'Retrieve sheet metadata and headers',
    tooltip: 'Get information about your Google Sheet including column headers and metadata. Sets variables: {{google_sheets.headers}} (column names), {{google_sheets.title}} (sheet title), {{google_sheets.rowCount}}, {{google_sheets.columnCount}}.',
    icon: 'ℹ️',
    color: 'text-primary'
  }
];

const GOOGLE_SHEETS_TEMPLATES: Array<{
  id: string;
  name: string;
  operation: string;
  config: ConfigValue;
}> = [
  {
    id: 'lead_capture',
    name: 'Lead Capture Form',
    operation: 'append_row',
    config: {
      columnMappings: {
        'Name': '{{contact.name}}',
        'Phone': '{{contact.phone}}',
        'Message': '{{message.content}}',
        'Timestamp': '{{current.timestamp}}'
      },
      duplicateCheck: {
        enabled: true,
        columns: ['Phone'],
        caseSensitive: false,
        onDuplicate: 'skip'
      }
    }
  },
  {
    id: 'order_tracking',
    name: 'Order Status Update',
    operation: 'update_row',
    config: {
      matchColumn: 'Order ID',
      matchValue: '{{order.id}}',
      columnMappings: {
        'Status': '{{order.status}}',
        'Updated': '{{current.timestamp}}'
      }
    }
  },
  {
    id: 'user_lookup',
    name: 'User Information Lookup',
    operation: 'read_rows',
    config: {
      filterColumn: 'Phone',
      filterValue: '{{contact.phone}}',
      maxRows: 1
    }
  },
  {
    id: 'customer_orders_workbook',
    name: 'Customer Orders (Admin + Customer Lookup)',
    operation: 'append_row',
    config: {
      columnMappings: {
        'Order ID': '{{order.id}}',
        'Order Date': '{{current.timestamp}}',
        'Customer Name': '{{contact.name}}',
        'Email': '{{contact.email}}',
        'Phone': '{{contact.phone}}',
        'Product Name': '{{order.product_name}}',
        'Quantity': '{{order.quantity}}',
        'Price per Unit': '{{order.price_per_unit}}',
        'Total Price': '{{order.total_price}}',
        'Order Status': '{{order.status}}',
        'Notes': '{{order.notes}}'
      },
      duplicateCheck: {
        enabled: true,
        columns: ['Order ID'],
        caseSensitive: false,
        onDuplicate: 'skip'
      }
    }
  }
];

const CUSTOMER_ORDERS_WORKBOOK_TEMPLATE_ID = 'customer_orders_workbook';

function useGoogleSheetHeaders(
  spreadsheetId: string,
  sheetName: string,
  googleConnected: boolean
) {
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sid = spreadsheetId?.trim();
    const tab = (sheetName || 'Sheet1').trim() || 'Sheet1';
    if (!googleConnected || !sid) {
      setSheetHeaders([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/google/sheets/headers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: sid, sheetName: tab })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : data.message || 'Failed to fetch headers'
        );
      }
      const raw = data.headers;
      setSheetHeaders(Array.isArray(raw) ? raw.map((h: unknown) => String(h)) : []);
    } catch (e) {
      setSheetHeaders([]);
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [googleConnected, spreadsheetId, sheetName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sheetHeaders, loading, error, refresh };
}

interface SheetColumnPickerProps {
  value: string;
  onChange: (v: string) => void;
  headers: string[];
  loading: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

function SheetColumnPicker({
  value,
  onChange,
  headers,
  loading,
  disabled,
  placeholder,
  className
}: SheetColumnPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = headers.filter((h) => h.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={cn('flex gap-1 w-full min-w-0', className)}>
      <Input data-tour="components-flow-builder-googlesheetsnode.input.value"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-xs h-7 min-w-0 flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.pick_sheet_column"
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-8 p-0 shrink-0"
            disabled={disabled || loading || headers.length === 0}
            title={t(
              'flow_builder.google_sheets.pick_sheet_column',
              'Pick a column from the sheet (row 1 headers)'
            )}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Table className="h-3 w-3" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t('flow_builder.google_sheets.search_columns', 'Search columns...')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
                {loading
                  ? t('flow_builder.google_sheets.loading_headers', 'Loading...')
                  : t('flow_builder.google_sheets.no_headers', 'No headers loaded')}
              </CommandEmpty>
              {filtered.map((h) => (
                <CommandItem
                  key={h}
                  value={h}
                  onSelect={() => {
                    onChange(h);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  {h}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type ConfigValue = Record<string, any>;

interface VariableMapping {
  variable: string;
  path: string;
}

type ConfigField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  default?: boolean | string | number;
  description?: string;
  options?: string[];
  tooltip?: string;
  placeholder?: string;
}

const OPERATION_CONFIG: Record<string, ConfigField[]> = {
  append_row: [
    {
      key: 'columnMappings',
      label: 'Column Mappings',
      type: 'object',
      description: 'Map sheet columns to flow variables',
      required: true,
      tooltip: 'Define which data goes into which columns. Use variables like {{contact.name}} or {{message.content}} to include dynamic data from the conversation.',
      placeholder: '{"Name": "{{contact.name}}", "Phone": "{{contact.phone}}", "Message": "{{message.content}}"}'
    },
    {
      key: 'duplicateCheck',
      label: 'Duplicate Prevention',
      type: 'object',
      description: 'Configure duplicate checking before inserting rows',
      required: false,
      tooltip: 'Enable duplicate checking to prevent adding duplicate entries. Useful for lead capture to avoid duplicate contacts based on phone number or email.',
      placeholder: '{"enabled": true, "columns": ["Phone"], "caseSensitive": false, "onDuplicate": "skip"}'
    }
  ],
  read_rows: [
    {
      key: 'filterColumn',
      label: 'Filter Column',
      type: 'text',
      description: 'Column name to filter by',
      required: false,
      tooltip: 'Specify a column name to filter results. Leave empty to read all rows within the specified range.',
      placeholder: 'Phone'
    },
    {
      key: 'filterValue',
      label: 'Filter Value',
      type: 'text',
      description: 'Value to match in filter column',
      required: false,
      tooltip: 'The value to search for in the filter column. Use variables like {{contact.phone}} for dynamic filtering.',
      placeholder: '{{contact.phone}}'
    },
    {
      key: 'startRow',
      label: 'Start Row',
      type: 'number',
      description: 'Starting row number (1-based)',
      required: false,
      default: 2,
      tooltip: 'The row number to start reading from. Row 1 is typically headers, so start from row 2 for data.',
      placeholder: '2'
    },
    {
      key: 'maxRows',
      label: 'Max Rows',
      type: 'number',
      description: 'Maximum number of rows to read',
      required: false,
      default: 100,
      tooltip: 'Limit the number of rows returned to avoid performance issues with large sheets.',
      placeholder: '100'
    }
  ],
  update_row: [
    {
      key: 'matchColumn',
      label: 'Match Column',
      type: 'text',
      description: 'Column to match for row identification',
      required: true,
      tooltip: 'The column name used to identify which row to update. For example, "Order ID" or "Phone Number".',
      placeholder: 'Order ID'
    },
    {
      key: 'matchValue',
      label: 'Match Value',
      type: 'text',
      description: 'Value to match in the match column',
      required: true,
      tooltip: 'The value to search for in the match column. Use variables like {{order.id}} for dynamic matching.',
      placeholder: '{{order.id}}'
    },
    {
      key: 'columnMappings',
      label: 'Column Updates',
      type: 'object',
      description: 'Columns to update with new values',
      required: true,
      tooltip: 'Define which columns to update with what values. Only specified columns will be modified.',
      placeholder: '{"Status": "{{order.status}}", "Updated": "{{current.timestamp}}"}'
    }
  ],
  get_sheet_info: []
};

interface DuplicatePreventionConfig {
  enabled?: boolean;
  columns?: string[];
  caseSensitive?: boolean;
  onDuplicate?: 'skip' | 'update' | 'add_anyway';
}

interface DuplicatePreventionUIProps {
  value: DuplicatePreventionConfig;
  onChange: (value: DuplicatePreventionConfig) => void;
}

interface ColumnMappingsUIProps {
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  placeholder?: string;
  flowId?: number | null;
  customVariables?: FlowCustomVariable[];
  spreadsheetId: string;
  sheetName: string;
  googleConnected: boolean;
}

const ColumnMappingsUI: React.FC<ColumnMappingsUIProps> = ({
  value,
  onChange,
  placeholder,
  flowId,
  customVariables,
  spreadsheetId,
  sheetName,
  googleConnected
}) => {
  const { t } = useTranslation();
  const { sheetHeaders, loading: headersLoading, error: headersError, refresh: refreshHeaders } =
    useGoogleSheetHeaders(spreadsheetId, sheetName, googleConnected);
  const [mappings, setMappings] = useState<Array<{id: string, column: string, variable: string}>>(() => {
    if (value && typeof value === 'object') {
      return Object.entries(value).map(([column, variable], index) => ({
        id: `mapping-${index}`,
        column,
        variable: String(variable)
      }));
    }
    return [{ id: 'mapping-0', column: '', variable: '' }];
  });

  const updateMappings = (newMappings: Array<{id: string, column: string, variable: string}>) => {
    setMappings(newMappings);
    const result: Record<string, any> = {};
    newMappings.forEach(mapping => {
      if (mapping.column.trim() && mapping.variable.trim()) {
        result[mapping.column.trim()] = mapping.variable.trim();
      }
    });
    onChange(result);
  };

  const addMapping = () => {
    const newId = `mapping-${Date.now()}`;
    updateMappings([...mappings, { id: newId, column: '', variable: '' }]);
  };

  const removeMapping = (id: string) => {
    if (mappings.length > 1) {
      updateMappings(mappings.filter(mapping => mapping.id !== id));
    }
  };

  const updateMapping = (id: string, field: 'column' | 'variable', newValue: string) => {
    updateMappings(mappings.map(mapping => 
      mapping.id === id ? { ...mapping, [field]: newValue } : mapping
    ));
  };

  const validMappings = mappings.filter(mapping => mapping.column.trim() && mapping.variable.trim());
  const hasValidMappings = validMappings.length > 0;

  return (
    <div className="space-y-3">
      {googleConnected && spreadsheetId.trim() && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.refresh_sheet_headers"
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => refreshHeaders()}
            disabled={headersLoading}
          >
            {headersLoading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {t('flow_builder.google_sheets.refresh_sheet_headers', 'Refresh sheet columns')}
          </Button>
          {sheetHeaders.length > 0 && (
            <span>
              {t('flow_builder.google_sheets.headers_loaded_count', '{{count}} column(s) from row 1', {
                count: sheetHeaders.length
              })}
            </span>
          )}
          {headersError && <span className="text-destructive">{headersError}</span>}
        </div>
      )}
      <div className="space-y-2">
        {mappings.map((mapping, index) => (
          <div key={mapping.id} className="flex gap-2 items-center p-2 bg-muted/30 rounded border">
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-muted-foreground mb-1 block">{t('flow_builder.google_sheets.column_name', 'Column Name')}</Label>
                <SheetColumnPicker
                  placeholder={t('flow_builder.google_sheets.column_placeholder', 'e.g., Name, Phone, Email')}
                  value={mapping.column}
                  onChange={(v) => updateMapping(mapping.id, 'column', v)}
                  headers={sheetHeaders}
                  loading={headersLoading}
                  disabled={!googleConnected}
                />
              </div>
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-muted-foreground mb-1 block">{t('flow_builder.google_sheets.variable', 'Variable')}</Label>
                <EnhancedVariablePicker
                  flowId={flowId ?? undefined}
                  customVariables={customVariables}
                  value={mapping.variable}
                  onChange={(v) => updateMapping(mapping.id, 'variable', v)}
                  placeholder={t('flow_builder.google_sheets.variable_placeholder', 'e.g., {{contact.name}}')}
                  className="text-xs h-7"
                />
              </div>
              <div className="flex items-end">
                <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.remove_mapping"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMapping(mapping.id)}
                  disabled={mappings.length === 1}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title={t('flow_builder.google_sheets.remove_mapping', 'Remove mapping')}
                >
                  <Minus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasValidMappings && (
        <div className="bg-primary/10 p-3 rounded border border-primary/20">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-primary mb-1 text-xs">{t('flow_builder.google_sheets.current_mappings', 'Current Mappings ({{count}}):', { count: validMappings.length })}</div>
              <div className="space-y-1">
                {validMappings.map((mapping, index) => (
                  <div key={mapping.id} className="text-xs font-mono bg-card p-1 rounded border border-border">
                    <span className="text-primary">"{mapping.column}"</span> → <span className="text-primary">{mapping.variable}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.add_column_mapping"
        variant="outline"
        size="sm"
        onClick={addMapping}
        className="h-7 text-xs w-full"
      >
        <Plus className="h-3 w-3 mr-1" />
        {t('flow_builder.google_sheets.add_column_mapping', 'Add Column Mapping')}
      </Button>
      
      {placeholder && (
        <div className="text-xs text-muted-foreground bg-primary/10 p-3 rounded border border-primary/20">
          <div className="flex items-start gap-2">
            <HelpCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-primary mb-1">{t('flow_builder.google_sheets.example_configuration', 'Example Configuration:')}</div>
              <div className="font-mono text-xs bg-card p-2 rounded border border-border">
                {placeholder}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DuplicatePreventionUI: React.FC<DuplicatePreventionUIProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [columnsInput, setColumnsInput] = useState(value.columns?.join(', ') || 'Phone');

  const updateValue = (updates: Partial<DuplicatePreventionConfig>) => {
    onChange({ ...value, ...updates });
  };

  const handleColumnsChange = (input: string) => {
    setColumnsInput(input);
    const columns = input.split(',').map(col => col.trim()).filter(col => col.length > 0);
    updateValue({ columns });
  };


  useEffect(() => {
    if (!value.columns || value.columns.length === 0) {
      updateValue({ columns: ['Phone'] });
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={value.enabled || false}
          onCheckedChange={(enabled) => updateValue({ enabled })}
        />
        <Label className="text-[10px] font-medium">
          {t('flow_builder.google_sheets.enable_duplicate_prevention', 'Enable Duplicate Prevention')}
        </Label>
      </div>

      {value.enabled && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.advanced_settings" variant="ghost" size="sm" className="h-6 p-1 text-[10px] w-full justify-between">
              <span>{t('flow_builder.google_sheets.advanced_settings', 'Advanced Settings')}</span>
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            <div>
              <Label className="text-[10px] font-medium mb-1 block">
                {t('flow_builder.google_sheets.check_columns', 'Check Columns')}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-48">
                        {t('flow_builder.google_sheets.check_columns_tooltip', 'Comma-separated list of column names to check for duplicates (e.g., "Phone, Email")')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input data-tour="components-flow-builder-googlesheetsnode.input.flow_builder.google_sheets.columns_placeholder"
                value={columnsInput}
                onChange={(e) => handleColumnsChange(e.target.value)}
                placeholder={t('flow_builder.google_sheets.columns_placeholder', 'Phone, Email')}
                className="text-[10px] h-6"
              />
            </div>

            <div>
              <Label className="text-[10px] font-medium mb-1 block">
                {t('flow_builder.google_sheets.when_duplicate_found', 'When Duplicate Found')}
              </Label>
              <Select
                value={value.onDuplicate || 'skip'}
                onValueChange={(onDuplicate: 'skip' | 'update' | 'add_anyway') => updateValue({ onDuplicate })}
              >
                <SelectTrigger className="text-[10px] h-6">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t('flow_builder.google_sheets.on_duplicate_skip', 'Skip insertion')}</SelectItem>
                  <SelectItem value="update">{t('flow_builder.google_sheets.on_duplicate_update', 'Update existing row')}</SelectItem>
                  <SelectItem value="add_anyway">{t('flow_builder.google_sheets.on_duplicate_add_anyway', 'Add anyway (with warning)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={value.caseSensitive !== false}
                onCheckedChange={(caseSensitive) => updateValue({ caseSensitive })}
              />
              <Label className="text-[10px] font-medium">
                {t('flow_builder.google_sheets.case_sensitive', 'Case Sensitive')}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-48">
                        {t('flow_builder.google_sheets.case_sensitive_tooltip', 'Whether to match case exactly (John vs john)')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

interface GoogleSheetsNodeProps {
  id: string;
  data: {
    label: string;
    spreadsheetId?: string;
    sheetName?: string;
    operation?: string;
    config?: ConfigValue;
    variableMappings?: VariableMapping[];
    timeout?: number;
  };
  isConnectable: boolean;
}

export function GoogleSheetsNode({ id, data, isConnectable }: GoogleSheetsNodeProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [spreadsheetId, setSpreadsheetId] = useState(data.spreadsheetId || '');
  const [sheetName, setSheetName] = useState(data.sheetName || '');
  const [operation, setOperation] = useState(data.operation || 'append_row');
  const [config, setConfig] = useState<ConfigValue>(data.config || {});
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);
  const [timeout, setTimeoutState] = useState(data.timeout || 30);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fieldValidation, setFieldValidation] = useState<Record<string, { isValid: boolean; message?: string }>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configurationProgress, setConfigurationProgress] = useState(0);

  const [isFetchingSheets, setIsFetchingSheets] = useState(false);
  const [isFetchingSheetNames, setIsFetchingSheetNames] = useState(false);
  const [fetchedSheets, setFetchedSheets] = useState<Array<{id: string, name: string}>>([]);
  const [fetchedSheetNames, setFetchedSheetNames] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isCreatingOrdersWorkbook, setIsCreatingOrdersWorkbook] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId, customVariables } = useFlowContext();

  const { isConnected: isGoogleSheetsConnected, refetchStatus } = useGoogleSheetsAuth();

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

  const getOperationColor = (op: string) => {
    const operationData = GOOGLE_SHEETS_OPERATIONS.find(operation => operation.id === op);
    return operationData?.color || 'text-muted-foreground';
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const validateField = (fieldName: string, value: string, required: boolean = false) => {
    let isValid = true;
    let message = '';

    if (required && !value.trim()) {
      isValid = false;
      message = t('flow_builder.google_sheets.field_required', 'This field is required');
    } else if (fieldName === 'spreadsheetId' && value.trim()) {
      const spreadsheetIdRegex = /^[a-zA-Z0-9-_]{44}$/;
      if (!spreadsheetIdRegex.test(value)) {
        isValid = false;
        message = t('flow_builder.google_sheets.invalid_sheet_id', 'Invalid Google Sheets ID format');
      }
    }

    setFieldValidation(prev => ({
      ...prev,
      [fieldName]: { isValid, message }
    }));

    return isValid;
  };

  const calculateProgress = () => {
    const requiredFields = [spreadsheetId, sheetName, operation];
    const filledRequired = requiredFields.filter(field => field && field.toString().trim()).length;
    const optionalFields = [JSON.stringify(config)];
    const filledOptional = optionalFields.filter(field => field && field.trim() && field !== '{}').length;


    const oauthConnected = isGoogleSheetsConnected ? 1 : 0;
    const totalRequired = requiredFields.length + 1; // +1 for OAuth
    const totalFilledRequired = filledRequired + oauthConnected;

    const progress = ((totalFilledRequired / totalRequired) * 80) + ((filledOptional / optionalFields.length) * 20);
    setConfigurationProgress(Math.round(progress));
  };

  useEffect(() => {
    calculateProgress();
  }, [isGoogleSheetsConnected, spreadsheetId, sheetName, operation, config]);

  useEffect(() => {
    refetchStatus();
  }, [refetchStatus]);

  useEffect(() => {
    const handleWindowFocus = () => {
      setTimeout(() => {
        refetchStatus();
      }, 500);
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [refetchStatus]);

  useEffect(() => {
    updateNodeData({
      spreadsheetId,
      sheetName,
      operation,
      config,
      variableMappings,
      timeout
    });
  }, [
    updateNodeData,
    spreadsheetId,
    sheetName,
    operation,
    config,
    variableMappings,
    timeout
  ]);


  useEffect(() => {
    if (!selectedTemplate && operation && Object.keys(config).length > 0) {
      const matchingTemplate = GOOGLE_SHEETS_TEMPLATES.find(template => {
        if (template.operation !== operation) return false;
        

        const templateConfigKeys = Object.keys(template.config);
        const currentConfigKeys = Object.keys(config);
        
        if (templateConfigKeys.length !== currentConfigKeys.length) return false;
        
        return templateConfigKeys.every(key => {
          const templateValue = template.config[key];
          const currentValue = config[key];
          return templateValue === currentValue;
        });
      });
      
      if (matchingTemplate) {
        setSelectedTemplate(matchingTemplate.id);
      }
    }
  }, [operation, config, selectedTemplate]);


  useEffect(() => {
    if (spreadsheetId && fetchedSheets.length > 0 && !selectedSheetId) {
      const matchingSheet = fetchedSheets.find(sheet => sheet.id === spreadsheetId);
      if (matchingSheet) {
        setSelectedSheetId(spreadsheetId);
      }
    }
  }, [spreadsheetId, fetchedSheets, selectedSheetId]);


  useEffect(() => {
    if (sheetName && fetchedSheetNames.length > 0 && !selectedSheetName) {
      const matchingSheetName = fetchedSheetNames.find(name => name === sheetName);
      if (matchingSheetName) {
        setSelectedSheetName(sheetName);
      }
    }
  }, [sheetName, fetchedSheetNames, selectedSheetName]);



  const applyTemplate = (templateId: string) => {
    const template = GOOGLE_SHEETS_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setOperation(template.operation);
      const configWithoutUndefined = Object.fromEntries(
        Object.entries(template.config).filter(([_, value]) => value !== undefined)
      );
      setConfig(configWithoutUndefined as ConfigValue);
      if (templateId === CUSTOMER_ORDERS_WORKBOOK_TEMPLATE_ID) {
        setSheetName('Orders');
        setSelectedSheetName('');
      }
    }
  };

  const createCustomerOrdersWorkbookInDrive = async () => {
    if (!isGoogleSheetsConnected) {
      toast({
        title: t('flow_builder.google_sheets.connect_first_title', 'Connect Google'),
        description: t(
          'flow_builder.google_sheets.connect_first',
          'Connect your Google account first'
        ),
        variant: 'destructive'
      });
      return;
    }
    setIsCreatingOrdersWorkbook(true);
    try {
      const defaultTitle = t(
        'flow_builder.google_sheets.customer_orders_workbook_title',
        'Customer Orders'
      );
      const res = await fetch('/api/google/sheets/create-customer-orders-workbook', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: defaultTitle })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.spreadsheetId) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Create failed');
      }
      setSpreadsheetId(data.spreadsheetId);
      setSheetName('Orders');
      setSelectedSheetId('');
      setSelectedSheetName('');
      setFetchedSheetNames([]);
      validateField('spreadsheetId', data.spreadsheetId, true);
      toast({
        title: t('flow_builder.google_sheets.workbook_created_title', 'Spreadsheet created'),
        description:
          data.spreadsheetUrl ||
          t('flow_builder.google_sheets.workbook_created_hint', 'Orders + Customer Lookup tabs are ready.')
      });
    } catch (e) {
      toast({
        title: t('flow_builder.google_sheets.workbook_create_failed_title', 'Could not create spreadsheet'),
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive'
      });
    } finally {
      setIsCreatingOrdersWorkbook(false);
    }
  };

  const updateConfig = (key: string, value: string | boolean | number | object) => {
    setConfig(prev => ({ ...prev, [key]: value }));

    if (selectedTemplate) {
      setSelectedTemplate('');
    }
  };

  const removeConfig = (key: string) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      delete newConfig[key];
      return newConfig;
    });

    if (selectedTemplate) {
      setSelectedTemplate('');
    }
  };

  const testConnection = async () => {
    if (!isGoogleSheetsConnected) {
      setTestResult({
        success: false,
        message: t('flow_builder.google_sheets.test_connect_first', 'Please connect your Google account above to test the connection')
      });
      setShowTestResult(true);
      return;
    }

    if (!spreadsheetId.trim()) {
      setTestResult({
        success: false,
        message: t('flow_builder.google_sheets.provide_spreadsheet_id', 'Please provide a Spreadsheet ID')
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/google/sheets/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          spreadsheetId,
          sheetName: sheetName || 'Sheet1',
          useOAuth: true
        }),
      });

      const result = await response.json();

      if (result.success) {

        try {
          const testDataResponse = await fetch('/api/google/sheets/add-test-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              spreadsheetId,
              sheetName: sheetName || 'Sheet1',
              useOAuth: true // Add OAuth flag for test data
            }),
          });

          const testDataResult = await testDataResponse.json();

          if (testDataResult.success) {
            setTestResult({
              success: true,
              message: `✅ Connection successful!\n📊 Test data added to "${result.data?.title || 'Google Sheet'}"\n\nTest data includes:\n• Sample contact information\n• Timestamp: ${new Date().toLocaleString()}\n• Row added at: ${testDataResult.data?.range || 'Unknown range'}`,
              data: { ...result.data, testData: testDataResult.data }
            });
          } else {
            setTestResult({
              success: true,
              message: `✅ Connection successful to "${result.data?.title || 'Google Sheet'}"\n⚠️ Could not add test data: ${testDataResult.error}`,
              data: result.data
            });
          }
        } catch (testError) {
          console.error('Error adding test data:', testError);
          setTestResult({
            success: true,
            message: `✅ Connection successful to "${result.data?.title || 'Google Sheet'}"\n⚠️ Could not add test data due to network error`,
            data: result.data
          });
        }
      } else {
        setTestResult({
          success: false,
          message: result.error || t('flow_builder.google_sheets.failed_to_connect', 'Failed to connect to Google Sheets')
        });
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setTestResult({
        success: false,
        message: t('flow_builder.google_sheets.network_error', 'Network error: Unable to test connection')
      });
    } finally {
      setIsTesting(false);
      setShowTestResult(true);
    }
  };

  const fetchGoogleSheets = async () => {
    if (!isGoogleSheetsConnected) {
      setTestResult({
        success: false,
        message: 'Please connect your Google account first to fetch sheets'
      });
      setShowTestResult(true);
      return;
    }

    setIsFetchingSheets(true);
    try {
      const response = await fetch('/api/google/sheets/list', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Google Sheets');
      }

      const result = await response.json();

      if (result.success) {
        setFetchedSheets(result.sheets || []);


        if (result.sheets && result.sheets.length > 0) {
          setTestResult({
            success: true,
            message: `Found ${result.sheets.length} Google Sheets`
          });
          setShowTestResult(true);
        }
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to fetch Google Sheets'
        });
        setShowTestResult(true);
      }
    } catch (error) {
      console.error('Error fetching Google Sheets:', error);
      setTestResult({
        success: false,
        message: 'Network error: Unable to fetch Google Sheets'
      });
      setShowTestResult(true);
    } finally {
      setIsFetchingSheets(false);
    }
  };

  const fetchSheetNames = async (spreadsheetIdToFetch?: string) => {
    const targetSpreadsheetId = spreadsheetIdToFetch || spreadsheetId;

    if (!isGoogleSheetsConnected) {
      setTestResult({
        success: false,
        message: 'Please connect your Google account first to fetch sheet names'
      });
      setShowTestResult(true);
      return;
    }

    if (!targetSpreadsheetId.trim()) {
      setTestResult({
        success: false,
        message: 'Please provide a Spreadsheet ID to fetch sheet names'
      });
      setShowTestResult(true);
      return;
    }

    setIsFetchingSheetNames(true);
    try {
      const response = await fetch('/api/google/sheets/sheet-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId: targetSpreadsheetId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sheet names');
      }

      const result = await response.json();
      if (result.success) {
        setFetchedSheetNames(result.sheetNames || []);
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to fetch sheet names'
        });
        setShowTestResult(true);
      }
    } catch (error) {
      console.error('Error fetching sheet names:', error);
      setTestResult({
        success: false,
        message: 'Network error: Unable to fetch sheet names'
      });
      setShowTestResult(true);
    } finally {
      setIsFetchingSheetNames(false);
    }
  };

  return (
    <div className="node-google-sheets relative overflow-visible p-3 rounded-lg bg-card border border-border shadow-sm min-w-[440px] max-w-[560px] group">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
              <p className="text-xs">{t('flow_builder.google_sheets.duplicate_node', 'Duplicate node')}</p>
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
              <p className="text-xs">{t('flow_builder.google_sheets.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />

      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <img 
                src={APP_ICONS.googleSheets}
                alt={t('flow_builder.node_types.google_sheets', 'Google Sheets')} 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.google_sheets.tooltip_integration', 'Google Sheets Integration')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>{t('flow_builder.node_types.google_sheets', 'Google Sheets')}</span>
        
        {configurationProgress > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20">
                  {configurationProgress}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.google_sheets.configuration_progress', 'Configuration Progress')}</p>
                <p className="text-xs text-muted-foreground">
                  {configurationProgress === 100
                    ? t('flow_builder.google_sheets.configuration_complete', 'Fully configured and ready to use')
                    : t('flow_builder.google_sheets.configuration_incomplete', 'Complete all required fields for full functionality')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.hide"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {t('flow_builder.google_sheets.hide', 'Hide')}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t('flow_builder.google_sheets.edit', 'Edit')}
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {isEditing
                  ? t('flow_builder.google_sheets.hide_configuration', 'Hide configuration options')
                  : t('flow_builder.google_sheets.show_configuration', 'Show configuration options')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="text-sm p-2 bg-card rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <span className="text-lg">{GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.icon || '📊'}</span>
                  <span className={cn("font-medium", getOperationColor(operation))}>
                    {t(`flow_builder.google_sheets_${operation}` as const, GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.name || operation)}
                  </span>
                  {isGoogleSheetsConnected && (
                    <span className="text-xs text-primary font-medium">✓</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{t(`flow_builder.google_sheets_${operation}` as const, GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.name || '')}</p>
                <p className="text-xs text-muted-foreground">{t(`flow_builder.google_sheets_${operation}_tooltip` as const, GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.tooltip || '')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {isGoogleSheetsConnected && spreadsheetId && sheetName ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {isGoogleSheetsConnected && spreadsheetId && sheetName
                      ? t('flow_builder.google_sheets.status_ready', 'Ready')
                      : t('flow_builder.google_sheets.status_setup_required', 'Setup required')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {isGoogleSheetsConnected && spreadsheetId && sheetName
                    ? t('flow_builder.google_sheets.status_ready_help', 'Google Sheets ready to use (OAuth)')
                    : t('flow_builder.google_sheets.status_setup_required_help', 'Please authenticate and configure sheet details')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex flex-wrap gap-1 text-[10px]">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {isGoogleSheetsConnected
                    ? t('flow_builder.google_sheets.oauth_connected_badge', '✅ OAuth')
                    : t('flow_builder.google_sheets.oauth_disconnected_badge', '❌ No Auth')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {isGoogleSheetsConnected
                    ? t('flow_builder.google_sheets.oauth_connected_help', 'Connected via OAuth - Modern authentication')
                    : t('flow_builder.google_sheets.oauth_disconnected_help', 'Authentication required - Connect your Google account above')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {spreadsheetId
                    ? t('flow_builder.google_sheets.sheet_selected_badge', '📄 Sheet')
                    : t('flow_builder.google_sheets.sheet_missing_badge', '❌ No Sheet')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {spreadsheetId
                    ? t('flow_builder.google_sheets.sheet_id_badge', 'Sheet ID: {{id}}...', {
                        id: spreadsheetId.substring(0, 10),
                      })
                    : t('flow_builder.google_sheets.sheet_id_required', 'Google Sheet ID required')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {sheetName
                    ? t('flow_builder.google_sheets.sheet_name_badge', '📋 {{name}}', { name: sheetName })
                    : t('flow_builder.google_sheets.sheet_name_missing_badge', '❌ No Tab')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {sheetName
                    ? t('flow_builder.google_sheets.sheet_name_help', 'Sheet tab: {{name}}', { name: sheetName })
                    : t('flow_builder.google_sheets.sheet_name_required', 'Sheet tab name required')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {Object.keys(config).length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ⚙️ Config
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Operation configuration completed</p>
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(config).length} configuration option(s) set
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {variableMappings.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    🔗 {variableMappings.length} Vars
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Variable mappings configured</p>
                  <p className="text-xs text-muted-foreground">
                    {variableMappings.length} output variable(s) will be created
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <GoogleSheetsOAuthStatus
        className="mt-3"
        onAuthSuccess={() => {
          refetchStatus();
        }}
        onDisconnect={() => {
          refetchStatus();
        }}
      />

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border border-border rounded p-2 bg-card">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Table data-tour="components-flow-builder-googlesheetsnode.table.flow_builder.google_sheets.quick_templates" className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.google_sheets.quick_templates', 'Quick Templates')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.google_sheets.templates_tooltip', 'Pre-configured templates for common Google Sheets operations')}</p>
                    <p className="text-xs text-muted-foreground">{t('flow_builder.google_sheets.templates_tooltip_sub', 'Select a template to quickly set up your integration')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={selectedTemplate}
              onValueChange={applyTemplate}
            >
              <SelectTrigger data-tour="components-flow-builder-googlesheetsnode.selecttrigger.flow_builder.google_sheets.choose_template" className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.google_sheets.choose_template', 'Choose a template...')}>
                  {selectedTemplate ? GOOGLE_SHEETS_TEMPLATES.find(tmpl => tmpl.id === selectedTemplate)?.name : t('flow_builder.google_sheets.choose_template', 'Choose a template...')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GOOGLE_SHEETS_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{GOOGLE_SHEETS_OPERATIONS.find(op => op.id === template.operation)?.icon}</span>
                      <div>
                        <div className="font-medium">{t(`flow_builder.google_sheets.template_${template.id}` as const, template.name)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {t(`flow_builder.google_sheets_${template.operation}_description` as const, GOOGLE_SHEETS_OPERATIONS.find(op => op.id === template.operation)?.description || '')}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate === CUSTOMER_ORDERS_WORKBOOK_TEMPLATE_ID && (
              <div className="mt-2 p-2 rounded border border-primary/25 bg-primary/5 space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {t(
                    'flow_builder.google_sheets.customer_orders_workbook_blurb',
                    'Creates a file in your Google Drive with two tabs: Orders (full row + status dropdown on column J) and Customer Lookup (enter Order ID in B1 to VLOOKUP details.)'
                  )}
                </p>
                <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.creating_workbook"
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs w-full"
                  disabled={!isGoogleSheetsConnected || isCreatingOrdersWorkbook}
                  onClick={createCustomerOrdersWorkbookInDrive}
                >
                  {isCreatingOrdersWorkbook ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      {t('flow_builder.google_sheets.creating_workbook', 'Creating…')}
                    </>
                  ) : (
                    t(
                      'flow_builder.google_sheets.create_customer_orders_workbook',
                      'Create spreadsheet in Google Drive'
                    )
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t">

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium">{t('flow_builder.google_sheets.sheet_id', 'Google Sheet ID')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs font-medium">{t('flow_builder.google_sheets.sheet_id_tooltip', 'Google Sheets Document ID')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('flow_builder.google_sheets.sheet_id_url_help', "Found in the Google Sheets URL between '/d/' and '/edit'")}
                      </p>
                      <p className="text-xs text-primary mt-1">
                        {t('flow_builder.google_sheets.sheet_id_example', 'Example: docs.google.com/spreadsheets/d/[SHEET_ID]/edit')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <EnhancedVariablePicker
                    flowId={flowId ?? undefined}
                    customVariables={customVariables}
                    value={spreadsheetId}
                    onChange={(value) => {
                      setSpreadsheetId(value);
                      validateField('spreadsheetId', value, true);

                      if (selectedSheetId) {
                        setSelectedSheetId('');
                      }

                      setSelectedSheetName('');
                      setSheetName('');
                      setFetchedSheetNames([]);
                    }}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    className={cn(
                      fieldValidation.spreadsheetId?.isValid === false ? "border-destructive" :
                      fieldValidation.spreadsheetId?.isValid === true ? "border-primary" : ""
                    )}
                  />
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.fetch_sheets"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 flex items-center gap-1.5"
                        onClick={fetchGoogleSheets}
                        disabled={isFetchingSheets || !isGoogleSheetsConnected}
                      >
                        {isFetchingSheets ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <img
                              src={APP_ICONS.googleSheetsAlternate}
                              alt={t('flow_builder.google_sheets.fetch_sheets', 'Fetch your Google Sheets')}
                              className="w-3 h-3"
                            />
                            <span className="text-[11px] font-medium">
                              {t('flow_builder.google_sheets.fetch', 'Fetch')}
                            </span>
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {!isGoogleSheetsConnected
                          ? t('flow_builder.google_sheets.connect_first', 'Connect your Google account first')
                          : t('flow_builder.google_sheets.fetch_sheets', 'Fetch your Google Sheets')
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {fieldValidation.spreadsheetId?.message && (
                <p className="text-[10px] text-destructive mt-1">
                  {fieldValidation.spreadsheetId.message}
                </p>
              )}

              {fetchedSheets.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">{t('flow_builder.google_sheets.select_from_sheets', 'Select from your sheets:')}</Label>
                  <Select
                    value={selectedSheetId}
                    onValueChange={(value) => {
                      const selectedSheet = fetchedSheets.find(sheet => sheet.id === value);
                      if (selectedSheet) {
                        setSelectedSheetId(value);
                        setSpreadsheetId(selectedSheet.id);
                        validateField('spreadsheetId', selectedSheet.id, true);

                        setSelectedSheetName('');
                        setSheetName('');
                        setFetchedSheetNames([]);
                      }
                    }}
                  >
                    <SelectTrigger data-tour="components-flow-builder-googlesheetsnode.selecttrigger.flow_builder.google_sheets.choose_sheet" className="text-xs h-7">
                      <SelectValue placeholder={t('flow_builder.google_sheets.choose_sheet', 'Choose a sheet...')}>
                        {selectedSheetId ? fetchedSheets.find(sheet => sheet.id === selectedSheetId)?.name : t('flow_builder.google_sheets.choose_sheet', 'Choose a sheet...')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {fetchedSheets.map((sheet) => (
                        <SelectItem key={sheet.id} value={sheet.id}>
                          <div className="flex items-center gap-2">
                            <img 
                              src={APP_ICONS.googleSheets}
                              alt={t('flow_builder.node_types.google_sheets', 'Google Sheets')} 
                              className="w-3 h-3"
                            />
                            <div>
                              <div className="font-medium text-xs">{sheet.name}</div>
                              <div className="text-[10px] text-muted-foreground">{sheet.id}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium">{t('flow_builder.google_sheets.sheet_name', 'Sheet Name')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs font-medium">{t('flow_builder.google_sheets.sheet_tab_name', 'Sheet Tab Name')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('flow_builder.google_sheets.sheet_tab_help', 'The name of the specific sheet tab within your Google Sheets document')}
                      </p>
                      <p className="text-xs text-primary mt-1">
                        {t('flow_builder.google_sheets.sheet_tab_default', 'Default is usually "Sheet1" for new sheets')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <EnhancedVariablePicker
                    flowId={flowId ?? undefined}
                    customVariables={customVariables}
                    value={sheetName}
                    onChange={(value) => {
                      setSheetName(value);

                      if (selectedSheetName) {
                        setSelectedSheetName('');
                      }
                    }}
                    placeholder="Sheet1"
                  />
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.fetch_names"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 gap-1 whitespace-nowrap"
                        onClick={() => fetchSheetNames()}
                        disabled={isFetchingSheetNames || !isGoogleSheetsConnected || !spreadsheetId.trim()}
                      >
                        {isFetchingSheetNames ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Search className="w-3 h-3" />
                        )}
                        <span className="text-xs">{t('flow_builder.google_sheets.fetch_names', 'Fetch Names')}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {!isGoogleSheetsConnected
                          ? t('flow_builder.google_sheets.connect_first', 'Connect your Google account first')
                          : !spreadsheetId.trim()
                          ? t('flow_builder.google_sheets.enter_sheet_id_first', 'Enter Spreadsheet ID first')
                          : t('flow_builder.google_sheets.fetch_sheet_names', 'Fetch sheet names from this spreadsheet')
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {fetchedSheetNames.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">{t('flow_builder.google_sheets.select_sheet_name', 'Select sheet name:')}</Label>
                  <Select
                    value={selectedSheetName}
                    onValueChange={(value) => {
                      setSelectedSheetName(value);
                      setSheetName(value);
                    }}
                  >
                    <SelectTrigger data-tour="components-flow-builder-googlesheetsnode.selecttrigger.flow_builder.google_sheets.choose_sheet_name" className="text-xs h-7">
                      <SelectValue placeholder={t('flow_builder.google_sheets.choose_sheet_name', 'Choose a sheet name...')}>
                        {selectedSheetName || t('flow_builder.google_sheets.choose_sheet_name', 'Choose a sheet name...')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {fetchedSheetNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          <div className="flex items-center gap-2">
                            <Table className="w-3 h-3 text-primary" />
                            <span className="text-xs">{name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.test_add_sample"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 flex-1"
                    onClick={testConnection}
                    disabled={isTesting || !isGoogleSheetsConnected || !spreadsheetId.trim()}
                  >
                    {isTesting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Play className="h-3 w-3 mr-1" />
                    )}
                    {t('flow_builder.google_sheets.test_add_sample', 'Test & Add Sample Data')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.google_sheets.test_tooltip', 'Test connection and add sample data')}</p>
                  <p className="text-xs text-muted-foreground">
                    {!isGoogleSheetsConnected || !spreadsheetId.trim()
                      ? t('flow_builder.google_sheets.test_tooltip_connect', 'Connect your Google account and enter Spreadsheet ID to enable testing')
                      : t('flow_builder.google_sheets.test_tooltip_verify', 'Verify your configuration and add test data to the sheet')
                    }
                  </p>
                  <p className="text-xs text-primary mt-1">
                    {t('flow_builder.google_sheets.test_sample_row', '📊 Will add a sample row with contact information')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>


          </div>

          {showTestResult && testResult && (
            <div className={cn(
              "p-2 rounded border text-xs mt-2",
              testResult.success
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {testResult.success ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  <span className="font-medium">
                    {testResult.success ? t('flow_builder.google_sheets.connection_successful', 'Connection Successful') : t('flow_builder.google_sheets.connection_failed', 'Connection Failed')}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => setShowTestResult(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-1 whitespace-pre-line">{testResult.message}</div>
              {testResult.success && testResult.data?.sheets && (
                <div className="mt-2">
                  <p className="font-medium">{t('flow_builder.google_sheets.available_sheets', 'Available sheets:')}</p>
                  <p className="text-muted-foreground">
                    {testResult.data.sheets.map((sheet: any) => sheet.properties.title).join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium">{t('flow_builder.google_sheets.operation', 'Google Sheets Operation')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.google_sheets.operation_tooltip', 'Choose the type of Google Sheets operation to perform')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.google_sheets.operation_tooltip_sub', 'Each operation has different configuration options')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={operation}
                onValueChange={(value) => {
                  setOperation(value);

                  if (selectedTemplate) {
                    setSelectedTemplate('');
                  }
                }}
              >
                <SelectTrigger data-tour="components-flow-builder-googlesheetsnode.selecttrigger.flow_builder.google_sheets.select_operation" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.google_sheets.select_operation', 'Select operation')} />
                </SelectTrigger>
                <SelectContent className="z-[9998]">
                  {GOOGLE_SHEETS_OPERATIONS.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      <div className="flex items-center gap-2 w-full" title={`${op.name}: ${op.tooltip}`}>
                        <span className="text-sm">{op.icon}</span>
                        <div className="flex-1">
                          <div className={cn("font-medium", op.color)}>{t(`flow_builder.google_sheets_${op.id}` as const, op.name)}</div>
                          <div className="text-[10px] text-muted-foreground">{t(`flow_builder.google_sheets_${op.id}_description` as const, op.description)}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {OPERATION_CONFIG[operation as keyof typeof OPERATION_CONFIG] && (
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <div className="flex items-center gap-2 pt-2 border-t">
                <CollapsibleTrigger asChild>
                  <Button data-tour="components-flow-builder-googlesheetsnode.button.flow_builder.google_sheets.operation_configuration" variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    {showAdvanced ? (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    )}
                    {t('flow_builder.google_sheets.operation_configuration', 'Operation Configuration')}
                  </Button>
                </CollapsibleTrigger>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.google_sheets.operation_config_tooltip', 'Configure specific options for the selected operation')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.google_sheets.operation_config_tooltip_sub', 'Settings vary based on operation type')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <CollapsibleContent className="space-y-2">
                {OPERATION_CONFIG[operation as keyof typeof OPERATION_CONFIG].map((configField) => (
                  <div key={configField.key} className="p-2 rounded border border-border bg-card">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mb-1">
                          <Label className="text-[10px] font-medium">
                            {t(`flow_builder.google_sheets.config_${configField.key}` as const, configField.label)}
                            {configField.required && <span className="text-destructive ml-1">*</span>}
                          </Label>
                          {configField.tooltip && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs max-w-48">{t(`flow_builder.google_sheets.config_${configField.key}_tooltip` as const, configField.tooltip || '')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>

                        {configField.key === 'duplicateCheck' ? (
                          <DuplicatePreventionUI
                            value={config[configField.key] || {}}
                            onChange={(value) => updateConfig(configField.key, value)}
                          />
                        ) : configField.key === 'columnMappings' ? (
                          <ColumnMappingsUI
                            value={config[configField.key] || {}}
                            onChange={(value) => updateConfig(configField.key, value)}
                            placeholder={configField.placeholder}
                            flowId={flowId}
                            customVariables={customVariables}
                            spreadsheetId={spreadsheetId}
                            sheetName={sheetName || 'Sheet1'}
                            googleConnected={isGoogleSheetsConnected}
                          />
                        ) : configField.type === 'object' ? (
                          <Textarea
                            value={typeof config[configField.key] === 'object'
                              ? JSON.stringify(config[configField.key], null, 2)
                              : config[configField.key] || ''
                            }
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                updateConfig(configField.key, parsed);
                              } catch {
                                updateConfig(configField.key, e.target.value);
                              }
                            }}
                            placeholder={configField.placeholder}
                            className="text-[10px] h-16 resize-none"
                          />
                        ) : configField.type === 'boolean' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={config[configField.key] || configField.default || false}
                              onChange={(e) => updateConfig(configField.key, e.target.checked)}
                              className="h-3 w-3"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {t(`flow_builder.google_sheets.config_${configField.key}_desc` as const, configField.description || '')}
                            </span>
                          </div>
                        ) : configField.type === 'number' ? (
                          <NumberInput
                            value={Number(config[configField.key]) || Number(configField.default) || 0}
                            onChange={(value) => updateConfig(configField.key, value)}
                            fallbackValue={Number(configField.default) || 0}
                            className="text-[10px] h-6"
                          />
                        ) : (
                          <EnhancedVariablePicker
                            flowId={flowId ?? undefined}
                            customVariables={customVariables}
                            value={config[configField.key] || ''}
                            onChange={(value) => updateConfig(configField.key, value)}
                            placeholder={configField.placeholder}
                            className="text-[10px] h-6"
                          />
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 mt-4"
                        onClick={() => removeConfig(configField.key)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs font-medium text-primary">{t('flow_builder.google_sheets.quick_examples', '💡 Quick Examples')}</span>
            </div>
            <div className="text-[10px] text-primary space-y-1">
              {operation === 'append_row' && (
                <>
                  <p>• Column mapping: {"{"}"Name": "{"{{contact.name}}"}", "Phone": "{"{{contact.phone}}"}", "Message": "{"{{message.content}}"}"{"}"}</p>
                  <p>• Use variables from conversation context</p>
                </>
              )}
              {operation === 'read_rows' && (
                <>
                  <p>• Filter by phone: filterColumn="Phone", filterValue="{"{{contact.phone}}"}"</p>
                  <p>• Limit results with maxRows for better performance</p>
                </>
              )}
              {operation === 'update_row' && (
                <>
                  <p>• Match by ID: matchColumn="Order ID", matchValue="{"{{order.id}}"}"</p>
                  <p>• Update specific columns: {"{"}"Status": "{"{{order.status}}"}", "Updated": "{"{{current.timestamp}}"}"{"}"}</p>
                </>
              )}
              {operation === 'get_sheet_info' && (
                <>
                  <p>• No configuration needed - returns sheet metadata</p>
                  <p>• Use to get column headers and sheet information</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



