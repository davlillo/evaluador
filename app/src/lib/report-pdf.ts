// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import type { ClassRubricResult, ComparisonResult } from '@/types/comparison';
import { criterionRows, autoFeedback, verdict } from '@/lib/report-criteria';
import { buildGradingSheet } from '@/lib/grading-sheet';

/**
 * Generación del "Acta de Evaluación" en PDF: portada institucional UES,
 * resumen ejecutivo (nota + veredicto + retroalimentación) y tabla de desglose
 * por criterio. Es el espejo imprimible de la pantalla /reporte (ReportPage).
 */

// Rojo UES (aprox. hsl(0 68% 34%) → RGB).
const UES_RED: [number, number, number] = [146, 26, 26];

export function resolveDiagramTypeLabel(diagramType: string | undefined): string {
  if (!diagramType || diagramType === '' || diagramType === 'class') return 'Diagrama de clases';
  if (diagramType === 'usecase') return 'Casos de uso';
  if (diagramType === 'sequence') return 'Diagrama de secuencia';
  return diagramType;
}

function sanitizeBasename(name: string): string {
  // los caracteres de control son justamente lo que hay que sacar de un nombre de archivo
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'reporte';
}

/** Carné = nombre base del archivo entregado (sin extensión). */
export function extractCarnetFromStudentFile(studentFileName: string | null | undefined): string {
  const raw = studentFileName?.trim();
  if (!raw) return 'No indicado';
  const base = raw.replace(/\.[^.]+$/, '').trim();
  return base || 'No indicado';
}

export function buildPdfFilename(studentFileName: string | null | undefined): string {
  const raw = studentFileName?.trim();
  if (!raw) return 'acta-evaluacion.pdf';
  const base = raw.replace(/\.[^.]+$/, '');
  return `${sanitizeBasename(base || 'acta')}.pdf`;
}

export function buildBatchDiagramPdfFilename(diagramType: string): string {
  const names: Record<string, string> = {
    class: 'diagrama-clases.pdf',
    usecase: 'diagrama-casos-uso.pdf',
    sequence: 'diagrama-secuencia.pdf',
  };
  return names[diagramType] ?? `diagrama-${sanitizeBasename(diagramType)}.pdf`;
}

export function sanitizeZipFolderName(studentId: string): string {
  return sanitizeBasename(studentId) || 'estudiante';
}

export function buildConsolidatedPdfFilename(studentId: string): string {
  return `${sanitizeBasename(studentId) || 'estudiante'}-consolidado.pdf`;
}

/** Toda acta sale firmada: en el pie y en las propiedades del archivo PDF. */
function newActaDocument(): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({
    title: 'Acta de Evaluación — UML Evaluador',
    author: 'davlillos',
    creator: 'UML Evaluador — davlillos',
    subject: 'Evaluación de diagramas UML',
  });
  return doc;
}

function lastAutoTableY(doc: jsPDF): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY;
}

/** Franja roja UES con título; retorna el Y donde continúa el contenido. */
function drawHeader(doc: jsPDF, title: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const headerH = 26;
  doc.setFillColor(...UES_RED);
  doc.rect(0, 0, pageW, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, margin, 12);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text('UML Evaluador · Universidad de El Salvador', margin, 19);
  doc.setTextColor(0, 0, 0);
  return headerH + 10;
}

function hasRubric(result: ComparisonResult): boolean {
  return (result.class_rubric_breakdown?.length ?? 0) > 0;
}

