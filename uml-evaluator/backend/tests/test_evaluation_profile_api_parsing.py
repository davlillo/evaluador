"""
Tests del helper _build_evaluation_profile de app.api.main: traduce el JSON
de EvaluationProfileModel (recibido por request) al EvaluationProfile de
dominio que consume UMLComparator.
"""
import json

import pytest
from fastapi import HTTPException

from app.api.main import _build_evaluation_profile
from app.comparator.scoring_modes import ScoringMode


class TestBuildEvaluationProfile:
    def test_none_o_vacio_retorna_none(self):
        assert _build_evaluation_profile(None) is None
        assert _build_evaluation_profile("") is None

    def test_json_minimo_usa_defaults(self):
        profile = _build_evaluation_profile(json.dumps({"mode": "expected_with_penalty"}))
        assert profile.mode == ScoringMode.EXPECTED_WITH_PENALTY
        assert profile.expected_counts == {}

    def test_json_completo_se_traduce_correctamente(self):
        payload = {
            "mode": "similarity_with_penalty",
            "expected_counts": [
                {"element_type": "classes", "expected_quantity": 4, "label": "Clases"},
            ],
        }
        profile = _build_evaluation_profile(json.dumps(payload))

        assert profile.mode == ScoringMode.SIMILARITY_WITH_PENALTY
        assert profile.expected_counts["classes"].expected_quantity == 4
        assert profile.expected_counts["classes"].label == "Clases"

    def test_regla_granular_de_clases_se_traduce(self):
        payload = {
            "mode": "expected_with_penalty",
            "class_rules": [{
                "rule_id": "mult-afiliado",
                "criterion_type": "multiplicity",
                "label": "Multiplicidad en Afiliado",
                "weight": 10,
                "source": "Afiliado",
                "target": "Ganado",
                "relationship_type": "association",
                "multiplicity_end": "source",
                "expected_multiplicity": "1",
            }],
        }
        profile = _build_evaluation_profile(json.dumps(payload))

        assert len(profile.class_rules) == 1
        assert profile.class_rules[0].source == "Afiliado"
        assert profile.class_rules[0].expected_multiplicity == "1"

    def test_json_invalido_lanza_422(self):
        with pytest.raises(HTTPException) as exc_info:
            _build_evaluation_profile("{not valid json")
        assert exc_info.value.status_code == 422

    def test_modo_desconocido_lanza_422(self):
        with pytest.raises(HTTPException) as exc_info:
            _build_evaluation_profile(json.dumps({"mode": "no_existe"}))
        assert exc_info.value.status_code == 422

    def test_modos_retirados_lanzan_422_en_la_api(self):
        """A diferencia del parser de Excel (que tolera rúbricas viejas), la
        API espera que el frontend siempre mande un modo vigente."""
        for retired in ("hybrid", "range_tolerance"):
            with pytest.raises(HTTPException) as exc_info:
                _build_evaluation_profile(json.dumps({"mode": retired}))
            assert exc_info.value.status_code == 422
