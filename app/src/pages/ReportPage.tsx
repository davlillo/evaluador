import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { useGlobalEvaluation } from '@/context/GlobalEvaluationContext';
import { ScoreGauge } from '@/components/results/ScoreGauge';
import { ClassDiagramComparison } from '@/components/results/ClassDiagramComparison';
import { UseCaseComparison } from '@/components/results/UseCaseComparison';
import { SequenceComparison } from '@/components/results/SequenceComparison';
import { criterionRows, autoFeedback, verdict } from '@/lib/report-criteria';
import { resolveDiagramTypeLabel } from '@/lib/report-pdf';
import { percentTextClass } from '@/lib/status-colors';
import type {
  ComparisonResult, DiagramInfo, Breakdown, UseCaseBreakdown, SequenceBreakdown,
} from '@/types/comparison';

interface SingleDiagramEntry {
  diagram_type: string;
  similarity: number;
  comparison: ComparisonResult;
}

interface MultiDiagramResult {
  detected_diagrams: string[];
  results: SingleDiagramEntry[];
  overall_similarity: number;
  expected_diagrams?: Record<string, DiagramInfo>;
  student_diagrams?: Record<string, DiagramInfo>;
  weights_used?: Record<string, Record<string, number>>;
}

function isMultiDiagram(r: unknown): r is MultiDiagramResult {
  return r !== null && typeof r === 'object' && 'detected_diagrams' in r;
}

/** Diagramas docente vs estudiante para el tipo dado (reusa los comparison views). */
function DiagramFigures({
  type,
  comparison,
  expInfo,
  stuInfo,
}: {
  type: string;
  comparison: ComparisonResult;
  expInfo?: DiagramInfo;
  stuInfo?: DiagramInfo;
}) {
  const expected = expInfo ?? comparison.expected_diagram;
  const student = stuInfo ?? comparison.student_diagram;
  if (!expected) return null;

  if (type === 'usecase') {
    const b = comparison.breakdown as UseCaseBreakdown;
    return <UseCaseComparison expected={expected} student={student} actorBreakdown={b?.actors} useCaseBreakdown={b?.use_cases} />;
  }
  if (type === 'sequence') {
    const b = comparison.breakdown as SequenceBreakdown;
    return <SequenceComparison expected={expected} student={student} lifelineBreakdown={b?.lifelines} />;
  }
  const b = comparison.breakdown as Breakdown;
  return (
    <ClassDiagramComparison
      expected={expected}
      student={student}
      breakdownClasses={b?.classes}
      classDetails={(comparison as unknown as Record<string, unknown>).class_details as never}
      relationshipBreakdown={b?.relationships}
    />
  );
}

