import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ComparisonResult, DiagramClass, DiagramInfo } from '@/types/comparison';

const relUc: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
  include: 'Include',
  extend: 'Extend',
};

const relClass: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
};

const visSymbol: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

export function resolveDiagramTypeLabel(diagramType: string | undefined): string {
  if (!diagramType || diagramType === '' || diagramType === 'class') {
    return 'Diagrama de clases';
  }
  if (diagramType === 'usecase') return 'Casos de uso';
  if (diagramType === 'sequence') return 'Diagrama de secuencia';
  return diagramType;
}

function sanitizeBasename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'reporte';
}

/** Carné = nombre base del archivo entregado (sin extensión), p. ej. GM23025.xmi → GM23025 */
export function extractCarnetFromStudentFile(studentFileName: string | null | undefined): string {
  const raw = studentFileName?.trim();
  if (!raw) return 'No indicado';
  const base = raw.replace(/\.[^.]+$/, '').trim();
  return base || 'No indicado';
}

/** Mismo nombre base que el archivo del estudiante, con extensión .pdf */
export function buildPdfFilename(studentFileName: string | null | undefined): string {
  const raw = studentFileName?.trim();
  if (!raw) return 'reporte-evaluacion.pdf';
  const base = raw.replace(/\.[^.]+$/, '');
  return `${sanitizeBasename(base || 'reporte')}.pdf`;
}

type PDFDoc = jsPDF & { lastAutoTable?: { finalY: number } };

function lastTableY(doc: jsPDF): number {
  return (doc as PDFDoc).lastAutoTable?.finalY ?? 20;
}

/** Título de sección con franja lateral (cuerpo del PDF). Devuelve Y siguiente. */
function drawSectionTitle(
  doc: jsPDF,
  margin: number,
  textW: number,
  topY: number,
  title: string,
): number {
  const h = 9;
  doc.setFillColor(236, 240, 247);
  doc.roundedRect(margin, topY, textW, h, 1.2, 1.2, 'F');
  doc.setFillColor(28, 42, 74);
  doc.rect(margin, topY, 1.4, h, 'F');
  doc.setTextColor(28, 42, 74);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(title, margin + 4, topY + 6);
  doc.setTextColor(0, 0, 0);
  return topY + h + 5;
}

function pageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - 16;
}

