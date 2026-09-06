import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { EvaluationProfile } from '@/lib/scoring-modes';
import { apiProfileToEvaluationProfile, SCORING_MODE_LABELS } from '@/lib/scoring-modes';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface RubricParseResponse {
  [diagramType: string]: {
    mode: string;
    expected_counts: { element_type: string; expected_quantity: number; label?: string | null }[];
    class_rules?: Array<{
      rule_id: string;
      criterion_type: 'classes' | 'relationship' | 'multiplicity' | 'association_class';
      label: string;
      weight: number;
      expected_quantity?: number | null;
      source?: string | null;
      target?: string | null;
      relationship_type?: string;
      multiplicity_end?: 'source' | 'target' | null;
      expected_multiplicity?: string | null;
    }>;
  };
}

export function RubricUploadPanel({
  onApply,
}: {
  onApply: (profiles: Record<string, EvaluationProfile>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RubricParseResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    window.open(API_URL + '/api/rubric-template', '_blank');
  };

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('rubric_file', file);
      const response = await fetch(API_URL + '/api/rubric/parse', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const detail = payload?.detail;
        const message = Array.isArray(detail?.errors) ? detail.errors.join('\n') : (detail || 'Error al parsear la rúbrica.');
        throw new Error(message);
      }
      const data: RubricParseResponse = await response.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al subir la rúbrica.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    const profiles: Record<string, EvaluationProfile> = {};
    for (const [diagramType, raw] of Object.entries(preview)) {
      profiles[diagramType] = apiProfileToEvaluationProfile(raw);
    }
    onApply(profiles);
  };

  return (
    <div className="p-3 border rounded-lg bg-muted/10 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Rúbrica de cantidades esperadas (Excel)</h4>
        <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <Download className="w-4 h-4 mr-1" />
          Descargar plantilla
        </Button>
      </div>

      <label
        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-5 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
      >
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />
        <FileSpreadsheet className="w-6 h-6 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {fileName ? fileName : 'Subir rúbrica completada (.xlsx)'}
        </span>
      </label>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analizando rúbrica…
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
        </Alert>
      )}

      {preview && !loading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            Rúbrica leída correctamente.
          </div>
          <div className="grid sm:grid-cols-3 gap-2 text-xs">
            {Object.entries(preview).map(([diagramType, profile]) => (
              <div key={diagramType} className="border rounded-md p-2">
                <p className="font-semibold capitalize">{diagramType}</p>
                <p className="text-muted-foreground">{SCORING_MODE_LABELS[profile.mode as keyof typeof SCORING_MODE_LABELS] ?? profile.mode}</p>
                <p className="text-muted-foreground">
                  {(profile.class_rules?.length ?? profile.expected_counts.length)} criterio(s) configurado(s)
                </p>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" onClick={handleApply}>
            Aplicar a esta evaluación
          </Button>
        </div>
      )}
    </div>
  );
}
