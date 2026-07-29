import { ClassSvg, type ClassDiff } from '@/components/diagram/ClassSvg';
import type { DiffStatus } from '@/lib/status-colors';
import type { DiagramInfo } from '@/types/comparison';

/**
 * Comparación de diagramas de clases apilada (docente arriba, estudiante abajo)
 * con renderer SVG (notación UML + diff por elemento).
 */
export function ClassDiagramComparison({
  expected,
  student,
  breakdownClasses,
  classDetails,
}: {
  expected?: DiagramInfo;
  student?: DiagramInfo;
  breakdownClasses?: { missing?: string[]; extra?: string[]; correct?: number };
  classDetails?: Array<{ class_name: string; similarity: number; attributes: { missing: string[]; extra: string[] }; methods: { missing: string[]; extra: string[] } }>;
  relationshipBreakdown?: { missing?: string[]; extra?: string[] };
}) {
  const missingSet = new Set((breakdownClasses?.missing || []).map((n) => n.toLowerCase()));
  const extraSet = new Set((breakdownClasses?.extra || []).map((n) => n.toLowerCase()));
  const detailsMap = new Map(classDetails?.map((cd) => [cd.class_name.toLowerCase(), cd]) || []);

  function classStatus(name: string): DiffStatus {
    const n = name.toLowerCase();
    if (missingSet.has(n)) return 'mismatch';
    if (extraSet.has(n)) return 'extra';
    return 'match';
  }

  function buildDiff(): Map<string, ClassDiff> {
    const map = new Map<string, ClassDiff>();
    const allNames = new Set<string>([
      ...(expected?.classes || []).map((c) => c.name.toLowerCase()),
      ...(student?.classes || []).map((c) => c.name.toLowerCase()),
    ]);
    for (const name of allNames) {
      const det = detailsMap.get(name);
      map.set(name, {
        status: classStatus(name),
        missingAttrs: new Set((det?.attributes.missing || []).map((s) => s.toLowerCase())),
        extraAttrs: new Set((det?.attributes.extra || []).map((s) => s.toLowerCase())),
        missingMethods: new Set((det?.methods.missing || []).map((s) => s.toLowerCase())),
        extraMethods: new Set((det?.methods.extra || []).map((s) => s.toLowerCase())),
      });
    }
    return map;
  }

  const diff = buildDiff();

  return (
    <div className="flex flex-col gap-6 w-full">
      <figure className="border rounded-lg p-4 bg-card w-full">
        <figcaption className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Diagrama docente
        </figcaption>
        <ClassSvg
          classes={expected?.classes || []}
          relationships={expected?.relationships || []}
          diff={diff}
          side="expected"
        />
      </figure>
      <figure className="border rounded-lg p-4 bg-card w-full">
        <figcaption className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Diagrama estudiante
        </figcaption>
        <ClassSvg
          classes={student?.classes || []}
          relationships={student?.relationships || []}
          diff={diff}
          side="student"
        />
      </figure>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border-2" style={{ borderColor: 'hsl(var(--foreground))' }} /> Coincide
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border-2" style={{ borderColor: 'hsl(var(--mismatch))' }} /> Faltante
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border-2" style={{ borderColor: 'hsl(var(--extra))' }} /> Extra
        </span>
      </div>
    </div>
  );
}
