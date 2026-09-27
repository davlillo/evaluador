// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveRubricFromSolution,
  evaluationProfileJson,
  importRubricFromExcel,
  relationshipsTotal,
  rubricIsValid,
  rubricTotal,
  withExpectedMultiplicity,
} from '@/lib/teacher-rubric';
import type { ClassRubricRule } from '@/lib/scoring-modes';

const clases: ClassRubricRule = {
  ruleId: 'clases',
  criterionType: 'classes',
  label: 'Clases',
  weight: 20,
  expectedQuantity: 6,
};

const multiplicidad: ClassRubricRule = {
  ruleId: 'rel1-source',
  criterionType: 'multiplicity',
  label: 'Multiplicidad 1 en Sala',
  groupLabel: 'Asociación Sala - Butaca',
  weight: 80,
  source: 'Sala',
  target: 'Butaca',
  multiplicityEnd: 'source',
  expectedMultiplicity: '1',
};

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pesos de la rúbrica', () => {
  it('suma los pesos e ignora los que no son números', () => {
    expect(rubricTotal([clases, multiplicidad])).toBe(100);
    expect(rubricTotal([clases, { ...multiplicidad, weight: Number.NaN }])).toBe(20);
  });

  it('es válida solo si tiene criterios y suma 100', () => {
    expect(rubricIsValid([clases, multiplicidad])).toBe(true);
    expect(rubricIsValid([clases])).toBe(false);
    expect(rubricIsValid([])).toBe(false);
  });

  it('la sección Relaciones pesa todo lo que no es Clases', () => {
    expect(relationshipsTotal([clases, multiplicidad])).toBe(80);
  });
});

describe('withExpectedMultiplicity', () => {
  it('cambia la multiplicidad y reescribe la etiqueta para que diga lo mismo', () => {
    const regla = withExpectedMultiplicity(multiplicidad, '1 .. *');

    expect(regla.expectedMultiplicity).toBe('1..*');
    expect(regla.label).toBe('Multiplicidad 1..* en Sala');
  });

  it('deja la etiqueta si no tiene el formato del docente', () => {
    const regla = withExpectedMultiplicity({ ...multiplicidad, label: 'Extremo Sala' }, '*');

    expect(regla).toMatchObject({ expectedMultiplicity: '*', label: 'Extremo Sala' });
  });
});

describe('evaluationProfileJson', () => {
  it('manda las reglas en snake_case con el modo de la rúbrica del docente', () => {
    const payload = JSON.parse(evaluationProfileJson([multiplicidad]));

    expect(payload.mode).toBe('expected_with_penalty');
    expect(payload.class_rules[0]).toMatchObject({
      rule_id: 'rel1-source',
      criterion_type: 'multiplicity',
      group_label: 'Asociación Sala - Butaca',
      weight: 80,
      relationship_type: 'association',
      multiplicity_end: 'source',
      expected_multiplicity: '1',
    });
  });
});

describe('importRubricFromExcel', () => {
  const excel = new File(['xlsx'], 'Rubrica 2EP.xlsx');

  it('traduce la respuesta del backend a reglas de la pantalla', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(200, {
      title: 'Turno3Impar',
      warnings: ['Se corrigió "Multiplicidd"'],
      class_rules: [{
        rule_id: 'clases', criterion_type: 'classes', label: 'Clases', group_label: null,
        weight: 20, expected_quantity: 6,
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const rubrica = await importRubricFromExcel(excel);

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/rubric\/import$/);
    expect(rubrica).toEqual({
      title: 'Turno3Impar',
      warnings: ['Se corrigió "Multiplicidd"'],
      origin: 'excel',
      rules: [expect.objectContaining({ ruleId: 'clases', criterionType: 'classes', expectedQuantity: 6 })],
    });
    expect(rubrica.rules[0].groupLabel).toBeUndefined();
  });

  it('muestra el detalle que manda el backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(400, { detail: 'La hoja no tiene la fila Clases.' })));

    await expect(importRubricFromExcel(excel)).rejects.toThrow('La hoja no tiene la fila Clases.');
  });

  it('junta la lista de errores de validación en un solo mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(422, { detail: { errors: ['Falta el %.', 'Peso negativo.'] } })));

    await expect(importRubricFromExcel(excel)).rejects.toThrow('Falta el %. Peso negativo.');
  });

  it('si el backend no explica, usa un mensaje propio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));

    await expect(importRubricFromExcel(excel)).rejects.toThrow('No se pudo leer la rúbrica.');
  });
});

describe('deriveRubricFromSolution', () => {
  it('titula la rúbrica con el nombre de la solución sin extensión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { class_rules: [] })));

    const rubrica = await deriveRubricFromSolution(new File(['<xmi/>'], 'CLAVEIMPAR.xmi'));

    expect(rubrica).toMatchObject({ title: 'CLAVEIMPAR', origin: 'solution', rules: [], warnings: [] });
  });
});
