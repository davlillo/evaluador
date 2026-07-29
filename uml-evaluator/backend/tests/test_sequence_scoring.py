"""
Tests del cálculo de similitud en diagramas de secuencia.

Regresión: comparar un diagrama de secuencia contra SÍ MISMO debe dar 100%.
Antes daba 65% porque los criterios con 0 elementos esperados (async, creation)
puntuaban 0% y arrastraban el promedio ponderado.
"""
import copy
import os

import pytest

from app.parsers.xmi_parser import parse_xmi_file_multi
from app.comparator.uml_comparator import compare_uml_diagrams, UMLComparator

FIXTURE = os.path.join(os.path.dirname(__file__), '..', 'test_files', 'secuencia_astah.xmi')

SEQ_WEIGHTS = {
    'classes': 0.40,
    'sync_messages': 0.30,
    'async_messages': 0.10,
    'creation_messages': 0.05,
    'fragment_usage': 0.10,
    'message_order': 0.15,
}

# Pesos como en /api/compare-batch (esquema legacy classes/relationships).
BATCH_SEQ_WEIGHTS = {
    'classes': 0.40,
    'attributes': 0.0,
    'methods': 0.0,
    'relationships': 0.60,
}


@pytest.fixture
def sequence_diagram():
    diagrams = parse_xmi_file_multi(FIXTURE, xmi_source='astah')
    seq = diagrams.get('sequence')
    assert seq is not None, "El fixture debe contener un diagrama de secuencia"
    return seq


class TestSecuenciaMismoArchivo:
    def test_identico_da_100(self, sequence_diagram):
        result = compare_uml_diagrams(
            sequence_diagram, sequence_diagram, weights=SEQ_WEIGHTS,
        )
        assert result.overall_similarity == pytest.approx(100.0, abs=0.01), (
            f"Mismo archivo debe dar 100%, dio {result.overall_similarity}"
        )

    def test_identico_batch_weights_da_100(self, sequence_diagram):
        result = compare_uml_diagrams(
            sequence_diagram, sequence_diagram, weights=BATCH_SEQ_WEIGHTS,
        )
        assert result.overall_similarity == pytest.approx(100.0, abs=0.01)


class TestOrdenMensajes:
    def test_orden_distinto_penaliza(self, sequence_diagram):
        assert len(sequence_diagram.messages) >= 2, "fixture necesita al menos 2 mensajes"
        student = copy.deepcopy(sequence_diagram)
        student.messages = list(reversed(student.messages))

        result = compare_uml_diagrams(
            sequence_diagram, student, weights=BATCH_SEQ_WEIGHTS,
        )
        assert result.message_order_score < 100.0, (
            f"orden invertido debería bajar order_score, dio {result.message_order_score}"
        )
        assert result.overall_similarity < 100.0, (
            f"orden invertido debería bajar overall, dio {result.overall_similarity}"
        )


class TestF1CriteriosVacios:
    def test_f1_ambos_cero_es_100(self):
        # Sin nada esperado y sin nada encontrado = coincidencia perfecta.
        c = UMLComparator()
        assert c._f1_similarity_counts(0, 0, 0) == 100.0

    def test_f1_esperado_cero_pero_hay_extra_es_0(self):
        c = UMLComparator()
        assert c._f1_similarity_counts(0, 0, 3) == 0.0

    def test_f1_normal_perfecto(self):
        c = UMLComparator()
        assert c._f1_similarity_counts(3, 3, 3) == pytest.approx(100.0)
