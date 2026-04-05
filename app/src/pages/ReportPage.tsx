import { Navigate, useNavigate } from 'react-router-dom';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { ClassReportView } from '@/components/report/ClassReportView';
import { UseCaseReportView } from '@/components/report/UseCaseReportView';
import { OtherDiagramReportStub } from '@/components/report/OtherDiagramReportStub';

export default function ReportPage() {
  const { result } = useEvaluationResult();
  const navigate = useNavigate();

  if (!result) {
    return <Navigate to="/evaluar/subir" replace />;
  }

  const isClass =
    result.diagram_type === 'class' || result.diagram_type === undefined || result.diagram_type === '';
  const isUseCase = result.diagram_type === 'usecase';

  if (isClass) {
    return (
      <ClassReportView
        result={result}
        onBack={() => navigate('/evaluar/resultados')}
      />
    );
  }

  if (isUseCase) {
    return (
      <UseCaseReportView
        result={result}
        onBack={() => navigate('/evaluar/resultados')}
      />
    );
  }

  return (
    <OtherDiagramReportStub
      result={result}
      onBack={() => navigate('/evaluar/resultados')}
    />
  );
}
