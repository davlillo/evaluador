# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""La rúbrica del docente: importarla de su Excel, derivarla de la solución,
chequearla contra la solución y la plantilla de conteos propia.
"""

import os
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse

from app.parsers.xmi_parser import parse_xmi_file_multi
from app.parsers.rubric_parser import parse_rubric_xlsx, RubricParseError
from app.parsers.teacher_rubric_parser import parse_teacher_rubric_xlsx
from app.parsers.rubric_template_builder import generate_rubric_template
from app.comparator.rubric_builder import build_rubric_from_solution
from app.comparator.rubric_check import check_rubric_against_solution
from app.api.schemas import build_evaluation_profile, evaluation_profile_to_dict
from app.api.uploads import UPLOAD_DIR, VALID_UML_EXTENSIONS

router = APIRouter()


@router.get("/api/rubric-template")
async def download_rubric_template():
    """Descarga la plantilla Excel de rúbrica de cantidades esperadas
    (una hoja por tipo de diagrama + hoja de configuración del modo)."""
    template_path = os.path.join(UPLOAD_DIR, "rubric_template.xlsx")
    generate_rubric_template(Path(template_path))
    return FileResponse(
        template_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="plantilla_rubrica_uml_evaluator.xlsx",
    )


@router.post("/api/rubric/parse")
async def parse_rubric(
    rubric_file: UploadFile = File(..., description="Archivo .xlsx de rúbrica de cantidades esperadas"),
):
    """Sube y parsea una rúbrica Excel, devolviendo el EvaluationProfile
    resuelto por tipo de diagrama detectado, para preview antes de aplicarlo
    a una evaluación."""
    ext = os.path.splitext((rubric_file.filename or '').lower())[1]
    if ext != '.xlsx':
        raise HTTPException(status_code=400, detail="La rúbrica debe ser un archivo .xlsx.")

    rubric_path = os.path.join(UPLOAD_DIR, f"rubric_{rubric_file.filename}")
    try:
        with open(rubric_path, "wb") as f:
            f.write(await rubric_file.read())

        try:
            profiles = parse_rubric_xlsx(rubric_path)
        except RubricParseError as e:
            raise HTTPException(status_code=422, detail={"errors": e.errors})

        return {
            diagram_type: evaluation_profile_to_dict(profile)
            for diagram_type, profile in profiles.items()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al parsear la rúbrica: {str(e)}")
    finally:
        if os.path.exists(rubric_path):
            os.remove(rubric_path)


@router.post("/api/rubric/import")
async def import_teacher_rubric(
    rubric_file: UploadFile = File(..., description="La rúbrica del docente en su propio Excel"),
):
    """Lee la rúbrica en el formato de hoja del docente
    (Criterio | % | Esperados | Modelados | Nota ponderada | Observaciones)
    y la devuelve como reglas editables, con los avisos de lo que se corrigió
    al leerla (typos en nombres de clase, pesos que no suman 100)."""
    ext = os.path.splitext((rubric_file.filename or '').lower())[1]
    if ext != '.xlsx':
        raise HTTPException(status_code=400, detail="La rúbrica debe ser un archivo .xlsx.")

    rubric_path = os.path.join(UPLOAD_DIR, f"teacher_rubric_{os.path.basename(rubric_file.filename or 'rubrica.xlsx')}")
    try:
        with open(rubric_path, "wb") as f:
            f.write(await rubric_file.read())
        try:
            rubric = parse_teacher_rubric_xlsx(rubric_path)
        except RubricParseError as e:
            raise HTTPException(status_code=422, detail={"errors": e.errors})
        return {
            "title": rubric.title,
            "class_rules": [asdict(rule) for rule in rubric.rules],
            "warnings": rubric.warnings,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer la rúbrica: {str(e)}")
    finally:
        if os.path.exists(rubric_path):
            os.remove(rubric_path)


@router.post("/api/rubric/check")
async def check_rubric(
    expected_file: UploadFile = File(..., description="XMI con la solución del docente"),
    evaluation_profile_json: str = Form(..., description="La rúbrica a verificar"),
):
    """Evalúa la solución del docente con su propia rúbrica: debería sacar 10.
    Lo que no cumple ni la solución se devuelve explicado, para detectar una
    rúbrica de otro turno o un criterio que no coincide con lo dibujado."""
    profile = build_evaluation_profile(evaluation_profile_json)
    if profile is None or not profile.class_rules:
        raise HTTPException(status_code=422, detail="La rúbrica no tiene criterios.")

    ext = os.path.splitext((expected_file.filename or '').lower())[1]
    if ext not in VALID_UML_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extensión '{ext}' no válida. Use .xmi, .xml o .uml.",
        )

    temp_path = os.path.join(UPLOAD_DIR, f"check_{os.path.basename(expected_file.filename or 'solucion.xmi')}")
    try:
        with open(temp_path, "wb") as f:
            f.write(await expected_file.read())
        diagrams = parse_xmi_file_multi(temp_path, xmi_source='astah')
        class_diagram = diagrams.get('class')
        if class_diagram is None:
            raise HTTPException(
                status_code=422,
                detail="El archivo no contiene un diagrama de clases.",
            )
        check = check_rubric_against_solution(profile, class_diagram)
        return {"nota": check.nota, "issues": [asdict(issue) for issue in check.issues]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo revisar la solución: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/api/rubric/from-solution")
async def rubric_from_solution(
    expected_file: UploadFile = File(..., description="XMI con la solución del docente"),
    weight_classes: float = Form(20.0, ge=0, le=100, description="Peso del criterio Clases"),
):
    """Deriva la rúbrica del diagrama de clases a partir de la solución.

    El docente sube su .xmi y recibe la tabla ya armada (clases esperadas,
    multiplicidades por relación, clases de asociación) con los pesos
    repartidos, para corregirla en pantalla en vez de teclearla."""
    ext = os.path.splitext((expected_file.filename or '').lower())[1]
    if ext not in {'.xmi', '.xml', '.uml'}:
        raise HTTPException(
            status_code=400,
            detail=f"Extensión '{ext}' no válida. Use .xmi, .xml o .uml.",
        )

    temp_path = os.path.join(UPLOAD_DIR, f"solution_{expected_file.filename}")
    try:
        with open(temp_path, "wb") as f:
            f.write(await expected_file.read())

        diagrams = parse_xmi_file_multi(temp_path, xmi_source='astah')
        class_diagram = diagrams.get('class')
        if class_diagram is None:
            raise HTTPException(
                status_code=422,
                detail="El archivo no contiene un diagrama de clases.",
            )

        rules = build_rubric_from_solution(class_diagram, peso_clases=weight_classes)
        return {
            "class_rules": [
                {
                    "rule_id": rule.rule_id,
                    "criterion_type": rule.criterion_type,
                    "label": rule.label,
                    "group_label": rule.group_label,
                    "weight": rule.weight,
                    "expected_quantity": rule.expected_quantity,
                    "source": rule.source,
                    "target": rule.target,
                    "relationship_type": rule.relationship_type,
                    "multiplicity_end": rule.multiplicity_end,
                    "expected_multiplicity": rule.expected_multiplicity,
                }
                for rule in rules
            ],
            "expected_diagram": class_diagram.to_dict(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Error al derivar la rúbrica: {str(e)}",
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
