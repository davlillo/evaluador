# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Modelos de entrada/salida de la API y el perfil de evaluación que manda la pantalla."""

import json
from typing import Any, Optional, List, Dict, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.comparator.scoring_modes import (
    ClassRubricRule, EvaluationProfile, ScoringMode, ExpectedCount,
)

# Modelos Pydantic — perfil de evaluación (modos de scoring configurables)
class ExpectedCountModel(BaseModel):
    element_type: str
    expected_quantity: int = Field(..., ge=0)
    label: Optional[str] = None


class ClassRubricRuleModel(BaseModel):
    rule_id: str
    criterion_type: Literal["classes", "relationship", "multiplicity", "association_class"]
    label: str
    weight: float = Field(..., ge=0, le=100)
    expected_quantity: Optional[int] = Field(None, ge=0)
    source: Optional[str] = None
    target: Optional[str] = None
    relationship_type: str = "association"
    multiplicity_end: Optional[Literal["source", "target"]] = None
    expected_multiplicity: Optional[str] = None
    group_label: Optional[str] = None


class EvaluationProfileModel(BaseModel):
    mode: Literal[
        "similarity", "expected_no_penalty",
        "expected_with_penalty", "similarity_with_penalty",
    ] = "similarity"
    expected_counts: List[ExpectedCountModel] = []
    class_rules: List[ClassRubricRuleModel] = []


def build_evaluation_profile(evaluation_profile_json: Optional[str]) -> Optional[EvaluationProfile]:
    """Parsea el JSON de perfil de evaluación recibido por request. None si
    no se envía nada (comportamiento actual sin cambios)."""
    if not evaluation_profile_json:
        return None
    try:
        raw = json.loads(evaluation_profile_json)
        parsed = EvaluationProfileModel.model_validate(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"evaluation_profile_json inválido: {e}")

    return EvaluationProfile(
        mode=ScoringMode(parsed.mode),
        expected_counts={
            ec.element_type: ExpectedCount(
                element_type=ec.element_type,
                expected_quantity=ec.expected_quantity,
                label=ec.label,
            )
            for ec in parsed.expected_counts
        },
        class_rules=[
            ClassRubricRule(**rule.model_dump())
            for rule in parsed.class_rules
        ],
    )


def evaluation_profile_to_dict(profile: EvaluationProfile) -> Dict:
    """Serializa un EvaluationProfile de dominio a dict JSON-friendly, para
    el preview que se muestra en el frontend tras subir una rúbrica."""
    return {
        "mode": profile.mode.value,
        "expected_counts": [
            {"element_type": ec.element_type, "expected_quantity": ec.expected_quantity, "label": ec.label}
            for ec in profile.expected_counts.values()
        ],
        "class_rules": [
            {
                "rule_id": rule.rule_id,
                "criterion_type": rule.criterion_type,
                "label": rule.label,
                "weight": rule.weight,
                "expected_quantity": rule.expected_quantity,
                "source": rule.source,
                "target": rule.target,
                "relationship_type": rule.relationship_type,
                "multiplicity_end": rule.multiplicity_end,
                "expected_multiplicity": rule.expected_multiplicity,
            }
            for rule in profile.class_rules
        ],
    }


# Modelos Pydantic para respuestas
class ComparisonRequest(BaseModel):
    """Modelo para solicitud de comparación con contenido XML."""
    expected_xml: str
    student_xml: str
    case_sensitive: bool = False
    strict_types: bool = True
    use_semantic_matching: bool = True
    semantic_threshold: float = 0.65
    evaluation_profile_json: Optional[str] = None


class HealthResponse(BaseModel):
    """Modelo para respuesta de health check."""
    status: str
    version: str


class BatchXlsxExportRequest(BaseModel):
    """Body de /api/export/batch-xlsx. El frontend reenvía el
    BatchCompareResponse tal como lo tiene en pantalla (no se re-evalúa acá)
    junto con lo que el docente haya editado a mano, ya que esas ediciones
    solo viven en el cliente (localStorage)."""
    batch: Dict[str, Any]
    #: carné -> nota final corregida
    nota_overrides: Dict[str, float] = {}
    #: carné -> {rule_id: "Modelados" corregido en la hoja}
    modeled_overrides: Dict[str, Dict[str, float]] = {}
    #: carné -> {rule_id: observación escrita por el docente}
    observations: Dict[str, Dict[str, str]] = {}
