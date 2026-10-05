import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useState } from 'react';
import {
  Sparkles,
  Loader2,
  Wand2,
  SpellCheck,
  Smile,
  Minimize2,
  Maximize2,
  BookOpen,
  Languages,
  ArrowRightCircle,
  Pencil,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import type { AssistPayload } from '@/hooks/useAiTextAssist';

const CURATED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🌐' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
] as const;

const TONE_VARIANTS = ['formal', 'empathetic', 'apologetic', 'persuasive', 'enthusiastic'] as const;

function detectSuggestedLanguage(
  recentMessages: Array<{ role: 'agent' | 'contact'; content: string; createdAt?: string }>,
): string | undefined {
  const text = recentMessages
    .filter((m) => m.role === 'contact')
    .slice(-3)
    .map((m) => m.content)
    .join('');

  if (!text) return undefined;

  let code: string | undefined;

  if (/[\u3040-\u30ff]/.test(text)) {
    code = 'ja';
  } else if (/[\u4e00-\u9fff]/.test(text)) {
    code = 'zh-CN';
  } else if (/[\u0900-\u097f]/.test(text)) {
    code = 'hi';
  } else if (/[\u0980-\u09ff]/.test(text)) {
    code = 'bn';
  } else if (/[\u0400-\u04ff]/.test(text)) {
    code = 'ru';
  } else if (/[\u06D2\u0679\u0688\u0686\u06BE\u06C1\u06C2]/.test(text)) {
    code = 'ur';
  } else if (/[\u0600-\u06FF]/.test(text)) {
    code = 'ar';
  }

  if (!code) return undefined;
  return CURATED_LANGUAGES.some((l) => l.code === code) ? code : undefined;
}

export interface AiAssistMenuProps {
  draft: string;
  conversationId: number;
  conversation?: any;
  contact?: any;
  recentMessages?: Array<{ role: 'agent' | 'contact'; content: string; createdAt?: string }>;
  isStreaming: boolean;
  disabled?: boolean;
  onAction: (payload: AssistPayload) => void;
  onOpenSettings: () => void;
}

export default function AiAssistMenu({
  draft,
  conversationId: _conversationId,
  conversation: _conversation,
  contact: _contact,
  recentMessages,
  isStreaming,
  disabled,
  onAction,
  onOpenSettings: _onOpenSettings,
}: AiAssistMenuProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customTouched, setCustomTouched] = useState(false);

  const draftEmpty = draft.trim().length === 0;
  const suggestedCode = detectSuggestedLanguage(recentMessages || []);
  const suggestedLang = suggestedCode
    ? CURATED_LANGUAGES.find((l) => l.code === suggestedCode)
    : undefined;

  const fire = (payload: AssistPayload) => onAction(payload);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button data-tour="components-conversations-aiassistmenu.button.ai_assist.button_tooltip"
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-muted text-gray-600 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"
            disabled={isStreaming || disabled}
            title={t('ai_assist.button_tooltip', 'Improve with AI')}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'improve', text: draft })}>
            <Wand2 className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.improve', 'Improve writing')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'fix_grammar', text: draft })}>
            <SpellCheck className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.fix_grammar', 'Fix grammar & spelling')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'polite', text: draft })}>
            <Smile className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.polite', 'Make it polite')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'friendly', text: draft })}>
            <Smile className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.friendly', 'Make it friendly')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'shorten', text: draft })}>
            <Minimize2 className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.shorten', 'Make it shorter')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'lengthen', text: draft })}>
            <Maximize2 className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.lengthen', 'Make it longer')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'simplify', text: draft })}>
            <BookOpen className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.simplify', 'Simplify')}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={draftEmpty}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('ai_assist.actions.tone', 'Change tone')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TONE_VARIANTS.map((variant) => (
                <DropdownMenuItem
                  key={variant}
                  disabled={draftEmpty}
                  onSelect={() => fire({ action: 'tone', toneVariant: variant, text: draft })}
                >
                  {t(`ai_assist.tones.${variant}`, variant.charAt(0).toUpperCase() + variant.slice(1))}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={draftEmpty}>
              <Languages className="mr-2 h-4 w-4" />
              {t('ai_assist.actions.translate', 'Translate to…')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {suggestedLang && (
                <>
                  <DropdownMenuLabel>{t('ai_assist.translate.suggested', 'Suggested')}</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={draftEmpty}
                    onSelect={() =>
                      fire({ action: 'translate', targetLanguage: suggestedLang.code, text: draft })
                    }
                  >
                    {suggestedLang.flag} {suggestedLang.nativeName} ({suggestedLang.name})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {CURATED_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  disabled={draftEmpty}
                  onSelect={() => fire({ action: 'translate', targetLanguage: lang.code, text: draft })}
                >
                  {lang.flag} {lang.nativeName} ({lang.name})
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled={draftEmpty} onSelect={() => fire({ action: 'continue', text: draft })}>
            <ArrowRightCircle className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.continue', 'Continue writing')}
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => fire({ action: 'summarize_reply', text: draft })}>
            <InboxConversationIcon className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.summarize_reply', 'Draft reply from conversation')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              setCustomTouched(false);
              setCustomOpen(true);
            }}
          >
            <Wand2 className="mr-2 h-4 w-4" />
            {t('ai_assist.actions.custom', 'Custom instruction…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={customOpen}
        onOpenChange={(open) => {
          setCustomOpen(open);
          if (!open) {
            setCustomText('');
            setCustomTouched(false);
          }
        }}
      >
        <DialogContent data-tour="components-conversations-aiassistmenu.dialogcontent.ai_assist.actions.custom">
          <DialogHeader>
            <DialogTitle>{t('ai_assist.actions.custom', 'Custom instruction…')}</DialogTitle>
            <DialogDescription>
              {t('ai_assist.custom.placeholder', 'e.g. Reply with a 20% discount offer in 2 sentences')}
            </DialogDescription>
          </DialogHeader>
          <Textarea data-tour="components-conversations-aiassistmenu.textarea.ai_assist.custom.placeholder"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onBlur={() => setCustomTouched(true)}
            placeholder={t('ai_assist.custom.placeholder', 'e.g. Reply with a 20% discount offer in 2 sentences')}
            maxLength={500}
            rows={4}
          />
          {customTouched && customText.trim().length === 0 && (
            <p className="text-sm text-destructive">
              {t('ai_assist.custom.instruction_required', 'Enter a custom instruction to apply.')}
            </p>
          )}
          <DialogFooter>
            <Button data-tour="components-conversations-aiassistmenu.button.ai_assist.custom.apply"
              disabled={customText.trim().length === 0}
              onClick={() => {
                const instruction = customText.trim();
                if (!instruction) {
                  setCustomTouched(true);
                  return;
                }
                onAction({ action: 'custom', text: draft, instruction });
                setCustomOpen(false);
                setCustomText('');
                setCustomTouched(false);
              }}
            >
              {t('ai_assist.custom.apply', 'Apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
