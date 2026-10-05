import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';

type Step = 'upload' | 'mapping' | 'result';

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; sku?: string; name?: string; error: string }>;
}

type CustomFieldDefinition = {
  id: number;
  name: string;
  fieldKey: string;
  isActive: boolean;
  sortOrder: number;
};

const BASE_PRODUCT_FIELDS: Array<{ value: string; label: string; required?: boolean }> = [
  { value: 'name', label: 'Product Name', required: true },
  { value: 'sku', label: 'SKU' },
  { value: 'description', label: 'Description' },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
  { value: 'unitPrice', label: 'Unit Price' },
  { value: 'costPrice', label: 'Cost Price' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'weight', label: 'Weight' },
  { value: 'unitOfMeasure', label: 'Unit of Measure' },
  { value: 'isTaxable', label: 'Is Taxable' },
  { value: 'categoryName', label: 'Category Name' },
  { value: 'brandName', label: 'Brand Name' },
  { value: 'variantName', label: 'Variant Name' },
  { value: 'variantSku', label: 'Variant SKU' },
  { value: 'variantUnitPrice', label: 'Variant Unit Price' },
  { value: 'variantCostPrice', label: 'Variant Cost Price' },
  { value: 'variantBarcode', label: 'Variant Barcode' },
];

const AUTO_MAP_HINTS: Record<string, string> = {
  name: 'name',
  product: 'name',
  title: 'name',
  item: 'name',
  productname: 'name',
  itemname: 'name',
  sku: 'sku',
  stockkeepingunit: 'sku',
  saleprice: 'unitPrice',
  unitprice: 'unitPrice',
  price: 'unitPrice',
  retailprice: 'unitPrice',
  cost: 'costPrice',
  costprice: 'costPrice',
  category: 'categoryName',
  categoryname: 'categoryName',
  brand: 'brandName',
  brandname: 'brandName',
  type: 'type',
  status: 'status',
  barcode: 'barcode',
  description: 'description',
  weight: 'weight',
  unit: 'unitOfMeasure',
  unitofmeasure: 'unitOfMeasure',
  istaxable: 'isTaxable',
  taxable: 'isTaxable',
  variantname: 'variantName',
  variantsku: 'variantSku',
  variantprice: 'variantUnitPrice',
  variantunitprice: 'variantUnitPrice',
  variantcost: 'variantCostPrice',
  variantcostprice: 'variantCostPrice',
  variantbarcode: 'variantBarcode',
  minstock: 'minStock',
  expirationdate: 'expirationDate',
  expirydate: 'expirationDate',
};

interface ProductImportDialogProps {
  open: boolean;
  onClose: () => void;
}

function autoMap(
  headers: string[],
  definitions: Array<{ name: string; fieldKey: string }>
): Record<string, string> {
  const result: Record<string, string> = {};
  const cfByNormalizedName = new Map(
    definitions.map((d) => [
      `cf:${d.name.toLowerCase().replace(/\s+/g, '')}`,
      `customField:${d.fieldKey}`,
    ])
  );
  for (const header of headers) {
    const normalised = header.toLowerCase().replace(/\s+/g, '');
    result[header] = AUTO_MAP_HINTS[normalised] ?? cfByNormalizedName.get(normalised) ?? '__skip__';
  }
  return result;
}

