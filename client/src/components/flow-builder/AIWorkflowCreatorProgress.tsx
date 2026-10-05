import { APP_ICONS } from '@/assets/icons';
import { BrainCircuit, Check, ChevronDown, Loader2, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import type {
  AiFlowCreatorProgressPhase,
  AiFlowCreatorProgressState,
} from '@shared/types/ai-flow-creator';
import {
  type AiFlowCreatorProgressEntry as CreatorProgressEntry,
  visibleCreatorProgressText,
} from '@shared/ai-flow-creator-progress';

const CREATOR_BOT_ICON = APP_ICONS.inboxBot;

export type { CreatorProgressEntry };

export type CreatorProgressTimeline = {
  id: string;
  generationId?: string;
  afterMessageId: string;
  entries: CreatorProgressEntry[];
  status: 'running' | 'complete' | 'failed' | 'stopped';
  expanded: boolean;
};

const PROGRESS_FALLBACKS: Record<AiFlowCreatorProgressPhase, { narrative: string; action: string }> = {
  starting: {
    narrative: "I’ll prepare the request and inspect the current workflow before making any changes.",
    action: 'Starting Workflow Creator',
  },
  model_adjusted: {
    narrative: 'I selected {{model}} because the attached images require a vision-capable model.',
    action: 'Selecting a compatible model',
  },
  preflight: {
    narrative: "I’m checking the current canvas and available AI credentials before planning the replacement workflow.",
    action: 'Inspecting the current workflow',
  },
  retrieval: {
    narrative: "I’m finding the verified native nodes and capabilities that can implement the requested outcome.",
    action: 'Reviewing native node capabilities',
  },
  planning: {
    narrative: "I’m designing the complete workflow, including its trigger, data path, branches, and final response.",
    action: 'Planning the native workflow',
  },
  building: {
    narrative: "The workflow plan is ready. I’m compiling its nodes, handles, mappings, connections, and layout.",
    action: 'Building and connecting nodes',
  },
  validating: {
    narrative: "I’m checking reachability, operations, handles, variables, mappings, and required setup against runtime rules.",
    action: 'Validating the generated workflow',
  },
  repairing: {
    narrative: "The previous draft needs a structural correction. I’m repairing only the invalid parts and validating it again.",
    action: 'Repairing the workflow · attempt {{attempt}}',
  },
  finalizing: {
    narrative: "The workflow is structurally valid. I’m preparing the preview, setup notes, and concise result summary.",
    action: 'Finalizing the workflow preview',
  },
};

function progressEntryText(entry: CreatorProgressEntry, t: ReturnType<typeof useTranslation>['t']): string {
  const fallback = PROGRESS_FALLBACKS[entry.phase][entry.kind];
  return t(entry.messageKey, fallback, entry.params);
}

function ActionIcon({ state }: { state: AiFlowCreatorProgressState }) {
  if (state === 'complete') return <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
  if (state === 'failed') return <X className="h-4 w-4 text-destructive" aria-hidden="true" />;
  return <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />;
}

export function AIWorkflowCreatorProgressTimeline({
  timeline,
  onExpandedChange,
}: {
  timeline: CreatorProgressTimeline;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const completedSteps = timeline.entries.filter((entry) => entry.kind === 'action' && entry.state === 'complete').length;
  const isTerminal = timeline.status !== 'running';
  const collapsedLabel = timeline.status === 'stopped'
    ? t('flow_builder.creator.progress.stopped', 'Generation stopped')
    : timeline.status === 'failed'
      ? t('flow_builder.creator.progress.failed', 'Workflow generation failed')
      : t('flow_builder.creator.progress.completed_summary', 'Workflow generated · {{count}} steps completed', { count: completedSteps });

  return (
    <Collapsible open={timeline.expanded} onOpenChange={onExpandedChange} className="rounded-2xl border border-border/70 bg-card/45 shadow-sm">
      {isTerminal && (
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span className="flex min-w-0 items-center gap-2.5">
            {timeline.status === 'complete'
              ? <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              : timeline.status === 'failed'
                ? <X className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                : <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />}
            <span className="truncate font-medium">{collapsedLabel}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', timeline.expanded && 'rotate-180')} aria-hidden="true" />
        </CollapsibleTrigger>
      )}
      <CollapsibleContent forceMount={timeline.status === 'running' ? true : undefined} className={cn('space-y-3 px-3.5 pb-3.5', !isTerminal && 'pt-3.5', isTerminal && !timeline.expanded && 'hidden')}>
        {timeline.entries.map((entry) => {
          const fullText = progressEntryText(entry, t);
          const displayedText = entry.kind === 'narrative'
            ? visibleCreatorProgressText(fullText, entry.chunkIndex, entry.chunkCount)
            : fullText;
          if (entry.kind === 'action') {
            return (
              <div key={entry.entryId} className={cn('ml-11 flex items-center gap-2 text-sm', entry.state === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                <ActionIcon state={entry.state} />
                <span className="italic">{displayedText}</span>
                {entry.state === 'active' && <ChevronDown className="ml-auto h-3.5 w-3.5 -rotate-90 text-muted-foreground" aria-hidden="true" />}
              </div>
            );
          }
          return (
            <div key={entry.entryId} className="flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/20 bg-primary/10">
                <img src={CREATOR_BOT_ICON} alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-1.5 text-xs italic text-muted-foreground"><BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />{t('flow_builder.creator.progress.label', 'Progress')}</div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" aria-live={entry.state === 'streaming' ? 'polite' : undefined}>
                  {displayedText}
                  {entry.state === 'streaming' && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-[-2px] motion-reduce:animate-none" aria-hidden="true" />}
                </p>
              </div>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
