import { useState, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Loader2, 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical, 
  ChevronDown,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { 
  DealAutomationRule, 
  DealAutomationTriggerType, 
  DealAutomationConditions, 
  DealAutomationAction,
  Pipeline,
  PipelineStage
} from '@shared/schema';

interface LocalDealAutomationRule extends Omit<DealAutomationRule, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> {
  id?: number;
  clientId: string;
}

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rules: LocalDealAutomationRule[];
  onRulesChange: (rules: LocalDealAutomationRule[]) => void;
  pipelines: Pipeline[];
  isLoading?: boolean;
}

interface CompanyStage {
  id: number;
  name: string;
  pipelineId: number;
  order: number;
}

export function DealAutomationRulesSettings({
  enabled,
  onEnabledChange,
  rules,
  onRulesChange,
  pipelines,
  isLoading
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<LocalDealAutomationRule | null>(null);

  // Fetch all company stages
  const { data: stages = [] } = useQuery<CompanyStage[]>({
    queryKey: ['/api/pipeline/stages'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipeline/stages');
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stagesByPipeline = useMemo(() => {
    const map = new Map<number, CompanyStage[]>();
    stages.forEach(s => {
      const list = map.get(s.pipelineId) || [];
      list.push(s);
      map.set(s.pipelineId, list);
    });
    return map;
  }, [stages]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = Array.from(rules);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update priorities
    const updatedRules = items.map((rule, index) => ({
      ...rule,
      priority: index
    }));
    
    onRulesChange(updatedRules);
  };

  const handleAddRule = () => {
    const newRule: LocalDealAutomationRule = {
      clientId: crypto.randomUUID(),
      name: '',
      enabled: true,
      priority: rules.length,
      triggerType: 'agent_first_response',
      conditions: {
        dealStatus: 'active',
      },
      action: {
        type: 'move_to_stage',
        stageId: 0,
      }
    };
    setEditingRule(newRule);
    setIsDialogOpen(true);
  };

  const handleEditRule = (rule: LocalDealAutomationRule) => {
    setEditingRule({ ...rule });
    setIsDialogOpen(true);
  };

  const handleDeleteRule = (clientId: string) => {
    const filtered = rules.filter(r => r.clientId !== clientId);
    const updated = filtered.map((r, i) => ({ ...r, priority: i }));
    onRulesChange(updated);
  };

  const handleSaveRule = (rule: LocalDealAutomationRule) => {
    // Validation
    if (!rule.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.pipeline.deal_automation.validation_name_required', 'Rule name is required.'),
        variant: 'destructive',
      });
      return;
    }

    if (!rule.conditions?.stageIds || rule.conditions?.stageIds.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.pipeline.deal_automation.validation_stage_required', 'Select at least one current stage.'),
        variant: 'destructive',
      });
      return;
    }

    if (rule.action.type === 'move_to_stage' && !rule.conditions?.pipelineId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.pipeline.deal_automation.validation_move_stage_pipeline_required', 'Select a specific pipeline to move to a stage in the same pipeline.'),
        variant: 'destructive',
      });
      return;
    }

    if (rule.action.type === 'move_to_pipeline' && !rule.action.pipelineId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.pipeline.deal_automation.validation_pipeline_required', 'Select a pipeline for this action.'),
        variant: 'destructive',
      });
      return;
    }

    if (!rule.action.stageId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.pipeline.deal_automation.validation_target_stage_required', 'Select a target stage.'),
        variant: 'destructive',
      });
      return;
    }

    const index = rules.findIndex(r => r.clientId === rule.clientId);
    if (index > -1) {
      const updated = [...rules];
      updated[index] = rule;
      onRulesChange(updated);
    } else {
      onRulesChange([...rules, rule]);
    }
    setIsDialogOpen(false);
    setEditingRule(null);
  };

  const getRuleSummary = (rule: LocalDealAutomationRule) => {
    const trigger = t(`settings.pipeline.deal_automation.triggers.${rule.triggerType}`, rule.triggerType);
    
    let targetName = t('settings.pipeline.deal_automation.unknown_stage', 'Unknown stage');
    const targetStage = stages.find(s => s.id === rule.action.stageId);
    if (targetStage) {
      const targetPipeline = pipelines.find(p => p.id === targetStage.pipelineId);
      targetName = `${targetStage.name} (${targetPipeline?.name || t('settings.pipeline.deal_automation.unknown_pipeline', 'Unknown pipeline')})`;
    }

    return t('settings.pipeline.deal_automation.summary', 'When {{trigger}} → Move to {{target}}', {
      trigger,
      target: targetName
    });
  };

  return (
    <>
      <div>
        <h3 className="text-sm font-medium mb-4">
          {t('settings.pipeline.deal_automation.title', 'Deal Automation Rules')}
        </h3>
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">
                {t('settings.pipeline.deal_automation.enable_label', 'Enable deal automation rules')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.pipeline.deal_automation.enable_description', 'Applies company-wide. Rules run by priority and stop after the first match.')}
              </p>
            </div>
            <Switch 
              checked={enabled} 
              onCheckedChange={onEnabledChange} 
            />
          </div>

          {enabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>{t('settings.pipeline.deal_automation.priority_help', 'Lower priority runs first. The first matching rule stops evaluation.')}</span>
              </div>

              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading', 'Loading...')}
                </div>
              ) : rules.length === 0 ? (
                <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <p className="font-medium">{t('settings.pipeline.deal_automation.no_rules_title', 'No automation rules yet')}</p>
                  <p className="text-sm mt-1">{t('settings.pipeline.deal_automation.no_rules_description', 'Add a rule to move deals automatically after agent or contact events.')}</p>
                  <Button data-tour="components-settings-dealautomationrulessettings.button.settings.pipeline.deal_automation.add_rule" variant="outline" className="mt-4" onClick={handleAddRule}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('settings.pipeline.deal_automation.add_rule', 'Add rule')}
                  </Button>
                </div>
              ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="deal-automation-rules">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {rules.map((rule, index) => (
                          <Draggable
                            key={rule.clientId}
                            draggableId={rule.clientId}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors",
                                  snapshot.isDragging && "shadow-lg"
                                )}
                              >
                                <div {...provided.dragHandleProps} className="cursor-grab">
                                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium truncate">{rule.name}</p>
                                    {!rule.enabled && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium uppercase tracking-wider">
                                        {t('common.disabled', 'Disabled')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {getRuleSummary(rule)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Switch 
                                    checked={rule.enabled} 
                                    onCheckedChange={(checked) => {
                                      const updated = [...rules];
                                      updated[index] = { ...rule, enabled: checked };
                                      onRulesChange(updated);
                                    }}
                                    className="scale-75"
                                  />
                                  <Button variant="ghost" size="icon" onClick={() => handleEditRule(rule)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteRule(rule.clientId)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}

              {rules.length > 0 && (
                <Button data-tour="components-settings-dealautomationrulessettings.button.settings.pipeline.deal_automation.add_rule" variant="outline" className="w-full" onClick={handleAddRule}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('settings.pipeline.deal_automation.add_rule', 'Add rule')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <RuleBuilderDialog 
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        rule={editingRule}
        onSave={handleSaveRule}
        pipelines={pipelines}
        stages={stages}
        stagesByPipeline={stagesByPipeline}
      />
    </>
  );
}

function RuleBuilderDialog({
  open,
  onOpenChange,
  rule,
  onSave,
  pipelines,
  stages,
  stagesByPipeline
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: LocalDealAutomationRule | null;
  onSave: (rule: LocalDealAutomationRule) => void;
  pipelines: Pipeline[];
  stages: CompanyStage[];
  stagesByPipeline: Map<number, CompanyStage[]>;
}) {
  const { t } = useTranslation();
  const [localRule, setLocalRule] = useState<LocalDealAutomationRule | null>(null);
  const [isStagesPopoverOpen, setIsStagesPopoverOpen] = useState(false);

  // Initialize local state when dialog opens
  useMemo(() => {
    if (open && rule) {
      setLocalRule({ ...rule });
    }
  }, [open, rule]);

  if (!localRule) return null;

  const updateConditions = (updates: Partial<DealAutomationConditions>) => {
    setLocalRule(prev => prev ? ({
      ...prev,
      conditions: { ...prev.conditions, ...updates }
    }) : null);
  };

  const updateAction = (updates: Partial<DealAutomationAction>) => {
    setLocalRule(prev => prev ? ({
      ...prev,
      action: { ...prev.action, ...updates } as DealAutomationAction
    }) : null);
  };

  const selectedPipelineId = localRule.conditions?.pipelineId;
  const filteredStages = selectedPipelineId 
    ? (stagesByPipeline.get(selectedPipelineId) || [])
    : stages;

  const handlePipelineChange = (pipelineId: string) => {
    const id = pipelineId === 'any' ? undefined : parseInt(pipelineId);
    updateConditions({ pipelineId: id, stageIds: [] });
    
    // If we were in move_to_stage and switched to 'any' pipeline, reset action type or stage
    if (localRule.action.type === 'move_to_stage' && !id) {
      updateAction({ stageId: 0 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-settings-dealautomationrulessettings.dialogcontent.settings.pipeline.deal_automation.edit_rule" className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule?.name ? t('settings.pipeline.deal_automation.edit_rule', 'Edit rule') : t('settings.pipeline.deal_automation.add_rule', 'Add rule')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Metadata */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              {t('settings.pipeline.deal_automation.name', 'Name')}
            </Label>
            <Input data-tour="components-settings-dealautomationrulessettings.input.settings.pipeline.deal_automation.name_placeholder"
              id="name"
              className="col-span-3"
              value={localRule.name}
              onChange={(e) => setLocalRule({ ...localRule, name: e.target.value })}
              placeholder={t('settings.pipeline.deal_automation.name_placeholder', 'e.g. Initial → Negotiation on first reply')}
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('settings.pipeline.deal_automation.rule_enabled', 'Rule enabled')}
            </Label>
            <div className="col-span-3">
              <Switch 
                checked={localRule.enabled}
                onCheckedChange={(checked) => setLocalRule({ ...localRule, enabled: checked })}
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
              {t('settings.pipeline.deal_automation.trigger', 'When')}
            </h4>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('settings.pipeline.deal_automation.trigger', 'When')}</Label>
              <div className="col-span-3">
                <Select 
                  value={localRule.triggerType} 
                  onValueChange={(v: DealAutomationTriggerType) => setLocalRule({ ...localRule, triggerType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent_first_response">
                      {t('settings.pipeline.deal_automation.triggers.agent_first_response', 'Agent first response')}
                    </SelectItem>
                    <SelectItem value="agent_message_sent">
                      {t('settings.pipeline.deal_automation.triggers.agent_message_sent', 'Agent message sent')}
                    </SelectItem>
                    <SelectItem value="contact_message_received" disabled>
                      {t('settings.pipeline.deal_automation.triggers.contact_message_received', 'Contact message received')} ({t('settings.pipeline.deal_automation.coming_soon', 'coming soon')})
                    </SelectItem>
                    <SelectItem value="deal_stage_entered" disabled>
                      {t('settings.pipeline.deal_automation.triggers.deal_stage_entered', 'Deal stage entered')} ({t('settings.pipeline.deal_automation.coming_soon', 'coming soon')})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              {t('settings.pipeline.deal_automation.conditions', 'Conditions')}
            </h4>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('settings.pipeline.deal_automation.pipeline', 'Pipeline')}</Label>
              <div className="col-span-3">
                <Select 
                  value={localRule.conditions?.pipelineId?.toString() || 'any'} 
                  onValueChange={handlePipelineChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('settings.pipeline.deal_automation.any_pipeline', 'Any pipeline')}</SelectItem>
                    {pipelines.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('settings.pipeline.deal_automation.current_stages', 'Current stages')}</Label>
              <div className="col-span-3">
                <Popover open={isStagesPopoverOpen} onOpenChange={setIsStagesPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button data-tour="components-settings-dealautomationrulessettings.button.settings.pipeline.deal_automation.select_stages_count"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {localRule.conditions?.stageIds?.length 
                          ? t('settings.pipeline.deal_automation.select_stages_count', '{{count}} selected', { count: localRule.conditions?.stageIds?.length || 0 })
                          : t('settings.pipeline.deal_automation.select_stages', 'Select stages')
                        }
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t('settings.pipeline.deal_automation.select_stages', 'Select stages')} />
                      <CommandList>
                        <CommandEmpty>{t('common.no_results', 'No results found.')}</CommandEmpty>
                        {selectedPipelineId ? (
                          <CommandGroup>
                            {filteredStages.map(s => (
                              <CommandItem
                                key={s.id}
                                onSelect={() => {
                                  const current = localRule.conditions?.stageIds || [];
                                  const updated = current.includes(s.id)
                                    ? current.filter(id => id !== s.id)
                                    : [...current, s.id];
                                  updateConditions({ stageIds: updated });
                                }}
                              >
                                <Checkbox
                                  checked={localRule.conditions?.stageIds?.includes(s.id)}
                                  className="mr-2"
                                />
                                {s.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ) : (
                          pipelines.map(p => (
                            <CommandGroup key={p.id} heading={p.name}>
                              {(stagesByPipeline.get(p.id) || []).map(s => (
                                <CommandItem
                                  key={s.id}
                                  onSelect={() => {
                                    const current = localRule.conditions?.stageIds || [];
                                    const updated = current.includes(s.id)
                                      ? current.filter(id => id !== s.id)
                                      : [...current, s.id];
                                    updateConditions({ stageIds: updated });
                                  }}
                                >
                                  <Checkbox
                                    checked={localRule.conditions?.stageIds?.includes(s.id)}
                                    className="mr-2"
                                  />
                                  {s.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ))
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('settings.pipeline.deal_automation.deal_status', 'Deal status')}</Label>
              <div className="col-span-3">
                <div className="text-sm font-medium px-3 py-2 bg-muted rounded-md text-muted-foreground border">
                  {t('settings.pipeline.deal_automation.active_only', 'Active only')}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">3</span>
              {t('settings.pipeline.deal_automation.action', 'Then')}
            </h4>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('settings.pipeline.deal_automation.action_type', 'Action type')}</Label>
              <div className="col-span-3">
                <Select 
                  value={localRule.action.type} 
                  onValueChange={(v: 'move_to_stage' | 'move_to_pipeline') => {
                    if (v === 'move_to_stage') {
                      updateAction({ type: v, pipelineId: undefined, stageId: 0 });
                    } else {
                      updateAction({ type: v, pipelineId: pipelines[0]?.id, stageId: 0 });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="move_to_stage">
                      {t('settings.pipeline.deal_automation.actions.move_to_stage', 'Move to stage')}
                    </SelectItem>
                    <SelectItem value="move_to_pipeline">
                      {t('settings.pipeline.deal_automation.actions.move_to_pipeline', 'Move to pipeline')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {localRule.action.type === 'move_to_pipeline' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">{t('settings.pipeline.deal_automation.target_pipeline', 'Target pipeline')}</Label>
                <div className="col-span-3">
                  <Select 
                    value={localRule.action.pipelineId?.toString()} 
                    onValueChange={(v) => updateAction({ pipelineId: parseInt(v), stageId: 0 })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('settings.pipeline.deal_automation.target_stage', 'Target stage')}</Label>
              <div className="col-span-3">
                <Select 
                  value={localRule.action.stageId?.toString() || '0'} 
                  onValueChange={(v) => updateAction({ stageId: parseInt(v) })}
                >
                  <SelectTrigger data-tour="components-settings-dealautomationrulessettings.selecttrigger.settings.pipeline.deal_automation.target_stage">
                    <SelectValue placeholder={t('settings.pipeline.deal_automation.target_stage', 'Select target stage')} />
                  </SelectTrigger>
                  <SelectContent>
                    {localRule.action.type === 'move_to_stage' ? (
                      // Must have a specific condition pipeline
                      selectedPipelineId ? (
                        (stagesByPipeline.get(selectedPipelineId) || []).map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                          {t('settings.pipeline.deal_automation.validation_move_stage_pipeline_required', 'Select a specific pipeline to move to a stage in the same pipeline.')}
                        </div>
                      )
                    ) : (
                      // move_to_pipeline: show stages from target pipeline
                      localRule.action.pipelineId ? (
                        (stagesByPipeline.get(localRule.action.pipelineId) || []).map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))
                      ) : null
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button data-tour="components-settings-dealautomationrulessettings.button.settings.pipeline.deal_automation.cancel" variant="outline" onClick={() => onOpenChange(false)}>
            {t('settings.pipeline.deal_automation.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-settings-dealautomationrulessettings.button.settings.pipeline.deal_automation.save_rule" onClick={() => onSave(localRule)}>
            {t('settings.pipeline.deal_automation.save_rule', 'Save rule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
