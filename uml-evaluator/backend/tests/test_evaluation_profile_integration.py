"""
Tests de integración del EvaluationProfile con UMLComparator: confirman que
(a) sin perfil el comportamiento es idéntico al actual (regresión cero) y
(b) con perfil, los modos nuevos se aplican correctamente end-to-end sobre
un diagrama de clases real.
"""
import copy
import os

import pytest

from app.models.uml_elements import UMLClass
from app.parsers.xmi_parser import parse_xmi_file_multi
from app.comparator.uml_comparator import UMLComparator
from app.comparator.scoring_modes import (
    EvaluationProfile, ScoringMode, ExpectedCount,
)

FIXTURE = os.path.join(os.path.dirname(__file__), '..', 'test_files', 'solucion_correcta.xmi')


@pytest.fixture
def class_diagram():
    diagrams = parse_xmi_file_multi(FIXTURE, xmi_source='astah')
    return diagrams['class']


class TestSinPerfilEsIdenticoAlActual:
    def test_comparar_consigo_mismo_sin_perfil(self, class_diagram):
        comparator = UMLComparator()
        result = comparator.compare(class_diagram, class_diagram)
        assert result.overall_similarity == pytest.approx(100.0, abs=0.01)
        # Sin evaluation_profile, ni siquiera se registra scoring_mode/breakdown.
        assert result.scoring_mode == "similarity"
        assert result.penalty_breakdown == {}

    def test_con_perfil_similarity_explicito_registra_breakdown_sin_alterar_score(self, class_diagram):
        # Con un perfil explícito (aunque sea modo similarity) el score no
        # cambia, pero el breakdown SÍ se registra: el export a Excel
        # necesita las cantidades esperada/registrada en cualquier modo.
        profile = EvaluationProfile(mode=ScoringMode.SIMILARITY)
        comparator = UMLComparator(evaluation_profile=profile)
        result = comparator.compare(class_diagram, class_diagram)
        assert result.overall_similarity == pytest.approx(100.0, abs=0.01)
        assert result.scoring_mode == "similarity"
        assert 'classes' in result.penalty_breakdown
        assert result.penalty_breakdown['classes']['factor'] is None


class TestModoExpectedConPenalizacion:
    def test_clases_extra_penalizan_overall(self, class_diagram):
        student = copy.deepcopy(class_diagram)
        student.classes.append(UMLClass(name="ClaseExtraNoEsperada"))

        profile = EvaluationProfile(
            mode=ScoringMode.EXPECTED_WITH_PENALTY,
            expected_counts={
                'classes': ExpectedCount(element_type='classes', expected_quantity=3),
            },
        )
        comparator = UMLComparator(evaluation_profile=profile)
        result = comparator.compare(class_diagram, student)

        assert result.scoring_mode == "expected_with_penalty"
        assert 'classes' in result.penalty_breakdown
        assert result.penalty_breakdown['classes']['excess_units'] == 1
        # Curva normal: esperaban 3, entregó 4 → factor 3/4 = 0.75 → 25 pts perdidos.
        assert result.penalty_breakdown['classes']['factor'] == pytest.approx(0.75)
        assert result.penalty_breakdown['classes']['penalty_applied'] == pytest.approx(25.0)
        assert result.overall_similarity < 100.0

    def test_modo_no_penalty_ignora_clase_extra(self, class_diagram):
        student = copy.deepcopy(class_diagram)
        student.classes.append(UMLClass(name="ClaseExtraNoEsperada"))

        profile = EvaluationProfile(
            mode=ScoringMode.EXPECTED_NO_PENALTY,
            expected_counts={
                'classes': ExpectedCount(element_type='classes', expected_quantity=3),
            },
        )
        comparator = UMLComparator(evaluation_profile=profile)
        result = comparator.compare(class_diagram, student)

        assert result.penalty_breakdown['classes']['penalty_applied'] == 0.0
