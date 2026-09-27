# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""
Exporta el resultado de una evaluación de lote a un archivo Excel (.xlsx)
con 4 hojas: Hoja de calificación (el formato propio del docente, un bloque
por estudiante con la fórmula viva), Notas (resumen por estudiante), Detalle
(criterio por criterio, con las cantidades esperada/registrada y el factor de
curva aplicado), y Resumen (metadatos del lote).

Reemplaza el CSV plano anterior (app/src/lib/batch-csv.ts en el frontend),
que solo tenía Carné/Similitud/Nota/Estado sin ningún desglose.

El frontend reenvía el JSON del batch tal cual lo tiene en pantalla (no se
re-evalúa acá), junto con las notas que el docente haya editado a mano
(nota_overrides), porque esas ediciones solo viven en el cliente.
"""
import io
from datetime import datetime
from typing import Any, Dict, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.grading import percent_to_nota, is_aprobado

#: Equipo que desarrolló el sistema; firma cada Excel exportado.
AUTORES = "davlillos"

HEADER_FILL = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)
TITLE_FONT = Font(bold=True, size=13)

DIAGRAM_LABELS = {"class": "Clases", "usecase": "Casos de uso", "sequence": "Secuencia"}
CRITERION_LABELS = {
    "classes": "Cantidad de clases",
    "relationship": "Relación",
    "multiplicity": "Multiplicidad",
    "association_class": "Clase de asociación",
}
RELATIONSHIP_LABELS = {
    "association": "Asociación",
    "aggregation": "Agregación",
    "composition": "Composición",
    "association_class": "Clase de asociación",
}


def _write_header(ws, headers: list[str]) -> None:
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}1"


def _run_similarity(run: Dict[str, Any], diagram_type: str) -> Optional[float]:
    if run.get("status") != "ok":
        return None
    comparison = run.get("comparison") or {}
    return comparison.get("overall_similarity", run.get("similarity"))


def _write_notas_sheet(wb: Workbook, batch: Dict[str, Any], nota_overrides: Dict[str, float]) -> None:
    ws = wb.create_sheet("Notas")
    diagram_types = [d for d in ("class", "usecase", "sequence") if d in DIAGRAM_LABELS]
    headers = ["Carné", "Similitud (%)", "Nota (0-10)", "Estado"] + [
        f"{DIAGRAM_LABELS[d]} (%)" for d in diagram_types
    ]
    _write_header(ws, headers)

    for r in batch.get("results", []):
        student_id = r.get("student_id", "")
        if r.get("status") == "error":
            ws.append([student_id, None, None, "Error"] + [None] * len(diagram_types))
            continue

        final_score = float(r.get("final_score", 0.0))
        nota = nota_overrides.get(student_id)
        if nota is None:
            nota = r.get("nota", percent_to_nota(final_score))
        estado = "Completo" if r.get("complete") else "Incompleto"

        runs = r.get("runs", {})
        row = [student_id, round(final_score, 2), round(float(nota), 1), estado]
        for d in diagram_types:
            sim = _run_similarity(runs.get(d, {}), d)
            row.append(round(sim, 2) if sim is not None else None)
        ws.append(row)

    ws.column_dimensions["A"].width = 16
    for col in ("B", "C", "D"):
        ws.column_dimensions[col].width = 14
    for i in range(len(diagram_types)):
        ws.column_dimensions[get_column_letter(5 + i)].width = 16


def _iter_criteria(comparison: Dict[str, Any]):
    """Recorre los criterios de un ComparisonResult ya serializado (to_dict),
    combinando breakdown (expected/found/correct/similarity) con
    penalty_breakdown (factor/expected_used/delivered/penalty_applied)
    cuando exista."""
    class_rubric = comparison.get("class_rubric_breakdown") or []
    if class_rubric:
        for row in class_rubric:
            expected = row.get("expected", "")
            modeled = row.get("modeled", "")
            yield (
                row.get("label", row.get("rule_id", "criterio")),
                expected,
                modeled,
                None,
                row.get("score", 0.0),
                row.get("criterion_type", ""),
                row.get("relationship_type", ""),
                row.get("modeled_relationship_type", ""),
                row.get("source", ""),
                row.get("target", ""),
                row.get("multiplicity_end", ""),
                row.get("weight", 0.0),
                row.get("contribution", 0.0),
                row.get("message", ""),
            )
        return

    breakdown = comparison.get("breakdown") or {}
    penalty_breakdown = comparison.get("penalty_breakdown") or {}

    for key, slice_data in breakdown.items():
        if not isinstance(slice_data, dict) or "similarity" not in slice_data:
            continue
        penalty = penalty_breakdown.get(key, {})
        expected = penalty.get("expected_used", slice_data.get("expected", 0))
        delivered = penalty.get("delivered", slice_data.get("found", 0))
        factor = penalty.get("factor")
        score = penalty.get("score", slice_data.get("similarity", 0.0))
        yield key, expected, delivered, factor, score, "", "", "", "", "", "", "", "", ""


def _write_detalle_sheet(wb: Workbook, batch: Dict[str, Any]) -> None:
    ws = wb.create_sheet("Detalle")
    headers = [
        "Carné", "Diagrama", "Criterio", "Cantidad esperada", "Cantidad ingresada",
        "Diferencia", "Factor de penalización aplicado", "Puntaje obtenido",
        "Tipo de criterio", "Tipo configurado", "Tipo detectado", "Clase origen", "Clase destino",
        "Extremo evaluado", "Peso (%)", "Aporte ponderado (%)", "Explicación",
    ]
    _write_header(ws, headers)

    for r in batch.get("results", []):
        if r.get("status") == "error":
            continue
        student_id = r.get("student_id", "")
        for diagram_type, run in (r.get("runs") or {}).items():
            if run.get("status") != "ok":
                continue
            comparison = run.get("comparison") or {}
            for (
                key, expected, delivered, factor, score, criterion_type,
                relationship_type, modeled_relationship_type, source, target,
                end, weight, contribution, message,
            ) in _iter_criteria(comparison):
                diferencia = (
                    delivered - expected
                    if isinstance(delivered, (int, float))
                    and isinstance(expected, (int, float))
                    else "—"
                )
                ws.append([
                    student_id,
                    DIAGRAM_LABELS.get(diagram_type, diagram_type),
                    key,
                    expected,
                    delivered,
                    diferencia,
                    round(factor, 4) if factor is not None else "—",
                    round(score, 2) if score is not None else None,
                    CRITERION_LABELS.get(criterion_type, criterion_type or "—"),
                    RELATIONSHIP_LABELS.get(relationship_type, relationship_type or "—"),
                    RELATIONSHIP_LABELS.get(
                        modeled_relationship_type,
                        modeled_relationship_type or "—",
                    ),
                    source or "—",
                    target or "—",
                    {"source": "Origen", "target": "Destino"}.get(end, end or "—"),
                    round(weight, 2) if isinstance(weight, (int, float)) else weight,
                    round(contribution, 2) if isinstance(contribution, (int, float)) else contribution,
                    message or "—",
                ])

    widths = [16, 14, 28, 18, 22, 12, 18, 16, 18, 18, 18, 22, 22, 18, 12, 18, 52]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def _write_resumen_sheet(wb: Workbook, batch: Dict[str, Any]) -> None:
    ws = wb.create_sheet("Resumen")
    ws.append(["Parámetro", "Valor"])
    for col_idx in (1, 2):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT

    results = batch.get("results", [])
    completos = sum(1 for r in results if r.get("complete"))
    scores = [float(r.get("final_score", 0.0)) for r in results if r.get("status") != "error"]
    aprobados = sum(
        1 for r in results
        if r.get("status") != "error" and is_aprobado(r.get("nota", percent_to_nota(r.get("final_score", 0.0))))
    )
    promedio = round(sum(scores) / len(scores), 2) if scores else 0.0

    global_weights = batch.get("global_weights_used", {})
    rows = [
        ("Fecha de exportación", datetime.now().strftime("%Y-%m-%d %H:%M")),
        ("Estudiantes evaluados", len(results)),
        ("Evaluaciones completas", completos),
        ("Evaluaciones incompletas", len(results) - completos),
        ("Promedio de similitud (%)", promedio),
        ("Aprobados", aprobados),
        ("Reprobados", len(results) - aprobados),
        ("Peso global — Clases (%)", global_weights.get("class")),
        ("Peso global — Casos de uso (%)", global_weights.get("usecase")),
        ("Peso global — Secuencia (%)", global_weights.get("sequence")),
        ("Generado con", f"UML Evaluador — desarrollado por {AUTORES}"),
    ]
    for label, value in rows:
        ws.append([label, value])

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 20


#: Encabezado de la hoja del docente, en su orden (rúbricas del 2EP).
HOJA_DOCENTE_HEADERS = [
    "Criterio", "%", "Esperados", "Modelados", "Nota ponderada", "Observaciones",
]

#: La fórmula tal cual está en la celda de su hoja.
CURVA_FORMULA = "=IF(C{f}>=D{f},(D{f}/C{f})*B{f},IF(C{f}<D{f},(C{f}/D{f})*B{f},0))"

GROUP_FONT = Font(bold=True)
STUDENT_FONT = Font(bold=True, size=12)
PESO_FORMATO = "0.00"


def _hoja_rows(comparison, modeled, observations):
    """Filas de la hoja de un estudiante, en el orden de su Excel.

    Primero "Clases", después la sección "Relaciones" (que solo suma), y
    debajo cada encabezado de grupo con sus multiplicidades. Los encabezados
    no llevan peso: en su hoja la columna % de esas filas va vacía.
    """
    clases, relaciones = [], []
    for row in comparison.get("class_rubric_breakdown") or []:
        rule_id = row.get("rule_id", "")
        if row.get("criterion_type") == "classes":
            esperados = float(row.get("expected") or 0)
            automatico = float(row.get("modeled") or 0)
        else:
            esperados = 1.0
            automatico = 1.0 if row.get("correct") else 0.0
        fila = {
            "tipo": "criterio",
            "etiqueta": row.get("label", rule_id),
            "peso": float(row.get("weight", 0.0)),
            "grupo": row.get("group_label"),
            "esperados": esperados,
            "modelados": float(modeled.get(rule_id, automatico)),
            "observacion": observations.get(rule_id) or row.get("message", ""),
        }
        (clases if row.get("criterion_type") == "classes" else relaciones).append(fila)

    filas = list(clases)
    if relaciones:
        filas.append({"tipo": "seccion", "etiqueta": "Relaciones"})
    grupo_actual = None
    for fila in relaciones:
        if fila["grupo"] and fila["grupo"] != grupo_actual:
            filas.append({"tipo": "grupo", "etiqueta": fila["grupo"]})
        grupo_actual = fila["grupo"]
        filas.append(fila)
    return filas


def _write_hoja_docente_sheet(
    wb: Workbook,
    batch: Dict[str, Any],
    modeled_overrides: Dict[str, Dict[str, float]],
    observations: Dict[str, Dict[str, str]],
) -> None:
    """Un bloque por estudiante con el formato de la rúbrica del docente.

    Se escriben fórmulas, no valores, para que pueda seguir trabajando en
    Excel: si corrige un "Modelados" ahí, la nota se recalcula sola.
    """
    ws = wb.create_sheet("Hoja de calificación")
    fila = 1

    for r in batch.get("results", []):
        if r.get("status") == "error":
            continue
        comparison = ((r.get("runs") or {}).get("class") or {}).get("comparison") or {}
        if not (comparison.get("class_rubric_breakdown") or []):
            continue

        student_id = r.get("student_id", "")
        ws.cell(row=fila, column=1, value=student_id).font = STUDENT_FONT
        fila += 2  # una fila en blanco entre el carné y la tabla, como en su hoja

        for columna, titulo in enumerate(HOJA_DOCENTE_HEADERS, start=1):
            celda = ws.cell(row=fila, column=columna, value=titulo)
            celda.fill = HEADER_FILL
            celda.font = HEADER_FONT
        fila += 1

        primera = fila
        filas_clases, fila_relaciones, filas_relacion = [], None, []
        for datos in _hoja_rows(
            comparison,
            modeled_overrides.get(student_id, {}),
            observations.get(student_id, {}),
        ):
            etiqueta = ws.cell(row=fila, column=1, value=datos["etiqueta"])
            if datos["tipo"] == "seccion":
                etiqueta.font = GROUP_FONT
                fila_relaciones = fila
            elif datos["tipo"] == "grupo":
                etiqueta.font = GROUP_FONT
                etiqueta.alignment = Alignment(indent=1)
            else:
                if fila_relaciones is None:
                    filas_clases.append(fila)
                    etiqueta.font = GROUP_FONT
                else:
                    filas_relacion.append(fila)
                    if datos["grupo"]:
                        etiqueta.alignment = Alignment(indent=2)
                    else:
                        etiqueta.font = GROUP_FONT
                        etiqueta.alignment = Alignment(indent=1)
                ws.cell(row=fila, column=2, value=datos["peso"]).number_format = PESO_FORMATO
                ws.cell(row=fila, column=3, value=datos["esperados"])
                ws.cell(row=fila, column=4, value=datos["modelados"])
                nota = ws.cell(row=fila, column=5, value=CURVA_FORMULA.format(f=fila))
                nota.number_format = PESO_FORMATO
                ws.cell(row=fila, column=6, value=datos["observacion"])
            fila += 1

        ultima = fila - 1
        if fila_relaciones is not None:
            relaciones = ws.cell(
                row=fila_relaciones, column=2,
                value="=SUM(B%d:B%d)" % (fila_relaciones + 1, ultima),
            )
            relaciones.font = GROUP_FONT
            relaciones.number_format = PESO_FORMATO

        ws.cell(row=fila, column=1, value="Total").font = GROUP_FONT
        # clases + la sección de relaciones: sumar la columna entera contaría
        # cada peso dos veces, una en su fila y otra en "Relaciones"
        sumandos = ["B%d" % f for f in filas_clases]
        if fila_relaciones is not None:
            sumandos.append("B%d" % fila_relaciones)
        total_peso = ws.cell(row=fila, column=2, value="=" + "+".join(sumandos))
        total_peso.font = GROUP_FONT
        total_peso.number_format = PESO_FORMATO
        total_nota = ws.cell(
            row=fila, column=5, value="=SUM(E%d:E%d)/10" % (primera, ultima),
        )
        total_nota.font = GROUP_FONT
        total_nota.number_format = PESO_FORMATO
        fila += 3  # dos filas en blanco entre estudiantes

    for columna, ancho in zip("ABCDEF", (46, 10, 12, 12, 16, 60)):
        ws.column_dimensions[columna].width = ancho


def build_batch_xlsx(
    batch: Dict[str, Any],
    nota_overrides: Optional[Dict[str, float]] = None,
    modeled_overrides: Optional[Dict[str, Dict[str, float]]] = None,
    observations: Optional[Dict[str, Dict[str, str]]] = None,
) -> bytes:
    """Construye el .xlsx del lote y retorna los bytes listos para servir."""
    wb = Workbook()
    wb.remove(wb.active)
    # firma en las propiedades del archivo (Archivo > Información en Excel)
    wb.properties.creator = AUTORES
    wb.properties.lastModifiedBy = AUTORES
    wb.properties.title = "Notas — UML Evaluador"

    overrides = nota_overrides or {}
    _write_hoja_docente_sheet(wb, batch, modeled_overrides or {}, observations or {})
    _write_notas_sheet(wb, batch, overrides)
    _write_detalle_sheet(wb, batch)
    _write_resumen_sheet(wb, batch)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
