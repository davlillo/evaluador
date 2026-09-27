# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Genera la rubrica de un diagrama de clases a partir del XMI de solucion.

El docente no deberia teclear la rubrica: su solucion ya la contiene. En su
Calificacion.xlsx del ano pasado, la hoja del Turno 1 Impar sale exactamente de
Turno1Impar.xmi (6 clases, 4 asociaciones y 1 clase de asociacion), y la
estructura se repite en los otros tres turnos.

La rubrica generada respeta su formato:

    Clases                                  20%
    Asociacion Afiliado-Ganado              <- encabezado de grupo, no puntua
      Multiplicidad 1 en Afiliado           10%
      Multiplicidad 1..* en Ganado          10%
    Clase de asociacion Enfermedad-Ganado   20%

Los pesos son un punto de partida (20% a las clases, el resto repartido parejo
entre los grupos de relacion, que es lo que el hizo en 3 de sus 4 turnos); la
idea es que los ajuste en pantalla.
"""
from __future__ import annotations

from typing import List, Optional

from app.comparator.scoring_modes import ClassRubricRule
from app.models.uml_elements import RelationshipType, UMLDiagram, UMLRelationship

#: Peso por defecto del criterio "Clases", igual que en las 4 rubricas del docente.
PESO_CLASES = 20.0

#: Multiplicidad implicita de UML cuando el extremo se deja en blanco.
MULTIPLICIDAD_IMPLICITA = "1"

ETIQUETA_TIPO = {
    RelationshipType.ASSOCIATION: "Asociación",
    RelationshipType.AGGREGATION: "Agregación",
    RelationshipType.COMPOSITION: "Composición",
}

TIPOS_CON_MULTIPLICIDAD = tuple(ETIQUETA_TIPO)


def _multiplicidad(valor: Optional[str]) -> str:
    """Astah exporta vacio el extremo cuya multiplicidad es la implicita."""
    limpio = (valor or "").replace(" ", "").strip()
    if not limpio:
        return MULTIPLICIDAD_IMPLICITA
    if limpio == "1..1":
        return "1"
    if limpio in ("*", "*..*"):
        return "0..*"
    return limpio


def _relaciones_puntuables(diagram: UMLDiagram) -> tuple:
    """Separa las relaciones en las que llevan multiplicidad y las de clase de asociacion."""
    con_multiplicidad: List[UMLRelationship] = []
    clases_de_asociacion: List[UMLRelationship] = []
    for relacion in diagram.relationships:
        if relacion.relationship_type == RelationshipType.ASSOCIATION_CLASS:
            clases_de_asociacion.append(relacion)
        elif relacion.relationship_type in TIPOS_CON_MULTIPLICIDAD:
            con_multiplicidad.append(relacion)
    return con_multiplicidad, clases_de_asociacion


def build_rubric_from_solution(
    diagram: UMLDiagram,
    peso_clases: float = PESO_CLASES,
) -> List[ClassRubricRule]:
    """Arma las reglas de rubrica que describen la solucion del docente."""
    con_multiplicidad, clases_de_asociacion = _relaciones_puntuables(diagram)
    grupos = len(con_multiplicidad) + len(clases_de_asociacion)

    reglas: List[ClassRubricRule] = [ClassRubricRule(
        rule_id="clases",
        criterion_type="classes",
        label="Clases",
        weight=round(peso_clases if grupos else 100.0, 4),
        expected_quantity=len(diagram.classes),
    )]
    if not grupos:
        return reglas

    peso_grupo = (100.0 - peso_clases) / grupos
    for indice, relacion in enumerate(con_multiplicidad, start=1):
        etiqueta_tipo = ETIQUETA_TIPO[relacion.relationship_type]
        # Defensa: si el parser no resolvio los nombres, los nombres de
        # fuente/destino pueden ser None. La UI jamas debe ver "None-None".
        src = relacion.source or "?%d" % indice
        tgt = relacion.target or "?%d" % (indice + 1000)
        for extremo, clase, multiplicidad in (
            ("source", src, relacion.source_multiplicity),
            ("target", tgt, relacion.target_multiplicity),
        ):
            esperada = _multiplicidad(multiplicidad)
            reglas.append(ClassRubricRule(
                rule_id="rel%d-%s" % (indice, extremo),
                criterion_type="multiplicity",
                label="Multiplicidad %s en %s" % (esperada, clase),
                weight=round(peso_grupo / 2, 4),
                source=src,
                target=tgt,
                relationship_type=relacion.relationship_type.value,
                multiplicity_end=extremo,
                expected_multiplicity=esperada,
                group_label="%s %s-%s" % (etiqueta_tipo, src, tgt),
            ))

    for indice, relacion in enumerate(clases_de_asociacion, start=1):
        src = relacion.source or "?%d" % indice
        tgt = relacion.target or "?%d" % (indice + 1000)
        reglas.append(ClassRubricRule(
            rule_id="clase-asociacion%d" % indice,
            criterion_type="association_class",
            label="Clase de asociación %s-%s" % (src, tgt),
            weight=round(peso_grupo, 4),
            source=src,
            target=tgt,
            relationship_type=RelationshipType.ASSOCIATION_CLASS.value,
        ))

    _ajustar_a_cien(reglas)
    return reglas


def _ajustar_a_cien(reglas: List[ClassRubricRule]) -> None:
    """Absorbe el redondeo en la regla mas pesada para que el total de 100%."""
    total = sum(r.weight for r in reglas)
    diferencia = round(100.0 - total, 4)
    if not diferencia or not reglas:
        return
    mayor = max(reglas, key=lambda r: r.weight)
    mayor.weight = round(mayor.weight + diferencia, 4)
