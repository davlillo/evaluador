# UML Evaluator

Sistema automático de evaluación de diagramas UML mediante comparación de archivos XMI/XML.

## Descripción

UML Evaluator es una herramienta web diseñada para ayudar a docentes de asignaturas de ingeniería en sistemas (Programación Orientada a Objetos, Ingeniería de Software, etc.) a evaluar automáticamente diagramas UML realizados por estudiantes.

El sistema permite:
- Subir archivos XMI/XML de la solución correcta y del estudiante
- Comparar automáticamente ambos diagramas
- Calcular porcentajes de similitud
- Identificar elementos faltantes, extra o incorrectos
- Generar reportes detallados de la evaluación

## Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Docente   │────▶│  Frontend   │────▶│     Backend     │
│  (Navegador)│     │  (React/TS) │     │   (FastAPI)     │
└─────────────┘     └─────────────┘     └─────────────────┘
                                                │
                        ┌───────────────────────┼───────────┐
                        ▼                       ▼           ▼
                ┌──────────────┐      ┌─────────────┐  ┌────────┐
                │Parser XMI/XML│      │  Comparador │  │Reporte │
                └──────────────┘      └─────────────┘  └────────┘
```

## Tecnologías

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide React (iconos)

### Backend
- Python 3.11+
- FastAPI
- Uvicorn
- XML ElementTree (parser nativo)

## Estructura del Proyecto

```
uml-evaluator/
├── backend/                    # Backend FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   └── main.py        # Endpoints principales
│   │   ├── comparator/
│   │   │   └── uml_comparator.py  # Algoritmo de comparación
│   │   ├── models/
│   │   │   └── uml_elements.py    # Modelos de datos UML
│   │   └── parsers/
│   │       └── xmi_parser.py      # Parser XML/XMI
│   ├── uploads/               # Archivos temporales
│   ├── test_files/            # Archivos de prueba
│   ├── requirements.txt
│   ├── Procfile
│   └── run.py
│
└── frontend/                   # Frontend React
    ├── src/
    │   ├── components/ui/     # Componentes shadcn/ui
    │   ├── types/
    │   │   └── comparison.ts  # Tipos TypeScript
    │   ├── App.tsx            # Componente principal
    │   ├── App.css
    │   ├── index.css
    │   └── main.tsx
    ├── index.html
    ├── package.json
    ├── tailwind.config.js
    └── vite.config.ts
```

## Instalación y Ejecución Local

### Requisitos Previos
- Python 3.11+
- Node.js 18+
- npm o yarn

### 1. Clonar el Repositorio

```bash
git clone <repositorio>
cd uml-evaluator
```

### 2. Configurar el Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor de desarrollo
python run.py
```

El backend estará disponible en `http://localhost:8000`

Documentación interactiva: `http://localhost:8000/docs`

### 3. Configurar el Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Ejecutar servidor de desarrollo
npm run dev
```

El frontend estará disponible en `http://localhost:5173`

## Uso

1. Abrir la aplicación en el navegador
2. Seleccionar el archivo XMI/XML con la **solución correcta**
3. Seleccionar el archivo XMI/XML del **estudiante**
4. Hacer clic en **"Comparar Diagramas"**
5. Revisar el resultado con:
   - Porcentaje de similitud global
   - Desglose por clases, atributos, métodos y relaciones
   - Detalles de elementos faltantes o extra

## Formatos Soportados

- **XMI** (XML Metadata Interchange) - Estándar OMG
- **XML** - Formatos XML de herramientas de modelado
- **UML** - Formatos específicos de Eclipse UML2

### Herramientas Compatibles

- StarUML
- Enterprise Architect
- Visual Paradigm
- Eclipse Papyrus
- MagicDraw
- ArgoUML
- Y otras herramientas que exporten a XMI 2.x

## Elementos UML Soportados

### Clases
- Nombre de clase
- Atributos (nombre, tipo, visibilidad)
- Métodos/Operaciones (nombre, parámetros, tipo de retorno, visibilidad)
- Modificadores (abstract, static, final)
- Interfaces

### Relaciones
- Asociación
- Herencia (Generalización)
- Implementación (Realización)
- Dependencia
- Agregación
- Composición

## API Endpoints

### `POST /api/compare`
Compara dos archivos XMI/XML.

**Parámetros:**
- `expected_file`: Archivo con la solución correcta
- `student_file`: Archivo del estudiante
- `case_sensitive`: Comparación sensible a mayúsculas (default: false)
- `strict_types`: Requerir coincidencia exacta de tipos (default: true)

**Respuesta:**
```json
{
  "overall_similarity": 85.5,
  "breakdown": {
    "classes": { "similarity": 90, "expected": 5, "found": 5, "correct": 4, ... },
    "attributes": { "similarity": 80, "expected": 15, "found": 14, "correct": 12, ... },
    "methods": { "similarity": 85, "expected": 20, "found": 18, "correct": 17, ... },
    "relationships": { "similarity": 90, "expected": 8, "found": 8, "correct": 7, ... }
  },
  "class_details": [...],
  "details": [...]
}
```

### `POST /api/compare-xml`
Compara contenido XML en formato string.

### `POST /api/parse`
Parsea un archivo XMI/XML y retorna su estructura.

### `GET /api/supported-formats`
Retorna información sobre formatos soportados.

## Algoritmo de Comparación

El sistema utiliza un algoritmo de comparación ponderado:

| Elemento | Peso |
|----------|------|
| Clases   | 35%  |
| Atributos| 25%  |
| Métodos  | 25%  |
| Relaciones| 15%  |

Para cada elemento se calcula:
- **Coincidencia exacta**: Nombre y propiedades idénticas
- **Coincidencia parcial**: Nombre correcto, propiedades diferentes
- **Faltante**: Elemento esperado no encontrado
- **Extra**: Elemento no esperado encontrado

## Despliegue

### Backend (Railway/Render)

1. Crear cuenta en Railway o Render
2. Crear nuevo proyecto desde repositorio Git
3. Configurar variables de entorno:
   - `PORT`: 8000
4. Desplegar

### Frontend (Vercel)

1. Crear cuenta en Vercel
2. Importar repositorio
3. Configurar:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Configurar variable de entorno:
   - `VITE_API_URL`: URL del backend desplegado
5. Desplegar

## Ejemplos de Prueba

En el directorio `backend/test_files/` se encuentran archivos de ejemplo:

- `solucion_correcta.xmi`: Diagrama completo de referencia
- `estudiante_incompleto.xmi`: Diagrama con elementos faltantes

## Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crear una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## Licencia

Este proyecto está licenciado bajo MIT License.

## Autores

- Desarrollado para facilitar la evaluación académica de diagramas UML

## Soporte

Para reportar problemas o solicitar funcionalidades, por favor crear un issue en el repositorio.