function formatWeight(weight: number): string {
  const rounded = Math.round(weight * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/**
 * Resumen ejecutivo: nota + chip aprobado/reprobado. Con rúbrica del docente
 * la nota va con dos decimales, como en su hoja, y sin "similitud": es jerga
 * del motor que no le dice nada al estudiante ni al docente.
 */
function drawExecutiveSummary(doc: jsPDF, y: number, pct: number, rubric = false): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const textW = pageW - margin * 2;
  const rubricNota = Math.round(pct * 10) / 100;
  const { nota, aprobado } = rubric
    ? { nota: rubricNota, aprobado: rubricNota >= 6 }
    : verdict(pct);

  doc.setDrawColor(220, 226, 235);
  doc.setFillColor(248, 249, 251);
  doc.roundedRect(margin, y, textW, 30, 2, 2, 'FD');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...UES_RED);
  doc.text('RESUMEN EJECUTIVO', margin + 4, y + 7);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    rubric ? 'Calificado con la rúbrica del docente.' : `Similitud global: ${pct.toFixed(1)}%`,
    margin + 4,
    y + 15,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Nota final: ${nota.toFixed(rubric ? 2 : 1)} / 10`, margin + 4, y + 24);
  const chipLabel = aprobado ? 'APROBADO' : 'REPROBADO';
  const chipColor: [number, number, number] = aprobado ? [34, 160, 90] : [200, 45, 45];
  doc.setFillColor(...chipColor);
  doc.roundedRect(pageW - margin - 42, y + 16, 38, 9, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(chipLabel, pageW - margin - 23, y + 22, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  return y + 36;
}

/** Lo que va en "Observaciones": lo del docente primero; si no escribió nada, la explicación del motor. */
function observationText(row: ClassRubricResult | undefined): string {
  if (!row) return '';
  if (row.edited_by_teacher) {
    return ['Corregido por el docente.', row.observation].filter(Boolean).join(' ');
  }
  return row.observation || row.message || '';
}

/**
 * El desglose con la forma de la hoja del docente: sus seis columnas, la
 * sección "Relaciones" y cada relación como encabezado con sus
 * multiplicidades debajo, igual que en su Excel.
 */
function drawRubricSheet(doc: jsPDF, y: number, result: ComparisonResult): number {
  const margin = 14;
  const breakdown = result.class_rubric_breakdown ?? [];
  const sheet = buildGradingSheet(breakdown);
  const byRule = new Map(breakdown.map((row) => [row.rule_id, row]));
  const relationshipsWeight = sheet.rows
    .filter((row) => row.criterionType !== 'classes')
    .reduce((sum, row) => sum + row.weight, 0);
  const padding = (left: number) => ({ top: 1.4, bottom: 1.4, left, right: 1.5 });

  const body: RowInput[] = [];
  let sectionDone = false;
  for (const group of sheet.groups) {
    const isRelationship = group.rows.some((row) => row.criterionType !== 'classes');
    if (isRelationship && !sectionDone) {
      sectionDone = true;
      body.push([
        { content: 'Relaciones', styles: { fontStyle: 'bold' } },
        { content: formatWeight(relationshipsWeight), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: '', colSpan: 4 },
      ]);
    }
    if (group.label) {
      body.push([{
        content: group.label,
        colSpan: 6,
        styles: { fontStyle: 'bold', fillColor: [243, 244, 246], cellPadding: padding(4) },
      }]);
    }
    for (const row of group.rows) {
      const topLevel = !group.label;
      body.push([
        {
          content: row.label,
          styles: {
            fontStyle: topLevel ? 'bold' : 'normal',
            cellPadding: padding(topLevel ? (row.criterionType === 'classes' ? 1.5 : 4) : 8),
          },
        },
        formatWeight(row.weight),
        String(row.expected),
        String(row.modeled),
        row.weightedScore.toFixed(2),
        observationText(byRule.get(row.ruleId)),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Criterio', '%', 'Esperados', 'Modelados', 'Nota ponderada', 'Observaciones']],
    body,
    // el pie no hereda la alineación de columnStyles: los números van a mano
    foot: [[
      'Total',
      { content: formatWeight(sheet.totalWeight), styles: { halign: 'right' } },
      '',
      '',
      { content: sheet.nota.toFixed(2), styles: { halign: 'right' } },
      '',
    ]],
    showFoot: 'lastPage',
    headStyles: { fillColor: UES_RED, textColor: [255, 255, 255], fontSize: 8 },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.4, overflow: 'linebreak', valign: 'top' },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { halign: 'right', cellWidth: 11 },
      2: { halign: 'right', cellWidth: 17 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 20 },
      5: { fontSize: 7, textColor: [85, 85, 85] },
    },
    margin: { left: margin, right: margin },
  });
  return lastAutoTableY(doc) + 8;
}

/** Tabla docente detallada para un ComparisonResult. */
function drawCriteriaTable(doc: jsPDF, y: number, result: ComparisonResult, heading = 'Desglose por criterio'): number {
  const margin = 14;
  const rows = criterionRows(result);
  const rubric = hasRubric(result);

  const fb = autoFeedback(result);
  const pageW = doc.internal.pageSize.getWidth();
  const textW = pageW - margin * 2;
  const strengthsLabel = rubric ? 'Cumplió: ' : 'Fortalezas: ';
  const gapsLabel = rubric ? 'Le faltó: ' : 'A mejorar: ';
  doc.setFontSize(9.5);
  if (fb.strengths.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(strengthsLabel, margin, y);
    doc.setFont('helvetica', 'normal');
    const t = doc.splitTextToSize(fb.strengths.join('; ') + '.', textW - 24);
    doc.text(t, margin + 22, y);
    y += t.length * 5 + 2;
  }
  if (fb.gaps.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(gapsLabel, margin, y);
    doc.setFont('helvetica', 'normal');
    const t = doc.splitTextToSize(fb.gaps.join('; ') + '.', textW - 22);
    doc.text(t, margin + 22, y);
    y += t.length * 5 + 2;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...UES_RED);
  doc.text(heading, margin, y);
  doc.setTextColor(0, 0, 0);
  y += 3;
  if (rubric) return drawRubricSheet(doc, y, result);
  autoTable(doc, {
    startY: y,
    head: [['Criterio', 'Esperado', 'Modelado', 'Puntaje', 'Peso', 'Aporte', 'Detalle']],
    body: rows.map((r) => [
      r.label,
      r.expected ?? '—',
      r.modeled ?? '—',
      `${r.similarity.toFixed(0)}%`,
      `${r.weight}%`,
      `${r.contribution.toFixed(1)}%`,
      r.detail ?? '—',
    ]),
    headStyles: { fillColor: UES_RED, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 18 },
      2: { cellWidth: 28 },
      3: { halign: 'right', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 12 },
      5: { halign: 'right', cellWidth: 14 },
    },
    margin: { left: margin, right: margin },
  });
  return lastAutoTableY(doc) + 8;
}

function drawFooter(doc: jsPDF): void {
  const margin = 14;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Generado por UML Evaluador · desarrollado por davlillos · ${new Date().toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}`,
    margin,
    doc.internal.pageSize.getHeight() - 10,
  );
}

