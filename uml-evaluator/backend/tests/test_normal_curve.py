"""
Tests de la curva normal min(E,R)/max(E,R), la fórmula real del docente.

Los valores esperados salen de su hoja de cálculo (Calificación.xlsx), donde
la fórmula por criterio es:

    =IF(C>=D, (D/C)*B, IF(C<D, (C/D)*B, 0))

con C=Esperados, D=Modelados, B=peso. Es decir factor × peso, y el total del
turno es SUM(ponderadas) × 10.
"""
import pytest

from app.comparator.scoring_modes import (
    ScoringMode, normal_curve_factor, score_criterion,
)


class TestFactorCurvaNormal:
    @pytest.mark.parametrize("expected,delivered,esperado_factor", [
        (4, 4, 1.0),        # coincide exacto
        (4, 5, 0.8),        # 4/5
        (4, 6, 2 / 3),      # 4/6
        (4, 3, 0.75),       # 3/4
        (4, 2, 0.5),        # 2/4
    ])
    def test_ejemplos_del_pedido(self, expected, delivered, esperado_factor):
        assert normal_curve_factor(expected, delivered) == pytest.approx(esperado_factor)

    @pytest.mark.parametrize("expected,delivered,peso,ponderada", [
        (6, 9, 0.2, 0.1333),    # fila real: Clases, 6 esperadas, 9 modeladas
        (5, 10, 0.2, 0.1000),   # fila real: Clases, 5 esperadas, 10 modeladas
        (6, 4, 0.2, 0.1333),    # fila real: Clases, 6 esperadas, 4 modeladas
        (5, 6, 0.2, 0.1667),
        (5, 7, 0.2, 0.1429),
        (5, 8, 0.2, 0.1250),
    ])
    def test_notas_ponderadas_del_excel_del_docente(self, expected, delivered, peso, ponderada):
        factor = normal_curve_factor(expected, delivered)
        assert factor * peso == pytest.approx(ponderada, abs=0.0001)

    def test_es_simetrica(self):
        # Penaliza igual entregar de más que de menos.
        assert normal_curve_factor(6, 9) == pytest.approx(normal_curve_factor(9, 6))
        assert normal_curve_factor(4, 2) == pytest.approx(normal_curve_factor(2, 4))

    def test_maximo_solo_cuando_coincide_exacto(self):
        assert normal_curve_factor(4, 4) == 1.0
        assert normal_curve_factor(4, 5) < 1.0
        assert normal_curve_factor(4, 3) < 1.0

    def test_decrece_conforme_crece_la_diferencia(self):
        factores = [normal_curve_factor(4, r) for r in (4, 5, 6, 7, 8)]
        assert factores == sorted(factores, reverse=True)

    def test_casos_borde(self):
        assert normal_curve_factor(0, 0) == 1.0   # nada esperado, nada entregado
        assert normal_curve_factor(0, 3) == 0.0   # no se pedía nada y entregó
        assert normal_curve_factor(3, 0) == 0.0   # se pedían 3 y no entregó


class TestExpectedWithPenalty:
    def test_usa_la_curva_contra_la_cantidad_de_rubrica(self):
        # Se esperan 4, entrega 6 → factor 4/6 = 0.6667 → 66.67 pts
        r = score_criterion(
            mode=ScoringMode.EXPECTED_WITH_PENALTY, similarity_f1=0.0,
            n_expected_ref=4, n_expected_rubric=4, n_found=6, n_correct=4,
        )
        assert r["score"] == pytest.approx(66.667, abs=0.01)
        assert r["factor"] == pytest.approx(2 / 3, abs=0.0001)
        assert r["expected_used"] == 4
        assert r["delivered"] == 6
        assert r["excess_units"] == 2

    def test_entregar_de_menos_tambien_penaliza(self):
        r = score_criterion(
            mode=ScoringMode.EXPECTED_WITH_PENALTY, similarity_f1=0.0,
            n_expected_ref=4, n_expected_rubric=4, n_found=2, n_correct=2,
        )
        assert r["score"] == pytest.approx(50.0)
        assert r["deficit_units"] == 2

    def test_coincidencia_exacta_da_100(self):
        r = score_criterion(
            mode=ScoringMode.EXPECTED_WITH_PENALTY, similarity_f1=0.0,
            n_expected_ref=4, n_expected_rubric=4, n_found=4, n_correct=4,
        )
        assert r["score"] == pytest.approx(100.0)
        assert r["penalty_applied"] == pytest.approx(0.0)

    def test_sin_rubrica_cae_al_conteo_de_la_referencia(self):
        r = score_criterion(
            mode=ScoringMode.EXPECTED_WITH_PENALTY, similarity_f1=0.0,
            n_expected_ref=5, n_expected_rubric=None, n_found=10, n_correct=5,
        )
        assert r["score"] == pytest.approx(50.0)
        assert r["expected_used"] == 5


class TestExpectedNoPenalty:
    def test_exceso_no_descuenta(self):
        r = score_criterion(
            mode=ScoringMode.EXPECTED_NO_PENALTY, similarity_f1=0.0,
            n_expected_ref=4, n_expected_rubric=4, n_found=6, n_correct=4,
        )
        assert r["score"] == pytest.approx(100.0)
        assert r["penalty_applied"] == pytest.approx(0.0)

    def test_defecto_si_baja_por_recall(self):
        r = score_criterion(
            mode=ScoringMode.EXPECTED_NO_PENALTY, similarity_f1=0.0,
            n_expected_ref=4, n_expected_rubric=4, n_found=3, n_correct=3,
        )
        assert r["score"] == pytest.approx(75.0)


class TestSimilarityWithPenalty:
    def test_curva_contra_el_conteo_de_la_referencia(self):
        # Referencia tiene 5, estudiante entrega 8 → 5/8 = 0.625 → 62.5
        r = score_criterion(
            mode=ScoringMode.SIMILARITY_WITH_PENALTY, similarity_f1=76.923,
            n_expected_ref=5, n_expected_rubric=None, n_found=8, n_correct=5,
        )
        assert r["score"] == pytest.approx(62.5)
        assert r["excess_units"] == 3


class TestSimilarity:
    def test_no_altera_el_score_pero_registra_cantidades(self):
        r = score_criterion(
            mode=ScoringMode.SIMILARITY, similarity_f1=76.9,
            n_expected_ref=5, n_expected_rubric=None, n_found=8, n_correct=5,
        )
        assert r["score"] == pytest.approx(76.9)
        assert r["factor"] is None
        # El export a Excel necesita estas cantidades incluso en modo similitud.
        assert r["expected_used"] == 5
        assert r["delivered"] == 8
