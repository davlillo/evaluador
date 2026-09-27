# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""API del Sistema de Evaluación de Diagramas UML.

Arma la aplicación FastAPI (CORS, firma de autoría, ciclo de vida) y monta
los routers de app/api/routes/:
  - rubric:  la rúbrica del docente (importar, derivar, chequear)
  - batch:   calificar un lote y exportar el Excel de notas
  - compare: comparaciones sueltas por tipo de diagrama
  - tools:   parsear un XMI y listar formatos soportados
"""

import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.schemas import HealthResponse
from app.api.uploads import UPLOAD_DIR
from app.api.routes import batch, compare, rubric, tools

# Configuración de CORS.
# Sin credenciales (la app no usa login), por lo que podemos permitir cualquier origen
# de forma válida usando el patrón de regex (no se puede combinar "*" con credenciales).
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
]

ALLOWED_ORIGIN_REGEX = r"https://.*\.vercel\.app"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestión del ciclo de vida de la aplicación."""
    # Startup
    print("Iniciando UML Evaluator API...")
    yield
    # Shutdown
    print("Cerrando UML Evaluator API...")
    # Limpiar archivos temporales
    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)

AUTORES = "davlillos"

app = FastAPI(
    title="UML Evaluator API",
    description=(
        "Sistema automático de evaluación de diagramas UML con la rúbrica del docente. "
        f"Desarrollado por **{AUTORES}**."
    ),
    version="1.0.0",
    contact={"name": AUTORES},
    license_info={"name": "MIT", "identifier": "MIT"},
    lifespan=lifespan
)


@app.middleware("http")
async def firma_de_autoria(request, call_next):
    """Cada respuesta de la API lleva la firma del equipo."""
    response = await call_next(request)
    response.headers["X-Desarrollado-Por"] = AUTORES
    return response


# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


app.include_router(rubric.router)
app.include_router(batch.router)
app.include_router(compare.router)
app.include_router(tools.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
