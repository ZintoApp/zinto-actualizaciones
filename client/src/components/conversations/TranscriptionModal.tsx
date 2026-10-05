import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2 } from 'lucide-react';

interface TranscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcription: string;
  provider?: string;
  credentialLabel?: string;
  messageId?: number;
  initialSummary?: string | null;
  onSummarySaved?: (summary: string) => void;
}

export function TranscriptionModal({
  open,
  onOpenChange,
  transcription,
  provider = 'openai',
  credentialLabel,
  messageId,
  initialSummary,
  onSummarySaved,
}: TranscriptionModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const providerDisplayName = provider === 'openai' ? 'OpenAI Whisper' : provider;

  useEffect(() => {
    if (open) {
      setSummary(initialSummary ?? null);
    }
  }, [open, initialSummary]);

  const displaySummary = summary ?? initialSummary ?? null;

  const handleSummarize = async () => {
    if (!transcription?.trim() || isSummarizing) return;
    setIsSummarizing(true);
    try {
      const res = await apiRequest('POST', '/api/ai/summarize-transcription', { text: transcription });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Summarization failed');
      }
      const data = await res.json();
      const newSummary = data.summary || '';
      setSummary(newSummary);
      if (messageId && newSummary) {
        const saveRes = await apiRequest('POST', `/api/messages/${messageId}/transcription-summary`, { summary: newSummary });
        if (saveRes.ok) {
          onSummarySaved?.(newSummary);
        }
      }
      toast({ title: t('message_bubble.summary_ready', 'Summary ready') });
    } catch (err: any) {
      toast({ title: t('common.error', 'Error'), description: err.message || 'Failed to summarize', variant: 'destructive' });
    } finally {
      setIsSummarizing(false);
    }
  };

  const showProviderLine = !displaySummary && (provider || credentialLabel);
  const providerLine = (provider || credentialLabel)
    ? `${t('message_bubble.transcription_provider', 'Provider')}: ${providerDisplayName}${credentialLabel ? ` • ${credentialLabel}` : ''}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-conversations-transcriptionmodal.dialogcontent.message_bubble.transcription_title" className="max-w-2xl max-h-[85vh]" contentNoScroll>
        <DialogHeader className="flex flex-row items-center justify-between gap-4 pr-8 flex-shrink-0">
          <DialogTitle>
            {t('message_bubble.transcription_title', 'Transcription')}
          </DialogTitle>
          <Button data-tour="components-conversations-transcriptionmodal.button.message_bubble.summarize"
            variant="outline"
            size="sm"
            onClick={handleSummarize}
            disabled={!transcription?.trim() || isSummarizing}
            className="flex-shrink-0"
          >
            {isSummarizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            <span className="ml-1.5">{t('message_bubble.summarize', 'Summarize')}</span>
          </Button>
        </DialogHeader>
        {showProviderLine && providerLine && (
          <DialogDescription asChild>
            <p className="text-xs text-muted-foreground flex-shrink-0">{providerLine}</p>
          </DialogDescription>
        )}
        {displaySummary && (
          <div className="rounded-lg border bg-muted/50 dark:bg-muted/20 px-4 py-3 flex-shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              {t('message_bubble.summary_label', 'Summary')}
            </p>
            <p className="text-sm text-foreground leading-relaxed">{displaySummary}</p>
          </div>
        )}
        <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 px-4 py-3 flex-1 min-h-0 max-h-[60vh] overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('message_bubble.transcription_label', 'Full transcription')}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {transcription || t('message_bubble.no_transcription', 'No transcription available')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
