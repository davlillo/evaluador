import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DiagramInfo } from '@/types/comparison';

interface MessageInfo {
  name: string;
  source_lifeline: string;
  target_lifeline: string;
}

// Construye un set de claves de mensajes para comparación
function msgKey(msg: MessageInfo) {
  return `${msg.source_lifeline}→${msg.target_lifeline}:${msg.name}`.toLowerCase();
}

export function SequenceComparison({
  expected,
  student,
  lifelineBreakdown,
}: {
  expected?: DiagramInfo;
  student?: DiagramInfo;
  lifelineBreakdown?: { missing?: string[]; extra?: string[] };
}) {
  const expLifelines = expected?.lifelines || [];
  const expMessages  = (expected?.messages || []) as MessageInfo[];
  const stuLifelines = student?.lifelines || [];
  const stuMessages  = (student?.messages || []) as MessageInfo[];

  const missingLifelines = lifelineBreakdown?.missing || [];
  const extraLifelines   = lifelineBreakdown?.extra   || [];

  const missingSet = new Set(missingLifelines.map((n) => n.toLowerCase()));
  const extraSet   = new Set(extraLifelines.map((n) => n.toLowerCase()));

  // Sets de mensajes para marcar coincidencias
  const expMsgKeys = new Set(expMessages.map(msgKey));
  const stuMsgKeys = new Set(stuMessages.map(msgKey));

  function lifelineStatus(name: string): 'match' | 'missing' | 'extra' {
    const n = name.toLowerCase();
    if (missingSet.has(n)) return 'missing';
    if (extraSet.has(n))   return 'extra';
    return 'match';
  }

  // Altura dinámica para el scroll de lifelines (mín 3, máx 8 filas)
  const llRows = Math.min(Math.max(expLifelines.length, stuLifelines.length, 3), 8);
  const llHeight = llRows * 40; // ~40px por fila

  return (
    <div className="space-y-5">

      {/* ── Líneas de vida ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Docente */}
        <div className="border rounded-lg p-3 bg-muted/20 flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-blue-600">
            Líneas de Vida <span className="text-muted-foreground font-normal">(Docente)</span>
          </h4>
          <ScrollArea style={{ maxHeight: llHeight }}>
            <div className="space-y-1 pr-2">
              {expLifelines.map((ll) => {
                const s = lifelineStatus(ll.name);
                return (
                  <div
                    key={ll.name}
                    className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono"
                  >
                    <span className={s === 'missing' ? 'text-red-500 line-through' : ''}>
                      {ll.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        s === 'match'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }
                    >
                      {s === 'match' ? '✓' : '✗'}
                    </Badge>
                  </div>
                );
              })}
              {expLifelines.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sin líneas de vida</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Estudiante */}
        <div className="border rounded-lg p-3 bg-muted/20 flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-emerald-600">
            Líneas de Vida <span className="text-muted-foreground font-normal">(Estudiante)</span>
          </h4>
          <ScrollArea style={{ maxHeight: llHeight }}>
            <div className="space-y-1 pr-2">
              {stuLifelines.map((ll) => {
                const s = lifelineStatus(ll.name);
                return (
                  <div
                    key={ll.name}
                    className="flex items-center justify-between p-2 bg-background rounded border text-xs font-mono"
                  >
                    <span className={s === 'extra' ? 'text-orange-500' : ''}>
                      {ll.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        s === 'extra'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }
                    >
                      {s === 'extra' ? '+' : '✓'}
                    </Badge>
                  </div>
                );
              })}
              {stuLifelines.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sin líneas de vida</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Badges de lifelines faltantes / extra ── */}
      {(missingLifelines.length > 0 || extraLifelines.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {missingLifelines.map((ll) => (
            <Badge key={`m-${ll}`} variant="destructive" className="text-xs">
              ✗ falta: {ll}
            </Badge>
          ))}
          {extraLifelines.map((ll) => (
            <Badge key={`e-${ll}`} variant="secondary" className="text-xs bg-orange-50 text-orange-700 border border-orange-200">
              + extra: {ll}
            </Badge>
          ))}
        </div>
      )}

      {/* ── Mensajes ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Mensajes Docente */}
        <div className="border rounded-lg p-3 bg-muted/20 flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-blue-600">
            Mensajes{' '}
            <span className="text-muted-foreground font-normal">(Docente)</span>
            <span className="ml-2 text-xs font-mono text-muted-foreground">
              {expMessages.length}
            </span>
          </h4>
          <ScrollArea className="max-h-64">
            <div className="space-y-1 pr-2">
              {expMessages.map((msg, i) => {
                const isInStudent = stuMsgKeys.has(msgKey(msg));
                return (
                  <div
                    key={i}
                    className={`p-2 rounded border text-xs font-mono flex flex-col gap-0.5 ${
                      isInStudent
                        ? 'bg-background border-border'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    {msg.fragment && (
                      <span className="inline-flex items-center gap-1 mb-0.5">
                        <span className="px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200">
                          {msg.fragment}
                        </span>
                      </span>
                    )}
                    <span className="text-muted-foreground text-[10px] leading-tight truncate">
                      {msg.source_lifeline}{' '}
                      <span className="text-slate-400">→</span>{' '}
                      {msg.target_lifeline}
                    </span>
                    <span className={`font-medium ${isInStudent ? '' : 'text-red-600'}`}>
                      {msg.name || <span className="italic text-muted-foreground">(sin nombre)</span>}
                      {!isInStudent && (
                        <Badge variant="destructive" className="ml-2 text-[10px] py-0 px-1">
                          falta
                        </Badge>
                      )}
                    </span>
                  </div>
                );
              })}
              {expMessages.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sin mensajes</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Mensajes Estudiante */}
        <div className="border rounded-lg p-3 bg-muted/20 flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-emerald-600">
            Mensajes{' '}
            <span className="text-muted-foreground font-normal">(Estudiante)</span>
            <span className="ml-2 text-xs font-mono text-muted-foreground">
              {stuMessages.length}
            </span>
          </h4>
          <ScrollArea className="max-h-64">
            <div className="space-y-1 pr-2">
              {stuMessages.map((msg, i) => {
                const isInExpected = expMsgKeys.has(msgKey(msg));
                return (
                  <div
                    key={i}
                    className={`p-2 rounded border text-xs font-mono flex flex-col gap-0.5 ${
                      isInExpected
                        ? 'bg-background border-border'
                        : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    {msg.fragment && (
                      <span className="inline-flex items-center gap-1 mb-0.5">
                        <span className="px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200">
                          {msg.fragment}
                        </span>
                      </span>
                    )}
                    <span className="text-muted-foreground text-[10px] leading-tight truncate">
                      {msg.source_lifeline}{' '}
                      <span className="text-slate-400">→</span>{' '}
                      {msg.target_lifeline}
                    </span>
                    <span className={`font-medium ${isInExpected ? '' : 'text-orange-600'}`}>
                      {msg.name || <span className="italic text-muted-foreground">(sin nombre)</span>}
                      {!isInExpected && (
                        <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1 bg-orange-100 text-orange-700">
                          extra
                        </Badge>
                      )}
                    </span>
                  </div>
                );
              })}
              {stuMessages.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sin mensajes</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

    </div>
  );
}
