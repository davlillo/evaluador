// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * La rúbrica del docente mientras la carga y la ajusta, antes de evaluar.
 *
 * Viene de su propio Excel (POST /api/rubric/import) o, si no tiene una,
 * se deriva del XMI de su solución (POST /api/rubric/from-solution). En los
 * dos casos termina siendo la misma lista de reglas que consume el motor.
 */
import {
  apiProfileToEvaluationProfile,
  evaluationProfileToApiPayload,
  type ClassRubricRule,
} from '@/lib/scoring-modes';
import { API_URL } from '@/lib/api';

export interface TeacherRubric {
  /** Nombre de la hoja del Excel ("Turno3Impar") o del archivo de solución. */
  title: string;
  rules: ClassRubricRule[];
  /** Lo que el sistema corrigió al leerla (typos, pesos que no suman 100). */
  warnings: string[];
  origin: 'excel' | 'solution';
}

type ApiRule = Parameters<typeof apiProfileToEvaluationProfile>[0]['class_rules'];

function rulesFromApi(classRules: ApiRule): ClassRubricRule[] {
  return apiProfileToEvaluationProfile({
    mode: 'expected_with_penalty',
    expected_counts: [],
    class_rules: classRules,
  }).classRules;
}

async function errorFrom(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const detail = payload?.detail;
  if (detail && Array.isArray(detail.errors)) return new Error(detail.errors.join(' '));
  if (typeof detail === 'string') return new Error(detail);
  return new Error(fallback);
}

export async function importRubricFromExcel(file: File): Promise<TeacherRubric> {
  const body = new FormData();
  body.append('rubric_file', file);
  const response = await fetch(API_URL + '/api/rubric/import', { method: 'POST', body });
  if (!response.ok) throw await errorFrom(response, 'No se pudo leer la rúbrica.');
  const data = await response.json();
  return {
    title: data.title,
    rules: rulesFromApi(data.class_rules),
    warnings: data.warnings ?? [],
    origin: 'excel',
  };
}

export async function deriveRubricFromSolution(file: File): Promise<TeacherRubric> {
  const body = new FormData();
  body.append('expected_file', file);
  const response = await fetch(API_URL + '/api/rubric/from-solution', { method: 'POST', body });
  if (!response.ok) throw await errorFrom(response, 'No se pudo leer la solución.');
  const data = await response.json();
  return {
    title: file.name.replace(/\.(xmi|xml|uml)$/i, ''),
    rules: rulesFromApi(data.class_rules),
    warnings: [],
    origin: 'solution',
  };
}

export interface RubricCheckResult {
  /** La nota que saca la propia solución con esta rúbrica (debería ser 10). */
  nota: number;
  issues: Array<{ rule_id: string; label: string; message: string }>;
}

/**
 * Evalúa la solución del docente con su propia rúbrica. Lo que no cumple ni
 * la solución es una rúbrica de otro turno o un criterio mal escrito.
 */
export async function checkRubricAgainstSolution(
  solution: File,
  rules: ClassRubricRule[],
): Promise<RubricCheckResult> {
  const body = new FormData();
  body.append('expected_file', solution);
  body.append('evaluation_profile_json', evaluationProfileJson(rules));
  const response = await fetch(API_URL + '/api/rubric/check', { method: 'POST', body });
  if (!response.ok) throw await errorFrom(response, 'No se pudo revisar la solución.');
  return response.json();
}

export function rubricTotal(rules: ClassRubricRule[]): number {
  return rules.reduce((sum, rule) => sum + (Number.isFinite(rule.weight) ? rule.weight : 0), 0);
}

/** Igual que valida el backend: los pesos tienen que sumar 100%. */
export function rubricIsValid(rules: ClassRubricRule[]): boolean {
  return rules.length > 0 && Math.abs(rubricTotal(rules) - 100) < 0.01;
}

/** Peso de la sección "Relaciones" de su hoja: todo lo que no es "Clases". */
export function relationshipsTotal(rules: ClassRubricRule[]): number {
  return rubricTotal(rules.filter((rule) => rule.criterionType !== 'classes'));
}

const MULTIPLICITY_LABEL = /^(Multiplicidad\s+)(\S+)(\s+en\s+.+)$/i;

/**
 * Cambia la multiplicidad esperada y reescribe la etiqueta para que diga
 * lo mismo ("Multiplicidad 1 en Sala" -> "Multiplicidad 1..* en Sala").
 */
export function withExpectedMultiplicity(rule: ClassRubricRule, value: string): ClassRubricRule {
  const clean = value.replace(/\s+/g, '');
  const match = rule.label.match(MULTIPLICITY_LABEL);
  return {
    ...rule,
    expectedMultiplicity: clean,
    label: match ? `${match[1]}${clean}${match[3]}` : rule.label,
  };
}

export function evaluationProfileJson(rules: ClassRubricRule[]): string {
  return JSON.stringify(evaluationProfileToApiPayload({
    mode: 'expected_with_penalty',
    expectedCounts: [],
    classRules: rules,
  }));
}
