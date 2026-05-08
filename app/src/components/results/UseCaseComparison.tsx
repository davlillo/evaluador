import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DiagramInfo } from '@/types/comparison';

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
  const expActors = expected?.actors || [];
  const expUC = expected?.use_cases || [];
  const stuActors = student?.actors || [];
  const stuUC = student?.use_cases || [];

  const missingActors = actorBreakdown?.missing || [];
  const extraActors = actorBreakdown?.extra || [];
  const missingUC = useCaseBreakdown?.missing || [];
  const extraUC = useCaseBreakdown?.extra || [];

  const missingActorSet = new Set(missingActors.map((n) => n.toLowerCase()));
  const extraActorSet = new Set(extraActors.map((n) => n.toLowerCase()));
  const missingUCSet = new Set(missingUC.map((n) => n.toLowerCase()));
  const extraUCSet = new Set(extraUC.map((n) => n.toLowerCase()));

  function actorStatus(name: string): 'match' | 'missing' | 'extra' {
    const n = name.toLowerCase();
    if (missingActorSet.has(n)) return 'missing';
    if (extraActorSet.has(n)) return 'extra';
    return 'match';
  }

  function ucStatus(name: string): 'match' | 'missing' | 'extra' {
    const n = name.toLowerCase();
    if (missingUCSet.has(n)) return 'missing';
    if (extraUCSet.has(n)) return 'extra';
    return 'match';
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-blue-600">Actores (Docente)</h4>
          <ScrollArea className="max-h-32">
            <div className="grid md:grid-cols-2 gap-2">
              {expActors.map((a) => (
                <div key={a.name} className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono">
                  <span className={actorStatus(a.name) === 'missing' ? 'text-red-500 line-through' : ''}>{a.name}</span>
                  <Badge variant="outline" className={actorStatus(a.name) === 'match' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
                    {actorStatus(a.name) === 'match' ? '✓' : '✗'}
                  </Badge>
                </div>
              ))}
              {expActors.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Sin actores</p>}
            </div>
          </ScrollArea>
          {missingActors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs text-red-500 font-medium">Faltantes:</span>
              {missingActors.map((a) => <Badge key={a} variant="destructive" className="text-xs">{a}</Badge>)}
            </div>
          )}
        </div>

        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-emerald-600">Actores (Estudiante)</h4>
          <ScrollArea className="max-h-32">
            <div className="grid md:grid-cols-2 gap-2">
              {stuActors.map((a) => (
                <div key={a.name} className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono">
                  <span className={actorStatus(a.name) === 'extra' ? 'text-orange-500' : ''}>{a.name}</span>
                  <Badge variant="outline" className={actorStatus(a.name) === 'extra' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}>
                    {actorStatus(a.name) === 'extra' ? '+' : '✓'}
                  </Badge>
                </div>
              ))}
              {stuActors.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Sin actores</p>}
            </div>
          </ScrollArea>
          {extraActors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs text-orange-500 font-medium">Extras:</span>
              {extraActors.map((a) => <Badge key={a} variant="secondary" className="text-xs bg-orange-50 text-orange-700">{a}</Badge>)}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-blue-600">Casos de Uso (Docente)</h4>
          <ScrollArea className="max-h-32">
            <div className="grid md:grid-cols-2 gap-2">
              {expUC.map((uc) => (
                <div key={uc.name} className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono">
                  <span className={ucStatus(uc.name) === 'missing' ? 'text-red-500 line-through' : ''}>{uc.name}</span>
                  <Badge variant="outline" className={ucStatus(uc.name) === 'match' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
                    {ucStatus(uc.name) === 'match' ? '✓' : '✗'}
                  </Badge>
                </div>
              ))}
              {expUC.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Sin casos de uso</p>}
            </div>
          </ScrollArea>
          {missingUC.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs text-red-500 font-medium">Faltantes:</span>
              {missingUC.map((uc) => <Badge key={uc} variant="destructive" className="text-xs">{uc}</Badge>)}
            </div>
          )}
        </div>

        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-emerald-600">Casos de Uso (Estudiante)</h4>
          <ScrollArea className="max-h-32">
            <div className="grid md:grid-cols-2 gap-2">
              {stuUC.map((uc) => (
                <div key={uc.name} className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono">
                  <span className={ucStatus(uc.name) === 'extra' ? 'text-orange-500' : ''}>{uc.name}</span>
                  <Badge variant="outline" className={ucStatus(uc.name) === 'extra' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}>
                    {ucStatus(uc.name) === 'extra' ? '+' : '✓'}
                  </Badge>
                </div>
              ))}
              {stuUC.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Sin casos de uso</p>}
            </div>
          </ScrollArea>
          {extraUC.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs text-orange-500 font-medium">Extras:</span>
              {extraUC.map((uc) => <Badge key={uc} variant="secondary" className="text-xs bg-orange-50 text-orange-700">{uc}</Badge>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
