import { useRef, useState, useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import Papa from 'papaparse';
import {
  AlertCircle,
  CheckCircle,
  Download,
  Info,
  Loader2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';

type Step = 'upload' | 'mapping' | 'result';
type ImportMode = 'set_quantity' | 'adjust_quantity';

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{
    row: number;
    productId?: string;
    sku?: string;
    variantSku?: string;
    errorCode: string;
    errorParams?: Record<string, string>;
  }>;
}

type TranslateFn = (key: string, fallback: string, vars?: Record<string, string>) => string;

function withVariantSuffix(
  t: TranslateFn,
  params?: Record<string, string>
): Record<string, string> {
  const base = params ?? {};
  const variantSuffix = base.variantId
    ? t('erp.inventory.import.errors.variantSuffix', ' (variant {{variantId}})', {
        variantId: base.variantId,
      })
    : '';
  return { ...base, variantSuffix };
}

function translateInventoryImportError(
  t: TranslateFn,
  errorCode: string,
  errorParams?: Record<string, string>
): string {
  const params = withVariantSuffix(t, errorParams);
  switch (errorCode) {
    case 'no_file_selected':
      return t('erp.inventory.import.errors.noFileSelected', 'No file selected');
    case 'upload_failed':
      return t('erp.inventory.import.errors.uploadFailed', 'Failed to upload file');
    case 'invalid_file_type':
      return t('erp.inventory.import.errors.invalidFileType', 'Only CSV files are allowed');
    case 'company_required':
      return t('erp.inventory.import.errors.companyRequired', 'Company ID required');
    case 'no_file_uploaded':
      return t('erp.inventory.import.errors.noFileUploaded', 'No file was uploaded');
    case 'invalid_mode':
      return t('erp.inventory.import.errors.invalidMode', 'Mode must be set_quantity or adjust_quantity');
    case 'invalid_mapping_json':
      return t('erp.inventory.import.errors.invalidMappingJson', 'Invalid mapping JSON');
    case 'invalid_mapping_object':
      return t('erp.inventory.import.errors.invalidMappingObject', 'Mapping must be a plain object');
    case 'invalid_upload_warehouse_id':
      return t(
        'erp.inventory.import.errors.invalidUploadWarehouseId',
        'Invalid upload-level warehouse ID'
      );
    case 'csv_parse_error':
      return t('erp.inventory.import.errors.csvParseError', 'Failed to parse CSV file');
    case 'warehouse_not_found':
      return t('erp.inventory.import.errors.warehouseNotFound', 'Warehouse not found');
    case 'variant_not_found':
      return t('erp.inventory.import.errors.variantNotFound', 'Variant not found');
    case 'invalid_product_id':
      return t('erp.inventory.import.errors.invalidProductId', 'Invalid Product ID');
    case 'product_not_found':
      return t('erp.inventory.import.errors.productNotFound', 'Product not found');
    case 'product_id_variant_mismatch':
      return t(
        'erp.inventory.import.errors.productIdVariantMismatch',
        'Product ID does not match variant SKU'
      );
    case 'product_not_found_for_sku':
      return t('erp.inventory.import.errors.productNotFoundForSku', 'Product not found for SKU');
    case 'sku_identifier_mismatch':
      return t(
        'erp.inventory.import.errors.skuIdentifierMismatch',
        'SKU does not match other product identifiers'
      );
    case 'product_identifier_required':
      return t(
        'erp.inventory.import.errors.productIdentifierRequired',
        'Product identifier is required (Product ID or SKU)'
      );
    case 'variant_does_not_belong_to_product':
      return t(
        'erp.inventory.import.errors.variantDoesNotBelongToProduct',
        'Variant does not belong to this product'
      );
    case 'variant_required_for_product':
      return t(
        'erp.inventory.import.errors.variantRequired',
        'Variant is required for products that use variants'
      );
    case 'warehouse_id_required':
      return t('erp.inventory.import.errors.warehouseIdRequired', 'Warehouse ID is required');
    case 'invalid_warehouse_id':
      return t('erp.inventory.import.errors.invalidWarehouseId', 'Invalid Warehouse ID');
    case 'quantity_required_invalid':
      return t(
        'erp.inventory.import.errors.quantityRequiredInvalid',
        'Quantity is required and must be a valid number'
      );
    case 'quantity_must_not_be_zero':
      return t('erp.inventory.import.errors.quantityMustNotBeZero', 'Quantity must not be zero');
    case 'quantity_cannot_be_negative':
      return t(
        'erp.inventory.import.errors.quantityCannotBeNegative',
        'Quantity cannot be negative when setting stock level'
      );
    case 'invalid_stock_movement_quantity':
      return t(
        'erp.inventory.import.errors.invalidStockMovementQuantity',
        'Invalid stock movement quantity for product {{productId}}{{variantSuffix}}',
        params
      );
    case 'invalid_stock_level_at_warehouse':
      return t(
        'erp.inventory.import.errors.invalidStockLevelAtWarehouse',
        'Invalid stock level at warehouse for product {{productId}}{{variantSuffix}}',
        params
      );
    case 'insufficient_stock_at_warehouse':
      return t(
        'erp.inventory.import.errors.insufficientStockAtWarehouse',
        'Insufficient stock at warehouse for product {{productId}}{{variantSuffix}}',
        params
      );
    case 'invalid_stock_count_quantity':
      return t(
        'erp.inventory.import.errors.invalidStockCountQuantity',
        'Invalid stock count quantity for product {{productId}}{{variantSuffix}}',
        params
      );
    case 'row_error':
      return t('erp.inventory.import.errors.rowError', 'Import failed for this row');
    default:
      return t('erp.inventory.import.errors.generic', 'Import failed');
  }
}

interface WarehouseOption {
  id: number;
  name: string;
  isDefault?: boolean | null;
}

function getInventoryFields(
  t: (key: string, fallback: string) => string
): Array<{ value: string; label: string; required?: boolean }> {
  return [
    { value: 'productId', label: t('erp.inventory.import.field.productId', 'Product ID') },
    { value: 'sku', label: t('erp.inventory.import.field.sku', 'SKU') },
    { value: 'variantSku', label: t('erp.inventory.import.field.variantSku', 'Variant SKU') },
    { value: 'warehouseId', label: t('erp.inventory.import.field.warehouseId', 'Warehouse ID') },
    { value: 'quantity', label: t('erp.inventory.import.field.quantity', 'Quantity'), required: true },
    { value: 'notes', label: t('erp.inventory.import.field.notes', 'Notes') },
    { value: '__skip__', label: t('erp.inventory.import.field.skip', '— Do not import —') },
  ];
}

const AUTO_MAP_HINTS: Record<string, string> = {
  productid: 'productId',
  product: 'productId',
  id: 'productId',
  sku: 'sku',
  stockkeepingunit: 'sku',
  variantsku: 'variantSku',
  variant: 'variantSku',
  warehouseid: 'warehouseId',
  warehouse: 'warehouseId',
  quantity: 'quantity',
  qty: 'quantity',
  amount: 'quantity',
  notes: 'notes',
  note: 'notes',
  comment: 'notes',
  comments: 'notes',
};

interface InventoryImportDialogProps {
  open: boolean;
  onClose: () => void;
  warehouses: WarehouseOption[];
  onImportSuccess?: () => void;
}

function autoMap(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    const normalised = header.toLowerCase().replace(/\s+/g, '');
    result[header] = AUTO_MAP_HINTS[normalised] ?? '__skip__';
  }
  return result;
}

