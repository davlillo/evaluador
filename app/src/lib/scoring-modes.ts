/**
 * Tipos y constantes de los 4 modos de evaluación (ver
 * backend/app/comparator/scoring_modes.py). Distinto del `EvaluationMode`
 * de sesión ('single'|'global') en types/evaluation-session.ts — este es
 * el modo de CÁLCULO de score por criterio, no el modo de flujo de subida.
 *
 * Los modos "con descuento" usan la curva normal min(E,R)/max(E,R) — la
 * fórmula real del docente, sin parámetros de severidad configurables.
 */

export type ScoringMode =
  | 'similarity'
  | 'expected_no_penalty'
  | 'expected_with_penalty'
  | 'similarity_with_penalty';

export interface ExpectedCount {
  elementType: string;
  expectedQuantity: number;
  label?: string;
}

export interface EvaluationProfile {
  mode: ScoringMode;
  expectedCounts: ExpectedCount[];
}

export const DEFAULT_EVALUATION_PROFILE: EvaluationProfile = {
  mode: 'similarity',
  expectedCounts: [],
};

export const SCORING_MODE_LABELS: Record<ScoringMode, string> = {
  similarity: 'Similitud',
  expected_no_penalty: 'Cantidades esperadas (sin descuento)',
  expected_with_penalty: 'Cantidades esperadas (con descuento)',
  similarity_with_penalty: 'Similitud con descuento',
};

export const SCORING_MODE_DESCRIPTIONS: Record<ScoringMode, string> = {
  similarity: 'Compara el diagrama del estudiante contra la solución de referencia. El exceso ya se penaliza de forma implícita (F1-score).',
  expected_no_penalty: 'El profesor define cuántos elementos espera de cada tipo (clases, casos de uso, etc). Entregar de más no descuenta, solo importa cumplir lo mínimo.',
  expected_with_penalty: 'Igual al anterior, pero la cantidad entregada se compara con la esperada usando una curva: el puntaje máximo es solo cuando coinciden exactamente, y baja cuanto mayor sea la diferencia (de más o de menos).',
  similarity_with_penalty: 'Como el modo de similitud, pero además aplica la curva de cantidades: penaliza si el estudiante entrega más o menos elementos que el modelo de referencia.',
};

export const SCORING_MODES_USING_PENALTY: ScoringMode[] = [
  'expected_with_penalty', 'similarity_with_penalty',
];

export const SCORING_MODES_USING_EXPECTED_COUNTS: ScoringMode[] = [
  'expected_no_penalty', 'expected_with_penalty',
];

/** Serializa el perfil al shape snake_case que espera EvaluationProfileModel (backend). */
export function evaluationProfileToApiPayload(profile: EvaluationProfile) {
  return {
    mode: profile.mode,
    expected_counts: profile.expectedCounts.map((ec) => ({
      element_type: ec.elementType,
      expected_quantity: ec.expectedQuantity,
      label: ec.label,
    })),
  };
}

/** Traduce el preview snake_case devuelto por POST /api/rubric/parse a un EvaluationProfile por tipo de diagrama. */
export function apiProfileToEvaluationProfile(raw: {
  mode: string;
  expected_counts: { element_type: string; expected_quantity: number; label?: string | null }[];
}): EvaluationProfile {
  return {
    mode: raw.mode as ScoringMode,
    expectedCounts: raw.expected_counts.map((ec) => ({
      elementType: ec.element_type,
      expectedQuantity: ec.expected_quantity,
      label: ec.label ?? undefined,
    })),
  };
}

/** Etiquetas amigables por tipo de elemento, para las tablas de configuración. */
export const ELEMENT_TYPE_LABELS: Record<string, string> = {
  classes: 'Clases',
  attributes: 'Atributos totales',
  methods: 'Métodos totales',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  inheritance: 'Herencia',
  implementation: 'Implementación',
  actors: 'Actores',
  use_cases: 'Casos de uso',
  actor_associations: 'Relaciones actor-CU',
  include_relations: 'Include',
  extend_relations: 'Extend',
  lifelines: 'Líneas de vida',
  sync_messages: 'Mensajes síncronos',
  async_messages: 'Mensajes asíncronos',
  creation_messages: 'Mensajes de creación',
  alt_fragments: 'Fragmentos alt',
  loop_fragments: 'Fragmentos loop',
};

export const ELEMENT_TYPES_BY_DIAGRAM: Record<'class' | 'usecase' | 'sequence', string[]> = {
  class: ['classes', 'attributes', 'methods', 'association', 'aggregation', 'composition', 'inheritance', 'implementation'],
  usecase: ['actors', 'use_cases', 'actor_associations', 'include_relations', 'extend_relations'],
  sequence: ['lifelines', 'sync_messages', 'async_messages', 'creation_messages', 'alt_fragments', 'loop_fragments'],
};
