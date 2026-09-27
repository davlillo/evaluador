# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Resultados de una comparación: lo que devuelve UMLComparator y consume la API.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field



@dataclass
class ComparisonDetail:
    """Detalle de comparación de un elemento específico."""
    element_type: str  # "class", "attribute", "method", "relationship"
    name: str
    status: str  # "correct", "missing", "extra", "partial"
    expected: Any = None
    found: Any = None
    similarity_score: float = 0.0
    semantic_match_of: Optional[str] = None
    message: str = ""


@dataclass
class ClassComparisonResult:
    """Resultado de comparación de una clase."""
    class_name: str
    similarity_score: float
    attributes_correct: int
    attributes_total: int
    methods_correct: int
    methods_total: int
    details: List[ComparisonDetail] = field(default_factory=list)
    missing_attributes: List[str] = field(default_factory=list)
    extra_attributes: List[str] = field(default_factory=list)
    missing_methods: List[str] = field(default_factory=list)
    extra_methods: List[str] = field(default_factory=list)


@dataclass
class ComparisonResult:
    """Resultado completo de la comparación de dos diagramas UML."""
    # Campos requeridos
    overall_similarity: float
    class_similarity: float       # actores (usecase) | lifelines (sequence)
    attribute_similarity: float   # casos de uso (usecase) | 0 (sequence)
    method_similarity: float      # 0 para diagramas no-clase
    relationship_similarity: float
    total_classes_expected: int
    total_classes_found: int
    correct_classes: int
    total_attributes_expected: int
    total_attributes_found: int
    correct_attributes: int
    total_methods_expected: int
    total_methods_found: int
    correct_methods: int
    total_relationships_expected: int
    total_relationships_found: int
    correct_relationships: int

    # Campos opcionales
    diagram_type: str = "class"
    missing_classes: List[str] = field(default_factory=list)
    extra_classes: List[str] = field(default_factory=list)
    missing_use_cases: List[str] = field(default_factory=list)
    extra_use_cases: List[str] = field(default_factory=list)
    missing_relationships: List[str] = field(default_factory=list)
    extra_relationships: List[str] = field(default_factory=list)
    # Subcriterios de relaciones en diagramas de casos de uso
    include_similarity: float = 0.0
    extend_similarity: float = 0.0
    total_include_expected: int = 0
    total_include_found: int = 0
    correct_include: int = 0
    total_extend_expected: int = 0
    total_extend_found: int = 0
    correct_extend: int = 0
    missing_actor_associations: List[str] = field(default_factory=list)
    extra_actor_associations: List[str] = field(default_factory=list)
    missing_include_relations: List[str] = field(default_factory=list)
    extra_include_relations: List[str] = field(default_factory=list)
    missing_extend_relations: List[str] = field(default_factory=list)
    extra_extend_relations: List[str] = field(default_factory=list)
    class_results: List[ClassComparisonResult] = field(default_factory=list)
    details: List[ComparisonDetail] = field(default_factory=list)
    # Orden de mensajes (secuencia): porcentaje de mensajes en posición correcta
    message_order_score: float = 0.0
    # Criterios de secuencia (v2)
    sequence_criteria: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Modo de evaluación usado y desglose de penalización por criterio
    # (ver app.comparator.scoring_modes). Vacío/"similarity" cuando no aplica.
    scoring_mode: str = "similarity"
    penalty_breakdown: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    class_rubric_breakdown: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convierte el resultado a diccionario con estructura adaptada al tipo de diagrama."""
        base = {
            "overall_similarity": round(self.overall_similarity, 2),
            "diagram_type": self.diagram_type,
            "scoring_mode": self.scoring_mode,
            "penalty_breakdown": self.penalty_breakdown,
            "class_rubric_breakdown": self.class_rubric_breakdown,
            "details": [
                {
                    "element_type": d.element_type,
                    "name": d.name,
                    "status": d.status,
                    "similarity_score": round(d.similarity_score, 2),
                    "semantic_match_of": d.semantic_match_of,
                    "message": d.message,
                }
                for d in self.details
            ],
        }

        if self.diagram_type == "usecase":
            base["breakdown"] = {
                "actors": {
                    "similarity": round(self.class_similarity, 2),
                    "expected": self.total_classes_expected,
                    "found": self.total_classes_found,
                    "correct": self.correct_classes,
                    "missing": self.missing_classes,
                    "extra": self.extra_classes,
                },
                "use_cases": {
                    "similarity": round(self.attribute_similarity, 2),
                    "expected": self.total_attributes_expected,
                    "found": self.total_attributes_found,
                    "correct": self.correct_attributes,
                    "missing": self.missing_use_cases,
                    "extra": self.extra_use_cases,
                },
                "actor_associations": {
                    "similarity": round(self.method_similarity, 2),
                    "expected": self.total_methods_expected,
                    "found": self.total_methods_found,
                    "correct": self.correct_methods,
                    "missing": self.missing_actor_associations,
                    "extra": self.extra_actor_associations,
                },
                "include_relations": {
                    "similarity": round(self.include_similarity, 2),
                    "expected": self.total_include_expected,
                    "found": self.total_include_found,
                    "correct": self.correct_include,
                    "missing": self.missing_include_relations,
                    "extra": self.extra_include_relations,
                },
                "extend_relations": {
                    "similarity": round(self.extend_similarity, 2),
                    "expected": self.total_extend_expected,
                    "found": self.total_extend_found,
                    "correct": self.correct_extend,
                    "missing": self.missing_extend_relations,
                    "extra": self.extra_extend_relations,
                },
            }

        elif self.diagram_type == "sequence":
            if self.sequence_criteria:
                base["breakdown"] = {
                    "sync_messages": self.sequence_criteria.get("sync_messages", {}),
                    "async_messages": self.sequence_criteria.get("async_messages", {}),
                    "creation_messages": self.sequence_criteria.get("creation_messages", {}),
                    "fragment_usage": self.sequence_criteria.get("fragment_usage", {}),
                    "order_score": round(self.message_order_score, 2),
                    # Se mantiene para vistas comparativas existentes.
                    "lifelines": {
                        "similarity": round(self.class_similarity, 2),
                        "expected": self.total_classes_expected,
                        "found": self.total_classes_found,
                        "correct": self.correct_classes,
                        "missing": self.missing_classes,
                        "extra": self.extra_classes,
                    },
                }
            else:
                # Estructura legacy para retrocompatibilidad.
                base["breakdown"] = {
                    "lifelines": {
                        "similarity": round(self.class_similarity, 2),
                        "expected": self.total_classes_expected,
                        "found": self.total_classes_found,
                        "correct": self.correct_classes,
                        "missing": self.missing_classes,
                        "extra": self.extra_classes,
                    },
                    "messages": {
                        "similarity": round(self.relationship_similarity, 2),
                        "order_score": round(self.message_order_score, 2),
                        "expected": self.total_relationships_expected,
                        "found": self.total_relationships_found,
                        "correct": self.correct_relationships,
                        "missing": self.missing_relationships,
                        "extra": self.extra_relationships,
                    },
                }

        else:
            base["breakdown"] = {
                "classes": {
                    "similarity": round(self.class_similarity, 2),
                    "expected": self.total_classes_expected,
                    "found": self.total_classes_found,
                    "correct": self.correct_classes,
                    "missing": self.missing_classes,
                    "extra": self.extra_classes,
                },
                "attributes": {
                    "similarity": round(self.attribute_similarity, 2),
                    "expected": self.total_attributes_expected,
                    "found": self.total_attributes_found,
                    "correct": self.correct_attributes,
                },
                "methods": {
                    "similarity": round(self.method_similarity, 2),
                    "expected": self.total_methods_expected,
                    "found": self.total_methods_found,
                    "correct": self.correct_methods,
                },
                "relationships": {
                    "similarity": round(self.relationship_similarity, 2),
                    "expected": self.total_relationships_expected,
                    "found": self.total_relationships_found,
                    "correct": self.correct_relationships,
                    "missing": self.missing_relationships,
                    "extra": self.extra_relationships,
                },
            }
            base["class_details"] = [
                {
                    "class_name": cr.class_name,
                    "similarity": round(cr.similarity_score, 2),
                    "attributes": {
                        "correct": cr.attributes_correct,
                        "total": cr.attributes_total,
                        "missing": cr.missing_attributes,
                        "extra": cr.extra_attributes,
                    },
                    "methods": {
                        "correct": cr.methods_correct,
                        "total": cr.methods_total,
                        "missing": cr.missing_methods,
                        "extra": cr.extra_methods,
                    },
                }
                for cr in self.class_results
            ]

        return base
