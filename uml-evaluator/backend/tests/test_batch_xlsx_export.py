# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""
Tests del export a Excel de un lote (app.exporters.batch_xlsx), que
reemplaza al CSV plano anterior con 3 hojas: Notas, Detalle y Resumen.
"""
import io

import pytest
from openpyxl import load_workbook

from app.exporters.batch_xlsx import build_batch_xlsx


def _sample_batch():
    return {
        "results": [
            {
                "student_id": "AB12345",
                "status": "ok",
                "complete": True,
                "final_score": 88.5,
                "nota": 8.9,
                "runs": {
                    "class": {
                        "status": "ok",
                        "similarity": 90.0,
                        "comparison": {
                            "overall_similarity": 90.0,
                            "scoring_mode": "expected_with_penalty",
                            "breakdown": {
                                "classes": {"similarity": 66.67, "expected": 4, "found": 6, "correct": 4},
                            },
                            "penalty_breakdown": {
                                "classes": {
                                    "score": 66.67, "base_score": 100.0, "penalty_applied": 33.33,
                                    "expected_used": 4, "delivered": 6, "factor": 0.6667,
                                    "explanation": "curva",
                                },
                            },
                        },
                    },
                },
            },
            {
                "student_id": "CD67890",
                "status": "error",
                "complete": False,
                "final_score": 0.0,
                "error": "No se pudo parsear",
                "runs": {},
            },
        ],
        "global_weights_used": {"class": 40.0, "usecase": 35.0, "sequence": 25.0},
    }


class TestHojasPresentes:
    def test_genera_las_cuatro_hojas(self):
        content = build_batch_xlsx(_sample_batch())
        wb = load_workbook(io.BytesIO(content))
        assert wb.sheetnames == [
            "Hoja de calificación", "Notas", "Detalle", "Resumen",
        ]


class TestHojaNotas:
    def test_columnas_y_filas(self):
        content = build_batch_xlsx(_sample_batch())
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb["Notas"]
        header = [c.value for c in ws[1]]
        assert header[:4] == ["Carné", "Similitud (%)", "Nota (0-10)", "Estado"]

        row_ab = [c.value for c in ws[2]]
        assert row_ab[0] == "AB12345"
        assert row_ab[2] == 8.9
        assert row_ab[3] == "Completo"

        row_cd = [c.value for c in ws[3]]
        assert row_cd[0] == "CD67890"
        assert row_cd[3] == "Error"

    def test_override_de_nota_gana_sobre_la_del_backend(self):
        content = build_batch_xlsx(_sample_batch(), nota_overrides={"AB12345": 10.0})
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb["Notas"]
        row_ab = [c.value for c in ws[2]]
        assert row_ab[2] == 10.0


class TestHojaDetalle:
    def test_columnas_pedidas_explicitamente(self):
        content = build_batch_xlsx(_sample_batch())
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb["Detalle"]
        header = [c.value for c in ws[1]]
        assert header[:8] == [
            "Carné", "Diagrama", "Criterio", "Cantidad esperada", "Cantidad ingresada",
            "Diferencia", "Factor de penalización aplicado", "Puntaje obtenido",
        ]
        assert header[8:] == [
            "Tipo de criterio", "Tipo configurado", "Tipo detectado", "Clase origen", "Clase destino",
            "Extremo evaluado", "Peso (%)", "Aporte ponderado (%)", "Explicación",
        ]

    def test_fila_de_criterio_con_exceso(self):
        content = build_batch_xlsx(_sample_batch())
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb["Detalle"]
        row = [c.value for c in ws[2]]
        assert row[0] == "AB12345"
        assert row[3] == 4       # esperada
        assert row[4] == 6       # ingresada
        assert row[5] == 2       # diferencia (positiva = exceso)
        assert row[6] == pytest.approx(0.6667, abs=0.001)
        assert row[7] == pytest.approx(66.67, abs=0.01)

    def test_estudiante_con_error_no_genera_filas(self):
        content = build_batch_xlsx(_sample_batch())
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb["Detalle"]
        student_ids = [c.value for c in ws["A"] if c.row > 1]
        assert "CD67890" not in student_ids


class TestHojaResumen:
    def test_contiene_pesos_globales(self):
        content = build_batch_xlsx(_sample_batch())
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb["Resumen"]
        rows = {row[0].value: row[1].value for row in ws.iter_rows(min_row=2) if row[0].value}
        assert rows["Peso global — Clases (%)"] == 40.0
        assert rows["Estudiantes evaluados"] == 2


def _batch_con_rubrica():
    """Un lote con desglose de rúbrica, que es lo que alimenta la hoja del docente."""
    return {
        "results": [{
            "student_id": "MR23129",
            "status": "ok",
            "complete": True,
            "final_score": 52.0,
            "nota": 5.2,
            "runs": {"class": {"status": "ok", "similarity": 52.0, "comparison": {
                "overall_similarity": 52.0,
                "class_rubric_breakdown": [
                    {
                        "rule_id": "clases", "criterion_type": "classes", "label": "Clases",
                        "group_label": None, "weight": 20.0, "expected": 6, "modeled": 6,
                        "correct": True, "message": "Se esperaban 6 clases.",
                    },
                    {
                        "rule_id": "rel1-source", "criterion_type": "multiplicity",
                        "label": "Multiplicidad 1 en Afiliado",
                        "group_label": "Asociación Afiliado-Ganado", "weight": 8.0,
                        "expected": "1", "modeled": "1", "correct": True, "message": "ok",
                    },
                    {
                        "rule_id": "rel1-target", "criterion_type": "multiplicity",
                        "label": "Multiplicidad 1..* en Ganado",
                        "group_label": "Asociación Afiliado-Ganado", "weight": 8.0,
                        "expected": "1..*", "modeled": "1..*", "correct": True, "message": "ok",
                    },
                    {
                        "rule_id": "ac1", "criterion_type": "association_class",
                        "label": "Clase de asociación Ganado-Enfermedad",
                        "group_label": None, "weight": 64.0,
                        "expected": "Ganado–Enfermedad", "modeled": "No encontrada",
                        "correct": False, "message": "No se encontró.",
                    },
                ],
            }}},
        }],
        "global_weights_used": {"class": 100.0, "usecase": 0.0, "sequence": 0.0},
    }


class TestHojaDelDocente:
    """La primera hoja replica la rúbrica del 2EP: carné, fila en blanco,
    encabezado, Clases, sección Relaciones, grupos y Total."""

    def _hoja(self, **kwargs):
        wb = load_workbook(io.BytesIO(build_batch_xlsx(_batch_con_rubrica(), **kwargs)))
        return wb["Hoja de calificación"]

    def test_arma_un_bloque_por_estudiante_con_su_formato(self):
        ws = self._hoja()

        assert ws["A1"].value == "MR23129"
        assert ws["A2"].value is None
        assert [c.value for c in ws[3]] == [
            "Criterio", "%", "Esperados", "Modelados", "Nota ponderada", "Observaciones",
        ]
        assert [ws["A%d" % f].value for f in range(4, 11)] == [
            "Clases",
            "Relaciones",
            "Asociación Afiliado-Ganado",
            "Multiplicidad 1 en Afiliado",
            "Multiplicidad 1..* en Ganado",
            "Clase de asociación Ganado-Enfermedad",
            "Total",
        ]

    def test_escribe_la_formula_viva_del_docente(self):
        """Fórmulas, no valores: si corrige un Modelados en Excel, la nota
        se recalcula sola."""
        ws = self._hoja()

        assert ws["E4"].value == "=IF(C4>=D4,(D4/C4)*B4,IF(C4<D4,(C4/D4)*B4,0))"
        assert ws["E10"].value == "=SUM(E4:E9)/10"

    def test_los_pesos_van_en_porcentaje_como_en_su_hoja(self):
        ws = self._hoja()

        assert ws["B4"].value == pytest.approx(20)
        assert ws["B7"].value == pytest.approx(8)

    def test_relaciones_suma_y_el_total_no_cuenta_dos_veces(self):
        ws = self._hoja()

        assert ws["B5"].value == "=SUM(B6:B9)"
        assert ws["B10"].value == "=B4+B5"

    def test_el_encabezado_de_grupo_no_lleva_peso(self):
        ws = self._hoja()

        assert ws["A6"].value == "Asociación Afiliado-Ganado"
        assert ws["B6"].value is None and ws["C6"].value is None

    def test_respeta_los_modelados_que_corrigio_a_mano(self):
        ws = self._hoja(
            modeled_overrides={"MR23129": {"ac1": 1.0}},
            observations={"MR23129": {"ac1": "La modeló como Diagnostico."}},
        )

        assert ws["A9"].value == "Clase de asociación Ganado-Enfermedad"
        assert ws["D9"].value == 1.0
        assert ws["F9"].value == "La modeló como Diagnostico."

    def test_omite_a_quien_no_tiene_desglose_de_rubrica(self):
        wb = load_workbook(io.BytesIO(build_batch_xlsx(_sample_batch())))

        assert wb["Hoja de calificación"]["A1"].value is None


def test_el_excel_sale_firmado_por_el_equipo():
    wb = load_workbook(io.BytesIO(build_batch_xlsx(_sample_batch())))

    assert wb.properties.creator == "davlillos"
    firma = [fila for fila in wb["Resumen"].iter_rows(values_only=True) if fila[0] == "Generado con"]
    assert firma and "davlillos" in firma[0][1]
