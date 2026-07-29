/**
 * Layout de casos de uso: bloques por actor, grilla 2 columnas real,
 * include/extend siempre al lado (misma fila), marco ajustado.
 */

export interface UcLayoutNode {
  name: string;
  kind: 'actor' | 'uc';
  x: number;
  y: number;
}

export interface UcLayoutResult {
  nodes: UcLayoutNode[];
  width: number;
  height: number;
  system: { x: number; y: number; w: number; h: number } | null;
}

const ACTOR_W = 64;
const UC_W = 168;
const UC_H = 52;
const COL_GAP = 28;
const ROW_GAP = 16;
const BLOCK_GAP = 48;
const ACTOR_GAP = 56;
const PAD = 16;
const SYSTEM_PAD = 14;

function keyOf(name: string): string {
  return name.toLowerCase();
}

export interface UcInputNode {
  name: string;
}

export interface UcInputEdge {
  source: string;
  target: string;
  kind: string;
}

function buildActorClusters(
  actors: UcInputNode[],
  useCases: UcInputNode[],
  edges: UcInputEdge[],
): { actor: UcInputNode | null; ucs: UcInputNode[] }[] {
  const actorKeys = new Set(actors.map((a) => keyOf(a.name)));
  const ucMap = new Map(useCases.map((u) => [keyOf(u.name), u]));
  const ucKeys = new Set(ucMap.keys());

  const actorToUCs = new Map<string, Set<string>>();
  actors.forEach((a) => actorToUCs.set(keyOf(a.name), new Set()));

  const related = new Map<string, Set<string>>();
  useCases.forEach((u) => related.set(keyOf(u.name), new Set()));

  for (const e of edges) {
    const s = keyOf(e.source);
    const t = keyOf(e.target);
    const kind = (e.kind || '').toLowerCase();
    if (kind === 'include' || kind === 'extend') {
      if (ucKeys.has(s) && ucKeys.has(t)) {
        related.get(s)?.add(t);
        related.get(t)?.add(s);
      }
      continue;
    }
    if (actorKeys.has(s) && ucKeys.has(t)) actorToUCs.get(s)?.add(t);
    if (actorKeys.has(t) && ucKeys.has(s)) actorToUCs.get(t)?.add(s);
  }

  const placed = new Set<string>();
  const clusters: { actor: UcInputNode | null; ucs: UcInputNode[] }[] = [];

  function collect(k: string, out: UcInputNode[]) {
    if (placed.has(k) || !ucMap.has(k)) return;
    placed.add(k);
    out.push(ucMap.get(k)!);
    for (const r of [...(related.get(k) || [])].sort()) collect(r, out);
  }

  for (const actor of actors) {
    const list: UcInputNode[] = [];
    for (const k of actorToUCs.get(keyOf(actor.name)) || []) collect(k, list);
    if (list.length > 0) clusters.push({ actor, ucs: list });
  }

  const orphans: UcInputNode[] = [];
  for (const u of useCases) collect(keyOf(u.name), orphans);
  if (orphans.length > 0) clusters.push({ actor: null, ucs: orphans });

  return clusters.filter((c) => c.ucs.length > 0);
}

/**
 * Hubs = sources de «include» (caso base estable, p.ej. registrar).
 * Satélites:
 * - include → target
 * - extend que toca un hub → el otro extremo (robustez si el XMI trae el extend al revés)
 * - extend sin hub → UML: source = extensión
 */
export function resolveUseCaseSatellites(edges: UcInputEdge[]): Set<string> {
  const hubs = new Set<string>();
  for (const e of edges) {
    if ((e.kind || '').toLowerCase() === 'include') hubs.add(keyOf(e.source));
  }

  const satellites = new Set<string>();
  for (const e of edges) {
    const kind = (e.kind || '').toLowerCase();
    const s = keyOf(e.source);
    const t = keyOf(e.target);
    if (kind === 'include') {
      satellites.add(t);
      continue;
    }
    if (kind !== 'extend') continue;
    if (hubs.has(s) && !hubs.has(t)) {
      satellites.add(t);
    } else if (hubs.has(t) && !hubs.has(s)) {
      satellites.add(s);
    } else {
      satellites.add(s); // UML: extensión → base
    }
  }
  return satellites;
}

