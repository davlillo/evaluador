/**
 * Configuración de una sesión de evaluación (incl. evaluación global multi-diagrama).
 */

import type { DiagramKind } from '@/types/diagram';
import type { ComparisonResult } from '@/types/comparison';

export type EvaluationMode = 'single' | 'global';
export type XmiSource = 'astah' | 'visual_paradigm';

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

export interface GlobalRunSummary {
  diagram_type: DiagramKind;
  status: 'ok' | 'missing' | 'error';
  similarity: number | null;
  error?: string;
  student_file?: string | null;
  comparison?: ComparisonResult;
}

export interface GlobalStudentResult {
  student_id: string;
  complete: boolean;
  final_score: number;
  runs: {
    class: GlobalRunSummary;
    usecase: GlobalRunSummary;
    sequence: GlobalRunSummary;
  };
}

export interface GlobalComparisonResponse {
  xmi_source_used: XmiSource;
  global_weights_used: GlobalDiagramWeights;
  students_total: number;
  students_complete: number;
  students_incomplete: number;
  results: GlobalStudentResult[];
}
