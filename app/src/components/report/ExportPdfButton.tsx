import { useState } from 'react';
import { AlertCircle, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { downloadDetailedReportPdf } from '@/lib/report-pdf';
import type { ComparisonResult } from '@/types/comparison';

interface MultiDiagramResult {
  detected_diagrams: string[];
  results: Array<{
    diagram_type: string;
    similarity: number;
    comparison: ComparisonResult;
  }>;
}

function isMultiDiagram(r: unknown): r is MultiDiagramResult {
  return r !== null && typeof r === 'object' && 'detected_diagrams' in r;
}

export function ExportPdfButton() {
  const { result, studentFileName } = useEvaluationResult();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiDiagramWarning, setMultiDiagramWarning] = useState(false);

  const handleClick = () => {
    if (!result) return;

    if (isMultiDiagram(result)) {
      // Si hay exactamente 1 diagrama, extraerlo y generar PDF normalmente
      if (result.results.length === 1) {
        const entry = result.results[0];
        const singleResult: ComparisonResult = {
          ...entry.comparison,
          diagram_type: entry.diagram_type,
          expected_diagram: (result as unknown as Record<string, unknown>)['expected_diagrams']
            ? ((result as unknown as Record<string, unknown>)['expected_diagrams'] as Record<string, unknown>)[entry.diagram_type] as ComparisonResult['expected_diagram']
            : entry.comparison.expected_diagram,
          student_diagram: (result as unknown as Record<string, unknown>)['student_diagrams']
            ? ((result as unknown as Record<string, unknown>)['student_diagrams'] as Record<string, unknown>)[entry.diagram_type] as ComparisonResult['student_diagram']
            : entry.comparison.student_diagram,
        };
        setBusy(true);
        setError(null);
        try {
          downloadDetailedReportPdf({ result: singleResult, studentFileName });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
        } finally {
          setBusy(false);
        }
        return;
      }
      // Múltiples diagramas: no soportado aún
      setMultiDiagramWarning(true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      downloadDetailedReportPdf({
        result: result as ComparisonResult,
        studentFileName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !result}
        onClick={handleClick}
      >
        <FileDown className="w-4 h-4 mr-2" />
        {busy ? 'Generando…' : 'Exportar PDF'}
      </Button>
      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {multiDiagramWarning && (
        <Alert className="max-w-md">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            La exportación de PDF para múltiples diagramas aún no está soportada. Podés exportar cada diagrama individualmente desde la página de resultados.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
