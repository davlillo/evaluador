#!/usr/bin/env python3
"""
Script de inicio para el backend de UML Evaluator.
"""

import uvicorn
import os
import sys

# Agregar el directorio backend al path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    print(f"Iniciando UML Evaluator API en http://{host}:{port}")
    print(f"Documentación: http://{host}:{port}/docs")
    
    # ¡Aquí está el cambio! Pasamos la ruta como texto: "app.api.main:app"
    uvicorn.run("app.api.main:app", host=host, port=port, reload=True, log_level="info")