export default function ReportPage() {
  const { result, studentFileName } = useEvaluationResult();
  const { reportReturn, setReportReturn } = useGlobalEvaluation();
  const navigate = useNavigate();

  const goBack = () => {
    if (reportReturn) {
      navigate(reportReturn.path, { state: { studentId: reportReturn.studentId } });
      setReportReturn(null);
      return;
    }
    navigate('/resultados');
  };

  if (!result) {
    return <Navigate to="/" replace />;
  }

  // Normalizar a lista de diagramas + porcentaje global + pesos e infos por tipo.
  let diagrams: SingleDiagramEntry[];
  let overall: number;
  let expectedDiagrams: Record<string, DiagramInfo> = {};
  let studentDiagrams: Record<string, DiagramInfo> = {};
  let weightsByType: Record<string, Record<string, number>> = {};

  if (isMultiDiagram(result)) {
    const m = result;
    diagrams = m.results;
    overall = m.overall_similarity;
    expectedDiagrams = m.expected_diagrams ?? {};
    studentDiagrams = m.student_diagrams ?? {};
    weightsByType = m.weights_used ?? {};
  } else {
    const single = result as ComparisonResult;
    diagrams = [{
      diagram_type: single.diagram_type || 'class',
      similarity: single.overall_similarity,
      comparison: single,
    }];
    overall = single.overall_similarity;
  }

  // Inyectar los pesos por diagrama para que criterionRows los use (no el reparto igualitario).
  for (const d of diagrams) {
    const w = weightsByType[d.diagram_type];
    if (w && !d.comparison.weights_used) {
      (d.comparison as ComparisonResult).weights_used = w as never;
    }
  }

  const { nota, aprobado } = verdict(overall);
  const archivoEstudiante = studentFileName?.trim() || 'No indicado';
  const fecha = new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' });
  const tiposLabel = diagrams.map((d) => resolveDiagramTypeLabel(d.diagram_type)).join(', ');

  const allStrengths = new Set<string>();
  const allGaps = new Set<string>();
  for (const d of diagrams) {
    const fb = autoFeedback(d.comparison);
    fb.strengths.forEach((s) => allStrengths.add(s));
    fb.gaps.forEach((g) => allGaps.add(g));
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:space-y-4 print:max-w-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a resultados
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" />
          Imprimir / Exportar PDF
        </Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden print:border-0 print:rounded-none">
        {/* Encabezado institucional */}
        <div className="bg-primary text-primary-foreground px-8 py-6 flex items-center gap-4">
          <img
            src={`${import.meta.env.BASE_URL}images/logoUES.png`}
            alt="UES"
            className="h-14 w-auto brightness-0 invert"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Acta de Evaluación</h1>
            <p className="text-sm opacity-90">UML Evaluador · Universidad de El Salvador</p>
          </div>
        </div>

        {/* Datos de la evaluación */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 px-8 py-5 border-b text-sm">
          <div>
            <p className="text-muted-foreground">Archivo del estudiante</p>
            <p className="font-semibold break-all">{archivoEstudiante}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-semibold">{fecha}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tipo de diagrama</p>
            <p className="font-semibold">{tiposLabel}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Referencia</p>
            <p className="font-semibold">Solución del docente</p>
          </div>
        </div>

        {/* Resumen ejecutivo */}
        <div className="px-8 py-6 flex flex-col sm:flex-row items-center gap-8 border-b">
          <ScoreGauge percent={overall} />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Resumen ejecutivo</p>
            <p className="text-lg">
              Similitud global <strong className={percentTextClass(overall)}>{overall.toFixed(1)}%</strong>
              {' · '}Nota final <strong>{nota.toFixed(1)} / 10</strong>
            </p>
            {allStrengths.size > 0 && (
              <p className="text-sm flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-match shrink-0 mt-0.5" />
                <span><strong>Fortalezas:</strong> {[...allStrengths].join(', ')}.</span>
              </p>
            )}
            {allGaps.size > 0 && (
              <p className="text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-mismatch shrink-0 mt-0.5" />
                <span><strong>A mejorar:</strong> {[...allGaps].join(', ')}.</span>
              </p>
            )}
          </div>
        </div>

        {/* Por diagrama: tabla de criterios + diagramas reconstruidos */}
        <div className="px-8 py-6 space-y-8">
          {diagrams.map((d) => {
            const rows = criterionRows(d.comparison);
            return (
              <section key={d.diagram_type} className="space-y-3 print:break-inside-avoid">
                <h3 className="font-semibold">
                  {resolveDiagramTypeLabel(d.diagram_type)}
                  <span className={`ml-2 text-sm font-normal ${percentTextClass(d.similarity)}`}>
                    {d.similarity.toFixed(1)}%
                  </span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Criterio</th>
                        <th className="py-2 px-4 font-medium text-right">Puntaje</th>
                        <th className="py-2 px-4 font-medium text-right">Peso</th>
                        <th className="py-2 pl-4 font-medium text-right">Aporte</th>
                        <th className="py-2 pl-4 font-medium">Esperado / modelado</th>
                        <th className="py-2 pl-4 font-medium">Detalle docente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, index) => (
                        <tr key={`${r.label}-${index}`} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-4">{r.label}</td>
                          <td className={`py-2 px-4 text-right font-medium ${percentTextClass(r.similarity)}`}>
                            {r.similarity.toFixed(0)}%
                          </td>
                          <td className="py-2 px-4 text-right text-muted-foreground">{r.weight}%</td>
                          <td className="py-2 pl-4 text-right">{r.contribution.toFixed(1)}%</td>
                          <td className="py-2 pl-4 text-xs">
                            {r.expected !== undefined
                              ? `${r.expected} / ${r.modeled ?? '—'}`
                              : '—'}
                          </td>
                          <td className="py-2 pl-4 text-xs text-muted-foreground">{r.detail || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Diagramas reconstruidos (docente vs estudiante) */}
                <div className="pt-2">
                  <DiagramFigures
                    type={d.diagram_type}
                    comparison={d.comparison}
                    expInfo={expectedDiagrams[d.diagram_type]}
                    stuInfo={studentDiagrams[d.diagram_type]}
                  />
                </div>
              </section>
            );
          })}
        </div>

        {/* Veredicto */}
        <div className="px-8 py-5 border-t flex items-center justify-between bg-muted/30">
          <span className="text-sm text-muted-foreground">Calificación final</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{nota.toFixed(1)} / 10</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${aprobado ? 'bg-match/15 text-match' : 'bg-mismatch/15 text-mismatch'}`}>
              {aprobado ? 'Aprobado' : 'Reprobado'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
