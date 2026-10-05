import type PDFDocument from 'pdfkit';
import { parseConsentHtml, CONSENT_ASSET_URL, consentImageLayout, type ConsentImageLayout, type ConsentAlignment, type ConsentRichNode } from '../../shared/dental-consent-rich-text';
import { fillConsentPlaceholders, type CONSENT_PLACEHOLDERS } from '../../shared/dental-consent';

type Style = { bold?: boolean; italic?: boolean; underline?: boolean; link?: string };
type ImageRun = ConsentImageLayout & { id: string; width?: number };
type Run = Style & { text: string; image?: ImageRun };
type Context = Style & { size: number; alignment: ConsentAlignment; indent: number; heading?: boolean; marker?: { text: string; used: boolean } };
type Block = { kind: 'text'; runs: Run[]; context: Context; marker?: string } | {
  kind: 'image'; id: string; width?: number; alignment: ConsentAlignment; indent: number;
};
export type ConsentPdfImages = Record<string, { content: Buffer; width: number; height: number }>;
type Variables = Record<string, string>;
type VariableImages = Record<string, { id: string; width: number }>;
const alignmentOf = (node: Extract<ConsentRichNode, { type: 'element' }>, fallback: ConsentAlignment): ConsentAlignment =>
  (node.attrs.style?.split(':')[1] as ConsentAlignment) || fallback;

function richBlocks(html: string, variables: Variables, variableImages: VariableImages = {}): Block[] {
  const result: Block[] = [];
  const walk = (nodes: ConsentRichNode[], context: Context) => {
    let runs: Run[] = [];
    const flush = (force = false) => {
      if (!force && !runs.some(run => run.text.trim() || run.image)) { runs = []; return; }
      const marker = context.marker && !context.marker.used ? context.marker.text : undefined;
      if (context.marker) context.marker.used = true;
      result.push({ kind: 'text', runs, context, marker }); runs = [];
    };
    const inline = (node: ConsentRichNode, style: Style) => {
      if (node.type === 'text') { runs.push({ ...style, text: fillConsentPlaceholders(node.text, variables) }); return; }
      const { tag, children } = node;
      const fieldImage = variableImages[node.attrs['data-consent-placeholder']];
      if (fieldImage) {
        flush(); result.push({ kind: 'image', ...fieldImage, alignment: 'left', indent: context.indent });
        runs.push({ ...style, text: variables[node.attrs['data-consent-placeholder']] || '' }); flush(); return;
      }
      if (tag === 'br') { runs.push({ text: '\n', ...style }); return; }
      if (tag === 'img') {
        const layout = consentImageLayout({ ...node.attrs, style: node.attrs.style || `text-align:${context.alignment}` });
        if (layout.wrap !== 'break') {
          runs.push({ ...style, text: '', image: { ...layout, id: CONSENT_ASSET_URL.exec(node.attrs.src)![1], width: Number(node.attrs.width) || undefined } }); return;
        }
        flush();
        result.push({ kind: 'image', id: CONSENT_ASSET_URL.exec(node.attrs.src)![1], width: Number(node.attrs.width) || undefined,
          alignment: alignmentOf(node, context.alignment), indent: context.indent }); return;
      }
      if (tag === 'ul' || tag === 'ol') {
        flush(); let index = Number(node.attrs.start) || 1;
        const count = children.filter(child => child.type === 'element' && child.tag === 'li').length;
        const markerIndent = tag === 'ol' ? Math.max(18, String(index + count - 1).length * context.size * 0.6 + 9) : 18;
        for (const child of children) {
          if (child.type !== 'element' || child.tag !== 'li') continue;
          walk(child.children, { ...context, ...style, indent: context.indent + markerIndent, heading: false,
            marker: { text: tag === 'ol' ? `${index++}.` : '•', used: false } });
        }
        return;
      }
      if (['p', 'div', 'h1', 'h2', 'h3', 'li'].includes(tag)) {
        flush();
        const heading = /^h[123]$/.test(tag);
        const childContext = { ...context, ...style, alignment: alignmentOf(node, context.alignment),
          size: heading ? { h1: 16, h2: 13, h3: 11 }[tag]! : context.size,
          bold: heading || style.bold, heading };
        if (!children.length) result.push({ kind: 'text', runs: [], context: childContext });
        else walk(children, childContext);
        return;
      }
      const childStyle = { ...style, bold: style.bold || tag === 'strong', italic: style.italic || tag === 'em',
        underline: style.underline || tag === 'u', link: tag === 'a' ? node.attrs.href : style.link };
      children.forEach(child => inline(child, childStyle));
    };
    nodes.forEach(node => inline(node, context)); flush();
  };
  walk(parseConsentHtml(html), { size: 10, alignment: 'left', indent: 0 });
  return result;
}
const font = (run: Style) => run.bold ? run.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold' : run.italic ? 'Helvetica-Oblique' : 'Helvetica';

