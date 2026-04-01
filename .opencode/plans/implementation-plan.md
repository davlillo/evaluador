# Plan de Implementación - UML Evaluator

## Problemas a Resolver

1. **Encoding roto en UploadPage.tsx** - Caracteres como "M├®todos" en vez de "Métodos"
2. **Falta ResultsPage.tsx** - Solo tiene 26 líneas, incompleto
3. **Falta ReportPage.tsx** - No existe
4. **App.tsx necesita routing** - Actualmente tiene todo inline

---

## Archivos a Crear/Modificar

### 1. UploadPage.tsx - Corregir encoding

**Problema:** Los caracteres UTF-8 se corrompieron (á→├í, é→├®, í→├¡, ó→├│, ú→├║)

**Líneas afectadas:**
- Línea 118: `M├®todos` → `Métodos`
- Línea 119: `Relaciones` (ok)
- Línea 132: `Ponderaci├│n` → `Ponderación`
- Línea 135: `ct├ínto` → `cuánto`
- Línea 248: `soluci├│n` → `solución`, `autom├íticamente` → `automáticamente`
- Línea 255: `Soluci├│n` → `Solución`

**Solución:** Reescribir el archivo con encoding UTF-8 correcto.

---

### 2. ResultsPage.tsx - Crear completo

**Contenido completo:** Ver sección "Contenido de Archivos" abajo.

**Características:**
- SimilarityGauge component (circular gauge)
- ScoreCard component (tarjetas por categoría con faltantes/extras)
- ClassDetailCard component (detalle expandible por clase)
- ResultsPage principal con:
  - Score global grande
  - 4 tarjetas de categoría (Clases, Atributos, Métodos, Relaciones)
  - Detalle por clase (scrollable)
  - Detalle de elementos (scrollable con colores por estado)
  - Botones de navegación

---

### 3. ReportPage.tsx - Crear completo

**Contenido completo:** Ver sección "Contenido de Archivos" abajo.

**Características:**
- DiagramClassRow component (clase expandible con atributos/métodos)
- DiagramReport component (reporte de un diagrama completo)
- Tabla de relaciones con columnas de cardinalidad:
  - Origen | Destino | Tipo | Card. Origen | Card. Destino | Nombre
- Dos columnas: solución docente vs diagrama estudiante

---

### 4. App.tsx - Actualizar con routing

**Contenido completo:** Ver sección "Contenido de Archivos" abajo.

**Características:**
- Estado `currentPage` ('upload' | 'results' | 'report')
- Estado `result` para compartir datos entre páginas
- Header con botón reiniciar (solo en páginas que no son upload)
- Renderizado condicional de páginas

---

## Contenido de Archivos

### ResultsPage.tsx

