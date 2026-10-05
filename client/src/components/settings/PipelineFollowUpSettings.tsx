import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export default function PipelineFollowUpSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hours, setHours] = useState(24);
  const [preset, setPreset] = useState('24');
  const { data, isLoading, error } = useQuery<{ recentContactHours: number }>({
    queryKey: ['/api/company-settings/pipeline-follow-up'],
  });
  useEffect(() => {
    if (data) { setHours(data.recentContactHours); setPreset([24, 72].includes(data.recentContactHours) ? String(data.recentContactHours) : 'custom'); }
  }, [data]);
  const save = useMutation({
    mutationFn: () => apiRequest('POST', '/api/company-settings/pipeline-follow-up', { recentContactHours: hours }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/company-settings/pipeline-follow-up'] });
      toast({ title: t('common.success', 'Success') });
    },
    onError: () => toast({ title: t('pipeline.follow_up.settings_error', 'Could not save follow-up settings'), variant: 'destructive' }),
  });
  return <section className="space-y-3 border-b pb-6">
    <Label htmlFor="recent-contact-duration">{t('pipeline.follow_up.recent_duration', 'Recently contacted period')}</Label>
    <div className="flex flex-wrap items-end gap-3">
      <Select value={preset} disabled={isLoading || !!error} onValueChange={value => { setPreset(value); if (value !== 'custom') setHours(Number(value)); }}>
        <SelectTrigger data-tour="components-settings-pipelinefollowupsettings.selecttrigger.recent-contact-duration" id="recent-contact-duration" className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="24">{t('pipeline.follow_up.hours_24', '24 hours')}</SelectItem>
          <SelectItem value="72">{t('pipeline.follow_up.days_3', '3 days')}</SelectItem>
          <SelectItem value="custom">{t('pipeline.follow_up.custom', 'Custom')}</SelectItem>
        </SelectContent>
      </Select>
      {preset === 'custom' && <div className="space-y-1">
        <Label htmlFor="recent-contact-hours">{t('pipeline.follow_up.hours', 'Hours')}</Label>
        <Input data-tour="components-settings-pipelinefollowupsettings.input.recent-contact-hours" id="recent-contact-hours" className="w-32" type="number" min="0.01" max="87600" step="any" value={hours} onChange={event => setHours(Number(event.target.value))} />
      </div>}
      <Button data-tour="components-settings-pipelinefollowupsettings.button.common.save" type="button" disabled={isLoading || !!error || save.isPending || !Number.isFinite(hours) || hours <= 0 || hours > 87600} onClick={() => save.mutate()}>{t('common.save', 'Save')}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{t('pipeline.follow_up.settings_error', 'Could not save follow-up settings')}</p>}
  </section>;
}
