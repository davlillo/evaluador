import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, FileCode, FolderArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useEvaluationWizard } from '@/context/EvaluationWizardContext';
import type { GlobalComparisonResponse, GlobalDiagramWeights } from '@/types/evaluation-session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_FALLBACK_URL = 'http://localhost:8100';

const defaultWeights: GlobalDiagramWeights = {
  class: 40,
  usecase: 35,
  sequence: 25,
};

interface UploadBoxProps {
  id: string;
  title: string;
  description: string;
  accept: string;
  file: File | null;
  onSelect: (f: File) => void;
  icon: React.ReactNode;
}

function UploadBox({
  id,
  title,
  description,
  accept,
  file,
  onSelect,
  icon,
}: UploadBoxProps) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onSelect(f);
    },
    [onSelect],
  );

  return (
    <div
      className={
        'rounded-xl border-2 border-dashed p-4 transition-colors cursor-pointer ' +
        (dragOver ? 'border-primary bg-primary/5 ' : 'border-border hover:border-primary/50 ') +
        (file ? 'border-primary bg-primary/5' : '')
      }
      onClick={() => document.getElementById(id)?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
      <div className="flex items-start gap-3">
        <div className="rounded-full w-9 h-9 bg-muted flex items-center justify-center shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {file && (
            <Badge variant="secondary" className="mt-2 max-w-full truncate">
              <CheckCircle className="w-3 h-3 mr-1" />
              {file.name}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return Number(value).toFixed(2);
}

export default function GlobalEvaluationPlaceholderPage() {
  const navigate = useNavigate();
  const { mode, xmiSource } = useEvaluationWizard();
  const [w, setW] = useState<GlobalDiagramWeights>(defaultWeights);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GlobalComparisonResponse | null>(null);

  const [expectedClassFile, setExpectedClassFile] = useState<File | null>(null);
  const [studentsClassZip, setStudentsClassZip] = useState<File | null>(null);
  const [expectedUsecaseFile, setExpectedUsecaseFile] = useState<File | null>(null);
  const [studentsUsecaseZip, setStudentsUsecaseZip] = useState<File | null>(null);
  const [expectedSequenceFile, setExpectedSequenceFile] = useState<File | null>(null);
  const [studentsSequenceZip, setStudentsSequenceZip] = useState<File | null>(null);

  const total = w.class + w.usecase + w.sequence;
  const valid = Math.abs(total - 100) < 0.01;
  const allFilesPresent = Boolean(
    expectedClassFile &&
      studentsClassZip &&
      expectedUsecaseFile &&
      studentsUsecaseZip &&
      expectedSequenceFile &&
      studentsSequenceZip,
  );

  const setField = (key: keyof GlobalDiagramWeights, value: string) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setW((prev) => ({ ...prev, [key]: n }));
  };

  const submitGlobal = async () => {
    if (!xmiSource) {
      setError('Primero selecciona el origen XMI desde la pantalla de modo de evaluación.');
      return;
    }
    if (!valid) {
      setError('El reparto global debe sumar exactamente 100%.');
      return;
    }
    if (!allFilesPresent) {
      setError('Debes subir los 6 archivos (3 soluciones + 3 ZIP).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('expected_class_file', expectedClassFile as File);
      formData.append('students_class_zip', studentsClassZip as File);
      formData.append('expected_usecase_file', expectedUsecaseFile as File);
      formData.append('students_usecase_zip', studentsUsecaseZip as File);
      formData.append('expected_sequence_file', expectedSequenceFile as File);
      formData.append('students_sequence_zip', studentsSequenceZip as File);
      formData.append('global_weight_class', String(w.class));
      formData.append('global_weight_usecase', String(w.usecase));
      formData.append('global_weight_sequence', String(w.sequence));
      formData.append('xmi_source', xmiSource);

      let response = await fetch(API_URL + '/api/compare-global', {
        method: 'POST',
        body: formData,
      });

      // Compatibilidad local: algunos entornos tienen un backend antiguo fijo en :8000.
      // Si responde 404 para compare-global, reintentar contra :8100.
      if (!response.ok && response.status === 404 && API_URL !== API_FALLBACK_URL) {
        response = await fetch(API_FALLBACK_URL + '/api/compare-global', {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || 'No se pudo ejecutar la evaluacion global.');
      }
      const data = (await response.json()) as GlobalComparisonResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  };

  const requestCompare = () => void submitGlobal();

  if (mode !== 'global' || !xmiSource) {
    return <Navigate to="/evaluar/modo" replace />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Evaluacion global por estudiante</CardTitle>
          <CardDescription>
            Sube 3 soluciones (clases/casos/secuencia) y 3 ZIP de estudiantes. Se calcula la nota final
            ponderada por carnet o nombre de estudiante.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">Reparto global</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="gw-class">Clases %</Label>
                <Input
                  id="gw-class"
                  type="number"
                  min={0}
                  max={100}
                  value={w.class}
                  onChange={(e) => setField('class', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gw-uc">Casos de uso %</Label>
                <Input
                  id="gw-uc"
                  type="number"
                  min={0}
                  max={100}
                  value={w.usecase}
                  onChange={(e) => setField('usecase', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gw-seq">Secuencia %</Label>
                <Input
                  id="gw-seq"
                  type="number"
                  min={0}
                  max={100}
                  value={w.sequence}
                  onChange={(e) => setField('sequence', e.target.value)}
                />
              </div>
            </div>
            <p className={'text-sm ' + (valid ? 'text-green-600' : 'text-destructive')}>
              Total: {total}% {valid ? '(valido)' : '(debe sumar 100%)'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagrama de clases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <UploadBox
              id="global-expected-class"
              title="Solucion de clases"
              description="Archivo .xmi/.xml/.uml del docente"
              accept=".xmi,.xml,.uml"
              file={expectedClassFile}
              onSelect={setExpectedClassFile}
              icon={<FileCode className="w-4 h-4" />}
            />
            <UploadBox
              id="global-zip-class"
              title="ZIP estudiantes (clases)"
              description="ZIP con entregas de clase"
              accept=".zip"
              file={studentsClassZip}
              onSelect={setStudentsClassZip}
              icon={<FolderArchive className="w-4 h-4" />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Casos de uso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <UploadBox
              id="global-expected-usecase"
              title="Solucion de casos de uso"
              description="Archivo .xmi/.xml/.uml del docente"
              accept=".xmi,.xml,.uml"
              file={expectedUsecaseFile}
              onSelect={setExpectedUsecaseFile}
              icon={<FileCode className="w-4 h-4" />}
            />
            <UploadBox
              id="global-zip-usecase"
              title="ZIP estudiantes (casos)"
              description="ZIP con entregas de casos de uso"
              accept=".zip"
              file={studentsUsecaseZip}
              onSelect={setStudentsUsecaseZip}
              icon={<FolderArchive className="w-4 h-4" />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Secuencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <UploadBox
              id="global-expected-sequence"
              title="Solucion de secuencia"
              description="Archivo .xmi/.xml/.uml del docente"
              accept=".xmi,.xml,.uml"
              file={expectedSequenceFile}
              onSelect={setExpectedSequenceFile}
              icon={<FileCode className="w-4 h-4" />}
            />
            <UploadBox
              id="global-zip-sequence"
              title="ZIP estudiantes (secuencia)"
              description="ZIP con entregas de secuencia"
              accept=".zip"
              file={studentsSequenceZip}
              onSelect={setStudentsSequenceZip}
              icon={<FolderArchive className="w-4 h-4" />}
            />
          </CardContent>
        </Card>
      </div>

      {xmiSource && (
        <p className="text-sm text-muted-foreground text-center">
          Fuente XMI seleccionada: <strong className="text-foreground">{xmiSource === 'astah' ? 'Astah' : 'Visual Paradigm'}</strong>
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => navigate('/evaluar/modo')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al modo de evaluacion
        </Button>
        <Button onClick={requestCompare} disabled={!allFilesPresent || !valid || loading}>
          {loading ? (
            <>
              <span className="animate-spin mr-2">&#x27f3;</span>
              Evaluando lote...
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4 mr-2" />
              Evaluar lote global
            </>
          )}
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resultados globales</CardTitle>
              <CardDescription>
                Estudiantes: {result.students_total} | Completos: {result.students_complete} | Incompletos:{' '}
                {result.students_incomplete}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Estudiante</th>
                      <th className="text-right p-2">Clases</th>
                      <th className="text-right p-2">Casos</th>
                      <th className="text-right p-2">Secuencia</th>
                      <th className="text-right p-2">Nota final</th>
                      <th className="text-center p-2">Estado</th>
                      <th className="text-center p-2">Desglose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((row) => (
                      <tr key={row.student_id} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-medium">{row.student_id}</td>
                          <td className="p-2 text-right">{formatScore(row.runs.class.similarity)}</td>
                          <td className="p-2 text-right">{formatScore(row.runs.usecase.similarity)}</td>
                          <td className="p-2 text-right">{formatScore(row.runs.sequence.similarity)}</td>
                          <td className="p-2 text-right font-semibold">{formatScore(row.final_score)}</td>
                          <td className="p-2 text-center">
                            {row.complete ? (
                              <Badge>Completo</Badge>
                            ) : (
                              <Badge variant="secondary">Incompleto</Badge>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate('/evaluar/global/desglose', { state: { student: row } })}
                            >
                              Ver desglose
                            </Button>
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
