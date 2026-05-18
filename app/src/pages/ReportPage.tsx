import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassReportView } from '@/components/report/ClassReportView';
import { UseCaseReportView } from '@/components/report/UseCaseReportView';
import { SequenceReportView } from '@/components/report/SequenceReportView';
import type { ComparisonResult, DiagramInfo } from '@/types/comparison';

interface SingleDiagramEntry {
  diagram_type: string;
  similarity: number;
  comparison: ComparisonResult;
}

interface MultiDiagramResult {
  detected_diagrams: string[];
  results: SingleDiagramEntry[];
  overall_similarity: number;
  // El API devuelve los DiagramInfo en el top-level, NO dentro de entry.comparison
  expected_diagrams?: Record<string, DiagramInfo>;
  student_diagrams?: Record<string, DiagramInfo>;
}

function isMultiDiagram(r: unknown): r is MultiDiagramResult {
  return r !== null && typeof r === 'object' && 'detected_diagrams' in r;
}

export default function ReportPage() {
  const { result } = useEvaluationResult();
  const navigate = useNavigate();

  if (!result) {
    return <Navigate to="/evaluar/subir" replace />;
  }

  // ── Resultado multi-diagrama (viene de /api/compare-auto) ──
  if (isMultiDiagram(result)) {
    const multiResult = result as MultiDiagramResult;
    const goBack = () => navigate('/evaluar/resultados');

    // Si solo hay 1 tipo detectado, tratarlo como resultado individual
    // para reutilizar las vistas que ya tienen soporte de PDF
    if (multiResult.results.length === 1) {
      const entry = multiResult.results[0];
      // Inyectar expected_diagram y student_diagram desde el top-level del response
      const singleResult: ComparisonResult = {
        ...entry.comparison,
        diagram_type: entry.diagram_type,
        expected_diagram: multiResult.expected_diagrams?.[entry.diagram_type],
        student_diagram:  multiResult.student_diagrams?.[entry.diagram_type],
      };

      if (entry.diagram_type === 'class')    return <ClassReportView    result={singleResult} onBack={goBack} />;
      if (entry.diagram_type === 'usecase')  return <UseCaseReportView  result={singleResult} onBack={goBack} />;
      if (entry.diagram_type === 'sequence') return <SequenceReportView result={singleResult} onBack={goBack} />;
    }

    // Múltiples tipos: resumen con botón de imprimir
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Resultados
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir / Guardar PDF
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reporte de Evaluación — Múltiples Diagramas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {multiResult.results.map((diag) => (
                <div key={diag.diagram_type} className="text-center p-4 border rounded-lg bg-muted/20">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    {diag.diagram_type === 'class'    ? 'Diagrama de Clases'    :
                     diag.diagram_type === 'usecase'  ? 'Casos de Uso'          :
                     diag.diagram_type === 'sequence' ? 'Diagrama de Secuencia' :
                     diag.diagram_type}
                  </div>
                  <div className="text-3xl font-bold text-primary">
                    {diag.similarity.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-1">Nota Global</div>
              <div className="text-5xl font-bold text-primary">
                {multiResult.overall_similarity.toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Resultado simple (viene de /api/compare manual) ──
  const singleResult = result as ComparisonResult;
  const goBack = () => navigate('/evaluar/resultados');

  if (!singleResult.diagram_type || singleResult.diagram_type === 'class') {
    return <ClassReportView result={singleResult} onBack={goBack} />;
  }
  if (singleResult.diagram_type === 'usecase') {
    return <UseCaseReportView result={singleResult} onBack={goBack} />;
  }
  if (singleResult.diagram_type === 'sequence') {
    return <SequenceReportView result={singleResult} onBack={goBack} />;
  }

  return (
    <div className="text-center py-8">
      <p>Tipo de diagrama no soportado: {singleResult.diagram_type}</p>
      <Button variant="outline" onClick={goBack} className="mt-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver
      </Button>
    </div>
  );
}