import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileCode, CheckCircle, AlertCircle, ArrowRight, Settings, ChevronDown, ChevronUp, ChevronRight, FolderArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import type { ComparisonResult } from '@/types/comparison';
import type { BatchCompareResponse } from '@/types/evaluation-session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AutoDetectedResult {
  diagram_type: string;
  similarity: number;
  comparison: ComparisonResult;
}

interface AutoCompareResponse {
  detected_diagrams: string[];
  results: AutoDetectedResult[];
  overall_similarity: number;
  expected_diagrams: Record<string, unknown>;
  student_diagrams: Record<string, unknown>;
  xmi_source_used: string;
  evaluator_version: string;
}

interface TypeWeights {
  classes: number;
  attributes: number;
  methods: number;
  relationships: number;
}

const DIAGRAM_TYPES = [
  { key: 'class', label: 'Diagrama de Clases' },
  { key: 'usecase', label: 'Casos de Uso' },
  { key: 'sequence', label: 'Diagrama de Secuencia' },
];

const DEFAULT_WEIGHTS: Record<string, TypeWeights> = {
  class: { classes: 35, attributes: 25, methods: 25, relationships: 15 },
  usecase: { classes: 35, attributes: 25, methods: 0, relationships: 40 },
  sequence: { classes: 40, attributes: 0, methods: 0, relationships: 60 },
};

