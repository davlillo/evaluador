#!/usr/bin/env python3
"""
Script de inicio para el backend de UML Evaluator.
"""

import uvicorn
import os
import sys

# Agregar el directorio backend al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    print(f"Iniciando UML Evaluator API en http://{host}:{port}")
    print(f"Documentación: http://{host}:{port}/docs")
    
    uvicorn.run(
        "app.api.main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
