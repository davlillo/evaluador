"""
Tests del motor semántico: heurística determinista + embeddings FastText opcionales.
"""
import os

import pytest

from app.comparator.semantic_matcher import (
    SemanticMatcher,
    embeddings_model_exists,
    reset_embedding_cache,
)

_HAS_MODEL = embeddings_model_exists()


@pytest.fixture
def matcher():
    """Solo heurística: tests deterministas sin depender del .kv."""
    return SemanticMatcher(use_embeddings=False)


class TestNormalizacion:
    def test_identicos(self, matcher):
        assert matcher.similarity("Cliente", "Cliente") == 1.0

    def test_ignora_mayusculas(self, matcher):
        assert matcher.similarity("cliente", "CLIENTE") == 1.0

    def test_ignora_acentos(self, matcher):
        assert matcher.similarity("Médico", "medico") == 1.0

    def test_espacios_sobrantes(self, matcher):
        assert matcher.similarity("  Cliente  ", "Cliente") == 1.0

    def test_vacio_da_cero(self, matcher):
        assert matcher.similarity("", "Cliente") == 0.0
        assert matcher.similarity("Cliente", "") == 0.0


class TestTokenizacion:
    def test_camel_case_equivale_a_espacios(self, matcher):
        assert matcher.similarity("RegistrarCliente", "Registrar Cliente", kind="use_case") == 1.0

    def test_snake_case_equivale_a_espacios(self, matcher):
        assert matcher.similarity("registrar_cliente", "registrar cliente", kind="use_case") == 1.0


class TestDistanciaEdicion:
    def test_typo_corto_de_una_letra(self, matcher):
        assert matcher.similarity("Cliente", "Clientte", kind="actor") > 0.7

    def test_palabras_distintas_no_coinciden(self, matcher):
        assert matcher.similarity("Vendedor", "Comprador", kind="actor") < 0.6


class TestSinonimosGenericos:
    def test_verbos_uml_genericos(self, matcher):
        assert matcher.similarity("Crear usuario", "Registrar usuario", kind="use_case") >= 0.8

    def test_no_hay_dominio_medico_hardcodeado(self, matcher):
        assert matcher.similarity("Doctor", "Paciente", kind="actor") < 0.6


class TestSinonimosPorDominio:
    def test_dominio_inyectable(self):
        dominio = [["doctor", "medico", "facultativo"]]
        m = SemanticMatcher(domain_synonyms=dominio, use_embeddings=False)
        assert m.similarity("Doctor", "Facultativo", kind="actor") >= 0.9

    def test_sin_dominio_no_aplica(self, matcher):
        assert matcher.similarity("Doctor", "Facultativo", kind="actor") < 0.6


class TestFrasesCasosDeUso:
    def test_frase_identica(self, matcher):
        assert matcher.similarity("Realizar venta", "Realizar venta", kind="use_case") == 1.0

    def test_frase_parcial(self, matcher):
        s = matcher.similarity("Registrar cliente", "Registrar proveedor", kind="use_case")
        assert 0.0 < s < 1.0

    def test_orden_distinto_penaliza(self, matcher):
        s = matcher.similarity("Cliente registrar", "Registrar cliente", kind="use_case")
        assert s < 1.0


class TestFindBestMatch:
    def test_encuentra_exacto(self, matcher):
        best, score = matcher.find_best_match("Cliente", ["Producto", "Cliente", "Factura"])
        assert best == "Cliente"
        assert score == 1.0

    def test_respeta_threshold(self, matcher):
        best, score = matcher.find_best_match(
            "Zxcvbn", ["Producto", "Cliente"], threshold=0.5, kind="actor"
        )
        assert best is None
        assert score == 0.0


class TestApiPublica:
    def test_is_available_no_falla(self, matcher):
        assert matcher.is_available() is True

    def test_strip_accents_estatico(self):
        assert SemanticMatcher.strip_accents("áéíóú") == "aeiou"


class TestDegradacionSinModelo:
    def test_doctor_medico_sin_embeddings_puede_ser_cero(self):
        """Sin capa embedding, doctor/medico no son equivalentes por heurística."""
        m = SemanticMatcher(use_embeddings=False)
        assert m.similarity("doctor", "medico", kind="actor") < 0.6


@pytest.mark.skipif(not _HAS_MODEL, reason="Modelo FastText no instalado (models/cc.es.300.kv|.vec)")
class TestEmbeddingsFastText:
    @pytest.fixture(autouse=True)
    def _reset_cache(self):
        reset_embedding_cache()
        yield
        reset_embedding_cache()

    @pytest.fixture
    def emb_matcher(self):
        m = SemanticMatcher(use_embeddings=True)
        assert m.embeddings_available(), "Se esperaba poder cargar el modelo"
        return m

    def test_identico_sigue_1(self, emb_matcher):
        assert emb_matcher.similarity("Cliente", "Cliente") == 1.0

    def test_doctor_medico(self, emb_matcher):
        score = emb_matcher.similarity("doctor", "medico", kind="actor")
        assert score >= 0.65, f"doctor/medico dio {score}"

    def test_cantante_artista(self, emb_matcher):
        score = emb_matcher.similarity("cantante", "artista", kind="actor")
        assert score >= 0.65, f"cantante/artista dio {score}"

    def test_find_best_match_sinonimo(self, emb_matcher):
        best, score = emb_matcher.find_best_match(
            "medico", ["paciente", "doctor", "cita"], threshold=0.65, kind="actor",
        )
        assert best == "doctor"
        assert score >= 0.65