function WeightSlider({
  label,
  value,
  onChange,
  color,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`text-xs font-semibold ${color}`}>{label}</label>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          className="w-full border rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background disabled:bg-muted disabled:cursor-not-allowed"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function WeightsPanel({
  typeKey,
  weights,
  onChange,
}: {
  typeKey: string;
  weights: TypeWeights;
  onChange: (w: TypeWeights) => void;
}) {
  if (typeKey === 'class') {
    const total = weights.classes + weights.attributes + weights.methods + weights.relationships;
    const isValid = Math.abs(total - 100) < 0.01;
    const fields = [
      { key: 'classes' as const, label: 'Clases', color: 'text-blue-600' },
      { key: 'attributes' as const, label: 'Atributos', color: 'text-purple-600' },
      { key: 'methods' as const, label: 'Métodos', color: 'text-teal-600' },
      { key: 'relationships' as const, label: 'Relaciones', color: 'text-orange-600' },
    ];
    return (
      <div className="mt-3 p-3 border rounded-lg bg-muted/10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {fields.map(({ key, label, color }) => (
            <WeightSlider
              key={key}
              label={label}
              color={color}
              value={weights[key]}
              onChange={(v) => onChange({ ...weights, [key]: v })}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
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
        {!isValid && <p className="text-xs text-red-500 mt-1">Debe sumar 100%.</p>}
      </div>
    );
  }

  if (typeKey === 'usecase') {
    const total = weights.classes + weights.attributes + weights.relationships;
    const isValid = Math.abs(total - 100) < 0.01;
    const fields = [
      { key: 'classes' as const, label: 'Actores', color: 'text-blue-600' },
      { key: 'attributes' as const, label: 'Casos de uso', color: 'text-purple-600' },
      { key: 'relationships' as const, label: 'Relaciones', color: 'text-orange-600' },
    ];
    return (
      <div className="mt-3 p-3 border rounded-lg bg-muted/10">
        <div className="grid grid-cols-3 gap-3">
          {fields.map(({ key, label, color }) => (
            <WeightSlider
              key={key}
              label={label}
              color={color}
              value={weights[key]}
              onChange={(v) => onChange({ ...weights, [key]: v, methods: 0 })}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            {fields.map(({ key, color }) => (
              <div
                key={key}
                className={'h-full transition-all ' + color.replace('text-', 'bg-')}
                style={{ width: total > 0 ? (weights[key] / total) * 100 + '%' : '33%' }}
              />
            ))}
          </div>
          <span className={'text-xs font-medium ' + (isValid ? 'text-green-600' : 'text-red-500')}>
            Total: {Math.round(total)}%
          </span>
        </div>
        {!isValid && <p className="text-xs text-red-500 mt-1">Debe sumar 100%.</p>}
      </div>
    );
  }

  const total = weights.classes + weights.relationships;
  const isValid = Math.abs(total - 100) < 0.01;
  return (
    <div className="mt-3 p-3 border rounded-lg bg-muted/10">
      <div className="grid grid-cols-2 gap-3">
        <WeightSlider label="Líneas de vida" color="text-blue-600" value={weights.classes} onChange={(v) => onChange({ ...weights, classes: v })} />
        <WeightSlider label="Mensajes" color="text-orange-600" value={weights.relationships} onChange={(v) => onChange({ ...weights, relationships: v })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
          <div className="h-full bg-blue-500 transition-all" style={{ width: total > 0 ? (weights.classes / total) * 100 + '%' : '50%' }} />
          <div className="h-full bg-orange-500 transition-all" style={{ width: total > 0 ? (weights.relationships / total) * 100 + '%' : '50%' }} />
        </div>
        <span className={'text-xs font-medium ' + (isValid ? 'text-green-600' : 'text-red-500')}>
          Total: {Math.round(total)}%
        </span>
      </div>
      {!isValid && <p className="text-xs text-red-500 mt-1">Debe sumar 100%.</p>}
    </div>
  );
}

function GlobalWeightsPanel({
  weights,
  onChange,
  selectedTypes,
}: {
  weights: Record<string, number>;
  onChange: (key: string, v: number) => void;
  selectedTypes: Set<string>;
}) {
  const total = DIAGRAM_TYPES
    .filter(({ key }) => selectedTypes.has(key))
    .reduce((s, { key }) => s + (weights[key] || 0), 0);
  const isValid = Math.abs(total - 100) < 0.01;
  const fields = [
    { key: 'class', label: 'Clases', color: 'text-blue-600' },
    { key: 'usecase', label: 'Casos de Uso', color: 'text-purple-600' },
    { key: 'sequence', label: 'Secuencia', color: 'text-teal-600' },
  ];
  return (
    <div className="mt-4 p-3 border rounded-lg bg-muted/10">
      <h4 className="text-sm font-semibold mb-3">Peso global por tipo de diagrama</h4>
      <div className="grid grid-cols-3 gap-3">
        {fields.map(({ key, label, color }) => (
          <WeightSlider
            key={key}
            label={label}
            color={color}
            value={selectedTypes.has(key) ? weights[key] : 0}
            disabled={!selectedTypes.has(key)}
            onChange={(v) => onChange(key, v)}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
          {fields.map(({ key, color }) => {
            if (!selectedTypes.has(key)) return null;
            const pct = total > 0 ? (weights[key] / total) * 100 + '%' : '0%';
            return (
              <div
                key={key}
                className={'h-full transition-all ' + color.replace('text-', 'bg-')}
                style={{ width: pct }}
              />
            );
          })}
        </div>
        <span className={'text-xs font-medium ' + (isValid ? 'text-green-600' : 'text-red-500')}>
          Total: {Math.round(total)}%
        </span>
      </div>
      {!isValid && <p className="text-xs text-red-500 mt-1">Debe sumar 100%.</p>}
    </div>
  );
}

function FileUploadZone({
  label,
  description,
  file,
  onFileSelect,
  icon,
  accept,
}: {
  label: string;
  description: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  icon: React.ReactNode;
  accept?: string;
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
        accept={accept || '.xmi,.xml,.uml'}
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

function formatScore(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  return Number(value).toFixed(2);
}

export default function UploadPage() {
  const { setResult } = useEvaluationResult();
  const navigate = useNavigate();

  const [uploadMode, setUploadMode] = useState<'simple' | 'batch'>('simple');

  // Simple mode files
  const [expectedFile, setExpectedFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);

  const [batchZipFile, setBatchZipFile] = useState<File | null>(null);
  const [batchResult, setBatchResult] = useState<BatchCompareResponse | null>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['class', 'usecase', 'sequence']));
  const [weightsByType, setWeightsByType] = useState<Record<string, TypeWeights>>({ ...DEFAULT_WEIGHTS });
  const [useSemanticMatching, setUseSemanticMatching] = useState(true);
  const [semanticThreshold, setSemanticThreshold] = useState(0.55);
  const [globalWeights, setGlobalWeights] = useState<Record<string, number>>({
    class: 40, usecase: 35, sequence: 25,
  });

  const updateGlobalWeight = (key: string, value: number) => {
    setGlobalWeights((prev) => ({ ...prev, [key]: value }));
  };

  const toggleType = (key: string) => {
    const next = new Set(selectedTypes);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedTypes(next);
  };

  const updateWeights = (typeKey: string, weights: TypeWeights) => {
    setWeightsByType((prev) => ({ ...prev, [typeKey]: weights }));
  };

  const handleSingleCompare = async () => {
    if (!expectedFile || !studentFile) {
      setError('Por favor selecciona ambos archivos (solución y del estudiante)');
      return;
    }
    if (selectedTypes.size === 0) {
      setError('Seleccioná al menos un tipo de diagrama.');
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
      formData.append('xmi_source', 'astah');
      formData.append('selected_types', Array.from(selectedTypes).join(','));
      formData.append('use_semantic_matching', String(useSemanticMatching));
      formData.append('semantic_threshold', String(semanticThreshold));
      if (selectedTypes.has('class')) formData.append('global_weight_class', String(globalWeights.class));
      if (selectedTypes.has('usecase')) formData.append('global_weight_usecase', String(globalWeights.usecase));
      if (selectedTypes.has('sequence')) formData.append('global_weight_sequence', String(globalWeights.sequence));
      for (const [typeKey, w] of Object.entries(weightsByType)) {
        if (!selectedTypes.has(typeKey)) continue;
        formData.append(`${typeKey}_weight_classes`, String(w.classes));
        formData.append(`${typeKey}_weight_attributes`, String(w.attributes));
        formData.append(`${typeKey}_weight_methods`, String(w.methods));
        formData.append(`${typeKey}_weight_relationships`, String(w.relationships));
      }
      const response = await fetch(API_URL + '/api/compare-auto', {
        method: 'POST', body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al comparar archivos');
      }
      const data: AutoCompareResponse = await response.json();
      setResult(data, { studentFileName: studentFile.name });
      navigate('/evaluar/resultados');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCompare = async () => {
    if (!expectedFile || !batchZipFile) {
      setError('Por favor selecciona la solución XMI y el ZIP de estudiantes.');
      return;
    }
    setLoading(true);
    setError(null);
    setBatchResult(null);
    try {
      const formData = new FormData();
      formData.append('expected_file', expectedFile);
      formData.append('students_zip', batchZipFile);
      formData.append('use_semantic_matching', String(useSemanticMatching));
      formData.append('semantic_threshold', String(semanticThreshold));
      formData.append('global_weight_class', String(globalWeights.class));
      formData.append('global_weight_usecase', String(globalWeights.usecase));
      formData.append('global_weight_sequence', String(globalWeights.sequence));
      const response = await fetch(API_URL + '/api/compare-batch', {
        method: 'POST', body: formData,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || 'Error al evaluar lote');
      }
      const data: BatchCompareResponse = await response.json();
      setBatchResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-center gap-2">
        <Badge
          variant={uploadMode === 'simple' ? 'default' : 'outline'}
          className="cursor-pointer px-4 py-2 text-sm"
          onClick={() => { setUploadMode('simple'); setError(null); }}
        >
          Evaluar un alumno
        </Badge>
        <span className="text-muted-foreground text-sm">|</span>
        <Badge
          variant={uploadMode === 'batch' ? 'default' : 'outline'}
          className="cursor-pointer px-4 py-2 text-sm"
          onClick={() => { setUploadMode('batch'); setError(null); }}
        >
          Evaluar múltiples alumnos
        </Badge>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Compara Diagramas UML</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          {uploadMode === 'simple'
            ? 'Sube la solución del docente y el archivo del estudiante para compararlos.'
            : 'Sube la solución (XMI) y un ZIP con los archivos de todos los estudiantes.'}
        </p>
      </div>

      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <FileUploadZone
            label="Solución del Docente"
            description="Archivo XMI de referencia"
            file={expectedFile}
            onFileSelect={setExpectedFile}
            icon={<FileCode className="w-8 h-8" />}
          />
          {uploadMode === 'simple' ? (
            <FileUploadZone
              label="Archivo del Estudiante"
              description="Archivo XMI del estudiante"
              file={studentFile}
              onFileSelect={setStudentFile}
              icon={<Upload className="w-8 h-8" />}
            />
          ) : (
            <FileUploadZone
              label="ZIP de Estudiantes"
              description="ZIP con los XMI de cada estudiante"
              accept=".zip"
              file={batchZipFile}
              onFileSelect={setBatchZipFile}
              icon={<FolderArchive className="w-8 h-8" />}
            />
          )}
        </div>
      </div>

      <Card className="border-dashed">
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Configuración de pesos</span>
          </div>
          {showConfig ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </button>

        {showConfig && (
          <CardContent className="pt-0 pb-4 border-t">
            <p className="text-xs text-muted-foreground mt-3 mb-3">
              Seleccioná qué tipos de diagrama evaluar y configurá el porcentaje de cada criterio.
            </p>

            <div className="flex flex-wrap gap-4 mb-4">
              {DIAGRAM_TYPES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(key)}
                    onChange={() => toggleType(key)}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              {DIAGRAM_TYPES.filter(({ key }) => selectedTypes.has(key)).map(({ key, label }) => (
                <div key={key} className="p-3 border rounded-lg">
                  <h4 className="text-sm font-semibold">{label}</h4>
                  <WeightsPanel
                    typeKey={key}
                    weights={weightsByType[key] || DEFAULT_WEIGHTS[key]}
                    onChange={(w) => updateWeights(key, w)}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 border rounded-lg bg-muted/10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold">Corrección semántica</h4>
                  <p className="text-xs text-muted-foreground">FastText para detectar sinónimos y variantes</p>
                </div>
                <Switch
                  checked={useSemanticMatching}
                  onCheckedChange={setUseSemanticMatching}
                />
              </div>
              {useSemanticMatching && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium">Umbral:</span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.0}
                    step={0.05}
                    value={semanticThreshold}
                    onChange={(e) => setSemanticThreshold(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono w-10 text-right">{semanticThreshold.toFixed(2)}</span>
                </div>
              )}
            </div>

            <GlobalWeightsPanel
              weights={globalWeights}
              onChange={updateGlobalWeight}
              selectedTypes={selectedTypes}
            />
          </CardContent>
        )}
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={uploadMode === 'simple' ? handleSingleCompare : handleBatchCompare}
          disabled={
            loading ||
            (uploadMode === 'simple'
              ? !expectedFile || !studentFile
              : !expectedFile || !batchZipFile) ||
            selectedTypes.size === 0
          }
          className="min-w-[250px]"
        >
          {loading ? (
            <>
              <span className="animate-spin mr-2">&#x27f3;</span>
              {uploadMode === 'simple' ? 'Analizando diagramas...' : 'Evaluando estudiantes...'}
            </>
          ) : (
            <>
              <ArrowRight className="w-5 h-5 mr-2" />
              {uploadMode === 'simple' ? 'Comparar' : 'Evaluar lote'}
            </>
          )}
        </Button>
      </div>

      {batchResult && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                Estudiantes: {batchResult.students_total} | Completos: {batchResult.students_complete} | Incompletos: {batchResult.students_incomplete}
              </p>
              <Accordion type="single" collapsible className="w-full">
                {batchResult.results.map((row) => (
                  <AccordionItem key={row.student_id} value={row.student_id}>
                    <AccordionTrigger className="hover:bg-muted/40 px-3 rounded-lg">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="font-medium truncate">{row.student_id}</span>
                        <span className="text-sm font-semibold ml-auto">{formatScore(row.final_score)}%</span>
                        {row.complete ? (
                          <Badge className="shrink-0">Completo</Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">Incompleto</Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 px-3 pb-3">
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          {Object.entries(row.runs).map(([kind, run]) => (
                            <div key={kind} className="p-3 border rounded-lg bg-muted/10">
                              <p className="text-xs text-muted-foreground capitalize">{kind}</p>
                              <p className="text-lg font-semibold">{formatScore(run.similarity)}%</p>
                            </div>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => navigate('/evaluar/global/desglose', { state: { student: { ...row, runs: { class: row.runs.class || { status: 'missing', similarity: null }, usecase: row.runs.usecase || { status: 'missing', similarity: null }, sequence: row.runs.sequence || { status: 'missing', similarity: null } } } } })}
                        >
                          <ChevronRight className="w-4 h-4 mr-2" />
                          Ver desglose detallado
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
