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
