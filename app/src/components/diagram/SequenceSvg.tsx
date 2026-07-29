import { useId } from 'react';
import type { DiffStatus } from '@/lib/status-colors';
import type { DiagramLifeline, DiagramMessage } from '@/types/comparison';
import { isActorLifeline, layoutSequenceDiagram } from '@/lib/diagram-layout/sequence';

/**
 * Diagrama de secuencia UML: lifelines ordenadas, cabeceras sin solape,
 * barras de activación, cajas alt/loop espaciosas y flechas claras.
 */

interface Props {
  lifelines: DiagramLifeline[];
  messages: DiagramMessage[];
  diff?: Map<string, DiffStatus>;
  minWidth?: number;
  minHeight?: number;
}

const LL_GAP = 128;
const HEAD_W = 100;
const HEAD_H = 34;
const ACTOR_HEAD_H = 54;
const MSG_GAP = 44;
const FRAG_PAD_TOP = 18;
const FRAG_PAD_BOT = 14;
const PAD = 20;
const TOP = 10;
const EXEC_W = 10;
const FRAG_X_MARGIN = 18;

function msgColor(status?: DiffStatus): string {
  if (!status || status === 'match') return 'hsl(var(--foreground))';
  return `hsl(var(--${status}))`;
}

function parseFragment(raw?: string | null): { op: string; guard: string; label: string } | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const m = s.match(/^(alt|loop|opt|par|break|critical)\b\s*(?:\[([^\]]*)\])?/i);
  if (m) {
    const op = m[1].toLowerCase();
    const guard = (m[2] || '').trim();
    return { op, guard, label: guard ? `${op} [${guard}]` : op };
  }
  const first = s.split(/[\s\[]/)[0].toLowerCase();
  if (['alt', 'loop', 'opt', 'par', 'break', 'critical'].includes(first)) {
    return { op: first, guard: '', label: s };
  }
  return { op: 'frag', guard: '', label: s };
}

interface FragSpan {
  label: string;
  op: string;
  startIdx: number;
  endIdx: number;
  depth: number;
}

function buildFragmentSpans(messages: DiagramMessage[]): FragSpan[] {
  type Run = { key: string; label: string; op: string; start: number; end: number };
  const runs: Run[] = [];
  for (let i = 0; i < messages.length; i++) {
    const parsed = parseFragment(messages[i].fragment);
    if (!parsed) continue;
    const key = `${parsed.op}|${parsed.guard}`.toLowerCase();
    const last = runs[runs.length - 1];
    if (last && last.key === key && last.end === i - 1) {
      last.end = i;
    } else {
      runs.push({ key, label: parsed.label, op: parsed.op, start: i, end: i });
    }
  }

  // Fusionar runs del mismo alt/opt separados solo por un loop anidado.
  const merged: Run[] = [];
  for (let i = 0; i < runs.length; i++) {
    const cur = { ...runs[i] };
    if (
      (cur.op === 'alt' || cur.op === 'opt')
      && i + 2 < runs.length
      && runs[i + 1].op === 'loop'
      && runs[i + 2].key === cur.key
      && runs[i + 1].start === cur.end + 1
      && runs[i + 2].start === runs[i + 1].end + 1
    ) {
      cur.end = runs[i + 2].end;
      merged.push(cur);
      merged.push(runs[i + 1]);
      i += 2;
      continue;
    }
    merged.push(cur);
  }

  return merged.map((r) => {
    let depth = 0;
    for (const o of merged) {
      if (o === r) continue;
      if (o.start <= r.start && o.end >= r.end && (o.start < r.start || o.end > r.end)) depth += 1;
    }
    return { label: r.label, op: r.op, startIdx: r.start, endIdx: r.end, depth };
  });
}

function headerBottom(ll: DiagramLifeline): number {
  return isActorLifeline(ll) ? TOP + ACTOR_HEAD_H : TOP + HEAD_H;
}

