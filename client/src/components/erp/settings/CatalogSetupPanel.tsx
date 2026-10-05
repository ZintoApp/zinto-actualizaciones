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
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CategoryRow = {
  id: number;
  name: string;
  description?: string | null;
  parentCategoryId?: number | null;
  slug?: string | null;
  sortOrder?: number | null;
  isMenuCategory?: boolean | null;
  menuSortOrder?: number | null;
  isActive?: boolean | null;
};
type BrandRow = {
  id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
};
type TagRow = { id: number; name: string; color?: string | null; sortOrder?: number | null; isActive?: boolean | null };
type UnitRow = { id: number; name: string; code?: string | null; symbol?: string | null; sortOrder?: number | null; isActive?: boolean | null };

type Endpoint = '/api/erp/products/categories' | '/api/erp/products/brands' | '/api/erp/products/tags' | '/api/erp/products/units';

function parseApiError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function CatalogSetupPanel({ canManage, isRestaurant }: { canManage: boolean; isRestaurant: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeEntity, setActiveEntity] = useState<Endpoint | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const { data: categories = [] } = useQuery({
    queryKey: ['/api/erp/products/categories'],
    queryFn: async () => (await (await apiRequest('GET', '/api/erp/products/categories')).json()).data ?? [],
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['/api/erp/products/brands'],
    queryFn: async () => (await (await apiRequest('GET', '/api/erp/products/brands')).json()).data ?? [],
  });
  const { data: tags = [] } = useQuery({
    queryKey: ['/api/erp/products/tags'],
    queryFn: async () => (await (await apiRequest('GET', '/api/erp/products/tags')).json()).data ?? [],
  });
  const { data: units = [] } = useQuery({
    queryKey: ['/api/erp/products/units'],
    queryFn: async () => (await (await apiRequest('GET', '/api/erp/products/units')).json()).data ?? [],
  });

  const closeDialog = () => {
    setActiveEntity(null);
    setEditingId(null);
    setForm({});
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/products/categories'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/products/brands'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/products/tags'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/products/units'] });
  };

  const toIntOrNull = (value: string | boolean | undefined) => {
    const n = parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : null;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntity) return;
      let payload: Record<string, unknown> = {};
      if (activeEntity === '/api/erp/products/categories') {
        payload = {
          name: String(form.name ?? '').trim(),
          description: String(form.description ?? '').trim() || undefined,
          parentCategoryId: toIntOrNull(form.parentCategoryId),
          slug: String(form.slug ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
          ...(isRestaurant
            ? {
                isMenuCategory: Boolean(form.isMenuCategory ?? false),
                menuSortOrder: parseInt(String(form.menuSortOrder ?? '0'), 10) || 0,
              }
            : {}),
        };
      } else if (activeEntity === '/api/erp/products/brands') {
        payload = {
          name: String(form.name ?? '').trim(),
          slug: String(form.slug ?? '').trim() || undefined,
          description: String(form.description ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
        };
      } else if (activeEntity === '/api/erp/products/tags') {
        payload = {
          name: String(form.name ?? '').trim(),
          color: String(form.color ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
        };
      } else if (activeEntity === '/api/erp/products/units') {
        payload = {
          code: String(form.code ?? '').trim() || undefined,
          name: String(form.name ?? '').trim(),
          symbol: String(form.symbol ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
        };
      }
      await apiRequest('POST', activeEntity, payload);
    },
    onSuccess: () => {
      toast({ title: t('erp.common.saved', 'Saved') });
      closeDialog();
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: t('ui.common.error', 'Error'), description: parseApiError(error), variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntity || editingId == null) return;
      let payload: Record<string, unknown> = {};
      if (activeEntity === '/api/erp/products/categories') {
        payload = {
          name: String(form.name ?? '').trim(),
          description: String(form.description ?? '').trim() || undefined,
          parentCategoryId: toIntOrNull(form.parentCategoryId),
          slug: String(form.slug ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
          ...(isRestaurant
            ? {
                isMenuCategory: Boolean(form.isMenuCategory ?? false),
                menuSortOrder: parseInt(String(form.menuSortOrder ?? '0'), 10) || 0,
              }
            : {}),
        };
      } else if (activeEntity === '/api/erp/products/brands') {
        payload = {
          name: String(form.name ?? '').trim(),
          slug: String(form.slug ?? '').trim() || undefined,
          description: String(form.description ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
        };
      } else if (activeEntity === '/api/erp/products/tags') {
        payload = {
          name: String(form.name ?? '').trim(),
          color: String(form.color ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
        };
      } else if (activeEntity === '/api/erp/products/units') {
        payload = {
          code: String(form.code ?? '').trim() || undefined,
          name: String(form.name ?? '').trim(),
          symbol: String(form.symbol ?? '').trim() || undefined,
          sortOrder: parseInt(String(form.sortOrder ?? '0'), 10) || 0,
          isActive: Boolean(form.isActive ?? true),
        };
      }
      await apiRequest('PUT', `${activeEntity}/${editingId}`, payload);
    },
    onSuccess: () => {
      toast({ title: t('erp.common.saved', 'Saved') });
      closeDialog();
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: t('ui.common.error', 'Error'), description: parseApiError(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (params: { endpoint: Endpoint; id: number }) => {
      await apiRequest('DELETE', `${params.endpoint}/${params.id}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.common.deleted', 'Deleted') });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: t('ui.common.error', 'Error'), description: parseApiError(error), variant: 'destructive' });
    },
  });

  const openCreate = (endpoint: Endpoint) => {
    setEditingId(null);
    setActiveEntity(endpoint);
    setForm({ isActive: true, sortOrder: '0', menuSortOrder: '0' });
  };

  const openEdit = (endpoint: Endpoint, row: CategoryRow | BrandRow | TagRow | UnitRow) => {
    setActiveEntity(endpoint);
    setEditingId(row.id);
    setForm({
      name: row.name ?? '',
      slug: (row as CategoryRow | BrandRow).slug ?? '',
      description: (row as CategoryRow | BrandRow).description ?? '',
      parentCategoryId: String((row as CategoryRow).parentCategoryId ?? ''),
      sortOrder: String(row.sortOrder ?? 0),
      isMenuCategory: Boolean((row as CategoryRow).isMenuCategory ?? false),
      menuSortOrder: String((row as CategoryRow).menuSortOrder ?? 0),
      code: (row as UnitRow).code ?? '',
      symbol: (row as UnitRow).symbol ?? '',
      color: (row as TagRow).color ?? '',
      isActive: row.isActive !== false,
    });
  };

  const currentTitle = useMemo(() => {
    if (activeEntity === '/api/erp/products/categories') return t('erp.settings.catalog.categories.title', 'Categories');
    if (activeEntity === '/api/erp/products/brands') return t('erp.settings.catalog.brands.title', 'Brands');
    if (activeEntity === '/api/erp/products/tags') return t('erp.settings.catalog.tags.title', 'Tags');
    if (activeEntity === '/api/erp/products/units') return t('erp.settings.catalog.units.title', 'Units');
    return '';
  }, [activeEntity, t]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t('erp.settings.catalog.categories.title', 'Categories')}</h3>
            {canManage ? <Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.create" onClick={() => openCreate('/api/erp/products/categories')}>{t('erp.common.create', 'Create')}</Button> : null}
          </div>
          <div className="w-full overflow-x-auto">
            <Table data-tour="components-erp-settings-catalogsetuppanel.table.erp.common.name" className="min-w-[640px]">
              <TableHeader><TableRow><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.common.slug', 'Slug')}</TableHead><TableHead>{t('erp.common.active', 'Active')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {(categories as CategoryRow[]).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell><TableCell>{row.slug ?? '—'}</TableCell><TableCell>{row.isActive !== false ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{canManage ? <div className="flex gap-1"><Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.edit" size="sm" variant="outline" onClick={() => openEdit('/api/erp/products/categories', row)}>{t('erp.common.edit', 'Edit')}</Button><Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate({ endpoint: '/api/erp/products/categories', id: row.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t('erp.settings.catalog.brands.title', 'Brands')}</h3>
            {canManage ? <Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.create" onClick={() => openCreate('/api/erp/products/brands')}>{t('erp.common.create', 'Create')}</Button> : null}
          </div>
          <div className="w-full overflow-x-auto">
            <Table data-tour="components-erp-settings-catalogsetuppanel.table.erp.common.name" className="min-w-[560px]"><TableHeader><TableRow><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.common.slug', 'Slug')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader><TableBody>{(brands as BrandRow[]).map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.slug ?? '—'}</TableCell><TableCell>{canManage ? <div className="flex gap-1"><Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.edit" size="sm" variant="outline" onClick={() => openEdit('/api/erp/products/brands', row)}>{t('erp.common.edit', 'Edit')}</Button><Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate({ endpoint: '/api/erp/products/brands', id: row.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null}</TableCell></TableRow>)}</TableBody></Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t('erp.settings.catalog.tags.title', 'Tags')}</h3>
            {canManage ? <Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.create" onClick={() => openCreate('/api/erp/products/tags')}>{t('erp.common.create', 'Create')}</Button> : null}
          </div>
          <div className="w-full overflow-x-auto">
            <Table data-tour="components-erp-settings-catalogsetuppanel.table.erp.common.name" className="min-w-[560px]"><TableHeader><TableRow><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.common.color', 'Color')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader><TableBody>{(tags as TagRow[]).map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.color ?? '—'}</TableCell><TableCell>{canManage ? <div className="flex gap-1"><Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.edit" size="sm" variant="outline" onClick={() => openEdit('/api/erp/products/tags', row)}>{t('erp.common.edit', 'Edit')}</Button><Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate({ endpoint: '/api/erp/products/tags', id: row.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null}</TableCell></TableRow>)}</TableBody></Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t('erp.settings.catalog.units.title', 'Units')}</h3>
            {canManage ? <Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.create" onClick={() => openCreate('/api/erp/products/units')}>{t('erp.common.create', 'Create')}</Button> : null}
          </div>
          <div className="w-full overflow-x-auto">
            <Table data-tour="components-erp-settings-catalogsetuppanel.table.erp.common.name" className="min-w-[640px]"><TableHeader><TableRow><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.common.code', 'Code')}</TableHead><TableHead>{t('erp.common.symbol', 'Symbol')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader><TableBody>{(units as UnitRow[]).map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.code ?? '—'}</TableCell><TableCell>{row.symbol ?? '—'}</TableCell><TableCell>{canManage ? <div className="flex gap-1"><Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.edit" size="sm" variant="outline" onClick={() => openEdit('/api/erp/products/units', row)}>{t('erp.common.edit', 'Edit')}</Button><Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate({ endpoint: '/api/erp/products/units', id: row.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null}</TableCell></TableRow>)}</TableBody></Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!activeEntity} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent data-tour="components-erp-settings-catalogsetuppanel.dialogcontent.erp.common.edit" className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingId ? t('erp.common.edit', 'Edit') : t('erp.common.create', 'Create')} {currentTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('erp.common.name', 'Name')}</Label>
              <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.name" value={String(form.name ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            {(activeEntity === '/api/erp/products/categories' || activeEntity === '/api/erp/products/brands') ? (
              <>
                <div className="space-y-1">
                  <Label>{t('erp.common.slug', 'Slug')}</Label>
                  <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.slug" value={String(form.slug ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t('erp.common.description', 'Description')}</Label>
                  <Textarea data-tour="components-erp-settings-catalogsetuppanel.textarea.erp.common.slug" rows={3} value={String(form.description ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
                </div>
              </>
            ) : null}
            {activeEntity === '/api/erp/products/categories' ? (
              <>
                <div className="space-y-1">
                  <Label>{t('erp.products.category.parent', 'Parent category')}</Label>
                  <Select value={String(form.parentCategoryId ?? 'none')} onValueChange={(value) => setForm((prev) => ({ ...prev, parentCategoryId: value === 'none' ? '' : value }))}>
                    <SelectTrigger data-tour="components-erp-settings-catalogsetuppanel.selecttrigger.erp.common.none"><SelectValue placeholder={t('erp.common.none', 'None')} /></SelectTrigger>
                    <SelectContent searchable>
                      <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                      {(categories as CategoryRow[]).filter((row) => row.id !== editingId).map((row) => <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isRestaurant ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch checked={Boolean(form.isMenuCategory)} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isMenuCategory: checked }))} />
                      <Label>{t('erp.products.category.isMenuCategory', 'Menu category')}</Label>
                    </div>
                    <div className="space-y-1">
                      <Label>{t('erp.products.category.menuSortOrder', 'Menu sort order')}</Label>
                      <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.products.category.isMenuCategory" type="number" value={String(form.menuSortOrder ?? '0')} onChange={(event) => setForm((prev) => ({ ...prev, menuSortOrder: event.target.value }))} />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            {activeEntity === '/api/erp/products/tags' ? (
              <div className="space-y-1">
                <Label>{t('erp.common.color', 'Color')}</Label>
                <div className="flex items-center gap-2">
                  <input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.color"
                    type="color"
                    className="h-10 w-12 cursor-pointer rounded border bg-background p-1"
                    value={String(form.color ?? '#22c55e')}
                    onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                    aria-label={t('erp.common.color', 'Color')}
                  />
                  <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.color"
                    value={String(form.color ?? '#22c55e')}
                    onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                    placeholder="#22c55e"
                  />
                </div>
              </div>
            ) : null}
            {activeEntity === '/api/erp/products/units' ? (
              <>
                <div className="space-y-1">
                  <Label>{t('erp.common.code', 'Code')}</Label>
                  <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.code" value={String(form.code ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t('erp.common.symbol', 'Symbol')}</Label>
                  <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.code" value={String(form.symbol ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value }))} />
                </div>
              </>
            ) : null}
            <div className="space-y-1">
              <Label>{t('erp.common.sortOrder', 'Sort order')}</Label>
              <Input data-tour="components-erp-settings-catalogsetuppanel.input.erp.common.name" type="number" value={String(form.sortOrder ?? '0')} onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={Boolean(form.isActive ?? true)} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))} />
              <Label>{t('erp.common.active', 'Active')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.cancel" variant="outline" onClick={closeDialog}>{t('erp.common.cancel', 'Cancel')}</Button>
            <Button data-tour="components-erp-settings-catalogsetuppanel.button.erp.common.save" disabled={!canManage || createMutation.isPending || updateMutation.isPending} onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}>
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