function ensureGap(doc: jsPDF, y: number, minNext: number): number {
  if (y + minNext > pageBottom(doc)) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function downloadDetailedReportPdf(params: {
  result: ComparisonResult;
  studentFileName: string | null;
}): void {
  const { result, studentFileName } = params;
  const diagramLabel = resolveDiagramTypeLabel(result.diagram_type);
  const carnet = extractCarnetFromStudentFile(studentFileName);
  const archivoEntrega =
    studentFileName?.trim() || result.student_diagram?.name || 'No disponible';
  const pct = result.overall_similarity;
  const filename = buildPdfFilename(studentFileName);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const textW = pageW - margin * 2;

  // Franja superior (cabecera)
  const headerH = 26;
  doc.setFillColor(28, 42, 74);
  doc.rect(0, 0, pageW, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('UML Evaluator', margin, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte detallado de evaluación', margin, 19);

  let y = headerH + 10;
  doc.setTextColor(0, 0, 0);

  // Tarjeta de metadatos
  const metaTop = y - 4;
  const simLabel = 'Porcentaje de similitud (comparación)';
  const simLine = `${pct.toFixed(2)} %`;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const metaLines = [
    `Tipo de diagrama: ${diagramLabel}`,
    `Alumno (carné): ${carnet}`,
    `Archivo entregado: ${archivoEntrega}`,
    `${simLabel}: ${simLine}`,
  ];
  // Altura: margen superior + título de bloque + líneas de datos + margen inferior
  let metaH = 6 + 7 + 2;
  for (const line of metaLines) {
    const wrapped = doc.splitTextToSize(line, textW - 8);
    metaH += wrapped.length * 5 + 1;
  }
  metaH += 6;
  doc.setFillColor(245, 247, 252);
  doc.setDrawColor(220, 226, 235);
  doc.roundedRect(margin, metaTop, textW, metaH, 2, 2, 'FD');

  y = metaTop + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Datos de la evaluación', margin + 4, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const line of metaLines) {
    if (line.startsWith(simLabel)) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 42, 74);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
    }
    const wrapped = doc.splitTextToSize(line, textW - 8);
    doc.text(wrapped, margin + 4, y);
    y += wrapped.length * 5 + 1;
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  y = metaTop + metaH + 4;
  doc.setFontSize(8.5);
  doc.setTextColor(100);
  doc.text(
    `Generado: ${new Date().toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}`,
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 10;

  const dt = result.diagram_type;
  if (dt === 'usecase') {
    appendUseCaseReport(doc, result, margin, textW, y);
  } else if (!dt || dt === '' || dt === 'class') {
    appendClassReport(doc, result, margin, textW, y);
  } else {
    appendStubReport(doc, result, diagramLabel, margin, y);
  }

  doc.save(filename);
}

function appendStubReport(
  doc: jsPDF,
  result: ComparisonResult,
  diagramLabel: string,
  margin: number,
  startY: number,
): void {
  let y = ensureGap(doc, startY, 44);
  y = drawSectionTitle(doc, margin, doc.internal.pageSize.getWidth() - margin * 2, y, diagramLabel);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const msg =
    `El reporte visual completo para este tipo está en desarrollo. ` +
    'Los datos numéricos y el desglose están en la pantalla de resultados.';
  const tw = doc.internal.pageSize.getWidth() - margin * 2;
  const lines = doc.splitTextToSize(msg, tw);
  doc.text(lines, margin, y);
  y += lines.length * 5 + 8;
  doc.setFillColor(236, 245, 255);
  doc.setDrawColor(180, 200, 230);
  doc.roundedRect(margin, y - 4, tw, 11, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(28, 42, 74);
  doc.text(`Similitud global: ${result.overall_similarity.toFixed(2)} %`, margin + 3, y + 3.5);
  doc.setTextColor(0, 0, 0);
}

function appendUseCaseReport(
  doc: jsPDF,
  result: ComparisonResult,
  margin: number,
  textW: number,
  startY: number,
): void {
  let y = ensureGap(doc, startY, 36);
  y = drawSectionTitle(doc, margin, textW, y, 'Estructura detectada por el parser');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const intro = doc.splitTextToSize(
    'Comparación lado a lado: solución del docente y diagrama del estudiante (actores, casos de uso y relaciones).',
    textW,
  );
  doc.text(intro, margin, y);
  y += intro.length * 5 + 6;

  if (result.expected_diagram) {
    y = writeUseCasePanel(doc, result.expected_diagram, 'Solución del docente', margin, textW, y);
    y += 8;
  } else {
    y = ensureGap(doc, y, 12);
    doc.setFont('helvetica', 'italic');
    doc.text('Información del diagrama de referencia no disponible.', margin, y);
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  if (result.student_diagram) {
    writeUseCasePanel(doc, result.student_diagram, 'Diagrama del estudiante', margin, textW, y);
  } else {
    y = ensureGap(doc, y, 12);
    doc.setFont('helvetica', 'italic');
    doc.text('Información del diagrama del estudiante no disponible.', margin, y);
  }
}

function writeUseCasePanel(
  doc: jsPDF,
  diagram: DiagramInfo,
  title: string,
  margin: number,
  textW: number,
  startY: number,
): number {
  let y = ensureGap(doc, startY, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 42, 74);
  doc.text(title, margin, y);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(210, 218, 230);
  doc.setLineWidth(0.35);
  doc.line(margin, y + 2, margin + textW, y + 2);
  y += 8;
  const actors = diagram.actors ?? [];
  const ucs = diagram.use_cases ?? [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const summary = `${diagram.name || 'Sin nombre'} · ${actors.length} actores · ${ucs.length} casos de uso · ${diagram.relationships.length} relaciones`;
  const sumLines = doc.splitTextToSize(summary, textW);
  doc.text(sumLines, margin, y);
  y += sumLines.length * 4 + 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Actores', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  if (actors.length === 0) {
    doc.setFontSize(9);
    doc.text('No se detectaron actores.', margin, y);
    y += 5;
  } else {
    const t = actors.map((a) => a.name).join(', ');
    const lines = doc.splitTextToSize(t, textW);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 3;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Casos de uso', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  if (ucs.length === 0) {
    doc.setFontSize(9);
    doc.text('No se detectaron casos de uso.', margin, y);
    y += 5;
  } else {
    const t = ucs.map((u) => u.name).join(', ');
    const lines = doc.splitTextToSize(t, textW);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  if (diagram.relationships.length > 0) {
    y = ensureGap(doc, y, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('Relaciones', margin, y);
    y += 5;
    const body = diagram.relationships.map((rel) => [
      rel.source,
      rel.target,
      relUc[rel.relationship_type] ?? rel.relationship_type,
      rel.name ?? '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Origen', 'Destino', 'Tipo', 'Nombre']],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 1.5, lineColor: [220, 226, 235], lineWidth: 0.1 },
      headStyles: { fillColor: [28, 42, 74], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 253, 255] },
      theme: 'grid',
    });
    y = lastTableY(doc) + 6;
  }

  return y;
}

function appendClassReport(
  doc: jsPDF,
  result: ComparisonResult,
  margin: number,
  textW: number,
  startY: number,
): void {
  let y = ensureGap(doc, startY, 36);
  y = drawSectionTitle(doc, margin, textW, y, 'Estructura detectada por el parser');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const intro = doc.splitTextToSize(
    'Clases, atributos, métodos y relaciones en la solución del docente y en el diagrama del estudiante.',
    textW,
  );
  doc.text(intro, margin, y);
  y += intro.length * 5 + 6;

  if (result.expected_diagram) {
    y = writeClassPanel(doc, result.expected_diagram, 'Solución del docente', margin, textW, y);
    y += 8;
  } else {
    y = ensureGap(doc, y, 12);
    doc.setFont('helvetica', 'italic');
    doc.text('Información del diagrama de referencia no disponible.', margin, y);
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  if (result.student_diagram) {
    writeClassPanel(doc, result.student_diagram, 'Diagrama del estudiante', margin, textW, y);
  } else {
    y = ensureGap(doc, y, 12);
    doc.setFont('helvetica', 'italic');
    doc.text('Información del diagrama del estudiante no disponible.', margin, y);
  }
}

function writeClassPanel(
  doc: jsPDF,
  diagram: DiagramInfo,
  title: string,
  margin: number,
  textW: number,
  startY: number,
): number {
  let y = ensureGap(doc, startY, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 42, 74);
  doc.text(title, margin, y);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(210, 218, 230);
  doc.setLineWidth(0.35);
  doc.line(margin, y + 2, margin + textW, y + 2);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const nAttr = diagram.classes.reduce((s, c) => s + c.attributes.length, 0);
  const nMet = diagram.classes.reduce((s, c) => s + c.methods.length, 0);
  const summary = `${diagram.classes.length} clases · ${nAttr} atributos · ${nMet} métodos · ${diagram.relationships.length} relaciones`;
  doc.text(summary, margin, y);
  y += 7;

  if (diagram.classes.length === 0) {
    doc.setFontSize(9);
    doc.text('No se detectaron clases en este diagrama.', margin, y);
    return y + 6;
  }

  for (const cls of diagram.classes) {
    y = ensureGap(doc, y, 40);
    y = writeClassBlock(doc, cls, margin, textW, y);
    y += 4;
  }

  if (diagram.relationships.length > 0) {
    y = ensureGap(doc, y, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Relaciones (panel ' + title + ')', margin, y);
    y += 5;
    const body = diagram.relationships.map((rel) => [
      rel.source,
      rel.target,
      relClass[rel.relationship_type] ?? rel.relationship_type,
      rel.source_multiplicity ?? '—',
      rel.target_multiplicity ?? '—',
      rel.name ?? '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Origen', 'Destino', 'Tipo', 'Card. origen', 'Card. destino', 'Nombre']],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 1.2, lineColor: [220, 226, 235], lineWidth: 0.1 },
      headStyles: { fillColor: [28, 42, 74], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 253, 255] },
      theme: 'grid',
    });
    y = lastTableY(doc) + 6;
  }

  return y;
}

