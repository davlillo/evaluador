import type { DiagramClass, DiagramRelationship } from '@/types/comparison';

export interface ClassBoxPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClassEdgeRoute {
  points: { x: number; y: number }[];
  /** índice de la relación original */
  relIndex: number;
  /** lado de anclaje en source / target (para multiplicidades) */
  startSide: 'l' | 'r' | 't' | 'b';
  endSide: 'l' | 'r' | 't' | 'b';
}

export interface ClassLayoutResult {
  positions: Map<string, ClassBoxPos>;
  routes: ClassEdgeRoute[];
  width: number;
  height: number;
}

const BOX_W = 190;
const ROW_H = 18;
const HEADER_H = 30;
const COL_GAP = 72;
const ROW_GAP = 88;
const PAD = 32;
/** Margen inferior para que el baseline del último texto no quede fuera. */
const BOX_BOTTOM_PAD = 16;

function keyOf(name: string): string {
  return name.toLowerCase();
}

/**
 * Fusiona clases duplicadas por nombre (case-insensitive).
 * Evita dos cajas `cita`/`Cita` en el mismo sitio (una vacía tapa a la llena).
 */
export function mergeClassesByName(classes: DiagramClass[]): DiagramClass[] {
  const byKey = new Map<string, DiagramClass>();

  for (const cls of classes) {
    const k = keyOf(cls.name);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, {
        ...cls,
        attributes: [...(Array.isArray(cls.attributes) ? cls.attributes : [])],
        methods: [...(Array.isArray(cls.methods) ? cls.methods : [])],
      });
      continue;
    }

    const attrNames = new Set(
      existing.attributes.map((a) => (a.name || '').toLowerCase()).filter(Boolean),
    );
    for (const a of cls.attributes || []) {
      const n = (a.name || '').toLowerCase();
      if (!n || attrNames.has(n)) continue;
      existing.attributes.push(a);
      attrNames.add(n);
    }

    const methodNames = new Set(
      existing.methods.map((m) => (m.name || '').toLowerCase()).filter(Boolean),
    );
    for (const m of cls.methods || []) {
      const n = (m.name || '').toLowerCase();
      if (!n || methodNames.has(n)) continue;
      existing.methods.push(m);
      methodNames.add(n);
    }

    existing.is_abstract = existing.is_abstract || cls.is_abstract;
    existing.is_interface = existing.is_interface || cls.is_interface;
    if (!existing.stereotype && cls.stereotype) existing.stereotype = cls.stereotype;
    if (!existing.package && cls.package) existing.package = cls.package;
    // Preferir el nombre con mayúscula inicial si el actual es todo minúsculas
    if (existing.name === existing.name.toLowerCase() && cls.name !== cls.name.toLowerCase()) {
      existing.name = cls.name;
    }
  }

  return [...byKey.values()];
}

/** Altura de caja según contenido (compartida por layout y ClassSvg). */
export function measureClassBox(cls: DiagramClass): {
  attrRows: number;
  methodRows: number;
  height: number;
} {
  const attrs = Array.isArray(cls.attributes)
    ? cls.attributes.filter((a) => (a.name || '').trim())
    : [];
  const methods = Array.isArray(cls.methods)
    ? cls.methods.filter((m) => (m.name || '').trim())
    : [];
  const attrRows = Math.max(attrs.length, 1);
  const methodRows = Math.max(methods.length, 1);
  return {
    attrRows,
    methodRows,
    height: HEADER_H + attrRows * ROW_H + methodRows * ROW_H + BOX_BOTTOM_PAD,
  };
}

function boxHeight(cls: DiagramClass): number {
  return measureClassBox(cls).height;
}

