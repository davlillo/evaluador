/**
 * Fuente única de los colores/umbrales de estado de comparación.
 * Usa los tokens semánticos definidos en index.css (match/partial/mismatch/extra),
 * en vez de colores literales de Tailwind (text-green-500, text-red-500, …).
 */

export type DiffStatus = 'match' | 'partial' | 'mismatch' | 'extra';

/** Umbral de similitud (0-100) → token de estado. */
export function statusFromPercent(pct: number): DiffStatus {
  if (pct >= 80) return 'match';
  if (pct >= 50) return 'partial';
  return 'mismatch';
}

/** Clase de texto Tailwind para un token de estado. */
export function statusTextClass(status: DiffStatus): string {
  switch (status) {
    case 'match': return 'text-match';
    case 'partial': return 'text-partial';
    case 'extra': return 'text-extra';
    case 'mismatch':
    default: return 'text-mismatch';
  }
}

/** Clase de texto según porcentaje de similitud. */
export function percentTextClass(pct: number): string {
  return statusTextClass(statusFromPercent(pct));
}

/** Clase de fondo tenue + texto para chips/badges de estado. */
export function statusBadgeClass(status: DiffStatus): string {
  switch (status) {
    case 'match': return 'bg-match/15 text-match';
    case 'partial': return 'bg-partial/15 text-partial';
    case 'extra': return 'bg-extra/15 text-extra';
    case 'mismatch':
    default: return 'bg-mismatch/15 text-mismatch';
  }
}

/** Color CSS (hsl var) para usar en SVG stroke/fill. */
export function statusColorVar(status: DiffStatus): string {
  return `hsl(var(--${status}))`;
}