/**
 * Normaliza edges de vista: extend siempre extensión → base cuando hay hub include.
 * Filtra asociaciones actor → satélite (como Astah).
 */
export function prepareUseCaseViewEdges(
  actorNames: string[],
  edges: UcInputEdge[],
): UcInputEdge[] {
  const actorKeys = new Set(actorNames.map((n) => keyOf(n)));
  const hubs = new Set<string>();
  for (const e of edges) {
    if ((e.kind || '').toLowerCase() === 'include') hubs.add(keyOf(e.source));
  }

  const normalized: UcInputEdge[] = edges.map((e) => {
    const kind = (e.kind || '').toLowerCase();
    if (kind !== 'extend') return e;
    const s = keyOf(e.source);
    const t = keyOf(e.target);
    // Si source es hub e include, el edge está al revés → invertir
    if (hubs.has(s) && !hubs.has(t)) {
      return { ...e, source: e.target, target: e.source, kind: 'extend' };
    }
    return { ...e, kind: 'extend' };
  });

  const satellites = resolveUseCaseSatellites(normalized);
  return normalized.filter((e) => {
    const kind = (e.kind || '').toLowerCase();
    if (kind === 'include' || kind === 'extend') return true;
    const s = keyOf(e.source);
    const t = keyOf(e.target);
    const actorToSat =
      (actorKeys.has(s) && satellites.has(t))
      || (actorKeys.has(t) && satellites.has(s));
    return !actorToSat;
  });
}

/**
 * Pares (baseIzq, sateliteDer) para include/extend:
 * - include: source=base → target=incluido
 * - extend: anclado al hub include si existe; si no, UML extensión→base
 * Orden: primero includes, luego extends (como Astah: historial arriba, generar abajo).
 */
function satellitePairs(
  edges: UcInputEdge[],
  ucKeys: Set<string>,
): Map<string, string[]> {
  const rightsOf = new Map<string, string[]>();
  const kindOfRight = new Map<string, 'include' | 'extend'>();
  const hubs = new Set<string>();
  for (const e of edges) {
    if ((e.kind || '').toLowerCase() === 'include') {
      const s = keyOf(e.source);
      if (ucKeys.has(s)) hubs.add(s);
    }
  }

  function add(left: string, right: string, kind: 'include' | 'extend') {
    if (left === right) return;
    if (!ucKeys.has(left) || !ucKeys.has(right)) return;
    if (!rightsOf.has(left)) rightsOf.set(left, []);
    if (!rightsOf.get(left)!.includes(right)) rightsOf.get(left)!.push(right);
    kindOfRight.set(`${left}::${right}`, kind);
  }

  for (const e of edges) {
    const kind = (e.kind || '').toLowerCase();
    if (kind !== 'include' && kind !== 'extend') continue;
    const s = keyOf(e.source);
    const t = keyOf(e.target);
    if (!ucKeys.has(s) || !ucKeys.has(t)) continue;
    if (kind === 'include') {
      add(s, t, 'include');
      continue;
    }
    // extend: hub include = base (izq); el otro extremo = satélite
    if (hubs.has(s) && !hubs.has(t)) {
      add(s, t, 'extend');
    } else if (hubs.has(t) && !hubs.has(s)) {
      add(t, s, 'extend');
    } else {
      add(t, s, 'extend'); // UML: target=base, source=extensión
    }
  }

  for (const [left, rights] of rightsOf) {
    rights.sort((a, b) => {
      const ka = kindOfRight.get(`${left}::${a}`) || 'extend';
      const kb = kindOfRight.get(`${left}::${b}`) || 'extend';
      if (ka === kb) return a.localeCompare(b);
      return ka === 'include' ? -1 : 1;
    });
  }
  return rightsOf;
}

/**
 * Grilla: siempre 2 columnas si N>=3.
 * Izquierda = bases / asociados al actor; derecha = include/extend en la misma fila.
 */
