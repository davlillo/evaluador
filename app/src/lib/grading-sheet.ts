// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * La hoja de calificación del docente, tal cual su Excel.
 *
 *   Criterio | % | Esperados | Modelados | Nota ponderada | Observación
 *
 * con `nota ponderada = min(E,M)/max(E,M) × peso` y `Total = Σ ponderadas × 10`
 * (la fórmula literal de su celda:
 * `=IF(C>=D,(D/C)*B,IF(C<D,(C/D)*B,0))`).
 *
 * El motor rellena la columna "Modelados", pero el docente la puede corregir:
 * hay juicio suyo que ninguna heurística reproduce (descarta clases basura,
 * reconoce que `Ganadero` es el `Afiliado` de su solución). Por eso el override
 * manual no es un extra, es parte del diseño.
 *
 * Espejo de `_calculate_class_rubric` en
 * `uml-evaluator/backend/app/comparator/uml_comparator.py`.
 */
import type { ClassRubricResult, ComparisonResult } from '@/types/comparison';

/** Modelados que el docente escribió a mano, por regla. */
export type ModeledOverrides = Record<string, number>;

/** Observaciones que el docente escribió a mano, por regla. */
export type SheetObservations = Record<string, string>;

export interface GradingSheetRow {
  ruleId: string;
  criterionType: string;
  /** Encabezado del grupo ("Asociación Afiliado-Ganado"), si cuelga de uno. */
  groupLabel: string | null;
  label: string;
  /** Peso en porcentaje (0-100). */
  weight: number;
  expected: number;
  /** Lo que se está usando para calcular: el override si existe, si no el automático. */
  modeled: number;
  /** Lo que detectó el motor, para poder volver atrás. */
  autoModeled: number;
  isOverridden: boolean;
  /** Aporte a la nota final, en la misma escala que el peso. */
  weightedScore: number;
  /** Detalle que redactó el motor (multiplicidad hallada, tipo de relación...). */
  autoMessage: string;
  observation: string;
}

export interface GradingSheetGroup {
  label: string | null;
  rows: GradingSheetRow[];
  /** Suma de los pesos de las filas del grupo, como el encabezado del Excel. */
  weight: number;
}

export interface GradingSheet {
  rows: GradingSheetRow[];
  groups: GradingSheetGroup[];
  /** Suma de los pesos declarados; debería dar 100. */
  totalWeight: number;
  /** Nota final 0-10. */
  nota: number;
  /** Cuántas filas trae el docente corregidas a mano. */
  overriddenCount: number;
}

/**
 * La curva del docente: máximo puntaje solo si las cantidades coinciden, y
 * baja igual de rápido si el estudiante entregó de más o de menos.
 */
export function normalCurveFactor(expected: number, modeled: number): number {
  const hi = Math.max(expected, modeled);
  if (hi <= 0) return 1;
  return Math.min(expected, modeled) / hi;
}

export function weightedScore(expected: number, modeled: number, weight: number): number {
  return normalCurveFactor(expected, modeled) * weight;
}

/** Los criterios binarios se muestran como 1/0, igual que en su Excel. */
function autoModeledFor(row: ClassRubricResult): number {
  if (row.criterion_type === 'classes') {
    const modeled = Number(row.modeled);
    return Number.isFinite(modeled) ? modeled : 0;
  }
  return row.correct ? 1 : 0;
}

function expectedFor(row: ClassRubricResult): number {
  if (row.criterion_type === 'classes') {
    const expected = Number(row.expected);
    return Number.isFinite(expected) ? expected : 0;
  }
  return 1;
}

export function buildGradingSheet(
  breakdown: ClassRubricResult[],
  overrides: ModeledOverrides = {},
  observations: SheetObservations = {},
): GradingSheet {
  const rows: GradingSheetRow[] = breakdown.map((row) => {
    const expected = expectedFor(row);
    const autoModeled = autoModeledFor(row);
    const override = overrides[row.rule_id];
    const isOverridden = Number.isFinite(override);
    const modeled = isOverridden ? (override as number) : autoModeled;

    return {
      ruleId: row.rule_id,
      criterionType: row.criterion_type,
      groupLabel: row.group_label ?? null,
      label: row.label,
      weight: row.weight,
      expected,
      modeled,
      autoModeled,
      isOverridden,
      weightedScore: weightedScore(expected, modeled, row.weight),
      autoMessage: row.message,
      observation: observations[row.rule_id] ?? '',
    };
  });

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const earned = rows.reduce((sum, row) => sum + row.weightedScore, 0);
  // se normaliza por el peso declarado para que la nota siga teniendo sentido
  // mientras el docente está a medio ajustar los porcentajes
  const nota = totalWeight > 0 ? (earned / totalWeight) * 10 : 0;

  return {
    rows,
    groups: groupRows(rows),
    totalWeight,
    nota: Math.round(nota * 100) / 100,
    overriddenCount: rows.filter((row) => row.isOverridden).length,
  };
}

