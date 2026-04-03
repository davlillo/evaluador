import type { ReactNode } from 'react';
import { ArrowLeft, FileText, User, CircleDot, Link2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ComparisonResult, UseCaseBreakdown } from '@/types/comparison';

interface UseCaseResultsViewProps {
  result: Omit<ComparisonResult, 'breakdown'> & { breakdown: UseCaseBreakdown };
  onBack: () => void;
  onViewReport: () => void;
}

function Gauge({ value, label }: { value: number; label: string }) {
  const getColor = (v: number) => {
    if (v >= 80) return 'text-green-500';
    if (v >= 60) return 'text-yellow-500';
    if (v >= 40) return 'text-orange-500';
    return 'text-red-500';
  };
  return (
    <div className="flex flex-col gap-2">
      <div className={'text-3xl font-bold ' + getColor(value)}>{Math.round(value)}%</div>
      <Progress value={Math.min(100, Math.max(0, value))} className="h-2" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SliceCard({
  title,
  icon,
  slice,
}: {
  title: string;
  icon: ReactNode;
  slice: {
    similarity: number;
    expected: number;
    found: number;
    correct: number;
    missing?: string[];
    extra?: string[];
  };
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Gauge value={slice.similarity} label="Similitud en este criterio" />
        <p className="text-xs text-muted-foreground">
          Coinciden {slice.correct} de {slice.expected} esperados (encontrados en el estudiante: {slice.found})
        </p>
        {slice.missing && slice.missing.length > 0 && (
          <div>
            <span className="text-xs text-red-600 font-medium">Faltantes</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {slice.missing.map((m, i) => (
                <Badge key={i} variant="destructive" className="text-xs">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {slice.extra && slice.extra.length > 0 && (
          <div>
            <span className="text-xs text-orange-600 font-medium">Extra en el estudiante</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {slice.extra.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function UseCaseResultsView({ result, onBack, onViewReport }: UseCaseResultsViewProps) {
  const b = result.breakdown;
  const w = result.weights_used;

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Resultado — diagrama de casos de uso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 pb-6">
          <div className="text-5xl font-bold text-primary tabular-nums">
            {result.overall_similarity.toFixed(1)}%
          </div>
          <p className="text-sm text-muted-foreground">Similitud global (ponderada)</p>
          <p className="text-xs text-center text-muted-foreground max-w-lg mt-2">
            La nota global combina los tres criterios de abajo con la ponderación que configuraste. Un valor menor
            al 100% suele deberse a casos de uso o relaciones de más o de menos respecto al modelo de referencia.
          </p>
        </CardContent>
      </Card>

      {b.actors.expected === 0 && b.actors.found > 0 && (
        <Alert>
          <AlertDescription className="text-sm">
            En el archivo de <strong>solución</strong> no se detectó ningún actor, pero en el del estudiante sí
            hay {b.actors.found}. Eso cuenta como discrepancia en actores y baja la nota. Si el docente sí
            modeló actores, revisa que el XMI los exporte como tales (o como clases con nombre de rol); el
            modelo de referencia debe incluir los mismos actores para una comparación justa.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <SliceCard title="Actores" icon={<User className="w-4 h-4 text-blue-600" />} slice={b.actors} />
        <SliceCard
          title="Casos de uso"
          icon={<CircleDot className="w-4 h-4 text-emerald-600" />}
          slice={b.use_cases}
        />
        <SliceCard
          title="Relaciones"
          icon={<Link2 className="w-4 h-4 text-orange-600" />}
          slice={b.relationships}
        />
      </div>

      {w && (
        <Card className="bg-muted/40 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Ponderación aplicada (rúbrica)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              Estos porcentajes son el peso de cada criterio en la nota global, no la similitud alcanzada.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Actores: {w.classes}%</Badge>
              <Badge variant="outline">Casos de uso: {w.attributes}%</Badge>
              <Badge variant="outline">Métodos: {w.methods}%</Badge>
              <Badge variant="outline">Relaciones: {w.relationships}%</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {result.details && result.details.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Detalle de elementos</h3>
          <ScrollArea className="h-[320px]">
            <div className="space-y-2 pr-2">
              {result.details.map((detail, index) => (
                <div
                  key={index}
                  className={
                    'flex items-start gap-3 p-3 rounded-lg border text-sm ' +
                    (detail.status === 'correct'
                      ? 'bg-green-50 border-green-200'
                      : '') +
                    (detail.status === 'missing' ? 'bg-red-50 border-red-200' : '') +
                    (detail.status === 'extra' ? 'bg-orange-50 border-orange-200' : '')
                  }
                >
                  <div className="flex-1 min-w-0">
                    <Badge variant="outline" className="text-[10px] capitalize mb-1">
                      {detail.element_type}
                    </Badge>
                    <p className="font-medium break-words">{detail.name}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{detail.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Nueva comparación
        </Button>
        <Button onClick={onViewReport}>
          <FileText className="w-4 h-4 mr-2" /> Ver reporte detallado
        </Button>
      </div>
    </div>
  );
}
