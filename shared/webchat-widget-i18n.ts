/** Built-in visitor-facing WebChat widget strings (not admin-authored copy). */

export const DEFAULT_WIDGET_LANGUAGE = 'en';

/** Canonical English default saved by many connections; treat as “use locale default”, not custom copy. */
export const WIDGET_DEFAULT_WELCOME_MESSAGE_EN = 'Hi! How can we help?';

/** Flat keys returned in GET /api/webchat/config/:token `strings` object. */
export type WebchatWidgetStringKey =
  | 'welcome.default'
  | 'header.title'
  | 'header.titleWithCompany'
  | 'header.subtitle'
  | 'prechat.title'
  | 'prechat.description'
  | 'prechat.label.name'
  | 'prechat.label.phone'
  | 'prechat.label.email'
  | 'prechat.placeholder.name'
  | 'prechat.placeholder.phone'
  | 'prechat.placeholder.email'
  | 'prechat.start'
  | 'input.placeholder'
  | 'input.addEmoji'
  | 'input.attachFile'
  | 'input.sendMessage'
  | 'validation.nameRequired'
  | 'validation.phoneRequired'
  | 'validation.welcomeBack'
  | 'errors.fileSize'
  | 'errors.sendFileFailed'
  | 'media.video'
  | 'media.audio'
  | 'media.pdf'
  | 'media.document'
  | 'media.attachment'
  | 'media.clickToView'
  | 'emoji.unavailable';

export const WEBCHAT_WIDGET_STRING_KEYS: WebchatWidgetStringKey[] = [
  'welcome.default',
  'header.title',
  'header.titleWithCompany',
  'header.subtitle',
  'prechat.title',
  'prechat.description',
  'prechat.label.name',
  'prechat.label.phone',
  'prechat.label.email',
  'prechat.placeholder.name',
  'prechat.placeholder.phone',
  'prechat.placeholder.email',
  'prechat.start',
  'input.placeholder',
  'input.addEmoji',
  'input.attachFile',
  'input.sendMessage',
  'validation.nameRequired',
  'validation.phoneRequired',
  'validation.welcomeBack',
  'errors.fileSize',
  'errors.sendFileFailed',
  'media.video',
  'media.audio',
  'media.pdf',
  'media.document',
  'media.attachment',
  'media.clickToView',
  'emoji.unavailable',
];

const WIDGET_LOCALES: Record<string, Record<WebchatWidgetStringKey, string>> = {
  en: {
    'welcome.default': WIDGET_DEFAULT_WELCOME_MESSAGE_EN,
    'header.title': 'Talk with us! 😊',
    'header.titleWithCompany': 'Talk with {company}! 😊',
    'header.subtitle': 'Team replies under 1 hour',
    'prechat.title': 'Tell us about you',
    'prechat.description': 'Please provide your details to start the chat.',
    'prechat.label.name': 'Name *',
    'prechat.label.phone': 'Phone *',
    'prechat.label.email': 'Email (optional)',
    'prechat.placeholder.name': 'Your name',
    'prechat.placeholder.phone': 'Your phone number',
    'prechat.placeholder.email': 'your@email.com',
    'prechat.start': 'Start chat',
    'input.placeholder': 'Compose your message...',
    'input.addEmoji': 'Add emoji',
    'input.attachFile': 'Attach file',
    'input.sendMessage': 'Send message',
    'validation.nameRequired': 'Name is required',
    'validation.phoneRequired': 'Valid phone is required',
    'validation.welcomeBack': 'Welcome back! We linked your previous chat.',
    'errors.fileSize': 'File size must be less than 10MB',
    'errors.sendFileFailed': 'Failed to send file. Please try again.',
    'media.video': 'Video',
    'media.audio': 'Audio',
    'media.pdf': 'PDF Document',
    'media.document': 'Document',
    'media.attachment': 'File attachment',
    'media.clickToView': 'Click to view',
    'emoji.unavailable': 'Emoji picker unavailable',
  },
  es: {
    'welcome.default': '¡Hola! ¿En qué podemos ayudarte?',
    'header.title': '¡Habla con nosotros! 😊',
    'header.titleWithCompany': '¡Habla con {company}! 😊',
    'header.subtitle': 'El equipo responde en menos de 1 hora',
    'prechat.title': 'Cuéntanos sobre ti',
    'prechat.description': 'Proporciona tus datos para iniciar el chat.',
    'prechat.label.name': 'Nombre *',
    'prechat.label.phone': 'Teléfono *',
    'prechat.label.email': 'Correo electrónico (opcional)',
    'prechat.placeholder.name': 'Tu nombre',
    'prechat.placeholder.phone': 'Tu número de teléfono',
    'prechat.placeholder.email': 'tu@correo.com',
    'prechat.start': 'Iniciar chat',
    'input.placeholder': 'Escribe tu mensaje...',
    'input.addEmoji': 'Añadir emoji',
    'input.attachFile': 'Adjuntar archivo',
    'input.sendMessage': 'Enviar mensaje',
    'validation.nameRequired': 'El nombre es obligatorio',
    'validation.phoneRequired': 'Se requiere un teléfono válido',
    'validation.welcomeBack': '¡Bienvenido de nuevo! Hemos vinculado tu chat anterior.',
    'errors.fileSize': 'El archivo debe ser menor de 10 MB',
    'errors.sendFileFailed': 'No se pudo enviar el archivo. Inténtalo de nuevo.',
    'media.video': 'Vídeo',
    'media.audio': 'Audio',
    'media.pdf': 'Documento PDF',
    'media.document': 'Documento',
    'media.attachment': 'Archivo adjunto',
    'media.clickToView': 'Haz clic para ver',
    'emoji.unavailable': 'Selector de emojis no disponible',
  },
};

