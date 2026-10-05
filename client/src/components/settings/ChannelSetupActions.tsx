import { ArrowRight, Settings, Zap } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';

type ChannelAccent = 'whatsapp' | 'messenger' | 'instagram';

interface ChannelSetupActionsProps {
  accent: ChannelAccent;
  onEasySetup: () => void;
  onManualSetup: () => void;
}

const easySetupStyles: Record<ChannelAccent, string> = {
  whatsapp: 'border-emerald-500 text-emerald-600 hover:border-emerald-600 hover:text-emerald-700 focus-visible:ring-emerald-400 dark:text-emerald-400 dark:hover:border-emerald-300 dark:hover:text-emerald-300',
  messenger: 'border-blue-500 text-blue-600 hover:border-blue-600 hover:text-blue-700 focus-visible:ring-blue-400 dark:text-blue-400 dark:hover:border-blue-300 dark:hover:text-blue-300',
  instagram: 'border-pink-500 text-pink-600 hover:border-pink-600 hover:text-pink-700 focus-visible:ring-pink-400 dark:text-pink-400 dark:hover:border-pink-300 dark:hover:text-pink-300',
};

export function ChannelSetupActions({ accent, onEasySetup, onManualSetup }: ChannelSetupActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-auto flex w-full flex-col gap-2 pt-3">
      <button data-tour="components-settings-channelsetupactions.button.settings.channel_cards.easy_setup"
        type="button"
        onClick={onEasySetup}
        className={cn(
          'flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border bg-transparent px-3 py-1.5 text-left transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          easySetupStyles[accent],
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <Zap aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-xs font-medium leading-4 sm:text-sm">
          {t('settings.channel_cards.easy_setup', 'Easy Setup')}
        </span>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </button>

      <button data-tour="components-settings-channelsetupactions.button.settings.channel_cards.manual_setup"
        type="button"
        onClick={onManualSetup}
        className={cn(
          'flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-1.5 text-left text-foreground transition-colors duration-150 hover:border-foreground/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-foreground">
          <Settings aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-xs font-medium leading-4 sm:text-sm">
          {t('settings.channel_cards.manual_setup', 'Manual Setup')}
        </span>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