export default function ProductImportDialog({ open, onClose }: ProductImportDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: customFieldDefinitions = [] } = useQuery({
    queryKey: ['/api/erp/product-custom-fields'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/product-custom-fields');
      const json = await res.json();
      return (json.data ?? []) as CustomFieldDefinition[];
    },
    enabled: open,
  });

  const activeDefinitions = useMemo(
    () =>
      customFieldDefinitions
        .filter((d) => d.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [customFieldDefinitions]
  );

  const productFields = useMemo(
    () => [
      ...BASE_PRODUCT_FIELDS,
      { value: 'minStock', label: 'Min Stock' },
      { value: 'expirationDate', label: 'Expiration Date' },
      ...activeDefinitions.map((d) => ({
        value: `customField:${d.fieldKey}`,
        label: `CF: ${d.name}`,
      })),
      { value: '__skip__', label: '— Do not import —' },
    ],
    [activeDefinitions]
  );

  // Re-map CF columns that were skipped because definitions hadn't loaded yet
  useEffect(() => {
    if (step !== 'mapping' || activeDefinitions.length === 0) return;
    setMapping((prev) => {
      const cfByNormalizedName = new Map(
        activeDefinitions.map((d) => [
          `cf:${d.name.toLowerCase().replace(/\s+/g, '')}`,
          `customField:${d.fieldKey}`,
        ])
      );
      let changed = false;
      const next = { ...prev };
      for (const [header, value] of Object.entries(prev)) {
        if (value !== '__skip__') continue;
        const normalised = header.toLowerCase().replace(/\s+/g, '');
        const mapped = cfByNormalizedName.get(normalised);
        if (mapped) {
          next[header] = mapped;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeDefinitions, step]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');

      const filteredMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, v]) => v !== '__skip__')
      );

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(filteredMapping));

      const response = await apiRequest('POST', '/api/erp/products/import', formData);
      const json = (await response.json()) as { success: boolean; data: ImportResult };
      return json.data;
    },
    onSuccess: (data: ImportResult) => {
      setResult(data);
      setStep('result');
    },
    onError: (err: Error) => {
      setStep('mapping');
      toast({
        title: t('common.error', 'Error'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: t('common.error', 'Error'),
        description: t('erp.products.import.invalidFileType', 'Please upload a CSV file'),
        variant: 'destructive',
      });
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({
        title: t('common.error', 'Error'),
        description: t('erp.products.import.fileTooLarge', 'File size must not exceed 10 MB'),
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
              'erp.products.import.duplicateHeaders',
              'Your CSV contains duplicate column names. Only one column per name can be mapped.'
            ),
            variant: 'destructive',
          });
        }
        setCsvHeaders(headers);
        setPreviewRows(results.data.slice(0, 3));
        setMapping(autoMap(headers, activeDefinitions));
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
      const response = await apiRequest('GET', '/api/erp/products/import/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products_import_template.csv';
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

  const hasNameMapping = Object.values(mapping).includes('name');

  const handleImport = () => {
    if (!hasNameMapping) return;
    setStep('result');
    importMutation.mutate();
  };

  const handleClose = () => {
    if (result) {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/products'] });
    }
    setStep('upload');
    setFile(null);
    setCsvHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setIsDragOver(false);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const dialogTitle =
    step === 'upload'
      ? t('erp.products.import.title', 'Import Products')
      : step === 'mapping'
        ? t('erp.products.import.mapColumns', 'Map Columns')
        : t('erp.products.import.complete', 'Import Complete');

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
                  ? t('erp.products.import.importing', 'Importing products…')
                  : t('erp.products.import.resultDescription', 'Review the import results below.')
                : t(
                    'erp.products.import.uploadDescription',
                    'Upload a CSV file with your product data. You will map each column to the corresponding product field before importing.'
                  )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'upload' && (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {t(
                    'erp.products.import.uploadDescription',
                    'Upload a CSV file with your product data. You will map each column to the corresponding product field before importing.'
                  )}
                </AlertDescription>
              </Alert>

              <div className="text-center">
                <Button data-tour="components-erp-productimportdialog.button.erp.products.import.downloadTemplate" variant="outline" onClick={() => void downloadTemplate()}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('erp.products.import.downloadTemplate', 'Download Template')}
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
                      'erp.products.import.clickToUpload',
                      'Click to upload or drag and drop your file here'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('erp.products.import.supportsCsv', 'Supports CSV files (max 10MB)')}
                  </p>
                </div>
                <input data-tour="components-erp-productimportdialog.input.erp.products.import.clickToUpload"
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
              {!hasNameMapping && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(
                      'erp.products.import.nameRequired',
                      'Product Name is required — please map at least one column to it.'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table data-tour="components-erp-productimportdialog.table.erp.products.import.yourCsvColumn" erpSortable={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('erp.products.import.yourCsvColumn', 'Your CSV Column')}</TableHead>
                      <TableHead>{t('erp.products.import.mapsToField', 'Maps to Product Field')}</TableHead>
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
                              {productFields.map((field) => (
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
                {t('erp.products.import.dataPreview', 'Data Preview (first 3 rows)')}
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
                    {t('erp.products.import.importing', 'Importing products…')}
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
                          {t('erp.products.import.imported', 'Imported')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <Info className="h-5 w-5 text-slate-600" />
                      <div>
                        <p className="font-medium text-slate-800">{result.skipped ?? 0}</p>
                        <p className="text-sm text-slate-600">
                          {t('erp.products.import.skipped', 'Skipped (duplicate SKU)')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">{result.failed ?? 0}</p>
                        <p className="text-sm text-red-600">
                          {t('erp.products.import.failed', 'Failed')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(result.errors ?? []).length > 0 && (
                    <div className="mt-4 max-h-48 space-y-1 overflow-y-auto">
                      <h4 className="text-sm font-medium">
                        {t('erp.products.import.errors', 'Import Errors:')}
                      </h4>
                      {result.errors.map((error, index) => (
                        <div
                          key={index}
                          className="rounded border border-red-200 bg-red-50 p-2 text-xs"
                        >
                          Row {error.row}
                          {error.sku ? ` · SKU: ${error.sku}` : ''}
                          {error.name ? ` · ${error.name}` : ''}: {error.error}
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
            <Button data-tour="components-erp-productimportdialog.button.erp.common.cancel" variant="outline" onClick={handleClose}>
              {t('erp.common.cancel', 'Cancel')}
            </Button>
          )}
          {step === 'mapping' && (
            <>
              <Button data-tour="components-erp-productimportdialog.button.erp.common.back" variant="outline" onClick={() => setStep('upload')}>
                {t('erp.common.back', 'Back')}
              </Button>
              <Button data-tour="components-erp-productimportdialog.button.erp.products.import.import"
                onClick={handleImport}
                disabled={!hasNameMapping || importMutation.isPending}
              >
                {t('erp.products.import.import', 'Import')}
              </Button>
            </>
          )}
          {step === 'result' && importMutation.isPending && (
            <Button data-tour="components-erp-productimportdialog.button.erp.products.import.pleaseWait" disabled>{t('erp.products.import.pleaseWait', 'Please wait…')}</Button>
          )}
          {step === 'result' && !importMutation.isPending && result && (
            <Button data-tour="components-erp-productimportdialog.button.erp.common.done" onClick={handleClose}>{t('erp.common.done', 'Done')}</Button>
          )}
          {step === 'result' && !importMutation.isPending && !result && (
            <Button data-tour="components-erp-productimportdialog.button.erp.common.cancel" variant="outline" onClick={handleClose}>
              {t('erp.common.cancel', 'Cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
