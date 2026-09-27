# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""La rubrica se deriva del XMI de solucion, no se teclea.

Las soluciones reales del docente estan en test_files/calibracion/soluciones/,
y las rubricas que el escribio a mano estan en su Calificacion.xlsx. Para el
Turno 1 Par y el Turno 2 la rubrica generada coincide criterio por criterio y
peso por peso con la suya.
"""
import pytest

from app.comparator.rubric_builder import build_rubric_from_solution
from app.comparator.calibracion import FIXTURE_DIR
from app.models.uml_elements import (
    RelationshipType,
    UMLClass,
    UMLDiagram,
    UMLRelationship,
)
from app.parsers.xmi_parser import parse_xmi_file_multi

SOLUCIONES = FIXTURE_DIR / "soluciones"


def _solucion(nombre):
    ruta = SOLUCIONES / nombre
    if not ruta.exists():
        pytest.skip("falta la fixture %s" % ruta)
    return parse_xmi_file_multi(str(ruta), xmi_source="astah")["class"]


def test_los_pesos_siempre_suman_cien():
    for nombre in ("Turno1Impar.xmi", "Turno1Par.xmi", "Turno2Ambas.xmi"):
        reglas = build_rubric_from_solution(_solucion(nombre))
        total = sum(r.weight for r in reglas)
        assert abs(total - 100.0) < 0.01, "%s suma %s" % (nombre, total)


def test_reproduce_la_rubrica_que_el_docente_escribio_para_el_turno_2():
    reglas = build_rubric_from_solution(_solucion("Turno2Ambas.xmi"))
    etiquetas = [(r.label, r.weight) for r in reglas]

    assert etiquetas == [
        ("Clases", 20.0),
        ("Multiplicidad 1 en InstitucionEducativa", 10.0),
        ("Multiplicidad 0..* en EstudioRealizado", 10.0),
        ("Multiplicidad 1 en Empresa", 10.0),
        ("Multiplicidad 0..* en Experiencia", 10.0),
        ("Clase de asociación Candidato-GradoAcademico", 20.0),
        ("Clase de asociación Candidato-Puesto", 20.0),
    ]


def test_el_criterio_de_clases_espera_las_clases_de_la_solucion():
    reglas = build_rubric_from_solution(_solucion("Turno1Impar.xmi"))
    clases = next(r for r in reglas if r.criterion_type == "classes")
    # Afiliado, Ganado, Enfermedad, Produccion, Medicamento, Tratamiento;
    # los stubs String/LocalDate y la clase de asociacion quedan fuera
    assert clases.expected_quantity == 6


def test_las_multiplicidades_se_agrupan_como_en_el_excel():
    reglas = build_rubric_from_solution(_solucion("Turno2Ambas.xmi"))
    multiplicidades = [r for r in reglas if r.criterion_type == "multiplicity"]

    for regla in multiplicidades:
        assert regla.group_label, "%s quedo sin encabezado de grupo" % regla.label
    # cada grupo trae exactamente sus dos extremos
    for grupo in {r.group_label for r in multiplicidades}:
        extremos = [r.multiplicity_end for r in multiplicidades if r.group_label == grupo]
        assert sorted(extremos) == ["source", "target"], grupo


def test_el_extremo_en_blanco_se_documenta_como_uno():
    """Astah deja vacio el extremo con la multiplicidad implicita de UML."""
    diagrama = UMLDiagram(
        name="Docente",
        diagram_type="class",
        classes=[UMLClass(name="Afiliado"), UMLClass(name="Ganado")],
        relationships=[UMLRelationship(
            source="Afiliado",
            target="Ganado",
            relationship_type=RelationshipType.ASSOCIATION,
            source_multiplicity=None,
            target_multiplicity="1..*",
        )],
    )

    reglas = build_rubric_from_solution(diagrama)
    etiquetas = [r.label for r in reglas]

    assert "Multiplicidad 1 en Afiliado" in etiquetas
    assert "Multiplicidad 1..* en Ganado" in etiquetas


def test_una_solucion_sin_relaciones_deja_todo_el_peso_en_las_clases():
    diagrama = UMLDiagram(
        name="Docente",
        diagram_type="class",
        classes=[UMLClass(name="A"), UMLClass(name="B")],
    )

    reglas = build_rubric_from_solution(diagrama)

    assert len(reglas) == 1
    assert reglas[0].weight == 100.0
    assert reglas[0].expected_quantity == 2