/** Page-local display lists keep behind/front images in the correct layer without covering document chrome. */
export function renderConsentRichPdf(doc: InstanceType<typeof PDFDocument>, options: {
  html: string; variables: Variables; variableImages?: VariableImages; images: ConsentPdfImages; left: number; width: number; bottom: number;
  y: number; newPage: () => number;
}): number {
  let y = options.y, pageTop = y, extent = y;
  let draws: Array<{ layer: number; draw: () => void }> = [];
  let exclusions: Array<{ left: number; right: number; top: number; bottom: number; side: 'left' | 'right' }> = [];
  const flushPage = () => { draws.sort((a, b) => a.layer - b.layer).forEach(item => item.draw()); draws = []; };
  const page = () => { flushPage(); y = options.newPage(); pageTop = y; extent = y; exclusions = []; };
  const dimensions = (id: string, requested: number | undefined, available: number) => {
    const image = options.images[id]; if (!image) throw new Error('Consent image unavailable');
    let width = Math.min(available, (requested || image.width) * 0.75), height = width * image.height / image.width;
    const maxHeight = options.bottom - pageTop - 20;
    if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
    return { width, height };
  };
  const drawImage = (id: string, x: number, top: number, width: number, height: number, layer = 1) => {
    draws.push({ layer, draw: () => { doc.image(options.images[id].content, x, top, { width, height }); } });
    extent = Math.max(extent, top + height + 8);
  };
  const segment = (left: number, right: number, top: number, height: number) => {
    for (const box of exclusions) {
      if (top + height <= box.top || top >= box.bottom) continue;
      if (box.side === 'left') left = Math.max(left, box.right);
      else right = Math.min(right, box.left);
    }
    return { left, width: Math.max(0, right - left) };
  };
  const blocks = richBlocks(options.html, options.variables, options.variableImages);
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.kind === 'image') {
      y = Math.max(y, ...exclusions.map(box => box.bottom));
      const indent = Math.min(block.indent, options.width - 100);
      let { width, height } = dimensions(block.id, block.width, options.width - indent);
      const previous = blocks[blockIndex - 1];
      if (y + height + 8 > options.bottom && !(previous?.kind === 'text' && previous.context.heading)) page();
      if (y + height + 8 > options.bottom) { const scale = (options.bottom - y - 8) / height; width *= scale; height *= scale; }
      const x = options.left + indent + (block.alignment === 'center' ? (options.width - indent - width) / 2 : block.alignment === 'right' ? options.width - indent - width : 0);
      drawImage(block.id, x, y, width, height); y += height + 8; continue;
    }
    const context = { ...block.context, indent: Math.min(block.context.indent, options.width - 100) };
    const left = options.left + context.indent, available = options.width - context.indent, lineHeight = context.size * 1.35;
    const floating = block.runs.flatMap(run => run.image && run.image.wrap !== 'inline' ? [run.image] : []);
    if (context.heading && y + lineHeight * 2 + 22 > options.bottom) page();
    let required = lineHeight;
    for (const image of floating) {
      const size = dimensions(image.id, image.width, available);
      const remaining = (available - size.width) * (image.x <= 0.5 ? 1 - image.x : image.x) - image.gap * 0.75;
      const tail = image.wrap === 'wrap' && remaining < 24 ? image.gap * 0.75 + lineHeight + 7 : 8;
      required = Math.max(required, Math.min(image.y * 0.75 + size.height + tail, options.bottom - pageTop));
    }
    if (y + required > options.bottom) page();
    for (const image of floating) {
      let { width, height } = dimensions(image.id, image.width, available);
      const remaining = (available - width) * (image.x <= 0.5 ? 1 - image.x : image.x) - image.gap * 0.75;
      const tail = image.wrap === 'wrap' && remaining < 24 ? image.gap * 0.75 + lineHeight + 7 : 8;
      const offsetY = Math.min(image.y * 0.75, Math.max(0, options.bottom - y - height - tail));
      if (y + offsetY + height + tail > options.bottom) { const scale = (options.bottom - y - offsetY - tail) / height; width *= scale; height *= scale; }
      const x = left + (available - width) * image.x, top = y + offsetY, gap = image.gap * 0.75;
      drawImage(image.id, x, top, width, height, image.wrap === 'behind' ? 0 : image.wrap === 'front' ? 2 : 1);
      if (image.wrap === 'wrap') exclusions.push({ left: x - gap, right: x + width + gap, top: top - gap, bottom: top + height + gap, side: image.x <= 0.5 ? 'left' : 'right' });
    }
    type Piece = Run & { width: number; height: number };
    const tokens: Piece[] = [];
    for (const run of block.runs) {
      if (run.image) {
        if (run.image.wrap === 'inline') tokens.push({ ...run, ...dimensions(run.image.id, run.image.width, available) });
        continue;
      }
      doc.font(font(run)).fontSize(context.size);
      for (const token of run.text.split(/(\n|[^\S\n]+)/).filter(Boolean)) {
        const text = token === '\n' ? token : /^\s+$/.test(token) ? ' ' : token;
        tokens.push({ ...run, text, width: text === '\n' ? 0 : doc.widthOfString(text), height: lineHeight });
      }
    }
    if (!tokens.length) { if (!floating.length) y += lineHeight + 7; continue; }
    let cursor = 0, firstLine = true;
    while (cursor < tokens.length) {
      if (y + lineHeight > options.bottom) page();
      let height = lineHeight;
      // Inline images determine the line box before exclusions and pagination are evaluated.
      let projectedWidth = 0;
      for (let i = cursor; i < tokens.length && projectedWidth <= available; i++) {
        if (tokens[i].text === '\n') break;
        projectedWidth += tokens[i].width;
        if (projectedWidth <= available) height = Math.max(height, tokens[i].height);
      }
      if (y + height > options.bottom) page();
      let space = segment(left, options.left + options.width, y, height);
      if (space.width < 24) {
        const bottoms = exclusions.filter(box => y + height > box.top && y < box.bottom).map(box => box.bottom);
        if (bottoms.length) { y = Math.min(...bottoms); continue; }
        space = { left, width: available };
      }
      const pieces: Piece[] = []; let width = 0, hardBreak = false;
      while (cursor < tokens.length) {
        const piece = tokens[cursor];
        if (piece.text === '\n') { cursor++; hardBreak = true; break; }
        if (!pieces.length && piece.text === ' ') { cursor++; continue; }
        if (width + piece.width > space.width) {
          if (pieces.length) break;
          if (piece.image) {
            // Wait until the exclusion ends instead of shrinking an inline image beside a float.
            const bottoms = exclusions.filter(box => y + height > box.top && y < box.bottom).map(box => box.bottom);
            if (bottoms.length) { y = Math.min(...bottoms); break; }
          } else {
            doc.font(font(piece)).fontSize(context.size);
            const chars = Array.from(piece.text); let count = 0, measured = 0;
            while (count < chars.length && measured + doc.widthOfString(chars[count]) <= space.width) measured += doc.widthOfString(chars[count++]);
            count = Math.max(1, count);
            const prefix = chars.slice(0, count).join(''), rest = chars.slice(count).join('');
            tokens.splice(cursor, 1, { ...piece, text: prefix, width: doc.widthOfString(prefix) }, ...(rest ? [{ ...piece, text: rest, width: doc.widthOfString(rest) }] : []));
            continue;
          }
        }
        pieces.push(piece); width += piece.width; cursor++;
      }
      if (!pieces.length && !hardBreak) continue;
      while (pieces.length && pieces.at(-1)!.text === ' ') width -= pieces.pop()!.width;
      height = Math.max(lineHeight, ...pieces.map(piece => piece.height));
      let x = space.left + (context.alignment === 'center' ? (space.width - width) / 2 : context.alignment === 'right' ? space.width - width : 0);
      const spaces = pieces.filter(piece => piece.text === ' ').length;
      const extra = context.alignment === 'justify' && cursor < tokens.length && !hardBreak && spaces ? (space.width - width) / spaces : 0;
      const top = y, marker = firstLine ? block.marker : undefined;
      if (marker) {
        const markerX = left;
        draws.push({ layer: 1, draw: () => { doc.font('Helvetica').fontSize(context.size).fillColor('#111111'); doc.text(marker, markerX - doc.widthOfString(marker) - 6, top, { lineBreak: false }); } });
      }
      for (const piece of pieces) {
        const pieceX = x;
        if (piece.image) drawImage(piece.image.id, pieceX, top + height - piece.height, piece.width, piece.height);
        else {
          const textY = top + height - lineHeight;
          draws.push({ layer: 1, draw: () => {
            doc.font(font(piece)).fontSize(context.size).fillColor(piece.link ? '#1d4ed8' : '#111111').text(piece.text, pieceX, textY, { lineBreak: false });
            if (piece.underline || piece.link) doc.save().lineWidth(0.5).strokeColor(piece.link ? '#1d4ed8' : '#111111').moveTo(pieceX, textY + context.size).lineTo(pieceX + piece.width, textY + context.size).stroke().restore();
            if (piece.link) doc.link(pieceX, textY, piece.width, lineHeight, piece.link);
          } });
        }
        x += piece.width + (piece.text === ' ' ? extra : 0);
      }
      y += height; firstLine = false;
    }
    y += context.heading ? 5 : 7;
  }
  flushPage();
  return Math.max(y, extent, ...exclusions.map(box => box.bottom));
}