```tsx
import { useState } from 'react';
import { ArrowLeft, Code, Layers, ArrowRight, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ComparisonResult } from '@/types/comparison';

interface ResultsPageProps {
  result: ComparisonResult;
  onBack: () => void;
  onViewReport: () => void;
}

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
      <div className={sizeClasses[size] + ' relative rounded-full border-4 border-muted flex items-center justify-center'}>
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="50%" cy="50%" r="42%" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
          <circle
            cx="50%" cy="50%" r="42%" fill="none" stroke="currentColor" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={value * 2.64 + ' 264'}
            className={getColor(value)}
          />
        </svg>
        <span className={textSizes[size] + ' font-bold ' + getColor(value)}>{Math.round(value)}%</span>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function ScoreCard({
  title, score, correct, total, missing, extra, icon, weight,
}: {
  title: string; score: number; correct: number; total: number;
  missing?: string[]; extra?: string[]; icon: React.ReactNode; weight?: number;
}) {
  const getColor = (v: number) => {
    if (v >= 80) return 'text-green-500';
    if (v >= 60) return 'text-yellow-500';
    if (v >= 40) return 'text-orange-500';
    return 'text-red-500';
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">{icon} {title}</span>
          {weight !== undefined && (
            <span className="text-xs text-muted-foreground font-normal">{weight}%</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={'text-3xl font-bold mb-2 ' + getColor(score)}>{Math.round(score)}%</div>
        <Progress value={score} className="h-2 mb-2" />
        <p className="text-xs text-muted-foreground">
          {correct} de {total} {title.toLowerCase()} correctos
        </p>
        {missing && missing.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-red-500 font-medium">Faltantes:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {missing.slice(0, 5).map((m, i) => (
                <Badge key={i} variant="destructive" className="text-xs">{m}</Badge>
              ))}
              {missing.length > 5 && (
                <Badge variant="outline" className="text-xs">+{missing.length - 5} más</Badge>
              )}
            </div>
          </div>
        )}
        {extra && extra.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-orange-500 font-medium">Extras:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {extra.slice(0, 5).map((e, i) => (
                <Badge key={i} variant="secondary" className="text-xs bg-orange-100 text-orange-700">{e}</Badge>
              ))}
              {extra.length > 5 && (
                <Badge variant="outline" className="text-xs">+{extra.length - 5} más</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClassDetailCard({ classResult }: { classResult: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpanded(!expanded)}>
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
          <span className="text-lg">{expanded ? '↑' : '↓'}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          <div className="grid md:grid-cols-2 gap-4 pt-4">
            <div>
              <h5 className="text-sm font-medium mb-2 flex items-center gap-2"><Layers className="w-4 h-4" /> Atributos</h5>
              {classResult.attributes.missing.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-red-500 font-medium">Faltantes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.attributes.missing.map((attr: string, i: number) => (
                      <Badge key={i} variant="destructive" className="text-xs">{attr}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.attributes.extra.length > 0 && (
                <div>
                  <span className="text-xs text-orange-500 font-medium">Extra:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.attributes.extra.map((attr: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-orange-100 text-orange-700">{attr}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.attributes.missing.length === 0 && classResult.attributes.extra.length === 0 && (
                <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Todos los atributos correctos</p>
              )}
            </div>
            <div>
              <h5 className="text-sm font-medium mb-2 flex items-center gap-2"><Code className="w-4 h-4" /> Métodos</h5>
              {classResult.methods.missing.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-red-500 font-medium">Faltantes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.methods.missing.map((method: string, i: number) => (
                      <Badge key={i} variant="destructive" className="text-xs">{method}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.methods.extra.length > 0 && (
                <div>
                  <span className="text-xs text-orange-500 font-medium">Extra:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {classResult.methods.extra.map((method: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-orange-100 text-orange-700">{method}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {classResult.methods.missing.length === 0 && classResult.methods.extra.length === 0 && (
                <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Todos los métodos correctos</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ResultsPage({ result, onBack, onViewReport }: ResultsPageProps) {
  const weights = result.weights_used;
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Resultado de la Evaluación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-8">
          <SimilarityGauge value={result.overall_similarity} label="Similitud Global" size="lg" />
          {weights && (
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(weights).map(([key, val]) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {key === 'classes' ? 'Clases' : key === 'attributes' ? 'Atributos' : key === 'methods' ? 'Métodos' : 'Relaciones'}: {val}%
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard title="Clases" score={result.breakdown.classes.similarity} correct={result.breakdown.classes.correct} total={result.breakdown.classes.expected} missing={result.breakdown.classes.missing} extra={result.breakdown.classes.extra} icon={<Code className="w-4 h-4" />} weight={weights?.classes} />
        <ScoreCard title="Atributos" score={result.breakdown.attributes.similarity} correct={result.breakdown.attributes.correct} total={result.breakdown.attributes.expected} icon={<Layers className="w-4 h-4" />} weight={weights?.attributes} />
        <ScoreCard title="Métodos" score={result.breakdown.methods.similarity} correct={result.breakdown.methods.correct} total={result.breakdown.methods.expected} icon={<Code className="w-4 h-4" />} weight={weights?.methods} />
        <ScoreCard title="Relaciones" score={result.breakdown.relationships.similarity} correct={result.breakdown.relationships.correct} total={result.breakdown.relationships.expected} missing={result.breakdown.relationships.missing} extra={result.breakdown.relationships.extra} icon={<ArrowRight className="w-4 h-4" />} weight={weights?.relationships} />
      </div>

      {result.class_details && result.class_details.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Detalle por Clase</h3>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {result.class_details.map((classResult: any, index: number) => (
                <ClassDetailCard key={index} classResult={classResult} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {result.details && result.details.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Detalle de Elementos</h3>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {result.details.map((detail: any, index: number) => (
                <div key={index} className={'flex items-center gap-3 p-3 rounded-lg border ' + (detail.status === 'correct' ? 'bg-green-50 border-green-200 ' : '') + (detail.status === 'missing' ? 'bg-red-50 border-red-200 ' : '') + (detail.status === 'extra' ? 'bg-orange-50 border-orange-200 ' : '') + (detail.status === 'partial' ? 'bg-yellow-50 border-yellow-200 ' : '')}>
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
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Button onClick={onBack} variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Nueva Comparación</Button>
        <Button onClick={onViewReport}><FileText className="w-4 h-4 mr-2" /> Ver Reporte Completo</Button>
      </div>
    </div>
  );
}
```

### ReportPage.tsx

