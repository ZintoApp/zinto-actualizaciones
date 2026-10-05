import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'wouter';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  OdontogramApp,
  collectOdontogramPayload,
  importOdontogramPayload,
  onStateChange,
  type NumberingSystem,
} from '@bothive/pointer-odontogram-module';
import '@bothive/pointer-odontogram-module/style.css';

type OdontogramLanguage = 'hu' | 'en' | 'de' | 'es' | 'it' | 'sk' | 'pl' | 'ru' | 'pt-br';

const ODONTOGRAM_LANGUAGES = new Set<OdontogramLanguage>([
  'hu',
  'en',
  'de',
  'es',
  'it',
  'sk',
  'pl',
  'ru',
  'pt-br',
]);

/** Map Bothive locale codes (e.g. es-ES, pt_BR) onto odontogram language keys. */
function toOdontogramLanguage(code: string | null | undefined): OdontogramLanguage {
  if (!code) return 'en';
  const normalized = code.trim().toLowerCase().replace(/_/g, '-');
  if (ODONTOGRAM_LANGUAGES.has(normalized as OdontogramLanguage)) {
    return normalized as OdontogramLanguage;
  }
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-br';
  const base = normalized.split('-')[0] ?? 'en';
  if (ODONTOGRAM_LANGUAGES.has(base as OdontogramLanguage)) {
    return base as OdontogramLanguage;
  }
  return 'en';
}

type ChartSnapshot = {
  id: number;
  version: number;
  numberingSystem: string;
  payload: Record<string, unknown>;
  createdBy: number | null;
  createdAt: string;
};

type HistoryRow = Pick<ChartSnapshot, 'id' | 'version' | 'numberingSystem' | 'createdBy' | 'createdAt'>;

