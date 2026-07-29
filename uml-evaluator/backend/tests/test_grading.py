"""Tests de la conversión porcentaje -> nota 0-10."""
import pytest

from app.grading import percent_to_nota, is_aprobado, grade_summary


class TestPercentToNota:
    def test_cien_es_diez(self):
        assert percent_to_nota(100) == 10.0

    def test_cero_es_cero(self):
        assert percent_to_nota(0) == 0.0

    def test_ochenta_y_seis_es_8_6(self):
        assert percent_to_nota(86) == 8.6

    def test_un_decimal(self):
        assert percent_to_nota(85.55) == 8.6

    def test_clamp_superior(self):
        assert percent_to_nota(140) == 10.0

    def test_clamp_inferior(self):
        assert percent_to_nota(-20) == 0.0


class TestAprobado:
    def test_aprobado_por_defecto_6(self):
        assert is_aprobado(6.0) is True
        assert is_aprobado(5.9) is False

    def test_umbral_configurable(self):
        assert is_aprobado(7.0, umbral=7.5) is False
        assert is_aprobado(8.0, umbral=7.5) is True


class TestGradeSummary:
    def test_resumen_completo(self):
        s = grade_summary(86)
        assert s['similarity'] == 86
        assert s['nota'] == 8.6
        assert s['aprobado'] is True

    def test_resumen_reprobado(self):
        s = grade_summary(40)
        assert s['nota'] == 4.0
        assert s['aprobado'] is False
