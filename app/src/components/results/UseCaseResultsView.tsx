import type { ReactNode } from 'react';
import { ArrowLeft, FileText, User, CircleDot, Link2, GitBranch, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { percentTextClass } from '@/lib/status-colors';
import type { ComparisonResult, UseCaseBreakdown, UseCaseSliceBreakdown } from '@/types/comparison';

interface UseCaseResultsViewProps {
  result: Omit<ComparisonResult, 'breakdown'> & { breakdown: UseCaseBreakdown };
  onBack: () => void;
  onViewReport: () => void;
  showNavActions?: boolean;
}

function normalizeUseCaseBreakdown(b: UseCaseBreakdown): Required<
  Pick<
    UseCaseBreakdown,
    'actors' | 'use_cases' | 'actor_associations' | 'include_relations' | 'extend_relations'
  >
> {
  if (b.actor_associations) {
    return {
      actors: b.actors,
      use_cases: b.use_cases,
      actor_associations: b.actor_associations,
      include_relations: b.include_relations,
      extend_relations: b.extend_relations,
    };
  }
  const legacy = b.relationships;
  const empty: UseCaseSliceBreakdown = {
    similarity: 0,
    expected: 0,
    found: 0,
    correct: 0,
    missing: [],
    extra: [],
  };
  return {
    actors: b.actors,
    use_cases: b.use_cases,
    actor_associations: legacy ?? empty,
    include_relations: empty,
    extend_relations: empty,
  };
}

function Gauge({ value, label }: { value: number; label: string }) {
  const getColor = percentTextClass;
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
  slice: UseCaseSliceBreakdown;
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
          Coinciden {slice.correct} de {slice.expected} esperados (encontrados en el estudiante:{' '}
          {slice.found})
        </p>
        {slice.missing && slice.missing.length > 0 && (
          <div>
            <span className="text-xs text-mismatch font-medium">Faltantes</span>
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
            <span className="text-xs text-extra font-medium">Extra en el estudiante</span>
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

const USECASE_WEIGHT_LABELS: Record<string, string> = {
  classes: 'Actores',
  attributes: 'Casos de uso',
  methods: 'Relaciones actor–CU',
  include_relations: 'Relaciones include',
  extend_relations: 'Relaciones extend',
};

export function UseCaseResultsView({ result, onBack, onViewReport, showNavActions = true }: UseCaseResultsViewProps) {
  const b = normalizeUseCaseBreakdown(result.breakdown);
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
            La nota global combina los cinco criterios de abajo con la ponderación que configuraste.
          </p>
        </CardContent>
      </Card>

      {b.actors.expected === 0 && b.actors.found > 0 && (
        <Alert>
          <AlertDescription className="text-sm">
            En el archivo de <strong>solución</strong> no se detectó ningún actor, pero en el del estudiante sí
            hay {b.actors.found}. Eso cuenta como discrepancia en actores y baja la nota.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <SliceCard title="Actores" icon={<User className="w-4 h-4 text-primary" />} slice={b.actors} />
        <SliceCard
          title="Casos de uso"
          icon={<CircleDot className="w-4 h-4 text-primary" />}
          slice={b.use_cases}
        />
        <SliceCard
          title="Relaciones actor–CU"
          icon={<Link2 className="w-4 h-4 text-primary" />}
          slice={b.actor_associations}
        />
        <SliceCard
          title="Relaciones include"
          icon={<GitBranch className="w-4 h-4 text-primary" />}
          slice={b.include_relations}
        />
        <SliceCard
          title="Relaciones extend"
          icon={<GitBranch className="w-4 h-4 text-primary" />}
          slice={b.extend_relations}
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
              {Object.entries(w)
                .filter(([key, val]) => val > 0 && key in USECASE_WEIGHT_LABELS)
                .map(([key, val]) => (
                  <Badge key={key} variant="outline">
                    {USECASE_WEIGHT_LABELS[key]}: {val}%
                  </Badge>
                ))}
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
    </div>
  );
}
