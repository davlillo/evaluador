import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  buildStudentDiagramsFromRuns,
  useGlobalEvaluation,
} from '@/context/GlobalEvaluationContext';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import {
  StudentDiagramSection,
  getDiagramLabel,
  getSimilarityColor,
} from '@/components/results/StudentDiagramSection';
import { ExportDiagramPdfButton } from '@/components/report/ExportPdfButton';
import { ExportStudentPdfButton } from '@/components/report/ExportStudentPdfButton';
import type { ComparisonResult, DiagramInfo } from '@/types/comparison';
import type { GlobalRunSummary } from '@/types/evaluation-session';

const DIAGRAM_KINDS = ['class', 'usecase', 'sequence'] as const;

function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toFixed(2)}%`;
}

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

export default function GlobalStudentBreakdownPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setResult } = useEvaluationResult();
  const {
    batchResult,
    globalResult,
    expectedDiagrams,
    returnPath,
    getStudentById,
    setReportReturn,
  } = useGlobalEvaluation();

  const studentId = (location.state as { studentId?: string } | null)?.studentId;
  const student = studentId ? getStudentById(studentId) : null;

  const expDiagrams = expectedDiagrams ?? {};
  const stuDiagrams = useMemo(
    () => (student ? buildStudentDiagramsFromRuns(student.runs) : {}),
    [student],
  );

  const detectedKinds = useMemo(() => {
    if (batchResult?.detected_diagrams?.length) {
      return batchResult.detected_diagrams.filter((k) =>
        DIAGRAM_KINDS.includes(k as typeof DIAGRAM_KINDS[number]),
      );
    }
    if (globalResult) {
      return [...DIAGRAM_KINDS];
    }
    return DIAGRAM_KINDS.filter((kind) => student?.runs[kind]?.status === 'ok');
  }, [batchResult, globalResult, student]);

  const studentFileName = student ? `${student.student_id}.xmi` : null;

  if (!student || !studentId) {
    return <Navigate to={returnPath} replace />;
  }

  const handleBack = () => {
    navigate(returnPath);
  };

  const handleViewReport = (diagramType: string) => {
    const run = student.runs[diagramType as keyof typeof student.runs];
    const comparison = buildComparisonForRun(run, diagramType, expDiagrams, stuDiagrams);
    if (!comparison) return;

    setResult(comparison, { studentFileName });
    setReportReturn({ path: '/evaluar/global/desglose', studentId: student.student_id });
    navigate('/evaluar/reporte');
  };

  const pdfEntries = detectedKinds
    .map((kind) => {
      const run = student.runs[kind as keyof typeof student.runs];
      const comparison = buildComparisonForRun(run, kind, expDiagrams, stuDiagrams);
      if (!comparison) return null;
      return { kind, comparison };
    })
    .filter(Boolean) as Array<{ kind: string; comparison: ComparisonResult }>;

  const globalWeightsUsed = batchResult?.global_weights_used ?? globalResult?.global_weights_used
    ?? { class: 40, usecase: 35, sequence: 25 };
  const consolidatedDiagrams = pdfEntries
    .filter(({ kind }) => kind === 'class' || kind === 'usecase' || kind === 'sequence')
    .map(({ kind, comparison }) => ({
      diagramType: kind as 'class' | 'usecase' | 'sequence',
      result: comparison,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a resultados {globalResult ? 'globales' : 'del lote'}
        </Button>
        <Badge variant={student.complete ? 'default' : 'secondary'}>
          {student.complete ? 'Completo' : 'Incompleto'}
        </Badge>
      </div>

      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="w-5 h-5" />
            Desglose — {student.student_id}
          </CardTitle>
          <CardDescription>
            Nota global final:{' '}
            <strong className={`text-foreground ${getSimilarityColor(student.final_score)}`}>
              {formatScore(student.final_score)}
            </strong>
          </CardDescription>
        </CardHeader>
      </Card>

      {pdfEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Exportar reportes PDF</CardTitle>
            <CardDescription>
              Descargá un PDF por cada tipo de diagrama evaluado, o un acta consolidada con los tres.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <ExportStudentPdfButton
              studentId={student.student_id}
              finalScore={student.final_score}
              globalWeights={globalWeightsUsed}
              diagrams={consolidatedDiagrams}
              variant="default"
            />
            {pdfEntries.map(({ kind, comparison }) => (
              <ExportDiagramPdfButton
                key={kind}
                comparison={comparison}
                studentFileName={studentFileName}
                size="sm"
                variant="outline"
              />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {detectedKinds.map((kind) => {
          const run = student.runs[kind as keyof typeof student.runs];
          if (run.status !== 'ok' || !run.comparison || run.similarity === null) {
            return (
              <Alert key={kind}>
                <AlertDescription>
                  <strong>{getDiagramLabel(kind)}:</strong>{' '}
                  {run.error || 'Sin datos para este diagrama.'}
                </AlertDescription>
              </Alert>
            );
          }

          const comparison = buildComparisonForRun(run, kind, expDiagrams, stuDiagrams)!;

          return (
            <div key={kind} className="space-y-2">
              <div className="flex justify-end">
                <ExportDiagramPdfButton
                  comparison={comparison}
                  studentFileName={studentFileName}
                  size="sm"
                />
              </div>
              <StudentDiagramSection
                diagResult={{
                  diagram_type: kind,
                  similarity: run.similarity,
                  comparison,
                }}
                diagramType={kind}
                expectedDiagrams={expDiagrams}
                studentDiagrams={stuDiagrams}
                onBack={handleBack}
                onViewReport={() => handleViewReport(kind)}
                showNavActions={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
