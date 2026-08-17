"""
Contrato de claves de rúbrica vs. las que UMLComparator realmente consulta.
Las etiquetas Excel (association, actors, alt_fragments) no puntúan salvo
que coincidan con la clave interna del criterio.
"""
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
        assert applied.penalty_breakdown["classes"]["factor"] == pytest.approx(0.75)
        assert applied.overall_similarity != pytest.approx(similarity.overall_similarity, abs=0.01)

    def test_association_no_cambia_relationships(self):
        diagrams = parse_xmi_file_multi(str(SOLUCION_CORRECTA), xmi_source="astah")
        expected = diagrams["class"]
        student = copy.deepcopy(expected)

        baseline = _compare(expected, student, _profile(ScoringMode.EXPECTED_WITH_PENALTY))
        ignored = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, association=99),
        )
        assert ignored.overall_similarity == pytest.approx(baseline.overall_similarity, abs=0.01)
        assert "relationships" not in ignored.penalty_breakdown or ignored.penalty_breakdown.get(
            "relationships", {},
        ).get("expected_used") == baseline.penalty_breakdown.get("relationships", {}).get("expected_used")

        forced = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, relationships=1),
        )
        rel = forced.penalty_breakdown["relationships"]
        assert rel["expected_used"] == 1
        assert rel["score"] < 100.0


class TestCasosDeUso:
    def test_actors_no_aplica_classes_si(self):
        diagrams = parse_xmi_file_multi(str(CASO_USO_DOCENTE), xmi_source="astah")
        expected = diagrams["usecase"]
        student = copy.deepcopy(expected)
        n_actores = len(expected.classes)

        baseline = _compare(expected, student, _profile(ScoringMode.EXPECTED_WITH_PENALTY))
        ignored = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, actors=99),
        )
        assert ignored.overall_similarity == pytest.approx(baseline.overall_similarity, abs=0.01)

        applied = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, classes=n_actores + 5),
        )
        assert applied.penalty_breakdown["classes"]["expected_used"] == n_actores + 5
        assert applied.overall_similarity < baseline.overall_similarity


class TestSecuencia:
    def test_alt_fragments_no_aplica_fragment_usage_si(self):
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

        baseline = _compare(
            expected, student, _profile(ScoringMode.EXPECTED_WITH_PENALTY), weights=weights,
        )
        ignored = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, alt_fragments=1),
            weights=weights,
        )
        assert ignored.overall_similarity == pytest.approx(baseline.overall_similarity, abs=0.01)

        found = baseline.penalty_breakdown.get("fragment_usage", {}).get("delivered")
        if not found:
            pytest.skip("El fixture no registró fragment_usage en el breakdown")
        applied = _compare(
            expected, student,
            _profile(ScoringMode.EXPECTED_WITH_PENALTY, fragment_usage=1),
            weights=weights,
        )
        fu = applied.penalty_breakdown["fragment_usage"]
        assert fu["expected_used"] == 1
        if found > 1:
            assert fu["score"] < 100.0
            assert applied.overall_similarity < baseline.overall_similarity
