import { SequenceSvg, sequenceNaturalSize } from '@/components/diagram/SequenceSvg';
import type { DiffStatus } from '@/lib/status-colors';
import type { DiagramInfo, DiagramMessage } from '@/types/comparison';

/**
 * Comparación de diagramas de secuencia apilada (docente arriba, estudiante abajo)
 * con el mismo tamaño de lienzo y cajas alt/loop cuando hay fragment.
 */
function msgKey(m: { source_lifeline: string; target_lifeline: string; name: string }) {
  return `${m.source_lifeline}->${m.target_lifeline}:${m.name}`.toLowerCase();
}

export function SequenceComparison({
  expected,
  student,
}: {
  expected?: DiagramInfo;
  student?: DiagramInfo;
  lifelineBreakdown?: { missing?: string[]; extra?: string[] };
}) {
  const expMessages = (expected?.messages || []) as DiagramMessage[];
  const stuMessages = (student?.messages || []) as DiagramMessage[];
  const expLifelines = expected?.lifelines || [];
  const stuLifelines = student?.lifelines || [];
  const expKeys = new Set(expMessages.map(msgKey));
  const stuKeys = new Set(stuMessages.map(msgKey));

  const expDiff = new Map<string, DiffStatus>();
  for (const m of expMessages) {
    expDiff.set(msgKey(m), stuKeys.has(msgKey(m)) ? 'match' : 'mismatch');
  }
  const stuDiff = new Map<string, DiffStatus>();
  for (const m of stuMessages) {
    stuDiff.set(msgKey(m), expKeys.has(msgKey(m)) ? 'match' : 'extra');
  }

  const expSize = sequenceNaturalSize(expLifelines, expMessages);
  const stuSize = sequenceNaturalSize(stuLifelines, stuMessages);
  const sharedWidth = Math.max(expSize.width, stuSize.width);
  const sharedHeight = Math.max(expSize.height, stuSize.height);

  return (
    <div className="flex flex-col gap-6 w-full">
      <figure className="border rounded-lg p-4 bg-card w-full">
        <figcaption className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Diagrama docente
        </figcaption>
        <SequenceSvg
          lifelines={expLifelines}
          messages={expMessages}
          diff={expDiff}
          minWidth={sharedWidth}
          minHeight={sharedHeight}
        />
      </figure>
      <figure className="border rounded-lg p-4 bg-card w-full">
        <figcaption className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Diagrama estudiante
        </figcaption>
        <SequenceSvg
          lifelines={stuLifelines}
          messages={stuMessages}
          diff={stuDiff}
          minWidth={sharedWidth}
          minHeight={sharedHeight}
        />
      </figure>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ background: 'hsl(var(--foreground))' }} /> Coincide
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ background: 'hsl(var(--mismatch))' }} /> Faltante
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ background: 'hsl(var(--extra))' }} /> Extra
        </span>
      </div>
    </div>
  );
}
