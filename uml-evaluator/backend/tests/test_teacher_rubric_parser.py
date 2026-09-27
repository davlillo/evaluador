# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""La rúbrica en el formato propio del docente (su hoja de Excel).

Las dos del segundo parcial (test_files/rubricas/) son las reales que usa hoy;
calificacion_docente.xlsx es la de Práctica 1, con el formato viejo.
"""
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.parsers.rubric_parser import RubricParseError
from app.parsers.teacher_rubric_parser import parse_teacher_rubric_xlsx

TEST_FILES = Path(__file__).resolve().parent.parent / "test_files"
IMPAR = TEST_FILES / "rubricas" / "2EP_Turno3_Impar.xlsx"
PAR = TEST_FILES / "rubricas" / "2EP_Turno3_Par.xlsx"
PRACTICA_1 = TEST_FILES / "calibracion" / "calificacion_docente.xlsx"


def _por_etiqueta(rubrica, etiqueta):
    return [r for r in rubrica.rules if r.label == etiqueta]


def test_lee_la_rubrica_impar_completa():
    rubrica = parse_teacher_rubric_xlsx(str(IMPAR))

    assert rubrica.title == "Turno3Impar"
    assert len(rubrica.rules) == 12
    assert sum(r.weight for r in rubrica.rules) == pytest.approx(100.0)
    clases = rubrica.rules[0]
    assert (clases.criterion_type, clases.weight, clases.expected_quantity) == ("classes", 40.0, 6)
    assert rubrica.warnings == []


def test_la_asociacion_reflexiva_tiene_la_misma_clase_en_los_dos_extremos():
    rubrica = parse_teacher_rubric_xlsx(str(IMPAR))
    reflexiva = [r for r in rubrica.rules if r.group_label == "Asociación reflexiva Sala"]

    assert [(r.source, r.target, r.multiplicity_end) for r in reflexiva] == [
        ("Sala", "Sala", "source"),
        ("Sala", "Sala", "target"),
    ]


def test_el_extremo_sale_del_nombre_aunque_las_filas_vengan_en_otro_orden():
    """En "Asociación Funcion - Obra" el docente puso primero la de Obra."""
    rubrica = parse_teacher_rubric_xlsx(str(IMPAR))
    grupo = [r for r in rubrica.rules if r.group_label == "Asociación Funcion - Obra"]

    assert [(r.label, r.multiplicity_end) for r in grupo] == [
        ("Multiplicidad 1 en Obra", "target"),
        ("Multiplicidad 1..* en Funcion", "source"),
    ]


def test_toma_el_tipo_de_relacion_del_encabezado_aunque_falte_la_tilde():
    rubrica = parse_teacher_rubric_xlsx(str(PAR))
    tipos = {r.group_label: r.relationship_type for r in rubrica.rules if r.group_label}

    assert tipos["Composicion OdenServicio - TrabajoRealizado"] == "composition"
    assert tipos["Agregacion OrdenServicio - Repuesto"] == "aggregation"
    assert tipos["Asociación Cliente - Equipo"] == "association"


def test_corrige_el_typo_del_encabezado_y_lo_avisa():
    rubrica = parse_teacher_rubric_xlsx(str(PAR))
    composicion = [
        r for r in rubrica.rules
        if r.group_label == "Composicion OdenServicio - TrabajoRealizado"
    ]

    assert {r.source for r in composicion} == {"OrdenServicio"}
    assert any("OdenServicio" in aviso and "OrdenServicio" in aviso for aviso in rubrica.warnings)


def test_la_clase_de_asociacion_es_un_criterio_suelto():
    rubrica = parse_teacher_rubric_xlsx(str(PAR))
    [regla] = _por_etiqueta(rubrica, "Clase de asociacion Tecnico - OrdenServicio")

    assert regla.criterion_type == "association_class"
    assert (regla.source, regla.target, regla.weight) == ("Tecnico", "OrdenServicio", 10.0)
    assert regla.group_label is None


def test_el_formato_viejo_con_fracciones_se_lleva_a_porcentaje():
    rubrica = parse_teacher_rubric_xlsx(str(PRACTICA_1))

    assert rubrica.rules[0].weight == pytest.approx(20.0)
    assert sum(r.weight for r in rubrica.rules) == pytest.approx(100.0)
    # la hoja trae 21 estudiantes; solo se lee la rúbrica del primero
    assert len(rubrica.rules) == 10


def _hoja(tmp_path, filas):
    wb = Workbook()
    ws = wb.active
    ws.title = "Prueba"
    ws.append(["Criterio", "%", "Esperados", "Modelados", "Nota ponderada", "Observaciones"])
    for fila in filas:
        ws.append(fila)
    ruta = tmp_path / "rubrica.xlsx"
    wb.save(ruta)
    return str(ruta)


def test_avisa_si_los_pesos_no_suman_cien(tmp_path):
    ruta = _hoja(tmp_path, [
        ["Clases", 40, 5],
        ["Asociación A - B"],
        ["Multiplicidad 1 en A", 10, 1],
        ["Multiplicidad 1..* en B", 10, 1],
        ["Total"],
    ])

    rubrica = parse_teacher_rubric_xlsx(ruta)

    assert any("suman 60%" in aviso for aviso in rubrica.warnings)


def test_una_multiplicidad_sin_encabezado_es_un_error(tmp_path):
    ruta = _hoja(tmp_path, [
        ["Clases", 50, 5],
        ["Multiplicidad 1 en A", 50, 1],
    ])

    with pytest.raises(RubricParseError) as error:
        parse_teacher_rubric_xlsx(ruta)

    assert "no cuelga de ningún encabezado" in error.value.errors[0]


def test_un_criterio_desconocido_se_informa_con_su_fila(tmp_path):
    ruta = _hoja(tmp_path, [
        ["Clases", 50, 5],
        ["Atributos correctos", 50, 3],
    ])

    with pytest.raises(RubricParseError) as error:
        parse_teacher_rubric_xlsx(ruta)

    assert error.value.errors == ["Fila 3: no se reconoce el criterio «Atributos correctos»."]


def test_un_libro_sin_la_tabla_de_la_rubrica_es_un_error(tmp_path):
    wb = Workbook()
    wb.active.append(["Carné", "Nota"])
    ruta = tmp_path / "otra_cosa.xlsx"
    wb.save(ruta)

    with pytest.raises(RubricParseError):
        parse_teacher_rubric_xlsx(str(ruta))
