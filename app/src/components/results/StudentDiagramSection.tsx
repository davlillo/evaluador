import { useState } from 'react';
import { Eye, EyeOff, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export interface DiagramResultEntry {
  diagram_type: string;
  similarity: number;
  comparison: ComparisonResult;
}

export function getDiagramLabel(diagramType: string): string {
  const labels: Record<string, string> = {
    class: 'Diagrama de Clases',
    usecase: 'Diagrama de Casos de Uso',
    sequence: 'Diagrama de Secuencia',
  };
  return labels[diagramType] || diagramType;
}

export function getSimilarityColor(similarity: number): string {
  if (similarity >= 80) return 'text-green-500';
  if (similarity >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

interface StudentDiagramSectionProps {
  diagResult: DiagramResultEntry;
  diagramType: string;
  expectedDiagrams: Record<string, DiagramInfo>;
  studentDiagrams: Record<string, DiagramInfo>;
  onBack: () => void;
  onViewReport: () => void;
  showNavActions?: boolean;
}

export function StudentDiagramSection({
  diagResult,
  diagramType,
  expectedDiagrams,
  studentDiagrams,
  onBack,
  onViewReport,
  showNavActions = true,
}: StudentDiagramSectionProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [showMermaid, setShowMermaid] = useState(false);

  const comparison = diagResult.comparison;
  const expInfo = expectedDiagrams[diagramType] ?? comparison.expected_diagram;
  const stuInfo = studentDiagrams[diagramType] ?? comparison.student_diagram;

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

  const navProps = showNavActions
    ? { onBack, onViewReport, showNavActions: true as const }
    : { onBack: () => {}, onViewReport, showNavActions: false as const };

  const renderScores = () => {
    if (isUseCase && isUseCaseBreakdown(comparison.breakdown)) {
      return (
        <UseCaseResultsView
          result={{ ...comparison, breakdown: comparison.breakdown } as Omit<ComparisonResult, 'breakdown'> & { breakdown: UseCaseBreakdown }}
          {...navProps}
        />
      );
    }
    if (isSequence && isSequenceBreakdown(comparison.breakdown)) {
      return (
        <SequenceResultsView
          result={{ ...comparison, breakdown: comparison.breakdown } as Omit<ComparisonResult, 'breakdown'> & { breakdown: SequenceBreakdown }}
          {...navProps}
        />
      );
    }
    if (isClass) {
      return (
        <ClassResultsView
          result={comparison as Omit<ComparisonResult, 'breakdown'> & { breakdown: Breakdown }}
          {...navProps}
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

        {showComparison && expInfo && (
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
