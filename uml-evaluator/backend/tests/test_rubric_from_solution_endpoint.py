# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""POST /api/rubric/from-solution: el docente sube su solucion y recibe la tabla."""
import pytest
from fastapi import HTTPException

from app.api.routes.rubric import rubric_from_solution
from app.comparator.calibracion import FIXTURE_DIR
from tests.api_helpers import run, upload_bytes, upload_xmi

SOLUCION = FIXTURE_DIR / "soluciones" / "Turno2Ambas.xmi"


def _derivar(weight_classes=20.0):
    """Llama al endpoint directo, sin HTTP: hay que pasar los Form a mano
    porque FastAPI solo resuelve sus valores por defecto al servir la ruta."""
    if not SOLUCION.exists():
        pytest.skip("falta la fixture %s" % SOLUCION)
    return run(rubric_from_solution(
        expected_file=upload_xmi(SOLUCION), weight_classes=weight_classes,
    ))


def test_devuelve_la_rubrica_del_turno_2_con_pesos_que_suman_cien():
    reglas = _derivar()["class_rules"]

    assert [r["label"] for r in reglas] == [
        "Clases",
        "Multiplicidad 1 en InstitucionEducativa",
        "Multiplicidad 0..* en EstudioRealizado",
        "Multiplicidad 1 en Empresa",
        "Multiplicidad 0..* en Experiencia",
        "Clase de asociación Candidato-GradoAcademico",
        "Clase de asociación Candidato-Puesto",
    ]
    assert abs(sum(r["weight"] for r in reglas) - 100.0) < 0.01


def test_agrupa_las_multiplicidades_como_en_el_excel_del_docente():
    reglas = _derivar()["class_rules"]

    grupos = [r["group_label"] for r in reglas if r["criterion_type"] == "multiplicity"]
    assert grupos == [
        "Asociación InstitucionEducativa-EstudioRealizado",
        "Asociación InstitucionEducativa-EstudioRealizado",
        "Asociación Empresa-Experiencia",
        "Asociación Empresa-Experiencia",
    ]
    # los criterios que no son de multiplicidad no cuelgan de ningun grupo
    assert all(
        r["group_label"] is None
        for r in reglas
        if r["criterion_type"] != "multiplicity"
    )


def test_respeta_el_peso_de_clases_que_pida_el_docente():
    reglas = _derivar(weight_classes=40.0)["class_rules"]

    clases = next(r for r in reglas if r["criterion_type"] == "classes")
    assert clases["weight"] == 40.0
    assert abs(sum(r["weight"] for r in reglas) - 100.0) < 0.01


def test_incluye_el_diagrama_para_pintarlo_en_pantalla():
    cuerpo = _derivar()

    assert cuerpo["expected_diagram"]["diagram_type"] == "class"
    assert len(cuerpo["expected_diagram"]["classes"]) == 5


def test_rechaza_una_extension_que_no_es_xmi():
    with pytest.raises(HTTPException) as error:
        run(rubric_from_solution(
            expected_file=upload_bytes("rubrica.xlsx", b"no soy un xmi"),
            weight_classes=20.0,
        ))

    assert error.value.status_code == 400
    assert "válida" in error.value.detail