/** Capas por herencia: 0 = raíces (padres). */
function computeLayers(
  classes: DiagramClass[],
  relationships: DiagramRelationship[],
): Map<string, number> {
  const names = new Set(classes.map((c) => keyOf(c.name)));
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();

  for (const rel of relationships) {
    const t = (rel.relationship_type || '').toLowerCase();
    if (t !== 'inheritance' && t !== 'generalization') continue;
    const child = keyOf(rel.source);
    const parent = keyOf(rel.target);
    if (!names.has(child) || !names.has(parent)) continue;
    parentOf.set(child, parent);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(child);
  }

  const layer = new Map<string, number>();
  function depth(k: string, seen: Set<string>): number {
    if (layer.has(k)) return layer.get(k)!;
    if (seen.has(k)) return 0;
    seen.add(k);
    const p = parentOf.get(k);
    const d = p && names.has(p) ? depth(p, seen) + 1 : 0;
    layer.set(k, d);
    return d;
  }
  for (const c of classes) depth(keyOf(c.name), new Set());

  // Clases sin herencia: debajo de sus vecinos con herencia (no subir a capa 0).
  const connected = new Map<string, Set<string>>();
  for (const c of classes) connected.set(keyOf(c.name), new Set());
  for (const rel of relationships) {
    const s = keyOf(rel.source);
    const t = keyOf(rel.target);
    if (!names.has(s) || !names.has(t)) continue;
    connected.get(s)?.add(t);
    connected.get(t)?.add(s);
  }

  const maxInh = Math.max(0, ...[...layer.values()]);
  for (const c of classes) {
    const k = keyOf(c.name);
    if (parentOf.has(k) || (childrenOf.get(k)?.length ?? 0) > 0) continue;
    const neigh = [...(connected.get(k) || [])];
    if (neigh.length === 0) {
      layer.set(k, maxInh + 1);
      continue;
    }
    const neighLayers = neigh.map((n) => layer.get(n) ?? 0);
    const maxN = Math.max(...neighLayers);
    // Preferir una capa bajo el vecino más bajo (evita Medicamento al lado de Persona).
    layer.set(k, Math.min(maxInh + 2, Math.max(1, maxN + 1)));
  }

  return layer;
}

/** Orden barycenter dentro de cada capa (2 pasadas). */
function orderLayers(
  layers: Map<number, string[]>,
  relationships: DiagramRelationship[],
  names: Set<string>,
): Map<number, string[]> {
  const maxLayer = Math.max(...layers.keys(), 0);
  const result = new Map<number, string[]>();
  for (const [lv, arr] of layers) result.set(lv, [...arr]);

  const edges: [string, string][] = [];
  for (const rel of relationships) {
    const s = keyOf(rel.source);
    const t = keyOf(rel.target);
    if (names.has(s) && names.has(t) && s !== t) edges.push([s, t]);
  }

  function indexInLayer(lv: number): Map<string, number> {
    const arr = result.get(lv) || [];
    return new Map(arr.map((n, i) => [n, i]));
  }

  function barySort(lv: number, neighborLayer: number, fromAbove: boolean) {
    const arr = result.get(lv);
    if (!arr || arr.length <= 1) return;
    const neighIdx = indexInLayer(neighborLayer);
    const scored = arr.map((name) => {
      const neighbors: number[] = [];
      for (const [a, b] of edges) {
        if (fromAbove) {
          if (b === name && neighIdx.has(a)) neighbors.push(neighIdx.get(a)!);
          if (a === name && neighIdx.has(b)) neighbors.push(neighIdx.get(b)!);
        } else {
          if (a === name && neighIdx.has(b)) neighbors.push(neighIdx.get(b)!);
          if (b === name && neighIdx.has(a)) neighbors.push(neighIdx.get(a)!);
        }
      }
      const bary = neighbors.length > 0
        ? neighbors.reduce((s, v) => s + v, 0) / neighbors.length
        : indexInLayer(lv).get(name) ?? 0;
      return { name, bary };
    });
    scored.sort((a, b) => a.bary - b.bary || a.name.localeCompare(b.name));
    result.set(lv, scored.map((s) => s.name));
  }

  // Down then up passes
  for (let pass = 0; pass < 2; pass++) {
    for (let lv = 1; lv <= maxLayer; lv++) barySort(lv, lv - 1, true);
    for (let lv = maxLayer - 1; lv >= 0; lv--) barySort(lv, lv + 1, false);
  }

  return result;
}

