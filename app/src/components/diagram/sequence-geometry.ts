// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import type { DiagramLifeline, DiagramMessage } from '@/types/comparison';
import { isActorLifeline, layoutSequenceDiagram } from '@/lib/diagram-layout/sequence';

/**
 * Geometría del diagrama de secuencia: medidas, fragmentos alt/loop y tamaño
 * natural. Vive aparte de SequenceSvg para que ese archivo solo exporte el
 * componente (Fast Refresh) y SequenceComparison pueda medir sin renderizar.
 */

export const LL_GAP = 128;
export const HEAD_W = 100;
export const HEAD_H = 34;
export const ACTOR_HEAD_H = 54;
export const MSG_GAP = 44;
export const FRAG_PAD_TOP = 18;
export const FRAG_PAD_BOT = 14;
export const PAD = 20;
export const TOP = 10;
export const EXEC_W = 10;
export const FRAG_X_MARGIN = 18;

function parseFragment(raw?: string | null): { op: string; guard: string; label: string } | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const m = s.match(/^(alt|loop|opt|par|break|critical)\b\s*(?:\[([^\]]*)\])?/i);
  if (m) {
    const op = m[1].toLowerCase();
    const guard = (m[2] || '').trim();
    return { op, guard, label: guard ? `${op} [${guard}]` : op };
  }
  const first = s.split(/[\s[]/)[0].toLowerCase();
  if (['alt', 'loop', 'opt', 'par', 'break', 'critical'].includes(first)) {
    return { op: first, guard: '', label: s };
  }
  return { op: 'frag', guard: '', label: s };
}

export interface FragSpan {
  label: string;
  op: string;
  startIdx: number;
  endIdx: number;
  depth: number;
}

export function buildFragmentSpans(messages: DiagramMessage[]): FragSpan[] {
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

export function headerBottom(ll: DiagramLifeline): number {
  return isActorLifeline(ll) ? TOP + ACTOR_HEAD_H : TOP + HEAD_H;
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