/**
 * Agrupa como en el Excel: las dos multiplicidades de una relación van debajo
 * de su encabezado, y los criterios sueltos quedan cada uno en su grupo.
 */
function groupRows(rows: GradingSheetRow[]): GradingSheetGroup[] {
  const groups: GradingSheetGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && row.groupLabel !== null && last.label === row.groupLabel) {
      last.rows.push(row);
      last.weight += row.weight;
      continue;
    }
    groups.push({ label: row.groupLabel, rows: [row], weight: row.weight });
  }
  return groups;
}

/** Los pesos deben sumar 100, igual que valida la rúbrica en el backend. */
export function weightsAreValid(totalWeight: number): boolean {
  return Math.abs(totalWeight - 100) < 0.01;
}

/**
 * El resultado del motor con las correcciones de la hoja aplicadas.
 *
 * Lo usan las actas PDF: sin esto, el docente corrige una nota en la hoja,
 * el Excel sale con la corregida y el PDF con la del motor.
 */
export function applySheetEdits(
  comparison: ComparisonResult,
  overrides: ModeledOverrides,
  observations: SheetObservations,
): ComparisonResult {
  const breakdown = comparison.class_rubric_breakdown ?? [];
  const hasEdits = Object.keys(overrides).length > 0 || Object.keys(observations).length > 0;
  if (breakdown.length === 0 || !hasEdits) return comparison;

  const sheet = buildGradingSheet(breakdown, overrides, observations);
  const byRule = new Map(sheet.rows.map((row) => [row.ruleId, row]));
  return {
    ...comparison,
    overall_similarity: sheet.nota * 10,
    class_rubric_breakdown: breakdown.map((row) => {
      const edited = byRule.get(row.rule_id);
      if (!edited) return row;
      const factor = normalCurveFactor(edited.expected, edited.modeled);
      return {
        ...row,
        modeled: !edited.isOverridden
          ? row.modeled
          : row.criterion_type === 'classes'
            ? edited.modeled
            : edited.modeled >= 1 ? 'Cumple' : 'No cumple',
        score: factor * 100,
        contribution: edited.weightedScore,
        correct: factor >= 0.99999,
        observation: edited.observation || undefined,
        edited_by_teacher: edited.isOverridden,
      };
    }),
  };
}

/**
 * Qué cumplió y qué le faltó, contado por relación como lo agrupa el docente
 * ("Asociación reflexiva Sala: 1 de 2") y no criterio por criterio, donde
 * "Multiplicidad 1 en Sala" se repite sin decir de qué relación es.
 */
export function rubricFeedback(breakdown: ClassRubricResult[]): { met: string[]; missing: string[] } {
  const sheet = buildGradingSheet(breakdown);
  const met: string[] = [];
  const missing: string[] = [];
  for (const group of sheet.groups) {
    const full = group.rows.filter((row) => row.weightedScore >= row.weight - 1e-9).length;
    if (group.label) {
      if (full === group.rows.length) met.push(group.label);
      else missing.push(`${group.label} (${full} de ${group.rows.length})`);
      continue;
    }
    for (const row of group.rows) {
      if (row.weightedScore >= row.weight - 1e-9) {
        met.push(row.label);
      } else if (row.criterionType === 'classes') {
        missing.push(`${row.label} (modeló ${row.modeled}, se esperaban ${row.expected})`);
      } else {
        missing.push(row.label);
      }
    }
  }
  return { met, missing };
}

/**
 * La nota global cuando cambió la del diagrama de clases. Se reemplaza su
 * aporte en el promedio ponderado entre los diagramas que se evaluaron.
 */
export function editedFinalScore(
  finalScore: number,
  classScoreBefore: number,
  classScoreAfter: number,
  classWeight: number,
  totalWeight: number,
): number {
  if (totalWeight <= 0) return classScoreAfter;
  return finalScore + ((classScoreAfter - classScoreBefore) * classWeight) / totalWeight;
}
