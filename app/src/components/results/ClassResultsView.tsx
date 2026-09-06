import { ArrowLeft, Code, Layers, ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { percentTextClass } from '@/lib/status-colors';
import { PenaltyNote } from '@/components/results/PenaltyNote';
import { CriterionWeightBadge } from '@/components/results/CriterionWeightBadge';
import type { Breakdown, ComparisonResult, PenaltyDetail } from '@/types/comparison';

interface ClassResultsViewProps {
  result: Omit<ComparisonResult, 'breakdown'> & { breakdown: Breakdown };
  onBack: () => void;
  onViewReport: () => void;
  showNavActions?: boolean;
}

function SimilarityGauge({ value, label, size = 'md' }: { value: number; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const getColor = percentTextClass;
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
  title, score, correct, total, missing, extra, icon, weight, penalty,
}: {
  title: string; score: number; correct: number; total: number;
  missing?: string[]; extra?: string[]; icon: React.ReactNode; weight?: number;
  penalty?: PenaltyDetail;
}) {
  const getColor = percentTextClass;
  const displayedScore = penalty?.score ?? score;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">{icon} {title}</span>
          <CriterionWeightBadge weight={weight} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={'text-3xl font-bold mb-2 ' + getColor(displayedScore)}>{Math.round(displayedScore)}%</div>
        <Progress value={displayedScore} className="h-2 mb-2" />
        {penalty && Math.abs(displayedScore - score) >= 0.05 && (
          <p className="text-xs text-muted-foreground mb-1">
            Similitud estructural: {Math.round(score)}%
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {correct} de {total} {title.toLowerCase()} correctos
        </p>
        {missing && missing.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-mismatch font-medium">Faltantes:</span>
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
            <span className="text-xs text-extra font-medium">Extras:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {extra.slice(0, 5).map((e, i) => (
                <Badge key={i} variant="secondary" className="text-xs bg-extra/15 text-extra">{e}</Badge>
              ))}
              {extra.length > 5 && (
                <Badge variant="outline" className="text-xs">+{extra.length - 5} más</Badge>
              )}
            </div>
          </div>
        )}
        <PenaltyNote detail={penalty} />
      </CardContent>
    </Card>
  );
}

export function ClassResultsView({ result, onBack, onViewReport, showNavActions = true }: ClassResultsViewProps) {
  const weights = result.weights_used;
  const rubricRows = result.class_rubric_breakdown ?? [];
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Resultado de la Evaluación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-8">
          <SimilarityGauge value={result.overall_similarity} label="Similitud Global" size="lg" />
          {weights && rubricRows.length === 0 && (
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

      {rubricRows.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rubricRows.map((row) => (
            <Card key={row.rule_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span>{row.label}</span>
                  <CriterionWeightBadge weight={row.weight} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {row.source && row.target && (
                  <p className="text-xs font-medium">
                    {row.relationship_type === 'aggregation'
                      ? 'Agregación'
                      : row.relationship_type === 'composition'
                        ? 'Composición'
                        : row.criterion_type === 'association_class'
                          ? 'Clase de asociación'
                          : 'Asociación'}: {row.source} – {row.target}
                    {row.modeled_relationship_type
                      && row.modeled_relationship_type !== row.relationship_type
                      ? ` · detectada como ${row.modeled_relationship_type === 'aggregation'
                        ? 'agregación'
                        : row.modeled_relationship_type === 'composition'
                          ? 'composición'
                          : 'asociación'}`
                      : ''}
                    {row.multiplicity_end
                      ? ` · ${row.multiplicity_end === 'source' ? 'origen' : 'destino'}`
                      : ''}
                  </p>
                )}
                <div className={'text-3xl font-bold ' + percentTextClass(row.score)}>
                  {Math.round(row.score)}%
                </div>
                <Progress value={row.score} className="h-2" />
                <p className="text-xs text-muted-foreground">{row.message}</p>
                <p className="text-xs font-medium">Aporte: {row.contribution.toFixed(1)}%</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ScoreCard title="Clases" score={result.breakdown.classes.similarity} correct={result.breakdown.classes.correct} total={result.breakdown.classes.expected} missing={result.breakdown.classes.missing} extra={result.breakdown.classes.extra} icon={<Code className="w-4 h-4" />} weight={weights?.classes} penalty={result.penalty_breakdown?.classes} />
          <ScoreCard title="Atributos" score={result.breakdown.attributes.similarity} correct={result.breakdown.attributes.correct} total={result.breakdown.attributes.expected} icon={<Layers className="w-4 h-4" />} weight={weights?.attributes} penalty={result.penalty_breakdown?.attributes} />
          <ScoreCard title="Métodos" score={result.breakdown.methods.similarity} correct={result.breakdown.methods.correct} total={result.breakdown.methods.expected} icon={<Code className="w-4 h-4" />} weight={weights?.methods} penalty={result.penalty_breakdown?.methods} />
          <ScoreCard title="Relaciones" score={result.breakdown.relationships.similarity} correct={result.breakdown.relationships.correct} total={result.breakdown.relationships.expected} missing={result.breakdown.relationships.missing} extra={result.breakdown.relationships.extra} icon={<ArrowRight className="w-4 h-4" />} weight={weights?.relationships} penalty={result.penalty_breakdown?.relationships} />
        </div>
      )}
      {weights && rubricRows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center">
          El porcentaje grande es el puntaje usado por el modo seleccionado. Solo los criterios con peso mayor que 0 aportan a la nota global.
        </p>
      )}

      {result.class_details && result.class_details.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {result.class_details.length} clase(s) analizada(s). Usá "Ver Comparación Detallada" abajo para ver el detalle elemento por elemento.
          </p>
        </div>
      )}

      <div className="flex justify-center gap-4">
        {showNavActions && (
          <Button onClick={onBack} variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Nueva Comparación</Button>
        )}
        <Button onClick={onViewReport}><FileText className="w-4 h-4 mr-2" /> Ver Reporte Completo</Button>
      </div>
    </div>
  );
}
