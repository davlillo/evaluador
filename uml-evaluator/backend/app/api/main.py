"""
API principal del Sistema de Evaluación de Diagramas UML.
FastAPI con endpoints para subida de archivos y comparación.
"""

import os
import tempfile
import shutil
import zipfile
from typing import Optional, List, Dict
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.parsers.xmi_parser import parse_xmi_file, parse_xmi_string
from app.comparator.uml_comparator import compare_uml_diagrams
from app.users_file import USERS_JSON_PATH, append_user_if_new, find_user_by_credentials


# Configuración de CORS
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "https://*.vercel.app",
    "*"  # Permitir todas las origenes en desarrollo
]

# Crear directorio de uploads si no existe
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestión del ciclo de vida de la aplicación."""
    # Startup
    print("Iniciando UML Evaluator API...")
    print(f"Archivo de usuarios (auth): {USERS_JSON_PATH}")
    yield
    # Shutdown
    print("Cerrando UML Evaluator API...")
    # Limpiar archivos temporales
    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)


app = FastAPI(
    title="UML Evaluator API",
    description="Sistema automático de evaluación de diagramas UML mediante comparación de archivos XMI/XML",
    version="1.0.0",
    lifespan=lifespan
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Modelos Pydantic para respuestas
class ComparisonRequest(BaseModel):
    """Modelo para solicitud de comparación con contenido XML."""
    expected_xml: str
    student_xml: str
    case_sensitive: bool = False
    strict_types: bool = True


class HealthResponse(BaseModel):
    """Modelo para respuesta de health check."""
    status: str
    version: str


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthRegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class AuthUserResponse(BaseModel):
    email: str
    name: str


VALID_UML_EXTENSIONS = {'.xmi', '.xml', '.uml'}
GENERIC_STUDENT_IDS = {
    'clase', 'clases', 'class', 'classes',
    'caso', 'casos', 'casodeuso', 'casosdeuso', 'usecase', 'usecases',
    'secuencia', 'sequence',
    'dc', 'dcu', 'ds',
}


def _is_hidden_or_system_path(path_parts: List[str]) -> bool:
    for part in path_parts:
        cleaned = part.strip()
        if not cleaned:
            continue
        if cleaned.startswith('.') or cleaned.startswith('__MACOSX'):
            return True
    return False


def _safe_extract_zip(zip_path: str, target_dir: str) -> None:
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for member in zf.infolist():
            normalized = member.filename.replace('\\', '/')
            parts = [p for p in normalized.split('/') if p not in ('', '.')]
            if not parts or _is_hidden_or_system_path(parts):
                continue
            if any(p == '..' for p in parts):
                continue
            out_path = os.path.join(target_dir, *parts)
            abs_target = os.path.abspath(target_dir)
            abs_out = os.path.abspath(out_path)
            if not abs_out.startswith(abs_target):
                continue
            if member.is_dir():
                os.makedirs(abs_out, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(abs_out), exist_ok=True)
            with zf.open(member, 'r') as src, open(abs_out, 'wb') as dst:
                shutil.copyfileobj(src, dst)


def _index_students_from_dir(extracted_dir: str) -> Dict[str, str]:
    indexed: Dict[str, str] = {}
    for root_dir, _, files in os.walk(extracted_dir):
        for filename in files:
            ext = os.path.splitext(filename.lower())[1]
            if ext not in VALID_UML_EXTENSIONS:
                continue
            full_path = os.path.join(root_dir, filename)
            # Regla principal: estudiante = nombre base del archivo.
            student_id = os.path.splitext(os.path.basename(filename))[0].strip()
            normalized = ''.join(ch.lower() for ch in student_id if ch.isalnum())
            if normalized in GENERIC_STUDENT_IDS:
                # Si el nombre es genérico (CLASES/CASOS/SECUENCIA), intentar carpeta padre.
                parent_candidate = os.path.basename(root_dir).strip()
                parent_normalized = ''.join(ch.lower() for ch in parent_candidate if ch.isalnum())
                if parent_candidate and parent_normalized not in GENERIC_STUDENT_IDS:
                    student_id = parent_candidate
            if not student_id:
                continue
            if student_id not in indexed:
                indexed[student_id] = full_path
    return indexed


def _merge_student_maps_with_fallback(student_maps: Dict[str, Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    all_students = set()
    for kind in ('class', 'usecase', 'sequence'):
        all_students.update(student_maps.get(kind, {}).keys())

    # Caso normal: devolver unión por nombre detectado.
    merged = {
        sid: {
            'class': student_maps.get('class', {}).get(sid),
            'usecase': student_maps.get('usecase', {}).get(sid),
            'sequence': student_maps.get('sequence', {}).get(sid),
        }
        for sid in sorted(all_students)
    }
    if any(v['class'] and v['usecase'] and v['sequence'] for v in merged.values()):
        return merged

    # Fallback: si cada ZIP trae exactamente 1 archivo, forzar una sola tupla.
    if all(len(student_maps.get(kind, {})) == 1 for kind in ('class', 'usecase', 'sequence')):
        return {
            'estudiante_1': {
                'class': next(iter(student_maps.get('class', {}).values()), None),
                'usecase': next(iter(student_maps.get('usecase', {}).values()), None),
                'sequence': next(iter(student_maps.get('sequence', {}).values()), None),
            }
        }
    return merged


def _normalize_global_weights(class_w: float, usecase_w: float, sequence_w: float) -> dict[str, float]:
    raw = {
        'class': max(0.0, class_w),
        'usecase': max(0.0, usecase_w),
        'sequence': max(0.0, sequence_w),
    }
    total = sum(raw.values())
    if total <= 0:
        return {'class': 1 / 3, 'usecase': 1 / 3, 'sequence': 1 / 3}
    return {k: v / total for k, v in raw.items()}


@app.get("/", response_model=HealthResponse)
async def root():
    """Endpoint raíz con información del sistema."""
    return HealthResponse(
        status="online",
        version="1.0.0"
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version="1.0.0"
    )


@app.post("/api/auth/login", response_model=AuthUserResponse)
async def auth_login(body: AuthLoginRequest):
    """Valida credenciales contra usuarios en app/src/data/users.json (o USERS_JSON_PATH)."""
    found = find_user_by_credentials(body.email, body.password)
    if not found:
        raise HTTPException(
            status_code=401,
            detail="Correo o contraseña incorrectos.",
        )
    return AuthUserResponse(email=found["email"], name=found["name"])


@app.post("/api/auth/register", response_model=AuthUserResponse, status_code=201)
async def auth_register(body: AuthRegisterRequest):
    """Registra un usuario y lo persiste en el archivo JSON de usuarios."""
    trimmed_email = body.email.strip()
    trimmed_name = body.name.strip()
    if not trimmed_email or not trimmed_name:
        raise HTTPException(
            status_code=400,
            detail="Completá correo y nombre.",
        )
    record = {
        "email": trimmed_email,
        "password": body.password,
        "name": trimmed_name,
    }
    if not append_user_if_new(record):
        raise HTTPException(
            status_code=400,
            detail="Ya existe una cuenta con ese correo.",
        )
    return AuthUserResponse(email=trimmed_email, name=trimmed_name)


@app.post("/api/compare")
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
    xmi_source: str = Form(
        'astah',
        description="Origen del XMI: astah o visual_paradigm.",
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

        try:
            expected_diagram = parse_xmi_file(expected_path, xmi_source=source)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear archivo de solución: {str(e)}")

        try:
            student_diagram = parse_xmi_file(student_path, xmi_source=source)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear archivo del estudiante: {str(e)}")

        if expected_diagram_type and str(expected_diagram_type).strip():
            want = str(expected_diagram_type).strip().lower()
            allowed = {'class', 'usecase', 'sequence'}
            if want not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail="expected_diagram_type debe ser class, usecase o sequence.",
                )
            if expected_diagram.diagram_type != want:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"La solución parseada es de tipo '{expected_diagram.diagram_type}', "
                        f"pero indicaste '{want}'."
                    ),
                )
            if student_diagram.diagram_type != want:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El diagrama del estudiante es de tipo '{student_diagram.diagram_type}', "
                        f"pero indicaste '{want}'."
                    ),
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

        result = compare_uml_diagrams(
            expected_diagram,
            student_diagram,
            case_sensitive=case_sensitive,
            strict_types=strict_types,
            weights=normalized_weights,
        )

        response = result.to_dict()
        response['weights_used'] = {k: round(v * 100, 1) for k, v in normalized_weights.items()}
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


@app.post("/api/compare-global")
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
    xmi_source: str = Form('astah', description="Origen del XMI: astah o visual_paradigm."),
):
    source = str(xmi_source).strip().lower() or 'astah'
    if source not in {'astah', 'visual_paradigm'}:
        raise HTTPException(status_code=400, detail="xmi_source debe ser astah o visual_paradigm.")

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
                parsed = parse_xmi_file(expected_paths[kind], xmi_source=source)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Error al parsear solución {kind}: {str(e)}",
                )
            if parsed.diagram_type != kind:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"La solución {kind} se detectó como '{parsed.diagram_type}'. "
                        f"Debe corresponder al tipo '{kind}'."
                    ),
                )
            expected_diagrams[kind] = parsed

        # Extraer ZIP e indexar entregas por estudiante y tipo
        for kind in ('class', 'usecase', 'sequence'):
            extract_dir = os.path.join(temp_root, f"extracted_{kind}")
            os.makedirs(extract_dir, exist_ok=True)
            try:
                _safe_extract_zip(zip_paths[kind], extract_dir)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"No se pudo leer ZIP de {kind}: {str(e)}",
                )
            student_maps[kind] = _index_students_from_dir(extract_dir)

        merged_students = _merge_student_maps_with_fallback(student_maps)

        normalized_global = _normalize_global_weights(
            global_weight_class,
            global_weight_usecase,
            global_weight_sequence,
        )

        # Pesos internos por tipo de diagrama
        weights_by_kind = {
            'class': {'classes': 0.35, 'attributes': 0.25, 'methods': 0.25, 'relationships': 0.15},
            'usecase': {'classes': 0.35, 'attributes': 0.25, 'methods': 0.0, 'relationships': 0.40},
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
                    student_diagram = parse_xmi_file(student_file_path, xmi_source=source)
                    if student_diagram.diagram_type != kind:
                        complete = False
                        runs[kind] = {
                            'diagram_type': kind,
                            'status': 'error',
                            'similarity': None,
                            'student_file': os.path.basename(student_file_path),
                            'error': (
                                f"Tipo detectado '{student_diagram.diagram_type}', se esperaba '{kind}'."
                            ),
                        }
                        continue

                    comparison = compare_uml_diagrams(
                        expected_diagrams[kind],
                        student_diagram,
                        case_sensitive=False,
                        strict_types=True,
                        weights=weights_by_kind[kind],
                    )
                    sim = round(float(comparison.overall_similarity), 2)
                    weighted_sum += sim * normalized_global[kind]
                    runs[kind] = {
                        'diagram_type': kind,
                        'status': 'ok',
                        'similarity': sim,
                        'student_file': os.path.basename(student_file_path),
                        'comparison': comparison.to_dict(),
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

            final_score = round(weighted_sum, 2) if complete else 0.0
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
            'results': results,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en comparación global: {str(e)}")
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


@app.post("/api/compare-xml")
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
            strict_types=request.strict_types
        )
        
        # Retornar resultado
        return result.to_dict()
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.post("/api/parse")
async def parse_file(file: UploadFile = File(..., description="Archivo XMI/XML a parsear")):
    """
    Parsea un archivo XMI/XML y retorna la estructura del diagrama.
    
    Útil para verificar que el archivo se puede leer correctamente.
    """
    valid_extensions = {'.xmi', '.xml', '.uml'}
    file_ext = os.path.splitext(file.filename.lower())[1]
    
    if file_ext not in valid_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Extensión '{file_ext}' no válida. Use: {valid_extensions}"
        )
    
    temp_path = None
    
    try:
        # Guardar archivo temporalmente
        temp_path = os.path.join(UPLOAD_DIR, f"parse_{file.filename}")
        
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Parsear archivo
        diagram = parse_xmi_file(temp_path)
        
        # Retornar estructura
        return {
            "success": True,
            "diagram": diagram.to_dict()
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al parsear archivo: {str(e)}")
    
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/supported-formats")
async def supported_formats():
    """Retorna información sobre los formatos soportados."""
    return {
        "formats": [
            {
                "extension": ".xmi",
                "description": "XML Metadata Interchange - Estándar OMG",
                "tools": ["StarUML", "Enterprise Architect", "Visual Paradigm", "Papyrus"]
            },
            {
                "extension": ".xml",
                "description": "Formato XML genérico de diagramas UML",
                "tools": ["Varias herramientas de modelado"]
            },
            {
                "extension": ".uml",
                "description": "Formato específico de Eclipse UML2",
                "tools": ["Eclipse Papyrus", "Eclipse Modeling Tools"]
            }
        ],
        "diagram_types": ["class", "usecase", "sequence"],
        "elements_supported": [
            "Clases", "Interfaces", "Atributos", "Métodos",
            "Relaciones de herencia", "Asociaciones", "Agregaciones",
            "Composiciones", "Dependencias", "Realizaciones"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