function useContactIdFromQuery(): number | null {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('contactId');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type MountedChartProps = {
  payload: Record<string, unknown> | null;
  readOnly: boolean;
  numberingSystem: NumberingSystem;
  mountKey: string;
  onRequestEdit?: () => void;
};

function MountedChart({ payload, readOnly, numberingSystem, mountKey, onRequestEdit }: MountedChartProps) {
  const { resolvedTheme } = useTheme();
  const { currentLanguage, languages, changeLanguage } = useTranslation();
  const isDark = resolvedTheme === 'dark';
  const odontogramLanguage = toOdontogramLanguage(currentLanguage?.code);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    let imported = false;
    const tryImport = () => {
      if (cancelled || imported) return;
      imported = true;
      importOdontogramPayload(payload);
    };
    const unsub = onStateChange(() => {
      if (!imported) tryImport();
    });
    const timer = window.setTimeout(tryImport, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [mountKey, payload]);

  const handleOdontogramLanguageChange = (lang: OdontogramLanguage) => {
    const match =
      languages.find((entry) => {
        const code = entry.code.trim().toLowerCase().replace(/_/g, '-');
        return code === lang || code.split('-')[0] === lang.split('-')[0];
      }) ?? null;
    void changeLanguage(match?.code ?? (lang === 'pt-br' ? 'pt-BR' : lang));
  };

  return (
    <OdontogramApp
      key={mountKey}
      readOnly={readOnly}
      numberingSystem={numberingSystem}
      darkMode={isDark}
      language={odontogramLanguage}
      onLanguageChange={handleOdontogramLanguageChange}
      showLanguagePicker={false}
      showThemeToggle={false}
      showBrand={false}
      onRequestEdit={onRequestEdit}
    />
  );
}

export default function DentalChartPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canEdit = hasPermission(PERMISSIONS.EDIT_DENTAL_CHART);
  const contactId = useContactIdFromQuery();

  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [historySnapshotId, setHistorySnapshotId] = useState<number | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [numberingSystem, setNumberingSystem] = useState<NumberingSystem>('FDI');

  useEffect(() => {
    setViewMode('live');
    setHistorySnapshotId(null);
  }, [contactId]);

  const latestQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'chart/latest'],
    enabled: contactId != null,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/chart/latest`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load chart');
      return json.data as {
        snapshot: ChartSnapshot | null;
        numberingSystem: NumberingSystem;
        patient: { contactId: number; name: string };
      };
    },
  });

  const historyQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'chart/history'],
    enabled: contactId != null,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/chart/history`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load chart history');
      return json.data as HistoryRow[];
    },
  });

  const historySnapshotQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'chart/snapshots', historySnapshotId],
    enabled: contactId != null && viewMode === 'history' && historySnapshotId != null,
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/erp/dental/patients/${contactId}/chart/snapshots/${historySnapshotId}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load snapshot');
      return json.data as ChartSnapshot;
    },
  });

  useEffect(() => {
    if (latestQuery.data?.numberingSystem) {
      setNumberingSystem(latestQuery.data.numberingSystem);
    }
  }, [latestQuery.data?.numberingSystem]);

  const activePayload = useMemo(() => {
    if (viewMode === 'history') {
      return historySnapshotQuery.data?.payload ?? null;
    }
    return latestQuery.data?.snapshot?.payload ?? null;
  }, [viewMode, historySnapshotQuery.data?.payload, latestQuery.data?.snapshot?.payload]);

  const activeNumbering = useMemo(() => {
    if (viewMode === 'history' && historySnapshotQuery.data?.numberingSystem) {
      return historySnapshotQuery.data.numberingSystem as NumberingSystem;
    }
    return numberingSystem;
  }, [viewMode, historySnapshotQuery.data?.numberingSystem, numberingSystem]);

  const chartReadOnly = viewMode === 'history' || !canEdit;

  const mountKey = useMemo(() => {
    if (viewMode === 'history') {
      return `history-${historySnapshotId ?? 'none'}`;
    }
    const version = latestQuery.data?.snapshot?.version ?? 0;
    return `live-${contactId ?? 0}-${version}`;
  }, [viewMode, historySnapshotId, contactId, latestQuery.data?.snapshot?.version]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error('No patient selected');
      const payload = collectOdontogramPayload() as Record<string, unknown>;
      const res = await apiRequest('POST', `/api/erp/dental/patients/${contactId}/chart/snapshots`, {
        payload,
        numberingSystem,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save chart');
      return json.data as ChartSnapshot;
    },
    onSuccess: () => {
      toast({
        title: t('erp.dental.chart.saved', 'Chart saved'),
        description: t('erp.dental.chart.savedDescription', 'A new snapshot version was recorded.'),
      });
      setViewMode('live');
      setHistorySnapshotId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'chart/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'chart/history'] });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const numberingMutation = useMutation({
    mutationFn: async (next: NumberingSystem) => {
      const res = await apiRequest('PATCH', '/api/erp/dental/chart/settings', { numberingSystem: next });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update numbering');
      return json.data as { numberingSystem: NumberingSystem };
    },
    onSuccess: (data) => {
      setNumberingSystem(data.numberingSystem);
      toast({
        title: t('erp.dental.chart.numberingUpdated', 'Numbering updated'),
        description: t('erp.dental.chart.numberingUpdatedDescription', 'Company default tooth numbering was saved.'),
      });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const patientName = latestQuery.data?.patient.name;
  const isLoading = latestQuery.isLoading || (viewMode === 'history' && historySnapshotQuery.isLoading);

  return (
    <DentalShellPage
      title={t('erp.dental.chart.title', 'Chart')}
      description={
        contactId && patientName
          ? t('erp.dental.chart.patientChart', 'Odontogram for {{name}}', { name: patientName })
          : t('erp.dental.chart.selectPatient', 'Open a patient chart from the patient record.')
      }
    >
      {!contactId ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {t(
              'erp.dental.chart.missingContact',
              'No patient selected. Open a chart from a patient profile or append ?contactId= to the URL.',
            )}{' '}
            <Link href="/erp/dental/patients" className="text-primary underline-offset-4 hover:underline">
              {t('erp.dental.patients.title', 'Patients')}
            </Link>
          </CardContent>
        </Card>
      ) : latestQuery.isError ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            {(latestQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            historyCollapsed ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_280px]',
          )}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button data-tour="pages-erp-dental-chart.button.erp.dental.chart.backToPatients" asChild size="sm" variant="outline">
                <Link href="/erp/dental/patients">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('erp.dental.chart.backToPatients', 'Back to patients')}
                </Link>
              </Button>
              {viewMode === 'history' ? (
                <Badge variant="secondary">
                  {t('erp.dental.chart.viewingHistory', 'Viewing history v{{version}}', {
                    version: historySnapshotQuery.data?.version ?? '—',
                  })}
                </Badge>
              ) : (
                <Badge variant="outline">
                  {latestQuery.data?.snapshot
                    ? t('erp.dental.chart.version', 'Version {{version}}', {
                        version: latestQuery.data.snapshot.version,
                      })
                    : t('erp.dental.chart.noSnapshots', 'No saved chart yet')}
                </Badge>
              )}
              {viewMode === 'history' && (
                <Button data-tour="pages-erp-dental-chart.button.erp.dental.chart.backToLive"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setViewMode('live');
                    setHistorySnapshotId(null);
                  }}
                >
                  {t('erp.dental.chart.backToLive', 'Back to current chart')}
                </Button>
              )}
              {canEdit && viewMode === 'live' && (
                <Button data-tour="pages-erp-dental-chart.button.erp.dental.chart.saveSnapshot" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {t('erp.dental.chart.saveSnapshot', 'Save snapshot')}
                </Button>
              )}
              {historyCollapsed && (
                <Button data-tour="pages-erp-dental-chart.button.erp.dental.chart.history" size="sm" variant="outline" onClick={() => setHistoryCollapsed(false)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('erp.dental.chart.history', 'History')}
                </Button>
              )}
              {canEdit && viewMode === 'live' && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">
                    {t('erp.dental.chart.numbering', 'Numbering')}
                  </span>
                  <Select
                    value={numberingSystem}
                    onValueChange={(value) => {
                      const next = value as NumberingSystem;
                      setNumberingSystem(next);
                      numberingMutation.mutate(next);
                    }}
                    disabled={numberingMutation.isPending}
                  >
                    <SelectTrigger className="h-8 w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FDI">FDI</SelectItem>
                      <SelectItem value="UNIVERSAL">Universal</SelectItem>
                      <SelectItem value="PALMER">Palmer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="rounded-md border bg-background overflow-auto min-h-[420px] relative">
              {isLoading ? (
                <div className="flex items-center justify-center min-h-[420px] text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  {t('erp.common.loading', 'Loading...')}
                </div>
              ) : (
                <MountedChart
                  mountKey={mountKey}
                  payload={activePayload}
                  readOnly={chartReadOnly}
                  numberingSystem={activeNumbering}
                  onRequestEdit={
                    canEdit
                      ? () => {
                          setViewMode('live');
                          setHistorySnapshotId(null);
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </div>

          {!historyCollapsed && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{t('erp.dental.chart.history', 'History')}</CardTitle>
                <Button data-tour="pages-erp-dental-chart.button.erp.dental.chart.collapseHistory"
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setHistoryCollapsed(true)}
                  aria-label={t('erp.dental.chart.collapseHistory', 'Collapse history')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {historyQuery.isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('erp.common.loading', 'Loading...')}
                  </div>
                ) : (historyQuery.data?.length ?? 0) === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {t('erp.dental.chart.historyEmpty', 'No snapshots saved yet.')}
                  </p>
                ) : (
                  <Table data-tour="pages-erp-dental-chart.table.erp.dental.chart.colVersion">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.dental.chart.colVersion', 'Ver.')}</TableHead>
                        <TableHead>{t('erp.dental.chart.colSaved', 'Saved')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyQuery.data?.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          data-state={historySnapshotId === row.id ? 'selected' : undefined}
                          onClick={() => {
                            setViewMode('history');
                            setHistorySnapshotId(row.id);
                          }}
                        >
                          <TableCell className="font-medium">v{row.version}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatWhen(row.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </DentalShellPage>
  );
}
