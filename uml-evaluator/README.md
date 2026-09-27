# UML Evaluator

Sistema automático de evaluación de diagramas UML mediante comparación de archivos XMI/XML.

## Descripción

UML Evaluator es una herramienta web diseñada para ayudar a docentes de asignaturas de ingeniería en sistemas (Programación Orientada a Objetos, Ingeniería de Software, etc.) a evaluar automáticamente diagramas UML realizados por estudiantes.

El sistema permite:
- Subir el XMI de la solución del docente y el del estudiante (o un ZIP con todo el grupo)
- **Derivar la rúbrica de la propia solución**: clases esperadas, relaciones y multiplicidades
- Comparar automáticamente y calcular la nota 0-10
- Corregir a mano cualquier criterio en una **hoja de calificación** igual a la del Excel
- Identificar elementos faltantes, extra o incorrectos
- Exportar actas en PDF y el Excel de notas con el formato del docente

El motor está **calibrado contra 46 entregas reales ya calificadas a mano**: error promedio
0.39 puntos sobre 10 y mediana 0.00. Ver `tests/test_calibracion_docente.py` y
`scripts/reporte_calibracion.py`.

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
- React 19 + React Router 7
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui (Radix)
- Lucide React (iconos)
- jsPDF + jsPDF-AutoTable (actas), JSZip (paquete de actas)

### Backend
- Python 3.11+
- FastAPI
- Uvicorn
- XML ElementTree (parser nativo, sin dependencias de XML)
- openpyxl (rúbrica y exportación a Excel)
- gensim + numpy (matching semántico con FastText en español, opcional)

## Estructura del Proyecto

El repositorio tiene dos proyectos independientes: el backend vive en
`uml-evaluator/backend/` y el frontend en `app/`, en la raíz.

```
.
├── app/                            # Frontend React (Vite)
│   └── src/
│       ├── pages/
│       │   ├── UploadPage.tsx      # Subida + configuración de la rúbrica
│       │   ├── BatchResultsPage.tsx# Tabla de notas del lote
│       │   ├── GradingSheetPage.tsx# Hoja de calificación editable
│       │   ├── ResultsPage.tsx
│       │   └── ReportPage.tsx      # Acta imprimible
│       ├── components/
│       │   ├── ClassRubricPanel.tsx# Editor de reglas de rúbrica
│       │   ├── diagram/            # Renderizadores SVG de UML
│       │   ├── results/
│       │   └── ui/                 # shadcn/ui
│       ├── context/                # Estado de evaluación y de la hoja
│       ├── lib/
│       │   ├── grading-sheet.ts    # La fórmula del docente
│       │   ├── persisted-state.ts  # localStorage
│       │   └── report-pdf.ts
│       └── types/
│
└── uml-evaluator/backend/          # Backend FastAPI
    ├── app/
    │   ├── api/main.py             # Todos los endpoints
    │   ├── comparator/
    │   │   ├── uml_comparator.py   # Motor de comparación
    │   │   ├── scoring_modes.py    # Curva del docente y perfiles
    │   │   ├── rubric_builder.py   # Rúbrica derivada de la solución
    │   │   ├── semantic_matcher.py # Sinónimos, Levenshtein, FastText
    │   │   └── calibracion.py      # Contraste contra las notas reales
    │   ├── exporters/batch_xlsx.py # Excel con el formato del docente
    │   ├── models/uml_elements.py
    │   └── parsers/
    │       ├── xmi_parser.py       # XMI 2.x y XMI 1.1 (Astah/JUDE)
    │       └── rubric_parser.py    # Rúbrica en .xlsx
    ├── scripts/
    │   ├── build_calibracion_fixture.py
    │   └── reporte_calibracion.py  # Notas del docente vs del sistema
    ├── test_files/
    │   └── calibracion/            # 46 entregas reales ya calificadas
    ├── tests/
    ├── requirements.txt
    └── run.py
```

## Instalación y Ejecución Local

### Con Docker (recomendado)

Solo hace falta Docker Desktop. Desde la raíz del repositorio:

```bash
docker compose up --build
```

y abrir `http://localhost:8080` (API interactiva en `http://localhost:8080/docs`).

- El frontend se compila y lo sirve nginx, que reenvía `/api` al backend: la app
  funciona también desde otra máquina de la red (`http://IP-del-equipo:8080`).
- El backend no publica puerto propio; solo lo ve nginx.
- La imagen del backend no incluye `gensim` ni el modelo FastText (7.4 GB): el
  matching semántico va apagado porque, medido contra las notas del docente,
  empeora el resultado.

### Sin Docker

#### Requisitos Previos
- Python 3.11+
- Node.js 18+
- npm o yarn

### 1. Clonar el Repositorio

```bash
git clone <repositorio>
cd uml-evaluator
```

### 2. Todo de una vez (Windows)

Desde la raíz del repositorio:

```powershell
.\iniciar.ps1
```

