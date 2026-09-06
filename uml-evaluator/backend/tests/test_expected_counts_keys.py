"""Contrato entre las claves visibles de la rúbrica y los criterios internos."""
import copy

import pytest

from app.comparator.scoring_modes import EvaluationProfile, ExpectedCount, ScoringMode
from app.comparator.uml_comparator import UMLComparator
from app.parsers.xmi_parser import parse_xmi_file_multi
from tests.api_helpers import (
    CASO_USO_DOCENTE,
    SECUENCIA_STARUML_FRAGMENTS,
    SOLUCION_CORRECTA,
)


def _profile(mode, **counts):
    return EvaluationProfile(
        mode=mode,
        expected_counts={
            key: ExpectedCount(element_type=key, expected_quantity=qty)
            for key, qty in counts.items()
        },
    )


def _compare(expected, student, profile, weights=None):
    return UMLComparator(evaluation_profile=profile, weights=weights).compare(expected, student)


class TestClases:
    def test_classes_si_cambia_el_score(self):
        diagrams = parse_xmi_file_multi(str(SOLUCION_CORRECTA), xmi_source="astah")
        expected = diagrams["class"]
        student = copy.deepcopy(expected)
        from app.models.uml_elements import UMLClass
        student.classes.append(UMLClass(name="ClaseExtraNoEsperada"))

        similarity = _compare(expected, student, _profile(ScoringMode.SIMILARITY))
        applied = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, classes=3),
        )
        assert "classes" in applied.penalty_breakdown
        assert applied.penalty_breakdown["classes"]["factor"] == pytest.approx(1.0)
        assert applied.overall_similarity != pytest.approx(similarity.overall_similarity, abs=0.01)

    def test_subtipos_de_relacion_se_agregan_en_relationships(self):
        diagrams = parse_xmi_file_multi(str(SOLUCION_CORRECTA), xmi_source="astah")
        expected = diagrams["class"]
        student = copy.deepcopy(expected)
        configured = _compare(
            expected, student,
            _profile(
                ScoringMode.EXPECTED_WITH_PENALTY,
                association=2,
                aggregation=3,
                composition=0,
                inheritance=1,
                implementation=0,
            ),
        )
        assert configured.penalty_breakdown["relationships"]["expected_used"] == 6


class TestCasosDeUso:
    def test_claves_visibles_se_mapean_a_criterios_internos(self):
        diagrams = parse_xmi_file_multi(str(CASO_USO_DOCENTE), xmi_source="astah")
        expected = diagrams["usecase"]
        student = copy.deepcopy(expected)

        applied = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, actors=99),
        )
        assert applied.penalty_breakdown["classes"]["expected_used"] == 99
        assert applied.overall_similarity < 100.0


class TestSecuencia:
    def test_fragmentos_visibles_se_agregan_en_fragment_usage(self):
        diagrams = parse_xmi_file_multi(str(SECUENCIA_STARUML_FRAGMENTS), xmi_source="staruml")
        expected = diagrams["sequence"]
        student = copy.deepcopy(expected)
        weights = {
            "lifelines": 0.2,
            "sync_messages": 0.2,
            "async_messages": 0.1,
            "creation_messages": 0.1,
            "fragment_usage": 0.4,
        }

        applied = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, alt_fragments=2, loop_fragments=3),
            weights=weights,
        )
        assert applied.penalty_breakdown["fragment_usage"]["expected_used"] == 5
