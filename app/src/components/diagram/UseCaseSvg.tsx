import { useId } from 'react';
import type { DiffStatus } from '@/lib/status-colors';
import {
  layoutUseCaseDiagram,
  prepareUseCaseViewEdges,
  UC_LAYOUT_CONST,
} from '@/lib/diagram-layout/usecase';

/**
 * Renderer SVG de casos de uso: usa el motor de layout multi-columna por actor.
 */

export interface UseCaseNode {
  name: string;
  status?: DiffStatus;
}

export interface UseCaseEdge {
  source: string;
  target: string;
  kind: string;
}

interface Props {
  actors: UseCaseNode[];
  useCases: UseCaseNode[];
  edges: UseCaseEdge[];
}

const { UC_W, UC_H } = UC_LAYOUT_CONST;

function statusStroke(status?: DiffStatus): string {
  if (!status || status === 'match') return 'hsl(var(--foreground))';
  return `hsl(var(--${status}))`;
}
function statusFill(status?: DiffStatus): string {
  if (!status || status === 'match') return 'hsl(var(--card))';
  return `hsl(var(--${status}) / 0.10)`;
}

function keyOf(name: string): string {
  return name.toLowerCase();
}

function wrapLabel(name: string, maxChars = 20): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  if (name.length <= maxChars || words.length <= 1) return [name];
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxChars && current && lines.length < 2) {
      lines.push(current);
      current = w;
    } else if (lines.length >= 2) {
      current = current ? `${current} ${w}` : w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function StickFigure({ cx, cy, name, status }: { cx: number; cy: number; name: string; status?: DiffStatus }) {
  const stroke = statusStroke(status);
  const headR = 8;
  const headCy = cy - 22;
  const bodyTop = headCy + headR;
  const bodyBottom = bodyTop + 20;
  const armY = bodyTop + 6;
  const legY = bodyBottom + 14;
  const strike = status === 'mismatch';
  return (
    <g>
      <circle cx={cx} cy={headCy} r={headR} fill={statusFill(status)} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBottom} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx - 12} y1={armY} x2={cx + 12} y2={armY} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx} y1={bodyBottom} x2={cx - 10} y2={legY} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx} y1={bodyBottom} x2={cx + 10} y2={legY} stroke={stroke} strokeWidth={1.5} />
      <text
        x={cx}
        y={legY + 12}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={stroke}
        style={strike ? { textDecoration: 'line-through' } : undefined}
      >
        {name}
      </text>
    </g>
  );
}

function UseCaseEllipse({ cx, cy, name, status }: { cx: number; cy: number; name: string; status?: DiffStatus }) {
  const stroke = statusStroke(status);
  const strike = status === 'mismatch';
  const lines = wrapLabel(name);
  const fontSize = lines.some((l) => l.length > 22) ? 10 : 11;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={UC_W / 2} ry={UC_H / 2} fill={statusFill(status)} stroke={stroke} strokeWidth={1.5} />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={cx}
          y={cy + 3 + (i - (lines.length - 1) / 2) * (fontSize + 2)}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={500}
          fill={stroke}
          style={strike ? { textDecoration: 'line-through' } : undefined}
        >
          {ln}
        </text>
      ))}
    </g>
  );
}

function edgeAnchor(
  from: { x: number; y: number; kind: 'actor' | 'uc' },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (from.kind === 'actor') return { x: from.x + 14, y: from.y };
  const rx = UC_W / 2;
  const ry = UC_H / 2;
  const denom = Math.sqrt((ux * rx) ** 2 + (uy * ry) ** 2) || 1;
  const t = (rx * ry) / denom;
  return { x: from.x + ux * t, y: from.y + uy * t };
}

/**
 * Vista alineada a Astah: hub = source del include; satélites include/extend
 * a la derecha; sin asociación actor→satélite (aunque el XMI la traiga).
 */
export function UseCaseSvg({ actors, useCases, edges }: Props) {
  const uid = useId().replace(/:/g, '');

  if (actors.length === 0 && useCases.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Sin elementos para mostrar</p>;
  }

  const viewEdges = prepareUseCaseViewEdges(
    actors.map((a) => a.name),
    edges,
  );
  const layout = layoutUseCaseDiagram(actors, useCases, viewEdges);
  const statusByName = new Map<string, DiffStatus | undefined>();
  actors.forEach((a) => statusByName.set(keyOf(a.name), a.status));
  useCases.forEach((u) => statusByName.set(keyOf(u.name), u.status));

  const pos = new Map(layout.nodes.map((n) => [keyOf(n.name), n]));

  return (
    <div className="w-full overflow-x-auto flex justify-center">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="max-h-[640px] w-auto max-w-full"
        role="img"
        aria-label="Diagrama de casos de uso"
      >
        <defs>
          <marker id={`uc-arrow-${uid}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,3 L0,6" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
          </marker>
        </defs>

        {layout.system && (
          <rect
            x={layout.system.x}
            y={layout.system.y}
            width={layout.system.w}
            height={layout.system.h}
            rx={6}
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            opacity={0.5}
          />
        )}

        {viewEdges.map((e, i) => {
          const a = pos.get(keyOf(e.source));
          const b = pos.get(keyOf(e.target));
          if (!a || !b) return null;
          const p1 = edgeAnchor({ x: a.x, y: a.y, kind: a.kind }, b);
          const p2 = edgeAnchor({ x: b.x, y: b.y, kind: b.kind }, a);
          const kind = (e.kind || '').toLowerCase();
          const isInclude = kind === 'include';
          const isExtend = kind === 'extend';
          const dashed = isInclude || isExtend;
          const label = isInclude ? '«include»' : isExtend ? '«extend»' : '';
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const nearlyVertical = Math.abs(p1.x - p2.x) < 8;
          const lx = nearlyVertical ? midX + UC_W / 2 + 6 : midX;
          const ly = nearlyVertical ? midY : midY - 6;
          const labelW = label.length * 5 + 4;
          return (
            <g key={i}>
              <line
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.25}
                strokeDasharray={dashed ? '4 3' : undefined}
                markerEnd={dashed ? `url(#uc-arrow-${uid})` : undefined}
              />
              {label && (
                <>
                  <rect x={lx - labelW / 2} y={ly - 7} width={labelW} height={11} rx={2} fill="hsl(var(--card))" />
                  <text x={lx} y={ly + 2} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {layout.nodes.map((n) => {
          const st = statusByName.get(keyOf(n.name));
          if (n.kind === 'actor') {
            return <StickFigure key={`a-${n.name}`} cx={n.x} cy={n.y} name={n.name} status={st} />;
          }
          return <UseCaseEllipse key={`u-${n.name}`} cx={n.x} cy={n.y} name={n.name} status={st} />;
        })}
      </svg>
    </div>
  );
}
