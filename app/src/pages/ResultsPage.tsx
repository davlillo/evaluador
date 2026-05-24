import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassResultsView } from '@/components/results/ClassResultsView';
import { UseCaseResultsView } from '@/components/results/UseCaseResultsView';
import { SequenceResultsView } from '@/components/results/SequenceResultsView';
import {
  StudentDiagramSection,
  getDiagramLabel,
  getSimilarityColor,
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
    return <Navigate to="/evaluar/subir" replace />;
  }

  const handleBack = () => {
    clearResult();
    navigate('/evaluar/subir');
  };

  const handleViewReport = () => {
    navigate('/evaluar/reporte');
  };

  if (isMultiDiagram(result)) {
    const multiResult = result as MultiDiagramResult;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Nueva Comparación
          </Button>
          <Button onClick={handleViewReport}>
            <FileText className="w-4 h-4 mr-2" />
            Ver Reporte
          </Button>
        </div>

        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Nota Global</CardTitle>
            <p className="text-muted-foreground">Promedio ponderado de todos los diagramas</p>
          </CardHeader>
          <CardContent className="text-center">
            <div className={`text-6xl font-bold ${getSimilarityColor(multiResult.overall_similarity)}`}>
              {multiResult.overall_similarity.toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Diagramas detectados: {multiResult.detected_diagrams.map(getDiagramLabel).join(', ')}
            </p>
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