const PORT_SEP = 20;

function boxEdgePoint(
  from: ClassBoxPos,
  toCenter: { x: number; y: number },
  portOffset = 0,
): { x: number; y: number; side: 'l' | 'r' | 't' | 'b' } {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const dx = toCenter.x - cx;
  const dy = toCenter.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy, side: 'r' };

  const hw = from.w / 2;
  const hh = from.h / 2;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  let x = cx + dx * t;
  let y = cy + dy * t;
  let side: 'l' | 'r' | 't' | 'b' = 'r';
  if (t === sx) side = dx > 0 ? 'r' : 'l';
  else side = dy > 0 ? 'b' : 't';

  // Separar puertos a lo largo del lado (hubs como cita con 3+ aristas)
  if (side === 'l' || side === 'r') y += portOffset * PORT_SEP;
  else x += portOffset * PORT_SEP;

  // Clamp dentro del lado
  y = Math.max(from.y + 8, Math.min(from.y + from.h - 8, y));
  x = Math.max(from.x + 8, Math.min(from.x + from.w - 8, x));
  return { x, y, side };
}

/** Offset simétrico: 0, +1, -1, +2, -2… */
function portOffsetIndex(n: number): number {
  if (n === 0) return 0;
  return n % 2 === 1 ? Math.ceil(n / 2) : -Math.ceil(n / 2);
}

function sideToward(
  from: ClassBoxPos,
  toCenter: { x: number; y: number },
): 'l' | 'r' | 't' | 'b' {
  return boxEdgePoint(from, toCenter, 0).side;
}

function orthogonalRoute(
  a: ClassBoxPos,
  b: ClassBoxPos,
  portA: number,
  portB: number,
  kind?: string,
): { points: { x: number; y: number }[]; startSide: 'l' | 'r' | 't' | 'b'; endSide: 'l' | 'r' | 't' | 'b' } {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };

  // Herencia: hijo (a) abajo → padre (b) arriba, canal entre filas.
  if (kind === 'inheritance' || kind === 'generalization') {
    const childTop = { x: a.x + a.w / 2 + portA * PORT_SEP, y: a.y };
    const parentBot = { x: b.x + b.w / 2 + portB * PORT_SEP, y: b.y + b.h };
    const midY = (childTop.y + parentBot.y) / 2;
    const points = Math.abs(childTop.x - parentBot.x) < 6
      ? [childTop, parentBot]
      : [
          childTop,
          { x: childTop.x, y: midY },
          { x: parentBot.x, y: midY },
          parentBot,
        ];
    return { points, startSide: 't', endSide: 'b' };
  }

  const p1 = boxEdgePoint(a, bc, portA);
  const p2 = boxEdgePoint(b, ac, portB);

  if (Math.abs(p1.y - p2.y) < 6 || Math.abs(p1.x - p2.x) < 6) {
    return { points: [p1, p2], startSide: p1.side, endSide: p2.side };
  }

  // Canal horizontal en el hueco entre cajas (mitad del gap vertical).
  const aBottom = a.y + a.h;
  const bTop = b.y;
  const aTop = a.y;
  const bBottom = b.y + b.h;
  let channelY: number;
  if (aBottom < bTop) {
    channelY = (aBottom + bTop) / 2;
  } else if (bBottom < aTop) {
    channelY = (bBottom + aTop) / 2;
  } else {
    channelY = (p1.y + p2.y) / 2;
  }

  return {
    points: [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: channelY },
      { x: p2.x, y: channelY },
      { x: p2.x, y: p2.y },
    ],
    startSide: p1.side,
    endSide: p2.side,
  };
}

