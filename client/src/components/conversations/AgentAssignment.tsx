import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserMinus, UserPlus, Users } from 'lucide-react';
import React, { useMemo, useState } from 'react';

interface Agent {
  id: number;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
  username: string;
  isAvailable?: boolean;
  availabilityReason?: 'company_disabled' | 'off_duty' | 'outside_hours' | 'schedule_disabled';
  isOnDuty?: boolean;
}

interface AgentAssignmentProps {
  conversationId: number;
  currentAssignedUserId?: number | null;
  onAssignmentChange?: (agentId: number | null) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'button' | 'badge' | 'compact';
}

export default function AgentAssignment({
  conversationId,
  currentAssignedUserId,
  onAssignmentChange,
  variant = 'button'
}: AgentAssignmentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingOverrideAgent, setPendingOverrideAgent] = useState<Agent | null>(null);
  const { canAssignConversations } = usePermissions();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading: isLoadingAgents, error: agentsError } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/agents');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(t('agents.fetch_failed', `Failed to fetch agents: ${response.status} ${errorText}`));
      }
      const data = await response.json();
      return data;
    },
    retry: 1,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const aAvailable = a.isAvailable !== false || a.id === currentAssignedUserId ? 1 : 0;
      const bAvailable = b.isAvailable !== false || b.id === currentAssignedUserId ? 1 : 0;
      if (aAvailable !== bAvailable) {
        return bAvailable - aAvailable;
      }
      return a.fullName.localeCompare(b.fullName);
    });
  }, [agents, currentAssignedUserId]);

  const assignMutation = useMutation({
    mutationFn: async ({ agentId, forceAssign }: { agentId: number | null; forceAssign?: boolean }) => {
      if (agentId) {
        const response = await apiRequest('POST', `/api/conversations/${conversationId}/assign`, {
          agentId,
          forceAssign: forceAssign === true,
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || t('agents.assign_failed', 'Failed to assign conversation'));
        }
        return response.json();
      }

      const response = await apiRequest('DELETE', `/api/conversations/${conversationId}/assign`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('agents.unassign_failed', 'Failed to unassign conversation'));
      }
      return response.json();
    },
    onSuccess: (_, { agentId }) => {
      const agentName = agentId ? agents.find(a => a.id === agentId)?.fullName : null;

      toast({
        title: agentId ? t('agents.assigned_title', 'Conversation Assigned') : t('agents.unassigned_title', 'Conversation Unassigned'),
        description: agentId
          ? t('agents.assigned_description', `Conversation assigned to ${agentName}`, { agentName })
          : t('agents.unassigned_description', 'Conversation has been unassigned'),
      });

      onAssignmentChange?.(agentId);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setPendingOverrideAgent(null);
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: t('agents.assignment_failed_title', 'Assignment Failed'),
        description: error.message || t('agents.assignment_failed_description', 'Failed to update assignment'),
        variant: 'destructive',
      });
    }
  });

  if (!canAssignConversations()) {
    return null;
  }

  const assignedAgent = agents.find(agent => agent.id === currentAssignedUserId);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvailabilityLabel = (agent: Agent) => {
    if (agent.isAvailable !== false || agent.id === currentAssignedUserId) {
      return null;
    }
    if (agent.availabilityReason === 'off_duty') {
      return t('inbox_availability.off_duty', 'Off duty');
    }
    return t('inbox_availability.outside_hours', 'Outside hours');
  };

  const handleAssign = (agentId: number | null) => {
    if (!agentId) {
      assignMutation.mutate({ agentId: null });
      return;
    }

    const agent = agents.find((row) => row.id === agentId);
    if (agent && agent.isAvailable === false && agent.id !== currentAssignedUserId) {
      setPendingOverrideAgent(agent);
      return;
    }

    assignMutation.mutate({ agentId });
  };

  const renderAgentItems = () => (
    <>
      {sortedAgents.map((agent) => {
        const availabilityLabel = getAvailabilityLabel(agent);
        const isUnavailable = availabilityLabel != null;

        return (
          <DropdownMenuItem
            key={agent.id}
            onClick={() => handleAssign(agent.id)}
            disabled={assignMutation.isPending}
            className={`flex items-center ${isUnavailable ? 'opacity-60' : ''}`}
          >
            <Avatar className="w-6 h-6 mr-2">
              <AvatarImage src={agent.avatarUrl ?? undefined} />
              <AvatarFallback className="text-xs">
                {getInitials(agent.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{agent.fullName}</div>
              <div className="text-xs text-muted-foreground capitalize">{agent.role}</div>
            </div>
            {availabilityLabel && (
              <Badge variant="outline" className="ml-2 shrink-0 text-[10px]">
                {availabilityLabel}
              </Badge>
            )}
            {agent.id === currentAssignedUserId && (
              <Check className="w-4 h-4 text-green-600 ml-2 shrink-0" />
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );

  const renderAgentMenuBody = (showUnassign: boolean) => {
    if (isLoadingAgents) {
      return (
        <DropdownMenuItem disabled>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {t('agents.loading_agents', 'Loading agents...')}
        </DropdownMenuItem>
      );
    }

    if (agentsError) {
      return (
        <DropdownMenuItem disabled>
          <Users className="w-4 h-4 mr-2" />
          {t('agents.error_loading_agents', 'Error loading agents')}
        </DropdownMenuItem>
      );
    }

    if (agents.length === 0) {
      return (
        <DropdownMenuItem disabled>
          <Users className="w-4 h-4 mr-2" />
          {t('agents.no_agents_available', 'No agents available')}
        </DropdownMenuItem>
      );
    }

    return (
      <>
        {renderAgentItems()}
        {showUnassign && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleAssign(null)}
              disabled={assignMutation.isPending}
              className="text-red-600"
            >
              <UserMinus className="w-4 h-4 mr-2" />
              {t('agents.unassign', 'Unassign')}
            </DropdownMenuItem>
          </>
        )}
      </>
    );
  };

  const overrideDialog = (
    <AlertDialog open={pendingOverrideAgent != null} onOpenChange={(open) => !open && setPendingOverrideAgent(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('agents.assign_unavailable_title', 'Assign unavailable agent?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'agents.assign_unavailable_description',
              '{{name}} is not currently available for inbox assignments. Assign anyway?',
              { name: pendingOverrideAgent?.fullName ?? '' }
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingOverrideAgent) {
                assignMutation.mutate({ agentId: pendingOverrideAgent.id, forceAssign: true });
              }
            }}
          >
            {t('agents.assign_anyway', 'Assign anyway')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (variant === 'badge') {
    if (assignedAgent) {
      return (
        <>
          <div className="agent-assignment-dropdown">
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent cursor-pointer transition-colors"
                >
                  <Avatar className="w-4 h-4 mr-1">
                    <AvatarImage src={assignedAgent.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(assignedAgent.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  {assignedAgent.fullName}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>{t('agents.reassign_conversation', 'Reassign Conversation')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {renderAgentMenuBody(true)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {overrideDialog}
        </>
      );
    }

    return (
      <>
        <div className="agent-assignment-dropdown">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <button data-tour="components-conversations-agentassignment.button.agents.unassigned"
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-border bg-background text-foreground hover:bg-accent cursor-pointer transition-colors"
              >
                <UserPlus className="w-3 h-3 mr-1" />
                {t('agents.unassigned', 'Unassigned')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t('agents.assign_conversation', 'Assign Conversation')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {renderAgentMenuBody(false)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {overrideDialog}
      </>
    );
  }

  return (
    <>
      <div className="agent-assignment-dropdown">
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button data-tour="components-conversations-agentassignment.button.agents.assign"
              variant={assignedAgent ? 'secondary' : 'outline'}
              disabled={assignMutation.isPending}
              className="flex items-center gap-2"
            >
              {assignMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : assignedAgent ? (
                <>
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={assignedAgent.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(assignedAgent.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{assignedAgent.fullName}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('agents.assign', 'Assign')}</span>
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              {assignedAgent
                ? t('agents.reassign_conversation', 'Reassign Conversation')
                : t('agents.assign_conversation', 'Assign Conversation')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {renderAgentMenuBody(!!assignedAgent)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {overrideDialog}
    </>
  );
}
