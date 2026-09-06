import { ArrowLeft, FileText, ListOrdered, Scale, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { percentTextClass } from '@/lib/status-colors';
import { PenaltyNote } from '@/components/results/PenaltyNote';
import { CriterionWeightBadge } from '@/components/results/CriterionWeightBadge';
import type { ComparisonResult, PenaltyDetail, SequenceBreakdown } from '@/types/comparison';

interface SequenceResultsViewProps {
  result: Omit<ComparisonResult, 'breakdown'> & { breakdown: SequenceBreakdown };
  onBack: () => void;
  onViewReport: () => void;
  showNavActions?: boolean;
}

const percentColor = percentTextClass;

function Slice({
  title,
  value,
  expected,
  found,
  correct,
  missing,
  extra,
  weight,
  penalty,
}: {
  title: string;
  value: number;
  expected: number;
  found: number;
  correct: number;
  missing?: string[];
  extra?: string[];
  weight?: number;
  penalty?: PenaltyDetail;
}) {
  const displayedScore = penalty?.score ?? value;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>{title}</span>
          <CriterionWeightBadge weight={weight} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={'text-2xl font-bold ' + percentColor(displayedScore)}>{Math.round(displayedScore)}%</div>
        <Progress value={Math.max(0, Math.min(100, displayedScore))} className="h-2" />
        {penalty && Math.abs(displayedScore - value) >= 0.05 && (
          <p className="text-xs text-muted-foreground">
            Similitud estructural: {Math.round(value)}%
          </p>
        )}
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
        <PenaltyNote detail={penalty} />
      </CardContent>
    </Card>
  );
}

export function SequenceResultsView({ result, onBack, onViewReport, showNavActions = true }: SequenceResultsViewProps) {
  const b = result.breakdown;
  const w = result.weights_used;
  const hasV2 =
    !!b.sync_messages ||
    !!b.async_messages ||
    !!b.creation_messages ||
    !!b.fragment_usage;
  const orderScore = b.order_score ?? b.messages?.order_score ?? 0;

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
          <p className="text-sm text-muted-foreground">
            {hasV2 ? 'Similitud global (criterios de secuencia)' : 'Similitud global (líneas de vida + mensajes)'}
          </p>
          <Badge variant="outline" className="text-xs">
            Orden de mensajes: {orderScore.toFixed(1)}%
          </Badge>
        </CardContent>
      </Card>

      {hasV2 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {b.sync_messages && (
            <Slice
              title="Mensajes síncronos"
              value={b.sync_messages.similarity}
              expected={b.sync_messages.expected}
              found={b.sync_messages.found}
              correct={b.sync_messages.correct}
              missing={b.sync_messages.missing}
              extra={b.sync_messages.extra}
              weight={w?.sync_messages}
              penalty={result.penalty_breakdown?.sync_messages}
            />
          )}
          {b.async_messages && (
            <Slice
              title="Mensajes asíncronos"
              value={b.async_messages.similarity}
              expected={b.async_messages.expected}
              found={b.async_messages.found}
              correct={b.async_messages.correct}
              missing={b.async_messages.missing}
              extra={b.async_messages.extra}
              weight={w?.async_messages}
              penalty={result.penalty_breakdown?.async_messages}
            />
          )}
          {b.creation_messages && (
            <Slice
              title="Mensajes de creación"
              value={b.creation_messages.similarity}
              expected={b.creation_messages.expected}
              found={b.creation_messages.found}
              correct={b.creation_messages.correct}
              missing={b.creation_messages.missing}
              extra={b.creation_messages.extra}
              weight={w?.creation_messages}
              penalty={result.penalty_breakdown?.creation_messages}
            />
          )}
          {b.fragment_usage && (
            <Slice
              title="Uso de fragmentos (loop/alt/opt)"
              value={b.fragment_usage.similarity}
              expected={b.fragment_usage.expected}
              found={b.fragment_usage.found}
              correct={b.fragment_usage.correct}
              missing={b.fragment_usage.missing}
              extra={b.fragment_usage.extra}
              weight={w?.fragment_usage}
              penalty={result.penalty_breakdown?.fragment_usage}
            />
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {b.lifelines && (
            <Slice
              title="Líneas de vida"
              value={b.lifelines.similarity}
              expected={b.lifelines.expected}
              found={b.lifelines.found}
              correct={b.lifelines.correct}
              missing={b.lifelines.missing}
              extra={b.lifelines.extra}
              weight={w?.classes}
              penalty={result.penalty_breakdown?.lifelines}
            />
          )}
          {b.messages && (
            <Slice
              title="Mensajes"
              value={b.messages.similarity}
              expected={b.messages.expected}
              found={b.messages.found}
              correct={b.messages.correct}
              missing={b.messages.missing}
              extra={b.messages.extra}
              weight={w?.relationships}
            />
          )}
        </div>
      )}

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
              {'sync_messages' in w && <Badge variant="outline">Síncronos: {(w as unknown as Record<string, number>).sync_messages}%</Badge>}
              {'async_messages' in w && <Badge variant="outline">Asíncronos: {(w as unknown as Record<string, number>).async_messages}%</Badge>}
              {'creation_messages' in w && <Badge variant="outline">Creación: {(w as unknown as Record<string, number>).creation_messages}%</Badge>}
              {'fragment_usage' in w && <Badge variant="outline">Fragmentos: {(w as unknown as Record<string, number>).fragment_usage}%</Badge>}
              {!('sync_messages' in w) && <Badge variant="outline">Líneas de vida: {w.classes}%</Badge>}
              {!('sync_messages' in w) && <Badge variant="outline">Mensajes: {w.relationships}%</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-4">
        {showNavActions && (
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Nueva comparación
          </Button>
        )}
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
