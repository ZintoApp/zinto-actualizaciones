import { BotDisableNode } from './BotDisableNode';

interface EndConversationNodeProps {
  id: string;
  data: {
    label: string;
    disableDuration?: string;
    customDuration?: number;
    customDurationUnit?: string;
    triggerMethod?: string;
    keyword?: string;
    caseSensitive?: boolean;
    assignToAgent?: string;
    autoAssignAgentIds?: number[];
    notifyAgent?: boolean;
    handoffMessage?: string;
    notifyChannelId?: string;
    __hideAgentAssignment?: boolean;
  };
  isConnectable: boolean;
}

/**
 * Thin wrapper around BotDisableNode for ending a conversation.
 * Hides agent-assignment UI and supplies end-conversation defaults.
 */
export function EndConversationNode({ id, data, isConnectable }: EndConversationNodeProps) {
  return (
    <BotDisableNode
      id={id}
      isConnectable={isConnectable}
      data={{
        ...data,
        __hideAgentAssignment: true,
        assignToAgent: data.assignToAgent ?? '',
        notifyAgent: data.notifyAgent ?? false,
        disableDuration: data.disableDuration ?? 'manual',
        handoffMessage:
          data.handoffMessage ??
          'This conversation is closed. Thanks!',
      }}
    />
  );
}
