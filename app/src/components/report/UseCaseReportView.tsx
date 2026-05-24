import { ArrowLeft, User, CircleDot, Link2, GitBranch, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportPdfButton } from '@/components/report/ExportPdfButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import type {
  ComparisonDetail,
  DiagramInfo,
  UseCaseBreakdown,
  UseCaseSliceBreakdown,
} from '@/types/comparison';

const relLabel: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
  include: 'Include',
  extend: 'Extend',
};

interface UseCaseReportViewProps {
  result: {
    expected_diagram?: DiagramInfo;
    student_diagram?: DiagramInfo;
    breakdown?: UseCaseBreakdown | unknown;
    details?: ComparisonDetail[];
    overall_similarity?: number;
  };
  onBack: () => void;
}

function normalizeBreakdown(b?: UseCaseBreakdown) {
  const empty: UseCaseSliceBreakdown = {
    similarity: 0,
    expected: 0,
    found: 0,
    correct: 0,
    missing: [],
    extra: [],
  };
  if (!b) return null;
  if (b.actor_associations) {
    return {
      actors: b.actors,
      use_cases: b.use_cases,
      actor_associations: b.actor_associations,
      include_relations: b.include_relations,
      extend_relations: b.extend_relations,
    };
  }
  return {
    actors: b.actors,
    use_cases: b.use_cases,
    actor_associations: b.relationships ?? empty,
    include_relations: empty,
    extend_relations: empty,
  };
}

