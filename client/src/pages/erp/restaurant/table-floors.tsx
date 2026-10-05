import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Trash2,
  Layers as TabIconLayers,
  LayoutGrid as TabIconLayoutGrid,
  Table as TabIconTable,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

type SectionRow = { id: number; code: string; name: string; floorLevel?: number | null; isActive: boolean | null; sortOrder: number | null; description?: string | null; displayColor?: string | null };
type TableRow = { id: number; sectionId: number | null; code: string; label: string; capacity: number; isActive: boolean | null; isReservable?: boolean | null; posX?: number | null; posY?: number | null; layoutWidth?: number | null; layoutHeight?: number | null; rotation?: number | null; tableShape?: string | null; tableType?: string | null; metadata?: Record<string, unknown> | null; sortOrder: number | null };
type TableAvailabilityRow = { table: TableRow; section: SectionRow | null; isAvailable: boolean; activeContext: { status: string; salesOrderId: number } | null };
type LayoutDraft = { posX: number; posY: number; layoutWidth: number; layoutHeight: number; rotation: number; tableShape: 'rectangle' | 'square' | 'circle'; tableType: string; backgroundColor: string; isUnsaved: boolean };

const emptySection = { code: '', name: '', description: '', floorLevel: '0', displayColor: '#0ea5e9', sortOrder: '0', isActive: true };
const emptyTable = { sectionId: 'none', code: '', label: '', capacity: '2', sortOrder: '0', isActive: true, isReservable: true, posX: '24', posY: '24', layoutWidth: '100', layoutHeight: '64', rotation: '0', tableShape: 'rectangle', tableType: 'dining' };
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 560;
const MIN_SIZE = 56;

function safeShape(shape?: string | null): 'rectangle' | 'square' | 'circle' {
  return shape === 'circle' || shape === 'square' || shape === 'rectangle' ? shape : 'rectangle';
}

