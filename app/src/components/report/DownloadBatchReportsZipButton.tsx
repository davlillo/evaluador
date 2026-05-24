import { useMemo, useState } from 'react';
import { AlertCircle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useGlobalEvaluation } from '@/context/GlobalEvaluationContext';
import { downloadBatchReportsZip } from '@/lib/batch-reports-zip';
import type { GlobalStudentResult } from '@/types/evaluation-session';

const DEFAULT_KINDS = ['class', 'usecase', 'sequence'];

export function DownloadBatchReportsZipButton() {
  const { batchResult, globalResult, expectedDiagrams, getStudentById } = useGlobalEvaluation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const students = useMemo((): GlobalStudentResult[] => {
    if (batchResult) {
      return batchResult.results
        .map((row) => getStudentById(row.student_id))
        .filter((s): s is GlobalStudentResult => s !== null);
    }
    if (globalResult) {
      return globalResult.results;
    }
    return [];
  }, [batchResult, globalResult, getStudentById]);

  const detectedDiagrams = useMemo(() => {
    if (batchResult?.detected_diagrams?.length) {
      return batchResult.detected_diagrams;
    }
    if (globalResult) {
      return [...DEFAULT_KINDS];
    }
    return DEFAULT_KINDS;
  }, [batchResult, globalResult]);

  const disabled = students.length === 0 || !expectedDiagrams;

  const handleClick = async () => {
    if (!expectedDiagrams || students.length === 0) return;

    setBusy(true);
    setError(null);
    setStatus('Preparando reportes…');

    try {
      const { pdfCount, skipped } = await downloadBatchReportsZip(
        {
          students,
          expectedDiagrams,
          detectedDiagrams,
        },
        (progress) => {
          if (progress.phase === 'generating' && progress.currentStudent) {
            setStatus(
              `Generando PDF ${progress.pdfCount + 1} — ${progress.currentStudent} (${progress.studentIndex}/${progress.studentTotal})`,
            );
          } else if (progress.phase === 'zipping') {
            setStatus('Comprimiendo ZIP…');
          }
        },
      );

      const skipNote = skipped > 0 ? ` (${skipped} diagramas omitidos por falta de datos)` : '';
      setStatus(`Listo: ${pdfCount} PDF en carpetas por alumno${skipNote}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el ZIP.');
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  if (students.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        disabled={busy || disabled}
        onClick={handleClick}
      >
        <Archive className="w-4 h-4 mr-2" />
        {busy ? 'Generando ZIP…' : 'Descargar todos los PDF (ZIP por alumno)'}
      </Button>
      {status && !error && (
        <p className="text-xs text-muted-foreground">{status}</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {disabled && !busy && (
        <p className="text-xs text-muted-foreground">
          Volvé a evaluar el lote para habilitar la exportación masiva con diagramas completos.
        </p>
      )}
    </div>
  );
}