function CriterionReport({
  title,
  icon,
  slice,
}: {
  title: string;
  icon: React.ReactNode;
  slice: UseCaseSliceBreakdown;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          <Badge variant={slice.similarity >= 80 ? 'default' : 'secondary'}>
            {Math.round(slice.similarity)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={Math.min(100, Math.max(0, slice.similarity))} className="h-1.5" />
        <p className="text-xs text-muted-foreground">
          {slice.correct} de {slice.expected} esperados coinciden (encontrados: {slice.found})
        </p>
        {slice.missing && slice.missing.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-600 mb-1 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Faltantes
            </p>
            <ul className="space-y-1">
              {slice.missing.map((item, i) => (
                <li key={i} className="text-xs font-mono bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {slice.extra && slice.extra.length > 0 && (
          <div>
            <p className="text-xs font-medium text-orange-600 mb-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Extra en el estudiante
            </p>
            <ul className="space-y-1">
              {slice.extra.map((item, i) => (
                <li key={i} className="text-xs font-mono bg-orange-50 dark:bg-orange-950/30 px-2 py-1 rounded">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {slice.expected > 0 && slice.correct === slice.expected && (!slice.extra || slice.extra.length === 0) && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Criterio completo
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SemanticMatches({ details }: { details: ComparisonDetail[] }) {
  const semantic = details.filter((d) => d.semantic_match_of);
  if (semantic.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Coincidencias semánticas detectadas</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Nombres que no coinciden literalmente pero se aceptaron por similitud semántica (FastText).
        </p>
        <ul className="space-y-2">
          {semantic.map((d, i) => (
            <li key={i} className="text-xs border rounded-md px-3 py-2 bg-muted/30">
              <span className="font-medium">{d.name}</span>
              <span className="text-muted-foreground"> ≈ </span>
              <span className="font-mono">{d.semantic_match_of}</span>
              {d.similarity_score != null && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {Math.round(d.similarity_score)}%
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function UseCaseDiagramPanel({ diagram, title }: { diagram: DiagramInfo; title: string }) {
  const actors = diagram.actors ?? [];
  const useCases = diagram.use_cases ?? [];

  const actorAssoc = diagram.relationships.filter((r) => r.relationship_type === 'association');
  const includeRels = diagram.relationships.filter((r) => r.relationship_type === 'include');
  const extendRels = diagram.relationships.filter((r) => r.relationship_type === 'extend');

  function RelTable({ rows, label }: { rows: typeof diagram.relationships; label: string }) {
    if (rows.length === 0) return null;
    return (
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-3 py-2 font-medium border-b">Origen</th>
                <th className="text-left px-3 py-2 font-medium border-b">Destino</th>
                <th className="text-left px-3 py-2 font-medium border-b">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rel, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="px-3 py-1.5 border-b font-mono">{rel.source}</td>
                  <td className="px-3 py-1.5 border-b font-mono">{rel.target}</td>
                  <td className="px-3 py-1.5 border-b">
                    <Badge variant="outline" className="text-[10px]">
                      {relLabel[rel.relationship_type] ?? rel.relationship_type}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-normal">
            {diagram.name || 'Sin nombre'}
          </Badge>
          <Badge variant="secondary">{actors.length} actores</Badge>
          <Badge variant="secondary">{useCases.length} casos de uso</Badge>
          <Badge variant="secondary">{diagram.relationships.length} relaciones</Badge>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <User className="w-3.5 h-3.5" /> Actores
        </p>
        {actors.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">No se detectaron actores.</AlertDescription>
          </Alert>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {actors.map((a, i) => (
              <li key={i}>
                <Badge variant="secondary" className="font-mono text-xs font-normal">
                  {a.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <CircleDot className="w-3.5 h-3.5" /> Casos de uso
        </p>
        {useCases.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">No se detectaron casos de uso.</AlertDescription>
          </Alert>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {useCases.map((uc, i) => (
              <li key={i}>
                <Badge className="font-mono text-xs font-normal bg-primary/15 text-foreground hover:bg-primary/20">
                  {uc.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {diagram.relationships.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5" /> Relaciones
          </p>
          <RelTable rows={actorAssoc} label="Asociaciones actor – caso de uso" />
          <RelTable rows={includeRels} label="Relaciones include entre CU" />
          <RelTable rows={extendRels} label="Relaciones extend entre CU" />
        </div>
      )}
    </div>
  );
}

export function UseCaseReportView({ result, onBack }: UseCaseReportViewProps) {
  const breakdown = normalizeBreakdown(
    result.breakdown && typeof result.breakdown === 'object' && 'actors' in result.breakdown
      ? (result.breakdown as UseCaseBreakdown)
      : undefined,
  );
  const details = result.details ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-bold">Reporte detallado — casos de uso</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportPdfButton />
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Resultados
          </Button>
        </div>
      </div>

      {result.overall_similarity != null && (
        <Card className="border-2">
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground">Similitud global</p>
            <p className="text-4xl font-bold text-primary tabular-nums">
              {result.overall_similarity.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      )}

      {breakdown && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Evaluación por criterio</h3>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <CriterionReport
              title="Actores"
              icon={<User className="w-4 h-4 text-blue-600" />}
              slice={breakdown.actors}
            />
            <CriterionReport
              title="Casos de uso"
              icon={<CircleDot className="w-4 h-4 text-emerald-600" />}
              slice={breakdown.use_cases}
            />
            <CriterionReport
              title="Relaciones actor–CU"
              icon={<Link2 className="w-4 h-4 text-teal-600" />}
              slice={breakdown.actor_associations}
            />
            <CriterionReport
              title="Relaciones include"
              icon={<GitBranch className="w-4 h-4 text-orange-600" />}
              slice={breakdown.include_relations}
            />
            <CriterionReport
              title="Relaciones extend"
              icon={<GitBranch className="w-4 h-4 text-amber-600" />}
              slice={breakdown.extend_relations}
            />
          </div>
        </div>
      )}

      <SemanticMatches details={details} />

      <Alert>
        <AlertDescription>
          Estructura detectada por el parser en la solución del docente y en el diagrama del estudiante,
          desglosada por tipo de relación.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-2 gap-6">
        {result.expected_diagram ? (
          <Card className="p-4">
            <UseCaseDiagramPanel diagram={result.expected_diagram} title="Solución del docente" />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Información del diagrama de referencia no disponible.</p>
          </Card>
        )}
        {result.student_diagram ? (
          <Card className="p-4">
            <UseCaseDiagramPanel diagram={result.student_diagram} title="Diagrama del estudiante" />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Información del diagrama del estudiante no disponible.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
