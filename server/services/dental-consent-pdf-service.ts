import PDFDocument from 'pdfkit';
import { plainConsentToHtml } from '../../shared/dental-consent-rich-text';
import { CONSENT_DOCUMENT_LABELS, CONSENT_TEMPLATE_PREVIEW_SAMPLE, fillConsentPlaceholders, type ConsentPreviewFields } from '../../shared/dental-consent';
import { renderConsentRichPdf, type ConsentPdfImages } from './dental-consent-rich-pdf';

export type ConsentPdfInput = ConsentPreviewFields & {
  title: string; body: string; patientName: string; patientReference: string;
  companyName: string; address?: string; phone?: string; email?: string; taxId?: string;
  logo?: Buffer | null; timezone: string; printedAt?: Date;
  bodyFormat?: 'plain' | 'html'; images?: ConsentPdfImages;
  samplePreview?: boolean;
  providerSignature?: Buffer | null;
  customVariables?: Record<string, string>;
  variableImages?: Record<string, { id: string; width: number }>;
  detailsHtml?: string;
};

export async function generateDentalConsentPdf(input: ConsentPdfInput): Promise<Buffer> {
  const labels = CONSENT_DOCUMENT_LABELS[input.language];
  const locale = input.language === 'es' ? 'es-CO' : 'en-GB';
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${input.consentDate}T12:00:00Z`));
  const printed = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: input.timezone })
    .format(input.printedAt ?? new Date());
  const variables = { ...input.customVariables, patientName: input.patientName, professionalName: input.professionalName, guardianName: input.guardianName, consentDate: date };
  const body = fillConsentPlaceholders(input.body, variables);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true,
    info: { Title: `${labels.title} - ${input.title}`, Author: input.companyName } });
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  const left = 40, width = doc.page.width - 80, bottom = doc.page.height - 55;
  let y = 40;
  const text = (value: string, bold = false, size = 9.5) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#111111');
    doc.text(value, left, y, { width, lineGap: 2 });
    y = doc.y + 3;
  };
  const rule = () => { doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor('#555555').stroke(); y += 7; };
  const header = () => {
    y = 40;
    if (input.logo) {
      try { doc.image(input.logo, left, y, { fit: [45, 30] }); } catch { /* Branding must not prevent printing. */ }
    }
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#111111')
      .text(labels.title, left + 50, y + 5, { width: width - 100, align: 'center' });
    y = 78;
    if (input.samplePreview) text(CONSENT_TEMPLATE_PREVIEW_SAMPLE[input.language].label, true, 9);
    rule(); text(input.companyName, true, 10);
    if (input.address) text(`${labels.address}: ${input.address}`);
    const contact = [input.phone && `${labels.phone}: ${input.phone}`, input.email && `${labels.email}: ${input.email}`,
      input.taxId && `${labels.taxId}: ${input.taxId}`].filter(Boolean).join('   |   ');
    if (contact) text(contact);
    rule();
    text(`${labels.patient}: ${input.patientName}`, true);
    text(`${labels.reference}: ${input.patientReference}   |   ${labels.identification}: ${input.patientIdentification || '________________'}`);
    text(`${labels.professional}: ${input.professionalName}`);
    text(`${labels.consentDate}: ${date}   |   ${labels.printed}: ${printed}`);
    if (input.guardianName) text(`${labels.guardian}: ${input.guardianName}`);
    text(`${labels.procedure}: ${input.title}`, true);
    y += 6;
  };
  const newPage = () => { doc.addPage(); header(); };
  header();
  if (input.detailsHtml) {
    y = renderConsentRichPdf(doc, { html: input.detailsHtml, images: input.images ?? {}, variableImages: input.variableImages, variables, left, width, bottom, y,
      newPage: () => { newPage(); return y; } });
    y += 8;
  }
  if (input.bodyFormat === 'html' || Object.keys(input.variableImages ?? {}).length) {
    y = renderConsentRichPdf(doc, { html: input.bodyFormat === 'html' ? input.body : plainConsentToHtml(input.body), images: input.images ?? {}, left, width, bottom, y,
      variables, variableImages: input.variableImages,
      newPage: () => { newPage(); return y; } });
  } else {
  // Explicit line layout keeps every page header and final signatures out of flowing text.
  for (const paragraph of body.split(/\r?\n/)) {
    if (!paragraph.trim()) { y += 7; continue; }
    const heading = paragraph === paragraph.toLocaleUpperCase(input.language) && paragraph.length < 100;
    doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const lines: string[] = [];
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && doc.widthOfString(`${line} ${word}`) > width) { lines.push(line); line = ''; }
      if (doc.widthOfString(word) > width) {
        for (const char of word) {
          if (doc.widthOfString(line + char) > width) { lines.push(line); line = ''; }
          line += char;
        }
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    if (heading && y + 40 > bottom) newPage();
    for (const value of lines) {
      if (y + 14 > bottom) newPage();
      doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111111');
      doc.text(value, left, y, { width, lineBreak: false });
      y += 13.5;
    }
    y += 3;
  }
  }
  const gap = 20, signatureWidth = (width - 2 * gap) / 3;
  doc.font('Helvetica-Bold').fontSize(8);
  const captionHeight = Math.max(...[labels.patientSignature, labels.professionalSignature, labels.guardianSignature].map(label => doc.heightOfString(label, { width: signatureWidth })));
  doc.font('Helvetica').fontSize(8);
  const professionalHeight = doc.heightOfString(input.professionalName, { width: signatureWidth });
  if (y + Math.max(85, 55 + 6 + captionHeight + 4 + professionalHeight + 8) > bottom) newPage();
  y += 55;
  if (input.providerSignature) doc.image(input.providerSignature, left + signatureWidth + gap + 4, y - 46, { fit: [signatureWidth - 8, 42], align: 'center', valign: 'bottom' });
  [labels.patientSignature, labels.professionalSignature, labels.guardianSignature].forEach((label, index) => {
    const x = left + index * (signatureWidth + gap);
    doc.moveTo(x, y).lineTo(x + signatureWidth, y).lineWidth(0.5).strokeColor('#333333').stroke();
    doc.font('Helvetica-Bold').fontSize(8).text(label, x, y + 6, { width: signatureWidth, align: 'center' });
    if (index === 1) doc.font('Helvetica').fontSize(8).text(input.professionalName, x, y + 6 + captionHeight + 4, { width: signatureWidth, align: 'center' });
  });
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#555555')
      .text(`${labels.page} ${i + 1} ${labels.of} ${range.count}`, left, doc.page.height - 35,
        { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return completed;
}
