import { Braces, Check, Database, Network, Puzzle, ShieldCheck, Sparkles, UserPlus, UserRound } from 'lucide-react';
import { SiOpenai } from 'react-icons/si';
import { VscAzure } from 'react-icons/vsc';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AiFlowCreatorProvider } from '@shared/types/ai-flow-creator';
import type { FlowVariable } from '@/hooks/useFlowVariables';
import { getCategoryLabel } from '@/hooks/useFlowVariables';
import { cn } from '@/lib/utils';

export function CreatorProviderMark({ provider, className }: { provider: AiFlowCreatorProvider; className?: string }) {
  const Icon = provider === 'azure' ? VscAzure : provider === 'openrouter' ? Network : SiOpenai;
  return (
    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/60 bg-background/70 text-foreground shadow-sm', className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

function WorkflowHeroIllustration() {
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Connected workflow nodes" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="creator-node-cyan" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#27e6d3" /><stop offset="1" stopColor="#178dc8" /></linearGradient>
        <linearGradient id="creator-node-violet" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#7dd3fc" /><stop offset=".5" stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" /></linearGradient>
        <filter id="creator-glow"><feGaussianBlur stdDeviation="7" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g opacity=".15" stroke="currentColor"><path d="M35 55h285M35 105h285M35 155h285M35 205h285M85 30v200M145 30v200M205 30v200M265 30v200" /></g>
      <g fill="none" stroke="#2dd4bf" strokeWidth="2" strokeDasharray="7 7" opacity=".9">
        <path d="M95 161 C145 161 135 191 190 191 S245 178 270 198" />
        <path d="M160 75 C200 75 193 107 225 107 S260 114 270 151" />
        <path d="M225 107 C205 126 213 153 190 191" />
      </g>
      <g fill="#42e8df"><circle cx="146" cy="165" r="4" /><circle cx="190" cy="191" r="4" /><circle cx="225" cy="107" r="4" /></g>
      <g transform="translate(116 42) rotate(10 43 31)" filter="url(#creator-glow)">
        <rect x="7" y="12" width="79" height="58" rx="16" fill="#0b2435" opacity=".65" transform="translate(0 12)" />
        <rect x="0" y="0" width="86" height="62" rx="16" fill="url(#creator-node-cyan)" stroke="#66fff3" />
        <path d="M31 34c-8 0-8-12 0-12h10M55 28c8 0 8 12 0 12H45M38 36l11-14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" />
      </g>
      <g transform="translate(232 81) rotate(10 43 31)" filter="url(#creator-glow)">
        <rect x="7" y="12" width="79" height="58" rx="16" fill="#0b2435" opacity=".65" transform="translate(0 12)" />
        <rect width="86" height="62" rx="16" fill="url(#creator-node-cyan)" stroke="#66fff3" />
        <ellipse cx="43" cy="20" rx="17" ry="7" fill="none" stroke="white" strokeWidth="3" /><path d="M26 20v20c0 4 8 7 17 7s17-3 17-7V20M26 30c0 4 8 7 17 7s17-3 17-7" fill="none" stroke="white" strokeWidth="3" />
      </g>
      <g transform="translate(52 126) rotate(10 43 31)" filter="url(#creator-glow)">
        <rect x="7" y="12" width="79" height="58" rx="16" fill="#0b2435" opacity=".65" transform="translate(0 12)" />
        <rect width="86" height="62" rx="16" fill="url(#creator-node-cyan)" stroke="#66fff3" />
        <path d="M48 14 27 35h14l-5 14 23-25H46z" fill="white" />
      </g>
      <g transform="translate(257 168) rotate(-12 43 31)" filter="url(#creator-glow)">
        <rect x="7" y="12" width="79" height="58" rx="16" fill="#16143b" opacity=".7" transform="translate(0 12)" />
        <rect width="86" height="62" rx="16" fill="url(#creator-node-violet)" stroke="#ddd6fe" />
        <path d="m27 31 11 10 23-24" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

type CreatorHeroProps = {
  greeting: string;
  introduction: string;
  description: string;
  featureLabels: [string, string, string];
  featureDescriptions: [string, string, string];
};

export function CreatorHero({ greeting, introduction, description, featureLabels, featureDescriptions }: CreatorHeroProps) {
  const features = [
    { icon: Sparkles, color: 'violet', label: featureLabels[0], description: featureDescriptions[0] },
    { icon: Puzzle, color: 'blue', label: featureLabels[1], description: featureDescriptions[1] },
    { icon: ShieldCheck, color: 'teal', label: featureLabels[2], description: featureDescriptions[2] },
  ];
  return (
    <section className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.07] via-background/60 to-violet-500/[0.09] p-3 shadow-[inset_0_1px_0_hsl(var(--border)/.35)]">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative grid items-center gap-2 lg:grid-cols-[1.3fr_.7fr]">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan-300/20 bg-teal-500/10 text-teal-400 shadow-[0_0_16px_rgba(45,212,191,.1)]"><Sparkles className="h-3.5 w-3.5" /></span>
            <div><h3 className="text-sm font-semibold leading-tight tracking-tight">{greeting}</h3><p className="text-[10px] leading-tight text-muted-foreground">{introduction}</p></div>
          </div>
          <p className="max-w-xl text-[10px] leading-[1.45] text-muted-foreground sm:text-[11px]">{description}</p>
        </div>
        <div className="hidden h-20 lg:block"><WorkflowHeroIllustration /></div>
      </div>
      <div className="relative mt-2 grid gap-1.5 sm:grid-cols-3">
        {features.map(({ icon: Icon, color, label, description: featureDescription }) => (
          <div key={label} className="flex min-w-0 items-center gap-1.5" title={`${label}: ${featureDescription}`}>
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md border', color === 'violet' && 'border-violet-400/20 bg-violet-500/15 text-violet-400', color === 'blue' && 'border-blue-400/20 bg-blue-500/15 text-blue-400', color === 'teal' && 'border-teal-400/20 bg-teal-500/15 text-teal-400')}><Icon className="h-3 w-3" /></span>
            <strong className="block min-w-0 truncate text-[10px] font-semibold leading-tight">{label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

type TemplateCardsProps = {
  heading: string;
  description: string;
  personalTitle: string;
  personalDescription: string;
  leadTitle: string;
  leadDescription: string;
  onPersonal: () => void;
  onLead: () => void;
  disabled?: boolean;
};

export function CreatorTemplateCards(props: TemplateCardsProps) {
  const templates = [
    { title: props.personalTitle, description: props.personalDescription, icon: UserRound, colors: 'border-teal-400/20 bg-teal-500/10 text-teal-400', arrow: 'text-teal-400', onClick: props.onPersonal },
    { title: props.leadTitle, description: props.leadDescription, icon: UserPlus, colors: 'border-violet-400/20 bg-violet-500/10 text-violet-400', arrow: 'text-violet-400', onClick: props.onLead },
  ];
  return (
    <section className="space-y-2 px-0.5">
      <div><h3 className="text-base font-semibold tracking-tight">{props.heading}</h3><p className="text-[11px] text-muted-foreground">{props.description}</p></div>
      {templates.map(({ title, description, icon: Icon, colors, arrow, onClick }) => (
        <Button key={title} type="button" variant="outline" disabled={props.disabled} onClick={onClick} className="group h-auto min-h-[58px] w-full justify-start rounded-xl border-border/70 bg-card/40 p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg motion-reduce:transform-none">
          <span className={cn('mr-3 grid h-9 w-9 shrink-0 place-items-center rounded-lg border', colors)}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 whitespace-normal"><strong className="block text-xs font-semibold sm:text-[13px]">{title}</strong><span className="mt-0.5 line-clamp-1 block text-[11px] font-normal leading-snug text-muted-foreground">{description}</span></span>
          <span className={cn('ml-2 text-lg font-light transition-transform group-hover:translate-x-1 motion-reduce:transform-none', arrow)}>›</span>
        </Button>
      ))}
    </section>
  );
}

export function CreatorVariableMenu({ variables, disabled, label, searchLabel, emptyLabel, onSelect }: { variables: FlowVariable[]; disabled?: boolean; label: string; searchLabel: string; emptyLabel: string; onSelect: (variable: FlowVariable) => void }) {
  const groups = variables.reduce<Record<string, FlowVariable[]>>((result, variable) => {
    (result[variable.category] ??= []).push(variable);
    return result;
  }, {});
  return (
    <Popover>
      <PopoverTrigger asChild><Button type="button" size="icon" variant="ghost" disabled={disabled} title={label} aria-label={label} className="h-8 w-8 rounded-md border border-border/70 bg-background/40"><Braces className="h-3.5 w-3.5" /></Button></PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command><CommandInput placeholder={searchLabel} /><CommandList><CommandEmpty>{emptyLabel}</CommandEmpty>{Object.entries(groups).map(([category, entries]) => <CommandGroup key={category} heading={getCategoryLabel(category as FlowVariable['category'])}>{entries.map((variable) => <CommandItem key={`${category}-${variable.value}`} value={`${variable.label} ${variable.value}`} onSelect={() => onSelect(variable)}><Database className="mr-2 h-4 w-4 text-muted-foreground" /><span className="min-w-0"><span className="block truncate">{variable.label}</span><span className="block truncate text-xs text-muted-foreground">{`{{${variable.value}}}`}</span></span>{variable.category === 'captured' && <Check className="ml-auto h-3.5 w-3.5 text-teal-500" />}</CommandItem>)}</CommandGroup>)}</CommandList></Command>
      </PopoverContent>
    </Popover>
  );
}
