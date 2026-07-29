import { UseCaseSvg, type UseCaseNode, type UseCaseEdge } from '@/components/diagram/UseCaseSvg';
import type { DiffStatus } from '@/lib/status-colors';
import type { DiagramInfo } from '@/types/comparison';

/**
 * Comparación de casos de uso apilada (docente arriba, estudiante abajo) usando
 * el renderer SVG con notación UML real (muñequitos + elipses + líneas rectas).
 * La lógica de acierto/faltante/extra se deriva de los breakdown.
 */
export function UseCaseComparison({
  expected,
  student,
  actorBreakdown,
  useCaseBreakdown,
}: {
  expected?: DiagramInfo;
  student?: DiagramInfo;
  actorBreakdown?: { missing?: string[]; extra?: string[] };
  useCaseBreakdown?: { missing?: string[]; extra?: string[] };
}) {
  const missingActorSet = new Set((actorBreakdown?.missing || []).map((n) => n.toLowerCase()));
  const extraActorSet = new Set((actorBreakdown?.extra || []).map((n) => n.toLowerCase()));
  const missingUCSet = new Set((useCaseBreakdown?.missing || []).map((n) => n.toLowerCase()));
  const extraUCSet = new Set((useCaseBreakdown?.extra || []).map((n) => n.toLowerCase()));

  function nodeStatus(name: string, missing: Set<string>, extra: Set<string>): DiffStatus {
    const n = name.toLowerCase();
    if (missing.has(n)) return 'mismatch';
    if (extra.has(n)) return 'extra';
    return 'match';
  }

  function buildNodes(info?: DiagramInfo): { actors: UseCaseNode[]; useCases: UseCaseNode[]; edges: UseCaseEdge[] } {
    const actors: UseCaseNode[] = (info?.actors || []).map((a) => ({
      name: a.name,
      status: nodeStatus(a.name, missingActorSet, extraActorSet),
    }));
    const useCases: UseCaseNode[] = (info?.use_cases || []).map((u) => ({
      name: u.name,
      status: nodeStatus(u.name, missingUCSet, extraUCSet),
    }));
    const edges: UseCaseEdge[] = (info?.relationships || []).map((r) => ({
      source: r.source,
      target: r.target,
      kind: r.relationship_type,
    }));
    return { actors, useCases, edges };
  }

  const exp = buildNodes(expected);
  const stu = buildNodes(student);

  return (
    <div className="flex flex-col gap-6 w-full">
      <figure className="border rounded-lg p-4 bg-card w-full">
        <figcaption className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Diagrama docente
        </figcaption>
        <UseCaseSvg actors={exp.actors} useCases={exp.useCases} edges={exp.edges} />
      </figure>
      <figure className="border rounded-lg p-4 bg-card w-full">
        <figcaption className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Diagrama estudiante
        </figcaption>
        <UseCaseSvg actors={stu.actors} useCases={stu.useCases} edges={stu.edges} />
      </figure>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: 'hsl(var(--foreground))' }} /> Coincide
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: 'hsl(var(--mismatch))' }} /> Faltante
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: 'hsl(var(--extra))' }} /> Extra
        </span>
      </div>
    </div>
  );
}
