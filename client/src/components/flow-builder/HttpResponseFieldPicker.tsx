import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Brackets, Database, FileJson, ListTree } from 'lucide-react';
import type { HttpResponseFieldPath } from './http-response-field-paths';

type GroupKey = HttpResponseFieldPath['group'];

const groupMeta: Record<
  GroupKey,
  { icon: React.ReactNode; labelKey: string; defaultLabel: string }
> = {
  envelope: {
    icon: <ListTree className="w-3 h-3" />,
    labelKey: 'flow_builder.http_response_fields_group_envelope',
    defaultLabel: 'Envelope',
  },
  data: {
    icon: <FileJson className="w-3 h-3" />,
    labelKey: 'flow_builder.http_response_fields_group_data',
    defaultLabel: 'Response body',
  },
  headers: {
    icon: <Database className="w-3 h-3" />,
    labelKey: 'flow_builder.http_response_fields_group_headers',
    defaultLabel: 'Headers',
  },
};

interface HttpResponseFieldPickerProps {
  value: string;
  onChange: (value: string) => void;
  paths: HttpResponseFieldPath[];
  placeholder?: string;
  className?: string;
  pickerButtonClassName?: string;
  disabled?: boolean;
  t: (key: string, fallback?: string) => string;
}

export function HttpResponseFieldPicker({
  value,
  onChange,
  paths,
  placeholder,
  className,
  pickerButtonClassName,
  disabled = false,
  t,
}: HttpResponseFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const order: GroupKey[] = ['envelope', 'data', 'headers'];
    const map: Record<GroupKey, HttpResponseFieldPath[]> = {
      envelope: [],
      data: [],
      headers: [],
    };
    for (const p of paths) {
      map[p.group].push(p);
    }
    return order.filter((g) => map[g].length > 0).map((g) => ({ group: g, items: map[g] }));
  }, [paths]);

  const pickerDisabled = disabled || paths.length === 0;

  const selectPath = (path: string) => {
    onChange(path);
    setOpen(false);
    setSearch('');
  };

  const pickerButton = (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button data-tour="components-flow-builder-httpresponsefieldpicker.button.flow_builder.http_response_field_picker_aria"
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 px-2 flex items-center gap-1 shrink-0', pickerButtonClassName)}
          disabled={pickerDisabled}
          aria-label={t(
            'flow_builder.http_response_field_picker_aria',
            'Pick field from last test response'
          )}
        >
          <Brackets className="w-3 h-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,90vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t(
              'flow_builder.http_response_field_search',
              'Search response fields…'
            )}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {paths.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-6 text-center">
                  {t(
                    'flow_builder.http_response_field_empty_run_test',
                    'Run a successful test on this node to load response fields.'
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground px-3 py-6 text-center">
                  {t('flow_builder.http_response_field_no_match', 'No matching fields.')}
                </p>
              )}
            </CommandEmpty>
            {grouped.map(({ group, items }) => {
              const q = search.trim().toLowerCase();
              const filtered = q
                ? items.filter(
                    (it) =>
                      it.path.toLowerCase().includes(q) || it.preview.toLowerCase().includes(q)
                  )
                : items;
              if (filtered.length === 0) return null;
              const meta = groupMeta[group];
              return (
                <CommandGroup
                  key={group}
                  heading={
                    <div className="flex items-center gap-2">
                      {meta.icon}
                      <span>{t(meta.labelKey, meta.defaultLabel)}</span>
                      <span className="text-muted-foreground font-normal">({filtered.length})</span>
                    </div>
                  }
                >
                  {filtered.map((it) => (
                    <CommandItem
                      key={it.path}
                      value={`${it.path} ${it.preview}`}
                      onSelect={() => selectPath(it.path)}
                      className="font-mono text-xs"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="truncate text-foreground">{it.path}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {it.preview}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex gap-2">
      <Input data-tour="components-flow-builder-httpresponsefieldpicker.input.value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('font-mono text-xs', className)}
        disabled={disabled}
      />
      {pickerDisabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">{pickerButton}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                {paths.length === 0
                  ? t(
                      'flow_builder.http_response_field_picker_tooltip_empty',
                      'Run a successful test request first to choose fields from the response.'
                    )
                  : t(
                      'flow_builder.http_response_field_picker_tooltip_disabled',
                      'Response field picker is unavailable.'
                    )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <span className="inline-flex shrink-0">{pickerButton}</span>
      )}
    </div>
  );
}
