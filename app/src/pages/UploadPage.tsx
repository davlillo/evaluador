import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileCode, CheckCircle, AlertCircle, ArrowRight, Settings, ChevronDown, ChevronUp, FolderArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Stepper } from '@/components/Stepper';
import { ScoringModeSelector } from '@/components/ScoringModeSelector';
import { ExpectedCountsPanel } from '@/components/ExpectedCountsPanel';
import { RubricUploadPanel } from '@/components/RubricUploadPanel';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import { useGlobalEvaluation } from '@/context/GlobalEvaluationContext';
import type { ComparisonResult } from '@/types/comparison';
import type { BatchCompareResponse } from '@/types/evaluation-session';
import { DIAGRAM_TYPES, DEFAULT_WEIGHTS, type TypeWeights } from '@/lib/rubric';
import {
  DEFAULT_EVALUATION_PROFILE,
  SCORING_MODES_USING_EXPECTED_COUNTS,
  evaluationProfileToApiPayload,
  type EvaluationProfile,
  type ScoringMode,
} from '@/lib/scoring-modes';

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
    const includeW = weights.include_relations ?? 20;
    const extendW = weights.extend_relations ?? 15;
    const total = weights.classes + weights.attributes + weights.methods + includeW + extendW;
    const isValid = Math.abs(total - 100) < 0.01;
    const fields = [
      { key: 'classes' as const, label: 'Actores', color: 'text-blue-600' },
      { key: 'attributes' as const, label: 'Casos de uso', color: 'text-purple-600' },
      { key: 'methods' as const, label: 'Relaciones actor–CU', color: 'text-teal-600' },
      { key: 'include_relations' as const, label: 'Relaciones include', color: 'text-orange-600' },
      { key: 'extend_relations' as const, label: 'Relaciones extend', color: 'text-amber-600' },
    ];
    const valueFor = (key: typeof fields[number]['key']) => {
      if (key === 'include_relations') return includeW;
      if (key === 'extend_relations') return extendW;
      return weights[key];
    };
    return (
      <div className="mt-3 p-3 border rounded-lg bg-muted/10">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {fields.map(({ key, label, color }) => (
            <WeightSlider
              key={key}
              label={label}
              color={color}
              value={valueFor(key)}
              onChange={(v) => onChange({ ...weights, [key]: v, relationships: 0 })}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            {fields.map(({ key, color }) => (
              <div
                key={key}
                className={'h-full transition-all ' + color.replace('text-', 'bg-')}
                style={{ width: total > 0 ? (valueFor(key) / total) * 100 + '%' : '20%' }}
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

  const total =
    (weights.sync_messages ?? 35) +
    (weights.async_messages ?? 20) +
    (weights.creation_messages ?? 15) +
    (weights.fragment_usage ?? 30);
  const isValid = Math.abs(total - 100) < 0.01;
  return (
    <div className="mt-3 p-3 border rounded-lg bg-muted/10">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <WeightSlider
          label="Mensajes síncronos"
          color="text-blue-600"
          value={weights.sync_messages ?? 35}
          onChange={(v) => onChange({ ...weights, sync_messages: v })}
        />
        <WeightSlider
          label="Mensajes asíncronos"
          color="text-purple-600"
          value={weights.async_messages ?? 20}
          onChange={(v) => onChange({ ...weights, async_messages: v })}
        />
        <WeightSlider
          label="Mensajes de creación"
          color="text-teal-600"
          value={weights.creation_messages ?? 15}
          onChange={(v) => onChange({ ...weights, creation_messages: v })}
        />
        <WeightSlider
          label="Uso de fragmentos"
          color="text-orange-600"
          value={weights.fragment_usage ?? 30}
          onChange={(v) => onChange({ ...weights, fragment_usage: v })}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
          <div className="h-full bg-blue-500 transition-all" style={{ width: total > 0 ? ((weights.sync_messages ?? 35) / total) * 100 + '%' : '0%' }} />
          <div className="h-full bg-purple-500 transition-all" style={{ width: total > 0 ? ((weights.async_messages ?? 20) / total) * 100 + '%' : '0%' }} />
          <div className="h-full bg-teal-500 transition-all" style={{ width: total > 0 ? ((weights.creation_messages ?? 15) / total) * 100 + '%' : '0%' }} />
          <div className="h-full bg-orange-500 transition-all" style={{ width: total > 0 ? ((weights.fragment_usage ?? 30) / total) * 100 + '%' : '0%' }} />
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

export default function UploadPage() {
  const { setResult } = useEvaluationResult();
  const { setBatchEvaluation, clearGlobalEvaluation } = useGlobalEvaluation();
  const navigate = useNavigate();

  const [uploadMode, setUploadMode] = useState<'simple' | 'batch'>('simple');

  // Simple mode files
  const [expectedFile, setExpectedFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);

  const [batchZipFile, setBatchZipFile] = useState<File | null>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['class', 'usecase', 'sequence']));
  const [weightsByType, setWeightsByType] = useState<Record<string, TypeWeights>>({ ...DEFAULT_WEIGHTS });
  const [evaluationProfiles, setEvaluationProfiles] = useState<Record<string, EvaluationProfile>>({
    class: { ...DEFAULT_EVALUATION_PROFILE },
    usecase: { ...DEFAULT_EVALUATION_PROFILE },
    sequence: { ...DEFAULT_EVALUATION_PROFILE },
  });
  const [useSemanticMatching, setUseSemanticMatching] = useState(true);
  const [semanticThreshold, setSemanticThreshold] = useState(0.65);
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

  const updateEvaluationProfile = (typeKey: string, profile: EvaluationProfile) => {
    setEvaluationProfiles((prev) => ({ ...prev, [typeKey]: profile }));
  };

  const applyRubricProfiles = (profiles: Record<string, EvaluationProfile>) => {
    setEvaluationProfiles((prev) => ({ ...prev, ...profiles }));
  };

  /**
   * El backend aplica un único perfil de evaluación por request (igual que
   * los pesos globales), no uno distinto por tipo de diagrama. Se envía el
   * perfil del primer tipo seleccionado; si es 'similarity' (por defecto)
   * no se envía nada y el comportamiento es idéntico al actual.
   */
  const buildEvaluationProfileJson = (types: Set<string>): string | null => {
    const firstType = DIAGRAM_TYPES.find(({ key }) => types.has(key))?.key;
    if (!firstType) return null;
    const profile = evaluationProfiles[firstType];
    if (!profile || profile.mode === 'similarity') return null;
    return JSON.stringify(evaluationProfileToApiPayload(profile));
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
        if (typeKey === 'usecase') {
          formData.append(`${typeKey}_weight_include`, String(w.include_relations ?? 20));
          formData.append(`${typeKey}_weight_extend`, String(w.extend_relations ?? 15));
        } else {
          formData.append(`${typeKey}_weight_relationships`, String(w.relationships));
        }
        if (typeKey === 'sequence') {
          formData.append('sequence_weight_sync_messages', String(w.sync_messages ?? 35));
          formData.append('sequence_weight_async_messages', String(w.async_messages ?? 20));
          formData.append('sequence_weight_creation_messages', String(w.creation_messages ?? 15));
          formData.append('sequence_weight_fragment_usage', String(w.fragment_usage ?? 30));
        }
      }
      const evaluationProfileJson = buildEvaluationProfileJson(selectedTypes);
      if (evaluationProfileJson) formData.append('evaluation_profile_json', evaluationProfileJson);
      const response = await fetch(API_URL + '/api/compare-auto', {
        method: 'POST', body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al comparar archivos');
      }
      const data: AutoCompareResponse = await response.json();
      setResult(data, { studentFileName: studentFile.name });
      navigate('/resultados');
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
    clearGlobalEvaluation();
    try {
      const formData = new FormData();
      formData.append('expected_file', expectedFile);
      formData.append('students_zip', batchZipFile);
      formData.append('use_semantic_matching', String(useSemanticMatching));
      formData.append('semantic_threshold', String(semanticThreshold));
      formData.append('global_weight_class', String(globalWeights.class));
      formData.append('global_weight_usecase', String(globalWeights.usecase));
      formData.append('global_weight_sequence', String(globalWeights.sequence));
      const evaluationProfileJson = buildEvaluationProfileJson(new Set(['class', 'usecase', 'sequence']));
      if (evaluationProfileJson) formData.append('evaluation_profile_json', evaluationProfileJson);
      const response = await fetch(API_URL + '/api/compare-batch', {
        method: 'POST', body: formData,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || 'Error al evaluar lote');
      }
      const data: BatchCompareResponse = await response.json();
      setBatchEvaluation(data);
      navigate('/lote');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Encabezado con estado del flujo (paso 1 de 3) */}
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Nueva comparación</h2>
            <p className="text-muted-foreground max-w-2xl">
              Sube la solución oficial (docente) y la solución del estudiante para comenzar la evaluación.
            </p>
          </div>
        </div>
        <Stepper current={1} />
      </div>

      {/* Selector de modo */}
      <div className="flex items-center gap-2">
        <Badge
          variant={uploadMode === 'simple' ? 'default' : 'outline'}
          className="cursor-pointer px-4 py-2 text-sm"
          onClick={() => { setUploadMode('simple'); setError(null); }}
        >
          Un estudiante
        </Badge>
        <Badge
          variant={uploadMode === 'batch' ? 'default' : 'outline'}
          className="cursor-pointer px-4 py-2 text-sm"
          onClick={() => { setUploadMode('batch'); setError(null); }}
        >
          Lote (ZIP de estudiantes)
        </Badge>
      </div>

      {/* Dos zonas de subida */}
      <div className="grid md:grid-cols-2 gap-6">
        <FileUploadZone
          label="1. Solución oficial (Docente)"
          description="Este archivo será la referencia para la evaluación."
          file={expectedFile}
          onFileSelect={setExpectedFile}
          icon={<FileCode className="w-8 h-8" />}
        />
        {uploadMode === 'simple' ? (
          <FileUploadZone
            label="2. Solución del estudiante"
            description="Este archivo será comparado con la solución oficial."
            file={studentFile}
            onFileSelect={setStudentFile}
            icon={<Upload className="w-8 h-8" />}
          />
        ) : (
          <FileUploadZone
            label="2. ZIP de estudiantes"
            description="Un .xmi por estudiante; el nombre del archivo se usa como carné."
            accept=".zip"
            file={batchZipFile}
            onFileSelect={setBatchZipFile}
            icon={<FolderArchive className="w-8 h-8" />}
          />
        )}
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

            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                El modo de evaluación se configura una vez y aplica a todos los tipos de diagrama
                seleccionados en esta comparación.
              </p>
              {(() => {
                const firstType = DIAGRAM_TYPES.find(({ key }) => selectedTypes.has(key))?.key as
                  | 'class' | 'usecase' | 'sequence' | undefined;
                if (!firstType) return null;
                const profile = evaluationProfiles[firstType] ?? DEFAULT_EVALUATION_PROFILE;
                const mode: ScoringMode = profile.mode;
                return (
                  <>
                    <ScoringModeSelector
                      value={mode}
                      onChange={(newMode) => updateEvaluationProfile(firstType, { ...profile, mode: newMode })}
                    />
                    {SCORING_MODES_USING_EXPECTED_COUNTS.includes(mode) && (
                      <ExpectedCountsPanel
                        diagramType={firstType}
                        counts={profile.expectedCounts}
                        onChange={(expectedCounts) => updateEvaluationProfile(firstType, { ...profile, expectedCounts })}
                      />
                    )}
                    <RubricUploadPanel onApply={applyRubricProfiles} />
                  </>
                );
              })()}
            </div>
          </CardContent>
        )}
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Recomendaciones */}
      <div className="rounded-xl border bg-accent/40 p-4 text-sm">
        <p className="font-semibold text-primary mb-1.5">Recomendaciones</p>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5">
          <li>Exporta los diagramas a XMI desde <strong>Astah Professional</strong> o Visual Paradigm.</li>
          <li>Asegúrate de que los archivos correspondan al mismo tipo de diagrama.</li>
          <li>En modo lote, nombra cada archivo con el carné del estudiante (ej. <code>AB12345.xmi</code>).</li>
        </ul>
      </div>

      <div className="flex justify-end">
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
          className="min-w-[220px]"
        >
          {loading ? (
            <>
              <span className="animate-spin mr-2">&#x27f3;</span>
              {uploadMode === 'simple' ? 'Analizando…' : 'Evaluando lote…'}
            </>
          ) : (
            <>
              {uploadMode === 'simple' ? 'Comparar ahora' : 'Evaluar lote'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