function writeClassBlock(
  doc: jsPDF,
  cls: DiagramClass,
  margin: number,
  textW: number,
  startY: number,
): number {
  let y = startY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  let header = cls.name;
  if (cls.is_abstract) header += ' · abstract';
  if (cls.is_interface) header += ' · interface';
  doc.text(header, margin, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Atributos', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  if (cls.attributes.length === 0) {
    doc.text('(ninguno)', margin, y);
    y += 5;
  } else {
    for (const attr of cls.attributes) {
      y = ensureGap(doc, y, 8);
      const vis = visSymbol[attr.visibility] ?? '?';
      let line = `${vis} ${attr.name}`;
      if (attr.type) line += `: ${attr.type}`;
      if (attr.is_static) line += ' static';
      const lines = doc.splitTextToSize(line, textW - 4);
      doc.text(lines, margin + 3, y);
      y += lines.length * 4 + 1;
    }
  }

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Métodos', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  if (cls.methods.length === 0) {
    doc.text('(ninguno)', margin, y);
    return y + 5;
  }
  for (const method of cls.methods) {
    y = ensureGap(doc, y, 10);
    const vis = visSymbol[method.visibility] ?? '?';
    const params = method.parameters.map((p) => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ');
    let line = `${vis} ${method.name}(${params})`;
    if (method.return_type && method.return_type !== 'void') line += `: ${method.return_type}`;
    if (method.is_abstract) line += ' abstract';
    const lines = doc.splitTextToSize(line, textW - 4);
    doc.text(lines, margin + 3, y);
    y += lines.length * 4 + 1;
  }
  return y;
}
