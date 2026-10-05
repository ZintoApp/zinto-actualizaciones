import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from '@/hooks/use-translation';

export interface ImageAnalysisResult {
  version: number;
  ocrText: string;
  visualSummary: string;
  uncertaintyNotes: string;
  requiresClarification: boolean;
  provider: string;
  model: string;
  credentialId?: number | null;
  analyzedAt: string;
  sourceMediaUrl: string;
  sourceCaption: string | null;
}

interface ImageAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageAnalysis: ImageAnalysisResult | null;
}

export function ImageAnalysisModal({
  open,
  onOpenChange,
  imageAnalysis,
}: ImageAnalysisModalProps) {
  const { t } = useTranslation();

  const providerLine = imageAnalysis
    ? `${t('message_bubble.image_analysis_provider', 'Provider')}: ${imageAnalysis.provider}${imageAnalysis.model ? ` - ${imageAnalysis.model}` : ''}`
    : '';
  const hasWarning = Boolean(imageAnalysis?.requiresClarification || imageAnalysis?.uncertaintyNotes?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-conversations-imageanalysismodal.dialogcontent.message_bubble.image_analysis_title" className="max-w-2xl max-h-[85vh]" contentNoScroll>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {t('message_bubble.image_analysis_title', 'Image analysis')}
          </DialogTitle>
          {providerLine && (
            <DialogDescription asChild>
              <p className="text-xs text-muted-foreground">{providerLine}</p>
            </DialogDescription>
          )}
        </DialogHeader>

        {hasWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 px-4 py-3 flex-shrink-0">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wide mb-1.5">
              {t('message_bubble.image_analysis_uncertainty', 'Warning / uncertainty')}
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap leading-relaxed">
              {imageAnalysis?.uncertaintyNotes?.trim() ||
                t('message_bubble.image_analysis_requires_clarification', 'This image may require clarification.')}
            </p>
          </div>
        )}

        <div className="rounded-lg border bg-muted/50 dark:bg-muted/20 px-4 py-3 flex-shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            {t('message_bubble.image_analysis_visual_summary', 'Visual summary')}
          </p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {imageAnalysis?.visualSummary?.trim() ||
              t('message_bubble.image_analysis_no_summary', 'No visual summary available')}
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 px-4 py-3 flex-1 min-h-0 max-h-[45vh] overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('message_bubble.image_analysis_ocr_text', 'OCR text')}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {imageAnalysis?.ocrText?.trim() ||
              t('message_bubble.image_analysis_no_ocr_text', 'No readable text was detected in this image.')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
