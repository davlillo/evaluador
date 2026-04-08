import {
  useState,
  useCallback,
  useEffect,
} from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Upload, FileCode, CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEvaluationWizard } from '@/context/EvaluationWizardContext';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { WeightsByDiagramType } from '@/components/WeightsByDiagramType';
import {
  defaultWeightsForKind,
  weightsValidForKind,
  SEQUENCE_FIXED_WEIGHTS,
} from '@/lib/weights-diagram';
import type { Weights } from '@/types/comparison';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function FileUploadZone({
  label,
  description,
  file,
  onFileSelect,
  icon,
}: {
  label: string;
  description: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  icon: React.ReactNode;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) onFileSelect(droppedFile);
    },
    [onFileSelect],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) onFileSelect(selectedFile);
    },
    [onFileSelect],
  );

  return (
    <div
      className={
        'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer' +
        (isDragOver ? ' border-primary bg-primary/5 scale-[1.02]' : ' border-border hover:border-primary/50 hover:bg-muted/30') +
        (file ? ' bg-primary/5 border-primary' : '')
      }
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input-' + label)?.click()}
    >
      <input
        id={'file-input-' + label}
        type="file"
        accept=".xmi,.xml,.uml"
        className="hidden"
        onChange={handleFileInput}
      />
      <div className="flex flex-col items-center gap-4">
        <div
          className={
            'w-16 h-16 rounded-full flex items-center justify-center transition-colors' +
            (file ? ' bg-primary text-primary-foreground' : ' bg-muted text-muted-foreground')
          }
        >
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-lg">{label}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {file && (
          <Badge variant="secondary" className="mt-2">
            <CheckCircle className="w-3 h-3 mr-1" />
            {file.name}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  const { diagramKind, xmiSource } = useEvaluationWizard();
  const { setResult } = useEvaluationResult();
  const navigate = useNavigate();

  const [expectedFile, setExpectedFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights>(() =>
    diagramKind ? defaultWeightsForKind(diagramKind) : defaultWeightsForKind('class'),
  );

  useEffect(() => {
    if (diagramKind) {
      setWeights(defaultWeightsForKind(diagramKind));
    }
  }, [diagramKind]);

  if (!diagramKind || !xmiSource) {
    return <Navigate to="/evaluar/tipo" replace />;
  }

  const weightsForSubmit: Weights =
    diagramKind === 'sequence' ? SEQUENCE_FIXED_WEIGHTS : weights;

  const weightsValid = weightsValidForKind(diagramKind, weights);

  const handleCompare = async () => {
    if (!expectedFile || !studentFile) {
      setError('Por favor selecciona ambos archivos');
      return;
    }
    if (!weightsValid) {
      setError('La suma de las ponderaciones debe ser exactamente 100% (según el tipo de diagrama).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('expected_file', expectedFile);
      formData.append('student_file', studentFile);
      formData.append('case_sensitive', 'false');
      formData.append('strict_types', 'true');
      formData.append('weight_classes', String(weightsForSubmit.classes));
      formData.append('weight_attributes', String(weightsForSubmit.attributes));
      formData.append('weight_methods', String(weightsForSubmit.methods));
      formData.append('weight_relationships', String(weightsForSubmit.relationships));
      formData.append('expected_diagram_type', diagramKind);
      formData.append('xmi_source', xmiSource);

      const response = await fetch(API_URL + '/api/compare', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al comparar archivos');
      }

      const data = await response.json();
      setResult(data, { studentFileName: studentFile.name });
      navigate('/evaluar/resultados');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const kindLabel =
    diagramKind === 'class'
      ? 'diagrama de clases'
      : diagramKind === 'usecase'
        ? 'casos de uso'
        : 'diagrama de secuencia';
  const sourceLabel = xmiSource === 'visual_paradigm' ? 'Visual Paradigm' : 'Astah';

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex w-full items-center">
          <div className="flex flex-1 justify-start">
            <Button variant="ghost" onClick={() => navigate('/evaluar/tipo')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </div>
          <h2 className="shrink-0 text-3xl font-bold">Compara Diagramas UML</h2>
          <div className="flex-1" aria-hidden="true" />
        </div>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Tipo seleccionado: <strong className="text-foreground">{kindLabel}</strong>. Sube la solución y el
          archivo del estudiante (XMI/XML). Opcionalmente podrás usar ZIP en una versión futura.
        </p>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm">
          Formato XMI seleccionado: <strong className="text-foreground">{sourceLabel}</strong>.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <FileUploadZone
          label="Solución Correcta"
          description="Arrastra o haz clic para seleccionar el archivo XMI/XML de referencia"
          file={expectedFile}
          onFileSelect={setExpectedFile}
          icon={<FileCode className="w-8 h-8" />}
        />
        <FileUploadZone
          label="Diagrama del Estudiante"
          description="Arrastra o haz clic para seleccionar el archivo XMI/XML del estudiante"
          file={studentFile}
          onFileSelect={setStudentFile}
          icon={<Upload className="w-8 h-8" />}
        />
      </div>

      <WeightsByDiagramType diagramKind={diagramKind} weights={weights} onChange={setWeights} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleCompare}
          disabled={!expectedFile || !studentFile || loading || !weightsValid}
          className="min-w-[200px]"
        >
          {loading ? (
            <>
              <span className="animate-spin mr-2">&#x27f3;</span>
              Comparando...
            </>
          ) : (
            <>
              <ArrowRight className="w-5 h-5 mr-2" />
              Comparar Diagramas
            </>
          )}
        </Button>
      </div>

    </div>
  );
}
