import type { Breakdown, ComparisonResult } from '@/types/comparison';
import { isUseCaseBreakdown, isSequenceBreakdown } from '@/types/comparison';
import { percentToNota } from '@/lib/rubric';

/** Una fila de la tabla de desglose por criterio del acta. */
export interface CriterionRow {
  label: string;
  similarity: number;
  weight: number;      // 0-100
  contribution: number; // similarity * weight / 100
}

const CLASS_LABELS: Record<string, string> = {
  classes: 'Clases',
  attributes: 'Atributos',
  methods: 'Métodos',
  relationships: 'Relaciones',
};
const USECASE_LABELS: Record<string, string> = {
  actors: 'Actores',
  use_cases: 'Casos de uso',
  actor_associations: 'Relaciones actor–CU',
  include_relations: 'Relaciones «include»',
  extend_relations: 'Relaciones «extend»',
};
const SEQ_LABELS: Record<string, string> = {
  sync_messages: 'Mensajes síncronos',
  async_messages: 'Mensajes asíncronos',
  creation_messages: 'Mensajes de creación',
  fragment_usage: 'Uso de fragmentos',
};

function sim(v: unknown): number {
  if (v && typeof v === 'object' && 'similarity' in v) {
    const s = (v as { similarity?: number }).similarity;
    return typeof s === 'number' ? s : 0;
  }
  return 0;
}

/**
 * Convierte el breakdown de un ComparisonResult en filas de criterio con pesos.
 * Los pesos salen de `weights_used` cuando existen; si no, se reparten equitativamente.
 */
export function criterionRows(result: ComparisonResult): CriterionRow[] {
  const b = result.breakdown;
  const weights = (result.weights_used || {}) as Record<string, number>;

  // Cada entry: [claveBreakdown, clavePeso, similitud, etiqueta].
  // En casos de uso el backend guarda los pesos con nombres LEGACY de clase
  // (actors→classes, use_cases→attributes, actor_associations→methods), por eso
  // la clave de peso difiere de la clave del breakdown.
  let entries: Array<[string, string, number, string]> = [];

  if (isUseCaseBreakdown(b)) {
    const uc = b as unknown as Record<string, unknown>;
    const UC_WEIGHT_KEY: Record<string, string> = {
      actors: 'classes',
      use_cases: 'attributes',
      actor_associations: 'methods',
      include_relations: 'include_relations',
      extend_relations: 'extend_relations',
    };
    entries = Object.keys(USECASE_LABELS)
      .filter((k) => uc[k])
      .map((k) => [k, UC_WEIGHT_KEY[k] ?? k, sim(uc[k]), USECASE_LABELS[k]]);
  } else if (isSequenceBreakdown(b)) {
    const sq = b as unknown as Record<string, unknown>;
    entries = Object.keys(SEQ_LABELS)
      .filter((k) => sq[k])
      .map((k) => [k, k, sim(sq[k]), SEQ_LABELS[k]]);
  } else {
    const cl = b as Breakdown;
    entries = (['classes', 'attributes', 'methods', 'relationships'] as const)
      .filter((k) => cl[k])
      .map((k) => [k, k, sim(cl[k]), CLASS_LABELS[k]]);
  }

  // Pesos: usar weights_used (por su clave de peso) si están; si no, repartir 100/N.
  const total = entries.reduce((s, [, wk]) => s + (weights[wk] || 0), 0);
  const equal = entries.length > 0 ? 100 / entries.length : 0;

  return entries.map(([, wk, similarity, label]) => {
    const weight = total > 0 ? Math.round(((weights[wk] || 0) / total) * 100) : Math.round(equal);
    return {
      label,
      similarity: Math.round(similarity * 10) / 10,
      weight,
      contribution: Math.round((similarity * weight) / 100 * 10) / 10,
    };
  });
}

/** Retroalimentación automática (fortalezas / faltantes) desde el breakdown. */
export function autoFeedback(result: ComparisonResult): { strengths: string[]; gaps: string[] } {
  const rows = criterionRows(result);
  const strengths = rows.filter((r) => r.similarity >= 80).map((r) => r.label);
  const gaps = rows.filter((r) => r.similarity < 60).map((r) => r.label);
  return { strengths, gaps };
}

/** Nota 0-10 y veredicto para un porcentaje global. */
export function verdict(pct: number): { nota: number; aprobado: boolean } {
  const nota = percentToNota(pct);
  return { nota, aprobado: nota >= 6 };
}
