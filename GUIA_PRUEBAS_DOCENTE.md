# Guía de pruebas para docentes

Cómo comprobar, desde la pantalla y sin tocar código, que UML Evaluador lee bien su rúbrica,
califica como usted y exporta lo que usted corrigió.

Para el uso diario está la [Guía del docente](GUIA_DOCENTE.md). Esta guía es un guion de
pruebas: cada sección dice qué hacer y qué tiene que verse.

---

## 1. Qué se necesita

| Requisito | Detalle |
|-----------|---------|
| Docker Desktop | Para levantar todo con un comando |
| Navegador | Chrome, Edge o Firefox |
| Archivos de prueba | `uml-evaluator/backend/test_files/` (vienen con el repositorio) |

Desde la raíz del repositorio:

```powershell
docker compose up --build
```

Abrir `http://localhost:8080`. La documentación de la API queda en `http://localhost:8080/docs`.

Sin Docker, `.\iniciar.ps1` deja la pantalla en `http://localhost:5173` y el backend en
`http://localhost:8000`; el guion es el mismo.

---

## 2. Mapa de pantallas

| Ruta | Qué hace |
|------|----------|
| `/` | Asistente de tres pasos: rúbrica, solución y entregas, evaluar |
| `/lote` | Tabla de notas del grupo, Excel y actas |
| `/lote/desglose` | Detalle de un estudiante del lote |
| `/hoja` | **Hoja de calificación**: su tabla de Excel, editable |

Con un `.zip` de entregas se llega a `/lote`; con un solo `.xmi`, directo a `/hoja`.

---

## 3. Archivos de prueba

Todos en `uml-evaluator/backend/test_files/`:

| Qué | Archivo | Para qué |
|-----|---------|----------|
| Rúbricas 2EP | `rubricas/2EP_Turno3_Impar.xlsx`, `rubricas/2EP_Turno3_Par.xlsx` | Formato actual (pesos en %) |
| Su calificación de Práctica 1 | `calibracion/calificacion_docente.xlsx` | Formato anterior (pesos en fracción); la primera hoja es el Turno 1 impar |
| Soluciones de Práctica 1 | `calibracion/soluciones/Turno1Impar.xmi`, `Turno1Par.xmi`, `Turno2Ambas.xmi` | |
| Entregas reales de Práctica 1 | `calibracion/T1-IMPAR/*.xmi` (8), `T1-PAR/` (16), `T2-IMPAR/` (12), `T2-PAR/` (10) | El nombre del archivo es el carné |
| Notas esperadas | `calibracion/REPORTE_CALIBRACION.txt` | Su nota y la del sistema, estudiante por estudiante |

Para el lote, comprima los `.xmi` de una carpeta en un `.zip` (clic derecho → *Enviar a →
Carpeta comprimida*).

---

## 4. Guion de pruebas

### A. Arranque

- [ ] `http://localhost:8080` muestra el paso **Rúbrica**.
- [ ] `http://localhost:8080/docs` muestra la API.
- [ ] El pie de la página dice *Desarrollado por davlillos*.

### B. Rúbrica desde su Excel

1. Subir `rubricas/2EP_Turno3_Par.xlsx`.

- [ ] Se ve con la estructura de su hoja: *Clases*, la sección *Relaciones* con la suma de sus
      pesos, cada encabezado de relación con sus multiplicidades debajo.
- [ ] El total da 100 % y **Usar esta rúbrica** está habilitado.
- [ ] Cambiar un % deja el total distinto de 100 y deshabilita **Usar esta rúbrica**.
      Devolverlo a su valor lo habilita de nuevo.
- [ ] Cambiar una multiplicidad esperada (por ejemplo `1` por `1..*`) cambia también el
      texto del criterio.

2. Repetir con `calibracion/calificacion_docente.xlsx`.

- [ ] Se lee aunque los pesos estén en fracción (0.2, 0.05): se muestran en %.

### C. Rúbrica desde la solución

1. **Armarla desde tu solución** con `calibracion/soluciones/Turno1Impar.xmi`.

- [ ] Aparece *Clases* con 6 esperadas y una fila por multiplicidad de cada relación.

### D. Chequeo de la solución

Con la rúbrica de `calificacion_docente.xlsx` confirmada, en el paso 2 subir la solución
`calibracion/soluciones/Turno1Impar.xmi`.

- [ ] Avisa que *tu propia solución saca 9.00 con esta rúbrica* y nombra el criterio:
      *Multiplicidad 0..\* en Tratamiento — en tu solución esa multiplicidad es «1»; la
      rúbrica pide «0..\*»*. Es un desajuste real de Práctica 1 entre la rúbrica y la
      solución, y el chequeo existe para encontrar justamente eso.
