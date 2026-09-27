# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Comparaciones sueltas por tipo de diagrama (clases, casos de uso, secuencia).

La pantalla del docente usa /api/compare-batch (routes/batch.py); estos
endpoints quedan para integraciones y pruebas desde /docs.
"""

import os
import tempfile
import shutil
from typing import Optional

from fastapi import APIRouter, File, UploadFile, HTTPException, Form

from app.parsers.xmi_parser import parse_xmi_string, parse_xmi_file_multi
from app.comparator.uml_comparator import compare_uml_diagrams
from app.grading import grade_summary
from app.api.evaluation import (
    normalize_global_weights, percent_or_default, build_usecase_weights, enriched_comparison,
)
from app.api.schemas import (
    ComparisonRequest,
    build_evaluation_profile,
)
from app.api.uploads import (
    UPLOAD_DIR, VALID_UML_EXTENSIONS, safe_extract_zip, index_students_from_dir,
    merge_student_maps_with_fallback,
)

router = APIRouter()


@router.post("/api/compare")
async def compare_files(
    expected_file: UploadFile = File(..., description="Archivo XMI/XML con la solución correcta"),
    student_file: UploadFile = File(..., description="Archivo XMI/XML del estudiante"),
    case_sensitive: bool = Form(False, description="Comparación sensible a mayúsculas"),
    strict_types: bool = Form(True, description="Requerir coincidencia exacta de tipos"),
    weight_classes: float = Form(35, description="Peso para clases (0-100)"),
    weight_attributes: float = Form(25, description="Peso para atributos (0-100)"),
    weight_methods: float = Form(25, description="Peso para métodos (0-100)"),
    weight_relationships: float = Form(15, description="Peso para relaciones (0-100)"),
    expected_diagram_type: Optional[str] = Form(
        None,
        description="Opcional: class, usecase o sequence. Si se envía, debe coincidir con ambos XMI.",
    ),
    use_semantic_matching: bool = Form(True, description="Usar FastText para matching semántico de nombres"),
    semantic_threshold: float = Form(0.65, description="Umbral de similitud semántica (0.55 a 1.00)"),
    xmi_source: str = Form(
        'astah',
        description="Origen del XMI: astah o visual_paradigm.",
    ),
    evaluation_profile_json: Optional[str] = Form(
        None,
        description="JSON opcional de EvaluationProfileModel (modo de evaluación, descuentos, rúbrica de conteos).",
    ),
):
    """
    Compara dos archivos XMI/XML de diagramas UML.

    - **expected_file**: Archivo con la solución correcta del docente
    - **student_file**: Archivo con el diagrama del estudiante
    - **case_sensitive**: Si la comparación de nombres es sensible a mayúsculas
    - **strict_types**: Si se requiere coincidencia exacta de tipos
    - **weight_classes / weight_attributes / weight_methods / weight_relationships**:
      Porcentajes de ponderación (se normalizan automáticamente a suma 100)

    Retorna un JSON con el porcentaje de similitud, detalles de comparación
    y la estructura completa de ambos diagramas.
    """
    valid_extensions = VALID_UML_EXTENSIONS
    expected_ext = os.path.splitext(expected_file.filename.lower())[1]
    student_ext = os.path.splitext(student_file.filename.lower())[1]

    if expected_ext not in valid_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo de solución: extensión '{expected_ext}' no válida. Use: {valid_extensions}",
        )

    if student_ext not in valid_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo del estudiante: extensión '{student_ext}' no válida. Use: {valid_extensions}",
        )

    expected_path = None
    student_path = None

    try:
        expected_path = os.path.join(UPLOAD_DIR, f"expected_{expected_file.filename}")
        student_path = os.path.join(UPLOAD_DIR, f"student_{student_file.filename}")

        with open(expected_path, "wb") as f:
            f.write(await expected_file.read())

        with open(student_path, "wb") as f:
            f.write(await student_file.read())

        source = str(xmi_source).strip().lower() or 'astah'
        allowed_sources = {'astah', 'visual_paradigm'}
        if source not in allowed_sources:
            raise HTTPException(
                status_code=400,
                detail="xmi_source debe ser astah o visual_paradigm.",
            )

        # Normalizar pesos
        raw_weights = {
            'classes': max(0.0, weight_classes),
            'attributes': max(0.0, weight_attributes),
            'methods': max(0.0, weight_methods),
            'relationships': max(0.0, weight_relationships),
        }
        total_w = sum(raw_weights.values()) or 100.0
        normalized_weights = {k: v / total_w for k, v in raw_weights.items()}

        try:
            expected_diagrams = parse_xmi_file_multi(expected_path, xmi_source=source)
            student_diagrams = parse_xmi_file_multi(student_path, xmi_source=source)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear archivos: {str(e)}")

        want_type = str(expected_diagram_type).strip().lower() if expected_diagram_type else None
        if want_type:
            if want_type not in expected_diagrams:
                raise HTTPException(
                    status_code=400,
                    detail=f"La solución no contiene diagrama '{want_type}'.",
                )
            if want_type not in student_diagrams:
                raise HTTPException(
                    status_code=400,
                    detail=f"El estudiante no contiene diagrama '{want_type}'.",
                )
            expected_diagram = expected_diagrams[want_type]
            student_diagram = student_diagrams[want_type]
        else:
            common = sorted(set(expected_diagrams.keys()) & set(student_diagrams.keys()))
            if not common:
                raise HTTPException(
                    status_code=400,
                    detail="No hay tipos de diagrama compatibles en ambos archivos.",
                )
            if len(common) > 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Ambos archivos contienen varios diagramas. "
                        "Indique expected_diagram_type (class, usecase o sequence)."
                    ),
                )
            expected_diagram = expected_diagrams[common[0]]
            student_diagram = student_diagrams[common[0]]

        if expected_diagram.diagram_type == 'usecase':
            comparison_weights = build_usecase_weights(
                classes=raw_weights['classes'],
                attributes=raw_weights['attributes'],
                methods=raw_weights['methods'],
                relationships=raw_weights['relationships'],
            )
        else:
            comparison_weights = normalized_weights

        evaluation_profile = build_evaluation_profile(evaluation_profile_json)

        result = compare_uml_diagrams(
            expected_diagram,
            student_diagram,
            case_sensitive=case_sensitive,
            strict_types=strict_types,
            weights=comparison_weights,
            use_semantic_matching=use_semantic_matching,
            semantic_threshold=semantic_threshold,
            evaluation_profile=evaluation_profile,
        )

        response = result.to_dict()
        response['weights_used'] = {
            k: round(v * 100, 1) for k, v in comparison_weights.items()
        }
        response['expected_diagram'] = expected_diagram.to_dict()
        response['student_diagram'] = student_diagram.to_dict()
        response['xmi_source_used'] = source
        # Ayuda a comprobar que el servidor usa la lógica F1 y parser actualizado
        response['evaluator_version'] = '2-f1'

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

    finally:
        if expected_path and os.path.exists(expected_path):
            os.remove(expected_path)
        if student_path and os.path.exists(student_path):
            os.remove(student_path)


@router.post("/api/compare-auto")
async def compare_files_auto(
    expected_file: UploadFile = File(..., description="Archivo XMI/XML con la solución correcta (puede contener múltiples diagramas)"),
    student_file: UploadFile = File(..., description="Archivo XMI/XML del estudiante (puede contener múltiples diagramas)"),
    case_sensitive: bool = Form(False),
    strict_types: bool = Form(True),
    xmi_source: str = Form('astah', description="Origen del XMI: astah o visual_paradigm."),
    use_semantic_matching: bool = Form(True, description="Usar FastText para matching semántico de nombres"),
    semantic_threshold: float = Form(0.65, description="Umbral de similitud semántica (0.55 a 1.00)"),
    selected_types: Optional[str] = Form(None, description="Tipos a evaluar: 'class,usecase,sequence'"),
    # Pesos por tipo de diagrama
    class_weight_classes: Optional[float] = Form(None),
    class_weight_attributes: Optional[float] = Form(None),
    class_weight_methods: Optional[float] = Form(None),
    class_weight_relationships: Optional[float] = Form(None),
    usecase_weight_classes: Optional[float] = Form(None),
    usecase_weight_attributes: Optional[float] = Form(None),
    usecase_weight_methods: Optional[float] = Form(None),
    usecase_weight_include: Optional[float] = Form(None),
    usecase_weight_extend: Optional[float] = Form(None),
    usecase_weight_relationships: Optional[float] = Form(None),
    sequence_weight_classes: Optional[float] = Form(None),
    sequence_weight_relationships: Optional[float] = Form(None),
    sequence_weight_sync_messages: Optional[float] = Form(None),
    sequence_weight_async_messages: Optional[float] = Form(None),
    sequence_weight_creation_messages: Optional[float] = Form(None),
    sequence_weight_fragment_usage: Optional[float] = Form(None),
    global_weight_class: Optional[float] = Form(None),
    global_weight_usecase: Optional[float] = Form(None),
    global_weight_sequence: Optional[float] = Form(None),
    evaluation_profile_json: Optional[str] = Form(
        None,
        description="JSON opcional de EvaluationProfileModel (modo de evaluación, descuentos, rúbrica de conteos).",
    ),
):
    """
    Compara dos archivos XMI detectando automáticamente los tipos de diagramas contenidos.
    Soporta XMI 1.1 de Astah/JUDE con múltiples diagramas en un solo archivo.
    """
    valid_extensions = VALID_UML_EXTENSIONS
    expected_ext = os.path.splitext(expected_file.filename.lower())[1]
    student_ext = os.path.splitext(student_file.filename.lower())[1]

    if expected_ext not in valid_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo de solución: extensión '{expected_ext}' no válida. Use: {valid_extensions}",
        )

    if student_ext not in valid_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo del estudiante: extensión '{student_ext}' no válida. Use: {valid_extensions}",
        )

    expected_path = None
    student_path = None

    try:
        expected_path = os.path.join(UPLOAD_DIR, f"expected_auto_{expected_file.filename}")
        student_path = os.path.join(UPLOAD_DIR, f"student_auto_{student_file.filename}")

        with open(expected_path, "wb") as f:
            f.write(await expected_file.read())

        with open(student_path, "wb") as f:
            f.write(await student_file.read())

        source = str(xmi_source).strip().lower() or 'astah'

        try:
            expected_diagrams = parse_xmi_file_multi(expected_path, xmi_source=source)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear archivo de solución: {str(e)}")

        try:
            student_diagrams = parse_xmi_file_multi(student_path, xmi_source=source)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear archivo del estudiante: {str(e)}")

        all_detected = sorted(set(expected_diagrams.keys()) & set(student_diagrams.keys()))

        if not all_detected:
            raise HTTPException(
                status_code=400,
                detail="No se encontraron diagramas compatibles en ambos archivos.",
            )

        if selected_types and selected_types.strip():
            requested = [t.strip().lower() for t in selected_types.split(',') if t.strip().lower() in ('class', 'usecase', 'sequence')]
            detected_types = [t for t in requested if t in all_detected]
        else:
            detected_types = all_detected

        if not detected_types:
            raise HTTPException(
                status_code=400,
                detail="Ninguno de los tipos seleccionados está presente en ambos archivos.",
            )

        weights_by_kind_defaults = {
            'class': {'classes': 0.35, 'attributes': 0.25, 'methods': 0.25, 'relationships': 0.15},
            'usecase': build_usecase_weights(),
            'sequence': {'classes': 0.40, 'attributes': 0.0, 'methods': 0.0, 'relationships': 0.60},
        }

        weights_by_kind = {}
        for kind in detected_types:
            if kind == 'class':
                default = {
                    'classes': percent_or_default(class_weight_classes, 35),
                    'attributes': percent_or_default(class_weight_attributes, 25),
                    'methods': percent_or_default(class_weight_methods, 25),
                    'relationships': percent_or_default(class_weight_relationships, 15),
                }
                total = sum(default.values())
                if total > 0:
                    default = {k: v / total for k, v in default.items()}
            elif kind == 'usecase':
                default = build_usecase_weights(
                    classes=usecase_weight_classes,
                    attributes=usecase_weight_attributes,
                    methods=usecase_weight_methods,
                    include_relations=usecase_weight_include,
                    extend_relations=usecase_weight_extend,
                    relationships=usecase_weight_relationships,
                )
            elif kind == 'sequence':
                sync_w = sequence_weight_sync_messages
                async_w = sequence_weight_async_messages
                creation_w = sequence_weight_creation_messages
                fragment_w = sequence_weight_fragment_usage

                default = {}
                if any(v is not None for v in (sync_w, async_w, creation_w, fragment_w)):
                    default = {
                        'sync_messages': percent_or_default(sync_w, 35),
                        'async_messages': percent_or_default(async_w, 20),
                        'creation_messages': percent_or_default(creation_w, 15),
                        'fragment_usage': percent_or_default(fragment_w, 30),
                    }
                else:
                    default['classes'] = percent_or_default(sequence_weight_classes, 40)
                    default['attributes'] = 0.0
                    default['methods'] = 0.0
                    default['relationships'] = percent_or_default(sequence_weight_relationships, 60)
                
                total = sum(default.values())
                if total > 0:
                    default = {k: v / total for k, v in default.items()}
            else:
                default = dict(weights_by_kind_defaults.get(kind, weights_by_kind_defaults['class']))
                
            weights_by_kind[kind] = default

        global_weights = {
            'class': percent_or_default(global_weight_class, 40),
            'usecase': percent_or_default(global_weight_usecase, 35),
            'sequence': percent_or_default(global_weight_sequence, 25),
        }

        # Renormalizar pesos solo sobre los tipos realmente detectados
        detected_global_sum = sum(global_weights.get(t, 0) for t in detected_types)
        if detected_global_sum > 0:
            detected_global_weights = {t: global_weights[t] / detected_global_sum for t in detected_types}
        else:
            detected_global_weights = {t: 1.0 / len(detected_types) for t in detected_types}

        results = []
        weighted_sum = 0.0
        evaluation_profile = build_evaluation_profile(evaluation_profile_json)

        for diagram_type in detected_types:
            expected_diag = expected_diagrams[diagram_type]
            student_diag = student_diagrams[diagram_type]

            comparison = compare_uml_diagrams(
                expected_diag,
                student_diag,
                case_sensitive=case_sensitive,
                strict_types=strict_types,
                weights=weights_by_kind.get(diagram_type, weights_by_kind_defaults['class']),
                use_semantic_matching=use_semantic_matching,
                semantic_threshold=semantic_threshold,
                evaluation_profile=evaluation_profile,
            )

            sim = round(float(comparison.overall_similarity), 2)
            weighted_sum += sim * detected_global_weights.get(diagram_type, 1.0 / len(detected_types))

            comparison_payload = comparison.to_dict()
            comparison_payload['weights_used'] = {
                key: round(value * 100, 1)
                for key, value in weights_by_kind[diagram_type].items()
            }
            results.append({
                'diagram_type': diagram_type,
                'similarity': sim,
                'comparison': comparison_payload,
            })

        overall_similarity = round(weighted_sum, 2)
        grade = grade_summary(overall_similarity)

        return {
            'detected_diagrams': detected_types,
            'results': results,
            'overall_similarity': overall_similarity,
            'nota': grade['nota'],
            'aprobado': grade['aprobado'],
            'expected_diagrams': {k: v.to_dict() for k, v in expected_diagrams.items()},
            'student_diagrams': {k: v.to_dict() for k, v in student_diagrams.items()},
            'xmi_source_used': source,
            'evaluator_version': '3-auto',
            'weights_used': {
                kind: {k: round(v * 100, 1) for k, v in w.items()}
                for kind, w in weights_by_kind.items()
            },
            'global_weights_used': {k: round(v * 100, 1) for k, v in detected_global_weights.items()},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

    finally:
        if expected_path and os.path.exists(expected_path):
            os.remove(expected_path)
        if student_path and os.path.exists(student_path):
            os.remove(student_path)


@router.post("/api/compare-global")
async def compare_global_files(
    expected_class_file: UploadFile = File(..., description="Solución docente - diagrama de clases"),
    students_class_zip: UploadFile = File(..., description="ZIP de entregas de estudiantes - clases"),
    expected_usecase_file: UploadFile = File(..., description="Solución docente - casos de uso"),
    students_usecase_zip: UploadFile = File(..., description="ZIP de entregas de estudiantes - casos de uso"),
    expected_sequence_file: UploadFile = File(..., description="Solución docente - secuencia"),
    students_sequence_zip: UploadFile = File(..., description="ZIP de entregas de estudiantes - secuencia"),
    global_weight_class: float = Form(40, description="Peso global de clases (0-100)"),
    global_weight_usecase: float = Form(35, description="Peso global de casos de uso (0-100)"),
    global_weight_sequence: float = Form(25, description="Peso global de secuencia (0-100)"),
    use_semantic_matching: bool = Form(True, description="Usar FastText para matching semántico de nombres"),
    semantic_threshold: float = Form(0.65, description="Umbral de similitud semántica (0.55 a 1.00)"),
    xmi_source: str = Form('astah', description="Origen del XMI: astah o visual_paradigm."),
    evaluation_profile_json: Optional[str] = Form(
        None,
        description="JSON opcional de EvaluationProfileModel (modo de evaluación, descuentos, rúbrica de conteos).",
    ),
):
    source = str(xmi_source).strip().lower() or 'astah'
    if source not in {'astah', 'visual_paradigm'}:
        raise HTTPException(status_code=400, detail="xmi_source debe ser astah o visual_paradigm.")

    evaluation_profile = build_evaluation_profile(evaluation_profile_json)

    expected_files = {
        'class': expected_class_file,
        'usecase': expected_usecase_file,
        'sequence': expected_sequence_file,
    }
    zip_files = {
        'class': students_class_zip,
        'usecase': students_usecase_zip,
        'sequence': students_sequence_zip,
    }

    for kind, f in expected_files.items():
        ext = os.path.splitext((f.filename or '').lower())[1]
        if ext not in VALID_UML_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Archivo de solución {kind}: extensión '{ext}' no válida. Use: {VALID_UML_EXTENSIONS}",
            )
    for kind, f in zip_files.items():
        ext = os.path.splitext((f.filename or '').lower())[1]
        if ext != '.zip':
            raise HTTPException(
                status_code=400,
                detail=f"Archivo de estudiantes {kind}: debe ser .zip.",
            )

    expected_paths: dict[str, str] = {}
    zip_paths: dict[str, str] = {}
    expected_diagrams = {}
    student_maps: dict[str, dict[str, str]] = {}
    temp_root = tempfile.mkdtemp(prefix='compare_global_', dir=UPLOAD_DIR)

    try:
        # Guardar archivos subidos
        for kind, f in expected_files.items():
            out_path = os.path.join(temp_root, f"expected_{kind}_{f.filename}")
            with open(out_path, "wb") as out:
                out.write(await f.read())
            expected_paths[kind] = out_path

        for kind, zf in zip_files.items():
            out_path = os.path.join(temp_root, f"students_{kind}_{zf.filename}")
            with open(out_path, "wb") as out:
                out.write(await zf.read())
            zip_paths[kind] = out_path

        # Parsear soluciones del docente
        for kind in ('class', 'usecase', 'sequence'):
            try:
                parsed_multi = parse_xmi_file_multi(expected_paths[kind], xmi_source=source)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Error al parsear solución {kind}: {str(e)}",
                )
            if kind not in parsed_multi:
                raise HTTPException(
                    status_code=400,
                    detail=f"La solución {kind} no contiene un diagrama de tipo '{kind}'.",
                )
            expected_diagrams[kind] = parsed_multi[kind]

        # Extraer ZIP e indexar entregas por estudiante y tipo
        for kind in ('class', 'usecase', 'sequence'):
            extract_dir = os.path.join(temp_root, f"extracted_{kind}")
            os.makedirs(extract_dir, exist_ok=True)
            try:
                safe_extract_zip(zip_paths[kind], extract_dir)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"No se pudo leer ZIP de {kind}: {str(e)}",
                )
            student_maps[kind] = index_students_from_dir(extract_dir)

        merged_students = merge_student_maps_with_fallback(student_maps)

        normalized_global = normalize_global_weights(
            global_weight_class,
            global_weight_usecase,
            global_weight_sequence,
        )

        # Pesos internos por tipo de diagrama
        weights_by_kind = {
            'class': {'classes': 0.35, 'attributes': 0.25, 'methods': 0.25, 'relationships': 0.15},
            'usecase': build_usecase_weights(),
            'sequence': {'classes': 0.40, 'attributes': 0.0, 'methods': 0.0, 'relationships': 0.60},
        }

        results = []
        complete_count = 0

        for student_id in sorted(merged_students.keys()):
            runs = {}
            complete = True
            weighted_sum = 0.0

            for kind in ('class', 'usecase', 'sequence'):
                student_file_path = merged_students[student_id].get(kind)
                if not student_file_path:
                    complete = False
                    runs[kind] = {
                        'diagram_type': kind,
                        'status': 'missing',
                        'similarity': None,
                        'student_file': None,
                        'error': 'No se encontró entrega para este tipo.',
                    }
                    continue

                try:
                    student_multi = parse_xmi_file_multi(student_file_path, xmi_source=source)
                    if kind not in student_multi:
                        complete = False
                        runs[kind] = {
                            'diagram_type': kind,
                            'status': 'error',
                            'similarity': None,
                            'student_file': os.path.basename(student_file_path),
                            'error': f"No se detectó diagrama '{kind}' en la entrega.",
                        }
                        continue
                    student_diagram = student_multi[kind]

                    comparison = compare_uml_diagrams(
                        expected_diagrams[kind],
                        student_diagram,
                        case_sensitive=False,
                        strict_types=True,
                        weights=weights_by_kind[kind],
                        use_semantic_matching=use_semantic_matching,
                        semantic_threshold=semantic_threshold,
                        evaluation_profile=evaluation_profile,
                    )
                    sim = round(float(comparison.overall_similarity), 2)
                    weighted_sum += sim * normalized_global[kind]
                    runs[kind] = {
                        'diagram_type': kind,
                        'status': 'ok',
                        'similarity': sim,
                        'student_file': os.path.basename(student_file_path),
                        'comparison': enriched_comparison(
                            comparison,
                            expected_diagrams[kind],
                            student_diagram,
                            weights_used=weights_by_kind[kind],
                        ),
                    }
                except Exception as e:
                    complete = False
                    runs[kind] = {
                        'diagram_type': kind,
                        'status': 'error',
                        'similarity': None,
                        'student_file': os.path.basename(student_file_path),
                        'error': str(e),
                    }

            # Faltantes no aportan (peso × 0) pero no anulan lo ya evaluado.
            final_score = round(weighted_sum, 2)
            if complete:
                complete_count += 1

            results.append({
                'student_id': student_id,
                'complete': complete,
                'final_score': final_score,
                'runs': runs,
            })

        results.sort(key=lambda item: item['final_score'], reverse=True)
        total_students = len(results)

        return {
            'xmi_source_used': source,
            'global_weights_used': {
                'class': round(normalized_global['class'] * 100, 2),
                'usecase': round(normalized_global['usecase'] * 100, 2),
                'sequence': round(normalized_global['sequence'] * 100, 2),
            },
            'students_total': total_students,
            'students_complete': complete_count,
            'students_incomplete': total_students - complete_count,
            'expected_diagrams': {k: v.to_dict() for k, v in expected_diagrams.items()},
            'results': results,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en comparación global: {str(e)}")
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


@router.post("/api/compare-xml")
async def compare_xml_content(request: ComparisonRequest):
    """
    Compara dos diagramas UML a partir de contenido XML en string.
    
    - **expected_xml**: Contenido XML/XMI de la solución correcta
    - **student_xml**: Contenido XML/XMI del estudiante
    - **case_sensitive**: Si la comparación de nombres es sensible a mayúsculas
    - **strict_types**: Si se requiere coincidencia exacta de tipos
    
    Retorna un JSON con el porcentaje de similitud y detalles de la comparación.
    """
    try:
        # Parsear XML
        try:
            expected_diagram = parse_xmi_string(request.expected_xml)
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Error al parsear XML de solución: {str(e)}"
            )
        
        try:
            student_diagram = parse_xmi_string(request.student_xml)
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Error al parsear XML del estudiante: {str(e)}"
            )
        
        # Comparar diagramas
        result = compare_uml_diagrams(
            expected_diagram,
            student_diagram,
            case_sensitive=request.case_sensitive,
            strict_types=request.strict_types,
            use_semantic_matching=request.use_semantic_matching,
            semantic_threshold=request.semantic_threshold,
            evaluation_profile=build_evaluation_profile(request.evaluation_profile_json),
        )

        # Retornar resultado
        return result.to_dict()
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
