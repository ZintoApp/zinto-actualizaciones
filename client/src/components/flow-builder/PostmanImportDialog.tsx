import { useCallback, useMemo, useState } from 'react';
import {
  Upload,
  FileJson,
  ChevronRight,
  ChevronDown,
  ClipboardPaste as TabIconClipboardPaste,
  FileUp as TabIconFileUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  collectPostmanVariables,
  mapPostmanRequestToHttpConfig,
  parsePostmanCollection,
  parsePostmanEnvironment,
  PostmanParseError,
  requestConfigToNodeDataPatch,
  type HttpRequestConfig,
  type ParsedCollection,
  type ParsedEnvironment,
  type ParsedRequest,
  type PickerNode,
  type VariableMappingChoice
} from '@shared/postman';

type WizardStep = 'input' | 'picker' | 'variables';

export interface PostmanImportApplyResult {
  mode: 'apply';
  config: HttpRequestConfig;
  warnings: string[];
  commentsRemoved: number;
}

export interface PostmanImportAddResult {
  mode: 'add';
  nodes: Array<{
    label: string;
    config: HttpRequestConfig;
  }>;
  warnings: string[];
  commentsRemoved: number;
}

interface PostmanImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (result: PostmanImportApplyResult) => void;
  onAddNodes: (result: PostmanImportAddResult) => void;
}

function TreeRow({
  node,
  depth,
  selected,
  onToggle,
  expanded,
  onExpand
}: {
  node: PickerNode;
  depth: number;
  selected: Set<string>;
  onToggle: (requestId: string) => void;
  expanded: Set<string>;
  onExpand: (folderId: string) => void;
}) {
  if (node.type === 'request' && node.requestId) {
    const checked = selected.has(node.requestId);
    return (
      <label
        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(node.requestId!)}
        />
        <span className="truncate">{node.name}</span>
      </label>
    );
  }

  const isOpen = expanded.has(node.id);
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 w-full py-1 px-1 rounded hover:bg-muted/50 text-xs font-medium"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onExpand(node.id)}
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen &&
        (node.children || []).map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selected={selected}
            onToggle={onToggle}
            expanded={expanded}
            onExpand={onExpand}
          />
        ))}
    </div>
  );
}

