import { parseDocument } from 'htmlparser2';
import { CONSENT_TOKEN_SOURCE } from './dental-consent-custom-fields';

export type ConsentAlignment = 'left' | 'center' | 'right' | 'justify';
export const CONSENT_IMAGE_WRAPS = ['inline', 'wrap', 'break', 'behind', 'front'] as const;
export type ConsentImageWrap = typeof CONSENT_IMAGE_WRAPS[number];
export type ConsentImageLayout = { wrap: ConsentImageWrap; x: number; y: number; gap: number };
const bounded = (value: string | undefined, fallback: number, max: number) => value !== undefined && /^\d+(\.\d+)?$/.test(value)
  ? Math.round(Math.min(max, Math.max(0, Number(value))) * 1000) / 1000 : fallback;
export function consentImageLayout(attrs: Record<string, string>): ConsentImageLayout {
  const alignment = attrs.style?.match(/text-align:\s*(left|center|right)/)?.[1];
  return {
    wrap: CONSENT_IMAGE_WRAPS.includes(attrs['data-consent-wrap'] as ConsentImageWrap) ? attrs['data-consent-wrap'] as ConsentImageWrap : 'break',
    x: bounded(attrs['data-consent-x'], alignment === 'center' ? 0.5 : alignment === 'right' ? 1 : 0, 1),
    y: bounded(attrs['data-consent-y'], 0, 680), gap: bounded(attrs['data-consent-gap'], 8, 48),
  };
}
export type ConsentRichNode = { type: 'text'; text: string } | {
  type: 'element'; tag: string; attrs: Record<string, string>; children: ConsentRichNode[];
};
export const CONSENT_ASSET_URL = /^\/api\/erp\/dental\/consent-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const tokenPattern = new RegExp(`\\{\\{${CONSENT_TOKEN_SOURCE}\\}\\}`, 'g');
const tags = new Set(['p', 'div', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'span']);
const drop = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'textarea', 'template', 'noscript']);
const blocks = new Set(['p', 'div', 'h1', 'h2', 'h3', 'li', 'ul', 'ol']);
export const escapeConsentHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function safeConsentLink(value: string): string | null {
  if (/[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const element = (tag: string, children: ConsentRichNode[], attrs: Record<string, string> = {}): ConsentRichNode => ({ type: 'element', tag, children, attrs });
function tokenText(text: string): ConsentRichNode[] {
  const result: ConsentRichNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index! > offset) result.push({ type: 'text', text: text.slice(offset, match.index) });
    result.push(element('span', [{ type: 'text', text: match[0] }], { 'data-consent-placeholder': match[1] }));
    offset = match.index! + match[0].length;
  }
  if (offset < text.length) result.push({ type: 'text', text: text.slice(offset) });
  return result;
}

/** The same bounded HTML vocabulary is used in the editor, storage, and PDF renderer. */
export function parseConsentHtml(html: string): ConsentRichNode[] {
  const document = parseDocument(html, { decodeEntities: true });
  type SourceNode = typeof document.children[number];
  const normalize = (node: SourceNode, depth: number): ConsentRichNode[] => {
    if (depth > 32) return [];
    if (node.type === 'text') return tokenText(node.data.replace(/\u00a0/g, ' '));
    if (!('name' in node) || !('children' in node) || drop.has(node.name)) return [];
    // Editor-only exclusion geometry and handles never become document content.
    if (node.attribs['data-consent-decoration'] !== undefined) return [];
    let tag = node.name === 'b' ? 'strong' : node.name === 'i' ? 'em' : node.name;
    const children = node.children.flatMap(child => normalize(child, depth + 1));
    const attrs: Record<string, string> = {};
    const styles = Object.fromEntries((node.attribs.style || '').split(';').map(rule => rule.split(':').map(value => value.trim().toLowerCase())).filter(pair => pair.length === 2));
    if (node.name === 'span' && new RegExp(`^${CONSENT_TOKEN_SOURCE}$`).test(node.attribs['data-consent-placeholder'] || '')) {
      const name = node.attribs['data-consent-placeholder'];
      return [element('span', [{ type: 'text', text: `{{${name}}}` }], { 'data-consent-placeholder': name })];
    }
    if (tag === 'font') tag = 'span';
    if (!tags.has(tag)) return children;
    if (tag === 'a') {
      const href = safeConsentLink(node.attribs.href || '');
      if (!href) return children;
      attrs.href = href;
    }
    const alignment = styles['text-align'] || node.attribs.align;
    if ((blocks.has(tag) || tag === 'img') && ['left', 'center', 'right', 'justify'].includes(alignment)) attrs.style = `text-align:${alignment}`;
    if (tag === 'ol' && /^\d{1,4}$/.test(node.attribs.start || '')) attrs.start = String(Math.max(1, Number(node.attribs.start)));
    if (tag === 'img') {
      if (!CONSENT_ASSET_URL.test(node.attribs.src || '')) return [];
      attrs.src = node.attribs.src;
      attrs.alt = (node.attribs.alt || '').slice(0, 500);
      const rawWidth = node.attribs.width || styles.width?.replace(/px$/, '');
      if (/^\d+(\.\d+)?$/.test(rawWidth || '')) attrs.width = String(Math.max(24, Math.min(680, Math.round(Number(rawWidth)))));
      if (node.attribs['data-consent-wrap'] !== undefined) {
        const layout = consentImageLayout(node.attribs);
        attrs['data-consent-wrap'] = layout.wrap;
        attrs['data-consent-x'] = String(layout.x);
        attrs['data-consent-y'] = String(layout.y);
        attrs['data-consent-gap'] = String(layout.gap);
      }
      return [element('img', [], attrs)];
    }
    let content = children;
    if (styles['font-weight'] === 'bold' || Number(styles['font-weight']) >= 600) content = [element('strong', content)];
    if (styles['font-style'] === 'italic') content = [element('em', content)];
    if (styles['text-decoration']?.includes('underline') || styles['text-decoration-line']?.includes('underline')) content = [element('u', content)];
    if (tag === 'span') return content;
    return [element(tag, content, attrs)];
  };
  return document.children.flatMap(node => normalize(node, 0));
}
export function serializeConsentNodes(nodes: ConsentRichNode[]): string {
  return nodes.map(node => {
    if (node.type === 'text') return escapeConsentHtml(node.text);
    const attrs = Object.entries(node.attrs).map(([key, value]) => ` ${key}="${escapeConsentHtml(value)}"`).join('');
    return `<${node.tag}${attrs}>${['br', 'img'].includes(node.tag) ? '' : `${serializeConsentNodes(node.children)}</${node.tag}>`}`;
  }).join('');
}
export const sanitizeConsentHtml = (html: string) => serializeConsentNodes(parseConsentHtml(html));
export function consentHtmlText(html: string): string {
  const visit = (nodes: ConsentRichNode[]): string => nodes.map(node => node.type === 'text' ? node.text :
    node.tag === 'img' ? '' : node.tag === 'br' ? '\n' : visit(node.children) + (blocks.has(node.tag) ? '\n' : '')).join('');
  return visit(parseConsentHtml(html)).trim();
}
export function consentAssetIds(html: string): string[] {
  const ids = new Set<string>();
  const visit = (nodes: ConsentRichNode[]) => nodes.forEach(node => {
    if (node.type !== 'element') return;
    if (node.tag === 'img') ids.add(CONSENT_ASSET_URL.exec(node.attrs.src)![1]);
    visit(node.children);
  });
  visit(parseConsentHtml(html)); return [...ids];
}
export function validRichConsentPlaceholders(html: string): boolean {
  // Tokens must be whole text nodes; formatting cannot split a variable into broken fragments.
  const visit = (nodes: ConsentRichNode[]): boolean => nodes.every(node => node.type === 'element' ? visit(node.children) :
    !/[{}]{2}/.test(node.text.replace(tokenPattern, '')));
  return visit(parseConsentHtml(html));
}
export function plainConsentToHtml(text: string): string {
  let html = '', listOpen = false, listNumber = 0;
  for (const line of text.split(/\r?\n/)) {
    const numbered = /^(\d+)\.\s*(.+)$/.exec(line);
    if (numbered) {
      if (!listOpen) { html += `<ol start="${Number(numbered[1])}">`; listOpen = true; listNumber = Number(numbered[1]); }
      if (Number(numbered[1]) !== listNumber) { html += `</ol><ol start="${Number(numbered[1])}">`; listNumber = Number(numbered[1]); }
      html += `<li>${escapeConsentHtml(numbered[2])}</li>`; listNumber++;
      continue;
    }
    if (listOpen) { html += '</ol>'; listOpen = false; }
    if (!line.trim()) continue;
    const heading = line === line.toLocaleUpperCase() && line.length < 100;
    html += `<${heading ? 'h3' : 'p'}>${escapeConsentHtml(line)}</${heading ? 'h3' : 'p'}>`;
  }
  if (listOpen) html += '</ol>';
  return sanitizeConsentHtml(html);
}
export function consentBodyHtml(translation: { body: string; bodyFormat?: 'plain' | 'html' }): string {
  return translation.bodyFormat === 'html' ? sanitizeConsentHtml(translation.body) : plainConsentToHtml(translation.body);
}
export function consentBodyText(translation: { body: string; bodyFormat?: 'plain' | 'html' }): string {
  return translation.bodyFormat === 'html' ? consentHtmlText(translation.body) : translation.body;
}
