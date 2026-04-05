"""
API principal del Sistema de Evaluación de Diagramas UML.
FastAPI con endpoints para subida de archivos y comparación.
"""

import os
import tempfile
import shutil
from typing import Optional
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
    valid_extensions = {'.xmi', '.xml', '.uml'}
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

        try:
            expected_diagram = parse_xmi_file(expected_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear archivo de solución: {str(e)}")

        try:
            student_diagram = parse_xmi_file(student_path)
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
