# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""La solución del docente evaluada con su propia rúbrica debería sacar 10.

Lo que no cumple ni la solución se reporta antes de calificar al grupo: o la
rúbrica es de otro turno, o pide algo distinto a lo que se dibujó.
"""
import json

import pytest
from fastapi import HTTPException

from app.api.main import check_rubric
from app.comparator.calibracion import FIXTURE_DIR, RUBRICAS_JSON, _rule_from_dict
from app.comparator.rubric_check import check_rubric_against_solution
from app.comparator.scoring_modes import EvaluationProfile
from app.parsers.xmi_parser import parse_xmi_file_multi
from tests.api_helpers import run, upload_bytes, upload_xmi

SOLUCIONES = FIXTURE_DIR / "soluciones"


def _rubrica(turno):
    datos = json.loads(RUBRICAS_JSON.read_text(encoding="utf-8"))
    return datos[turno]["reglas"]


def _perfil(turno):
    return EvaluationProfile(class_rules=[_rule_from_dict(r) for r in _rubrica(turno)])


def _solucion(nombre):
    return parse_xmi_file_multi(str(SOLUCIONES / nombre), xmi_source="astah")["class"]


def test_la_rubrica_correcta_con_su_solucion_saca_diez():
    check = check_rubric_against_solution(_perfil("T2-IMPAR"), _solucion("Turno2Ambas.xmi"))

    assert check.nota == 10.0
    assert check.issues == []


def test_una_rubrica_de_otro_turno_se_nota_enseguida():
    check = check_rubric_against_solution(_perfil("T2-IMPAR"), _solucion("Turno1Impar.xmi"))

    assert check.nota < 3
    mensajes = " ".join(issue.message for issue in check.issues)
    assert "no tiene una clase de asociación entre Candidato y GradoAcademico" in mensajes


def test_encuentra_donde_la_rubrica_pide_otra_multiplicidad_que_la_solucion():
    """En Práctica 1 la rúbrica pedía 0..* en Tratamiento y la solución tenía 1."""
    check = check_rubric_against_solution(_perfil("T1-IMPAR"), _solucion("Turno1Impar.xmi"))

    [issue] = check.issues
    assert "Tratamiento" in issue.label
    assert issue.message == "En tu solución esa multiplicidad es «1»; la rúbrica pide «0..*»."


def test_el_asterisco_de_astah_se_muestra_como_asterisco():
    """Astah exporta "*" como lower=-1 upper=-1; no tiene que verse "*..*"."""
    check = check_rubric_against_solution(_perfil("T1-PAR"), _solucion("Turno1Par.xmi"))

    [issue] = check.issues
    assert issue.message == "En tu solución esa multiplicidad es «*»; la rúbrica pide «1..*»."


def test_el_endpoint_devuelve_la_nota_y_los_problemas():
    perfil = json.dumps({
        "mode": "expected_with_penalty",
        "expected_counts": [],
        "class_rules": _rubrica("T2-IMPAR"),
    })

    cuerpo = run(check_rubric(
        expected_file=upload_xmi(SOLUCIONES / "Turno1Impar.xmi"),
        evaluation_profile_json=perfil,
    ))

    assert cuerpo["nota"] < 3
    assert {"rule_id", "label", "message"} <= set(cuerpo["issues"][0])


def test_el_endpoint_rechaza_una_rubrica_vacia():
    with pytest.raises(HTTPException) as error:
        run(check_rubric(
            expected_file=upload_bytes("solucion.xmi", b"<xmi/>"),
            evaluation_profile_json=json.dumps({"mode": "expected_with_penalty"}),
        ))

    assert error.value.status_code == 422
