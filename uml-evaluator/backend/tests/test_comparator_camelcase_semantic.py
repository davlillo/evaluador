"""
Regresión: el comparador normalizaba nombres (lower + sin acentos) ANTES de
pasarlos al SemanticMatcher, perdiendo el camelCase que el matcher necesita
para separar palabras compuestas ("fechaHora" -> "fecha hora"). Esto hacía
que typos de una letra en atributos/clases/casos de uso NO se perdonaran,
aunque el mismo par comparado directo con SemanticMatcher.similarity() sí
diera un score alto. Ver semantic_matcher.py y uml_comparator.py.

Requiere el modelo FastText instalado (backend/models/cc.es.300.*); si no
está disponible, se salta (mismo criterio que test_semantic_matcher.py).
"""
import pytest

from app.comparator.semantic_matcher import embeddings_model_exists, reset_embedding_cache
from app.comparator.uml_comparator import UMLComparator
from app.models.uml_elements import UMLActor, UMLAttribute, UMLClass, UMLDiagram, UMLUseCase

_HAS_MODEL = embeddings_model_exists()

pytestmark = pytest.mark.skipif(
    not _HAS_MODEL, reason="Modelo FastText no instalado (models/cc.es.300.kv|.vec)"
)


@pytest.fixture(autouse=True)
def _reset_cache():
    reset_embedding_cache()
    yield
    reset_embedding_cache()


@pytest.fixture
def comparator():
    return UMLComparator(use_semantic_matching=True)


def test_typo_camelcase_en_atributo_no_baja_la_nota(comparator):
    """Cita.fechaHora vs Cita.fehcaHora: mismo atributo, typo de transposición."""
    expected = UMLDiagram(
        name="esperado",
        diagram_type="class",
        classes=[UMLClass(name="Cita", attributes=[UMLAttribute(name="fechaHora")])],
    )
    student = UMLDiagram(
        name="estudiante",
        diagram_type="class",
        classes=[UMLClass(name="Cita", attributes=[UMLAttribute(name="fehcaHora")])],
    )

    result = comparator.compare(expected, student)

    assert result.attribute_similarity == 100.0
    class_result = result.class_results[0]
    assert class_result.missing_attributes == []
    assert class_result.extra_attributes == []


def test_typo_camelcase_en_clase_no_baja_la_nota(comparator):
    """Nombre de clase con typo de transposición en camelCase tampoco debe penalizar."""
    expected = UMLDiagram(
        name="esperado", diagram_type="class",
        classes=[UMLClass(name="GestionUsuario", attributes=[])],
    )
    student = UMLDiagram(
        name="estudiante", diagram_type="class",
        classes=[UMLClass(name="GestionUsario", attributes=[])],
    )

    result = comparator.compare(expected, student)

    assert result.class_similarity == 100.0
    assert result.missing_classes == []
    assert result.extra_classes == []


def test_typo_camelcase_en_caso_de_uso_ya_no_pierde_el_split(comparator):
    """
    Antes del fix, normalizar antes de matchear colapsaba "RegistrarCita" a
    "registrarcita" (un solo token), y la heurística de un-solo-token es más
    débil que la de frase (que compara palabra por palabra). El umbral de
    use_case es deliberadamente estricto (0.85) y no es parte de este fix,
    así que el caso se elige para que matchee una vez restaurado el split,
    no para forzar que cualquier typo de caso de uso pase.
    """
    expected = UMLDiagram(
        name="esperado", diagram_type="usecase",
        actors=[UMLActor(name="Doctor")],
        use_cases=[UMLUseCase(name="RegistrarCita")],
    )
    student = UMLDiagram(
        name="estudiante", diagram_type="usecase",
        actors=[UMLActor(name="Doctor")],
        use_cases=[UMLUseCase(name="RegistrarCitas")],
    )

    result = comparator.compare(expected, student)

    assert result.missing_use_cases == []
    assert result.extra_use_cases == []
