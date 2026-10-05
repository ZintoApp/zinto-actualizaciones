export { usePipeline } from '@/contexts/PipelineContext';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export type StageBotAssignment = {
  stageId: number;
  pipelineId: number;
  flowId: number;
  flowName: string;
  channelId: number;
  channelName: string;
  channelType: string;
  assignmentId: number;
  isActive: boolean;
  triggerStageScope: { pipelineId: number; stageId: number } | null;
};

export type StageBotChannelBlocker = {
  channelId: number;
  channelName: string;
  channelType: string;
  flowId: number;
  flowName: string;
  assignmentId: number;
  blockingReason: string;
};

export type StageBotAssignmentsResponse = {
  assignments: StageBotAssignment[];
  channelBlockers: StageBotChannelBlocker[];
};

export type StageBotAssignmentSummary = {
  flowName: string;
  channelName: string;
  channelId: number;
  flowId: number;
} | null;

function stageBotAssignmentsQueryKey(activePipelineId: number | null) {
  return ['/api/pipelines', activePipelineId, 'stage-bot-assignments'] as const;
}

export function useStageBotAssignments(activePipelineId: number | null) {
  return useQuery<StageBotAssignmentsResponse>({
    queryKey: stageBotAssignmentsQueryKey(activePipelineId),
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/pipelines/${activePipelineId}/stage-bot-assignments`
      );
      return res.json();
    },
    enabled: activePipelineId != null,
  });
}

function invalidateStageBotRelatedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  activePipelineId: number | null
) {
  queryClient.invalidateQueries({
    queryKey: stageBotAssignmentsQueryKey(activePipelineId),
  });
  queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
  queryClient.invalidateQueries({ queryKey: ['/api/flow-assignments'] });
}

export const STAGE_BOT_ASSIGN_FAILED_FALLBACK = 'Failed to assign bot to stage';
export const STAGE_BOT_CLEAR_FAILED_FALLBACK = 'Failed to clear stage bot assignment';

export function useAssignStageBot(activePipelineId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stageId,
      flowId,
      channelId,
    }: {
      stageId: number;
      flowId: number;
      channelId: number;
    }) => {
      const res = await apiRequest('PUT', `/api/pipeline/stages/${stageId}/bot-assignment`, {
        flowId,
        channelId,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || STAGE_BOT_ASSIGN_FAILED_FALLBACK);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateStageBotRelatedQueries(queryClient, activePipelineId);
    },
  });
}

export function useClearStageBotAssignment(activePipelineId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stageId,
      channelId,
    }: {
      stageId: number;
      channelId: number;
    }) => {
      const res = await apiRequest(
        'DELETE',
        `/api/pipeline/stages/${stageId}/bot-assignment?channelId=${channelId}`
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || STAGE_BOT_CLEAR_FAILED_FALLBACK);
      }
    },
    onSuccess: () => {
      invalidateStageBotRelatedQueries(queryClient, activePipelineId);
    },
  });
}
