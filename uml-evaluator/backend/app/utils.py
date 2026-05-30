"""Utilidades compartidas entre módulos del evaluador."""

from typing import Dict


def normalize_weights_dict(raw: Dict[str, float], defaults: Dict[str, float]) -> Dict[str, float]:
    """Normaliza un diccionario de pesos a suma 1.0.

    Si la suma de raw es 0 o negativa, retorna defaults intactos.
    """
    total = sum(v for v in raw.values() if v > 0)
    if total <= 0:
        return dict(defaults)
    return {k: v / total for k, v in raw.items() if v > 0}