- [ ] **Ajustar rúbrica** vuelve al editor. Para seguir este guion sin mover las notas de
      referencia de la sección E, no la cambie: la pantalla permite evaluar igual.
- [ ] Con una rúbrica que sí corresponde a la solución, dice *Tu solución saca 10 con esta
      rúbrica: se corresponden.*

### E. Lote

1. Rúbrica `calificacion_docente.xlsx`, solución `Turno1Impar.xmi` y un `.zip` con los 8
   `.xmi` de `calibracion/T1-IMPAR/`. **Evaluar grupo**.

- [ ] `/lote` muestra los 8 carnés.
- [ ] Las notas coinciden con la columna `sistema` de `REPORTE_CALIBRACION.txt` para T1-IMPAR
      (por ejemplo EJ25001 = 3.50, MR23129 = 7.00).
- [ ] Agregar `Turno1Impar.xmi` dentro del `.zip` y volver a evaluar: no aparece como
      estudiante y la tabla avisa *No se calificó Turno1Impar: es la solución del docente*.

### F. Hoja de calificación

1. En `/lote`, **Abrir hoja** en MR23129.

- [ ] Columnas *Criterio · % · Esperados · Modelados · Nota ponderada · Observación*.
- [ ] Cambiar un *Modelados* recalcula al instante la nota ponderada y el total, y la celda
      queda marcada como corregida.
- [ ] Escribir una observación y recargar la página (F5): la corrección y la observación
      siguen ahí, en el mismo estudiante.
- [ ] **Restaurar valores del sistema** vuelve a la nota original.
- [ ] En `/lote`, la nota de MR23129 muestra la corrección.

### G. Exportar

En `/lote`, con al menos una corrección hecha en la hoja:

- [ ] **Exportar Excel de notas** baja un `.xlsx`. La hoja *Hoja de calificación* trae un
      bloque por estudiante con su formato y **fórmulas vivas**: cambiar un *Modelados* en
      Excel recalcula el total. La corrección hecha en pantalla ya viene aplicada.
- [ ] **Descargar todas las actas (ZIP, un PDF por alumno)** genera un PDF por carné.
- [ ] El acta de MR23129 muestra la misma nota que la hoja, no la del sistema.

### H. Un solo estudiante

1. Rúbrica `calificacion_docente.xlsx`, solución `Turno1Impar.xmi` y en *Entregas* un solo
   `.xmi` (`calibracion/T1-IMPAR/EJ25001.xmi`). **Evaluar estudiante**.

- [ ] Llega directo a `/hoja` con nota 3.50.

### I. Errores que tienen que explicarse solos

- [ ] Subir un `.xlsx` que no sea una rúbrica: dice que ninguna hoja tiene la tabla
      *Criterio | % | Esperados | Modelados*.
- [ ] Subir un `.zip` sin `.xmi` adentro: dice que no encontró archivos XMI.

---

## 5. Qué tan parecido califica a usted

El sistema está calibrado contra sus 46 entregas de Práctica 1 que tienen `.xmi` y nota.
Para ver la comparación estudiante por estudiante:

```powershell
cd uml-evaluator\backend
venv\Scripts\python.exe scripts\reporte_calibracion.py
```

Resultado actual: error promedio **0.39 puntos** sobre 10, mediana **0**, 28 de 46 notas
idénticas, 34 dentro de ±0.5 y 41 dentro de ±1.0. La rúbrica se lee con el mismo código que
usa la pantalla al subir su Excel, así que esas cifras son las de la pantalla.

Donde el sistema todavía difiere es cuando el estudiante renombró el dominio (`Ganadero`
donde la solución dice `Afiliado`) o dejó clases repetidas o de relleno. Para eso está la
columna *Modelados* editable.

El test `tests/test_calibracion_docente.py` vigila que esa correspondencia no se rompa con
cambios futuros.

---

## 6. Si algo falla

| Síntoma | Qué revisar |
|---------|-------------|
| La página no abre | `docker compose ps`: los dos servicios tienen que estar *running* y el backend *healthy* |
| *Failed to fetch* | El backend no responde; `docker compose logs backend` |
| La rúbrica no se lee | La hoja tiene que tener una fila con `Criterio \| % \| Esperados \| Modelados` |
| **Usar esta rúbrica** deshabilitado | Los pesos no suman 100 % |
| La solución no saca 10 | Rúbrica de otro turno, o un criterio que no coincide con lo que dibujó |
| Un estudiante sin carné | El nombre del `.xmi` tiene que ser el carné (`AB12345.xmi`) |
| Cambios de código no se ven | `docker compose up -d --build --force-recreate` |
