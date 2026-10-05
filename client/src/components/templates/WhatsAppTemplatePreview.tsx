import { FileText } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';
import { getTemplatePreviewMedia } from '@/lib/whatsapp-template-ui';
import {
  resolveTemplateVariableMapping,
  type WhatsAppTemplateVariableDefinition,
} from '@shared/whatsapp-template-variables';

interface WhatsAppTemplatePreviewProps {
  template: WhatsAppTemplate;
  values?: Record<string, string>;
  context?: Record<string, any>;
  resolveMappings?: boolean;
}

function templateDefinitions(template: WhatsAppTemplate): WhatsAppTemplateVariableDefinition[] {
  if (template.whatsappTemplateVariables?.length) return template.whatsappTemplateVariables;
  return (template.variables || []).map(key => ({
    id: `body:${key}`,
    component: 'body',
    ...(/^\d+$/.test(key) ? { position: Number(key) } : { name: key }),
  }));
}

export function WhatsAppTemplatePreview({ template, values = {}, context = {}, resolveMappings = true }: WhatsAppTemplatePreviewProps) {
  const { t, currentLanguage } = useTranslation();
  const components = Array.isArray(template.whatsappTemplateComponents) ? template.whatsappTemplateComponents : [];
  const header = components.find(component => String(component?.type).toUpperCase() === 'HEADER');
  const body = components.find(component => String(component?.type).toUpperCase() === 'BODY');
  const footer = components.find(component => String(component?.type).toUpperCase() === 'FOOTER');
  const buttons = components.find(component => String(component?.type).toUpperCase() === 'BUTTONS')?.buttons || [];
  const definitions = templateDefinitions(template);
  const mappings = resolveMappings ? template.whatsappTemplateVariableMappings || {} : {};

  const renderText = (component: 'header' | 'body', text: string) => {
    return definitions.filter(definition => definition.component === component).reduce((result, definition) => {
      const key = definition.name || String(definition.position || 1);
      const manual = values[definition.id]?.trim();
      const automatic = resolveTemplateVariableMapping(mappings[definition.id], context);
      const replacement = manual || automatic || definition.example || `{{${key}}}`;
      return result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), replacement);
    }, text || '');
  };

  const media = getTemplatePreviewMedia(template);
  const mediaType = media?.type || String(header?.format || '').toLowerCase();
  const exampleMediaValues = [header?.example?.header_handle, header?.example?.header_url]
    .flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  const exampleMedia = exampleMediaValues
    .find((value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value));
  const mediaUrl = media?.url || template.mediaUrls?.find(Boolean) || exampleMedia;
  const time = new Intl.DateTimeFormat(currentLanguage?.code || undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());

  return (
    <div
      className="rounded-xl border border-black/5 bg-[#efeae2] p-3 text-[#111b21] shadow-inner dark:border-white/5 dark:bg-[#0b141a] dark:text-[#e9edef]"
      style={{
        backgroundImage: 'radial-gradient(circle at 8px 8px, rgba(90,105,115,.11) 1.25px, transparent 1.5px), radial-gradient(circle at 22px 20px, rgba(90,105,115,.07) 1px, transparent 1.25px)',
        backgroundSize: '32px 32px',
      }}
      data-testid="whatsapp-template-preview"
    >
      <div className="mx-auto max-w-[360px] overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-black/5 dark:bg-[#202c33] dark:ring-white/5">
        {mediaType === 'image' && mediaUrl && (
          <div className="bg-[#f7f8fa] p-1 dark:bg-[#111b21]">
            <img src={mediaUrl} alt={t('templates.template_header_alt', 'Template header')} className="mx-auto max-h-[28rem] h-auto w-full rounded-md object-contain" />
          </div>
        )}
        {mediaType === 'video' && mediaUrl && (
          <video src={mediaUrl} controls aria-label={t('templates.video_header', 'Template video header')} className="max-h-[28rem] w-full bg-black object-contain" />
        )}
        {mediaType === 'document' && (
          <div className="m-2 flex items-center gap-3 rounded-md bg-[#f0f2f5] p-3 dark:bg-[#111b21]" aria-label={t('templates.document_header', 'Template document header')}>
            <FileText className="h-6 w-6 text-red-500" />
            <span className="min-w-0 truncate text-sm">{mediaUrl?.split('/').pop()?.split('?')[0] || t('templates.document', 'Document')}</span>
          </div>
        )}
        <div className="px-3 pb-2 pt-2.5">
          {header?.text && <div className="mb-2 font-semibold whitespace-pre-wrap">{renderText('header', header.text)}</div>}
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {renderText('body', body?.text || template.content)}
          </div>
          {(footer?.text || time) && (
            <div className="mt-2 flex items-end justify-between gap-3 text-xs text-[#667781] dark:text-[#8696a0]">
              <span>{footer?.text || ''}</span>
              <span className="shrink-0">{time}</span>
            </div>
          )}
        </div>
        {buttons.length > 0 && (
          <div className="border-t border-[#e9edef] dark:border-[#2a3942]">
            {buttons.map((button: any, index: number) => (
              <div key={index} className="border-b border-[#e9edef] px-3 py-2 text-center text-sm text-[#027eb5] last:border-b-0 dark:border-[#2a3942] dark:text-[#53bdeb]">
                {button.text || (String(button.type).toUpperCase() === 'COPY_CODE' ? t('templates.copy_code', 'Copy code') : button.type)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
