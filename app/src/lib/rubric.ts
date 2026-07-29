/**
 * Fuente única de verdad de la rúbrica de evaluación (frontend).
 *
 * Reúne los pesos por tipo de diagrama, los pesos inter-diagrama y la conversión
 * de porcentaje de similitud a nota 0-10. Antes esto vivía duplicado en
 * `UploadPage.DEFAULT_WEIGHTS`, `lib/weights-diagram.ts` y `WeightsByDiagramType.tsx`.
 */

export interface TypeWeights {
  classes: number;
  attributes: number;
  methods: number;
  relationships: number;
  sync_messages?: number;
  async_messages?: number;
  creation_messages?: number;
  fragment_usage?: number;
  include_relations?: number;
  extend_relations?: number;
}

export interface GlobalDiagramWeights {
  class: number;
  usecase: number;
  sequence: number;
}

export const DIAGRAM_TYPES = [
  { key: 'class', label: 'Diagrama de Clases' },
  { key: 'usecase', label: 'Casos de Uso' },
  { key: 'sequence', label: 'Diagrama de Secuencia' },
] as const;

export const DEFAULT_WEIGHTS: Record<string, TypeWeights> = {
  class: { classes: 35, attributes: 25, methods: 25, relationships: 15 },
  sequence: {
    classes: 0, attributes: 0, methods: 0, relationships: 0,
    sync_messages: 35, async_messages: 20, creation_messages: 15,
    fragment_usage: 30,
  },
  usecase: {
    classes: 15,
    attributes: 25,
    methods: 25,
    include_relations: 20,
    extend_relations: 15,
    relationships: 0,
  },
};

export const DEFAULT_GLOBAL_WEIGHTS: GlobalDiagramWeights = {
  class: 40,
  usecase: 35,
  sequence: 25,
};

/** Nota mínima para aprobar (escala 0-10), configurable a futuro por rúbrica. */
export const DEFAULT_NOTA_APROBACION = 6.0;

/** Convierte un porcentaje de similitud 0-100 a nota 0-10 (1 decimal). */
export function percentToNota(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round((clamped / 10) * 10) / 10;
}

export function isAprobado(nota: number, umbral = DEFAULT_NOTA_APROBACION): boolean {
  return nota >= umbral;
}
