import { useState } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { downloadConsolidatedReportPdf, type ConsolidatedDiagramEntry } from '@/lib/report-pdf';

interface ExportStudentPdfButtonProps {
  studentId: string;
  finalScore: number;
  globalWeights: { class: number; usecase: number; sequence: number };
  diagrams: ConsolidatedDiagramEntry[];
  size?: 'default' | 'sm';
  variant?: 'default' | 'secondary' | 'outline';
}

/** Botón que descarga el acta consolidada (los 3 diagramas de un estudiante en un solo PDF). */
export function ExportStudentPdfButton({
  studentId,
  finalScore,
  globalWeights,
  diagrams,
  size = 'sm',
  variant = 'outline',
}: ExportStudentPdfButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setBusy(true);
    setError(null);
    try {
      downloadConsolidatedReportPdf({ studentId, finalScore, globalWeights, diagrams });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF consolidado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={busy || diagrams.length === 0}
        onClick={handleClick}
      >
        <FileText className="w-4 h-4 mr-2" />
        {busy ? 'Generando…' : 'PDF consolidado'}
      </Button>
      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
