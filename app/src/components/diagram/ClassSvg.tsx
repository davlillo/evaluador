import { useId } from 'react';
import type { DiffStatus } from '@/lib/status-colors';
import type { DiagramClass, DiagramRelationship } from '@/types/comparison';
import {
  layoutClassDiagram,
  mergeClassesByName,
  measureClassBox,
  CLASS_LAYOUT_CONST,
} from '@/lib/diagram-layout/class';

/**
 * Renderer SVG de diagramas de clases: notación UML + motor de layout
 * (capas, barycenter, rutas ortogonales).
 */

export interface ClassDiff {
  status?: DiffStatus;
  missingAttrs?: Set<string>;
  extraAttrs?: Set<string>;
  missingMethods?: Set<string>;
  extraMethods?: Set<string>;
}

interface Props {
  classes: DiagramClass[];
  relationships: DiagramRelationship[];
  diff?: Map<string, ClassDiff>;
  side: 'expected' | 'student';
}

const { ROW_H, HEADER_H } = CLASS_LAYOUT_CONST;
const LABEL_BOX_PAD = 16;

function vis(v?: string): string {
  return v === 'public' ? '+' : v === 'private' ? '-' : v === 'protected' ? '#' : v === 'package' ? '~' : '+';
}

function stroke(status?: DiffStatus): string {
  if (!status || status === 'match') return 'hsl(var(--foreground))';
  return `hsl(var(--${status}))`;
}

function keyOf(name: string): string {
  return name.toLowerCase();
}

type EdgeSide = 'l' | 'r' | 't' | 'b';

/** Multiplicidad fuera de la caja según el lado de anclaje. */
function multiplicityPos(
  pt: { x: number; y: number },
  side: EdgeSide,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const gap = 12;
  switch (side) {
    case 't':
      return { x: pt.x, y: pt.y - gap, anchor: 'middle' };
    case 'b':
      return { x: pt.x, y: pt.y + gap + 4, anchor: 'middle' };
    case 'l':
      return { x: pt.x - gap, y: pt.y - 2, anchor: 'end' };
    case 'r':
      return { x: pt.x + gap, y: pt.y - 2, anchor: 'start' };
  }
}

function pointInBox(
  x: number,
  y: number,
  box: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  return (
    x >= box.x - pad
    && x <= box.x + box.w + pad
    && y >= box.y - pad
    && y <= box.y + box.h + pad
  );
}

/** Empuja el label del nombre lejos de cualquier caja de clase. */
function placeRelName(
  midX: number,
  midY: number,
  ox: number,
  oy: number,
  boxes: Iterable<{ x: number; y: number; w: number; h: number }>,
): { x: number; y: number } {
  let x = midX;
  let y = midY;
  for (let step = 0; step < 4; step++) {
    let hit = false;
    for (const box of boxes) {
      if (pointInBox(x, y, box, LABEL_BOX_PAD)) {
        hit = true;
        break;
      }
    }
    if (!hit) break;
    // Empujar más en la dirección perpendicular (canal) y un poco a lo largo
    x += ox * (step + 1);
    y += oy * (step + 1);
    if (Math.abs(oy) >= Math.abs(ox)) {
      y += (oy >= 0 ? 1 : -1) * 10 * (step + 1);
    } else {
      x += (ox >= 0 ? 1 : -1) * 10 * (step + 1);
    }
  }
  return { x, y };
}

