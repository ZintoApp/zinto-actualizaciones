import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2 } from 'lucide-react';

type Station = { id: number; code: string; name: string; warehouseId: number | null; sortOrder: number | null; isActive: boolean | null };
type Warehouse = { id: number; name: string };

export default function RestaurantKitchenStationsSettingsPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ code: '', name: '', warehouseId: 'none', sortOrder: '0', isActive: true });
  const { data: stations = [], isLoading } = useQuery<Station[]>({ queryKey: ['/api/erp/restaurant/layout/kitchen-stations'], queryFn: async () => (await (await apiRequest('GET', '/api/erp/restaurant/layout/kitchen-stations')).json()).data ?? [] });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ['/api/erp/inventory/warehouses'], queryFn: async () => (await (await apiRequest('GET', '/api/erp/inventory/warehouses')).json()).data ?? [] });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/layout/kitchen-stations'] });
  const createMut = useMutation({ mutationFn: async () => apiRequest('POST', '/api/erp/restaurant/layout/kitchen-stations', { code: draft.code, name: draft.name, warehouseId: draft.warehouseId === 'none' ? null : Number(draft.warehouseId), sortOrder: Number(draft.sortOrder) || 0, isActive: draft.isActive }), onSuccess: () => { setDraft({ code: '', name: '', warehouseId: 'none', sortOrder: '0', isActive: true }); refresh(); } });
  const updateMut = useMutation({ mutationFn: async (station: Station) => apiRequest('PUT', `/api/erp/restaurant/layout/kitchen-stations/${station.id}`, station), onSuccess: refresh, onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }) });
  const deleteMut = useMutation({ mutationFn: async (id: number) => apiRequest('DELETE', `/api/erp/restaurant/layout/kitchen-stations/${id}`), onSuccess: refresh, onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }) });

  return <Card><CardContent className="pt-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-semibold">{t('erp.settings.restaurant.kitchenStations.title', 'Kitchen stations')}</h3>
    </div>
    {canManage && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Input data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.input.erp.settings.restaurant.kitchenStations.code" value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))} placeholder={t('erp.settings.restaurant.kitchenStations.code', 'Code')} />
      <Input data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.input.erp.common.name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder={t('erp.common.name', 'Name')} />
      <Select value={draft.warehouseId} onValueChange={(warehouseId) => setDraft((p) => ({ ...p, warehouseId }))}><SelectTrigger data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.selecttrigger.erp.settings.restaurant.kitchenStations.linkedWarehouse"><SelectValue placeholder={t('erp.settings.restaurant.kitchenStations.linkedWarehouse', 'Linked warehouse')} /></SelectTrigger><SelectContent searchable><SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.name}</SelectItem>)}</SelectContent></Select>
      <Input data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.input.erp.common.sortOrder" value={draft.sortOrder} onChange={(e) => setDraft((p) => ({ ...p, sortOrder: e.target.value }))} placeholder={t('erp.common.sortOrder', 'Sort order')} />
      <Button data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.button.erp.common.create" onClick={() => createMut.mutate()} disabled={!draft.name || !draft.code}><Plus className="mr-2 h-4 w-4" />{t('erp.common.create', 'Create')}</Button>
    </div>}
    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="w-full overflow-x-auto"><Table data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.table.erp.settings.restaurant.kitchenStations.code" className="min-w-[900px]"><TableHeader><TableRow><TableHead>{t('erp.settings.restaurant.kitchenStations.code', 'Code')}</TableHead><TableHead>{t('erp.common.name', 'Name')}</TableHead><TableHead>{t('erp.settings.restaurant.kitchenStations.linkedWarehouse', 'Linked warehouse')}</TableHead><TableHead>{t('erp.common.sortOrder', 'Sort order')}</TableHead><TableHead>{t('erp.common.active', 'Active')}</TableHead><TableHead>{t('erp.common.actions', 'Actions')}</TableHead></TableRow></TableHeader><TableBody>
      {stations.map((station) => <TableRow key={station.id}><TableCell><Input data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.input.station.code" value={station.code} disabled={!canManage} onChange={(e) => updateMut.mutate({ ...station, code: e.target.value })} /></TableCell><TableCell><Input data-tour="components-erp-settings-restaurantkitchenstationssettingspanel.input.station.name" value={station.name} disabled={!canManage} onChange={(e) => updateMut.mutate({ ...station, name: e.target.value })} /></TableCell><TableCell><Select value={station.warehouseId == null ? 'none' : String(station.warehouseId)} disabled={!canManage} onValueChange={(value) => updateMut.mutate({ ...station, warehouseId: value === 'none' ? null : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent searchable><SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.name}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Input value={String(station.sortOrder ?? 0)} disabled={!canManage} onChange={(e) => updateMut.mutate({ ...station, sortOrder: Number(e.target.value) || 0 })} /></TableCell><TableCell><div className="flex items-center gap-2"><Switch checked={station.isActive !== false} disabled={!canManage} onCheckedChange={(value) => updateMut.mutate({ ...station, isActive: value })} /><Label>{t('erp.common.active', 'Active')}</Label></div></TableCell><TableCell>{canManage ? <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(station.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button> : null}</TableCell></TableRow>)}
    </TableBody></Table></div>}
  </CardContent></Card>;
}
