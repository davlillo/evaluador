// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, FileSpreadsheet, Loader2, PencilLine, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  buildStudentDiagramsFromRuns,
  useGlobalEvaluation,
} from '@/context/GlobalEvaluationContext';
import { DownloadBatchReportsZipButton } from '@/components/report/DownloadBatchReportsZipButton';
import { ExportStudentPdfButton } from '@/components/report/ExportStudentPdfButton';
import { percentToNota } from '@/lib/rubric';
import { useGradingSheet } from '@/context/GradingSheetContext';
import { buildGradingSheet } from '@/lib/grading-sheet';
import { withSheetEdits } from '@/lib/student-edits';
import { downloadBatchNotasXlsx } from '@/lib/batch-xlsx';
import type { ConsolidatedDiagramEntry } from '@/lib/report-pdf';
import type { BatchStudentResult } from '@/types/evaluation-session';

type SortKey = 'student' | 'score';
const DIAGRAM_KINDS = ['class', 'usecase', 'sequence'] as const;

export default function BatchResultsPage() {
  const navigate = useNavigate();
  const { batchResult, expectedDiagrams, getStudentById, setReportReturn } = useGlobalEvaluation();
  const { getOverrides, getObservations, overrideCount } = useGradingSheet();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = batchResult?.results ?? [];
    const filtered = query
      ? list.filter((r) => r.student_id.toLowerCase().includes(query.toLowerCase()))
      : list;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'student') return a.student_id.localeCompare(b.student_id);
      return a.final_score - b.final_score;
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [batchResult, query, sortKey, sortAsc]);

  if (!batchResult) {
    return <Navigate to="/" replace />;
  }

  /** La nota que vale: la del motor, salvo que el docente haya corregido su hoja. */
  const notaFor = (row: BatchStudentResult): number => {
    const breakdown = row.runs.class?.comparison?.class_rubric_breakdown ?? [];
    const overrides = getOverrides(row.student_id);
    if (breakdown.length === 0 || Object.keys(overrides).length === 0) {
      return row.nota ?? percentToNota(row.final_score);
    }
    return buildGradingSheet(breakdown, overrides).nota;
  };

  const openSheet = (student: BatchStudentResult) => {
    navigate('/hoja', { state: { studentId: student.student_id } });
  };

  const openStudent = (student: BatchStudentResult) => {
    setReportReturn({ path: '/lote', studentId: student.student_id });
    navigate('/lote/desglose', { state: { studentId: student.student_id } });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === 'student');
    }
  };

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    setExportError(null);
    try {
      // el Excel debe reflejar la hoja tal como quedó en pantalla
      const notaOverrides: Record<string, number> = {};
      const modeledOverrides: Record<string, Record<string, number>> = {};
      const observations: Record<string, Record<string, string>> = {};
      for (const row of batchResult.results) {
        if (row.status === 'error') continue;
        const modeled = getOverrides(row.student_id);
        const notes = getObservations(row.student_id);
        if (Object.keys(modeled).length > 0) {
          notaOverrides[row.student_id] = notaFor(row);
          modeledOverrides[row.student_id] = modeled;
        }
        if (Object.keys(notes).length > 0) observations[row.student_id] = notes;
      }
      await downloadBatchNotasXlsx(batchResult, {
        notaOverrides, modeledOverrides, observations,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al exportar el Excel de notas.');
    } finally {
      setExportingXlsx(false);
    }
  };

  /** El estudiante con las correcciones de su hoja: lo que tiene que decir el acta. */
  const editedStudent = (studentId: string) => {
    const student = getStudentById(studentId);
    if (!student) return null;
    return withSheetEdits(
      student,
      getOverrides(studentId),
      getObservations(studentId),
      batchResult.global_weights_used,
    );
  };

  const buildConsolidatedDiagrams = (studentId: string): ConsolidatedDiagramEntry[] => {
    const student = editedStudent(studentId);
    if (!student) return [];
    const expDiagrams = expectedDiagrams ?? {};
    const stuDiagrams = buildStudentDiagramsFromRuns(student.runs);

    return DIAGRAM_KINDS
      .map((kind): ConsolidatedDiagramEntry | null => {
        const run = student.runs[kind];
        if (run.status !== 'ok' || !run.comparison) return null;
        return {
          diagramType: kind,
          result: {
            ...run.comparison,
            diagram_type: kind,
            expected_diagram: expDiagrams[kind] ?? run.comparison.expected_diagram,
            student_diagram: stuDiagrams[kind] ?? run.comparison.student_diagram,
          },
        };
      })
      .filter((e): e is ConsolidatedDiagramEntry => e !== null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Nueva evaluación
          </Button>
          <h2 className="text-2xl font-bold">Evaluación por lote</h2>
          <p className="text-sm text-muted-foreground">
            {batchResult.students_total} estudiante(s) · {batchResult.students_complete} completo(s)
          </p>
          {(batchResult.excluded_students ?? []).map((excluded) => (
            <p key={excluded.student_id} className="text-xs text-muted-foreground">
              No se calificó <span className="font-mono">{excluded.student_id}</span>: {excluded.reason.toLowerCase()}
            </p>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleExportXlsx} disabled={exportingXlsx}>
            {exportingXlsx ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            Exportar Excel de notas
          </Button>
          <DownloadBatchReportsZipButton />
        </div>
      </div>

      {exportError && (
        <p className="text-sm text-destructive">{exportError}</p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Resultados por estudiante</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por carné…"
              className="w-full border rounded-md pl-8 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-2">
                    <button className="font-semibold" onClick={() => toggleSort('student')}>
                      Carné
                    </button>
                  </th>
                  <th className="py-2 px-2">
                    <button className="font-semibold" onClick={() => toggleSort('score')}>
                      Similitud
                    </button>
                  </th>
                  <th className="py-2 px-2">Nota</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 px-2"></th>
                  <th className="py-2 px-2"></th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 px-2 font-medium">{r.student_id}</td>
                    <td className="py-2 px-2">
                      {r.status === 'error' ? '—' : `${r.final_score.toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-2 font-semibold">
                      {r.status === 'error' ? '—' : (
                        <span className="inline-flex items-center gap-1.5">
                          {notaFor(r).toFixed(1)}
                          {overrideCount(r.student_id) > 0 && (
                            <PencilLine
                              className="h-3.5 w-3.5 text-primary"
                              aria-label="Nota corregida a mano"
                            />
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {r.status === 'error' ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : r.complete ? (
                        <Badge variant="secondary">Completo</Badge>
                      ) : (
                        <Badge variant="outline">Incompleto</Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {r.status !== 'error' && (
                        <ExportStudentPdfButton
                          studentId={r.student_id}
                          finalScore={editedStudent(r.student_id)?.final_score ?? r.final_score}
                          globalWeights={batchResult.global_weights_used}
                          diagrams={buildConsolidatedDiagrams(r.student_id)}
                          size="sm"
                          variant="outline"
                        />
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {r.status !== 'error' && (
                        <Button variant="outline" size="sm" onClick={() => openSheet(r)}>
                          <Table2 className="mr-1.5 h-4 w-4" />
                          Abrir hoja
                        </Button>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {r.status !== 'error' && (
                        <Button variant="ghost" size="sm" onClick={() => openStudent(r)}>
                          Ver desglose
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
