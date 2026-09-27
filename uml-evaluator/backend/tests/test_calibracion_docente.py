# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""El sistema debe calificar parecido a como califico el docente a mano.

Este es el requisito que pidio el ingeniero: meter las entregas del ano pasado
y que las notas se parezcan a las suyas. La fixture
(test_files/calibracion/) trae sus 4 rubricas reales, los XMI de solucion, las
46 entregas que conservan XMI y la nota que el puso en Calificacion.xlsx.

Si un cambio en el parser o en el motor rompe esa correspondencia, este test
lo dice antes de que lo note el docente. Para ver el detalle alumno por alumno:

    python scripts/reporte_calibracion.py
"""
import pytest

from app.comparator.calibracion import RUBRICAS_JSON, correr_calibracion

# Margenes con holgura respecto de lo medido al calibrar (MAE 0.393,
# mediana 0.000, peor 2.000): fijan el piso sin volverse fragiles.
MAE_MAXIMO = 0.5
PEOR_ERROR_MAXIMO = 2.5
MINIMO_DENTRO_DE_MEDIO_PUNTO = 0.65
MINIMO_DENTRO_DE_UN_PUNTO = 0.85


@pytest.fixture(scope="module")
def resumen():
    if not RUBRICAS_JSON.exists():
        pytest.skip(
            "falta test_files/calibracion/rubricas.json; generalo con "
            "python scripts/build_calibracion_fixture.py",
        )
    # sin matching semantico: el resultado no debe depender de que el modelo
    # FastText (610 MB) este descargado en la maquina que corre los tests
    return correr_calibracion(use_semantic_matching=False)


def test_la_fixture_cubre_las_46_entregas_calificadas(resumen):
    assert resumen.total == 46


def test_el_error_promedio_se_mantiene_bajo(resumen):
    assert resumen.mae <= MAE_MAXIMO, (
        "MAE=%.3f sobre 10 puntos (limite %.2f). Corre "
        "scripts/reporte_calibracion.py para ver que criterio se movio."
        % (resumen.mae, MAE_MAXIMO)
    )


def test_la_mitad_de_las_notas_coincide_o_casi(resumen):
    assert resumen.mediana <= 0.5, "mediana=%.3f" % resumen.mediana


def test_la_mayoria_cae_dentro_de_medio_punto(resumen):
    proporcion = resumen.proporcion_dentro_de(0.5)
    assert proporcion >= MINIMO_DENTRO_DE_MEDIO_PUNTO, (
        "solo %d/%d dentro de +-0.5 (%.0f%%)"
        % (resumen.dentro_de(0.5), resumen.total, 100 * proporcion)
    )


def test_casi_todas_caen_dentro_de_un_punto(resumen):
    proporcion = resumen.proporcion_dentro_de(1.0)
    assert proporcion >= MINIMO_DENTRO_DE_UN_PUNTO, (
        "solo %d/%d dentro de +-1.0 (%.0f%%)"
        % (resumen.dentro_de(1.0), resumen.total, 100 * proporcion)
    )


def test_ninguna_entrega_se_desvia_demasiado(resumen):
    peores = sorted(resumen.resultados, key=lambda r: -r.error)[:3]
    assert resumen.peor <= PEOR_ERROR_MAXIMO, "peores: %s" % [
        "%s docente=%.2f sistema=%.2f" % (r.carne, r.nota_docente, r.nota_sistema)
        for r in peores
    ]


def test_no_hay_sesgo_sistematico_al_alza_ni_a_la_baja(resumen):
    """Si el motor fuera mas duro (o mas blando) que el docente en promedio,
    los deltas se irian todos para el mismo lado."""
    sesgo = sum(r.delta for r in resumen.resultados) / resumen.total
    assert abs(sesgo) <= 0.5, "sesgo medio=%.3f puntos" % sesgo
