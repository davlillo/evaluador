// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * Un estudiante del lote tal como quedó después de que el docente corrigió
 * su hoja. Es lo que tienen que mostrar las actas PDF, individuales y en ZIP:
 * la misma nota que la hoja y el Excel exportado.
 */
import { applySheetEdits, editedFinalScore, type ModeledOverrides, type SheetObservations } from '@/lib/grading-sheet';
import type { GlobalDiagramWeights, GlobalStudentResult } from '@/types/evaluation-session';

const KINDS = ['class', 'usecase', 'sequence'] as const;

export function withSheetEdits(
  student: GlobalStudentResult,
  overrides: ModeledOverrides,
  observations: SheetObservations,
  globalWeights: GlobalDiagramWeights,
): GlobalStudentResult {
  const run = student.runs.class;
  if (!run?.comparison) return student;
  const edited = applySheetEdits(run.comparison, overrides, observations);
  if (edited === run.comparison) return student;

  const evaluated = KINDS.filter((kind) => student.runs[kind]?.status === 'ok');
  const totalWeight = evaluated.reduce((sum, kind) => sum + (globalWeights[kind] ?? 0), 0);
  return {
    ...student,
    final_score: editedFinalScore(
      student.final_score,
      run.comparison.overall_similarity,
      edited.overall_similarity,
      globalWeights.class ?? 0,
      totalWeight,
    ),
    runs: {
      ...student.runs,
      class: { ...run, similarity: edited.overall_similarity, comparison: edited },
    },
  };
}