export function SequenceSvg({ lifelines, messages, diff, minWidth, minHeight }: Props) {
  const uid = useId().replace(/:/g, '');

  if (lifelines.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Sin líneas de vida para mostrar</p>;
  }

  const orderedLifelines = layoutSequenceDiagram(lifelines, messages);
  const maxHead = Math.max(...orderedLifelines.map(headerBottom), TOP + HEAD_H);

  const llX = new Map<string, number>();
  orderedLifelines.forEach((ll, i) => {
    llX.set(ll.name.toLowerCase(), PAD + HEAD_W / 2 + i * LL_GAP);
  });

  const ordered = [...messages].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const spans = buildFragmentSpans(ordered);

  const extraBefore = new Array(ordered.length).fill(0);
  const extraAfter = new Array(ordered.length).fill(0);
  for (const sp of spans) {
    extraBefore[sp.startIdx] += FRAG_PAD_TOP;
    extraAfter[sp.endIdx] += FRAG_PAD_BOT;
  }

  const bodyTop = maxHead + 18;
  const msgY: number[] = [];
  let yCursor = bodyTop + 6;
  for (let i = 0; i < ordered.length; i++) {
    yCursor += extraBefore[i];
    msgY.push(yCursor);
    yCursor += MSG_GAP + extraAfter[i];
  }

  const naturalWidth = PAD * 2 + HEAD_W + Math.max(orderedLifelines.length - 1, 0) * LL_GAP;
  const naturalHeight = (ordered.length > 0 ? yCursor : bodyTop + 36) + 28;
  const width = Math.max(naturalWidth, minWidth ?? 0);
  const height = Math.max(naturalHeight, minHeight ?? 0);
  const lifeBottom = height - 14;

  function anchorX(name: string): number | undefined {
    return llX.get(name.toLowerCase());
  }

  // Barras de activación
  const activations: { x: number; y1: number; y2: number }[] = [];
  ordered.forEach((m, i) => {
    const isReturn = m.message_sort === 'reply' || m.message_sort === 'async';
    const y = msgY[i];
    const tx = anchorX(m.target_lifeline);
    const sx = anchorX(m.source_lifeline);
    if (tx != null && !isReturn) {
      activations.push({ x: tx, y1: y - 3, y2: y + 14 });
    }
    if (sx != null && !isReturn) {
      activations.push({ x: sx, y1: y - 3, y2: y + 12 });
    }
  });

  return (
    <div className="w-full overflow-x-auto flex justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxWidth: width, minWidth: Math.min(width, 360) }}
        role="img"
        aria-label="Diagrama de secuencia"
      >
        <defs>
          <marker id={`seq-solid-${uid}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L9,3 L0,6 Z" fill="hsl(var(--foreground))" />
          </marker>
          <marker id={`seq-open-${uid}`} markerWidth="12" markerHeight="10" refX="10" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,3 L0,6" fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.2} />
          </marker>
        </defs>

        {/* Lifelines */}
        {orderedLifelines.map((ll) => {
          const x = llX.get(ll.name.toLowerCase())!;
          const actor = isActorLifeline(ll);
          const lifeStart = actor ? TOP + ACTOR_HEAD_H + 4 : TOP + HEAD_H + 4;
          return (
            <g key={ll.name}>
              {actor ? (
                <g>
                  <circle cx={x} cy={TOP + 10} r={8} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={1.5} />
                  <line x1={x} y1={TOP + 18} x2={x} y2={TOP + 32} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
                  <line x1={x - 11} y1={TOP + 23} x2={x + 11} y2={TOP + 23} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
                  <line x1={x} y1={TOP + 32} x2={x - 9} y2={TOP + 44} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
                  <line x1={x} y1={TOP + 32} x2={x + 9} y2={TOP + 44} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
                  <text x={x} y={TOP + 56} textAnchor="middle" fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">
                    {ll.name}
                  </text>
                </g>
              ) : (
                <g>
                  <rect
                    x={x - HEAD_W / 2}
                    y={TOP}
                    width={HEAD_W}
                    height={HEAD_H}
                    rx={3}
                    fill="hsl(var(--primary) / 0.07)"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={1.5}
                  />
                  <text x={x} y={TOP + HEAD_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="hsl(var(--foreground))">
                    {ll.name}
                  </text>
                </g>
              )}
              <line
                x1={x} y1={lifeStart} x2={x} y2={lifeBottom}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.25}
                strokeDasharray="5 4"
              />
            </g>
          );
        })}

        {/* Fragmentos: solo cubren lifelines involucradas */}
        {spans.map((sp, i) => {
          const y1 = msgY[sp.startIdx] - FRAG_PAD_TOP + 2;
          const y2 = msgY[sp.endIdx] + FRAG_PAD_BOT - 2;
          const involvedX: number[] = [];
          for (let mi = sp.startIdx; mi <= sp.endIdx; mi++) {
            const m = ordered[mi];
            const x1 = anchorX(m.source_lifeline);
            const x2 = anchorX(m.target_lifeline);
            if (x1 != null) involvedX.push(x1);
            if (x2 != null) involvedX.push(x2);
          }
          const minX = involvedX.length > 0 ? Math.min(...involvedX) : PAD;
          const maxX = involvedX.length > 0 ? Math.max(...involvedX) : naturalWidth - PAD;
          const inset = sp.depth * 8;
          const x = minX - FRAG_X_MARGIN + inset;
          const w = Math.max(maxX - minX + FRAG_X_MARGIN * 2 - inset * 2, 100);
          const h = Math.max(y2 - y1, 32);
          const tabLabel = sp.label.length > 36 ? `${sp.label.slice(0, 34)}…` : sp.label;
          const tabW = Math.min(16 + tabLabel.length * 6.5, w - 10);
          return (
            <g key={`frag-${i}`}>
              <rect
                x={x}
                y={y1}
                width={w}
                height={h}
                fill="hsl(var(--muted) / 0.18)"
                stroke="hsl(var(--foreground))"
                strokeWidth={1.4}
                rx={3}
              />
              <rect
                x={x}
                y={y1}
                width={tabW}
                height={16}
                fill="hsl(var(--card))"
                stroke="hsl(var(--foreground))"
                strokeWidth={1.4}
              />
              <text x={x + 7} y={y1 + 12} fontSize={10} fontWeight={700} fill="hsl(var(--foreground))">
                {tabLabel}
              </text>
            </g>
          );
        })}

        {/* Barras de activación */}
        {activations.map((a, i) => (
          <rect
            key={`exec-${i}`}
            x={a.x - EXEC_W / 2}
            y={a.y1}
            width={EXEC_W}
            height={Math.max(a.y2 - a.y1, 8)}
            fill="hsl(var(--card))"
            stroke="hsl(var(--foreground))"
            strokeWidth={1.2}
          />
        ))}

        {/* Mensajes */}
        {ordered.map((m, i) => {
          const x1 = anchorX(m.source_lifeline);
          const x2 = anchorX(m.target_lifeline);
          if (x1 === undefined || x2 === undefined) return null;
          const y = msgY[i];
          const key = `${m.source_lifeline}->${m.target_lifeline}:${m.name}`.toLowerCase();
          const status = diff?.get(key);
          const color = msgColor(status);
          const isReturn = m.message_sort === 'reply' || m.message_sort === 'async';
          const strike = status === 'mismatch';
          // Acortar flecha para no entrar en la barra de ejecución
          const dir = x2 >= x1 ? 1 : -1;
          const xStart = x1 + dir * (EXEC_W / 2 + 1);
          const xEnd = x2 - dir * (EXEC_W / 2 + 1);
          const labelX = (x1 + x2) / 2;
          return (
            <g key={i}>
              <line
                x1={xStart} y1={y} x2={xEnd} y2={y}
                stroke={color}
                strokeWidth={1.6}
                strokeDasharray={isReturn ? '6 4' : undefined}
                markerEnd={isReturn ? `url(#seq-open-${uid})` : `url(#seq-solid-${uid})`}
              />
              <text
                x={labelX}
                y={y - 8}
                textAnchor="middle"
                fontSize={12}
                fontWeight={500}
                fill={color}
                style={strike ? { textDecoration: 'line-through' } : undefined}
              >
                {m.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function sequenceNaturalSize(lifelines: DiagramLifeline[], messages: DiagramMessage[]): { width: number; height: number } {
  const orderedLifelines = layoutSequenceDiagram(lifelines, messages);
  const maxHead = orderedLifelines.length
    ? Math.max(...orderedLifelines.map(headerBottom), TOP + HEAD_H)
    : TOP + HEAD_H;
  const ordered = [...messages].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const spans = buildFragmentSpans(ordered);
  const extraBefore = new Array(ordered.length).fill(0);
  const extraAfter = new Array(ordered.length).fill(0);
  for (const sp of spans) {
    extraBefore[sp.startIdx] += FRAG_PAD_TOP;
    extraAfter[sp.endIdx] += FRAG_PAD_BOT;
  }
  const bodyTop = maxHead + 18;
  let yCursor = bodyTop + 6;
  for (let i = 0; i < ordered.length; i++) {
    yCursor += extraBefore[i];
    yCursor += MSG_GAP + extraAfter[i];
  }
  const width = PAD * 2 + HEAD_W + Math.max(orderedLifelines.length - 1, 0) * LL_GAP;
  const height = (ordered.length > 0 ? yCursor : bodyTop + 36) + 28;
  return { width, height };
}
