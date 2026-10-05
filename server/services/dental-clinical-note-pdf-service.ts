import PDFDocument from 'pdfkit';
import type { DentalClinicalNote, DentalClinicalNoteRevision } from '@shared/schema';

type RevisionWithActor = DentalClinicalNoteRevision & { actorName: string | null };

type ProgressNotePdfInput = {
  note: DentalClinicalNote & { authorName?: string | null };
  revisions: RevisionWithActor[];
  patientName: string;
  patientReference: string;
  companyName: string;
  language?: string | null;
};

function labels(language?: string | null) {
  const es = (language ?? '').toLowerCase().startsWith('es');
  return es ? {
    title: 'Evolución clínica', patient: 'Paciente', author: 'Autor', created: 'Creada',
    amended: 'Última modificación', plan: 'Plan de tratamiento', teeth: 'Piezas', private: 'Privada',
    yes: 'Sí', no: 'No', history: 'Historial de auditoría', reason: 'Motivo', voided: 'ANULADA',
    actions: { create: 'Creada', amend: 'Modificada', void: 'Anulada' } as Record<string, string>,
  } : {
    title: 'Clinical Progress Note', patient: 'Patient', author: 'Author', created: 'Created',
    amended: 'Last amended', plan: 'Treatment plan', teeth: 'Teeth', private: 'Private',
    yes: 'Yes', no: 'No', history: 'Audit history', reason: 'Reason', voided: 'VOID',
    actions: { create: 'Created', amend: 'Amended', void: 'Voided' } as Record<string, string>,
  };
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export async function generateDentalClinicalNotePdf(input: ProgressNotePdfInput): Promise<Buffer> {
  const l = labels(input.language);
  const doc = new PDFDocument({ size: 'A4', margin: 54, info: { Title: `${l.title} #${input.note.id}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (input.note.voidedAt) {
    doc.save().fillColor('#dc2626').opacity(0.12).fontSize(72).rotate(-32, { origin: [300, 410] })
      .text(l.voided, 70, 360, { width: 500, align: 'center' }).restore().opacity(1);
  }

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(20).text(input.companyName || '—');
  doc.moveDown(0.25).fontSize(16).text(`${l.title} #${input.note.id}`);
  doc.moveDown().font('Helvetica').fontSize(10);
  const rows: Array<[string, string]> = [
    [l.patient, `${input.patientName} (${input.patientReference})`],
    [l.author, input.note.authorName || '—'],
    [l.created, formatDate(input.note.createdAt)],
    [l.amended, formatDate(input.note.updatedAt)],
    [l.plan, input.note.treatmentPlanTitleSnapshot || '—'],
    [l.teeth, input.note.toothRefs?.join(', ') || '—'],
    [l.private, input.note.isPrivate ? l.yes : l.no],
  ];
  for (const [label, value] of rows) {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
  }
  if (input.note.voidedAt) {
    doc.moveDown(0.5).fillColor('#b91c1c').font('Helvetica-Bold').text(`${l.voided}: ${formatDate(input.note.voidedAt)}`);
    doc.font('Helvetica').text(`${l.reason}: ${input.note.voidReason || '—'}`).fillColor('#111827');
  }

  doc.moveDown().moveTo(doc.x, doc.y).lineTo(540, doc.y).strokeColor('#d1d5db').stroke();
  doc.moveDown().font('Helvetica').fontSize(11).fillColor('#111827').text(input.note.body, { lineGap: 3 });

  doc.addPage().font('Helvetica-Bold').fontSize(15).text(l.history);
  doc.moveDown(0.5);
  for (const revision of input.revisions) {
    doc.font('Helvetica-Bold').fontSize(10).text(
      `v${revision.revisionNumber} · ${l.actions[revision.action] ?? revision.action} · ${formatDate(revision.actedAt)} · ${revision.actorName || '—'}`,
    );
    if (revision.reason) doc.font('Helvetica-Oblique').text(`${l.reason}: ${revision.reason}`);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(revision.body, { lineGap: 2 });
    doc.moveDown().moveTo(doc.x, doc.y).lineTo(540, doc.y).strokeColor('#e5e7eb').stroke().moveDown();
  }

  doc.end();
  return completed;
}
