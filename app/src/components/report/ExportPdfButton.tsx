import { useState } from 'react';
import { AlertCircle, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { downloadDetailedReportPdf } from '@/lib/report-pdf';

export function ExportPdfButton() {
  const { result, studentFileName } = useEvaluationResult();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      downloadDetailedReportPdf({
        result,
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
    </div>
  );
}
