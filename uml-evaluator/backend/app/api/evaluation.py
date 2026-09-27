# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Pesos por tipo de diagrama y forma de la respuesta de una comparación."""

from typing import Optional



def normalize_global_weights(class_w: float, usecase_w: float, sequence_w: float) -> dict[str, float]:
    raw = {
        'class': max(0.0, class_w),
        'usecase': max(0.0, usecase_w),
        'sequence': max(0.0, sequence_w),
    }
    total = sum(raw.values())
    if total <= 0:
        return {'class': 1 / 3, 'usecase': 1 / 3, 'sequence': 1 / 3}
    return {k: v / total for k, v in raw.items()}


def percent_or_default(value: Optional[float], default: float) -> float:
    """Convierte un porcentaje a fracción, conservando explícitamente el valor cero."""
    resolved = default if value is None else value
    return max(0.0, float(resolved)) / 100.0


def build_usecase_weights(
    classes: Optional[float] = None,
    attributes: Optional[float] = None,
    methods: Optional[float] = None,
    include_relations: Optional[float] = None,
    extend_relations: Optional[float] = None,
    relationships: Optional[float] = None,
) -> dict[str, float]:
    """Construye pesos normalizados para diagramas de casos de uso (5 criterios)."""
    w_act = classes if classes is not None else 15.0
    w_uc = attributes if attributes is not None else 25.0

    if include_relations is None and extend_relations is None and methods is None and relationships is not None:
        third = relationships / 3.0
        w_assoc = third
        w_inc = third
        w_ext = third
    else:
        w_assoc = methods if methods is not None else 25.0
        w_inc = include_relations if include_relations is not None else 20.0
        w_ext = extend_relations if extend_relations is not None else 15.0

    raw = {
        'classes': max(0.0, w_act),
        'attributes': max(0.0, w_uc),
        'methods': max(0.0, w_assoc),
        'include_relations': max(0.0, w_inc),
        'extend_relations': max(0.0, w_ext),
    }
    total = sum(raw.values())
    if total <= 0:
        return {k: 0.0 for k in raw}
    return {k: v / total for k, v in raw.items()}


def enriched_comparison(comparison, expected_diagram, student_diagram, weights_used=None) -> dict:
    """Incluye diagramas parseados para comparación visual y exportación PDF.

    weights_used viaja también acá (no solo en /api/compare) porque los
    reportes PDF y el export a Excel de un lote leen los pesos reales desde
    cada 'comparison' — sin esto, criterionRows() caía a un reparto
    equitativo falso (100/N) en vez de mostrar la ponderación configurada.
    """
    payload = comparison.to_dict()
    payload['expected_diagram'] = expected_diagram.to_dict()
    payload['student_diagram'] = student_diagram.to_dict()
    if weights_used:
        payload['weights_used'] = {k: round(v * 100, 1) for k, v in weights_used.items()}
    return payload