export function normalizeWidgetLanguageCode(code?: string | null): string {
  const base =
    (code || DEFAULT_WIDGET_LANGUAGE).split(/[-_]/)[0]?.toLowerCase() ||
    DEFAULT_WIDGET_LANGUAGE;
  return WIDGET_LOCALES[base] ? base : DEFAULT_WIDGET_LANGUAGE;
}

/** Resolve widget strings for a locale; missing keys fall back to English. */
export function getWebchatWidgetStrings(languageCode?: string | null): Record<string, string> {
  const lang = normalizeWidgetLanguageCode(languageCode);
  const en = WIDGET_LOCALES.en;
  const locale = WIDGET_LOCALES[lang] || en;
  const out: Record<string, string> = {};
  for (const key of WEBCHAT_WIDGET_STRING_KEYS) {
    out[key] = locale[key] ?? en[key];
  }
  return out;
}

export function getSupportedWidgetLanguageCodes(): string[] {
  return Object.keys(WIDGET_LOCALES);
}

/**
 * Visitor-facing welcome bubble: empty or the canonical English default → localized built-in string;
 * any other value is treated as admin-authored and returned unchanged.
 */
export function resolveWebchatWelcomeMessageDisplay(
  stored: string | undefined | null,
  strings: Record<string, string>
): string {
  const localizedDefault =
    strings['welcome.default']?.trim() || WIDGET_DEFAULT_WELCOME_MESSAGE_EN;
  if (stored == null) return localizedDefault;
  const trimmed = String(stored).trim();
  if (trimmed === '') return localizedDefault;
  if (trimmed === WIDGET_DEFAULT_WELCOME_MESSAGE_EN) return localizedDefault;
  return trimmed;
}

export interface LanguageRow {
  code: string;
  isActive?: boolean | null;
}

/**
 * Validates an explicit widgetLanguage on create/update.
 * - Omitted / empty → `en` (backward compatible).
 * - Unknown code → throws (caller should respond with 400).
 */
export function resolveWidgetLanguageForPersist(
  code: string | undefined | null,
  activeLanguages: LanguageRow[]
): string {
  if (code === undefined || code === null || String(code).trim() === '') {
    return DEFAULT_WIDGET_LANGUAGE;
  }
  const base = String(code).split(/[-_]/)[0]?.toLowerCase() || '';
  const activeBases = new Set(
    activeLanguages
      .filter((l) => l.isActive !== false)
      .map((l) => l.code.split(/[-_]/)[0]?.toLowerCase())
      .filter(Boolean)
  );
  if (!activeBases.has(base)) {
    throw new Error(`Invalid widget language: ${code}`);
  }
  return normalizeWidgetLanguageCode(base);
}
