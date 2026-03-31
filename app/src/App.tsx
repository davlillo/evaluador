import { useState, useCallback } from 'react';
import {
  Upload,
  FileCode,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Code,
  Layers,
  ArrowRight,
  RefreshCw,
  Info,
  Settings,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ComparisonResult, ClassResult, DiagramInfo, DiagramClass } from '@/types/comparison';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Visibilidad ─────────────────────────────────────────────────────────────
const visSymbol: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

// ─── Tipos de relación (etiquetas legibles) ──────────────────────────────────
const relLabel: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
};

// ─── Props ───────────────────────────────────────────────────────────────────
interface FileUploadProps {
  label: string;
  description: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  icon: React.ReactNode;
}

interface Weights {
  classes: number;
  attributes: number;
  methods: number;
  relationships: number;
}

// ─── FileUploadZone ──────────────────────────────────────────────────────────
function FileUploadZone({ label, description, file, onFileSelect, icon }: FileUploadProps) {
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
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
        ${isDragOver ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border hover:border-primary/50 hover:bg-muted/30'}
        ${file ? 'bg-primary/5 border-primary' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById(`file-input-${label}`)?.click()}
    >
      <input
        id={`file-input-${label}`}
        type="file"
        accept=".xmi,.xml,.uml"
        className="hidden"
        onChange={handleFileInput}
      />
      <div className="flex flex-col items-center gap-4">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
          ${file ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
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

// ─── SimilarityGauge ─────────────────────────────────────────────────────────
function SimilarityGauge({ value, label, size = 'md' }: { value: number; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const getColor = (v: number) => {
    if (v >= 80) return 'text-green-500';
    if (v >= 60) return 'text-yellow-500';
    if (v >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const sizeClasses = { sm: 'w-20 h-20', md: 'w-28 h-28', lg: 'w-36 h-36' };
  const textSizes = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${sizeClasses[size]} relative rounded-full border-4 border-muted flex items-center justify-center`}>
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="50%" cy="50%" r="42%" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
          <circle
            cx="50%" cy="50%" r="42%" fill="none" stroke="currentColor" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${value * 2.64} 264`}
            className={getColor(value)}
          />
        </svg>
        <span className={`${textSizes[size]} font-bold ${getColor(value)}`}>{Math.round(value)}%</span>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── ClassDetailCard ─────────────────────────────────────────────────────────
function ClassDetailCard({ classResult }: { classResult: ClassResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Code className="w-5 h-5 text-primary" />
          <div>
            <h4 className="font-semibold">{classResult.class_name}</h4>
            <p className="text-sm text-muted-foreground">
              Atributos: {classResult.attributes.correct}/{classResult.attributes.total} |
              Métodos: {classResult.methods.correct}/{classResult.methods.total}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SimilarityGauge value={classResult.similarity} label="" size="sm" />
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          <div className="grid md:grid-cols-2 gap-4 pt-4">
            <div>
              <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Atributos
              </h5>
              {classResult.attributes.missing.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-red-500 font-medium">Faltantes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.attributes.missing.map((attr, i) => (
                      <Badge key={i} variant="destructive" className="text-xs">{attr}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.attributes.extra.length > 0 && (
                <div>
                  <span className="text-xs text-orange-500 font-medium">Extra:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.attributes.extra.map((attr, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-orange-100 text-orange-700">{attr}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.attributes.missing.length === 0 && classResult.attributes.extra.length === 0 && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Todos los atributos correctos
                </p>
              )}
            </div>

            <div>
              <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Code className="w-4 h-4" /> Métodos
              </h5>
              {classResult.methods.missing.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-red-500 font-medium">Faltantes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.methods.missing.map((method, i) => (
                      <Badge key={i} variant="destructive" className="text-xs">{method}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.methods.extra.length > 0 && (
                <div>
                  <span className="text-xs text-orange-500 font-medium">Extra:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.methods.extra.map((method, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-orange-100 text-orange-700">{method}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.methods.missing.length === 0 && classResult.methods.extra.length === 0 && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Todos los métodos correctos
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── WeightsPanel ─────────────────────────────────────────────────────────────
interface WeightsPanelProps {
  weights: Weights;
  onChange: (weights: Weights) => void;
}

function WeightsPanel({ weights, onChange }: WeightsPanelProps) {
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
              <label className={`text-xs font-semibold ${color}`}>{label}</label>
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
                className={`h-full transition-all ${color.replace('text-', 'bg-')}`}
                style={{ width: `${total > 0 ? (weights[key] / total) * 100 : 25}%` }}
              />
            ))}
          </div>
          <span className={`text-xs font-medium ${isValid ? 'text-green-600' : 'text-red-500'}`}>
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

// ─── DiagramReportCard ────────────────────────────────────────────────────────
function DiagramClassRow({ cls }: { cls: DiagramClass }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors bg-muted/20"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-mono font-semibold text-sm">{cls.name}</span>
          {cls.is_abstract && <Badge variant="outline" className="text-xs">abstract</Badge>}
          {cls.is_interface && <Badge variant="outline" className="text-xs border-blue-400 text-blue-600">interface</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{cls.attributes.length} attr.</span>
          <span>{cls.methods.length} mét.</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3 pt-2 grid md:grid-cols-2 gap-4 border-t bg-background">
          {/* Atributos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Atributos</p>
            {cls.attributes.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sin atributos</p>
            ) : (
              <ul className="space-y-1">
                {cls.attributes.map((attr, i) => (
                  <li key={i} className="font-mono text-xs flex items-baseline gap-1">
                    <span className="text-muted-foreground w-3 flex-shrink-0">{visSymbol[attr.visibility] ?? '?'}</span>
                    <span className="font-medium">{attr.name}</span>
                    {attr.type && <span className="text-muted-foreground">: {attr.type}</span>}
                    {attr.is_static && <span className="text-blue-500 text-[10px]">static</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Métodos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Métodos</p>
            {cls.methods.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sin métodos</p>
            ) : (
              <ul className="space-y-1">
                {cls.methods.map((method, i) => {
                  const params = method.parameters
                    .map((p) => `${p.name}${p.type ? ': ' + p.type : ''}`)
                    .join(', ');
                  return (
                    <li key={i} className="font-mono text-xs flex items-baseline gap-1 flex-wrap">
                      <span className="text-muted-foreground w-3 flex-shrink-0">{visSymbol[method.visibility] ?? '?'}</span>
                      <span className="font-medium">{method.name}</span>
                      <span className="text-muted-foreground">({params})</span>
                      {method.return_type && method.return_type !== 'void' && (
                        <span className="text-muted-foreground">: {method.return_type}</span>
                      )}
                      {method.is_abstract && <span className="text-orange-500 text-[10px]">abstract</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiagramReport({ diagram, title }: { diagram: DiagramInfo; title: string }) {
  return (
    <div className="space-y-3">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{diagram.classes.length} clases</Badge>
          <Badge variant="secondary">
            {diagram.classes.reduce((s, c) => s + c.attributes.length, 0)} atributos
          </Badge>
          <Badge variant="secondary">
            {diagram.classes.reduce((s, c) => s + c.methods.length, 0)} métodos
          </Badge>
          <Badge variant="secondary">{diagram.relationships.length} relaciones</Badge>
        </div>
      </div>

      {/* Clases */}
      {diagram.classes.length === 0 ? (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>No se detectaron clases en este diagrama.</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-2">
          {diagram.classes.map((cls, i) => (
            <DiagramClassRow key={i} cls={cls} />
          ))}
        </div>
      )}

      {/* Relaciones */}
      {diagram.relationships.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Relaciones detectadas</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-3 py-2 font-medium border">Origen</th>
                  <th className="text-left px-3 py-2 font-medium border">Destino</th>
                  <th className="text-left px-3 py-2 font-medium border">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium border">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {diagram.relationships.map((rel, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="px-3 py-1.5 border font-mono">{rel.source}</td>
                    <td className="px-3 py-1.5 border font-mono">{rel.target}</td>
                    <td className="px-3 py-1.5 border">
                      <Badge variant="outline" className="text-[10px]">
                        {relLabel[rel.relationship_type] ?? rel.relationship_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 border text-muted-foreground">{rel.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [expectedFile, setExpectedFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
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
    setResult(null);

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

      const response = await fetch(`${API_URL}/api/compare`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al comparar archivos');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setExpectedFile(null);
    setStudentFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">UML Evaluator</h1>
              <p className="text-xs text-muted-foreground">Evaluación automática de diagramas UML</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reiniciar
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!result ? (
          <div className="space-y-6">
            {/* Título */}
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Compara Diagramas UML</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Sube el archivo de la solución correcta y el archivo del estudiante para evaluar automáticamente la
                similitud entre ambos diagramas UML.
              </p>
            </div>

            {/* Upload Zones */}
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

            {/* Panel de ponderaciones */}
            <WeightsPanel weights={weights} onChange={setWeights} />

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Botón comparar */}
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={handleCompare}
                disabled={!expectedFile || !studentFile || loading || !weightsValid}
                className="min-w-[200px]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
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

            {/* Info */}
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
        ) : (
          <div className="space-y-6">
            {/* Overall Score */}
            <Card className="border-2">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Resultado de la Evaluación</CardTitle>
                <CardDescription>
                  Similitud general entre el diagrama de referencia y el del estudiante
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4 pb-8">
                <SimilarityGauge value={result.overall_similarity} label="Similitud Global" size="lg" />

                {/* Ponderaciones usadas */}
                {result.weights_used && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {Object.entries(result.weights_used).map(([key, val]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key === 'classes' ? 'Clases' : key === 'attributes' ? 'Atributos' : key === 'methods' ? 'Métodos' : 'Relaciones'}:
                        {' '}{val}%
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="breakdown" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="breakdown">Desglose</TabsTrigger>
                <TabsTrigger value="classes">Clases</TabsTrigger>
                <TabsTrigger value="details">Detalles</TabsTrigger>
                <TabsTrigger value="report">
                  <FileText className="w-4 h-4 mr-1" />
                  Reporte
                </TabsTrigger>
              </TabsList>

              {/* ── Desglose ── */}
              <TabsContent value="breakdown" className="space-y-4">
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Code className="w-4 h-4" /> Clases
                        {result.weights_used && (
                          <span className="text-xs text-muted-foreground ml-auto">{result.weights_used.classes}%</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold mb-2">{Math.round(result.breakdown.classes.similarity)}%</div>
                      <Progress value={result.breakdown.classes.similarity} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.breakdown.classes.correct} de {result.breakdown.classes.expected} clases correctas
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Layers className="w-4 h-4" /> Atributos
                        {result.weights_used && (
                          <span className="text-xs text-muted-foreground ml-auto">{result.weights_used.attributes}%</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold mb-2">{Math.round(result.breakdown.attributes.similarity)}%</div>
                      <Progress value={result.breakdown.attributes.similarity} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.breakdown.attributes.correct} de {result.breakdown.attributes.expected} atributos correctos
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Code className="w-4 h-4" /> Métodos
                        {result.weights_used && (
                          <span className="text-xs text-muted-foreground ml-auto">{result.weights_used.methods}%</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold mb-2">{Math.round(result.breakdown.methods.similarity)}%</div>
                      <Progress value={result.breakdown.methods.similarity} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.breakdown.methods.correct} de {result.breakdown.methods.expected} métodos correctos
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <ArrowRight className="w-4 h-4" /> Relaciones
                        {result.weights_used && (
                          <span className="text-xs text-muted-foreground ml-auto">{result.weights_used.relationships}%</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold mb-2">{Math.round(result.breakdown.relationships.similarity)}%</div>
                      <Progress value={result.breakdown.relationships.similarity} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.breakdown.relationships.correct} de {result.breakdown.relationships.expected} relaciones correctas
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {result.breakdown.classes.missing.length > 0 && (
                    <Alert variant="destructive">
                      <XCircle className="w-4 h-4" />
                      <AlertDescription>
                        <span className="font-medium">Clases faltantes:</span>{' '}
                        {result.breakdown.classes.missing.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                  {result.breakdown.classes.extra.length > 0 && (
                    <Alert className="border-orange-500 text-orange-700">
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription>
                        <span className="font-medium">Clases extra:</span>{' '}
                        {result.breakdown.classes.extra.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </TabsContent>

              {/* ── Clases ── */}
              <TabsContent value="classes">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {result.class_details.map((classResult, index) => (
                      <ClassDetailCard key={index} classResult={classResult} />
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ── Detalles ── */}
              <TabsContent value="details">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {result.details.map((detail, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 rounded-lg border
                          ${detail.status === 'correct' ? 'bg-green-50 border-green-200' : ''}
                          ${detail.status === 'missing' ? 'bg-red-50 border-red-200' : ''}
                          ${detail.status === 'extra' ? 'bg-orange-50 border-orange-200' : ''}
                          ${detail.status === 'partial' ? 'bg-yellow-50 border-yellow-200' : ''}
                        `}
                      >
                        {detail.status === 'correct' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                        {detail.status === 'missing' && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                        {detail.status === 'extra' && <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />}
                        {detail.status === 'partial' && <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{detail.element_type}</Badge>
                            <span className="font-medium truncate">{detail.name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{detail.message}</p>
                        </div>
                        {detail.similarity_score !== undefined && detail.similarity_score < 100 && (
                          <span className="text-sm font-medium text-yellow-600">{Math.round(detail.similarity_score)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ── Reporte ── */}
              <TabsContent value="report">
                <ScrollArea className="h-[600px]">
                  <div className="space-y-6 pr-2">
                    {/* Descripción */}
                    <Alert>
                      <FileText className="w-4 h-4" />
                      <AlertDescription>
                        Este reporte muestra la estructura completa detectada en cada diagrama. Úsalo para verificar
                        que el parser leyó correctamente ambos archivos.
                      </AlertDescription>
                    </Alert>

                    {/* Dos columnas */}
                    <div className="grid lg:grid-cols-2 gap-6">
                      {result.expected_diagram ? (
                        <Card className="p-4">
                          <DiagramReport
                            diagram={result.expected_diagram}
                            title="Solución del docente"
                          />
                        </Card>
                      ) : (
                        <Card className="p-4">
                          <p className="text-sm text-muted-foreground">Información del diagrama de referencia no disponible.</p>
                        </Card>
                      )}

                      {result.student_diagram ? (
                        <Card className="p-4">
                          <DiagramReport
                            diagram={result.student_diagram}
                            title="Diagrama del estudiante"
                          />
                        </Card>
                      ) : (
                        <Card className="p-4">
                          <p className="text-sm text-muted-foreground">Información del diagrama del estudiante no disponible.</p>
                        </Card>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Botón reiniciar */}
            <div className="flex justify-center gap-4">
              <Button onClick={handleReset} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Nueva Comparación
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t mt-12 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>UML Evaluator — Sistema automático de evaluación de diagramas UML</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