export function buildDetailedReportPdfDocument(params: {
  result: ComparisonResult;
  studentFileName: string | null;
}): jsPDF {
  const { result, studentFileName } = params;
  const doc = newActaDocument();
  const margin = 14;

  const carnet = extractCarnetFromStudentFile(studentFileName);
  const diagramLabel = resolveDiagramTypeLabel(result.diagram_type);
  const fecha = new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = drawHeader(doc, 'Acta de Evaluación');

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: [
      ['Estudiante / Carné', carnet, 'Fecha', fecha],
      ['Tipo de diagrama', diagramLabel, 'Referencia', 'Solución del docente'],
    ],
    styles: { fontSize: 9.5, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [110, 110, 110] },
      2: { fontStyle: 'bold', textColor: [110, 110, 110] },
    },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTableY(doc) + 8;

  y = drawExecutiveSummary(doc, y, result.overall_similarity, hasRubric(result));
  drawCriteriaTable(doc, y, result);
  drawFooter(doc);

  return doc;
}

export function generateDetailedReportPdfArrayBuffer(params: {
  result: ComparisonResult;
  studentFileName: string | null;
}): ArrayBuffer {
  return buildDetailedReportPdfDocument(params).output('arraybuffer') as ArrayBuffer;
}

export function downloadDetailedReportPdf(params: {
  result: ComparisonResult;
  studentFileName: string | null;
}): void {
  const filename = buildPdfFilename(params.studentFileName);
  buildDetailedReportPdfDocument(params).save(filename);
}