export function PostmanImportDialog({
  open,
  onOpenChange,
  onApply,
  onAddNodes
}: PostmanImportDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>('input');
  const [inputTab, setInputTab] = useState<'file' | 'paste'>('paste');
  const [collectionText, setCollectionText] = useState('');
  const [envText, setEnvText] = useState('');
  const [parsed, setParsed] = useState<ParsedCollection | null>(null);
  const [env, setEnv] = useState<ParsedEnvironment | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [varChoices, setVarChoices] = useState<VariableMappingChoice[]>([]);

  const reset = useCallback(() => {
    setStep('input');
    setCollectionText('');
    setEnvText('');
    setParsed(null);
    setEnv(null);
    setSelected(new Set());
    setExpanded(new Set());
    setVarChoices([]);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const selectedRequests: ParsedRequest[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.requests.filter((r) => selected.has(r.id));
  }, [parsed, selected]);

  const parseInputs = () => {
    try {
      const collection = parsePostmanCollection(collectionText);
      let environment: ParsedEnvironment | null = null;
      if (envText.trim()) {
        environment = parsePostmanEnvironment(envText);
      }
      setParsed(collection);
      setEnv(environment);
      const expandAll = new Set<string>();
      const walk = (nodes: PickerNode[]) => {
        for (const n of nodes) {
          if (n.type === 'folder') {
            expandAll.add(n.id);
            walk(n.children || []);
          }
        }
      };
      walk(collection.tree);
      setExpanded(expandAll);
      if (collection.requests.length === 1) {
        setSelected(new Set([collection.requests[0].id]));
      } else {
        setSelected(new Set());
      }
      setStep('picker');
    } catch (err) {
      const message =
        err instanceof PostmanParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to parse collection';
      toast({
        title: t('flow_builder.postman_parse_failed', 'Import failed'),
        description: message,
        variant: 'destructive'
      });
    }
  };

  const goToVariables = () => {
    if (selectedRequests.length === 0) {
      toast({
        title: t('flow_builder.postman_select_request', 'Select at least one request'),
        variant: 'destructive'
      });
      return;
    }
    const names = new Set<string>();
    for (const r of selectedRequests) {
      for (const v of collectPostmanVariables(r)) names.add(v);
    }
    const suggestions = {
      ...(parsed?.variables || {}),
      ...(env?.values || {})
    };
    setVarChoices(
      [...names].map((name) => {
        const suggested = suggestions[name];
        const hasSuggested = suggested != null && String(suggested).length > 0;
        return {
          name,
          // Prefer baking known collection/env values so Test Request works immediately.
          action: (hasSuggested ? 'literal' : 'leave') as VariableMappingChoice['action'],
          suggested,
          value: hasSuggested ? String(suggested) : ''
        };
      })
    );
    setStep('variables');
  };

  const finish = (mode: 'apply' | 'add') => {
    if (!parsed) return;
    if (mode === 'apply' && selectedRequests.length !== 1) {
      toast({
        title: t(
          'flow_builder.postman_apply_one',
          'Select exactly one request to apply to this node'
        ),
        variant: 'destructive'
      });
      return;
    }

    const allWarnings: string[] = [];
    let commentsRemoved = 0;
    const mapped = selectedRequests.map((req) => {
      const result = mapPostmanRequestToHttpConfig(req, varChoices);
      allWarnings.push(...result.warnings);
      commentsRemoved += result.commentsRemoved;
      return { label: req.name, config: result.config, result };
    });

    if (commentsRemoved > 0) {
      toast({
        title: t('flow_builder.postman_comments_stripped', 'Cleaned request body'),
        description: t(
          'flow_builder.postman_comments_stripped_desc',
          'Removed {{count}} comment(s) from JSON body.',
          { count: commentsRemoved }
        )
      });
    }
    for (const w of allWarnings.slice(0, 3)) {
      toast({
        title: t('flow_builder.postman_import_warning', 'Import note'),
        description: w
      });
    }

    if (mode === 'apply') {
      onApply({
        mode: 'apply',
        config: mapped[0].config,
        warnings: allWarnings,
        commentsRemoved
      });
    } else {
      onAddNodes({
        mode: 'add',
        nodes: mapped.map((m) => ({ label: m.label, config: m.config })),
        warnings: allWarnings,
        commentsRemoved
      });
    }
    handleOpenChange(false);
  };

  const onFile = async (file: File | null, target: 'collection' | 'env') => {
    if (!file) return;
    const text = await file.text();
    if (target === 'collection') setCollectionText(text);
    else setEnvText(text);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-tour="components-flow-builder-postmanimportdialog.dialogcontent.flow_builder.postman_import_title" className="max-w-2xl" contentNoScroll>
        <DialogHeader>
          <DialogTitle>
            {t('flow_builder.postman_import_title', 'Import Postman Collection')}
          </DialogTitle>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-3 min-h-0 flex-1 overflow-y-auto">
            <Tabs value={inputTab} onValueChange={(v) => setInputTab(v as 'file' | 'paste')}>
              <TabsList>
                <TabsTrigger icon={TabIconClipboardPaste} data-tour="components-flow-builder-postmanimportdialog.tabstrigger.paste" value="paste">
                  {t('flow_builder.postman_paste', 'Paste JSON')}
                </TabsTrigger>
                <TabsTrigger icon={TabIconFileUp} data-tour="components-flow-builder-postmanimportdialog.tabstrigger.file" value="file">
                  {t('flow_builder.postman_file', 'Upload file')}
                </TabsTrigger>
              </TabsList>
              <TabsContent data-tour="components-flow-builder-postmanimportdialog.tabscontent.paste" value="paste" className="space-y-2">
                <Label className="text-xs">
                  {t('flow_builder.postman_collection_json', 'Collection JSON (v2.1 or v2.0)')}
                </Label>
                <Textarea data-tour="components-flow-builder-postmanimportdialog.textarea.flow_builder.postman_collection_json"
                  className="font-mono text-xs min-h-[160px]"
                  value={collectionText}
                  onChange={(e) => setCollectionText(e.target.value)}
                  placeholder='{ "info": { "schema": "...v2.1.0..." }, "item": [...] }'
                />
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-postmanimportdialog.tabscontent.file" value="file" className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Upload className="h-3 w-3" />
                  {t('flow_builder.postman_collection_file', 'Collection .json file')}
                </Label>
                <Input data-tour="components-flow-builder-postmanimportdialog.input.flow_builder.postman_collection_json"
                  type="file"
                  accept=".json,application/json"
                  className="text-xs h-8"
                  onChange={(e) => onFile(e.target.files?.[0] || null, 'collection')}
                />
                {collectionText && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileJson className="h-3 w-3" />
                    {t('flow_builder.postman_loaded_chars', '{{count}} characters loaded', {
                      count: collectionText.length
                    })}
                  </p>
                )}
              </TabsContent>
            </Tabs>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">
                {t(
                  'flow_builder.postman_env_optional',
                  'Environment JSON (optional)'
                )}
              </Label>
              <Textarea data-tour="components-flow-builder-postmanimportdialog.textarea.flow_builder.postman_env_placeholder"
                className="font-mono text-xs min-h-[80px]"
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                placeholder={t(
                  'flow_builder.postman_env_placeholder',
                  'Paste .postman_environment.json or leave empty'
                )}
              />
              <Input data-tour="components-flow-builder-postmanimportdialog.input.flow_builder.postman_collection_json"
                type="file"
                accept=".json,application/json"
                className="text-xs h-8"
                onChange={(e) => onFile(e.target.files?.[0] || null, 'env')}
              />
            </div>
          </div>
        )}

        {step === 'picker' && parsed && (
          <div className="space-y-2 min-h-0 flex-1 overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              {t(
                'flow_builder.postman_picker_hint',
                '{{name}} — select requests. Auth source shown after mapping.',
                { name: parsed.name }
              )}
            </p>
            <div className="border rounded max-h-[280px] overflow-y-auto p-1">
              {parsed.tree.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  selected={selected}
                  onToggle={(id) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  expanded={expanded}
                  onExpand={(id) => {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
            {selectedRequests.length === 1 && (
              <div className="text-[10px] text-muted-foreground border rounded p-2 space-y-1">
                <div>
                  <span className="font-medium">
                    {t('flow_builder.postman_auth_preview', 'Auth')}:
                  </span>{' '}
                  {selectedRequests[0].auth.type}{' '}
                  <span className="opacity-70">
                    ({selectedRequests[0].auth.source})
                  </span>
                </div>
                {selectedRequests[0].headers.slice(0, 5).map((h, i) => (
                  <div key={i} className={cn(!h.enabled && 'opacity-50 line-through')}>
                    {h.key}: {h.value.slice(0, 40)}
                    {h.value.length > 40 ? '…' : ''}{' '}
                    <span className="opacity-70">({h.source || 'request'})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'variables' && (
          <div className="space-y-2 min-h-0 flex-1 overflow-y-auto">
            {varChoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  'flow_builder.postman_no_vars',
                  'No Postman variables found in selected requests.'
                )}
              </p>
            ) : (
              varChoices.map((choice, index) => (
                <div key={choice.name} className="grid grid-cols-3 gap-2 items-center text-xs">
                  <code className="truncate">{`{{${choice.name}}}`}</code>
                  <Select
                    value={choice.action}
                    onValueChange={(action) => {
                      setVarChoices((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          action: action as VariableMappingChoice['action'],
                          value:
                            action === 'literal'
                              ? next[index].suggested || next[index].value || ''
                              : action === 'flow'
                                ? next[index].name
                                : next[index].value
                        };
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leave">
                        {t('flow_builder.postman_var_leave', 'Leave as-is')}
                      </SelectItem>
                      <SelectItem value="literal">
                        {t('flow_builder.postman_var_literal', 'Substitute literal')}
                      </SelectItem>
                      <SelectItem value="flow">
                        {t('flow_builder.postman_var_flow', 'Map to flow variable')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {(choice.action === 'literal' || choice.action === 'flow') && (
                    <Input
                      className="h-7 text-xs"
                      value={choice.value || ''}
                      placeholder={
                        choice.action === 'literal'
                          ? choice.suggested || 'value'
                          : 'flowVarName'
                      }
                      onChange={(e) => {
                        setVarChoices((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], value: e.target.value };
                          return next;
                        });
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step !== 'input' && (
            <Button data-tour="components-flow-builder-postmanimportdialog.button.common.back"
              variant="outline"
              size="sm"
              onClick={() => setStep(step === 'variables' ? 'picker' : 'input')}
            >
              {t('common.back', 'Back')}
            </Button>
          )}
          {step === 'input' && (
            <Button data-tour="components-flow-builder-postmanimportdialog.button.common.next" size="sm" onClick={parseInputs} disabled={!collectionText.trim()}>
              {t('common.next', 'Next')}
            </Button>
          )}
          {step === 'picker' && (
            <Button data-tour="components-flow-builder-postmanimportdialog.button.common.next" size="sm" onClick={goToVariables} disabled={selected.size === 0}>
              {t('common.next', 'Next')}
            </Button>
          )}
          {step === 'variables' && (
            <>
              <Button data-tour="components-flow-builder-postmanimportdialog.button.flow_builder.postman_apply_selected"
                variant="secondary"
                size="sm"
                disabled={selectedRequests.length !== 1}
                onClick={() => finish('apply')}
              >
                {t('flow_builder.postman_apply_selected', 'Apply selected (1)')}
              </Button>
              <Button data-tour="components-flow-builder-postmanimportdialog.button.flow_builder.postman_add_nodes" size="sm" onClick={() => finish('add')}>
                {t('flow_builder.postman_add_nodes', 'Add selected as nodes')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Re-export for callers that need the patch helper. */
export { requestConfigToNodeDataPatch };
