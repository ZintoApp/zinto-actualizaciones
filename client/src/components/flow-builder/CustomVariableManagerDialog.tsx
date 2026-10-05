import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Bot, Loader2, Pencil, Trash2 } from 'lucide-react';

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function deriveNameFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export interface CustomVariableManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customVariables: FlowCustomVariable[];
  onChange: (variables: FlowCustomVariable[]) => void;
  flowId?: number;
  currentValues?: Record<string, string>;
}

export function CustomVariableManagerDialog({
  open,
  onOpenChange,
  customVariables,
  onChange,
  flowId,
  currentValues: currentValuesProp,
}: CustomVariableManagerDialogProps) {
  const [formMode, setFormMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingVariable, setEditingVariable] = useState<FlowCustomVariable | null>(null);
  const [formValues, setFormValues] = useState({
    label: '',
    name: '',
    description: '',
    defaultValue: '',
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fetchedCurrentValues, setFetchedCurrentValues] = useState<Record<string, string>>({});
  const [loadingCurrentValues, setLoadingCurrentValues] = useState(false);

  const displayCurrentValues = useMemo(
    () => ({ ...fetchedCurrentValues, ...currentValuesProp }),
    [fetchedCurrentValues, currentValuesProp]
  );

  const renderCurrentValueCell = (v: FlowCustomVariable, layout: 'inline' | 'block' = 'inline') => {
    const rawSession = displayCurrentValues[v.name];
    const hasSession = rawSession != null && String(rawSession).trim() !== '';
    const defaultTrimmed = v.defaultValue?.trim() ?? '';
    const showDefaultFallback = !hasSession && defaultTrimmed !== '';
    const codeSession =
      layout === 'block'
        ? 'block w-full min-w-0 rounded bg-muted px-2 py-1.5 text-xs font-mono break-words [overflow-wrap:anywhere]'
        : 'min-w-0 max-w-full rounded bg-muted px-1.5 py-0.5 text-xs font-mono break-words [overflow-wrap:anywhere]';
    const codeDefault =
      layout === 'block'
        ? 'block w-full min-w-0 rounded bg-muted/80 px-2 py-1.5 text-xs font-mono break-words [overflow-wrap:anywhere]'
        : 'min-w-0 max-w-full rounded bg-muted/80 px-1.5 py-0.5 text-xs font-mono break-words [overflow-wrap:anywhere]';
    if (hasSession) {
      return (
        <span
          className={
            layout === 'block'
              ? 'flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start'
              : 'inline-flex min-w-0 max-w-full items-start gap-1.5'
          }
        >
          <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <code className={codeSession}>{String(rawSession)}</code>
        </span>
      );
    }
    if (showDefaultFallback) {
      return (
        <span
          className={
            layout === 'block'
              ? 'flex w-full min-w-0 flex-col gap-1'
              : 'inline-flex min-w-0 max-w-full flex-col gap-0.5'
          }
        >
          <span className="flex min-w-0 items-start gap-1.5">
            <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <code className={codeDefault}>{defaultTrimmed}</code>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Default
          </span>
        </span>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  };

  useEffect(() => {
    if (!open || !flowId) {
      return;
    }
    let cancelled = false;
    const POLL_MS = 4000;

    const fetchSessionVariables = async (isInitial: boolean) => {
      if (isInitial) {
        setLoadingCurrentValues(true);
      }
      try {
        const res = await fetch(`/api/flows/${flowId}/sessions?limit=1`);
        if (!res.ok || cancelled) {
          if (!cancelled) setFetchedCurrentValues({});
          return;
        }
        const data = await res.json();
        const sessions = data.sessions || [];
        if (sessions.length === 0) {
          if (!cancelled) setFetchedCurrentValues({});
          return;
        }
        const sessionId = sessions[0].sessionId as string;
        const vRes = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/variables`);
        if (!vRes.ok || cancelled) {
          if (!cancelled) setFetchedCurrentValues({});
          return;
        }
        const vData = await vRes.json();
        if (!cancelled) {
          const vars = vData.variables as Record<string, string> | undefined;
          setFetchedCurrentValues(vars && typeof vars === 'object' ? vars : {});
        }
      } catch {
        if (!cancelled) setFetchedCurrentValues({});
      } finally {
        if (isInitial && !cancelled) {
          setLoadingCurrentValues(false);
        }
      }
    };

    void fetchSessionVariables(true);
    const intervalId = window.setInterval(() => {
      void fetchSessionVariables(false);
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [open, flowId]);

  const resetToList = useCallback(() => {
    setFormMode('list');
    setEditingVariable(null);
    setFormValues({ label: '', name: '', description: '', defaultValue: '' });
    setFormError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        resetToList();
        setDeleteConfirmId(null);
      }
      onOpenChange(next);
    },
    [onOpenChange, resetToList]
  );

  const startCreate = () => {
    setFormMode('create');
    setEditingVariable(null);
    setFormValues({ label: '', name: '', description: '', defaultValue: '' });
    setFormError(null);
  };

  const startEdit = (v: FlowCustomVariable) => {
    setFormMode('edit');
    setEditingVariable(v);
    setFormValues({
      label: v.label,
      name: v.name,
      description: v.description ?? '',
      defaultValue: v.defaultValue ?? '',
    });
    setFormError(null);
  };

  const otherNames = useMemo(() => {
    const excludeId = editingVariable?.id;
    return new Set(
      customVariables.filter((x) => x.id !== excludeId).map((x) => x.name)
    );
  }, [customVariables, editingVariable?.id]);

  const validateAndSave = () => {
    const label = formValues.label.trim();
    const name = formValues.name.trim();
    const description = formValues.description.trim();
    const defaultValueTrimmed = formValues.defaultValue.trim();

    if (!label) {
      setFormError('Label is required.');
      return;
    }
    if (!NAME_PATTERN.test(name)) {
      setFormError('Name must match snake_case: start with a letter, then letters, digits, or underscores.');
      return;
    }
    if (otherNames.has(name)) {
      setFormError('This name is already used by another variable.');
      return;
    }

    if (formMode === 'create') {
      const newVar: FlowCustomVariable = {
        id: nanoid(),
        name,
        label,
        description: description || undefined,
        defaultValue: defaultValueTrimmed || undefined,
        dataType: 'text',
        createdAt: new Date().toISOString(),
      };
      onChange([...customVariables, newVar]);
    } else if (formMode === 'edit' && editingVariable) {
      const updated: FlowCustomVariable = {
        ...editingVariable,
        name,
        label,
        description: description || undefined,
        defaultValue: defaultValueTrimmed || undefined,
      };
      onChange(customVariables.map((v) => (v.id === updated.id ? updated : v)));
    }
    resetToList();
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    onChange(customVariables.filter((v) => v.id !== deleteConfirmId));
    setDeleteConfirmId(null);
  };

  const onLabelChange = (label: string) => {
    setFormValues((prev) => {
      const next = { ...prev, label };
      if (formMode === 'create' || (formMode === 'edit' && prev.name === deriveNameFromLabel(prev.label))) {
        next.name = deriveNameFromLabel(label);
      }
      return next;
    });
    setFormError(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl lg:max-w-5xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <DialogTitle>Custom Variables</DialogTitle>
            {formMode === 'list' && (
              <Button type="button" size="sm" onClick={startCreate}>
                New Variable
              </Button>
            )}
          </DialogHeader>

          {formMode === 'list' && (
            <div className="space-y-4">
              {flowId != null && loadingCurrentValues && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span>Loading current values…</span>
                </div>
              )}
              {customVariables.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No custom variables yet. Click &quot;New Variable&quot; to add one.
                </p>
              ) : (
                <>
                  {/* Stacked cards: narrow / mobile */}
                  <ul className="md:hidden space-y-3">
                    {customVariables.map((v) => (
                      <li
                        key={v.id}
                        className="rounded-lg border bg-card p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-3">
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Name
                              </p>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {`{{${v.name}}}`}
                              </Badge>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Label
                              </p>
                              <p className="font-medium leading-snug">{v.label}</p>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Description
                              </p>
                              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                                {v.description?.trim() ? v.description : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Current value
                              </p>
                              <div className="text-sm">{renderCurrentValueCell(v, 'block')}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Type
                              </span>
                              <Badge variant="outline">{v.dataType}</Badge>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(v)}
                              aria-label="Edit variable"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmId(v.id)}
                              aria-label="Delete variable"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Table: md+ with horizontal scroll on medium widths */}
                  <div className="hidden md:block overflow-x-auto rounded-md border">
                    <Table className="min-w-[720px] table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[14%]">Name</TableHead>
                          <TableHead className="w-[14%]">Label</TableHead>
                          <TableHead className="w-[22%]">Description</TableHead>
                          <TableHead className="w-[30%] min-w-[11rem]">Current Value</TableHead>
                          <TableHead className="w-[8%]">Type</TableHead>
                          <TableHead className="w-[12%] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customVariables.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="align-top">
                              <Badge variant="secondary" className="max-w-full font-mono text-xs [overflow-wrap:anywhere]">
                                {`{{${v.name}}}`}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top font-medium [overflow-wrap:anywhere]">
                              {v.label}
                            </TableCell>
                            <TableCell className="align-top text-sm text-muted-foreground">
                              <span className="line-clamp-3 [overflow-wrap:anywhere] md:line-clamp-none">
                                {v.description?.trim() ? v.description : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="align-top">{renderCurrentValueCell(v)}</TableCell>
                            <TableCell className="align-top">
                              <Badge variant="outline">{v.dataType}</Badge>
                            </TableCell>
                            <TableCell className="align-top text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => startEdit(v)}
                                  aria-label="Edit variable"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteConfirmId(v.id)}
                                  aria-label="Delete variable"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}

          {(formMode === 'create' || formMode === 'edit') && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Label</label>
                <Input data-tour="components-flow-builder-customvariablemanagerdialog.input.formValues.label"
                  value={formValues.label}
                  onChange={(e) => onLabelChange(e.target.value)}
                  placeholder="Human-readable label"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input data-tour="components-flow-builder-customvariablemanagerdialog.input.formValues.name"
                  value={formValues.name}
                  onChange={(e) => {
                    setFormValues((prev) => ({ ...prev, name: e.target.value }));
                    setFormError(null);
                  }}
                  placeholder="snake_case"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea data-tour="components-flow-builder-customvariablemanagerdialog.textarea.formValues.description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Default Value</label>
                <Input data-tour="components-flow-builder-customvariablemanagerdialog.input.formValues.defaultValue"
                  value={formValues.defaultValue}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, defaultValue: e.target.value }))
                  }
                  placeholder="Optional default when no session value exists"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Data Type</span>
                <Badge variant="secondary">text</Badge>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={resetToList}>
                  Cancel
                </Button>
                <Button type="button" onClick={validateAndSave}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete variable?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmId
                ? `Delete ${customVariables.find((v) => v.id === deleteConfirmId)?.name ?? 'this variable'}? This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