function placeClusterGrid(
  ucs: UcInputNode[],
  edges: UcInputEdge[],
  originX: number,
  originY: number,
  primaryKeys: Set<string>,
): { positions: Map<string, { x: number; y: number }>; height: number; width: number } {
  const positions = new Map<string, { x: number; y: number }>();
  const ucKeys = new Set(ucs.map((u) => keyOf(u.name)));
  const rightsOf = satellitePairs(edges, ucKeys);

  const satelliteSet = new Set<string>();
  for (const rights of rightsOf.values()) rights.forEach((r) => satelliteSet.add(r));

  const useTwoCols = ucs.length >= 3 || satelliteSet.size > 0;

  if (!useTwoCols) {
    ucs.forEach((u, i) => {
      positions.set(keyOf(u.name), {
        x: originX + UC_W / 2,
        y: originY + i * (UC_H + ROW_GAP) + UC_H / 2,
      });
    });
    return {
      positions,
      height: ucs.length * UC_H + Math.max(ucs.length - 1, 0) * ROW_GAP,
      width: UC_W,
    };
  }

  // Orden de filas izquierdas: primarios que no son solo satélites, luego el resto no colocado.
  const leftOrder: string[] = [];
  const seenLeft = new Set<string>();

  for (const u of ucs) {
    const k = keyOf(u.name);
    if (!primaryKeys.has(k)) continue;
    if (satelliteSet.has(k) && !rightsOf.has(k)) continue; // solo satélite → derecha
    leftOrder.push(k);
    seenLeft.add(k);
  }
  for (const u of ucs) {
    const k = keyOf(u.name);
    if (seenLeft.has(k) || satelliteSet.has(k)) continue;
    leftOrder.push(k);
    seenLeft.add(k);
  }
  // Bases que solo aparecen como left de un pair
  for (const left of rightsOf.keys()) {
    if (!seenLeft.has(left) && ucKeys.has(left)) {
      leftOrder.push(left);
      seenLeft.add(left);
    }
  }

  const placed = new Set<string>();
  let row = 0;
  let usedRightCol = false;

  for (const left of leftOrder) {
    if (placed.has(left)) continue;
    const y = originY + row * (UC_H + ROW_GAP) + UC_H / 2;
    positions.set(left, { x: originX + UC_W / 2, y });
    placed.add(left);

    const rights = (rightsOf.get(left) || []).filter((r) => ucKeys.has(r) && !placed.has(r));
    if (rights.length > 0) {
      // Primera satélite en la misma fila; extras en filas siguientes a la derecha
      positions.set(rights[0], { x: originX + UC_W + COL_GAP + UC_W / 2, y });
      placed.add(rights[0]);
      usedRightCol = true;
      for (let i = 1; i < rights.length; i++) {
        row += 1;
        const y2 = originY + row * (UC_H + ROW_GAP) + UC_H / 2;
        positions.set(rights[i], { x: originX + UC_W + COL_GAP + UC_W / 2, y: y2 });
        placed.add(rights[i]);
      }
    }
    row += 1;
  }

  // Quedaron sin colocar (satélites huérfanos, etc.)
  for (const u of ucs) {
    const k = keyOf(u.name);
    if (placed.has(k)) continue;
    const y = originY + row * (UC_H + ROW_GAP) + UC_H / 2;
    if (satelliteSet.has(k) || usedRightCol) {
      positions.set(k, { x: originX + UC_W + COL_GAP + UC_W / 2, y });
      usedRightCol = true;
    } else {
      positions.set(k, { x: originX + UC_W / 2, y });
    }
    placed.add(k);
    row += 1;
  }

  // Si hay ≥3 y nadie usó la derecha, repartir en 2 columnas zigzag
  if (ucs.length >= 3 && !usedRightCol) {
    positions.clear();
    ucs.forEach((u, i) => {
      const col = i % 2;
      const r = Math.floor(i / 2);
      positions.set(keyOf(u.name), {
        x: originX + col * (UC_W + COL_GAP) + UC_W / 2,
        y: originY + r * (UC_H + ROW_GAP) + UC_H / 2,
      });
    });
    const rows = Math.ceil(ucs.length / 2);
    return {
      positions,
      height: rows * UC_H + Math.max(rows - 1, 0) * ROW_GAP,
      width: UC_W * 2 + COL_GAP,
    };
  }

  return {
    positions,
    height: row * UC_H + Math.max(row - 1, 0) * ROW_GAP,
    width: usedRightCol || ucs.length >= 3 ? UC_W * 2 + COL_GAP : UC_W,
  };
}