const DIAGRAM_ORDER = ['class', 'usecase', 'sequence'] as const;

export interface ConsolidatedDiagramEntry {
  diagramType: (typeof DIAGRAM_ORDER)[number];
  result: ComparisonResult;
}

/**
 * Acta consolidada de un estudiante: un solo PDF con el resumen ejecutivo
 * global (similitud + nota + veredicto, calculados sobre el final_score ya
 * ponderado por el backend) y, a continuación, el desglose de cada uno de
 * los diagramas evaluados. Complementa (no reemplaza) las actas
 * por-diagrama que ya genera buildDetailedReportPdfDocument.
 */
export function buildConsolidatedReportPdfDocument(params: {
  studentId: string;
  finalScore: number;
  globalWeights: { class: number; usecase: number; sequence: number };
  diagrams: ConsolidatedDiagramEntry[];
}): jsPDF {
  const { studentId, finalScore, globalWeights } = params;
  const diagrams = [...params.diagrams].sort(
    (a, b) => DIAGRAM_ORDER.indexOf(a.diagramType) - DIAGRAM_ORDER.indexOf(b.diagramType),
  );
  const doc = newActaDocument();
  const margin = 14;
  const pageH = doc.internal.pageSize.getHeight();
  const fecha = new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = drawHeader(doc, 'Acta de Evaluación Consolidada');

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: [
      ['Estudiante / Carné', studentId, 'Fecha', fecha],
      ['Diagramas evaluados', diagrams.map((d) => resolveDiagramTypeLabel(d.diagramType)).join(', '), 'Referencia', 'Solución del docente'],
    ],
    styles: { fontSize: 9.5, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [110, 110, 110] },
      2: { fontStyle: 'bold', textColor: [110, 110, 110] },
    },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTableY(doc) + 8;

  const onlyRubric = diagrams.length === 1 && hasRubric(diagrams[0].result);
  y = drawExecutiveSummary(doc, y, finalScore, onlyRubric);

  // Con un solo diagrama la tabla por diagrama repite el resumen: se omite.
  if (diagrams.length > 1) {
    const weightByType: Record<string, number> = {
      class: globalWeights.class,
      usecase: globalWeights.usecase,
      sequence: globalWeights.sequence,
    };
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...UES_RED);
    doc.text('Resumen por diagrama', margin, y);
    doc.setTextColor(0, 0, 0);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Diagrama', 'Similitud', 'Peso global']],
      body: diagrams.map((d) => [
        resolveDiagramTypeLabel(d.diagramType),
        `${d.result.overall_similarity.toFixed(1)}%`,
        `${weightByType[d.diagramType] ?? 0}%`,
      ]),
      headStyles: { fillColor: UES_RED, textColor: [255, 255, 255], fontSize: 10 },
      styles: { fontSize: 9.5, cellPadding: 2 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: margin, right: margin },
    });
    y = lastAutoTableY(doc) + 10;
  } else {
    y += 2;
  }

  for (const { diagramType, result } of diagrams) {
    // Si el desglose no entra en lo que queda de página, empezar una nueva.
    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
    }
    y = drawCriteriaTable(doc, y, result, `Desglose — ${resolveDiagramTypeLabel(diagramType)}`);
  }

  drawFooter(doc);
  return doc;
}

export function downloadConsolidatedReportPdf(params: {
  studentId: string;
  finalScore: number;
  globalWeights: { class: number; usecase: number; sequence: number };
  diagrams: ConsolidatedDiagramEntry[];
}): void {
  const filename = buildConsolidatedPdfFilename(params.studentId);
  buildConsolidatedReportPdfDocument(params).save(filename);
}

export function generateConsolidatedReportPdfArrayBuffer(params: {
  studentId: string;
  finalScore: number;
  globalWeights: { class: number; usecase: number; sequence: number };
  diagrams: ConsolidatedDiagramEntry[];
}): ArrayBuffer {
  return buildConsolidatedReportPdfDocument(params).output('arraybuffer') as ArrayBuffer;
}