Crea el entorno virtual e instala lo que falte la primera vez, y deja el backend en
`http://localhost:8000` y el frontend en `http://localhost:5173`.

Si se prefiere a mano, seguir los dos pasos siguientes.

### 3. Configurar el Backend

```bash
cd uml-evaluator/backend

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

> **Matching semántico (opcional).** Sin el modelo FastText el sistema funciona igual: el
> emparejamiento de nombres cae en la heurística (normalización, sinónimos, Levenshtein).
> La rúbrica de clases no lo usa. Si se instala, los archivos van en `backend/models/`
> (ignorados por git). Basta con `cc.es.300.kv` + `cc.es.300.kv.vectors.npy` (~610 MB);
> el `cc.es.300.bin` de 7.2 GB solo hace falta para generarlos y se puede borrar después.

### 4. Configurar el Frontend

```bash
cd app

# Instalar dependencias
npm install

# Ejecutar servidor de desarrollo
npm run dev
```

El frontend estará disponible en `http://localhost:5173`

## Uso

### Flujo

1. **Rúbrica.** Subir la rúbrica `.xlsx` del docente, en su propio formato:

   | Criterio | % | Esperados | Modelados | Nota ponderada | Observaciones |
   |----------|---|-----------|-----------|----------------|---------------|

   Se muestra con la estructura de su hoja (Clases, sección Relaciones, encabezados de
   relación con sus multiplicidades, clases de asociación) y se ajustan el %, las clases
   esperadas y cada multiplicidad. Sin Excel, se puede derivar del XMI de la solución.
2. **Solución y entregas.** El XMI de la solución y un `.xmi` (un estudiante) o un `.zip`
   (el grupo; el nombre de cada archivo es el carné).
3. **Resultados.** Tabla del grupo en `/lote` y hoja editable de cada estudiante en
   `/hoja`: la columna **Modelados** la llena el motor y el docente la corrige donde su
   criterio difiera. La nota se recalcula con `min(E,M)/max(E,M) × peso`.
4. *Exportar Excel de notas* → `.xlsx` con un bloque por estudiante en el formato de su
   rúbrica (fórmulas vivas) más Notas, Detalle y Resumen.

La rúbrica ajustada y las correcciones se guardan en el navegador: recargar no las pierde.
Un solo estudiante pasa por el mismo camino que el lote (se empaqueta en un ZIP de uno).

## Formatos Soportados

- **XMI** (XML Metadata Interchange) - Estándar OMG
- **XML** - Formatos XML de herramientas de modelado
- **UML** - Formatos específicos de Eclipse UML2

### Herramientas Compatibles

**Astah / JUDE (XMI 1.1)** es el origen por defecto y tiene su propio parser
(`XMIParserV11`): resuelve las clases realmente dibujadas en el diagrama, las clases de
asociación, las multiplicidades por extremo y los diagramas de casos de uso y secuencia
que vengan en el mismo archivo.

Vía el parser de XMI 2.x también se leen: StarUML, Enterprise Architect, Visual Paradigm,
Eclipse Papyrus, MagicDraw, ArgoUML y otras herramientas que exporten a XMI 2.x.

## Elementos UML Soportados

### Clases
- Nombre de clase
- Atributos (nombre, tipo, visibilidad)
- Métodos/Operaciones (nombre, parámetros, tipo de retorno, visibilidad)
- Modificadores (abstract, static, final)
- Interfaces

### Relaciones
- Asociación (con multiplicidad por extremo)
- Clase de asociación
- Herencia (Generalización)
- Implementación (Realización)
- Dependencia
- Agregación
- Composición

### Otros diagramas
- **Casos de uso**: actores, casos de uso, relaciones actor-CU, include, extend
- **Secuencia**: líneas de vida, mensajes síncronos/asíncronos/de creación,
  fragmentos combinados (alt, loop) y orden de mensajes

## API Endpoints

Documentación interactiva en `http://localhost:8000/docs`.

### Evaluación

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/compare` | Compara dos XMI de un tipo de diagrama |
| `POST` | `/api/compare-auto` | Detecta los tipos de diagrama del archivo y compara todos |
| `POST` | `/api/compare-batch` | Solución + **ZIP de entregas**; una fila por estudiante |
| `POST` | `/api/compare-global` | Tres soluciones y tres ZIP (clases, casos de uso, secuencia) |
| `POST` | `/api/compare-xml` | Igual que `/api/compare` pero con el XML como string |

### Rúbrica

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/rubric/import` | **Lee la rúbrica en el Excel del docente** (formato 2EP y Práctica 1) |
| `POST` | `/api/rubric/from-solution` | Deriva la rúbrica del XMI de solución |
| `POST` | `/api/rubric/parse` | Lee una rúbrica en `.xlsx` |
| `GET` | `/api/rubric-template` | Descarga la plantilla `.xlsx` de rúbrica |

