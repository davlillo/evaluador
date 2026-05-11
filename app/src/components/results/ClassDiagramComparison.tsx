import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DiagramInfo } from '@/types/comparison';

function visSymbol(v?: string): string {
  return v === 'public' ? '+' : v === 'private' ? '-' : v === 'protected' ? '#' : '+';
}

const REL_TYPE_LABELS: Record<string, string> = {
  association: 'asociación',
  inheritance: 'herencia',
  implementation: 'realización',
  dependency: 'dependencia',
  aggregation: 'agregación',
  composition: 'composición',
  include: 'include',
  extend: 'extend',
};

export function ClassDiagramComparison({
  expected,
  student,
  breakdownClasses,
  classDetails,
  relationshipBreakdown,
}: {
  expected?: DiagramInfo;
  student?: DiagramInfo;
  breakdownClasses?: { missing?: string[]; extra?: string[]; correct?: number };
  classDetails?: Array<{ class_name: string; similarity: number; attributes: { missing: string[]; extra: string[] }; methods: { missing: string[]; extra: string[] } }>;
  relationshipBreakdown?: { missing?: string[]; extra?: string[] };
}) {
  const expClasses = expected?.classes || [];
  const stuClasses = student?.classes || [];
  const expRels = expected?.relationships || [];
  const stuRels = student?.relationships || [];

  const missingSet = new Set((breakdownClasses?.missing || []).map((n: string) => n.toLowerCase()));
  const extraSet = new Set((breakdownClasses?.extra || []).map((n: string) => n.toLowerCase()));

  function elemStatus(name: string): 'match' | 'missing' | 'extra' {
    const n = name.toLowerCase();
    if (missingSet.has(n)) return 'missing';
    if (extraSet.has(n)) return 'extra';
    return 'match';
  }

  const classDetailsMap = new Map(classDetails?.map((cd) => [cd.class_name.toLowerCase(), cd]) || []);

  function computeRelKey(rel: { source: string; target: string; relationship_type: string }): string {
    const s = rel.source.toLowerCase();
    const t = rel.target.toLowerCase();
    return `${s} -> ${t} (${rel.relationship_type})`;
  }

  const expRelKeys = new Set(expRels.map(computeRelKey));
  const stuRelKeys = new Set(stuRels.map(computeRelKey));

  function isMatch(key: string): boolean {
    return expRelKeys.has(key) && stuRelKeys.has(key);
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-blue-600">Solución (Docente)</h4>
          <ScrollArea className="max-h-96">
            {expClasses.length === 0 && <p className="text-xs text-muted-foreground">Sin clases</p>}
            {expClasses.map((cls) => {
              const status = elemStatus(cls.name);
              const det = classDetailsMap.get(cls.name.toLowerCase());
              return (
                <div key={cls.name} className={`mb-3 border rounded-md bg-background overflow-hidden ${status === 'missing' ? 'border-red-300 opacity-70' : ''}`}>
                  <div className="px-3 py-1.5 bg-muted/30 font-mono text-sm font-medium border-b flex items-center justify-between">
                    <span className={status === 'missing' ? 'text-red-500 line-through' : ''}>{cls.name}</span>
                    <Badge variant={status === 'match' ? 'outline' : 'destructive'} className="text-[10px]">
                      {status === 'match' ? '✓' : '✗'}
                    </Badge>
                  </div>
                  {cls.attributes.length > 0 && (
                    <div className="px-3 py-1 border-b text-xs font-mono">
                      {cls.attributes.map((attr) => {
                        const isMissing = det?.attributes.missing.some((m) => m.toLowerCase() === attr.name.toLowerCase());
                        return (
                          <div key={attr.name} className={`py-0.5 ${isMissing ? 'text-red-500 line-through' : ''}`}>
                            {visSymbol(attr.visibility)}{attr.name}{attr.type ? `: ${attr.type}` : ''}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {cls.methods.length > 0 && (
                    <div className="px-3 py-1 text-xs font-mono">
                      {cls.methods.map((m) => {
                        const isMissing = det?.methods.missing.some((mm) => mm.toLowerCase() === m.name.toLowerCase());
                        return (
                          <div key={m.name} className={`py-0.5 ${isMissing ? 'text-red-500 line-through' : ''}`}>
                            {visSymbol(m.visibility)}{m.name}(){m.return_type ? `: ${m.return_type}` : ''}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </ScrollArea>
        </div>

        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-emerald-600">Estudiante</h4>
          <ScrollArea className="max-h-96">
            {stuClasses.length === 0 && <p className="text-xs text-muted-foreground">Sin clases</p>}
            {stuClasses.map((cls) => {
              const status = elemStatus(cls.name);
              const det = classDetailsMap.get(cls.name.toLowerCase());
              return (
                <div key={cls.name} className={`mb-3 border rounded-md bg-background overflow-hidden ${status === 'extra' ? 'border-orange-300' : ''}`}>
                  <div className="px-3 py-1.5 bg-muted/30 font-mono text-sm font-medium border-b flex items-center justify-between">
                    <span className={status === 'extra' ? 'text-orange-500' : ''}>{cls.name}</span>
                    <Badge variant={status === 'match' ? 'outline' : 'secondary'} className={`text-[10px] ${status === 'extra' ? 'bg-orange-50 text-orange-700' : ''} dark:${status === 'extra' ? 'bg-orange-950 text-orange-300' : ''}`}>
                      {status === 'match' ? '✓' : '+'}
                    </Badge>
                  </div>
                  {cls.attributes.length > 0 && (
                    <div className="px-3 py-1 border-b text-xs font-mono">
                      {cls.attributes.map((attr) => {
                        const isExtra = det?.attributes.extra.some((e) => e.toLowerCase() === attr.name.toLowerCase());
                        return (
                          <div key={attr.name} className={`py-0.5 flex items-center justify-between ${isExtra ? 'text-orange-500' : ''}`}>
                            <span>{visSymbol(attr.visibility)}{attr.name}{attr.type ? `: ${attr.type}` : ''}</span>
                            {isExtra && <span className="text-[10px] text-orange-500">extra</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {cls.methods.length > 0 && (
                    <div className="px-3 py-1 text-xs font-mono">
                      {cls.methods.map((m) => {
                        const isExtra = det?.methods.extra.some((e) => e.toLowerCase() === m.name.toLowerCase());
                        return (
                          <div key={m.name} className={`py-0.5 flex items-center justify-between ${isExtra ? 'text-orange-500' : ''}`}>
                            <span>{visSymbol(m.visibility)}{m.name}(){m.return_type ? `: ${m.return_type}` : ''}</span>
                            {isExtra && <span className="text-[10px] text-orange-500">extra</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </ScrollArea>
        </div>

        {missingSet.size > 0 && (
          <div className="md:col-span-2 -mt-2">
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-red-500 font-medium mr-1">Clases faltantes:</span>
              {breakdownClasses?.missing?.map((n) => <Badge key={n} variant="destructive" className="text-xs">{n}</Badge>)}
            </div>
          </div>
        )}
        {extraSet.size > 0 && (
          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-orange-500 font-medium mr-1">Clases extra:</span>
              {breakdownClasses?.extra?.map((n) => <Badge key={n} variant="secondary" className="text-xs bg-orange-50 text-orange-700">{n}</Badge>)}
            </div>
          </div>
        )}
      </div>

      {(expRels.length > 0 || stuRels.length > 0) && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-3">Relaciones</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3 bg-muted/20">
              <h5 className="text-xs font-semibold mb-2 text-blue-600">Solución (Docente)</h5>
              <div className="space-y-1.5">
                {expRels.map((rel, i) => {
                  const key = computeRelKey(rel);
                  const match = isMatch(key);
                  return (
                    <div key={i} className={`p-2 rounded border text-xs font-mono bg-background ${match ? '' : 'border-red-300 bg-red-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={match ? '' : 'text-red-500 line-through'}>
                          {rel.source}
                          {rel.source_multiplicity ? ` [${rel.source_multiplicity}]` : ''}
                          {' → '}
                          {rel.target}
                          {rel.target_multiplicity ? ` [${rel.target_multiplicity}]` : ''}
                        </span>
                        <Badge variant={match ? 'outline' : 'destructive'} className="text-[10px] shrink-0">
                          {match ? '✓' : '✗'}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {rel.name ? `"${rel.name}" ` : ''}{REL_TYPE_LABELS[rel.relationship_type] || rel.relationship_type}
                      </div>
                    </div>
                  );
                })}
                {expRels.length === 0 && <p className="text-xs text-muted-foreground">Sin relaciones</p>}
              </div>
            </div>

            <div className="border rounded-lg p-3 bg-muted/20">
              <h5 className="text-xs font-semibold mb-2 text-emerald-600">Estudiante</h5>
              <div className="space-y-1.5">
                {stuRels.map((rel, i) => {
                  const key = computeRelKey(rel);
                  const match = isMatch(key);
                  return (
                    <div key={i} className={`p-2 rounded border text-xs font-mono bg-background ${match ? '' : 'border-orange-300 bg-orange-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={match ? '' : 'text-orange-500'}>
                          {rel.source}
                          {rel.source_multiplicity ? ` [${rel.source_multiplicity}]` : ''}
                          {' → '}
                          {rel.target}
                          {rel.target_multiplicity ? ` [${rel.target_multiplicity}]` : ''}
                        </span>
                        <Badge variant={match ? 'outline' : 'secondary'} className={`text-[10px] shrink-0 ${!match ? 'bg-orange-50 text-orange-700' : ''}`}>
                          {match ? '✓' : '+'}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {rel.name ? `"${rel.name}" ` : ''}{REL_TYPE_LABELS[rel.relationship_type] || rel.relationship_type}
                      </div>
                    </div>
                  );
                })}
                {stuRels.length === 0 && <p className="text-xs text-muted-foreground">Sin relaciones</p>}
              </div>
            </div>
          </div>

          {relationshipBreakdown?.missing && relationshipBreakdown.missing.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs text-red-500 font-medium mr-1">Relaciones faltantes:</span>
              {relationshipBreakdown.missing.map((r) => <Badge key={r} variant="destructive" className="text-xs">{r}</Badge>)}
            </div>
          )}
          {relationshipBreakdown?.extra && relationshipBreakdown.extra.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-xs text-orange-500 font-medium mr-1">Relaciones extra:</span>
              {relationshipBreakdown.extra.map((r) => <Badge key={r} variant="secondary" className="text-xs bg-orange-50 text-orange-700">{r}</Badge>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}