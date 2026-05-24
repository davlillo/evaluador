import JSZip from 'jszip';
import {
  buildBatchDiagramPdfFilename,
  generateDetailedReportPdfArrayBuffer,
  sanitizeZipFolderName,
} from '@/lib/report-pdf';
import { buildStudentDiagramsFromRuns } from '@/context/GlobalEvaluationContext';
import type { ComparisonResult, DiagramInfo } from '@/types/comparison';
import type { GlobalRunSummary, GlobalStudentResult } from '@/types/evaluation-session';

const DIAGRAM_KINDS = ['class', 'usecase', 'sequence'] as const;

function buildComparisonForRun(
  run: GlobalRunSummary,
  diagramType: string,
  expectedDiagrams: Record<string, DiagramInfo>,
  studentDiagrams: Record<string, DiagramInfo>,
): ComparisonResult | null {
  if (run.status !== 'ok' || !run.comparison) return null;
  return {
    ...run.comparison,
    diagram_type: diagramType,
    expected_diagram: expectedDiagrams[diagramType] ?? run.comparison.expected_diagram,
    student_diagram: studentDiagrams[diagramType] ?? run.comparison.student_diagram,
  };
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildZipFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `reportes-uml-${stamp}.zip`;
}

export interface BatchReportsZipParams {
  students: GlobalStudentResult[];
  expectedDiagrams: Record<string, DiagramInfo>;
  detectedDiagrams: string[];
}

export interface BatchReportsZipProgress {
  phase: 'generating' | 'zipping' | 'done';
  currentStudent?: string;
  currentDiagram?: string;
  pdfCount: number;
  studentIndex: number;
  studentTotal: number;
}

export async function buildBatchReportsZip(
  params: BatchReportsZipParams,
  onProgress?: (progress: BatchReportsZipProgress) => void,
): Promise<{ blob: Blob; pdfCount: number; skipped: number }> {
  const { students, expectedDiagrams, detectedDiagrams } = params;
  const kinds = detectedDiagrams.filter((k) =>
    DIAGRAM_KINDS.includes(k as (typeof DIAGRAM_KINDS)[number]),
  );

  const zip = new JSZip();
  let pdfCount = 0;
  let skipped = 0;

  for (let si = 0; si < students.length; si++) {
    const student = students[si];
    const folderName = sanitizeZipFolderName(student.student_id);
    const folder = zip.folder(folderName);
    if (!folder) continue;

    const studentFileName = `${student.student_id}.xmi`;
    const stuDiagrams = buildStudentDiagramsFromRuns(student.runs);

    for (const kind of kinds) {
      const run = student.runs[kind as keyof typeof student.runs];
      const comparison = buildComparisonForRun(run, kind, expectedDiagrams, stuDiagrams);
      if (!comparison) {
        skipped += 1;
        continue;
      }

      onProgress?.({
        phase: 'generating',
        currentStudent: student.student_id,
        currentDiagram: kind,
        pdfCount,
        studentIndex: si + 1,
        studentTotal: students.length,
      });

      const buffer = generateDetailedReportPdfArrayBuffer({
        result: comparison,
        studentFileName,
      });
      folder.file(buildBatchDiagramPdfFilename(kind), buffer);
      pdfCount += 1;
    }
  }

  if (pdfCount === 0) {
    throw new Error('No hay reportes PDF para exportar. Ejecutá de nuevo la evaluación del lote.');
  }

  onProgress?.({
    phase: 'zipping',
    pdfCount,
    studentIndex: students.length,
    studentTotal: students.length,
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.({
    phase: 'done',
    pdfCount,
    studentIndex: students.length,
    studentTotal: students.length,
  });

  return { blob, pdfCount, skipped };
}

export async function downloadBatchReportsZip(
  params: BatchReportsZipParams,
  onProgress?: (progress: BatchReportsZipProgress) => void,
): Promise<{ pdfCount: number; skipped: number }> {
  const { blob, pdfCount, skipped } = await buildBatchReportsZip(params, onProgress);
  triggerBlobDownload(blob, buildZipFilename());
  return { pdfCount, skipped };
}