export function layoutClassDiagram(
  classes: DiagramClass[],
  relationships: DiagramRelationship[],
): ClassLayoutResult {
  const merged = mergeClassesByName(classes);
  if (merged.length === 0) {
    return { positions: new Map(), routes: [], width: 200, height: 80 };
  }

  const byKey = new Map(merged.map((c) => [keyOf(c.name), c]));
  const names = new Set(byKey.keys());
  const layerOf = computeLayers(merged, relationships);

  const byLayer = new Map<number, string[]>();
  for (const c of merged) {
    const k = keyOf(c.name);
    const lv = layerOf.get(k) ?? 0;
    if (!byLayer.has(lv)) byLayer.set(lv, []);
    byLayer.get(lv)!.push(k);
  }
  for (const [lv, arr] of byLayer) {
    arr.sort((a, b) => (byKey.get(a)?.name ?? a).localeCompare(byKey.get(b)?.name ?? b));
    byLayer.set(lv, arr);
  }

  const ordered = orderLayers(byLayer, relationships, names);
  const sortedLevels = [...ordered.keys()].sort((a, b) => a - b);

  const positions = new Map<string, ClassBoxPos>();
  let yCursor = PAD;
  let maxCols = 1;

  for (const lv of sortedLevels) {
    const row = ordered.get(lv) || [];
    maxCols = Math.max(maxCols, row.length);
    const heights = row.map((k) => boxHeight(byKey.get(k)!));
    const rowH = Math.max(...heights, HEADER_H);
    // Centrar filas cortas
    const rowWidth = row.length * BOX_W + Math.max(row.length - 1, 0) * COL_GAP;
    const fullWidth = maxCols * BOX_W + Math.max(maxCols - 1, 0) * COL_GAP;
    const xOffset = PAD + Math.max(0, (fullWidth - rowWidth) / 2);

    row.forEach((k, col) => {
      positions.set(k, {
        x: xOffset + col * (BOX_W + COL_GAP),
        y: yCursor,
        w: BOX_W,
        h: heights[col],
      });
    });
    yCursor += rowH + ROW_GAP;
  }

  // Contar puertos por (clase, lado) para hubs con varias aristas al mismo borde.
  const portCount = new Map<string, number>();
  const routes: ClassEdgeRoute[] = [];

  relationships.forEach((rel, relIndex) => {
    const a = positions.get(keyOf(rel.source));
    const b = positions.get(keyOf(rel.target));
    if (!a || !b) return;
    const ka = keyOf(rel.source);
    const kb = keyOf(rel.target);
    const kind = (rel.relationship_type || '').toLowerCase();
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };

    let sideA: 'l' | 'r' | 't' | 'b';
    let sideB: 'l' | 'r' | 't' | 'b';
    if (kind === 'inheritance' || kind === 'generalization') {
      sideA = 't';
      sideB = 'b';
    } else {
      sideA = sideToward(a, bc);
      sideB = sideToward(b, ac);
    }

    const keyA = `${ka}:${sideA}`;
    const keyB = `${kb}:${sideB}`;
    const pa = portCount.get(keyA) ?? 0;
    const pb = portCount.get(keyB) ?? 0;
    portCount.set(keyA, pa + 1);
    portCount.set(keyB, pb + 1);

    const routed = orthogonalRoute(a, b, portOffsetIndex(pa), portOffsetIndex(pb), kind);
    routes.push({
      relIndex,
      points: routed.points,
      startSide: routed.startSide,
      endSide: routed.endSide,
    });
  });

  const width = PAD + maxCols * BOX_W + Math.max(maxCols - 1, 0) * COL_GAP + PAD;
  let maxBottom = PAD;
  for (const p of positions.values()) {
    maxBottom = Math.max(maxBottom, p.y + p.h);
  }
  const height = Math.max(yCursor, maxBottom) + PAD;

  return { positions, routes, width, height };
}

export const CLASS_LAYOUT_CONST = { BOX_W, ROW_H, HEADER_H };
