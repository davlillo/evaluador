/**
 * Configuración de una sesión de evaluación (incl. evaluación global multi-diagrama).
 */

import type { DiagramKind } from '@/types/diagram';

export type EvaluationMode = 'single' | 'global';

/** Pesos del 100% global entre tipos de diagrama (futuro: varios ZIP). */
export interface GlobalDiagramWeights {
  class: number;
  usecase: number;
  sequence: number;
}

/** Una corrida dentro de una evaluación compuesta. */
export interface EvaluationRun {
  diagramKind: DiagramKind;
  /** Resultado de /api/compare cuando exista. */
  overallSimilarity?: number;
}

export interface CompositeEvaluationSession {
  mode: 'global';
  globalWeights: GlobalDiagramWeights;
  runs: EvaluationRun[];
}
