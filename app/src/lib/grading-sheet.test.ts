// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
  applySheetEdits,
  buildGradingSheet,
  editedFinalScore,
  normalCurveFactor,
  rubricFeedback,
  weightsAreValid,
} from '@/lib/grading-sheet';
import type { ClassRubricResult, ComparisonResult } from '@/types/comparison';

function clases(expected: number, modeled: number, weight = 20): ClassRubricResult {
  return {
    rule_id: 'clases',
    criterion_type: 'classes',
    label: 'Clases',
    group_label: null,
    weight,
    expected,
    modeled,
    score: normalCurveFactor(expected, modeled) * 100,
    contribution: normalCurveFactor(expected, modeled) * weight,
    correct: expected === modeled,
    message: `Se esperaban ${expected} clases y el estudiante modeló ${modeled}.`,
  };
}

function multiplicidad(
  ruleId: string,
  correct: boolean,
  weight: number,
  group: string | null = 'Asociación Sala - Butaca',
): ClassRubricResult {
  return {
    rule_id: ruleId,
    criterion_type: 'multiplicity',
    label: `Multiplicidad 1 en ${ruleId}`,
    group_label: group,
    weight,
    expected: '1',
    modeled: correct ? '1' : '0..*',
    score: correct ? 100 : 0,
    contribution: correct ? weight : 0,
    correct,
    message: correct ? 'Multiplicidad correcta.' : 'Se esperaba 1.',
  };
}

function comparacion(breakdown: ClassRubricResult[], overall: number): ComparisonResult {
  return { overall_similarity: overall, class_rubric_breakdown: breakdown } as unknown as ComparisonResult;
}

describe('normalCurveFactor (la curva del docente)', () => {
  it('da el puntaje completo solo cuando las cantidades coinciden', () => {
    expect(normalCurveFactor(6, 6)).toBe(1);
  });

  it('castiga igual modelar de más que modelar de menos', () => {
    expect(normalCurveFactor(5, 10)).toBe(0.5);
    expect(normalCurveFactor(10, 5)).toBe(0.5);
  });

  it('no esperar nada y no modelar nada es cumplir', () => {
    expect(normalCurveFactor(0, 0)).toBe(1);
  });

  it('esperar algo y no modelar nada es cero', () => {
    expect(normalCurveFactor(1, 0)).toBe(0);
  });
});

describe('buildGradingSheet', () => {
  const breakdown = [
    clases(6, 10, 20),
    multiplicidad('Sala', true, 40),
    multiplicidad('Butaca', false, 40),
  ];

  it('calcula cada ponderada con min(E,M)/max(E,M) × peso y la nota sobre 10', () => {
    const sheet = buildGradingSheet(breakdown);

    expect(sheet.rows.map((row) => row.weightedScore)).toEqual([12, 40, 0]);
    expect(sheet.totalWeight).toBe(100);
    expect(sheet.nota).toBe(5.2);
  });

  it('muestra los criterios binarios como 1/0, igual que el Excel', () => {
    const sheet = buildGradingSheet(breakdown);

    expect(sheet.rows[1]).toMatchObject({ expected: 1, modeled: 1 });
    expect(sheet.rows[2]).toMatchObject({ expected: 1, modeled: 0 });
  });

  it('agrupa las multiplicidades bajo su encabezado y suma su peso', () => {
    const sheet = buildGradingSheet(breakdown);

    expect(sheet.groups.map((group) => [group.label, group.rows.length, group.weight])).toEqual([
      [null, 1, 20],
      ['Asociación Sala - Butaca', 2, 80],
    ]);
  });

  it('usa el Modelados que escribió el docente y conserva el del motor', () => {
    const sheet = buildGradingSheet(breakdown, { Butaca: 1 });

    expect(sheet.rows[2]).toMatchObject({ modeled: 1, autoModeled: 0, isOverridden: true, weightedScore: 40 });
    expect(sheet.nota).toBe(9.2);
    expect(sheet.overriddenCount).toBe(1);
  });

  it('respeta un override en cero aunque el motor lo diera por bueno', () => {
    const sheet = buildGradingSheet(breakdown, { Sala: 0 });

    expect(sheet.rows[1]).toMatchObject({ modeled: 0, isOverridden: true, weightedScore: 0 });
    expect(sheet.nota).toBe(1.2);
  });

  it('lleva las observaciones del docente a su fila', () => {
    const sheet = buildGradingSheet(breakdown, {}, { clases: 'Class2 es basura' });

    expect(sheet.rows[0].observation).toBe('Class2 es basura');
    expect(sheet.rows[1].observation).toBe('');
  });

  it('normaliza por el peso declarado mientras los % no suman 100', () => {
    const sheet = buildGradingSheet([multiplicidad('Sala', true, 30), multiplicidad('Butaca', true, 20)]);

    expect(sheet.totalWeight).toBe(50);
    expect(sheet.nota).toBe(10);
  });

  it('sin criterios la nota es cero', () => {
    expect(buildGradingSheet([]).nota).toBe(0);
  });
});

