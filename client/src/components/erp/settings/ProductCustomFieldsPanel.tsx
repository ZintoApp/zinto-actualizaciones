import { useAuth } from '@/hooks/use-auth';
import { type ErpCustomFieldEntity } from '@shared/erp-custom-fields';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';

type CustomFieldRow = {
  id: number;
  name: string;
  fieldKey: string;
  fieldType: FieldType;
  options: string[] | null;
  isRequired: boolean;
  defaultValue: string | null;
  sortOrder: number;
  isActive: boolean;
};

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'];

function parseApiError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function deriveFieldKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type FormState = {
  name: string;
  fieldType: FieldType;
  options: string[];
  isRequired: boolean;
  defaultValue: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  fieldType: 'text',
  options: [''],
  isRequired: false,
  defaultValue: '',
  sortOrder: '0',
  isActive: true,
});

export default function ProductCustomFieldsPanel({ canManage, entityType = 'product' }: { canManage: boolean; entityType?: ErpCustomFieldEntity }) {
  const { user, company } = useAuth();
  const companyId = company?.id ?? user?.companyId;
  const endpoint = entityType === 'product' ? '/api/erp/product-custom-fields' : `/api/erp/custom-fields/${entityType}`;
  const queryKey = [endpoint, companyId, entityType];
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldRow | null>(null);

  const fieldTypeLabels: Record<FieldType, string> = {
    text: t('erp.settings.customFields.types.text', 'Text'),
    textarea: t('erp.settings.customFields.types.textarea', 'Long text'),
    number: t('erp.settings.customFields.types.number', 'Number'),
    date: t('erp.settings.customFields.types.date', 'Date'),
    select: t('erp.settings.customFields.types.select', 'Dropdown'),
    checkbox: t('erp.settings.customFields.types.checkbox', 'Checkbox'),
  };

  const { data: fields = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () =>
      (await (await apiRequest('GET', endpoint)).json()).data ?? [],
  });

  const sortedFields = useMemo(() => {
    return [...(fields as CustomFieldRow[])].sort((a, b) => {
      const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [fields]);

  const derivedFieldKey = editingId != null ? '' : deriveFieldKey(form.name);
  const displayedFieldKey =
    editingId != null
      ? (fields as CustomFieldRow[]).find((row) => row.id === editingId)?.fieldKey ?? ''
      : derivedFieldKey;

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const refreshList = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  const buildPayload = () => {
    const name = form.name.trim();
    const defaultValue = form.defaultValue.trim();
    const payload: Record<string, unknown> = {
      name,
      fieldType: form.fieldType,
      isRequired: Boolean(form.isRequired),
      sortOrder: parseInt(form.sortOrder || '0', 10) || 0,
      isActive: Boolean(form.isActive),
      defaultValue: defaultValue || null,
    };

    if (form.fieldType === 'select') {
      payload.options = form.options.map((o) => o.trim()).filter((o) => o.length > 0);
    } else {
      payload.options = [];
    }

    if (editingId == null) {
      const key = deriveFieldKey(name);
      if (key) payload.fieldKey = key;
    }

    return payload;
  };

  const validateBeforeSubmit = (): string | null => {
    if (!form.name.trim()) {
      return t('erp.settings.customFields.validation.nameRequired', 'Name is required');
    }
    if (form.fieldType === 'select') {
      const options = form.options.map((o) => o.trim()).filter((o) => o.length > 0);
      if (options.length === 0) {
        return t(
          'erp.settings.customFields.validation.optionsRequired',
          'Select fields require at least one option',
        );
      }
      if (new Set(options).size !== options.length) {
        return t(
          'erp.settings.customFields.validation.optionsDuplicate',
          'Select options must be unique',
        );
      }
    }
    return null;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', endpoint, buildPayload());
    },
    onSuccess: () => {
      toast({ title: t('erp.common.saved', 'Saved') });
      closeDialog();
      refreshList();
    },
    onError: (error: unknown) => {
      toast({ title: t('ui.common.error', 'Error'), description: parseApiError(error), variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (editingId == null) return;
      await apiRequest('PUT', `${endpoint}/${editingId}`, buildPayload());
    },
    onSuccess: () => {
      toast({ title: t('erp.common.saved', 'Saved') });
      closeDialog();
      refreshList();
    },
    onError: (error: unknown) => {
      toast({ title: t('ui.common.error', 'Error'), description: parseApiError(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `${endpoint}/${id}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.common.deleted', 'Deleted') });
      setDeleteTarget(null);
      refreshList();
    },
    onError: (error: unknown) => {
      toast({ title: t('ui.common.error', 'Error'), description: parseApiError(error), variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row: CustomFieldRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name ?? '',
      fieldType: row.fieldType,
      options: row.fieldType === 'select' && row.options?.length ? [...row.options] : [''],
      isRequired: Boolean(row.isRequired),
      defaultValue: row.defaultValue ?? '',
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive !== false,
    });
    setDialogOpen(true);
  };

  const handleTypeChange = (value: FieldType) => {
    setForm((prev) => ({
      ...prev,
      fieldType: value,
      defaultValue: '',
      options: value === 'select' ? (prev.options.length ? prev.options : ['']) : [''],
    }));
  };

  const handleSave = () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      toast({ title: t('ui.common.error', 'Error'), description: validationError, variant: 'destructive' });
      return;
    }
    if (editingId != null) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const saveDisabled = !canManage || !form.name.trim() || isPending;

  const renderDefaultValueInput = () => {
    const label = (
      <Label>{t('erp.settings.customFields.form.defaultValue', 'Default value')}</Label>
    );

    if (form.fieldType === 'textarea') {
      return (
        <div className="space-y-1">
          {label}
          <Textarea data-tour="components-erp-settings-productcustomfieldspanel.textarea.form.defaultValue"
            rows={3}
            value={form.defaultValue}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultValue: event.target.value }))}
          />
        </div>
      );
    }

    if (form.fieldType === 'number') {
      return (
        <div className="space-y-1">
          {label}
          <Input data-tour="components-erp-settings-productcustomfieldspanel.input.form.defaultValue"
            type="number"
            value={form.defaultValue}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultValue: event.target.value }))}
          />
        </div>
      );
    }

    if (form.fieldType === 'date') {
      return (
        <div className="space-y-1">
          {label}
          <Input data-tour="components-erp-settings-productcustomfieldspanel.input.form.defaultValue"
            type="date"
            value={form.defaultValue}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultValue: event.target.value }))}
          />
        </div>
      );
    }

    if (form.fieldType === 'select') {
      const optionValues = form.options.map((o) => o.trim()).filter((o) => o.length > 0);
      return (
        <div className="space-y-1">
          {label}
          <Select
            value={form.defaultValue || 'none'}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, defaultValue: value === 'none' ? '' : value }))
            }
          >
            <SelectTrigger data-tour="components-erp-settings-productcustomfieldspanel.selecttrigger.erp.common.none">
              <SelectValue placeholder={t('erp.common.none', 'None')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
              {optionValues.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (form.fieldType === 'checkbox') {
      return (
        <div className="space-y-1">
          {label}
          <Select
            value={form.defaultValue || 'none'}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, defaultValue: value === 'none' ? '' : value }))
            }
          >
            <SelectTrigger data-tour="components-erp-settings-productcustomfieldspanel.selecttrigger.erp.common.none">
              <SelectValue placeholder={t('erp.common.none', 'None')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
              <SelectItem value="true">{t('erp.common.yes', 'Yes')}</SelectItem>
              <SelectItem value="false">{t('erp.common.no', 'No')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {label}
        <Input data-tour="components-erp-settings-productcustomfieldspanel.input.form.defaultValue"
          value={form.defaultValue}
          onChange={(event) => setForm((prev) => ({ ...prev, defaultValue: event.target.value }))}
        />
      </div>
    );
  };

  const colSpan = canManage ? 8 : 7;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {t('erp.settings.customFields.title', 'Custom fields')}
            </h3>
            {canManage ? (
              <Button data-tour="components-erp-settings-productcustomfieldspanel.button.erp.common.create" onClick={openCreate}>{t('erp.common.create', 'Create')}</Button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table data-tour="components-erp-settings-productcustomfieldspanel.table.erp.settings.customFields.table.name" className="min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('erp.settings.customFields.table.name', 'Name')}</TableHead>
                    <TableHead>{t('erp.settings.customFields.table.fieldKey', 'Field key')}</TableHead>
                    <TableHead>{t('erp.settings.customFields.table.type', 'Type')}</TableHead>
                    <TableHead>{t('erp.settings.customFields.table.required', 'Required')}</TableHead>
                    <TableHead>
                      {t('erp.settings.customFields.table.defaultValue', 'Default value')}
                    </TableHead>
                    <TableHead>
                      {t('erp.settings.customFields.table.sortOrder', 'Sort order')}
                    </TableHead>
                    <TableHead>{t('erp.common.active', 'Active')}</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                        {t('erp.settings.customFields.empty', 'No custom fields configured yet.')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedFields.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="font-mono text-sm">{row.fieldKey}</TableCell>
                        <TableCell>{fieldTypeLabels[row.fieldType] ?? row.fieldType}</TableCell>
                        <TableCell>
                          {row.isRequired ? t('erp.common.yes', 'Yes') : t('erp.common.no', 'No')}
                        </TableCell>
                        <TableCell>{row.defaultValue?.trim() ? row.defaultValue : '—'}</TableCell>
                        <TableCell>{row.sortOrder ?? 0}</TableCell>
                        <TableCell>
                          {row.isActive !== false
                            ? t('erp.common.yes', 'Yes')
                            : t('erp.common.no', 'No')}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button data-tour="components-erp-settings-productcustomfieldspanel.button.erp.common.edit" size="sm" variant="outline" onClick={() => openEdit(row)}>
                                {t('erp.common.edit', 'Edit')}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent data-tour="components-erp-settings-productcustomfieldspanel.dialogcontent.erp.common.edit" className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t('erp.common.edit', 'Edit')
                : t('erp.common.create', 'Create')}{' '}
              {t('erp.settings.customFields.title', 'Custom fields')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('erp.settings.customFields.form.name', 'Name')}</Label>
              <Input data-tour="components-erp-settings-productcustomfieldspanel.input.erp.settings.customFields.form.name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {t('erp.settings.customFields.form.fieldKey', 'Field key')}:{' '}
                <span className="font-mono">{displayedFieldKey || '—'}</span>
                {editingId == null ? (
                  <>
                    {' '}
                    —{' '}
                    {t(
                      'erp.settings.customFields.form.fieldKeyHint',
                      'Derived from the name and cannot be changed later',
                    )}
                  </>
                ) : null}
              </p>
            </div>

            <div className="space-y-1">
              <Label>{t('erp.settings.customFields.form.type', 'Type')}</Label>
              <Select value={form.fieldType} onValueChange={(value) => handleTypeChange(value as FieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent searchable>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {fieldTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.fieldType === 'select' ? (
              <div className="space-y-2">
                <Label>{t('erp.settings.customFields.form.options', 'Options')}</Label>
                {form.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input data-tour="components-erp-settings-productcustomfieldspanel.input.option"
                      value={option}
                      onChange={(event) =>
                        setForm((prev) => {
                          const next = [...prev.options];
                          const previousTrimmed = prev.options[index]?.trim() ?? '';
                          const nextValue = event.target.value;
                          next[index] = nextValue;
                          const nextTrimmed = nextValue.trim();
                          let defaultValue = prev.defaultValue;
                          if (prev.defaultValue && prev.defaultValue === previousTrimmed) {
                            defaultValue = nextTrimmed;
                          }
                          return { ...prev, options: next, defaultValue };
                        })
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={form.options.length <= 1}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          options: prev.options.filter((_, i) => i !== index),
                          defaultValue:
                            prev.defaultValue === option.trim() ? '' : prev.defaultValue,
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button data-tour="components-erp-settings-productcustomfieldspanel.button.erp.settings.customFields.form.addOption"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((prev) => ({ ...prev, options: [...prev.options, ''] }))}
                >
                  {t('erp.settings.customFields.form.addOption', 'Add option')}
                </Button>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(form.isRequired)}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isRequired: checked }))}
              />
              <Label>{t('erp.settings.customFields.form.required', 'Required')}</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(form.isActive)}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
              />
              <Label>{t('erp.common.active', 'Active')}</Label>
            </div>

            <div className="space-y-1">
              <Label>{t('erp.common.sortOrder', 'Sort order')}</Label>
              <Input data-tour="components-erp-settings-productcustomfieldspanel.input.erp.settings.customFields.form.name"
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </div>

            {renderDefaultValueInput()}
          </div>
          <DialogFooter>
            <Button data-tour="components-erp-settings-productcustomfieldspanel.button.erp.common.cancel" variant="outline" onClick={closeDialog}>
              {t('erp.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-erp-settings-productcustomfieldspanel.button.erp.common.save" disabled={saveDisabled} onClick={handleSave}>
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('erp.settings.customFields.delete.title', 'Delete custom field?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'erp.settings.customFields.delete.description',
                'Products keep any stored values for this field, but they will no longer be displayed.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('erp.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {t('erp.settings.customFields.delete.confirm', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
