# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Imprime la tabla nota-del-docente vs nota-del-sistema sobre sus 46 entregas.

Es el argumento para mostrarle al docente que el sistema reproduce su criterio.

Por defecto califica como la pantalla: sin matching semantico.

Uso:
    python scripts/reporte_calibracion.py
    python scripts/reporte_calibracion.py --con-semantica   # para comparar
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.comparator.calibracion import correr_calibracion  # noqa: E402


def main() -> None:
    # la pantalla manda use_semantic_matching=false: medido contra estas 46
    # notas, el matching semantico empeora el resultado
    semantica = "--con-semantica" in sys.argv
    resumen = correr_calibracion(use_semantic_matching=semantica)

    print("Matching semantico: %s" % ("si" if semantica else "no"))
    print()
    turno_actual = None
    for resultado in sorted(resumen.resultados, key=lambda r: (r.turno, r.carne)):
        if resultado.turno != turno_actual:
            turno_actual = resultado.turno
            print("=" * 72)
            print(turno_actual)
        print("  %-10s docente=%5.2f  sistema=%5.2f  delta=%+5.2f  %s" % (
            resultado.carne,
            resultado.nota_docente,
            resultado.nota_sistema,
            resultado.delta,
            ", ".join(resultado.desacuerdos)[:70],
        ))

    print()
    print("#" * 72)
    print("N=%d   MAE=%.3f   mediana=%.3f   peor=%.3f" % (
        resumen.total, resumen.mae, resumen.mediana, resumen.peor,
    ))
    for margen in (0.5, 1.0, 1.5, 2.0):
        print("  dentro de +-%.1f: %2d/%d (%.0f%%)" % (
            margen,
            resumen.dentro_de(margen),
            resumen.total,
            100 * resumen.proporcion_dentro_de(margen),
        ))
    print()
    print("Criterios con mas desacuerdo (docente vs sistema):")
    for etiqueta, veces in resumen.desacuerdos_por_criterio().items():
        print("  %3d/%d  %s" % (veces, resumen.total, etiqueta))


if __name__ == "__main__":
    main()
