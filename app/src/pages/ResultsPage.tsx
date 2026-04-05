import { Navigate, useNavigate } from 'react-router-dom';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassResultsView } from '@/components/results/ClassResultsView';
import { UseCaseResultsView } from '@/components/results/UseCaseResultsView';
import { OtherDiagramResultsStub } from '@/components/results/OtherDiagramResultsStub';
import type { Breakdown, ComparisonResult, UseCaseBreakdown } from '@/types/comparison';
import { isUseCaseBreakdown } from '@/types/comparison';

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

  /** Casos de uso primero: el desglose del API no es el mismo que en diagramas de clases. */
  if (result.diagram_type === 'usecase' && isUseCaseBreakdown(result.breakdown)) {
    const useCaseResult: Omit<ComparisonResult, 'breakdown'> & { breakdown: UseCaseBreakdown } = {
      ...result,
      breakdown: result.breakdown,
    };
    return (
      <UseCaseResultsView
        result={useCaseResult}
        onBack={handleBack}
        onViewReport={handleViewReport}
      />
    );
  }

  const isClass =
    result.diagram_type === 'class' || result.diagram_type === undefined || result.diagram_type === '';

  if (isClass) {
    return (
      <ClassResultsView
        result={result as Omit<ComparisonResult, 'breakdown'> & { breakdown: Breakdown }}
        onBack={handleBack}
        onViewReport={handleViewReport}
      />
    );
  }

  return (
    <OtherDiagramResultsStub
      result={result}
      onBack={handleBack}
      onViewReport={handleViewReport}
    />
  );
}