describe('weightsAreValid', () => {
  it('acepta 100 con tolerancia de redondeo y nada más', () => {
    expect(weightsAreValid(100)).toBe(true);
    expect(weightsAreValid(99.995)).toBe(true);
    expect(weightsAreValid(99.9)).toBe(false);
    expect(weightsAreValid(100.1)).toBe(false);
  });
});

describe('applySheetEdits (lo que ven las actas PDF)', () => {
  const breakdown = [clases(6, 6, 20), multiplicidad('Sala', true, 40), multiplicidad('Butaca', false, 40)];

  it('sin ediciones devuelve el mismo resultado, sin copiarlo', () => {
    const original = comparacion(breakdown, 60);

    expect(applySheetEdits(original, {}, {})).toBe(original);
  });

  it('recalcula la nota y marca la fila corregida por el docente', () => {
    const edited = applySheetEdits(comparacion(breakdown, 60), { Butaca: 1 }, {});
    const butaca = edited.class_rubric_breakdown?.find((row) => row.rule_id === 'Butaca');

    expect(edited.overall_similarity).toBe(100);
    expect(butaca).toMatchObject({
      modeled: 'Cumple',
      score: 100,
      contribution: 40,
      correct: true,
      edited_by_teacher: true,
    });
  });

  it('en Clases el override queda como número', () => {
    const edited = applySheetEdits(comparacion(breakdown, 60), { clases: 3 }, {});
    const fila = edited.class_rubric_breakdown?.find((row) => row.rule_id === 'clases');

    expect(fila).toMatchObject({ modeled: 3, score: 50, contribution: 10, correct: false });
  });

  it('una observación sola no cambia lo modelado ni cuenta como corrección', () => {
    const edited = applySheetEdits(comparacion(breakdown, 60), {}, { Sala: 'bien' });
    const sala = edited.class_rubric_breakdown?.find((row) => row.rule_id === 'Sala');

    expect(sala).toMatchObject({ modeled: '1', observation: 'bien', edited_by_teacher: false });
    expect(edited.overall_similarity).toBe(60);
  });

  it('sin rúbrica no hay nada que aplicar', () => {
    const original = comparacion([], 75);

    expect(applySheetEdits(original, { Sala: 1 }, {})).toBe(original);
  });
});

describe('rubricFeedback', () => {
  it('cuenta por relación, como agrupa el docente', () => {
    const feedback = rubricFeedback([
      clases(6, 10),
      multiplicidad('Sala', true, 20),
      multiplicidad('Butaca', false, 20),
      multiplicidad('Funcion', true, 20, 'Asociación Funcion - Pelicula'),
      multiplicidad('Pelicula', true, 20, 'Asociación Funcion - Pelicula'),
    ]);

    expect(feedback.met).toEqual(['Asociación Funcion - Pelicula']);
    expect(feedback.missing).toEqual([
      'Clases (modeló 10, se esperaban 6)',
      'Asociación Sala - Butaca (1 de 2)',
    ]);
  });
});

describe('editedFinalScore', () => {
  it('reemplaza solo el aporte del diagrama de clases en el promedio', () => {
    expect(editedFinalScore(80, 70, 90, 40, 100)).toBe(88);
  });

  it('si clases es el único diagrama, la nota global es la nueva', () => {
    expect(editedFinalScore(70, 70, 90, 100, 100)).toBe(90);
  });

  it('sin pesos válidos devuelve la nota de clases', () => {
    expect(editedFinalScore(50, 50, 65, 0, 0)).toBe(65);
  });
});
