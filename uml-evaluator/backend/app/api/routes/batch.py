# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Calificar un lote (solución + ZIP de entregas) y exportar el Excel de notas."""

import io
import os
import tempfile
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse

from app.parsers.xmi_parser import parse_xmi_file_multi
from app.exporters.batch_xlsx import build_batch_xlsx
from app.comparator.uml_comparator import compare_uml_diagrams
from app.grading import grade_summary
from app.api.evaluation import build_usecase_weights, enriched_comparison
from app.api.schemas import BatchXlsxExportRequest, build_evaluation_profile
from app.api.uploads import (
    UPLOAD_DIR, VALID_UML_EXTENSIONS, CARNE_RE, safe_extract_zip, index_students_from_dir,
)

router = APIRouter()


@router.post("/api/export/batch-xlsx")
async def export_batch_xlsx(request: BatchXlsxExportRequest):
    """Genera el Excel del lote: la hoja con el formato propio del docente
    más Notas/Detalle/Resumen."""
    try:
        content = build_batch_xlsx(
            request.batch,
            request.nota_overrides,
            request.modeled_overrides,
            request.observations,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar el Excel: {str(e)}")

    filename = f"notas_lote_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/compare-batch")
async def compare_batch(
    expected_file: UploadFile = File(..., description="Archivo XMI con la solución (puede contener múltiples diagramas)"),
    students_zip: UploadFile = File(..., description="ZIP con los archivos XMI de cada estudiante"),
    use_semantic_matching: bool = Form(True, description="Usar FastText para matching semántico"),
    semantic_threshold: float = Form(0.65, description="Umbral de similitud semántica"),
    xmi_source: str = Form('astah', description="Origen del XMI: astah o visual_paradigm."),
    global_weight_class: float = Form(40, description="Peso global de clases (0-100)"),
    global_weight_usecase: float = Form(35, description="Peso global de casos de uso (0-100)"),
    global_weight_sequence: float = Form(25, description="Peso global de secuencia (0-100)"),
    evaluation_profile_json: Optional[str] = Form(
        None,
        description="JSON opcional de EvaluationProfileModel (modo de evaluación, descuentos, rúbrica de conteos).",
    ),
):
    ext = os.path.splitext(expected_file.filename.lower())[1]
    if ext not in VALID_UML_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Extensión '{ext}' no válida. Use: {VALID_UML_EXTENSIONS}")
    if os.path.splitext(students_zip.filename.lower())[1] != '.zip':
        raise HTTPException(status_code=400, detail="El archivo de estudiantes debe ser .zip.")

    evaluation_profile = build_evaluation_profile(evaluation_profile_json)

    expected_path = None
    zip_path = None
    temp_root = None

    try:
        expected_path = os.path.join(UPLOAD_DIR, f"batch_expected_{expected_file.filename}")
        zip_path = os.path.join(UPLOAD_DIR, f"batch_students_{students_zip.filename}")

        with open(expected_path, "wb") as f:
            f.write(await expected_file.read())
        with open(zip_path, "wb") as f:
            f.write(await students_zip.read())

        source = str(xmi_source).strip().lower() or 'astah'

        # Parsear solución (multi-diagrama)
        try:
            expected_diagrams = parse_xmi_file_multi(expected_path, xmi_source=source)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear solución: {str(e)}")

        if not expected_diagrams:
            raise HTTPException(status_code=400, detail="No se detectaron diagramas en la solución.")

        detected_types = sorted(expected_diagrams.keys())

        # Extraer ZIP
        temp_root = tempfile.mkdtemp(prefix='batch_', dir=UPLOAD_DIR)
        try:
            safe_extract_zip(zip_path, temp_root)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"No se pudo leer el ZIP: {str(e)}")

        student_files = index_students_from_dir(temp_root)

        # la carpeta de entregas suele traer también la solución (CLAVEIMPAR.xmi);
        # calificarla como un alumno más ensucia la tabla y el Excel de notas.
        # Un archivo CON carné nunca se descarta: si es idéntico a la solución,
        # es una copia de la clave y el docente tiene que verlo.
        with open(expected_path, "rb") as f:
            expected_bytes = f.read()
        expected_name = os.path.basename(expected_file.filename or '').lower()
        excluded_students = []
        for student_id, student_path in list(student_files.items()):
            if CARNE_RE.fullmatch(student_id):
                continue
            with open(student_path, "rb") as f:
                identical = f.read() == expected_bytes
            same_name = os.path.basename(student_path).lower() == expected_name
            if identical or same_name:
                excluded_students.append({
                    'student_id': student_id,
                    'reason': 'Es la solución del docente, no una entrega.',
                })
                del student_files[student_id]

        if not student_files:
            detail = (
                "El ZIP solo trae la solución del docente, ninguna entrega."
                if excluded_students
                else "No se encontraron archivos XMI en el ZIP."
            )
            raise HTTPException(status_code=400, detail=detail)

        # Pesos globales renormalizados sobre tipos detectados
        raw_global = {
            'class': max(0.0, global_weight_class),
            'usecase': max(0.0, global_weight_usecase),
            'sequence': max(0.0, global_weight_sequence),
        }
        detected_sum = sum(raw_global.get(t, 0) for t in detected_types)
        if detected_sum > 0:
            detected_weights = {t: raw_global[t] / detected_sum for t in detected_types}
        else:
            detected_weights = {t: 1.0 / len(detected_types) for t in detected_types}

        # Pesos internos por tipo
        weights_by_kind = {
            'class': {'classes': 0.35, 'attributes': 0.25, 'methods': 0.25, 'relationships': 0.15},
            'usecase': build_usecase_weights(),
            'sequence': {'classes': 0.40, 'attributes': 0.0, 'methods': 0.0, 'relationships': 0.60},
        }

        results = []
        complete_count = 0

        for student_id, student_path in sorted(student_files.items()):
            try:
                student_diagrams = parse_xmi_file_multi(student_path, xmi_source=source)
            except Exception:
                results.append({
                    'student_id': student_id,
                    'status': 'error',
                    'error': 'No se pudo parsear el archivo XMI.',
                    'complete': False,
                    'final_score': 0.0,
                    'nota': 0.0,
                    'aprobado': False,
                    'runs': {},
                })
                continue

            runs = {}
            weighted_sum = 0.0
            all_ok = True

            for kind in detected_types:
                exp_diag = expected_diagrams.get(kind)
                stu_diag = student_diagrams.get(kind)
                if exp_diag is None or stu_diag is None:
                    all_ok = False
                    runs[kind] = {'status': 'missing', 'similarity': None}
                    continue

                try:
                    kind_weights = weights_by_kind.get(kind, weights_by_kind['class'])
                    comparison = compare_uml_diagrams(
                        exp_diag, stu_diag,
                        weights=kind_weights,
                        use_semantic_matching=use_semantic_matching,
                        semantic_threshold=semantic_threshold,
                        evaluation_profile=evaluation_profile,
                    )
                    sim = round(float(comparison.overall_similarity), 2)
                    weighted_sum += sim * detected_weights.get(kind, 0)
                    runs[kind] = {
                        'status': 'ok',
                        'similarity': sim,
                        'comparison': enriched_comparison(
                            comparison,
                            exp_diag,
                            stu_diag,
                            weights_used=kind_weights,
                        ),
                    }
                except Exception as e:
                    all_ok = False
                    runs[kind] = {'status': 'error', 'similarity': None, 'error': str(e)}

            # Faltantes no aportan (peso × 0) pero no anulan lo ya evaluado.
            final_score = round(weighted_sum, 2)
            if all_ok:
                complete_count += 1

            grade = grade_summary(final_score)
            results.append({
                'student_id': student_id,
                'status': 'ok',
                'complete': all_ok,
                'final_score': final_score,
                'nota': grade['nota'],
                'aprobado': grade['aprobado'],
                'runs': runs,
            })

        results.sort(key=lambda r: r['final_score'], reverse=True)

        return {
            'results': results,
            'students_total': len(results),
            'students_complete': complete_count,
            'students_incomplete': len(results) - complete_count,
            'global_weights_used': {k: round(v * 100, 1) for k, v in detected_weights.items()},
            'detected_diagrams': detected_types,
            'expected_diagrams': {k: v.to_dict() for k, v in expected_diagrams.items()},
            'excluded_students': excluded_students,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
    finally:
        if expected_path and os.path.exists(expected_path):
            os.remove(expected_path)
        if zip_path and os.path.exists(zip_path):
            os.remove(zip_path)
        if temp_root:
            shutil.rmtree(temp_root, ignore_errors=True)
