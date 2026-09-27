# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""¿La rúbrica corresponde a esta solución?

Se evalúa la solución del docente con su propia rúbrica: tendría que sacar 10.
Cada criterio que no cumple ni la solución es una de dos cosas, y las dos hay
que verlas antes de calificar a un grupo entero:

- la rúbrica y la solución no son del mismo turno (subió la del Par con la
  solución del Impar), o
- la rúbrica pide algo distinto a lo que dibujó en la solución (en Práctica 1,
  la rúbrica decía "Multiplicidad 0..* en Tratamiento" y la solución tenía 1).

Se usa el mismo motor que califica a los estudiantes, así que lo que marque
este chequeo es exactamente lo que le va a costar puntos a un alumno que haya
copiado la solución al pie de la letra.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from app.comparator.scoring_modes import EvaluationProfile
from app.comparator.uml_comparator import UMLComparator
from app.models.uml_elements import UMLDiagram

RELATIONSHIP_LABELS = {
    "association": "una asociación",
    "aggregation": "una agregación",
    "composition": "una composición",
    "association_class": "una clase de asociación",
}


@dataclass
class RubricIssue:
    rule_id: str
    label: str
    message: str


@dataclass
class RubricCheck:
    #: Nota que saca la propia solución con esta rúbrica (debería ser 10).
    nota: float
    issues: List[RubricIssue] = field(default_factory=list)


def _relacion(row: Dict[str, Any]) -> str:
    return row.get("group_label") or f"{row.get('source')} - {row.get('target')}"


def _explain(row: Dict[str, Any]) -> str:
    tipo = row.get("criterion_type")
    modeled = row.get("modeled")
    if tipo == "classes":
        return (
            f"La rúbrica espera {row.get('expected')} clases y tu solución "
            f"tiene {modeled}."
        )
    if tipo == "association_class":
        return (
            f"Tu solución no tiene una clase de asociación entre "
            f"{row.get('source')} y {row.get('target')}."
        )
    if modeled == "No evaluada por tipo incorrecto":
        detectada = RELATIONSHIP_LABELS.get(
            row.get("modeled_relationship_type") or "", "otra relación",
        )
        pedida = RELATIONSHIP_LABELS.get(row.get("relationship_type") or "", "otra relación")
        return (
            f"En tu solución «{_relacion(row)}» es {detectada}, "
            f"pero la rúbrica pide {pedida}."
        )
    if not modeled:
        return f"Tu solución no tiene la relación de «{_relacion(row)}»."
    return (
        f"En tu solución esa multiplicidad es «{modeled}»; "
        f"la rúbrica pide «{row.get('expected')}»."
    )


def check_rubric_against_solution(
    profile: EvaluationProfile, solution: UMLDiagram,
) -> RubricCheck:
    """Califica la solución con su propia rúbrica y explica lo que no cumple."""
    comparator = UMLComparator(evaluation_profile=profile, use_semantic_matching=False)
    result = comparator.compare(solution, solution)
    issues = [
        RubricIssue(
            rule_id=row.get("rule_id", ""),
            label=row.get("label", ""),
            message=_explain(row),
        )
        for row in result.class_rubric_breakdown
        if not row.get("correct")
    ]
    return RubricCheck(nota=round(result.overall_similarity / 10.0, 2), issues=issues)
