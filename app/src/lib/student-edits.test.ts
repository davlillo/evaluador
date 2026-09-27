// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { withSheetEdits } from '@/lib/student-edits';
import type { ClassRubricResult, ComparisonResult } from '@/types/comparison';
import type { GlobalRunSummary, GlobalStudentResult } from '@/types/evaluation-session';

const multiplicidad = (ruleId: string, correct: boolean): ClassRubricResult => ({
  rule_id: ruleId,
  criterion_type: 'multiplicity',
  label: `Multiplicidad 1 en ${ruleId}`,
  group_label: 'Asociación Sala - Butaca',
  weight: 50,
  expected: '1',
  modeled: correct ? '1' : '*',
  score: correct ? 100 : 0,
  contribution: correct ? 50 : 0,
  correct,
  message: '',
});

const faltante = (kind: 'usecase' | 'sequence'): GlobalRunSummary => ({
  diagram_type: kind,
  status: 'missing',
  similarity: null,
});

function estudiante(extra: Partial<GlobalStudentResult['runs']> = {}, finalScore = 50): GlobalStudentResult {
  const comparison = {
    overall_similarity: 50,
    class_rubric_breakdown: [multiplicidad('Sala', true), multiplicidad('Butaca', false)],
  } as unknown as ComparisonResult;
  return {
    student_id: 'RM25034',
    complete: true,
    final_score: finalScore,
    runs: {
      class: { diagram_type: 'class', status: 'ok', similarity: 50, comparison },
      usecase: faltante('usecase'),
      sequence: faltante('sequence'),
      ...extra,
    },
  };
}

const soloClases = { class: 100, usecase: 0, sequence: 0 };

describe('withSheetEdits', () => {
  it('sin correcciones devuelve el mismo estudiante', () => {
    const alumno = estudiante();

    expect(withSheetEdits(alumno, {}, {}, soloClases)).toBe(alumno);
  });

  it('sin diagrama de clases no hay hoja que aplicar', () => {
    const alumno = estudiante({ class: { diagram_type: 'class', status: 'missing', similarity: null } });

    expect(withSheetEdits(alumno, { Butaca: 1 }, {}, soloClases)).toBe(alumno);
  });

  it('la nota del acta es la de la hoja cuando solo se evaluó clases', () => {
    const editado = withSheetEdits(estudiante(), { Butaca: 1 }, {}, soloClases);

    expect(editado.final_score).toBe(100);
    expect(editado.runs.class.similarity).toBe(100);
    expect(editado.runs.class.comparison?.class_rubric_breakdown?.[1].edited_by_teacher).toBe(true);
  });

  it('con otros diagramas evaluados solo cambia el aporte de clases', () => {
    const conCasosDeUso = estudiante(
      { usecase: { diagram_type: 'usecase', status: 'ok', similarity: 80 } },
      62,
    );

    const editado = withSheetEdits(conCasosDeUso, { Butaca: 1 }, {}, { class: 40, usecase: 60, sequence: 0 });

    // clases pasa de 50 a 100 y pesa 40 de 100: +20 puntos
    expect(editado.final_score).toBe(82);
    expect(editado.runs.usecase).toBe(conCasosDeUso.runs.usecase);
  });

  it('no modifica el estudiante original', () => {
    const alumno = estudiante();

    withSheetEdits(alumno, { Butaca: 1 }, {}, soloClases);

    expect(alumno.final_score).toBe(50);
    expect(alumno.runs.class.comparison?.class_rubric_breakdown?.[1].modeled).toBe('*');
  });
});