export default function InventoryImportDialog({
  open,
  onClose,
  warehouses,
  onImportSuccess,
}: InventoryImportDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inventoryFields = useMemo(() => getInventoryFields(t), [t]);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('set_quantity');
  const [uploadWarehouseId, setUploadWarehouseId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const defaultWarehouse = warehouses.find((w) => w.isDefault);
    setUploadWarehouseId(defaultWarehouse ? String(defaultWarehouse.id) : '');
  }, [open, warehouses]);

  const mappedValues = Object.values(mapping);
  const hasQuantityMapping = mappedValues.includes('quantity');
  const hasIdentifierMapping = mappedValues.some((v) =>
    ['productId', 'sku', 'variantSku'].includes(v)
  );
  const hasWarehouseColumnMapping = mappedValues.includes('warehouseId');
  const hasUploadWarehouse = uploadWarehouseId !== '';
  const hasWarehouseResolution = hasUploadWarehouse || hasWarehouseColumnMapping;
  const canImport = hasQuantityMapping && hasIdentifierMapping && hasWarehouseResolution;

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        const err = new Error('no_file_selected') as Error & { errorCode: string };
        err.errorCode = 'no_file_selected';
        throw err;
      }

      const filteredMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, v]) => v !== '__skip__')
      );

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(filteredMapping));
      formData.append('mode', importMode);
      if (uploadWarehouseId) {
        formData.append('warehouseId', uploadWarehouseId);
      }

      const response = await apiRequest('POST', '/api/erp/inventory/import', formData);
      const json = (await response.json()) as { success: boolean; data: ImportResult };
      return json.data;
    },
    onSuccess: (data: ImportResult) => {
      setResult(data);
      setStep('result');
      onImportSuccess?.();
    },
    onError: (err: Error & { errorCode?: string; errorParams?: Record<string, string> }) => {
      setStep('mapping');
      const description = err.errorCode
        ? translateInventoryImportError(t, err.errorCode, err.errorParams)
        : t('erp.inventory.import.errors.generic', 'Import failed');
      toast({
        title: t('common.error', 'Error'),
        description,
        variant: 'destructive',
      });
    },
  });

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: t('common.error', 'Error'),
        description: t('erp.inventory.import.invalidFileType', 'Please upload a CSV file'),
        variant: 'destructive',
      });
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({
        title: t('common.error', 'Error'),
        description: t('erp.inventory.import.fileTooLarge', 'File size must not exceed 10 MB'),
        variant: 'destructive',
      });
      return;
    }

    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        if (new Set(headers).size !== headers.length) {
          toast({
            title: t('common.warning', 'Warning'),
            description: t(
              'erp.inventory.import.duplicateHeaders',
              'Your CSV contains duplicate column names. Only one column per name can be mapped.'
            ),
            variant: 'destructive',
          });
        }
        setCsvHeaders(headers);
        setPreviewRows(results.data.slice(0, 3));
        setMapping(autoMap(headers));
        setFile(selectedFile);
        setStep('mapping');
      },
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  };

  const downloadTemplate = async () => {
    try {
      const response = await apiRequest('GET', '/api/erp/inventory/import/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory_import_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      toast({
        title: t('common.error', 'Error'),
        description: err instanceof Error ? err.message : t('common.unknownError', 'Unknown error'),
        variant: 'destructive',
      });
    }
  };

  const handleImport = () => {
    if (!canImport) return;
    setStep('result');
    importMutation.mutate();
  };

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setCsvHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setIsDragOver(false);
    setResult(null);
    setImportMode('set_quantity');
    setUploadWarehouseId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const dialogTitle =
    step === 'upload'
      ? t('erp.inventory.import.title', 'Import Inventory')
      : step === 'mapping'
        ? t('erp.inventory.import.mapColumns', 'Map Columns')
        : t('erp.inventory.import.complete', 'Import Complete');

  const selectedUploadWarehouse = warehouses.find((w) => String(w.id) === uploadWarehouseId);

  const uploadDescription = t(
    'erp.inventory.import.uploadDescription',
    'Choose a warehouse (defaults to the company default when set), then upload a CSV. Row Warehouse IDs override the selected warehouse.'
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {step === 'mapping' && file
              ? file.name
              : step === 'result'
                ? importMutation.isPending
                  ? t('erp.inventory.import.importing', 'Importing inventory…')
                  : t('erp.inventory.import.resultDescription', 'Review the import results below.')
                : uploadDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'upload' && (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>{uploadDescription}</AlertDescription>
              </Alert>

              <div>
                <Label className="text-xs text-muted-foreground">
                  {t('erp.inventory.import.uploadWarehouse', 'Warehouse')}
                </Label>
                <Select
                  value={uploadWarehouseId || '__none__'}
                  onValueChange={(value) =>
                    setUploadWarehouseId(value === '__none__' ? '' : value)
                  }
                >
                  <SelectTrigger data-tour="components-erp-inventoryimportdialog.selecttrigger.erp.inventory.import.selectWarehouse">
                    <SelectValue
                      placeholder={t(
                        'erp.inventory.import.selectWarehouse',
                        'Select warehouse (optional if CSV has Warehouse ID)'
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="__none__">
                      {t(
                        'erp.inventory.import.useCsvWarehouseOnly',
                        'None — require Warehouse ID in CSV'
                      )}
                    </SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                        {w.isDefault
                          ? ` (${t('erp.inventory.warehouses.default', 'Default')})`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t(
                    'erp.inventory.import.uploadWarehouseBeforeHint',
                    'Used as fallback for rows without Warehouse ID. CSV Warehouse ID values always win per row.'
                  )}
                </p>
              </div>

              <div className="text-center">
                <Button data-tour="components-erp-inventoryimportdialog.button.erp.inventory.import.downloadTemplate" variant="outline" onClick={() => void downloadTemplate()}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('erp.inventory.import.downloadTemplate', 'Download Template')}
                </Button>
              </div>

              <div
                className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  isDragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/80'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    {t(
                      'erp.inventory.import.clickToUpload',
                      'Click to upload or drag and drop your file here'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('erp.inventory.import.supportsCsv', 'Supports CSV files (max 10MB)')}
                  </p>
                </div>
                <input data-tour="components-erp-inventoryimportdialog.input.erp.inventory.import.clickToUpload"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </>
          )}

          {step === 'mapping' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">
                  {t('erp.inventory.import.importMode', 'Import mode')}
                </Label>
                <Select
                  value={importMode}
                  onValueChange={(value) => setImportMode(value as ImportMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="set_quantity">
                      {t('erp.inventory.import.modeSetQuantity', 'Set quantity')}
                    </SelectItem>
                    <SelectItem value="adjust_quantity">
                      {t('erp.inventory.import.modeAdjustQuantity', 'Adjust quantity')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasUploadWarehouse && selectedUploadWarehouse ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {t(
                      'erp.inventory.import.uploadWarehouseFallbackHint',
                      'Fallback warehouse: "{{name}}". Rows with a Warehouse ID column value use that ID instead.',
                      { name: selectedUploadWarehouse.name }
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {t(
                      'erp.inventory.import.csvWarehouseOnlyHint',
                      'No fallback warehouse selected. Map Warehouse ID and provide a value on every row.'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {!hasQuantityMapping && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(
                      'erp.inventory.import.quantityRequired',
                      'Quantity is required — please map at least one column to it.'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {!hasIdentifierMapping && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(
                      'erp.inventory.import.identifierRequired',
                      'At least one product identifier is required — map Product ID, SKU, or Variant SKU.'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {!hasWarehouseResolution && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(
                      'erp.inventory.import.warehouseRequired',
                      'Warehouse is required — go back and select a warehouse, or map a CSV column to Warehouse ID.'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table data-tour="components-erp-inventoryimportdialog.table.erp.inventory.import.yourCsvColumn" erpSortable={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('erp.inventory.import.yourCsvColumn', 'Your CSV Column')}
                      </TableHead>
                      <TableHead>
                        {t('erp.inventory.import.mapsToField', 'Maps to Inventory Field')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvHeaders.map((header, index) => (
                      <TableRow key={index}>
                        <TableCell
                          className={mapping[header] === '__skip__' ? 'text-muted-foreground' : undefined}
                        >
                          {header}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mapping[header]}
                            onValueChange={(value) =>
                              setMapping((prev) => ({ ...prev, [header]: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent searchable>
                              {inventoryFields.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                  {field.required && (
                                    <Badge variant="destructive" className="ml-1 text-xs">
                                      {t('erp.common.required', 'Required')}
                                    </Badge>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <h4 className="text-sm font-medium text-muted-foreground">
                {t('erp.inventory.import.dataPreview', 'Data Preview (first 3 rows)')}
              </h4>
              <div className="max-h-48 overflow-y-auto">
                <Table erpSortable={false}>
                  <TableHeader>
                    <TableRow>
                      {csvHeaders.map((header) => (
                        <TableHead key={header} className="text-xs text-muted-foreground">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {csvHeaders.map((header) => (
                          <TableCell key={header} className="text-xs text-muted-foreground">
                            {row[header] ?? ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {step === 'result' && (
            <>
              {importMutation.isPending && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('erp.inventory.import.importing', 'Importing inventory…')}
                  </p>
                </div>
              )}

              {result && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800">{result.imported ?? 0}</p>
                        <p className="text-sm text-green-600">
                          {t('erp.inventory.import.imported', 'Imported')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <Info className="h-5 w-5 text-slate-600" />
                      <div>
                        <p className="font-medium text-slate-800">{result.skipped ?? 0}</p>
                        <p className="text-sm text-slate-600">
                          {t('erp.inventory.import.skipped', 'Skipped')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">{result.failed ?? 0}</p>
                        <p className="text-sm text-red-600">
                          {t('erp.inventory.import.failed', 'Failed')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(result.errors ?? []).length > 0 && (
                    <div className="mt-4 max-h-48 space-y-1 overflow-y-auto">
                      <h4 className="text-sm font-medium">
                        {t('erp.inventory.import.errors', 'Import Errors:')}
                      </h4>
                      {result.errors.map((error, index) => (
                        <div
                          key={index}
                          className="rounded border border-red-200 bg-red-50 p-2 text-xs"
                        >
                          {t('erp.inventory.import.row', 'Row')} {error.row}
                          {error.productId
                            ? ` · ${t('erp.inventory.import.productIdLabel', 'Product ID')}: ${error.productId}`
                            : ''}
                          {error.sku ? ` · ${t('erp.inventory.import.skuLabel', 'SKU')}: ${error.sku}` : ''}
                          {error.variantSku
                            ? ` · ${t('erp.inventory.import.variantSkuLabel', 'Variant SKU')}: ${error.variantSku}`
                            : ''}
                          : {translateInventoryImportError(t, error.errorCode, error.errorParams)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <Button data-tour="components-erp-inventoryimportdialog.button.erp.common.cancel" variant="outline" onClick={handleClose}>
              {t('erp.common.cancel', 'Cancel')}
            </Button>
          )}
          {step === 'mapping' && (
            <>
              <Button data-tour="components-erp-inventoryimportdialog.button.erp.common.back" variant="outline" onClick={() => setStep('upload')}>
                {t('erp.common.back', 'Back')}
              </Button>
              <Button data-tour="components-erp-inventoryimportdialog.button.erp.inventory.import.import" onClick={handleImport} disabled={!canImport || importMutation.isPending}>
                {t('erp.inventory.import.import', 'Import')}
              </Button>
            </>
          )}
          {step === 'result' && importMutation.isPending && (
            <Button data-tour="components-erp-inventoryimportdialog.button.erp.inventory.import.pleaseWait" disabled>{t('erp.inventory.import.pleaseWait', 'Please wait…')}</Button>
          )}
          {step === 'result' && !importMutation.isPending && result && (
            <Button data-tour="components-erp-inventoryimportdialog.button.erp.common.done" onClick={handleClose}>{t('erp.common.done', 'Done')}</Button>
          )}
          {step === 'result' && !importMutation.isPending && !result && (
            <Button data-tour="components-erp-inventoryimportdialog.button.erp.common.cancel" variant="outline" onClick={handleClose}>
              {t('erp.common.cancel', 'Cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
