import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PipelineStage } from '@shared/schema';
import { isMessageTriggerNode } from '@shared/types/node-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  useStageBotAssignments,
  useAssignStageBot,
  useClearStageBotAssignment,
  STAGE_BOT_ASSIGN_FAILED_FALLBACK,
  STAGE_BOT_CLEAR_FAILED_FALLBACK,
  type StageBotAssignment,
} from '@/hooks/use-pipeline';

interface StageBotAssignmentDialogProps {
  open: boolean;
  stage: PipelineStage | null;
  pipelineId: number | null;
  onOpenChange: (open: boolean) => void;
}

function parseFlowNodes(nodes: unknown): unknown[] {
  if (Array.isArray(nodes)) return nodes;
  if (typeof nodes === 'string') {
    try {
      const parsed = JSON.parse(nodes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function messageTriggerSupportsChannel(
  nodes: unknown[],
  channelType: string
): boolean {
  const triggerNode = nodes.find((n) =>
    isMessageTriggerNode(n as { type?: unknown; data?: unknown })
  ) as { data?: Record<string, unknown> } | undefined;
  if (!triggerNode?.data) return false;

  const supported = triggerNode.data.channelTypes ?? triggerNode.data.channels;
  if (!supported || (Array.isArray(supported) && supported.length === 0)) {
    return true;
  }
  if (typeof supported === 'string') return supported === channelType;
  if (Array.isArray(supported)) return supported.includes(channelType);
  return false;
}

function hasMessageTrigger(nodes: unknown[]): boolean {
  return nodes.some((n) => isMessageTriggerNode(n as { type?: unknown; data?: unknown }));
}

type StageBotTranslateFn = (
  key: string,
  fallback: string,
  params?: Record<string, string | number>
) => string;

const STAGE_BOT_API_ERROR_MESSAGES: Record<string, { key: string; fallback: string }> = {
  'Invalid stage ID': {
    key: 'pipeline.stage_bot.error.invalid_stage_id',
    fallback: 'Invalid stage ID',
  },
  'flowId and channelId are required': {
    key: 'pipeline.stage_bot.error.flow_channel_required',
    fallback: 'flowId and channelId are required',
  },
  'Pipeline stage not found': {
    key: 'pipeline.stage_bot.error.stage_not_found',
    fallback: 'Pipeline stage not found',
  },
  'Stage is not associated with a pipeline': {
    key: 'pipeline.stage_bot.error.stage_not_in_pipeline',
    fallback: 'Stage is not associated with a pipeline',
  },
  'Pipeline not found': {
    key: 'pipeline.stage_bot.error.pipeline_not_found',
    fallback: 'Pipeline not found',
  },
  'You do not have permission to access this pipeline': {
    key: 'pipeline.stage_bot.error.pipeline_access_denied',
    fallback: 'You do not have permission to access this pipeline',
  },
  'You do not have permission to assign this flow': {
    key: 'pipeline.stage_bot.error.flow_assign_denied',
    fallback: 'You do not have permission to assign this flow',
  },
  'Flow must be active before assigning from the pipeline board': {
    key: 'pipeline.stage_bot.error.flow_must_be_active_before_assign',
    fallback: 'Flow must be active before assigning from the pipeline board',
  },
  'Channel connection not found': {
    key: 'pipeline.stage_bot.error.channel_not_found',
    fallback: 'Channel connection not found',
  },
  'You do not have permission to assign flows to this channel': {
    key: 'pipeline.stage_bot.error.channel_assign_denied',
    fallback: 'You do not have permission to assign flows to this channel',
  },
  'Flow requires a Message Trigger node': {
    key: 'pipeline.stage_bot.error.requires_message_trigger',
    fallback: 'Flow requires a Message Trigger node',
  },
  'Message Trigger channel type does not match the selected channel': {
    key: 'pipeline.stage_bot.error.message_trigger_channel_mismatch',
    fallback: 'Message Trigger channel type does not match the selected channel',
  },
  'This unscoped flow cannot be activated while scoped stage bots are active on this channel': {
    key: 'pipeline.stage_bot.error.unscoped_blocked_by_scoped',
    fallback:
      'This unscoped flow cannot be activated while scoped stage bots are active on this channel',
  },
  'An unscoped catch-all flow is already active on this channel': {
    key: 'pipeline.stage_bot.error.unscoped_catch_all_active',
    fallback: 'An unscoped catch-all flow is already active on this channel',
  },
  'Another active flow already handles this pipeline stage on this channel': {
    key: 'pipeline.stage_bot.error.stage_already_handled',
    fallback: 'Another active flow already handles this pipeline stage on this channel',
  },
  'Message Trigger stage scope is incomplete or invalid': {
    key: 'pipeline.stage_bot.error.stage_scope_partial',
    fallback: 'Message Trigger stage scope is incomplete or invalid',
  },
  'Message Trigger pipeline not found': {
    key: 'pipeline.stage_bot.error.stage_scope_pipeline_not_found',
    fallback: 'Message Trigger pipeline not found',
  },
  'Message Trigger pipeline stage not found': {
    key: 'pipeline.stage_bot.error.stage_scope_stage_not_found',
    fallback: 'Message Trigger pipeline stage not found',
  },
  'Message Trigger pipeline stage does not belong to the selected pipeline': {
    key: 'pipeline.stage_bot.error.stage_scope_pipeline_mismatch',
    fallback: 'Message Trigger pipeline stage does not belong to the selected pipeline',
  },
  'Message Trigger pipeline stage does not belong to this company': {
    key: 'pipeline.stage_bot.error.stage_scope_company_mismatch',
    fallback: 'Message Trigger pipeline stage does not belong to this company',
  },
  'channelId is required': {
    key: 'pipeline.stage_bot.error.channel_id_required',
    fallback: 'channelId is required',
  },
  'You do not have permission to modify this channel assignment': {
    key: 'pipeline.stage_bot.error.channel_modify_denied',
    fallback: 'You do not have permission to modify this channel assignment',
  },
  'No active stage bot assignment found for this stage and channel': {
    key: 'pipeline.stage_bot.error.no_active_assignment',
    fallback: 'No active stage bot assignment found for this stage and channel',
  },
  [STAGE_BOT_ASSIGN_FAILED_FALLBACK]: {
    key: 'pipeline.stage_bot.error.assign_failed_fallback',
    fallback: STAGE_BOT_ASSIGN_FAILED_FALLBACK,
  },
  [STAGE_BOT_CLEAR_FAILED_FALLBACK]: {
    key: 'pipeline.stage_bot.error.clear_failed_fallback',
    fallback: STAGE_BOT_CLEAR_FAILED_FALLBACK,
  },
};

const STAGE_BOT_BLOCKING_REASON_MESSAGES: Record<string, { key: string; fallback: string }> = {
  'An unscoped catch-all flow is already active on this channel': {
    key: 'pipeline.stage_bot.blocking_reason.unscoped_catch_all_active',
    fallback: 'An unscoped catch-all flow is already active on this channel',
  },
};

function translateStageBotApiMessage(message: string, t: StageBotTranslateFn): string {
  const exact = STAGE_BOT_API_ERROR_MESSAGES[message];
  if (exact) {
    return t(exact.key, exact.fallback);
  }

  const alreadyActiveOnMatch = message.match(
    /^This flow is already active on (.+)\. A flow can only be assigned to one channel at a time\.$/
  );
  if (alreadyActiveOnMatch) {
    return t(
      'pipeline.stage_bot.error.already_active_on_channel',
      message,
      { channelLabel: alreadyActiveOnMatch[1] }
    );
  }

  const alreadyAssignedToMatch = message.match(
    /^This flow is already assigned to (.+)\. A flow can only be assigned to one channel at a time\.$/
  );
  if (alreadyAssignedToMatch) {
    return t(
      'pipeline.stage_bot.error.already_assigned_to_channel',
      message,
      { channelLabel: alreadyAssignedToMatch[1] }
    );
  }

  const flowNotFoundMatch = message.match(/^Flow with id (\d+) not found$/);
  if (flowNotFoundMatch) {
    return t('pipeline.stage_bot.error.flow_not_found', message, {
      flowId: flowNotFoundMatch[1],
    });
  }

  const channelNotFoundMatch = message.match(/^Channel with id (\d+) not found$/);
  if (channelNotFoundMatch) {
    return t('pipeline.stage_bot.error.channel_id_not_found', message, {
      channelId: channelNotFoundMatch[1],
    });
  }

  return message;
}

function translateStageBotBlockingReason(reason: string, t: StageBotTranslateFn): string {
  const exact = STAGE_BOT_BLOCKING_REASON_MESSAGES[reason];
  if (exact) {
    return t(exact.key, exact.fallback);
  }
  return reason;
}

export default function StageBotAssignmentDialog({
  open,
  stage,
  pipelineId,
  onOpenChange,
}: StageBotAssignmentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');

  const translateStageBotError = (message: string): string =>
    translateStageBotApiMessage(message, t);

  const { data: stageBotData, isLoading: isLoadingAssignments } = useStageBotAssignments(
    open ? pipelineId : null
  );
  const { data: channels = [], isLoading: isLoadingChannels } = useChannelConnections();

  const { data: flows = [], isLoading: isLoadingFlows } = useQuery({
    queryKey: ['/api/flows'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/flows');
      return res.json();
    },
    enabled: open,
  });

  const flowIdsKey = useMemo(
    () => (flows as Array<{ id: number }>).map((f) => f.id).sort((a, b) => a - b).join(','),
    [flows]
  );

  const { data: assignmentsByFlowId = new Map<number, Array<{ channelId: number; isActive: boolean }>>() } =
    useQuery({
      queryKey: ['/api/flow-assignments', 'stage-bot-dialog', flowIdsKey],
      queryFn: async () => {
        const flowList = flows as Array<{ id: number }>;
        const map = new Map<number, Array<{ channelId: number; isActive: boolean }>>();
        await Promise.all(
          flowList.map(async (flow) => {
            const res = await apiRequest('GET', `/api/flow-assignments?flowId=${flow.id}`);
            if (res.ok) {
              const data = await res.json();
              map.set(flow.id, data);
            }
          })
        );
        return map;
      },
      enabled: open && (flows as unknown[]).length > 0,
    });

  const assignMutation = useAssignStageBot(pipelineId);
  const clearMutation = useClearStageBotAssignment(pipelineId);

  const currentAssignment: StageBotAssignment | undefined = useMemo(() => {
    if (!stage || !stageBotData?.assignments) return undefined;
    return stageBotData.assignments.find(
      (a) => a.stageId === stage.id && a.isActive
    );
  }, [stage, stageBotData]);

  useEffect(() => {
    if (!open) {
      setSelectedChannelId('');
      setSelectedFlowId('');
      return;
    }
    if (currentAssignment) {
      setSelectedChannelId(String(currentAssignment.channelId));
      setSelectedFlowId(String(currentAssignment.flowId));
    }
  }, [open, currentAssignment?.channelId, currentAssignment?.flowId]);

  const selectedChannel = channels.find((c) => String(c.id) === selectedChannelId);

  const channelBlocker = useMemo(() => {
    if (!selectedChannelId || !stageBotData?.channelBlockers) return undefined;
    return stageBotData.channelBlockers.find(
      (b) => String(b.channelId) === selectedChannelId
    );
  }, [selectedChannelId, stageBotData]);

  const stageConflict = useMemo(() => {
    if (!stage || !selectedChannelId || !stageBotData?.assignments) return undefined;
    return stageBotData.assignments.find(
      (a) =>
        a.stageId === stage.id &&
        a.isActive &&
        String(a.channelId) === selectedChannelId &&
        String(a.flowId) !== selectedFlowId
    );
  }, [stage, selectedChannelId, selectedFlowId, stageBotData]);

  const flowEligibility = useMemo(() => {
    return (flows as Array<{ id: number; name: string; status: string; nodes?: unknown }>).map(
      (flow) => {
        const nodes = parseFlowNodes(flow.nodes);
        const reasons: string[] = [];

        if (flow.status !== 'active') {
          reasons.push(
            t('pipeline.stage_bot.validation.flow_must_be_active', 'Flow must be active.')
          );
        }
        if (!hasMessageTrigger(nodes)) {
          reasons.push(
            t('pipeline.stage_bot.validation.requires_message_trigger', 'Requires a Message Trigger.')
          );
        }
        if (selectedChannel && !messageTriggerSupportsChannel(nodes, selectedChannel.channelType)) {
          reasons.push(
            t(
              'pipeline.stage_bot.validation.channel_mismatch',
              'Channel type does not match Message Trigger.'
            )
          );
        }

        const flowAssignments = assignmentsByFlowId.get(flow.id) ?? [];
        const activeOnOtherChannel = flowAssignments.find(
          (a) =>
            a.isActive &&
            selectedChannelId &&
            String(a.channelId) !== selectedChannelId
        );
        if (activeOnOtherChannel) {
          const otherChannel = channels.find((c) => c.id === activeOnOtherChannel.channelId);
          const channelLabel = otherChannel
            ? `${otherChannel.accountName} (${otherChannel.channelType})`
            : t('pipeline.stage_bot.validation.channel_id_fallback', 'channel {{channelId}}', {
                channelId: activeOnOtherChannel.channelId,
              });
          reasons.push(
            t('pipeline.stage_bot.validation.already_active_on', 'Already active on {{channelLabel}}.', {
              channelLabel,
            })
          );
        }

        return {
          flow,
          disabled: reasons.length > 0,
          reasons,
        };
      }
    );
  }, [flows, selectedChannel, selectedChannelId, assignmentsByFlowId, channels, t]);

  const selectedFlowEntry = flowEligibility.find(
    (e) => String(e.flow.id) === selectedFlowId
  );

  const saveBlockedReason = useMemo(() => {
    if (channelBlocker) {
      return t(
        'pipeline.stage_bot.validation.channel_blocked',
        'Channel blocked: {{flowName}} is an active unscoped catch-all ({{reason}}).',
        {
          flowName: channelBlocker.flowName,
          reason: translateStageBotBlockingReason(channelBlocker.blockingReason, t),
        }
      );
    }
    if (stageConflict) {
      return t(
        'pipeline.stage_bot.validation.stage_conflict',
        'Stage already has active flow "{{flowName}}" on this channel.',
        { flowName: stageConflict.flowName }
      );
    }
    if (!selectedChannelId || !selectedFlowId) {
      return t(
        'pipeline.stage_bot.validation.select_channel_and_flow',
        'Select a channel and flow.'
      );
    }
    if (selectedFlowEntry?.disabled) {
      return selectedFlowEntry.reasons.join(' ');
    }
    return null;
  }, [channelBlocker, stageConflict, selectedChannelId, selectedFlowId, selectedFlowEntry, t]);

  const handleSave = async () => {
    if (!stage || saveBlockedReason) return;
    try {
      await assignMutation.mutateAsync({
        stageId: stage.id,
        flowId: parseInt(selectedFlowId, 10),
        channelId: parseInt(selectedChannelId, 10),
      });
      toast({
        title: t('pipeline.stage_bot.toast.assigned_title', 'Bot assigned'),
        description: t(
          'pipeline.stage_bot.toast.assigned_description',
          'Stage bot assignment saved successfully.'
        ),
      });
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? translateStageBotError(error.message)
          : t('common.something_went_wrong', 'Something went wrong');
      toast({
        title: t('pipeline.stage_bot.toast.assignment_failed_title', 'Assignment failed'),
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleClear = async () => {
    if (!stage || !currentAssignment) return;
    try {
      await clearMutation.mutateAsync({
        stageId: stage.id,
        channelId: currentAssignment.channelId,
      });
      toast({
        title: t('pipeline.stage_bot.toast.cleared_title', 'Assignment cleared'),
        description: t(
          'pipeline.stage_bot.toast.cleared_description',
          'Stage bot assignment removed.'
        ),
      });
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? translateStageBotError(error.message)
          : t('common.something_went_wrong', 'Something went wrong');
      toast({
        title: t('pipeline.stage_bot.toast.clear_failed_title', 'Clear failed'),
        description: message,
        variant: 'destructive',
      });
    }
  };

  const isLoading = isLoadingAssignments || isLoadingChannels || isLoadingFlows;
  const isSaving = assignMutation.isPending || clearMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-pipeline-stagebotassignmentdialog.dialogcontent.pipeline.stage_bot.dialog.title" className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('pipeline.stage_bot.dialog.title', 'Assign Bot or Flow')}</DialogTitle>
          <DialogDescription>
            {stage
              ? t(
                  'pipeline.stage_bot.dialog.description_with_stage',
                  'Choose a channel and active flow for stage "{{stageName}}".',
                  { stageName: stage.name }
                )
              : t(
                  'pipeline.stage_bot.dialog.description_default',
                  'Select a channel and flow for this stage.'
                )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Alert>
              <AlertDescription className="text-xs">
                {t(
                  'pipeline.stage_bot.unassigned_hint',
                  'Unassigned stages do not force a bot. Existing unscoped flows keep their current behavior.'
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>{t('pipeline.stage_bot.channel_label', 'Channel')}</Label>
              <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                <SelectTrigger data-tour="components-pipeline-stagebotassignmentdialog.selecttrigger.pipeline.stage_bot.channel_placeholder">
                  <SelectValue placeholder={t('pipeline.stage_bot.channel_placeholder', 'Select channel')} />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={String(channel.id)}>
                      {channel.accountName} ({channel.channelType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('pipeline.stage_bot.flow_label', 'Flow')}</Label>
              <Select
                value={selectedFlowId}
                onValueChange={setSelectedFlowId}
                disabled={!selectedChannelId}
              >
                <SelectTrigger data-tour="components-pipeline-stagebotassignmentdialog.selecttrigger.pipeline.stage_bot.flow_placeholder">
                  <SelectValue
                    placeholder={
                      selectedChannelId
                        ? t('pipeline.stage_bot.flow_placeholder', 'Select flow')
                        : t('pipeline.stage_bot.select_channel_first', 'Select channel first')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {flowEligibility.map(({ flow, disabled, reasons }) => (
                    <SelectItem
                      key={flow.id}
                      value={String(flow.id)}
                      disabled={disabled}
                    >
                      <span className="flex flex-col">
                        <span>{flow.name}</span>
                        {disabled && (
                          <span className="text-xs text-muted-foreground">{reasons.join(' ')}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {saveBlockedReason && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{saveBlockedReason}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {currentAssignment && (
            <Button data-tour="components-pipeline-stagebotassignmentdialog.button.pipeline.stage_bot.clear_assignment"
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={isSaving || isLoading}
            >
              {t('pipeline.stage_bot.clear_assignment', 'Clear assignment')}
            </Button>
          )}
          <Button data-tour="components-pipeline-stagebotassignmentdialog.button.common.cancel"
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-pipeline-stagebotassignmentdialog.button.pipeline.stage_bot.save_assignment"
            type="button"
            onClick={handleSave}
            disabled={!!saveBlockedReason || isSaving || isLoading}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('pipeline.stage_bot.save_assignment', 'Save assignment')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