export function ClassSvg({ classes, relationships, diff, side }: Props) {
  const uid = useId().replace(/:/g, '');

  const mergedClasses = mergeClassesByName(classes);
  if (mergedClasses.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Sin clases para mostrar</p>;
  }

  const layout = layoutClassDiagram(mergedClasses, relationships);
  const strokeColor = 'hsl(var(--muted-foreground))';
  const routeByRel = new Map(layout.routes.map((r) => [r.relIndex, r]));
  const boxes = [...layout.positions.values()];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        style={{ maxWidth: Math.max(layout.width, 320), minWidth: Math.min(layout.width, 280) }}
        role="img"
        aria-label="Diagrama de clases"
      >
        <defs>
          <marker id={`cls-gen-${uid}`} markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L12,6 L0,12 Z" fill="hsl(var(--card))" stroke={strokeColor} strokeWidth={1} />
          </marker>
          <marker id={`cls-dep-${uid}`} markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L11,5 L0,10" fill="none" stroke={strokeColor} strokeWidth={1.2} />
          </marker>
          <marker id={`cls-agg-${uid}`} markerWidth="14" markerHeight="10" refX="1" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,5 L7,0 L14,5 L7,10 Z" fill="hsl(var(--card))" stroke={strokeColor} strokeWidth={1} />
          </marker>
          <marker id={`cls-comp-${uid}`} markerWidth="14" markerHeight="10" refX="1" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,5 L7,0 L14,5 L7,10 Z" fill={strokeColor} stroke={strokeColor} strokeWidth={1} />
          </marker>
          <marker id={`cls-assoc-${uid}`} markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,5 L0,10" fill="none" stroke={strokeColor} strokeWidth={1.2} />
          </marker>
        </defs>

        {relationships.map((rel, i) => {
          const route = routeByRel.get(i);
          if (!route || route.points.length < 2) return null;
          const pts = route.points;
          const kind = (rel.relationship_type || 'association').toLowerCase();

          let markerStart: string | undefined;
          let markerEnd: string | undefined;
          let dashed = false;

          if (kind === 'inheritance' || kind === 'generalization') {
            markerEnd = `url(#cls-gen-${uid})`;
          } else if (kind === 'implementation') {
            markerEnd = `url(#cls-gen-${uid})`;
            dashed = true;
          } else if (kind === 'dependency') {
            markerEnd = `url(#cls-dep-${uid})`;
            dashed = true;
          } else if (kind === 'aggregation') {
            markerStart = `url(#cls-agg-${uid})`;
          } else if (kind === 'composition') {
            markerStart = `url(#cls-comp-${uid})`;
          } else if (kind === 'association') {
            markerEnd = `url(#cls-assoc-${uid})`;
          }

          const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          const midIdx = Math.floor((pts.length - 1) / 2);
          const midA = pts[midIdx];
          const midB = pts[Math.min(midIdx + 1, pts.length - 1)];
          const mdx = midB.x - midA.x;
          const mdy = midB.y - midA.y;
          const mlen = Math.hypot(mdx, mdy) || 1;
          // Offset perpendicular hacia el canal (fuera de la línea y de las cajas)
          const ox = (-mdy / mlen) * 14;
          const oy = (mdx / mlen) * 14;
          const rawMidX = (midA.x + midB.x) / 2 + ox;
          const rawMidY = (midA.y + midB.y) / 2 + oy;
          const namePos = placeRelName(rawMidX, rawMidY, ox, oy, boxes);
          const pFirst = pts[0];
          const pLast = pts[pts.length - 1];
          const srcMult = rel.source_multiplicity
            ? multiplicityPos(pFirst, route.startSide)
            : null;
          const tgtMult = rel.target_multiplicity
            ? multiplicityPos(pLast, route.endSide)
            : null;

          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeDasharray={dashed ? '5 4' : undefined}
                markerStart={markerStart}
                markerEnd={markerEnd}
              />
              {rel.name && (
                <text x={namePos.x} y={namePos.y} textAnchor="middle" fontSize={10} fill={strokeColor}>
                  {rel.name}
                </text>
              )}
              {srcMult && rel.source_multiplicity && (
                <text
                  x={srcMult.x}
                  y={srcMult.y}
                  textAnchor={srcMult.anchor}
                  fontSize={10}
                  fill={strokeColor}
                >
                  {rel.source_multiplicity}
                </text>
              )}
              {tgtMult && rel.target_multiplicity && (
                <text
                  x={tgtMult.x}
                  y={tgtMult.y}
                  textAnchor={tgtMult.anchor}
                  fontSize={10}
                  fill={strokeColor}
                >
                  {rel.target_multiplicity}
                </text>
              )}
            </g>
          );
        })}

        {mergedClasses.map((cls) => {
          const p = layout.positions.get(keyOf(cls.name));
          if (!p) return null;
          const d = diff?.get(keyOf(cls.name));
          const st = stroke(d?.status);
          const strike = d?.status === 'mismatch';
          const stereo = cls.is_interface ? '«interface»' : cls.is_abstract ? '«abstract»' : null;
          const attrs = (Array.isArray(cls.attributes) ? cls.attributes : [])
            .filter((a) => (a.name || '').trim());
          const methods = (Array.isArray(cls.methods) ? cls.methods : [])
            .filter((m) => (m.name || '').trim());
          const { attrRows, height: boxH } = measureClassBox(cls);
          const attrStart = p.y + HEADER_H;
          const attrEnd = attrStart + attrRows * ROW_H;
          return (
            <g key={keyOf(cls.name)}>
              <rect x={p.x} y={p.y} width={p.w} height={boxH} fill="hsl(var(--card))" stroke={st} strokeWidth={1.5} rx={2} />
              <rect x={p.x} y={p.y} width={p.w} height={HEADER_H} fill="hsl(var(--primary) / 0.06)" stroke="none" />
              {/* Separador nombre / atributos */}
              <line x1={p.x} y1={p.y + HEADER_H} x2={p.x + p.w} y2={p.y + HEADER_H} stroke={st} strokeWidth={1} />
              {stereo && (
                <text x={p.x + p.w / 2} y={p.y + 12} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{stereo}</text>
              )}
              <text
                x={p.x + p.w / 2}
                y={p.y + (stereo ? 24 : 20)}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={st}
                style={strike ? { textDecoration: 'line-through' } : undefined}
              >
                {cls.name}
              </text>
              {/* Separador atributos / métodos */}
              <line x1={p.x} y1={attrEnd} x2={p.x + p.w} y2={attrEnd} stroke={st} strokeWidth={1} />
              {attrs.map((at, i) => {
                const miss = side === 'expected' && d?.missingAttrs?.has(at.name.toLowerCase());
                const ext = side === 'student' && d?.extraAttrs?.has(at.name.toLowerCase());
                const c = miss ? 'hsl(var(--mismatch))' : ext ? 'hsl(var(--extra))' : 'hsl(var(--foreground))';
                return (
                  <text
                    key={`${at.name}-${i}`}
                    x={p.x + 8}
                    y={attrStart + i * ROW_H + 13}
                    fontSize={11}
                    fontFamily="ui-monospace, monospace"
                    fill={c}
                    style={miss ? { textDecoration: 'line-through' } : undefined}
                  >
                    {vis(at.visibility)}{at.name}{at.type ? `: ${at.type}` : ''}
                  </text>
                );
              })}
              {methods.map((m, i) => {
                const miss = side === 'expected' && d?.missingMethods?.has(m.name.toLowerCase());
                const ext = side === 'student' && d?.extraMethods?.has(m.name.toLowerCase());
                const c = miss ? 'hsl(var(--mismatch))' : ext ? 'hsl(var(--extra))' : 'hsl(var(--foreground))';
                return (
                  <text
                    key={`${m.name}-${i}`}
                    x={p.x + 8}
                    y={attrEnd + i * ROW_H + 13}
                    fontSize={11}
                    fontFamily="ui-monospace, monospace"
                    fill={c}
                    style={miss ? { textDecoration: 'line-through' } : undefined}
                  >
                    {vis(m.visibility)}{m.name}(){m.return_type ? `: ${m.return_type}` : ''}
                  </text>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
