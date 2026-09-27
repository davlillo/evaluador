# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Utilidades: parsear un XMI y listar los formatos soportados."""

import os

from fastapi import APIRouter, File, UploadFile, HTTPException

from app.parsers.xmi_parser import parse_xmi_file
from app.api.uploads import UPLOAD_DIR

router = APIRouter()


@router.post("/api/parse")
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


@router.get("/api/supported-formats")
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
