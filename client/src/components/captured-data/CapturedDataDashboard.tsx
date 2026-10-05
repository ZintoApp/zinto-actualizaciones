import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';
import { FilterIcon } from '@/components/ui/filter-icon';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { PermissionGate } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@shared/schema';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  Loader2,
  Rows3,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  buildCapturedDataFieldPreview,
  countCapturedDataFields,
  formatCapturedDataFieldLabel,
  formatCapturedDataTimestamp,
  formatCapturedDataValue,
  getCapturedDataRange,
  getCapturedMediaDisplayUrl,
  isCapturedDataDateRangeInvalid,
  isCapturedMediaFieldValue,
  toAbsoluteCapturedMediaSrc
} from './captured-data-utils';

type CapturedTranslate = (key: string, fallback?: string, variables?: Record<string, unknown>) => string;

/** Generic file/document icon for captures that are not browser-previewable as images (e.g. JSON, Office). */
const CAPTURED_MEDIA_FILE_PLACEHOLDER =
  APP_ICONS.capturedData;

function capturedMediaPathExtension(url: string): string {
  const path = url.split(/[?#]/)[0];
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function CapturedFieldValueDisplay({ value, t }: { value: unknown; t: CapturedTranslate }) {
  const mediaUrl = getCapturedMediaDisplayUrl(value);
  const showMedia = Boolean(mediaUrl && isCapturedMediaFieldValue(value));
  const absoluteSrc = useMemo(
    () => (mediaUrl ? toAbsoluteCapturedMediaSrc(mediaUrl) : ''),
    [mediaUrl]
  );
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [absoluteSrc]);

  if (showMedia && absoluteSrc) {
    const pathOnly = (mediaUrl ?? '').split(/[?#]/)[0].toLowerCase();
    const ext = capturedMediaPathExtension(mediaUrl ?? '');
    const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(pathOnly);
    const isAudio = /\.(mp3|wav|m4a|aac|opus|flac)(\?|$)/i.test(pathOnly);
    const isPdf = /\.pdf(\?|$)/i.test(pathOnly);
    const isRasterOrVectorImage =
      /\.(jpe?g|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(pathOnly);
    const tryUrlAsImage = isRasterOrVectorImage || ext === '';

    const useFilePlaceholder =
      isPdf ||
      (!tryUrlAsImage && !isVideo && !isAudio) ||
      (tryUrlAsImage && imageLoadFailed);

    return (
      <div className="space-y-2">
        {isVideo ? (
          <div className="h-[63px] w-[63px] shrink-0 overflow-hidden rounded-md border bg-black">
            <video
              src={absoluteSrc}
              className="h-full w-full object-cover"
              playsInline
              preload="metadata"
              muted
            />
          </div>
        ) : isAudio ? (
          <div className="flex h-[63px] w-[63px] shrink-0 items-center justify-center rounded-md border bg-muted px-1 text-center text-[10px] leading-tight text-muted-foreground">
            {t('captured_data.media_audio', 'Audio')}
          </div>
        ) : useFilePlaceholder ? (
          <img
            src={CAPTURED_MEDIA_FILE_PLACEHOLDER}
            alt=""
            className="h-[63px] w-[63px] shrink-0 rounded-md border bg-muted/30 object-contain p-1"
            loading="lazy"
          />
        ) : (
          <img
            src={absoluteSrc}
            alt=""
            className="h-[63px] w-[63px] shrink-0 rounded-md border object-cover"
            loading="lazy"
            onError={() => setImageLoadFailed(true)}
          />
        )}
        <a
          href={absoluteSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-primary underline"
        >
          {t('captured_data.open_media', 'Open media')}
        </a>
      </div>
    );
  }

  return <>{formatCapturedDataValue(value, t)}</>;
}

interface FlowOption {
  id: number;
  name: string;
}

interface CapturedSubmission {
  id: number;
  contactName: string;
  flowName: string;
  submittedAt: string;
  capturedFields: Record<string, unknown>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CapturedDataResponse {
  success: boolean;
  data: CapturedSubmission[];
  pagination: Pagination;
  error?: string;
}

function SummaryCard({
  label,
  value,
  description,
  icon: Icon
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-background/80 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tracking-tight text-foreground">{value}</p>
          <p className="text-[11px] leading-4 text-muted-foreground truncate" title={description}>{description}</p>
        </div>
        <div className="shrink-0 rounded-full border bg-muted/40 p-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

function CapturedDataLoadingState() {
  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const ActiveFlowSummaryIcon = ({ className }: { className?: string }) => (
  <FilterIcon className={className} size={22} />
);

export function CapturedDataDashboard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['/api/captured-data'] });
  }, [queryClient]);

  const [selectedFlowId, setSelectedFlowId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedSubmission, setSelectedSubmission] = useState<CapturedSubmission | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [submissionToDelete, setSubmissionToDelete] = useState<CapturedSubmission | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [exportFlowId, setExportFlowId] = useState<string>('all');
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<DownloadExportFormat>('csv');

  const pageSize = 25;

  const hasDateFilter = Boolean(startDate || endDate);
  const dateRangeInvalid = isCapturedDataDateRangeInvalid(startDate, endDate);

  const {
    data: flowsData = [],
    isLoading: flowsLoading,
    isError: flowsIsError,
    error: flowsError,
    refetch: refetchFlows
  } = useQuery<FlowOption[]>({
    queryKey: ['/api/flows'],
    queryFn: async () => {
      const res = await fetch('/api/flows');
      if (!res.ok) throw new Error(t('captured_data.flows_load_failed', 'Failed to load flows'));
      return res.json() as Promise<FlowOption[]>;
    }
  });

  const {
    data: submissionsData,
    isLoading: submissionsLoading,
    isFetching: submissionsFetching,
    isError: submissionsIsError,
    error: submissionsError,
    refetch: refetchSubmissions
  } = useQuery<CapturedDataResponse>({
    queryKey: ['/api/captured-data', selectedFlowId, startDate, endDate, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedFlowId !== 'all') params.append('flowId', selectedFlowId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());

      const res = await fetch(`/api/captured-data?${params}`);
      const json = (await res.json()) as CapturedDataResponse;

      if (!res.ok) {
        throw new Error(json?.error || t('captured_data.load_failed', 'Failed to load captured data'));
      }

      if (json.success !== true) {
        throw new Error(json?.error || t('captured_data.load_failed', 'Failed to load captured data'));
      }

      return json;
    },
    placeholderData: (previousData) => previousData,
    enabled: !dateRangeInvalid
  });

  const submissions = submissionsData?.data ?? [];
  const pagination = submissionsData?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const hasActiveFilter = selectedFlowId !== 'all' || hasDateFilter;
  const selectedFlow = hasActiveFilter
    ? flowsData.find((flow) => flow.id.toString() === selectedFlowId) ?? null
    : null;
  const range = getCapturedDataRange(pagination, submissions.length);
  const totalSubmissions = pagination?.total ?? submissions.length;
  const currentFlowLabel = selectedFlow?.name ?? (hasActiveFilter ? t('captured_data.selected_flow', 'Selected flow') : t('captured_data.all_flows', 'All flows'));
  const selectedSubmissionEntries = useMemo(
    () => Object.entries(selectedSubmission?.capturedFields ?? {}),
    [selectedSubmission],
  );

  const openDetails = (submission: CapturedSubmission) => {
    setSelectedSubmission(submission);
    setIsDetailsOpen(true);
  };

  const closeDetails = () => {
    setIsDetailsOpen(false);
    setSelectedSubmission(null);
  };

  const clearFilter = () => {
    setSelectedFlowId('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const openExportModal = () => {
    setExportFlowId(selectedFlowId);
    setExportStartDate(startDate);
    setExportEndDate(endDate);
    setIsExportModalOpen(true);
  };

  const exportModalDateInvalid = isCapturedDataDateRangeInvalid(exportStartDate, exportEndDate);

  const exportCapturedData = async (format: DownloadExportFormat, submissionId?: number) => {
    if (exportModalDateInvalid || isExporting) return;
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (submissionId !== undefined) params.set('submissionId', String(submissionId));
      else {
        if (exportFlowId !== 'all') params.set('flowId', exportFlowId);
        if (exportStartDate) params.set('startDate', exportStartDate);
        if (exportEndDate) params.set('endDate', exportEndDate);
      }
      const response = await fetch(`/api/captured-data/export?${params.toString()}`, { credentials: 'include' });
      await downloadExportResponse(response, submissionId === undefined ? 'captured-data' : `submission-${submissionId}`, format);
      if (submissionId === undefined) setIsExportModalOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const refreshData = () => {
    void refetchFlows();
    void refetchSubmissions();
  };

  const handleDeleteSubmission = async () => {
    if (!submissionToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/captured-data/${submissionToDelete.id}`, { method: 'DELETE' });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json?.error || t('captured_data.delete_failed', 'Delete failed'));
      setSubmissionToDelete(null);
      void refetchSubmissions();
      if (isDetailsOpen && selectedSubmission?.id === submissionToDelete.id) {
        closeDetails();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (submissionsLoading && !submissionsData) {
    return <CapturedDataLoadingState />;
  }

  if (submissionsIsError && !submissionsData) {
    return (
      <Card className="border-destructive/40 shadow-sm">
        <CardContent className="py-10">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('captured_data.unable_to_load', 'Unable to load captured submissions')}</AlertTitle>
            <AlertDescription className="space-y-4">
              <p>{(submissionsError as Error | undefined)?.message || t('captured_data.load_failed', 'Failed to load captured data.')}</p>
              <Button data-tour="components-captured-data-captureddatadashboard.button.common.try_again" variant="outline" size="sm" onClick={refreshData}>
                <RefreshCw className="h-4 w-4" />
                {t('common.try_again', 'Try again')}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="gap-3 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-normal">{t('captured_data.title', 'Captured submissions')}</CardTitle>
              <CardDescription className="text-xs leading-5 max-w-2xl">
                {t('captured_data.description', 'Review captured data from contacts. Filter by flow, date, and open details.')}
              </CardDescription>
            </div>

            <Button data-tour="components-captured-data-captureddatadashboard.button.common.refresh" variant="outline" size="sm" className="shrink-0" onClick={refreshData} disabled={submissionsFetching}>
              <RefreshCw className={cn('h-4 w-4', submissionsFetching && 'animate-spin')} />
              {t('common.refresh', 'Refresh')}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label={t('captured_data.summary.total_submissions', 'Total submissions')}
              value={totalSubmissions.toLocaleString()}
              description={t('captured_data.summary.total_description', 'All captured submissions that match the current query.')}
              icon={Database}
            />
            <SummaryCard
              label={t('captured_data.summary.showing', 'Showing')}
              value={range.start === 0 ? '0' : `${range.start}-${range.end}`}
              description={t('captured_data.summary.showing_description', 'Results currently visible on this page.')}
              icon={Rows3}
            />
            <SummaryCard
              label={t('captured_data.summary.active_flow', 'Active flow')}
              value={currentFlowLabel}
              description={t('captured_data.summary.active_flow_description', 'Use the filter below to focus on one automation flow.')}
              icon={ActiveFlowSummaryIcon}
            />
            <SummaryCard
              label={t('captured_data.summary.current_page', 'Current page')}
              value={`${currentPage} / ${Math.max(totalPages, 1)}`}
              description={t('captured_data.summary.per_page', '{{count}} submissions per page.', { count: pageSize })}
              icon={Eye}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            <div className="flex flex-wrap items-end gap-2 sm:gap-4">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{t('captured_data.filter.flow', 'Flow')}</Label>
                <Select
                  value={selectedFlowId}
                  onValueChange={(value) => {
                    setSelectedFlowId(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger data-tour="components-captured-data-captureddatadashboard.selecttrigger.captured_data.filter.flow_aria"
                    className="h-9 w-[180px] sm:w-[200px]"
                    aria-label={t('captured_data.filter.flow_aria', 'Filter by flow')}
                    disabled={flowsLoading || flowsIsError}
                  >
                    <SelectValue placeholder={t('captured_data.all_flows', 'All Flows')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('captured_data.all_flows', 'All Flows')}</SelectItem>
                    {flowsData.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id.toString()}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="captured-data-start-date" className="text-xs text-muted-foreground">
                  {t('captured_data.filter.start_date', 'Start date')}
                </Label>
                <Input data-tour="components-captured-data-captureddatadashboard.input.captured-data-start-date"
                  id="captured-data-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'h-9 w-[140px] sm:w-[150px]',
                    dateRangeInvalid && 'border-destructive focus-visible:ring-destructive'
                  )}
                  aria-invalid={dateRangeInvalid}
                  aria-describedby={dateRangeInvalid ? 'date-range-error' : undefined}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="captured-data-end-date" className="text-xs text-muted-foreground">
                  {t('captured_data.filter.end_date', 'End date')}
                </Label>
                <Input data-tour="components-captured-data-captureddatadashboard.input.captured-data-end-date"
                  id="captured-data-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'h-9 w-[140px] sm:w-[150px]',
                    dateRangeInvalid && 'border-destructive focus-visible:ring-destructive'
                  )}
                  aria-invalid={dateRangeInvalid}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button data-tour="components-captured-data-captureddatadashboard.button.common.export"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={openExportModal}
                aria-label={t('common.export', 'Export')}
              >
                <Download className="h-4 w-4" />
                {t('common.export', 'Export')}
              </Button>
              {(hasActiveFilter || hasDateFilter) && (
                <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.clear_filters" variant="ghost" size="sm" className="h-9 w-fit" onClick={clearFilter}>
                  {t('captured_data.clear_filters', 'Clear filters')}
                </Button>
              )}
            </div>
          </div>

          {dateRangeInvalid && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('captured_data.invalid_date_range', 'Invalid date range')}</AlertTitle>
              <AlertDescription id="date-range-error">
                {t('captured_data.invalid_date_range_desc', 'Start date must be on or before end date. Please adjust your selection.')}
              </AlertDescription>
            </Alert>
          )}

          {flowsIsError && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('captured_data.flows_unavailable', 'Flow filters are temporarily unavailable')}</AlertTitle>
              <AlertDescription>
                {(flowsError as Error | undefined)?.message || t('captured_data.flows_unavailable_desc', 'You can still review captured submissions, but flow filtering could not be loaded.')}
              </AlertDescription>
            </Alert>
          )}

          {submissionsIsError && submissionsData && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('captured_data.results_out_of_date', 'Results may be out of date')}</AlertTitle>
              <AlertDescription>
                {(submissionsError as Error | undefined)?.message || t('captured_data.refresh_failed', 'The latest captured data could not be refreshed.')}
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold">{t('captured_data.submission_list', 'Submission list')}</CardTitle>
              <CardDescription>
                {submissions.length === 0
                  ? hasActiveFilter
                    ? hasDateFilter
                      ? t('captured_data.empty_date_range', 'No submissions match the selected date range{{suffix}}.', { suffix: selectedFlowId !== 'all' ? ` for ${currentFlowLabel}` : '' })
                      : t('captured_data.empty_flow', 'No submissions were found for {{flow}}.', { flow: currentFlowLabel })
                    : t('captured_data.empty_default', 'Captured submissions will appear here as contacts share data through your flows.')
                  : t('captured_data.showing_submissions', 'Showing {{start}}-{{end}} of {{total}} submissions{{flowSuffix}}{{dateSuffix}}.', {
                      start: range.start,
                      end: range.end,
                      total: totalSubmissions.toLocaleString(),
                      flowSuffix: hasActiveFilter ? ` for ${currentFlowLabel}` : '',
                      dateSuffix: hasDateFilter ? ' in date range' : '',
                    })}
              </CardDescription>
            </div>

            {submissionsFetching && !submissionsLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('captured_data.updating', 'Updating results…')}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {submissions.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 px-6 py-12 text-center">
              <div className="rounded-full border bg-background p-3 text-muted-foreground shadow-sm">
                <InboxConversationIcon className="h-6 w-6" />
              </div>
              <div className="mt-4 space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {hasActiveFilter
                    ? hasDateFilter
                      ? t('captured_data.empty_title_filters', 'No submissions match the selected filters')
                      : t('captured_data.empty_title_flow', 'No submissions match this flow yet')
                    : t('captured_data.empty_title_default', 'No captured submissions yet')}
                </h3>
                <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                  {hasActiveFilter
                    ? hasDateFilter
                      ? t('captured_data.empty_hint_filters', 'Try adjusting the date range or flow filter, or clear the filters to see all submissions.')
                      : t('captured_data.empty_hint_flow', 'Try a different flow or clear the filter to review submissions from the rest of your automations.')
                    : t('captured_data.empty_hint_default', 'Once a contact reaches a data capture step in one of your flows, the submitted values will show up here for easy review.')}
                </p>
              </div>

              {hasActiveFilter && (
                <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.clear_all_filters" variant="outline" className="mt-5" onClick={clearFilter}>
                  {t('captured_data.clear_all_filters', 'Clear all filters')}
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table data-tour="components-captured-data-captureddatadashboard.table.captured_data.table_caption">
                <TableCaption>
                  {t('captured_data.table_caption', 'Captured submissions are shown newest-to-oldest according to the current server response.')}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">{t('captured_data.table.contact', 'Contact')}</TableHead>
                    <TableHead className="min-w-[180px]">{t('captured_data.table.flow', 'Flow')}</TableHead>
                    <TableHead className="min-w-[240px]">{t('captured_data.table.captured_fields', 'Captured fields')}</TableHead>
                    <TableHead className="min-w-[190px]">{t('captured_data.table.submitted', 'Submitted')}</TableHead>
                    <TableHead className="text-right">{t('captured_data.table.actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => {
                    const fieldCount = countCapturedDataFields(submission.capturedFields);
                    const fieldPreview = buildCapturedDataFieldPreview(submission.capturedFields, 2, t);
                    const additionalFieldCount = Math.max(fieldCount - fieldPreview.length, 0);

                    return (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">
                              {submission.contactName || t('captured_data.unknown_contact', 'Unknown contact')}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('captured_data.submission_id', 'Submission #{{id}}', { id: submission.id })}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="max-w-full truncate align-middle">
                            {submission.flowName || t('captured_data.unknown_flow', 'Unknown flow')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">
                              {fieldCount} {fieldCount === 1 ? t('captured_data.field_singular', 'field') : t('captured_data.field_plural', 'fields')}
                            </div>
                            <div className="text-xs leading-5 text-muted-foreground">
                              {fieldPreview.length > 0
                                ? `${fieldPreview.join(' • ')}${additionalFieldCount > 0 ? ` +${additionalFieldCount} ${t('captured_data.more', 'more')}` : ''}`
                                : t('captured_data.no_fields_saved', 'No captured fields were saved for this submission.')}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatCapturedDataTimestamp(submission.submittedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.view_details" variant="outline" size="sm" onClick={() => openDetails(submission)} aria-label={t('captured_data.view_details', 'View details')}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <ExportFormatMenu
                              size="icon"
                              hideLabel
                              loading={isExporting}
                              onExport={(format) => exportCapturedData(format, submission.id)}
                            />
                            <PermissionGate permissions={[PERMISSIONS.MANAGE_CAPTURED_DATA]}>
                              <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.delete_submission"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setSubmissionToDelete(submission)}
                                aria-label={t('captured_data.delete_submission', 'Delete submission')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {pagination && submissions.length > 0 && (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {t('captured_data.pagination.showing', 'Showing {{start}}-{{end}} of {{total}} submissions', {
                  start: range.start,
                  end: range.end,
                  total: totalSubmissions.toLocaleString(),
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="text-sm text-muted-foreground">
                  {t('captured_data.pagination.page', 'Page {{current}} of {{total}}', {
                    current: currentPage,
                    total: Math.max(totalPages, 1),
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.pagination.prev_aria"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label={t('captured_data.pagination.prev_aria', 'Go to previous page')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('captured_data.pagination.previous', 'Previous')}
                  </Button>
                  <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.pagination.next_aria"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    aria-label={t('captured_data.pagination.next_aria', 'Go to next page')}
                  >
                    {t('captured_data.pagination.next', 'Next')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isExportModalOpen}
        onOpenChange={(open) => !isExporting && setIsExportModalOpen(open)}
      >
        <DialogContent data-tour="components-captured-data-captureddatadashboard.dialogcontent.common.export" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {t('common.export', 'Export')}
            </DialogTitle>
            <DialogDescription>
              {t('captured_data.export_modal.description', 'Choose which flow, date range, and file format to export. The file will include submission ID, contact, flow, submitted date, and all captured fields.')}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="export-flow">{t('captured_data.filter.flow', 'Flow')}</Label>
              <Select value={exportFlowId} onValueChange={setExportFlowId}>
                <SelectTrigger data-tour="components-captured-data-captureddatadashboard.selecttrigger.captured_data.export_modal.select_flow" id="export-flow" disabled={flowsLoading || flowsIsError}>
                  <SelectValue placeholder={t('captured_data.export_modal.select_flow', 'Select flow')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('captured_data.all_flows', 'All flows')}</SelectItem>
                  {flowsData.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id.toString()}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('captured_data.export_modal.flow_help', 'Export submissions from a specific flow or all flows.')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="export-start-date">{t('captured_data.filter.start_date', 'Start date')}</Label>
                <Input data-tour="components-captured-data-captureddatadashboard.input.export-start-date"
                  id="export-start-date"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className={cn(exportModalDateInvalid && 'border-destructive')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-end-date">{t('captured_data.filter.end_date', 'End date')}</Label>
                <Input data-tour="components-captured-data-captureddatadashboard.input.export-end-date"
                  id="export-end-date"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className={cn(exportModalDateInvalid && 'border-destructive')}
                />
              </div>
            </div>
            {exportModalDateInvalid && (
              <p className="text-sm text-destructive">
                {t('captured_data.invalid_date_range_desc', 'Start date must be on or before end date.')}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {t('captured_data.export_modal.dates_help', 'Leave dates empty to export all submissions. Maximum 5,000 rows per export.')}
            </p>
            <div className="space-y-2">
              <Label htmlFor="captured-data-export-format">{t('common.format', 'Format')}</Label>
              <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as DownloadExportFormat)}>
                <SelectTrigger data-tour="components-captured-data-captureddatadashboard.selecttrigger.captured-data-export-format" id="captured-data-export-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">{t('common.csv', 'CSV')}</SelectItem>
                  <SelectItem value="xlsx">{t('common.excel', 'Microsoft Excel (.xlsx)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button data-tour="components-captured-data-captureddatadashboard.button.common.cancel"
              variant="outline"
              onClick={() => setIsExportModalOpen(false)}
              disabled={isExporting}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-captured-data-captureddatadashboard.button.captured_data.exporting" onClick={() => exportCapturedData(exportFormat)} disabled={isExporting || exportModalDateInvalid}>
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('captured_data.exporting', 'Exporting…')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t('captured_data.export', 'Export')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!submissionToDelete}
        onOpenChange={(open) => !open && setSubmissionToDelete(null)}
        onConfirm={handleDeleteSubmission}
        title={t('captured_data.delete_submission', 'Delete submission')}
        description={
          submissionToDelete
            ? t('captured_data.delete_confirm_desc', 'Are you sure you want to delete this submission from {{name}}? This action cannot be undone.', {
                name: submissionToDelete.contactName || t('captured_data.unknown_contact', 'Unknown contact'),
              })
            : undefined
        }
        isLoading={isDeleting}
      />

      <Dialog open={isDetailsOpen} onOpenChange={(open) => (open ? setIsDetailsOpen(true) : closeDetails())}>
        <DialogContent data-tour="components-captured-data-captureddatadashboard.dialogcontent.captured_data.submission_details" className="max-w-3xl" contentNoScroll>
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="w-fit text-xs">
                {selectedSubmission?.flowName || t('captured_data.captured_submission', 'Captured submission')}
              </Badge>
              <DialogTitle className="text-lg font-semibold">{t('captured_data.submission_details', 'Submission details')}</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              {t('captured_data.details_description', 'Contact, submission time, and captured fields.')}
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/15 p-3">
                  <p className="text-xs font-medium text-muted-foreground">{t('captured_data.table.contact', 'Contact')}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {selectedSubmission.contactName || t('captured_data.unknown_contact', 'Unknown contact')}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/15 p-3">
                  <p className="text-xs font-medium text-muted-foreground">{t('captured_data.table.submitted', 'Submitted')}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatCapturedDataTimestamp(selectedSubmission.submittedAt)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/15 p-3">
                  <p className="text-xs font-medium text-muted-foreground">{t('captured_data.fields_captured', 'Fields captured')}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {selectedSubmissionEntries.length}
                  </p>
                </div>
              </div>

              <Separator />

              {selectedSubmissionEntries.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/15 px-4 py-8 text-center">
                  <div className="rounded-full border bg-background p-2 text-muted-foreground shadow-sm">
                    <Database className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{t('captured_data.no_fields_captured', 'No fields were captured')}</h3>
                  <p className="mt-1.5 max-w-lg text-xs leading-5 text-muted-foreground">
                    {t('captured_data.no_fields_captured_desc', 'This submission has no stored field values.')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">{t('captured_data.table.captured_fields', 'Captured fields')}</p>
                    <Badge variant="outline" className="text-xs">{selectedSubmissionEntries.length} {t('captured_data.field_plural', 'fields')}</Badge>
                  </div>

                  <ScrollArea className="h-[360px] pr-4">
                    <div className="space-y-2">
                      {selectedSubmissionEntries.map(([key, value]) => {
                        const label = formatCapturedDataFieldLabel(key, t);
                        const isStructuredValue =
                          typeof value === 'object' && value !== null && !isCapturedMediaFieldValue(value);

                        return (
                          <div key={key} className="rounded-lg border bg-muted/10 p-3">
                            <div className="grid gap-2 md:grid-cols-[minmax(0,200px)_1fr] md:items-start">
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium text-foreground">{label}</p>
                                {label !== key && (
                                  <p className="font-mono text-[11px] text-muted-foreground">{key}</p>
                                )}
                              </div>
                              <div
                                className={cn(
                                  'whitespace-pre-wrap break-words text-sm leading-5 text-foreground',
                                  isStructuredValue && 'rounded-md bg-muted/40 p-2 font-mono text-xs leading-5',
                                )}
                              >
                                <CapturedFieldValueDisplay value={value} t={t} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

