import { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Trash2, Copy, GitBranch, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { standardHandleStyle } from './StyledHandle';

interface FlowTriggerNodeProps {
  id: string;
  data: {
    label: string;
    targetFlowId?: number | null;
    targetFlowName?: string;
  };
  isConnectable: boolean;
}

export function FlowTriggerNode({ id, data, isConnectable }: FlowTriggerNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [targetFlowId, setTargetFlowId] = useState<number | null>(data.targetFlowId ?? null);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  // Fetch all flows for the dropdown
  const { data: flows = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/flows'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/flows');
      return res.json();
    },
  });

  // Derive the current flow id from the URL (e.g. /flows/123)
  const currentFlowId = (() => {
    const match = window.location.pathname.match(/\/flows\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  })();

  // Flows available for selection (exclude the current flow)
  const availableFlows = flows.filter((f: any) => f.id !== currentFlowId);

  const updateNodeData = useCallback(
    (updates: any) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, ...updates } };
          }
          return node;
        })
      );
    },
    [id, setNodes]
  );

  useEffect(() => {
    const selectedFlow = availableFlows.find((f: any) => f.id === targetFlowId);
    updateNodeData({
      targetFlowId,
      targetFlowName: selectedFlow?.name ?? null,
    });
  }, [targetFlowId]);

  const selectedFlowName =
    availableFlows.find((f: any) => f.id === targetFlowId)?.name ?? null;

  return (
    <div
      className={`node-flow-trigger p-3 rounded-lg bg-background border border-border shadow-sm group dark:bg-background dark:border-border transition-[max-width,width] duration-200 ${
        isEditing ? 'min-w-[380px] w-[420px] max-w-[420px]' : 'w-fit max-w-[320px]'
      }`}
    >
      {/* Action buttons */}
      <div className="absolute -top-8 -right-2 bg-background border border-border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 dark:bg-background dark:border-border">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicateNode(id)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteNode(id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Header */}
      <div className="font-medium flex items-center gap-2 mb-2">
        <GitBranch className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span>{t('flow_builder.trigger_flow.title', 'Trigger Flow')}</span>
        <button data-tour="components-flow-builder-flowtriggernode.button.flow_builder.trigger_flow.hide"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? <><EyeOff className="h-3 w-3" />{t('flow_builder.trigger_flow.hide', 'Hide')}</> : <><Eye className="h-3 w-3" />{t('flow_builder.trigger_flow.edit', 'Edit')}</>}
        </button>
      </div>

      {/* Summary */}
      <div className="text-sm p-2 rounded border border-border dark:border-border min-w-0">
        {selectedFlowName ? (
          <div className="flex items-center gap-1 min-w-0">
            <GitBranch className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 truncate min-w-0">{selectedFlowName}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-muted-foreground min-w-0">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs truncate min-w-0">{t('flow_builder.trigger_flow.no_flow_selected', 'No flow selected')}</span>
          </div>
        )}
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border border-border rounded p-2 dark:border-border">
          <div>
            <Label className="block mb-2 font-medium">{t('flow_builder.trigger_flow.target_flow', 'Target Flow')}</Label>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">{t('flow_builder.trigger_flow.loading_flows', 'Loading flows…')}</p>
            ) : availableFlows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('flow_builder.trigger_flow.no_flows_available', 'No other flows available.')}</p>
            ) : (
              <Select
                value={targetFlowId !== null ? String(targetFlowId) : ''}
                onValueChange={(val) => setTargetFlowId(val ? parseInt(val, 10) : null)}
              >
                <SelectTrigger data-tour="components-flow-builder-flowtriggernode.selecttrigger.flow_builder.trigger_flow.select_flow_placeholder" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.trigger_flow.select_flow_placeholder', 'Select a flow…')} />
                </SelectTrigger>
                <SelectContent>
                  {availableFlows.map((flow: any) => (
                    <SelectItem key={flow.id} value={String(flow.id)}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

