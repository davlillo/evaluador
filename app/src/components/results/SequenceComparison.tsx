import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DiagramInfo } from '@/types/comparison';

export function SequenceComparison({
  expected,
  lifelineBreakdown,
}: {
  expected?: DiagramInfo;
  lifelineBreakdown?: { missing?: string[]; extra?: string[] };
}) {
  const expLifelines = expected?.lifelines || [];
  const expMessages = expected?.messages || [];

  const missingLifelines = lifelineBreakdown?.missing || [];
  const extraLifelines = lifelineBreakdown?.extra || [];

  const missingSet = new Set(missingLifelines.map((n) => n.toLowerCase()));
  const extraSet = new Set(extraLifelines.map((n) => n.toLowerCase()));

  function status(name: string): 'match' | 'missing' | 'extra' {
    const n = name.toLowerCase();
    if (missingSet.has(n)) return 'missing';
    if (extraSet.has(n)) return 'extra';
    return 'match';
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-blue-600">Líneas de Vida (Docente)</h4>
          <ScrollArea className="max-h-32">
            <div className="space-y-1">
              {expLifelines.map((ll) => (
                <div key={ll.name} className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono">
                  <span className={status(ll.name) === 'missing' ? 'text-red-500 line-through' : ''}>{ll.name}</span>
                  <Badge variant="outline" className={status(ll.name) === 'match' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
                    {status(ll.name) === 'match' ? '✓' : '✗'}
                  </Badge>
                </div>
              ))}
              {expLifelines.length === 0 && <p className="text-xs text-muted-foreground">Sin líneas de vida</p>}
            </div>
          </ScrollArea>
        </div>

        <div className="border rounded-lg p-3 bg-muted/20">
          <h4 className="text-sm font-semibold mb-3 text-emerald-600">Mensajes (Docente)</h4>
          <ScrollArea className="max-h-32">
            <div className="space-y-1">
              {expMessages.map((msg, i) => (
                <div key={i} className="p-2 bg-background rounded border text-xs font-mono">
                  <span className="text-muted-foreground">{msg.source_lifeline} → {msg.target_lifeline}: </span>
                  <span>{msg.name}</span>
                </div>
              ))}
              {expMessages.length === 0 && <p className="text-xs text-muted-foreground">Sin mensajes</p>}
            </div>
          </ScrollArea>
        </div>
      </div>

      {missingLifelines.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-red-500 font-medium mr-1">Líneas de vida faltantes:</span>
          {missingLifelines.map((ll) => <Badge key={ll} variant="destructive" className="text-xs">{ll}</Badge>)}
        </div>
      )}
      {extraLifelines.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-orange-500 font-medium mr-1">Líneas de vida extra:</span>
          {extraLifelines.map((ll) => <Badge key={ll} variant="secondary" className="text-xs bg-orange-50 text-orange-700">{ll}</Badge>)}
        </div>
      )}
    </div>
  );
}