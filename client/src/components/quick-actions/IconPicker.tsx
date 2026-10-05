import { useState } from 'react';
import { Search } from 'lucide-react';
import { QUICK_ACTION_ICON_NAMES } from '@shared/quick-action-icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import { QuickActionIcon } from './QuickActionIcon';
export default function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [search,setSearch] = useState('');
  const [limit,setLimit] = useState(48);
  const { t } = useTranslation();
  const icons = QUICK_ACTION_ICON_NAMES.filter(n => n.includes(search.toLowerCase().trim().replaceAll(' ','-')));
  return <div className="space-y-2 rounded-md border p-3">
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setLimit(48); }} aria-label={t('personalization.search_icons','Search icons')} placeholder={t('personalization.search_icons','Search icons')}/></div>
    <div className="grid max-h-48 grid-cols-5 gap-1 overflow-y-auto sm:grid-cols-8">{icons.slice(0,limit).map(name => <Button type="button" key={name} variant={value === name ? 'secondary' : 'ghost'} size="icon" aria-label={name} title={name} aria-pressed={value === name} onClick={() => onChange(name)}><QuickActionIcon name={name}/></Button>)}</div>
    {!icons.length && <p className="text-sm text-muted-foreground">{t('personalization.no_icons','No matching icons.')}</p>}
    {icons.length > limit && <Button type="button" variant="ghost" onClick={() => setLimit(n => n+48)}>{t('personalization.more_icons','Show more icons')}</Button>}
  </div>;
}
