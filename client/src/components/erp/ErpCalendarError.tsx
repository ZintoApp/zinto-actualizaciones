import {Button} from '@/components/ui/button';
import {useTranslation} from '@/hooks/use-translation';
export function ErpCalendarError({calendar}:{calendar:{isError:boolean;refetch:()=>unknown}}){
 const {t}=useTranslation();
 if(!calendar.isError)return null;
 return <div role="alert" className="re-panel mb-4 p-4 text-sm">{t('erp.realEstate.loadError','Unable to load this information.')}<Button variant="outline" className="ml-3" onClick={()=>calendar.refetch()}>{t('common.retry','Retry')}</Button></div>;
}
