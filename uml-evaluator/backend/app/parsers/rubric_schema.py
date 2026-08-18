"""
Esquema compartido de la rúbrica Excel: nombres de hoja, columnas, y el
diccionario de alias español (lo que ve el profesor en la celda "Elemento")
→ element_type interno (la clave que usan ExpectedCount/RangeToleranceRule
en app.comparator.scoring_modes). Un solo lugar de verdad para que
generate_rubric_template.py y rubric_parser.py no diverjan.
"""

SHEET_CLASS = "Clases"
SHEET_USECASE = "CasosDeUso"
SHEET_SEQUENCE = "Secuencia"
SHEET_CONFIG = "Config"
SHEET_CLASS_RUBRIC = "RubricaClases"

COLUMNS = ["Elemento", "Cantidad esperada", "Notas"]
CLASS_RUBRIC_COLUMNS = [
    "Tipo criterio", "Nombre", "Peso %", "Clase origen", "Clase destino",
    "Tipo relación", "Extremo", "Valor esperado", "Cantidad esperada",
]

# (alias visible en Excel) -> element_type interno. El orden define el
# orden de filas en la plantilla generada.
CLASS_ELEMENT_ALIASES = [
    ("Clases", "classes"),
    ("Atributos totales", "attributes"),
    ("Métodos totales", "methods"),
    ("Asociación", "association"),
    ("Agregación", "aggregation"),
    ("Composición", "composition"),
    ("Herencia", "inheritance"),
    ("Implementación", "implementation"),
]

USECASE_ELEMENT_ALIASES = [
    ("Actores", "actors"),
    ("Casos de uso", "use_cases"),
    ("Relaciones actor-CU", "actor_associations"),
    ("Include", "include_relations"),
    ("Extend", "extend_relations"),
]

SEQUENCE_ELEMENT_ALIASES = [
    ("Líneas de vida", "lifelines"),
    ("Mensajes síncronos", "sync_messages"),
    ("Mensajes asíncronos", "async_messages"),
    ("Mensajes de creación", "creation_messages"),
    ("Fragmentos alt", "alt_fragments"),
    ("Fragmentos loop", "loop_fragments"),
]

SHEET_ALIASES = {
    SHEET_CLASS: CLASS_ELEMENT_ALIASES,
    SHEET_USECASE: USECASE_ELEMENT_ALIASES,
    SHEET_SEQUENCE: SEQUENCE_ELEMENT_ALIASES,
}

SHEET_TO_DIAGRAM_TYPE = {
    SHEET_CLASS: "class",
    SHEET_USECASE: "usecase",
    SHEET_SEQUENCE: "sequence",
}

# (etiqueta en español visible en Excel) -> ScoringMode interno. El profesor
# elige por la etiqueta española; el parser la traduce al código interno.
MODE_LABEL_ALIASES = [
    ("Similitud (comparar contra la solución)", "similarity"),
    ("Cantidades esperadas - sin descuento", "expected_no_penalty"),
    ("Cantidades esperadas - con descuento", "expected_with_penalty"),
    ("Similitud con descuento", "similarity_with_penalty"),
]

MODE_LABEL_TO_INTERNAL = dict(MODE_LABEL_ALIASES)
MODE_INTERNAL_TO_LABEL = {v: k for k, v in MODE_LABEL_ALIASES}

# Mantenido por compatibilidad interna (códigos que espera ScoringMode).
VALID_MODES = [internal for _, internal in MODE_LABEL_ALIASES]

# Etiquetas en español mostradas en la lista desplegable del Excel.
VALID_MODE_LABELS = [label for label, _ in MODE_LABEL_ALIASES]

# Modos retirados que pueden aparecer en rúbricas ya distribuidas. Se
# aceptan al parsear y se mapean al equivalente vigente más cercano en
# vez de rechazar el archivo del docente.
RETIRED_MODE_ALIASES = {
    "hybrid": "expected_with_penalty",
    "range_tolerance": "expected_with_penalty",
    "Híbrido (similitud + cantidades esperadas)": "expected_with_penalty",
    "Rango aceptable (mínimo y máximo)": "expected_with_penalty",
    "Cantidades esperadas - sin descuento por exceso": "expected_no_penalty",
    "Cantidades esperadas - con descuento por exceso": "expected_with_penalty",
    "Similitud con descuento por exceso": "similarity_with_penalty",
}

CONFIG_ROWS = [
    ("Modo de evaluación", MODE_INTERNAL_TO_LABEL["expected_with_penalty"]),
]
