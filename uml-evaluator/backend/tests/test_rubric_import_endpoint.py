# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""POST /api/rubric/import: el docente sube su Excel y recibe la tabla editable."""
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.routes.rubric import import_teacher_rubric
from tests.api_helpers import run, upload_bytes

RUBRICAS = Path(__file__).resolve().parent.parent / "test_files" / "rubricas"


def _importar(nombre):
    ruta = RUBRICAS / nombre
    return run(import_teacher_rubric(rubric_file=upload_bytes(ruta.name, ruta.read_bytes())))


def test_devuelve_las_reglas_con_todo_lo_que_el_motor_necesita():
    cuerpo = _importar("2EP_Turno3_Impar.xlsx")

    assert cuerpo["title"] == "Turno3Impar"
    multiplicidad = next(r for r in cuerpo["class_rules"] if r["criterion_type"] == "multiplicity")
    # sin estos campos el motor no sabe entre qué clases buscar la relación
    for campo in ("source", "target", "relationship_type", "multiplicity_end",
                  "expected_multiplicity", "group_label"):
        assert multiplicidad[campo], campo


def test_incluye_los_avisos_de_lo_que_se_corrigio():
    cuerpo = _importar("2EP_Turno3_Par.xlsx")

    assert any("OdenServicio" in aviso for aviso in cuerpo["warnings"])


def test_rechaza_lo_que_no_es_xlsx():
    with pytest.raises(HTTPException) as error:
        run(import_teacher_rubric(rubric_file=upload_bytes("rubrica.xmi", b"<xmi/>")))

    assert error.value.status_code == 400


def test_un_excel_sin_la_tabla_devuelve_los_errores(tmp_path):
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["Carné", "Nota"])
    ruta = tmp_path / "notas.xlsx"
    wb.save(ruta)

    with pytest.raises(HTTPException) as error:
        run(import_teacher_rubric(rubric_file=upload_bytes("notas.xlsx", ruta.read_bytes())))

    assert error.value.status_code == 422
    assert error.value.detail["errors"]
