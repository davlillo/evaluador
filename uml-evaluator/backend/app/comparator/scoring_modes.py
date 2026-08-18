"""
Modos de evaluación configurables, en capa aditiva sobre el motor de
similitud existente (UMLComparator). Ningún modo reemplaza el cálculo de
F1/similitud ya existente: todos consumen los mismos conteos
(expected/found/correct) que UMLComparator ya produce por criterio, y
producen el score final que entra al promedio ponderado.

Modo "similarity" (por defecto) deja el score sin cambios: es el
comportamiento actual, sin ninguna regresión.

La penalización usa la CURVA NORMAL del método real del docente:

    factor = min(E, R) / max(E, R)

donde E = cantidad esperada y R = cantidad registrada. Es simétrica: se
penaliza igual entregar de más que de menos, y el puntaje máximo se
obtiene solo cuando ambas cantidades coinciden exactamente. El factor en
escala 0-100 ES el score del criterio (luego se pondera con los pesos),
tal como en la hoja de cálculo del docente: nota_ponderada = factor × peso.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class ScoringMode(str, Enum):
    SIMILARITY = "similarity"
    EXPECTED_NO_PENALTY = "expected_no_penalty"
    EXPECTED_WITH_PENALTY = "expected_with_penalty"
    SIMILARITY_WITH_PENALTY = "similarity_with_penalty"


@dataclass
class ExpectedCount:
    element_type: str
    expected_quantity: int
    label: Optional[str] = None


@dataclass
class ClassRubricRule:
    """Criterio granular para la rúbrica de diagramas de clases."""
    rule_id: str
    criterion_type: str
    label: str
    weight: float
    expected_quantity: Optional[int] = None
    source: Optional[str] = None
    target: Optional[str] = None
    relationship_type: str = "association"
    multiplicity_end: Optional[str] = None
    expected_multiplicity: Optional[str] = None


@dataclass
class EvaluationProfile:
    """Perfil de evaluación resuelto para una comparación de un tipo de
    diagrama. Se pasa opcionalmente a UMLComparator; si es None, el
    comportamiento es idéntico al actual (modo similarity implícito)."""
    mode: ScoringMode = ScoringMode.SIMILARITY
    expected_counts: Dict[str, ExpectedCount] = field(default_factory=dict)
    class_rules: list[ClassRubricRule] = field(default_factory=list)


def normal_curve_factor(expected: int, delivered: int) -> float:
    """Curva normal: min(E,R)/max(E,R), en 0..1.

    Simétrica — factor(6,9) == factor(9,6). Los casos E=0/R>0 y E>0/R=0
    dan 0.0 por sí solos; el único caso a proteger es max==0 (nada
    esperado y nada entregado), que es coincidencia perfecta.
    """
    hi = max(expected, delivered)
    if hi <= 0:
        return 1.0
    return min(expected, delivered) / hi


def _outcome(
    *,
    score: float,
    base_score: float,
    factor: Optional[float],
    expected_used: int,
    delivered: int,
    explanation: str,
) -> Dict[str, Any]:
    """Estructura común del desglose por criterio. Las claves score,
    base_score, penalty_applied, explanation, excess_units y deficit_units
    son consumidas por el frontend (PenaltyDetail / PenaltyNote); las
    demás alimentan el export a Excel."""
    return {
        "score": score,
        "base_score": base_score,
        "penalty_applied": max(0.0, base_score - score),
        "explanation": explanation,
        "excess_units": max(0, delivered - expected_used),
        "deficit_units": max(0, expected_used - delivered),
        "expected_used": expected_used,
        "delivered": delivered,
        "factor": factor,
    }


def score_criterion(
    *,
    mode: ScoringMode,
    similarity_f1: float,
    n_expected_ref: int,
    n_expected_rubric: Optional[int],
    n_found: int,
    n_correct: int,
) -> Dict[str, Any]:
    """Calcula el score (0-100) de un criterio según el modo de evaluación.

    Args:
        similarity_f1: F1-score ya calculado por UMLComparator para este criterio.
        n_expected_ref: cantidad esperada según el modelo de referencia
            (diagrama del docente).
        n_expected_rubric: cantidad esperada según la rúbrica cargada
            (None si no se definió para este criterio).
        n_found: cantidad entregada por el estudiante.
        n_correct: cuántos de los encontrados coinciden con lo esperado.
    """
    if mode == ScoringMode.SIMILARITY:
        return _outcome(
            score=similarity_f1,
            base_score=similarity_f1,
            factor=None,
            expected_used=n_expected_ref,
            delivered=n_found,
            explanation="Similitud contra el modelo de referencia.",
        )

    if mode == ScoringMode.SIMILARITY_WITH_PENALTY:
        # Conserva la similitud estructural y además aplica la curva contra
        # el conteo del modelo de referencia.
        factor = normal_curve_factor(n_expected_ref, n_found)
        score = similarity_f1 * factor
        return _outcome(
            score=score,
            base_score=similarity_f1,
            factor=factor,
            expected_used=n_expected_ref,
            delivered=n_found,
            explanation=(
                f"Similitud {similarity_f1:.1f}%; se esperaban {n_expected_ref} "
                f"y se registraron {n_found}: factor {factor:.4f} "
                f"({score:.1f} pts)."
            ),
        )

    expected = n_expected_rubric if n_expected_rubric is not None else n_expected_ref

    if mode == ScoringMode.EXPECTED_NO_PENALTY:
        # Solo importa cumplir lo esperado; entregar de más no descuenta.
        if expected <= 0:
            score = 100.0
        else:
            score = min(100.0, (n_correct / expected) * 100.0)
        return _outcome(
            score=score,
            base_score=score,
            factor=None,
            expected_used=expected,
            delivered=n_correct,
            explanation=(
                f"{n_correct} de {expected} esperados cumplidos; "
                f"el exceso no descuenta."
            ),
        )

    # EXPECTED_WITH_PENALTY: el Excel llama "Modelados" a los elementos que
    # cumplen el criterio, no a todo lo que aparece en el archivo.
    factor = normal_curve_factor(expected, n_correct)
    score = factor * 100.0
    return _outcome(
        score=score,
        base_score=100.0,
        factor=factor,
        expected_used=expected,
        delivered=n_correct,
        explanation=(
            f"Se esperaban {expected} y se modelaron correctamente {n_correct}: "
            f"factor {factor:.4f} ({score:.1f} pts)."
        ),
    )