### Utilidades

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/export/batch-xlsx` | Excel del lote con el formato del docente |
| `POST` | `/api/parse` | Parsea un XMI y devuelve su estructura |
| `GET` | `/api/supported-formats` | Formatos y elementos soportados |
| `GET` | `/health` | Estado del servicio |

### `POST /api/rubric/from-solution`

**Parámetros** (multipart):
- `expected_file`: XMI con la solución del docente
- `weight_classes`: peso del criterio *Clases* (default: 20)

**Respuesta:**
```json
{
  "class_rules": [
    { "rule_id": "clases", "criterion_type": "classes", "label": "Clases",
      "weight": 20.0, "expected_quantity": 6, "group_label": null },
    { "rule_id": "rel1-source", "criterion_type": "multiplicity",
      "label": "Multiplicidad 1 en Afiliado", "weight": 8.0,
      "group_label": "Asociación Afiliado-Ganado",
      "source": "Afiliado", "target": "Ganado",
      "relationship_type": "association",
      "multiplicity_end": "source", "expected_multiplicity": "1" }
  ],
  "expected_diagram": { "diagram_type": "class", "classes": [...] }
}
```

Los renglones con `group_label` cuelgan de un encabezado que no puntúa: agrupa las dos
multiplicidades de una relación, igual que en el Excel del docente.

### `POST /api/compare`

**Parámetros** (multipart):
- `expected_file`: Archivo con la solución correcta
- `student_file`: Archivo del estudiante
- `case_sensitive`: Comparación sensible a mayúsculas (default: false)
- `strict_types`: Requerir coincidencia exacta de tipos (default: true)
- `xmi_source`: `astah` (default) o `visual_paradigm`
- `evaluation_profile_json`: perfil de evaluación con la rúbrica, como string JSON

**Respuesta:**
```json
{
  "overall_similarity": 85.5,
  "diagram_type": "class",
  "scoring_mode": "expected_with_penalty",
  "breakdown": {
    "classes": { "similarity": 90, "expected": 5, "found": 5, "correct": 4 },
    "attributes": { "similarity": 80, "expected": 15, "found": 14, "correct": 12 },
    "methods": { "similarity": 85, "expected": 20, "found": 18, "correct": 17 },
    "relationships": { "similarity": 90, "expected": 8, "found": 8, "correct": 7 }
  },
  "class_rubric_breakdown": [
    { "rule_id": "clases", "label": "Clases", "weight": 20.0,
      "expected": 6, "modeled": 6, "score": 100.0, "correct": true,
      "message": "Se esperaban 6 clases y el estudiante modeló 6." }
  ],
  "penalty_breakdown": { },
  "class_details": [],
  "details": []
}
```

`class_rubric_breakdown` es lo que alimenta la hoja de calificación de la interfaz.

## Algoritmo de Comparación

Hay dos caminos, según haya rúbrica o no.

### Con rúbrica de clases (el flujo del docente)

Cada criterio se puntúa por separado con la **curva del docente**:

```
nota ponderada = min(Esperados, Modelados) / max(Esperados, Modelados) × peso
Total (0-10)   = Σ nota ponderada × 10
```

Es simétrica: entregar de más penaliza igual que entregar de menos. Los criterios son
`classes` (un conteo), `multiplicity` y `association_class` (binarios).

Reglas calibradas contra las notas reales del docente:

- Un extremo de multiplicidad **vacío equivale a `1`** (es el implícito de UML y así lo
  exporta Astah cuando no se dibuja nada).
- `Clases` cuenta las clases **dibujadas en el diagrama**, no las que existen en el
  archivo: Astah embebe todo el JDK y conserva clases borradas del lienzo.
- Una `AssociationClass` real vale aunque el estudiante la haya nombrado distinto.
- Se acepta modelar con una relación *más fuerte* de la pedida (agregación donde iba
  asociación); no al revés.
- Los nombres de la rúbrica se emparejan uno a uno con las clases del estudiante, para que
  `Ganado` no se lleve a `Ganadero` y deje `CabezaGanadoVacuno` sin dueño.

### Sin rúbrica (modo similitud)

Comparación ponderada contra la solución de referencia:

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

El emparejamiento de nombres es exacto y, si se activa, semántico (sinónimos, camelCase,
Levenshtein y embeddings FastText en español).

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

MIT — ver [`LICENSE`](../LICENSE). La licencia permite usar, copiar y modificar el
software con una condición: conservar el aviso de copyright de **davlillos** en toda
copia o parte sustancial del código. Cada archivo fuente lo lleva en su encabezado
(`SPDX-FileCopyrightText: 2026 davlillos`).

## Autores

Desarrollado por **davlillos** — ver [`AUTHORS.md`](../AUTHORS.md):

- Sergio David Hernández García
- Marcos Gallardo
- Karla Gissell Girón Martinez

Escuela de Sistemas Informáticos, Universidad de El Salvador.

## Soporte

Para reportar problemas o solicitar funcionalidades, por favor crear un issue en el repositorio.
