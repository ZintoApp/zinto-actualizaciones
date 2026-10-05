/**
 * Build Gamma API cardOptions + additionalInstructions for logo placement
 * from configurable Gamma node settings.
 *
 * @see https://developers.gamma.app/guides/header-and-footer-formatting
 */

import type {
  GammaGenerationType,
  GammaLogoHeaderPosition,
  GammaLogoHeaderSize,
  GammaLogoPlacementMode,
  GammaNodeData,
} from '../../shared/types/node-types';

export const DEFAULT_GAMMA_LOGO_PROMPT = `Company logo image URL: {{logoUrl}}
Place this exact logo image ONLY on the first card/page AND the last card/page.
Do NOT place the logo on any middle cards/pages.
Position: top-left corner on those cards.
Size: medium and clearly recognizable — approximately 15–18% of the card/page width.
Never a tiny icon; never so large that it dominates the content or covers more than about 20% of the card.
Maintain the original aspect ratio. Never crop, stretch, distort, modify, or recreate the logo.
Do not use the logo as a large centered cover/hero image.
Apply this consistently regardless of the original logo dimensions or document type.
Leave clear space in the top-left on the first and last cards so the logo does not overlap titles.`;

const HEADER_POSITIONS: readonly GammaLogoHeaderPosition[] = [
  'topLeft',
  'topCenter',
  'topRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
] as const;

const HEADER_SIZES: readonly GammaLogoHeaderSize[] = ['sm', 'md', 'lg', 'xl'] as const;

export function normalizeLogoPlacementMode(
  value: unknown
): GammaLogoPlacementMode {
  if (value === 'header' || value === 'prompt' || value === 'both' || value === 'none') {
    return value;
  }
  // Default matches the current “first + last via prompt” behavior users liked
  return 'prompt';
}

export function normalizeLogoHeaderPosition(
  value: unknown
): GammaLogoHeaderPosition {
  if (typeof value === 'string' && (HEADER_POSITIONS as readonly string[]).includes(value)) {
    return value as GammaLogoHeaderPosition;
  }
  return 'topLeft';
}

export function normalizeLogoHeaderSize(value: unknown): GammaLogoHeaderSize {
  if (typeof value === 'string' && (HEADER_SIZES as readonly string[]).includes(value)) {
    return value as GammaLogoHeaderSize;
  }
  return 'md';
}

function resolveLogoPromptTemplate(template: string | undefined, logoUrl: string): string {
  const raw = (template || '').trim() || DEFAULT_GAMMA_LOGO_PROMPT;
  return raw
    .replace(/\{\{\s*logoUrl\s*\}\}/gi, logoUrl)
    .replace(/\{\{\s*logo_url\s*\}\}/gi, logoUrl)
    .trim();
}

export interface GammaLogoGenerationExtras {
  cardOptions?: {
    dimensions?: string;
    headerFooter?: Record<string, unknown>;
  };
  additionalInstructions?: string;
}

/**
 * Build logo-related Gamma generation extras from node settings + resolved logo URL.
 */
export function buildGammaLogoGenerationExtras(params: {
  logoUrl: string;
  generationType?: GammaGenerationType;
  data: Pick<
    GammaNodeData,
    | 'logoPlacementMode'
    | 'logoHeaderPosition'
    | 'logoHeaderSize'
    | 'logoHideFromFirstCard'
    | 'logoHideFromLastCard'
    | 'logoPrompt'
  >;
}): GammaLogoGenerationExtras {
  const logoUrl = (params.logoUrl || '').trim();
  if (!logoUrl) {
    return {};
  }

  const mode = normalizeLogoPlacementMode(params.data.logoPlacementMode);
  if (mode === 'none') {
    return {};
  }

  const dimensions = params.generationType === 'document' ? 'letter' : 'fluid';
  const useHeader = mode === 'header' || mode === 'both';
  const usePrompt = mode === 'prompt' || mode === 'both';

  const result: GammaLogoGenerationExtras = {
    cardOptions: { dimensions },
  };

  if (useHeader) {
    const position = normalizeLogoHeaderPosition(params.data.logoHeaderPosition);
    const size = normalizeLogoHeaderSize(params.data.logoHeaderSize);
    result.cardOptions = {
      dimensions,
      headerFooter: {
        [position]: {
          type: 'image',
          source: 'custom',
          src: logoUrl,
          size,
        },
        hideFromFirstCard: params.data.logoHideFromFirstCard === true,
        hideFromLastCard: params.data.logoHideFromLastCard === true,
      },
    };
  }

  const instructionParts: string[] = [];

  if (usePrompt) {
    instructionParts.push(resolveLogoPromptTemplate(params.data.logoPrompt, logoUrl));
  }

  if (useHeader && !usePrompt) {
    // Light guardrails so Gamma does not also paint a huge content/hero logo
    instructionParts.push(
      [
        'Company logo branding is provided via the card header.',
        'Do not embed, redraw, recreate, crop, stretch, distort, or modify the company logo as content imagery on any card.',
        'Do not use the logo as a large centered cover/hero image that dominates the page.',
        'Keep the original logo aspect ratio at all times.',
      ].join(' ')
    );
  }

  if (instructionParts.length > 0) {
    result.additionalInstructions = instructionParts.filter(Boolean).join('\n\n');
  }

  return result;
}
