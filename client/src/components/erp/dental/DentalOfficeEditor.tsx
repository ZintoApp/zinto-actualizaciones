import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type DentalOffice = { id: number; code: string; name: string; isActive: boolean };

export function DentalOfficeEditor({ open, office, onOpenChange }: {
  open: boolean;
  office: DentalOffice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const queryClient = useQueryClient();
  const id = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCode(office?.code ?? '');
    setName(office?.name ?? '');
    setIsActive(office?.isActive ?? true);
    setError('');
  }, [open, office]);

  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error(t('erp.dental.booking.settings.readOnly', 'You have read-only access.'));
      const response = await apiRequest(office ? 'PATCH' : 'POST',
        office ? `/api/erp/dental/chairs/${office.id}` : '/api/erp/dental/chairs',
        { code: code.trim(), name: name.trim(), isActive });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('erp.dental.chairs.saveFailed', 'Could not save office.'));
      return result.data as DentalOffice;
    },
    onSuccess: () => {
      for (const path of [
        '/api/erp/dental/chairs', '/api/erp/dental/schedule', '/api/erp/dental/schedule/upcoming',
        '/api/erp/dental/schedule/availability', '/api/erp/dental/schedule/validate-slot',
        '/api/erp/dental/booking/pending',
      ]) void queryClient.invalidateQueries({ queryKey: [path] });
      toast({ title: t('erp.dental.chairs.saved', 'Office saved') });
      onOpenChange(false);
    },
    onError: (cause: Error) => setError(cause.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!save.isPending) onOpenChange(next); }}>
      <DialogContent data-tour="components-erp-dental-dentalofficeeditor.dialogcontent.erp.dental.chairs.edit" className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{office ? t('erp.dental.chairs.edit', 'Edit office') : t('erp.dental.chairs.add', 'Add office')}</DialogTitle>
          <DialogDescription>{t('erp.dental.chairs.sharedHelp', 'Offices are shared across the clinic. Changes apply to every specialist and save immediately. Disabling an office prevents new bookings; existing appointments are kept.')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (canManage && code.trim() && name.trim() && !save.isPending) {
            setError('');
            save.mutate();
          }
        }}>
          <div className="space-y-1">
            <Label htmlFor={`${id}-code`}>{t('erp.dental.chairs.code', 'Code')}</Label>
            <Input data-tour="components-erp-dental-dentalofficeeditor.input.erp.dental.chairs.code" id={`${id}-code`} required maxLength={64} value={code} disabled={!canManage || save.isPending} onChange={(event) => setCode(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`}>{t('erp.dental.chairs.name', 'Name')}</Label>
            <Input data-tour="components-erp-dental-dentalofficeeditor.input.erp.dental.chairs.code" id={`${id}-name`} required maxLength={120} value={name} disabled={!canManage || save.isPending} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`${id}-active`} checked={isActive} disabled={!canManage || save.isPending} onCheckedChange={setIsActive} />
            <Label htmlFor={`${id}-active`}>{t('erp.dental.chairs.active', 'Active')}</Label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button data-tour="components-erp-dental-dentalofficeeditor.button.ui.common.cancel" type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>{t('ui.common.cancel', 'Cancel')}</Button>
            <Button data-tour="components-erp-dental-dentalofficeeditor.button.erp.common.save" type="submit" disabled={!canManage || !code.trim() || !name.trim() || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