export function layoutUseCaseDiagram(
  actors: UcInputNode[],
  useCases: UcInputNode[],
  edges: UcInputEdge[],
): UcLayoutResult {
  if (actors.length === 0 && useCases.length === 0) {
    return { nodes: [], width: 200, height: 80, system: null };
  }

  const clusters = buildActorClusters(actors, useCases, edges);
  const nodes: UcLayoutNode[] = [];

  const actorKeys = new Set(actors.map((a) => keyOf(a.name)));
  const primaryByActor = new Map<string, Set<string>>();
  actors.forEach((a) => primaryByActor.set(keyOf(a.name), new Set()));
  const allPrimary = new Set<string>();
  for (const e of edges) {
    const kind = (e.kind || '').toLowerCase();
    if (kind === 'include' || kind === 'extend') continue;
    const s = keyOf(e.source);
    const t = keyOf(e.target);
    if (actorKeys.has(s)) {
      primaryByActor.get(s)?.add(t);
      allPrimary.add(t);
    }
    if (actorKeys.has(t)) {
      primaryByActor.get(t)?.add(s);
      allPrimary.add(s);
    }
  }

  const systemLeft = PAD + ACTOR_W + ACTOR_GAP;
  let cursorY = PAD + SYSTEM_PAD;
  let maxUcRight = systemLeft + SYSTEM_PAD;
  let minUcTop = Number.POSITIVE_INFINITY;
  let maxUcBottom = 0;

  for (let ci = 0; ci < clusters.length; ci++) {
    if (ci > 0) cursorY += BLOCK_GAP;
    const cluster = clusters[ci];
    const primaryKeys = cluster.actor
      ? (primaryByActor.get(keyOf(cluster.actor.name)) || allPrimary)
      : allPrimary;
    const grid = placeClusterGrid(
      cluster.ucs,
      edges,
      systemLeft + SYSTEM_PAD,
      cursorY,
      primaryKeys,
    );

    for (const [k, p] of grid.positions) {
      const u = cluster.ucs.find((x) => keyOf(x.name) === k);
      if (!u) continue;
      nodes.push({ name: u.name, kind: 'uc', x: p.x, y: p.y });
      maxUcRight = Math.max(maxUcRight, p.x + UC_W / 2);
      minUcTop = Math.min(minUcTop, p.y - UC_H / 2);
      maxUcBottom = Math.max(maxUcBottom, p.y + UC_H / 2);
    }

    if (cluster.actor) {
      const ys = [...grid.positions.values()].map((p) => p.y);
      const actorY = ys.length > 0
        ? ys.reduce((s, y) => s + y, 0) / ys.length
        : cursorY + grid.height / 2;
      nodes.push({
        name: cluster.actor.name,
        kind: 'actor',
        x: PAD + ACTOR_W / 2,
        y: actorY,
      });
    }

    cursorY += Math.max(grid.height, 48);
  }

  if (!Number.isFinite(minUcTop)) minUcTop = PAD + SYSTEM_PAD;

  const placedActors = new Set(nodes.filter((n) => n.kind === 'actor').map((n) => keyOf(n.name)));
  let orphanActorY = PAD + 40;
  for (const a of actors) {
    if (placedActors.has(keyOf(a.name))) continue;
    nodes.push({ name: a.name, kind: 'actor', x: PAD + ACTOR_W / 2, y: orphanActorY });
    orphanActorY += 72;
  }

  const sysY = Math.max(PAD, minUcTop - SYSTEM_PAD);
  const system = useCases.length > 0
    ? {
        x: systemLeft,
        y: sysY,
        w: Math.max(maxUcRight - systemLeft + SYSTEM_PAD, UC_W + SYSTEM_PAD * 2),
        h: maxUcBottom - sysY + SYSTEM_PAD,
      }
    : null;

  const actorBottom = Math.max(
    ...nodes.filter((n) => n.kind === 'actor').map((n) => n.y + 40),
    PAD,
  );
  const width = (system ? system.x + system.w : systemLeft + UC_W) + PAD;
  const height = Math.max(system ? system.y + system.h : cursorY, actorBottom) + PAD;

  return { nodes, width, height, system };
}

export const UC_LAYOUT_CONST = { UC_W, UC_H, ACTOR_W, PAD };