export default function RestaurantTableFloorsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isRestaurant, isLoading } = useErpBusinessType();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const canManage = hasPermission(PERMISSIONS.MANAGE_ERP_SETTINGS);
  const [activeTab, setActiveTab] = useState<'floors' | 'tables' | 'designer'>('floors');
  const [selectedDesignerTableId, setSelectedDesignerTableId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [designerSectionId, setDesignerSectionId] = useState<string>('none');
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sectionForm, setSectionForm] = useState(emptySection);
  const [tableForm, setTableForm] = useState(emptyTable);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [bulkForm, setBulkForm] = useState({ sectionId: 'none', prefix: 'T', startNumber: '1', count: '8', capacity: '4' });
  const [layoutDrafts, setLayoutDrafts] = useState<Record<number, LayoutDraft>>({});
  const [dragState, setDragState] = useState<null | { tableId: number; mode: 'move' | 'resize'; x: number; y: number; sx: number; sy: number; sw: number; sh: number }>(null);

  useEffect(() => { if (!isLoading && !isRestaurant) setLocation('/erp/dashboard'); }, [isLoading, isRestaurant, setLocation]);

  const sectionsQuery = useQuery<SectionRow[]>({ queryKey: ['/api/erp/restaurant/layout/sections'], queryFn: async () => (await (await apiRequest('GET', '/api/erp/restaurant/layout/sections')).json()).data ?? [], enabled: isRestaurant });
  const tablesQuery = useQuery<TableRow[]>({ queryKey: ['/api/erp/restaurant/layout/tables'], queryFn: async () => (await (await apiRequest('GET', '/api/erp/restaurant/layout/tables')).json()).data ?? [], enabled: isRestaurant });
  const availabilityQuery = useQuery<TableAvailabilityRow[]>({ queryKey: ['/api/erp/restaurant/layout/tables/availability'], queryFn: async () => (await (await apiRequest('GET', '/api/erp/restaurant/layout/tables/availability')).json()).data ?? [], enabled: isRestaurant });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/layout/sections'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/layout/tables'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/layout/tables/availability'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/orders'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/orders', 'floor-active'] });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] ?? '');
    const editTable = params.get('editTable');
    const tab = params.get('tab');
    if (editTable) setActiveTab('designer');
    else if (tab === 'tables' || tab === 'designer' || tab === 'floors') setActiveTab(tab);
    if (editTable) {
      const id = Number(editTable);
      if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
        const nextParams = new URLSearchParams(params);
        nextParams.delete('editTable');
        setLocation(`/erp/restaurant/table-floors${nextParams.toString() ? `?${nextParams.toString()}` : ''}`);
        setSelectedDesignerTableId(null);
        return;
      }
      setSelectedDesignerTableId(id);
    }
  }, [location]);

  useEffect(() => {
    const rows = tablesQuery.data ?? [];
    if (!rows.length) return;
    setLayoutDrafts((prev) => {
      const next = { ...prev };
      rows.forEach((table, index) => {
        if (next[table.id]) return;
        next[table.id] = {
          posX: table.posX ?? 24 + (index % 8) * 128,
          posY: table.posY ?? 24 + Math.floor(index / 8) * 88,
          layoutWidth: table.layoutWidth ?? 100,
          layoutHeight: table.layoutHeight ?? 64,
          rotation: table.rotation ?? 0,
          tableShape: safeShape(table.tableShape),
          tableType: table.tableType ?? 'dining',
          backgroundColor: typeof table.metadata?.backgroundColor === 'string' ? table.metadata.backgroundColor : '#111827',
          isUnsaved: table.posX == null || table.posY == null,
        };
      });
      return next;
    });
  }, [tablesQuery.data]);

  useEffect(() => {
    if (selectedDesignerTableId == null || !isRestaurant || !tablesQuery.isFetched) return;
    const selectedTable = (tablesQuery.data ?? []).find((row) => row.id === selectedDesignerTableId);
    if (selectedTable) {
      setDesignerSectionId(selectedTable.sectionId == null ? 'none' : String(selectedTable.sectionId));
      return;
    }
    if (tablesQuery.data != null) {
      toast({ title: t('erp.restaurant.tableFloors.invalidTableSelected', 'Invalid table selected'), variant: 'destructive' });
      const params = new URLSearchParams(location.split('?')[1] ?? '');
      params.delete('editTable');
      setLocation(`/erp/restaurant/table-floors${params.toString() ? `?${params.toString()}` : ''}`);
      setSelectedDesignerTableId(null);
    }
  }, [isRestaurant, location, selectedDesignerTableId, setLocation, t, tablesQuery.data, tablesQuery.isFetched, toast]);

  const filteredTables = useMemo(() => {
    const rows = tablesQuery.data ?? [];
    if (selectedSectionId === 'all') return rows;
    if (selectedSectionId === 'none') return rows.filter((row) => row.sectionId == null);
    return rows.filter((row) => row.sectionId === Number(selectedSectionId));
  }, [tablesQuery.data, selectedSectionId]);
  const designerFilteredTables = useMemo(() => {
    const rows = tablesQuery.data ?? [];
    if (designerSectionId === 'none') return rows.filter((row) => row.sectionId == null);
    return rows.filter((row) => row.sectionId === Number(designerSectionId));
  }, [designerSectionId, tablesQuery.data]);
  const selectedDesignerTable = useMemo(() => (tablesQuery.data ?? []).find((row) => row.id === selectedDesignerTableId) ?? null, [tablesQuery.data, selectedDesignerTableId]);

  const upsertSectionMutation = useMutation({ mutationFn: async () => {
    const payload = { code: sectionForm.code.trim(), name: sectionForm.name.trim(), description: sectionForm.description.trim() || null, floorLevel: Number(sectionForm.floorLevel) || 0, displayColor: sectionForm.displayColor || null, sortOrder: Number(sectionForm.sortOrder) || 0, isActive: sectionForm.isActive };
    return editingSectionId ? apiRequest('PUT', `/api/erp/restaurant/layout/sections/${editingSectionId}`, payload) : apiRequest('POST', '/api/erp/restaurant/layout/sections', payload);
  }, onSuccess: () => { toast({ title: t('erp.common.saved', 'Saved') }); setSectionDialogOpen(false); setEditingSectionId(null); setSectionForm(emptySection); invalidateAll(); }, onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }) });
  const upsertTableMutation = useMutation({ mutationFn: async () => {
    const payload = { sectionId: tableForm.sectionId === 'none' ? null : Number(tableForm.sectionId), code: tableForm.code.trim(), label: tableForm.label.trim(), capacity: Number(tableForm.capacity) || 1, sortOrder: Number(tableForm.sortOrder) || 0, isActive: tableForm.isActive, isReservable: tableForm.isReservable, posX: Number(tableForm.posX) || 0, posY: Number(tableForm.posY) || 0, layoutWidth: Number(tableForm.layoutWidth) || 96, layoutHeight: Number(tableForm.layoutHeight) || 64, rotation: Number(tableForm.rotation) || 0, tableShape: tableForm.tableShape, tableType: tableForm.tableType };
    return editingTableId ? apiRequest('PUT', `/api/erp/restaurant/layout/tables/${editingTableId}`, payload) : apiRequest('POST', '/api/erp/restaurant/layout/tables', payload);
  }, onSuccess: () => { toast({ title: t('erp.common.saved', 'Saved') }); setTableDialogOpen(false); setEditingTableId(null); setTableForm(emptyTable); invalidateAll(); }, onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }) });
  const deleteSectionMutation = useMutation({ mutationFn: async (id: number) => apiRequest('DELETE', `/api/erp/restaurant/layout/sections/${id}`), onSuccess: () => { toast({ title: t('erp.common.deleted', 'Deleted') }); invalidateAll(); }, onError: () => toast({ title: t('erp.restaurant.tableFloors.safeDeleteFailed', 'Cannot delete'), description: t('erp.restaurant.tableFloors.deactivateInstead', 'This floor has history. Deactivate it instead.'), variant: 'destructive' }) });
  const deleteTableMutation = useMutation({ mutationFn: async (id: number) => apiRequest('DELETE', `/api/erp/restaurant/layout/tables/${id}`), onSuccess: () => { toast({ title: t('erp.common.deleted', 'Deleted') }); invalidateAll(); }, onError: () => toast({ title: t('erp.restaurant.tableFloors.safeDeleteFailed', 'Cannot delete'), description: t('erp.restaurant.tableFloors.deactivateTableInstead', 'This table has history. Deactivate it instead.'), variant: 'destructive' }) });
  const bulkCreateMutation = useMutation({ mutationFn: async () => apiRequest('POST', '/api/erp/restaurant/layout/tables/bulk', { sectionId: bulkForm.sectionId === 'none' ? null : Number(bulkForm.sectionId), prefix: bulkForm.prefix.trim(), startNumber: Number(bulkForm.startNumber) || 1, count: Number(bulkForm.count) || 1, capacity: Number(bulkForm.capacity) || 1 }), onSuccess: () => { toast({ title: t('erp.restaurant.tableFloors.bulkCreated', 'Tables created') }); setBulkOpen(false); invalidateAll(); }, onError: (error: unknown) => toast({ title: t('ui.common.error', 'Error'), description: (error as { message?: string })?.message ?? t('erp.restaurant.tableFloors.bulkCreateFailed', 'Bulk create failed. No tables were created.'), variant: 'destructive' }) });
  const resetQrMutation = useMutation({ mutationFn: async (table: TableRow) => apiRequest('PUT', `/api/erp/restaurant/layout/tables/${table.id}/qr-token`, { token: `${table.code.toLowerCase()}-${Date.now().toString(36)}`, isActive: true }), onSuccess: () => toast({ title: t('erp.restaurant.tableFloors.qrRegenerated', 'QR token regenerated') }), onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }) });
  const saveLayoutMutation = useMutation({ mutationFn: async ({ tableId, draft, table }: { tableId: number; draft: LayoutDraft; table: TableRow }) => apiRequest('PUT', `/api/erp/restaurant/layout/tables/${tableId}`, { posX: draft.posX, posY: draft.posY, layoutWidth: draft.layoutWidth, layoutHeight: draft.layoutHeight, rotation: draft.rotation, tableShape: draft.tableShape, tableType: draft.tableType, metadata: { ...(table.metadata ?? {}), backgroundColor: draft.backgroundColor } }), onSuccess: () => { toast({ title: t('erp.restaurant.tableFloors.layoutSaved', 'Layout saved') }); invalidateAll(); }, onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }) });

  const setDraft = (id: number, patch: Partial<LayoutDraft>) => setLayoutDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, isUnsaved: true } }));
  const handlePointerMove = (event: { clientX: number; clientY: number }) => {
    if (!dragState || !canManage) return;
    const draft = layoutDrafts[dragState.tableId];
    if (!draft) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    if (dragState.mode === 'move') {
      setDraft(dragState.tableId, { posX: Math.max(0, Math.min(CANVAS_WIDTH - draft.layoutWidth, Math.round(dragState.sx + dx))), posY: Math.max(0, Math.min(CANVAS_HEIGHT - draft.layoutHeight, Math.round(dragState.sy + dy))) });
    } else {
      const nextWidth = Math.max(MIN_SIZE, Math.min(320, Math.round(dragState.sw + dx)));
      const nextHeight = Math.max(MIN_SIZE, Math.min(240, Math.round(dragState.sh + dy)));
      setDraft(dragState.tableId, { layoutWidth: Math.min(nextWidth, CANVAS_WIDTH - draft.posX), layoutHeight: Math.min(nextHeight, CANVAS_HEIGHT - draft.posY) });
    }
  };
  const saveSelected = async () => { if (!selectedDesignerTable) return; const draft = layoutDrafts[selectedDesignerTable.id]; if (!draft?.isUnsaved) return; await saveLayoutMutation.mutateAsync({ tableId: selectedDesignerTable.id, draft, table: selectedDesignerTable }); setLayoutDrafts((prev) => ({ ...prev, [selectedDesignerTable.id]: { ...prev[selectedDesignerTable.id], isUnsaved: false } })); };
  const saveAll = async () => { for (const table of designerFilteredTables) { const draft = layoutDrafts[table.id]; if (!draft?.isUnsaved) continue; await saveLayoutMutation.mutateAsync({ tableId: table.id, draft, table }); setLayoutDrafts((prev) => ({ ...prev, [table.id]: { ...prev[table.id], isUnsaved: false } })); } };
  const resetSelected = () => { if (!selectedDesignerTable) return; setLayoutDrafts((prev) => ({ ...prev, [selectedDesignerTable.id]: { posX: selectedDesignerTable.posX ?? prev[selectedDesignerTable.id].posX, posY: selectedDesignerTable.posY ?? prev[selectedDesignerTable.id].posY, layoutWidth: selectedDesignerTable.layoutWidth ?? 100, layoutHeight: selectedDesignerTable.layoutHeight ?? 64, rotation: selectedDesignerTable.rotation ?? 0, tableShape: safeShape(selectedDesignerTable.tableShape), tableType: selectedDesignerTable.tableType ?? 'dining', backgroundColor: typeof selectedDesignerTable.metadata?.backgroundColor === 'string' ? selectedDesignerTable.metadata.backgroundColor : '#111827', isUnsaved: false } })); };
  const resetAll = () => setLayoutDrafts((prev) => Object.fromEntries((tablesQuery.data ?? []).map((table, index) => [table.id, { posX: table.posX ?? 24 + (index % 8) * 128, posY: table.posY ?? 24 + Math.floor(index / 8) * 88, layoutWidth: table.layoutWidth ?? 100, layoutHeight: table.layoutHeight ?? 64, rotation: table.rotation ?? 0, tableShape: safeShape(table.tableShape), tableType: table.tableType ?? 'dining', backgroundColor: typeof table.metadata?.backgroundColor === 'string' ? table.metadata.backgroundColor : '#111827', isUnsaved: false }])) as typeof prev);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 data-tour="pages-erp-restaurant-table-floors.h1.erp.restaurant.tableFloors.title" className="text-2xl">{t('erp.restaurant.tableFloors.title', 'Table/Floors')}</h1>
            <p className="text-sm text-muted-foreground">{t('erp.restaurant.tableFloors.subtitle', 'Manage floors, table metadata, layout positions, and QR tokens.')}</p>
            <p className="text-xs text-muted-foreground">
              {t('erp.restaurant.tableFloors.floorDeactivationNotice', 'Deactivating a floor removes its tables from service in POS and floor operations.')}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'floors' | 'tables' | 'designer')} className="space-y-4">
          <TabsList>
            <TabsTrigger icon={TabIconLayers} data-tour="pages-erp-restaurant-table-floors.tabstrigger.floors" value="floors">{t('erp.restaurant.tableFloors.tabFloors', 'Floors')}</TabsTrigger>
            <TabsTrigger icon={TabIconTable} data-tour="pages-erp-restaurant-table-floors.tabstrigger.tables" value="tables">{t('erp.restaurant.tableFloors.tabTables', 'Tables')}</TabsTrigger>
            <TabsTrigger icon={TabIconLayoutGrid} data-tour="pages-erp-restaurant-table-floors.tabstrigger.designer" value="designer">{t('erp.restaurant.tableFloors.tabDesigner', 'Layout Designer')}</TabsTrigger>
          </TabsList>

          <TabsContent data-tour="pages-erp-restaurant-table-floors.tabscontent.floors" value="floors">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t('erp.restaurant.tableFloors.floors', 'Floors')}</CardTitle>
                {canManage ? <Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.create" onClick={() => { setEditingSectionId(null); setSectionForm(emptySection); setSectionDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t('erp.common.create', 'Create')}</Button> : null}
              </CardHeader>
              <CardContent>
                <Table data-tour="pages-erp-restaurant-table-floors.table.erp.common.name">
                  <TableHeader><TableRow><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.common.code', 'Code')}</TableHead><TableHead>{t('erp.restaurant.tableFloors.floorLevel', 'Level')}</TableHead><TableHead>{t('erp.common.active', 'Active')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(sectionsQuery.data ?? []).map((section) => (
                      <TableRow key={section.id}>
                        <TableCell>{section.name}</TableCell>
                        <TableCell>{section.code}</TableCell>
                        <TableCell>{section.floorLevel ?? 0}</TableCell>
                        <TableCell>{section.isActive !== false ? t('erp.common.yes', 'Yes') : t('erp.common.no', 'No')}</TableCell>
                        <TableCell className="space-x-1">
                          {canManage ? <Button size="icon" variant="ghost" onClick={() => { setEditingSectionId(section.id); setSectionForm({ code: section.code, name: section.name, description: section.description ?? '', floorLevel: String(section.floorLevel ?? 0), displayColor: section.displayColor ?? '#0ea5e9', sortOrder: String(section.sortOrder ?? 0), isActive: section.isActive !== false }); setSectionDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button> : null}
                          {canManage ? <Button size="icon" variant="ghost" onClick={() => deleteSectionMutation.mutate(section.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent data-tour="pages-erp-restaurant-table-floors.tabscontent.tables" value="tables" className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t('erp.restaurant.tableFloors.tables', 'Tables')}</CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('erp.restaurant.tableFloors.allFloors', 'All floors')}</SelectItem>
                      <SelectItem value="none">{t('erp.restaurant.tableFloors.unassignedFloor', 'Unassigned')}</SelectItem>
                      {(sectionsQuery.data ?? []).map((section) => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {canManage ? <Button data-tour="pages-erp-restaurant-table-floors.button.erp.restaurant.tableFloors.bulkCreate" variant="outline" onClick={() => setBulkOpen(true)}>{t('erp.restaurant.tableFloors.bulkCreate', 'Bulk Create')}</Button> : null}
                  {canManage ? <Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.create" onClick={() => { setEditingTableId(null); setTableForm(emptyTable); setTableDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t('erp.common.create', 'Create')}</Button> : null}
                </div>
              </CardHeader>
              <CardContent>
                <Table data-tour="pages-erp-restaurant-table-floors.table.erp.common.name">
                  <TableHeader><TableRow><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.common.code', 'Code')}</TableHead><TableHead>{t('erp.common.capacity', 'Capacity')}</TableHead><TableHead>{t('erp.restaurant.tableFloors.availability', 'Availability')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredTables.map((table) => {
                      const availability = (availabilityQuery.data ?? []).find((item) => item.table.id === table.id);
                      return (
                        <TableRow key={table.id}>
                          <TableCell>{table.label}</TableCell>
                          <TableCell>{table.code}</TableCell>
                          <TableCell>{table.capacity}</TableCell>
                          <TableCell>{availability?.isAvailable ? t('erp.restaurant.tableFloors.available', 'Available') : t('erp.restaurant.tableFloors.occupied', 'Occupied')}</TableCell>
                          <TableCell className="space-x-1">
                            <Button size="icon" variant="ghost" disabled={!canManage} onClick={() => resetQrMutation.mutate(table)}><QrCode className="h-4 w-4" /></Button>
                            {canManage ? <Button size="icon" variant="ghost" onClick={() => { setEditingTableId(table.id); setTableForm({ sectionId: table.sectionId == null ? 'none' : String(table.sectionId), code: table.code, label: table.label, capacity: String(table.capacity), sortOrder: String(table.sortOrder ?? 0), isActive: table.isActive !== false, isReservable: table.isReservable !== false, posX: String(table.posX ?? 24), posY: String(table.posY ?? 24), layoutWidth: String(table.layoutWidth ?? 100), layoutHeight: String(table.layoutHeight ?? 64), rotation: String(table.rotation ?? 0), tableShape: table.tableShape ?? 'rectangle', tableType: table.tableType ?? 'dining' }); setTableDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button> : null}
                            {canManage ? <Button size="icon" variant="ghost" onClick={() => deleteTableMutation.mutate(table.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button> : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent data-tour="pages-erp-restaurant-table-floors.tabscontent.designer" value="designer" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{t('erp.restaurant.tableFloors.layoutDesigner', 'Layout Designer')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!canManage ? <p className="text-sm text-muted-foreground">{t('erp.restaurant.tableFloors.layoutReadOnly', 'Read-only: you can view layout but cannot edit it.')}</p> : null}
                <p className="text-sm text-muted-foreground">{t('erp.restaurant.tableFloors.dragTablesHint', 'Drag tables to arrange your floor')}</p>
                <div className="max-w-[260px]">
                  <Label>{t('erp.restaurant.tableFloors.selectFloor', 'Select floor')}</Label>
                  <Select value={designerSectionId} onValueChange={setDesignerSectionId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('erp.restaurant.tableFloors.unassignedFloor', 'Unassigned')}</SelectItem>
                      {(sectionsQuery.data ?? []).map((section) => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button data-tour="pages-erp-restaurant-table-floors.button.erp.restaurant.tableFloors.saveAllChanges" onClick={() => void saveAll()} disabled={!canManage || saveLayoutMutation.isPending}><Save className="mr-2 h-4 w-4" />{t('erp.restaurant.tableFloors.saveAllChanges', 'Save all changes')}</Button>
                  <Button data-tour="pages-erp-restaurant-table-floors.button.erp.restaurant.tableFloors.resetAllChanges" variant="outline" onClick={resetAll} disabled={!canManage}><RotateCcw className="mr-2 h-4 w-4" />{t('erp.restaurant.tableFloors.resetAllChanges', 'Reset changes')}</Button>
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="overflow-auto rounded-lg border bg-muted/20">
                    <div className="relative min-w-[1200px]" style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }} onPointerMove={handlePointerMove} onPointerUp={() => setDragState(null)} onPointerLeave={() => setDragState(null)}>
                      {designerFilteredTables.map((table, index) => {
                        const draft = layoutDrafts[table.id] ?? { posX: table.posX ?? 24 + (index % 8) * 128, posY: table.posY ?? 24 + Math.floor(index / 8) * 88, layoutWidth: table.layoutWidth ?? 100, layoutHeight: table.layoutHeight ?? 64, rotation: table.rotation ?? 0, tableShape: safeShape(table.tableShape), tableType: table.tableType ?? 'dining', backgroundColor: typeof table.metadata?.backgroundColor === 'string' ? table.metadata.backgroundColor : '#111827', isUnsaved: table.posX == null || table.posY == null };
                        return (
                          <div key={table.id} className="absolute flex items-center justify-center border px-2 py-1 text-xs select-none" style={{ backgroundColor: draft.backgroundColor, touchAction: 'none', left: `${draft.posX}px`, top: `${draft.posY}px`, width: `${draft.layoutWidth}px`, height: `${draft.layoutHeight}px`, transform: `rotate(${draft.rotation}deg)`, borderRadius: draft.tableShape === 'circle' ? '999px' : '6px', outline: selectedDesignerTableId === table.id ? '2px solid hsl(var(--primary))' : 'none' }} onClick={() => { setSelectedDesignerTableId(table.id); setActiveTab('designer'); setLocation(`/erp/restaurant/table-floors?tab=designer&editTable=${table.id}`); }} onPointerDown={(event) => canManage && setDragState({ tableId: table.id, mode: 'move', x: event.clientX, y: event.clientY, sx: draft.posX, sy: draft.posY, sw: draft.layoutWidth, sh: draft.layoutHeight })}>
                            <span className="pointer-events-none truncate">{table.label}</span>
                            {canManage ? <span className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-sm bg-primary/70" onPointerDown={(event) => { event.stopPropagation(); setDragState({ tableId: table.id, mode: 'resize', x: event.clientX, y: event.clientY, sx: draft.posX, sy: draft.posY, sw: draft.layoutWidth, sh: draft.layoutHeight }); }} /> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border p-3">
                    {selectedDesignerTable && layoutDrafts[selectedDesignerTable.id] ? (
                      <>
                        <h3 className="font-medium">{selectedDesignerTable.label}</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label>{t('erp.restaurant.tableFloors.width', 'Width')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.width" type="number" value={layoutDrafts[selectedDesignerTable.id].layoutWidth} onChange={(e) => setDraft(selectedDesignerTable.id, { layoutWidth: Number(e.target.value) || 100 })} disabled={!canManage} /></div>
                          <div><Label>{t('erp.restaurant.tableFloors.height', 'Height')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.width" type="number" value={layoutDrafts[selectedDesignerTable.id].layoutHeight} onChange={(e) => setDraft(selectedDesignerTable.id, { layoutHeight: Number(e.target.value) || 64 })} disabled={!canManage} /></div>
                        </div>
                        <div><Label>{t('erp.restaurant.tableFloors.rotation', 'Rotation')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.width" type="number" value={layoutDrafts[selectedDesignerTable.id].rotation} onChange={(e) => setDraft(selectedDesignerTable.id, { rotation: Number(e.target.value) || 0 })} disabled={!canManage} /></div>
                        <div><Label>{t('erp.restaurant.tableFloors.backgroundColor', 'Background color')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.width" type="color" value={layoutDrafts[selectedDesignerTable.id].backgroundColor} onChange={(e) => setDraft(selectedDesignerTable.id, { backgroundColor: e.target.value })} disabled={!canManage} /></div>
                        <div><Label>{t('erp.restaurant.tableFloors.shape', 'Shape')}</Label><Select value={layoutDrafts[selectedDesignerTable.id].tableShape} onValueChange={(v) => setDraft(selectedDesignerTable.id, { tableShape: v as LayoutDraft['tableShape'] })} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="rectangle">Rectangle</SelectItem><SelectItem value="square">Square</SelectItem><SelectItem value="circle">Circle</SelectItem></SelectContent></Select></div>
                        <div className="flex gap-2">
                          <Button data-tour="pages-erp-restaurant-table-floors.button.erp.restaurant.tableFloors.saveSelectedTable" onClick={() => void saveSelected()} disabled={!canManage}>{t('erp.restaurant.tableFloors.saveSelectedTable', 'Save selected table')}</Button>
                          <Button data-tour="pages-erp-restaurant-table-floors.button.erp.restaurant.tableFloors.resetSelectedTable" variant="outline" onClick={resetSelected} disabled={!canManage}>{t('erp.restaurant.tableFloors.resetSelectedTable', 'Reset selected table')}</Button>
                        </div>
                        {layoutDrafts[selectedDesignerTable.id].isUnsaved ? <p className="text-xs text-amber-600">{t('erp.restaurant.tableFloors.unsavedChanges', 'Unsaved changes')}</p> : null}
                      </>
                    ) : <p className="text-sm text-muted-foreground">{t('erp.restaurant.tableFloors.selectTable', 'Select floor')}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent data-tour="pages-erp-restaurant-table-floors.dialogcontent.erp.restaurant.tableFloors.editFloor">
          <DialogHeader><DialogTitle>{editingSectionId ? t('erp.restaurant.tableFloors.editFloor', 'Edit floor') : t('erp.restaurant.tableFloors.createFloor', 'Create floor')}</DialogTitle><DialogDescription>{t('erp.restaurant.tableFloors.floorDescription', 'Enter the floor code, name and level, then save your changes.')}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Label>{t('erp.common.code', 'Code')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.common.code" value={sectionForm.code} onChange={(e) => setSectionForm((p) => ({ ...p, code: e.target.value }))} />
            <Label>{t('erp.common.name', 'Name')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.common.code" value={sectionForm.name} onChange={(e) => setSectionForm((p) => ({ ...p, name: e.target.value }))} />
            <Label>{t('erp.common.description', 'Description')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.common.code" value={sectionForm.description} onChange={(e) => setSectionForm((p) => ({ ...p, description: e.target.value }))} />
            <Label>{t('erp.restaurant.tableFloors.floorLevel', 'Floor level')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.common.code" type="number" value={sectionForm.floorLevel} onChange={(e) => setSectionForm((p) => ({ ...p, floorLevel: e.target.value }))} />
            <div className="flex items-center gap-2"><Switch checked={sectionForm.isActive} onCheckedChange={(v) => setSectionForm((p) => ({ ...p, isActive: v }))} /><Label>{t('erp.common.active', 'Active')}</Label></div>
          </div>
          <DialogFooter><Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.cancel" variant="outline" onClick={() => setSectionDialogOpen(false)}>{t('erp.common.cancel', 'Cancel')}</Button><Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.save" disabled={!canManage} onClick={() => upsertSectionMutation.mutate()}>{t('erp.common.save', 'Save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
        <DialogContent data-tour="pages-erp-restaurant-table-floors.dialogcontent.erp.restaurant.tableFloors.editTable" className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingTableId ? t('erp.restaurant.tableFloors.editTable', 'Edit table') : t('erp.restaurant.tableFloors.createTable', 'Create table')}</DialogTitle><DialogDescription>{t('erp.restaurant.tableFloors.tableDescription', 'Choose a floor and enter a unique table code and label, seating capacity and layout.')}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('erp.restaurant.tableFloors.floor', 'Floor')}</Label><Select value={tableForm.sectionId} onValueChange={(v) => setTableForm((p) => ({ ...p, sectionId: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="none">{t('erp.restaurant.tableFloors.unassignedFloor', 'Unassigned')}</SelectItem>{(sectionsQuery.data ?? []).map((section) => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{t('erp.common.code', 'Code')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" value={tableForm.code} onChange={(e) => setTableForm((p) => ({ ...p, code: e.target.value }))} /></div>
            <div><Label>{t('erp.common.label', 'Label')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" value={tableForm.label} onChange={(e) => setTableForm((p) => ({ ...p, label: e.target.value }))} /></div>
            <div><Label>{t('erp.common.capacity', 'Capacity')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" type="number" value={tableForm.capacity} onChange={(e) => setTableForm((p) => ({ ...p, capacity: e.target.value }))} /></div>
            <div><Label>{t('erp.restaurant.tableFloors.posX', 'X')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" type="number" value={tableForm.posX} onChange={(e) => setTableForm((p) => ({ ...p, posX: e.target.value }))} /></div>
            <div><Label>{t('erp.restaurant.tableFloors.posY', 'Y')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" type="number" value={tableForm.posY} onChange={(e) => setTableForm((p) => ({ ...p, posY: e.target.value }))} /></div>
            <div><Label>{t('erp.restaurant.tableFloors.width', 'Width')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" type="number" value={tableForm.layoutWidth} onChange={(e) => setTableForm((p) => ({ ...p, layoutWidth: e.target.value }))} /></div>
            <div><Label>{t('erp.restaurant.tableFloors.height', 'Height')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" type="number" value={tableForm.layoutHeight} onChange={(e) => setTableForm((p) => ({ ...p, layoutHeight: e.target.value }))} /></div>
            <div><Label>{t('erp.restaurant.tableFloors.rotation', 'Rotation')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.floor" type="number" value={tableForm.rotation} onChange={(e) => setTableForm((p) => ({ ...p, rotation: e.target.value }))} /></div>
            <div><Label>{t('erp.restaurant.tableFloors.tableShape', 'Shape')}</Label><Select value={tableForm.tableShape} onValueChange={(v) => setTableForm((p) => ({ ...p, tableShape: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="rectangle">Rectangle</SelectItem><SelectItem value="circle">Circle</SelectItem><SelectItem value="square">Square</SelectItem></SelectContent></Select></div>
            <div className="col-span-2 flex items-center gap-6">
              <div className="flex items-center gap-2"><Switch checked={tableForm.isActive} onCheckedChange={(v) => setTableForm((p) => ({ ...p, isActive: v }))} /><Label>{t('erp.common.active', 'Active')}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={tableForm.isReservable} onCheckedChange={(v) => setTableForm((p) => ({ ...p, isReservable: v }))} /><Label>{t('erp.restaurant.tableFloors.reservable', 'Reservable')}</Label></div>
            </div>
          </div>
          <DialogFooter><Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.cancel" variant="outline" onClick={() => setTableDialogOpen(false)}>{t('erp.common.cancel', 'Cancel')}</Button><Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.save" disabled={!canManage} onClick={() => upsertTableMutation.mutate()}>{t('erp.common.save', 'Save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent data-tour="pages-erp-restaurant-table-floors.dialogcontent.erp.restaurant.tableFloors.bulkCreate">
          <DialogHeader><DialogTitle>{t('erp.restaurant.tableFloors.bulkCreate', 'Bulk Create Tables')}</DialogTitle><DialogDescription>{t('erp.restaurant.tableFloors.bulkDescription', 'Choose a prefix and starting number that do not overlap existing table codes or labels. A conflict prevents the entire batch from being created.')}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>{t('erp.restaurant.tableFloors.floor', 'Floor')}</Label><Select value={bulkForm.sectionId} onValueChange={(v) => setBulkForm((p) => ({ ...p, sectionId: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="none">{t('erp.restaurant.tableFloors.unassignedFloor', 'Unassigned')}</SelectItem>{(sectionsQuery.data ?? []).map((section) => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('erp.restaurant.tableFloors.prefix', 'Prefix')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.prefix" value={bulkForm.prefix} onChange={(e) => setBulkForm((p) => ({ ...p, prefix: e.target.value }))} /></div>
              <div><Label>{t('erp.restaurant.tableFloors.startNumber', 'Start number')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.prefix" type="number" value={bulkForm.startNumber} onChange={(e) => setBulkForm((p) => ({ ...p, startNumber: e.target.value }))} /></div>
              <div><Label>{t('erp.restaurant.tableFloors.count', 'Count')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.prefix" type="number" value={bulkForm.count} onChange={(e) => setBulkForm((p) => ({ ...p, count: e.target.value }))} /></div>
              <div><Label>{t('erp.common.capacity', 'Capacity')}</Label><Input data-tour="pages-erp-restaurant-table-floors.input.erp.restaurant.tableFloors.prefix" type="number" value={bulkForm.capacity} onChange={(e) => setBulkForm((p) => ({ ...p, capacity: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.cancel" variant="outline" onClick={() => setBulkOpen(false)}>{t('erp.common.cancel', 'Cancel')}</Button><Button data-tour="pages-erp-restaurant-table-floors.button.erp.common.create" disabled={!canManage || bulkCreateMutation.isPending} onClick={() => bulkCreateMutation.mutate()}>{t('erp.common.create', 'Create')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
