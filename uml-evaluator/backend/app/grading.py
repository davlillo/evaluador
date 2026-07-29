"""
Conversión de porcentaje de similitud a nota académica 0-10.

Fuente única de verdad de la calificación en el backend (espejo de
`app/src/lib/rubric.ts` en el frontend). La nota que calcula el motor es una
sugerencia: el docente puede sobrescribirla en la UI antes de exportar.
"""

DEFAULT_NOTA_APROBACION = 6.0


def percent_to_nota(percent: float) -> float:
    """Convierte 0-100 a nota 0-10 con un decimal."""
    clamped = max(0.0, min(100.0, float(percent)))
    return round(clamped / 10.0, 1)


def is_aprobado(nota: float, umbral: float = DEFAULT_NOTA_APROBACION) -> bool:
    return nota >= umbral


def grade_summary(percent: float, umbral: float = DEFAULT_NOTA_APROBACION) -> dict:
    """Devuelve {similarity, nota, aprobado} a partir de un porcentaje."""
    nota = percent_to_nota(percent)
    return {
        'similarity': round(float(percent), 2),
        'nota': nota,
        'aprobado': is_aprobado(nota, umbral),
    }