```tsx
import { useState } from 'react';
import { ArrowLeft, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DiagramInfo, DiagramClass } from '@/types/comparison';

const visSymbol: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

const relLabel: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
};

interface ReportPageProps {
  result: any;
  onBack: () => void;
}

function DiagramClassRow({ cls }: { cls: DiagramClass }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors bg-muted/20" onClick={() => setOpen(!open)}>
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
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Métodos</p>
            {cls.methods.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sin métodos</p>
            ) : (
              <ul className="space-y-1">
                {cls.methods.map((method, i) => {
                  const params = method.parameters.map((p) => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ');
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
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{diagram.classes.length} clases</Badge>
          <Badge variant="secondary">{diagram.classes.reduce((s, c) => s + c.attributes.length, 0)} atributos</Badge>
          <Badge variant="secondary">{diagram.classes.reduce((s, c) => s + c.methods.length, 0)} métodos</Badge>
          <Badge variant="secondary">{diagram.relationships.length} relaciones</Badge>
        </div>
      </div>
      {diagram.classes.length === 0 ? (
        <Alert><AlertDescription>No se detectaron clases en este diagrama.</AlertDescription></Alert>
      ) : (
        <div className="space-y-2">
          {diagram.classes.map((cls, i) => (<DiagramClassRow key={i} cls={cls} />))}
        </div>
      )}
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
                  <th className="text-left px-3 py-2 font-medium border">Card. Origen</th>
                  <th className="text-left px-3 py-2 font-medium border">Card. Destino</th>
                  <th className="text-left px-3 py-2 font-medium border">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {diagram.relationships.map((rel, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="px-3 py-1.5 border font-mono">{rel.source}</td>
                    <td className="px-3 py-1.5 border font-mono">{rel.target}</td>
                    <td className="px-3 py-1.5 border">
                      <Badge variant="outline" className="text-[10px]">{relLabel[rel.relationship_type] ?? rel.relationship_type}</Badge>
                    </td>
                    <td className="px-3 py-1.5 border font-mono text-center">{(rel as any).source_multiplicity || '-'}</td>
                    <td className="px-3 py-1.5 border font-mono text-center">{(rel as any).target_multiplicity || '-'}</td>
                    <td className="px-3 py-1.5 border text-muted-foreground">{rel.name ?? '-'}</td>
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

export default function ReportPage({ result, onBack }: ReportPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Reporte Completo</h2>
        <Button onClick={onBack} variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Volver a Resultados</Button>
      </div>
      <Alert>
        <AlertDescription>Este reporte muestra la estructura completa detectada en cada diagrama. Úsalo para verificar que el parser leyó correctamente ambos archivos.</AlertDescription>
      </Alert>
      <div className="grid lg:grid-cols-2 gap-6">
        {result.expected_diagram ? (
          <Card className="p-4"><DiagramReport diagram={result.expected_diagram} title="Solución del docente" /></Card>
        ) : (
          <Card className="p-4"><p className="text-sm text-muted-foreground">Información del diagrama de referencia no disponible.</p></Card>
        )}
        {result.student_diagram ? (
          <Card className="p-4"><DiagramReport diagram={result.student_diagram} title="Diagrama del estudiante" /></Card>
        ) : (
          <Card className="p-4"><p className="text-sm text-muted-foreground">Información del diagrama del estudiante no disponible.</p></Card>
        )}
      </div>
    </div>
  );
}
```

### App.tsx

```tsx
import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UploadPage from '@/pages/UploadPage';
import ResultsPage from '@/pages/ResultsPage';
import ReportPage from '@/pages/ReportPage';
import './App.css';

type Page = 'upload' | 'results' | 'report';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('upload');
  const [result, setResult] = useState<any>(null);

  const handleReset = () => {
    setResult(null);
    setCurrentPage('upload');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
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
          {currentPage !== 'upload' && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reiniciar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {currentPage === 'upload' && (
          <UploadPage onResult={setResult} onNavigate={(page) => setCurrentPage(page as Page)} />
        )}
        {currentPage === 'results' && result && (
          <ResultsPage
            result={result}
            onBack={handleReset}
            onViewReport={() => setCurrentPage('report')}
          />
        )}
        {currentPage === 'report' && result && (
          <ReportPage result={result} onBack={() => setCurrentPage('results')} />
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
```

---

## Pasos de Implementación

1. **Corregir UploadPage.tsx** - Reescribir con encoding UTF-8 correcto (reemplazar ├® por é, ├¡ por í, ├³ por ó, ├º por ç)
2. **Crear ResultsPage.tsx** - Copiar contenido de arriba
3. **Crear ReportPage.tsx** - Copiar contenido de arriba
4. **Actualizar App.tsx** - Reemplazar con el nuevo código de routing
5. **Verificar build** - `cd app && npm run build`
