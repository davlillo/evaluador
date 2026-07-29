import type { DiagramLifeline, DiagramMessage } from '@/types/comparison';

const ACTOR_NAME_HINTS = [
  'actor', 'usuario', 'user', 'paciente', 'doctor', 'medico', 'médico',
  'administrador', 'admin', 'operador', 'cliente', 'cliente', 'nurse',
  'enfermero', 'recepcionista', 'secretaria',
];

export function isActorLifeline(ll: DiagramLifeline): boolean {
  const r = (ll.represents || '').toLowerCase();
  const n = (ll.name || '').toLowerCase();
  if (r.includes('actor')) return true;
  return ACTOR_NAME_HINTS.some((h) => n === h || n.includes(h));
}

function keyOf(name: string): string {
  return name.toLowerCase();
}

/** Primera aparición como emisor (prioritario) y como cualquier extremo. */
function firstAppearance(messages: DiagramMessage[]): {
  asSource: Map<string, number>;
  any: Map<string, number>;
} {
  const ordered = [...messages].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const asSource = new Map<string, number>();
  const any = new Map<string, number>();
  ordered.forEach((m, i) => {
    const s = keyOf(m.source_lifeline);
    const t = keyOf(m.target_lifeline);
    if (!asSource.has(s)) asSource.set(s, i);
    if (!any.has(s)) any.set(s, i);
    if (!any.has(t)) any.set(t, i);
  });
  return { asSource, any };
}

function countRtl(
  order: DiagramLifeline[],
  messages: DiagramMessage[],
): { rtl: number; ltr: number } {
  const idx = new Map(order.map((ll, i) => [keyOf(ll.name), i]));
  let rtl = 0;
  let ltr = 0;
  for (const m of messages) {
    const a = idx.get(keyOf(m.source_lifeline));
    const b = idx.get(keyOf(m.target_lifeline));
    if (a == null || b == null || a === b) continue;
    if (a > b) rtl += 1;
    else ltr += 1;
  }
  return { rtl, ltr };
}

/**
 * Reordena lifelines: actores a la izquierda (por primera aparición),
 * luego objetos por primera aparición. Si la mayoría de mensajes quedan
 * derecha→izquierda, invierte el orden una vez.
 */
export function layoutSequenceDiagram(
  lifelines: DiagramLifeline[],
  messages: DiagramMessage[],
): DiagramLifeline[] {
  if (lifelines.length <= 1) return [...lifelines];

  const appear = firstAppearance(messages);
  const byAppear = (a: DiagramLifeline, b: DiagramLifeline) => {
    // Preferir quien inicia mensajes (asSource), luego cualquier aparición.
    const ia = appear.asSource.get(keyOf(a.name)) ?? appear.any.get(keyOf(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const ib = appear.asSource.get(keyOf(b.name)) ?? appear.any.get(keyOf(b.name)) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name);
  };

  const actors = lifelines.filter(isActorLifeline).sort(byAppear);
  const objects = lifelines.filter((ll) => !isActorLifeline(ll)).sort((a, b) => {
    const ia = appear.any.get(keyOf(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const ib = appear.any.get(keyOf(b.name)) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name);
  });

  let ordered = [...actors, ...objects];

  // Lifelines sin mensajes al final, manteniendo actores antes.
  const mentioned = new Set<string>();
  for (const m of messages) {
    mentioned.add(keyOf(m.source_lifeline));
    mentioned.add(keyOf(m.target_lifeline));
  }
  const unusedActors = actors.filter((ll) => !mentioned.has(keyOf(ll.name)));
  const unusedObjects = objects.filter((ll) => !mentioned.has(keyOf(ll.name)));
  const usedActors = actors.filter((ll) => mentioned.has(keyOf(ll.name)));
  const usedObjects = objects.filter((ll) => mentioned.has(keyOf(ll.name)));
  ordered = [...usedActors, ...usedObjects, ...unusedActors, ...unusedObjects];

  const { rtl, ltr } = countRtl(ordered, messages);
  if (rtl > ltr && rtl > 0) {
    ordered = [...ordered].reverse();
  }

  return ordered;
}
