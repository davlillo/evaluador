import {
  useState,
  useCallback,
} from 'react';
import { Upload, FileCode, CheckCircle, AlertCircle, Info, Settings, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Weights } from '@/types/comparison';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UploadPageProps {
  onResult: (data: any) => void;
  onNavigate: (page: string) => void;
}

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

function WeightsPanel({
  weights,
  onChange,
}: {
  weights: Weights;
  onChange: (weights: Weights) => void;
}) {
  const total = weights.classes + weights.attributes + weights.methods + weights.relationships;
  const isValid = Math.abs(total - 100) < 0.01;

  const fields: { key: keyof Weights; label: string; color: string }[] = [
    { key: 'classes', label: 'Clases', color: 'text-blue-600' },
    { key: 'attributes', label: 'Atributos', color: 'text-purple-600' },
    { key: 'methods', label: 'Métodos', color: 'text-teal-600' },
    { key: 'relationships', label: 'Relaciones', color: 'text-orange-600' },
  ];

  const handleChange = (key: keyof Weights, value: string) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0));
    onChange({ ...weights, [key]: num });
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Ponderación de criterios
        </CardTitle>
        <CardDescription className="text-xs">
          Define cuánto vale cada criterio en la nota final. Los valores deben sumar 100%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {fields.map(({ key, label, color }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className={'text-xs font-semibold ' + color}>{label}</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full border rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            {fields.map(({ key, color }) => (
              <div
                key={key}
                className={'h-full transition-all ' + color.replace('text-', 'bg-')}
                style={{ width: total > 0 ? (weights[key] / total) * 100 + '%' : '25%' }}
              />
            ))}
          </div>
          <span className={'text-xs font-medium ' + (isValid ? 'text-green-600' : 'text-red-500')}>
            Total: {Math.round(total)}%
          </span>
        </div>

        {!isValid && (
          <p className="text-xs text-red-500 mt-2">
            La suma debe ser exactamente 100%. Actualmente es {Math.round(total)}%.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function UploadPage({ onResult, onNavigate }: UploadPageProps) {
  const [expectedFile, setExpectedFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights>({
    classes: 35,
    attributes: 25,
    methods: 25,
    relationships: 15,
  });

  const weightsTotal = weights.classes + weights.attributes + weights.methods + weights.relationships;
  const weightsValid = Math.abs(weightsTotal - 100) < 0.01;

  const handleCompare = async () => {
    if (!expectedFile || !studentFile) {
      setError('Por favor selecciona ambos archivos');
      return;
    }
    if (!weightsValid) {
      setError('La suma de las ponderaciones debe ser exactamente 100%');
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
      formData.append('weight_classes', String(weights.classes));
      formData.append('weight_attributes', String(weights.attributes));
      formData.append('weight_methods', String(weights.methods));
      formData.append('weight_relationships', String(weights.relationships));

      const response = await fetch(API_URL + '/api/compare', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al comparar archivos');
      }

      const data = await response.json();
      onResult(data);
      onNavigate('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Compara Diagramas UML</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Sube el archivo de la solución correcta y el archivo del estudiante para evaluar automáticamente la
          similitud entre ambos diagramas UML.
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

      <WeightsPanel weights={weights} onChange={setWeights} />

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

      <Card className="bg-muted/50 border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Formatos soportados</p>
              <p>
                Archivos XMI, XML y UML generados por StarUML, Enterprise Architect, Visual Paradigm, Astah,
                Eclipse Papyrus y otras herramientas de modelado UML.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
