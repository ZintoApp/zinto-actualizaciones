import { useAuth } from '@/hooks/use-auth';
import { useState } from 'react';
import { Link } from 'wouter';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from '@/hooks/use-translation';
import { QUICK_ACTION_CATALOG, resolveShortcut, type QuickShortcut } from '@shared/quick-actions';
import { QuickActionIcon } from './QuickActionIcon';
import { useQuickSettings } from './use-quick-settings';
export function useShortcutLabel() {
  const { t } = useTranslation();
  return (s: QuickShortcut) => s.label || (s.kind === 'url' ? s.url : t('personalization.destination.' + s.destinationId, QUICK_ACTION_CATALOG.find(d => d.id === s.destinationId)?.label || s.destinationId));
}
export function ShortcutGrid({ shortcuts, onSelect, preview = false }: { shortcuts: QuickShortcut[]; onSelect?: () => void; preview?: boolean }) {
  const label = useShortcutLabel();
  const { t } = useTranslation();
  if (!shortcuts.length) return <p className="p-4 text-sm text-muted-foreground">{t('personalization.empty', 'No shortcuts configured.')}</p>;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" onKeyDown={event => {
    if (preview || !['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    const links=Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'));
    const index=links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index<0) return;
    const columns=window.matchMedia('(min-width:640px)').matches ? 3 : 2;
    const offset=event.key==='ArrowRight' ? 1 : event.key==='ArrowLeft' ? -1 : event.key==='ArrowDown' ? columns : -columns;
    const next=event.key==='Home' ? 0 : event.key==='End' ? links.length-1 : Math.max(0,Math.min(links.length-1,index+offset));
    event.preventDefault();links[next]?.focus();
  }}>{shortcuts.map(s => {
    const target = resolveShortcut(s, window.location.origin);
    const content = <><QuickActionIcon name={s.icon}/><span className="w-full break-words text-center text-xs leading-5">{label(s)}</span></>;
    const classes = 'flex min-w-0 flex-col items-center justify-start gap-2 rounded-md p-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
    return preview ? <div key={s.id} className={classes}>{content}</div> : target.external || target.newTab ? <a key={s.id} href={target.href} target={target.newTab ? '_blank' : undefined} rel={target.newTab ? 'noopener noreferrer' : undefined} onClick={onSelect} className={classes} title={label(s)}>{content}</a> : <Link key={s.id} href={target.href} onClick={onSelect} className={classes} title={label(s)}>{content}</Link>;
  })}</div>;
}
export function QuickActionsMenu() {
  const [open,setOpen] = useState(false);
  const { user } = useAuth();
  const query = useQuickSettings();
  const { t } = useTranslation();
  if (!user?.companyId) return null;
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (value) void query.refetch(); }}>
    <PopoverTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label={t('personalization.quick_actions','Quick actions')} title={t('personalization.quick_actions','Quick actions')}><Zap className="h-4 w-4"/></Button></PopoverTrigger>
    <PopoverContent aria-label={t('personalization.quick_actions','Quick actions')} align="end" sideOffset={8} className="w-[min(360px,calc(100vw-24px))] p-3">
      <h2 className="mb-3 text-sm font-semibold">{t('personalization.quick_actions','Quick actions')}</h2>
      <div className="max-h-[60vh] overflow-y-auto">{query.isPending ? <p role="status">{t('personalization.loading','Loading shortcuts…')}</p> : query.isError ? <div role="alert" className="space-y-2 text-sm"><p>{t('personalization.load_error','Could not load shortcuts.')}</p><Button variant="outline" onClick={() => query.refetch()}>{t('personalization.retry','Retry')}</Button></div> : <ShortcutGrid shortcuts={query.available} onSelect={() => setOpen(false)}/>}</div>
      {!query.isError && query.data?.canManage && <Button asChild variant="ghost" className="mt-3 w-full border-t"><Link href="/settings?tab=personalization" onClick={() => setOpen(false)}>{t('personalization.customize','Customize shortcuts')}</Link></Button>}
    </PopoverContent>
  </Popover>;
}
