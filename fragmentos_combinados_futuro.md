# Punto 5 — Comparación de Fragmentos Combinados en Diagramas de Secuencia

> **Estado**: Pendiente de implementación futura.
> Los puntos 1–4 ya están implementados (extracción, modelo, UI, PDF).
> Este documento describe cómo extender el **comparador** para que los fragmentos
> combinados (`alt`, `loop`, `opt`, etc.) afecten la nota final del estudiante.

---

## Contexto

Actualmente el comparador de secuencia (`uml_comparator.py`) evalúa:

- **Lifelines**: qué líneas de vida están presentes.
- **Mensajes**: qué mensajes existen (nombre, origen, destino).

Lo que **no** evalúa todavía:

- Si el estudiante usó el operador correcto (`alt` vs `opt` vs `loop`).
- Si los mensajes están dentro del fragmento correcto.
- Si la guardia del fragmento es correcta.

---

## Estructura de datos disponible (ya implementada)

Cada `UMLMessage` tiene:

```python
@dataclass
class UMLMessage:
    name: str
    source_lifeline: str
    target_lifeline: str
    message_sort: str         # synchCall, reply, asynchCall
    sequence_order: int
    fragment: Optional[str]   # "alt", "loop [i < n]", "opt [cond]" — None si no aplica
```

El campo `fragment` contiene la etiqueta completa `"operador [guardia]"` o solo `"operador"` si no hay guardia definida.

---

## Plan de Implementación

### Paso A — Modelo de Fragmento Explícito (Opcional pero recomendado)

Agregar un dataclass `UMLCombinedFragment` al modelo para representar el fragmento con todos sus operandos, no solo como string en el mensaje.

```python
@dataclass
class UMLFragmentOperand:
    guard: str = ""                  # Condición de guardia (puede ser vacía)
    message_ids: List[str] = field(default_factory=list)  # IDs de mensajes

@dataclass
class UMLCombinedFragment:
    operator: str                    # "alt", "loop", "opt", etc.
    operands: List[UMLFragmentOperand] = field(default_factory=list)
```

Y agregar `fragments: List[UMLCombinedFragment]` a `UMLDiagram`.

---

### Paso B — Extraer fragmentos completos en el Parser

En `xmi_parser.py`, dentro de `_extract_sequence_diagram`, después del Paso 1.5, agregar:

```python
# Paso 1.6: Construir lista de UMLCombinedFragment
fragments: List[UMLCombinedFragment] = []
for elem in root.iter():
    if self._local_tag(elem) == 'CombinedFragment' and elem.get('operator') and elem.get('xmi.id'):
        cf = UMLCombinedFragment(operator=elem.get('operator'))
        for cf_child in elem:
            if not self._local_tag(cf_child).endswith('operand'):
                continue
            for operand_elem in cf_child:
                if self._local_tag(operand_elem) != 'InteractionOperand':
                    continue
                guard = # ... extraer guardia como ya lo hace el Paso 1.5
                op = UMLFragmentOperand(guard=guard)
                # Agregar IDs de mensajes de este operando
                for op_child in operand_elem:
                    if self._local_tag(op_child).endswith('message'):
                        for msg_ref in op_child:
                            op.message_ids.append(msg_ref.get('xmi.idref', ''))
                cf.operands.append(op)
        fragments.append(cf)
diagram.fragments = fragments
```

---

### Paso C — Lógica de Comparación en `uml_comparator.py`

Agregar función `compare_fragments(expected, student)`:

```python
def compare_fragments(
    expected_fragments: List[UMLCombinedFragment],
    student_fragments: List[UMLCombinedFragment],
) -> dict:
    """
    Compara los fragmentos combinados de dos diagramas de secuencia.
    Retorna un score entre 0.0 y 1.0 y detalles de diferencias.
    """
    if not expected_fragments:
        return {"score": 1.0, "missing": [], "extra": [], "operator_mismatch": []}

    score = 0.0
    missing = []
    extra = []
    operator_mismatch = []

    # Estrategia: comparar por operador y cantidad de operandos
    matched = []
    for exp_frag in expected_fragments:
        best_match = None
        best_score = 0.0
        for stu_frag in student_fragments:
            if stu_frag in matched:
                continue
            s = _fragment_similarity(exp_frag, stu_frag)
            if s > best_score:
                best_score = s
                best_match = stu_frag
        if best_match and best_score >= 0.5:
            matched.append(best_match)
            score += best_score
        else:
            missing.append(exp_frag.operator)

    extra = [f.operator for f in student_fragments if f not in matched]
    final_score = score / len(expected_fragments) if expected_fragments else 1.0

    return {
        "score": round(final_score, 4),
        "missing": missing,
        "extra": extra,
        "operator_mismatch": operator_mismatch,
    }

def _fragment_similarity(exp: UMLCombinedFragment, stu: UMLCombinedFragment) -> float:
    """Score de 0.0 a 1.0 entre dos fragmentos."""
    # Penalizar fuertemente si el operador es diferente
    operator_score = 1.0 if exp.operator == stu.operator else 0.2
    # Comparar cantidad de operandos (ramas)
    exp_ops = len(exp.operands)
    stu_ops = len(stu.operands)
    operand_score = 1.0 - abs(exp_ops - stu_ops) / max(exp_ops, stu_ops, 1)
    return operator_score * 0.7 + operand_score * 0.3
```

---

### Paso D — Integrar en el resultado de comparación

En la función `compare_sequence_diagrams` (o donde se calcule el `overall_similarity`), agregar:

```python
fragment_result = compare_fragments(
    expected.fragments or [],
    student.fragments or [],
)
fragment_score = fragment_result["score"]

# Peso sugerido: 15% del total de la comparación de secuencia
FRAGMENT_WEIGHT = 0.15
MESSAGE_WEIGHT  = 0.60
LIFELINE_WEIGHT = 0.25

overall = (
    lifeline_score * LIFELINE_WEIGHT +
    message_score  * MESSAGE_WEIGHT  +
    fragment_score * FRAGMENT_WEIGHT
)
```

---

### Paso E — Serializar y mostrar en el reporte

En el JSON de respuesta, agregar a `sequence_details`:

```json
{
  "fragment_score": 0.85,
  "fragment_details": {
    "score": 0.85,
    "missing": ["loop"],
    "extra": [],
    "operator_mismatch": []
  }
}
```

En `SequenceComparison.tsx`, agregar una sección de resumen de fragmentos:

```tsx
{result.sequence_details?.fragment_details && (
  <FragmentSummary details={result.sequence_details.fragment_details} />
)}
```

---

## Consideraciones de diseño

| Aspecto | Decisión recomendada |
|---|---|
| Peso del fragmento | 15% del total (ajustable desde UI de pesos) |
| Operador diferente | Penalizar 80% la similitud del fragmento |
| Guardia diferente | Penalizar 20% adicional (opcional, depende del docente) |
| Fragmento ausente | Score 0 para ese fragmento |
| Fragmento extra | No penalizar (el estudiante hizo más de lo pedido) |
| Anidamiento | Ignorar por ahora, solo comparar primer nivel |

---

## Operadores soportados por Astah

Todos los que aparecen en el dropdown de Astah son válidos en el XMI:

`alt`, `assert`, `break`, `consider`, `critical`, `ignore`, `loop`, `neg`, `opt`, `par`, `seq`, `strict`

El parser ya los captura correctamente desde `CombinedFragment[operator]`.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `app/models/uml_elements.py` | Agregar `UMLCombinedFragment`, `UMLFragmentOperand`, campo `fragments` a `UMLDiagram` |
| `app/parsers/xmi_parser.py` | Paso 1.6 para extraer fragmentos completos |
| `app/comparators/uml_comparator.py` | `compare_fragments()` y `_fragment_similarity()` |
| `app/api/main.py` | Incluir `fragment_score` en el response de comparación |
| `app/src/types/comparison.ts` | Tipos `FragmentResult`, `FragmentDetail` |
| `app/src/components/results/SequenceComparison.tsx` | Componente `FragmentSummary` |
