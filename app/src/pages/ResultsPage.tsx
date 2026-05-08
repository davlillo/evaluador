import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Eye, EyeOff, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassResultsView } from '@/components/results/ClassResultsView';
import { UseCaseResultsView } from '@/components/results/UseCaseResultsView';
import { SequenceResultsView } from '@/components/results/SequenceResultsView';
import { ClassDiagramComparison } from '@/components/results/ClassDiagramComparison';
import { UseCaseComparison } from '@/components/results/UseCaseComparison';
import { SequenceComparison } from '@/components/results/SequenceComparison';
import {
  MermaidRenderer,
  buildClassDiagramMermaid,
  buildUseCaseDiagramMermaid,
  buildSequenceDiagramMermaid,
} from '@/components/results/MermaidRenderer';
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

function getDiagramLabel(diagramType: string): string {
  const labels: Record<string, string> = {
    class: 'Diagrama de Clases',
    usecase: 'Diagrama de Casos de Uso',
    sequence: 'Diagrama de Secuencia',
  };
  return labels[diagramType] || diagramType;
}

function getSimilarityColor(similarity: number): string {
  if (similarity >= 80) return 'text-green-500';
  if (similarity >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

function DiagramSection({
  diagResult,
  diagramType,
  expectedDiagrams,
  studentDiagrams,
  onBack,
  onViewReport,
}: {
  diagResult: AutoDetectedResult;
  diagramType: string;
  expectedDiagrams: Record<string, DiagramInfo>;
  studentDiagrams: Record<string, DiagramInfo>;
  onBack: () => void;
  onViewReport: () => void;
}) {
  const [showComparison, setShowComparison] = useState(false);
  const [showMermaid, setShowMermaid] = useState(false);

  const comparison = diagResult.comparison;
  const expInfo = expectedDiagrams[diagramType];
  const stuInfo = studentDiagrams[diagramType];

  const isClass = diagramType === 'class';
  const isUseCase = diagramType === 'usecase';
  const isSequence = diagramType === 'sequence';

  let mermaidChart = '';
  if (isClass && expInfo) {
    mermaidChart = buildClassDiagramMermaid(
      expInfo.classes || [],
      expInfo.relationships || [],
    );
  } else if (isUseCase && expInfo) {
    mermaidChart = buildUseCaseDiagramMermaid(
      expInfo.actors || [],
      expInfo.use_cases || [],
      expInfo.relationships || [],
    );
  } else if (isSequence && expInfo) {
    mermaidChart = buildSequenceDiagramMermaid(
      expInfo.lifelines || [],
      expInfo.messages || [],
    );
  }

  const renderScores = () => {
    if (isUseCase && isUseCaseBreakdown(comparison.breakdown)) {
      return (
        <UseCaseResultsView
          result={{ ...comparison, breakdown: comparison.breakdown } as Omit<ComparisonResult, 'breakdown'> & { breakdown: UseCaseBreakdown }}
          onBack={onBack}
          onViewReport={onViewReport}
        />
      );
    }
    if (isSequence && isSequenceBreakdown(comparison.breakdown)) {
      return (
        <SequenceResultsView
          result={{ ...comparison, breakdown: comparison.breakdown } as Omit<ComparisonResult, 'breakdown'> & { breakdown: SequenceBreakdown }}
          onBack={onBack}
          onViewReport={onViewReport}
        />
      );
    }
    if (isClass) {
      return (
        <ClassResultsView
          result={comparison as Omit<ComparisonResult, 'breakdown'> & { breakdown: Breakdown }}
          onBack={onBack}
          onViewReport={onViewReport}
        />
      );
    }
    return null;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/10 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {getDiagramLabel(diagramType)}
            <span className={`text-base font-normal ${getSimilarityColor(diagResult.similarity)}`}>
              ({diagResult.similarity.toFixed(1)}%)
            </span>
          </CardTitle>
          <Badge variant="outline" className="text-xs capitalize">{diagramType}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {renderScores()}

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => setShowComparison(!showComparison)}>
            <GitCompare className="w-4 h-4 mr-2" />
            {showComparison ? 'Ocultar Comparación' : 'Ver Comparación Detallada'}
          </Button>
          {mermaidChart && (
            <Button variant="outline" size="sm" onClick={() => setShowMermaid(!showMermaid)}>
              {showMermaid ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showMermaid ? 'Ocultar Diagrama' : 'Reconstruir Diagrama'}
            </Button>
          )}
        </div>

        {showComparison && (
          <div className="border rounded-lg p-4 bg-muted/10">
            {isClass && (
              <ClassDiagramComparison
                expected={expInfo}
                student={stuInfo}
                breakdownClasses={(comparison.breakdown as Breakdown)?.classes}
                classDetails={(comparison as unknown as Record<string, unknown>).class_details as Array<{ class_name: string; similarity: number; attributes: { missing: string[]; extra: string[] }; methods: { missing: string[]; extra: string[] } }> | undefined}
                relationshipBreakdown={(comparison.breakdown as Breakdown)?.relationships}
              />
            )}
            {isUseCase && (
              <UseCaseComparison
                expected={expInfo}
                student={stuInfo}
                actorBreakdown={(comparison.breakdown as UseCaseBreakdown)?.actors}
                useCaseBreakdown={(comparison.breakdown as UseCaseBreakdown)?.use_cases}
              />
            )}
            {isSequence && (
              <SequenceComparison
                expected={expInfo}
                student={stuInfo}
                lifelineBreakdown={(comparison.breakdown as SequenceBreakdown)?.lifelines}
              />
            )}
          </div>
        )}

        {showMermaid && mermaidChart && (
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-900">
            <MermaidRenderer chart={mermaidChart} id={`mermaid-${diagramType}`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
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
            <DiagramSection
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