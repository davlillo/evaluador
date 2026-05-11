import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassReportView } from '@/components/report/ClassReportView';
import { UseCaseReportView } from '@/components/report/UseCaseReportView';
import { SequenceReportView } from '@/components/report/SequenceReportView';
import type { ComparisonResult } from '@/types/comparison';

interface MultiDiagramResult {
  detected_diagrams: string[];
  results: Array<{
    diagram_type: string;
    similarity: number;
    comparison: ComparisonResult;
  }>;
  overall_similarity: number;
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

  if (isMultiDiagram(result)) {
    const multiResult = result as MultiDiagramResult;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/evaluar/resultados')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Resultados
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reporte de Evaluación Multiple</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Los resultados contienen múltiples diagramas ({multiResult.detected_diagrams.length}). Para ver el detalle de cada uno, por favor regresá a la página de resultados.
            </p>

            <div className="grid grid-cols-3 gap-4">
              {multiResult.results.map((diag) => (
                <div key={diag.diagram_type} className="text-center p-4 border rounded-lg">
                  <div className="font-medium capitalize">{diag.diagram_type}</div>
                  <div className="text-2xl font-bold text-primary">{diag.similarity.toFixed(1)}%</div>
                </div>
              ))}
            </div>

            <div className="text-center pt-4 border-t">
              <div className="text-sm text-muted-foreground">Nota Global</div>
              <div className="text-4xl font-bold text-primary">{multiResult.overall_similarity.toFixed(1)}%</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const singleResult = result as ComparisonResult;

  const isClass =
    singleResult.diagram_type === 'class' ||
    singleResult.diagram_type === undefined ||
    singleResult.diagram_type === '';
  const isUseCase = singleResult.diagram_type === 'usecase';
  const isSequence = singleResult.diagram_type === 'sequence';

  if (isClass) {
    return <ClassReportView result={singleResult} onBack={() => navigate('/evaluar/resultados')} />;
  }

  if (isUseCase) {
    return <UseCaseReportView result={singleResult} onBack={() => navigate('/evaluar/resultados')} />;
  }

  if (isSequence) {
    return <SequenceReportView result={singleResult} onBack={() => navigate('/evaluar/resultados')} />;
  }

  return (
    <div className="text-center py-8">
      <p>Tipo de diagrama no soportado para reporte: {singleResult.diagram_type}</p>
      <Button variant="outline" onClick={() => navigate('/evaluar/resultados')} className="mt-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver
      </Button>
    </div>
  );
}