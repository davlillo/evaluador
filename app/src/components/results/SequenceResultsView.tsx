import { ArrowLeft, FileText, ListOrdered, MessageSquareText, Scale, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ComparisonResult, SequenceBreakdown } from '@/types/comparison';

interface SequenceResultsViewProps {
  result: Omit<ComparisonResult, 'breakdown'> & { breakdown: SequenceBreakdown };
  onBack: () => void;
  onViewReport: () => void;
}

function percentColor(v: number): string {
  if (v >= 80) return 'text-green-600';
  if (v >= 60) return 'text-yellow-600';
  if (v >= 40) return 'text-orange-600';
  return 'text-red-600';
}

function Slice({
  title,
  value,
  expected,
  found,
  correct,
  missing,
  extra,
}: {
  title: string;
  value: number;
  expected: number;
  found: number;
  correct: number;
  missing?: string[];
  extra?: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={'text-2xl font-bold ' + percentColor(value)}>{Math.round(value)}%</div>
        <Progress value={Math.max(0, Math.min(100, value))} className="h-2" />
        <p className="text-xs text-muted-foreground">
          Coinciden {correct} de {expected} esperados (encontrados: {found})
        </p>
        {missing && missing.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {missing.map((item, index) => (
              <Badge key={index} variant="destructive" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        )}
        {extra && extra.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {extra.map((item, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SequenceResultsView({ result, onBack, onViewReport }: SequenceResultsViewProps) {
  const b = result.breakdown;
  const w = result.weights_used;

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="text-center pb-3">
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <Workflow className="w-6 h-6" />
            Resultado — diagrama de secuencia
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-2">
          <div className={'text-5xl font-bold tabular-nums ' + percentColor(result.overall_similarity)}>
            {result.overall_similarity.toFixed(1)}%
          </div>
          <p className="text-sm text-muted-foreground">Similitud global (líneas de vida + mensajes)</p>
          <Badge variant="outline" className="text-xs">
            Orden de mensajes: {b.messages.order_score.toFixed(1)}%
          </Badge>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Slice
          title="Líneas de vida"
          value={b.lifelines.similarity}
          expected={b.lifelines.expected}
          found={b.lifelines.found}
          correct={b.lifelines.correct}
          missing={b.lifelines.missing}
          extra={b.lifelines.extra}
        />
        <Slice
          title="Mensajes"
          value={b.messages.similarity}
          expected={b.messages.expected}
          found={b.messages.found}
          correct={b.messages.correct}
          missing={b.messages.missing}
          extra={b.messages.extra}
        />
      </div>

      {w && (
        <Card className="bg-muted/40 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Ponderación aplicada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Líneas de vida: {w.classes}%</Badge>
              <Badge variant="outline">Mensajes: {w.relationships}%</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {result.details.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MessageSquareText className="w-4 h-4" />
            Detalle de comparación
          </h3>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-2">
              {result.details.map((detail, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border text-sm bg-background flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">{detail.name}</p>
                    <p className="text-xs text-muted-foreground">{detail.message}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {detail.element_type}
                  </Badge>
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
      <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
        <ListOrdered className="w-3.5 h-3.5" />
        El orden se calcula sobre mensajes coincidentes por nombre y extremo origen→destino.
      </p>
    </div>
  );
}
