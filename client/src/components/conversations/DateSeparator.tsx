import { formatMessageDate } from '@/utils/dateUtils';
import { useTranslation } from '@/hooks/use-translation';

interface DateSeparatorProps {
  date: Date;
}

export default function DateSeparator({ date }: DateSeparatorProps) {
  const { t, currentLanguage } = useTranslation();

  return (
    <div className="date-separator">
      <span>
        {formatMessageDate(date, {
          locale: currentLanguage?.code,
          today: t('common.today', 'Today'),
          yesterday: t('conversations.item.yesterday', 'Yesterday'),
        })}
      </span>
    </div>
  );
}
