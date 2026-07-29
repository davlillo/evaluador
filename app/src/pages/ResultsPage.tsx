import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Stepper } from '@/components/Stepper';
import { ScoreGauge } from '@/components/results/ScoreGauge';
import { EditableNota } from '@/components/results/EditableNota';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassResultsView } from '@/components/results/ClassResultsView';
import { UseCaseResultsView } from '@/components/results/UseCaseResultsView';
import { SequenceResultsView } from '@/components/results/SequenceResultsView';
import {
  StudentDiagramSection,
  getDiagramLabel,
} from '@/components/results/StudentDiagramSection';
import type {
  ComparisonResult,
  Breakdown,
  SequenceBreakdown,
  UseCaseBreakdown,
  DiagramInfo,
} from '@/types/comparison';
import { isSequenceBreakdown, isUseCaseBreakdown } from '@/types/comparison';

interface AutoDetectedResult {
  diagram_type: string;
  similarity: number;
  comparison: ComparisonResult;
}

interface MultiDiagramResult {
  detected_diagrams: string[];
  results: AutoDetectedResult[];
  overall_similarity: number;
  expected_diagrams: Record<string, DiagramInfo>;
  student_diagrams: Record<string, DiagramInfo>;
}

function isMultiDiagram(r: unknown): r is MultiDiagramResult {
  return r !== null && typeof r === 'object' && 'detected_diagrams' in r && 'results' in r;
}

function SingleDiagramView({
  result,
  onBack,
  onViewReport,
}: {
  result: ComparisonResult;
  onBack: () => void;
  onViewReport: () => void;
}) {
  if (result.diagram_type === 'usecase' && isUseCaseBreakdown(result.breakdown)) {
    return (
      <UseCaseResultsView
        result={{ ...result, breakdown: result.breakdown } as Omit<ComparisonResult, 'breakdown'> & { breakdown: UseCaseBreakdown }}
        onBack={onBack}
        onViewReport={onViewReport}
      />
    );
  }

  if (result.diagram_type === 'sequence' && isSequenceBreakdown(result.breakdown)) {
    return (
      <SequenceResultsView
        result={{ ...result, breakdown: result.breakdown } as Omit<ComparisonResult, 'breakdown'> & { breakdown: SequenceBreakdown }}
        onBack={onBack}
        onViewReport={onViewReport}
      />
    );
  }

  const isClass =
    result.diagram_type === 'class' ||
    result.diagram_type === undefined ||
    result.diagram_type === '';

  if (isClass) {
    return (
      <ClassResultsView
        result={result as Omit<ComparisonResult, 'breakdown'> & { breakdown: Breakdown }}
        onBack={onBack}
        onViewReport={onViewReport}
      />
    );
  }

  return (
    <div className="text-center py-8">
      <p>Tipo de diagrama no soportado: {result.diagram_type}</p>
      <Button variant="outline" onClick={onBack} className="mt-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver
      </Button>
    </div>
  );
}

export default function ResultsPage() {
  const { result, clearResult } = useEvaluationResult();
  const navigate = useNavigate();

  if (!result) {
    return <Navigate to="/" replace />;
  }

  const handleBack = () => {
    clearResult();
    navigate('/');
  };

  const handleViewReport = () => {
    navigate('/reporte');
  };

  if (isMultiDiagram(result)) {
    const multiResult = result as MultiDiagramResult;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Resultados de la comparación</h2>
            <p className="text-sm text-muted-foreground">Revisa el análisis detallado y la calificación obtenida.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Nueva comparación
            </Button>
            <Button onClick={handleViewReport}>
              <FileText className="w-4 h-4 mr-2" />
              Ver reporte
            </Button>
          </div>
        </div>

        <Stepper current={3} />

        <Card>
          <CardContent className="py-6 flex flex-col sm:flex-row items-center gap-8">
            <ScoreGauge percent={multiResult.overall_similarity} />
            <div className="flex-1 text-center sm:text-left space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Resumen general</p>
                <p className="text-lg font-semibold">
                  {multiResult.overall_similarity.toFixed(1)}% de similitud
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Diagramas detectados: {multiResult.detected_diagrams.map(getDiagramLabel).join(', ')}
                </p>
              </div>
            </div>
            <EditableNota percent={multiResult.overall_similarity} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {multiResult.results.map((diagResult) => (
            <StudentDiagramSection
              key={diagResult.diagram_type}
              diagResult={diagResult}
              diagramType={diagResult.diagram_type}
              expectedDiagrams={multiResult.expected_diagrams}
              studentDiagrams={multiResult.student_diagrams}
              onBack={handleBack}
              onViewReport={handleViewReport}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <SingleDiagramView
      result={result as ComparisonResult}
      onBack={handleBack}
      onViewReport={handleViewReport}
    />
  );
}
