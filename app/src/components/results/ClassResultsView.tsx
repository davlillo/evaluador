import { ArrowLeft, Code, Layers, ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Breakdown, ComparisonResult } from '@/types/comparison';

interface ClassResultsViewProps {
  result: Omit<ComparisonResult, 'breakdown'> & { breakdown: Breakdown };
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

export function ClassResultsView({ result, onBack, onViewReport }: ClassResultsViewProps) {
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
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {result.class_details.length} clase(s) analizada(s). Usá "Ver Comparación Detallada" abajo para ver el detalle elemento por elemento.
          </p>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Button onClick={onBack} variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Nueva Comparación</Button>
        <Button onClick={onViewReport}><FileText className="w-4 h-4 mr-2" /> Ver Reporte Completo</Button>
      </div>
    </div>
  );
}
