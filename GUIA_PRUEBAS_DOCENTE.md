# Guía de pruebas para docentes

Cómo comprobar que UML Evaluador califica bien en los **cuatro modos de nota** y en los **dos flujos de la aplicación** (un estudiante y lote).

Esta guía está pensada para usarse con la interfaz, no con código. Al final hay una sección opcional para quien quiera probar el endpoint global en Swagger.

---

## 1. Qué se necesita

| Requisito | Detalle |
|-----------|---------|
| Backend | `http://localhost:8000` |
| Frontend | `http://localhost:5173` |
| Navegador | Chrome o Edge |
| Archivos de prueba | Carpeta `uml-evaluator/backend/test_files/` |
| ZIP de lote | Un `.zip` con varios `.xmi`; el **nombre del archivo es el carné** (ejemplo: `AB12345.xmi`) |
| Excel (opcional) | Para la rúbrica de cantidades (`.xlsx`) |

Los XMI de esta guía salen de **Astah**. En la pantalla de un estudiante la app fija el origen a Astah.

### Arrancar los servidores (Windows)

**Backend** (PowerShell):

```powershell
cd "uml-evaluator\backend"
venv\Scripts\activate
python run.py
```

Debe verse: `http://localhost:8000` y documentación en `http://localhost:8000/docs`.

**Frontend** (otra terminal):

```powershell
cd app
npm run dev
```

Abrir `http://localhost:5173`.

---

## 2. Mapa de pantallas

| Ruta | Qué hace |
|------|----------|
| `/` | Subir archivos y configurar la evaluación |
| `/resultados` | Nota y desglose de **un** estudiante |
| `/reporte` | Acta imprimible / PDF de ese estudiante |
| `/lote` | Tabla de notas del ZIP |
| `/lote/desglose` | Detalle de un alumno del lote |

Flujo **un estudiante**: `/` → Comparar ahora → `/resultados` → (opcional) Ver reporte → `/reporte`.

Flujo **lote**: `/` → Evaluar lote → `/lote` → Ver desglose → `/lote/desglose`.

En `/`, el badge **Un estudiante** / **Lote (ZIP de estudiantes)** elige el flujo. Expandir **Configuración de pesos** para tipos de diagrama, pesos, corrección semántica, modo de evaluación y rúbrica.

---

## 3. Los cuatro modos de evaluación

Se configuran una vez en **Modo de evaluación** y aplican a toda la comparación.

La app envía el perfil del **primer tipo marcado**, en este orden: Diagrama de Clases → Casos de Uso → Diagrama de Secuencia. Si vas a probar cantidades de clases, deja **Diagrama de Clases** marcado (o desmarca los otros).

| Botón en la UI | Qué compara | ¿Pide cantidades? | Cómo sale el puntaje del criterio (0–100) |
|----------------|-------------|-------------------|-------------------------------------------|
| **Similitud** | Estudiante vs XMI del docente | No | F1: premia aciertos y ya descuenta de más o de menos de forma implícita |
| **Similitud con descuento** | Igual, más curva de cantidades | No (usa el conteo del XMI docente) | `min(E, R) / max(E, R) × 100` |
| **Cantidades esperadas (sin descuento)** | Contra el número que usted escribe | Sí | Cumplir el mínimo: entregar de más **no** baja la nota |
| **Cantidades esperadas (con descuento)** | Contra el número que usted escribe | Sí | Misma curva: el 100 % solo si E y R coinciden |

- **E** = cantidad esperada (XMI docente o rúbrica, según el modo).
- **R** = cantidad que entregó el estudiante.

La **nota 0–10** es el porcentaje global dividido entre 10. **Aprobado** a partir de **6.0**.

### Cuándo usar cada uno

- **Similitud**: evaluación “clásica” contra el modelo de referencia.
- **Similitud con descuento**: quiere que el tamaño del diagrama coincida con el del docente, además de parecerse.
- **Cantidades sin descuento**: usted fija cupos (por ejemplo “al menos 4 clases”); extras no castigan.
- **Cantidades con descuento**: usted fija cupos y castiga tanto el faltante como el extra (curva del docente).

---

## 4. Curva normal (modos con descuento)

```
factor = min(E, R) / max(E, R)
puntaje = factor × 100
```

Es **simétrica**: entregar 9 cuando se esperaban 6 da el mismo factor que entregar 6 cuando se esperaban 9.

| Esperado (E) | Entregado (R) | Factor | Puntaje del criterio |
|--------------|---------------|--------|----------------------|
| 4 | 4 | 1.00 | 100 |
| 3 | 4 | 0.75 | **75** |
| 4 | 3 | 0.75 | 75 |
| 4 | 6 | 0.67 | 66.7 |
| 6 | 9 | 0.67 | 66.7 |
| 4 | 2 | 0.50 | 50 |
| 3 | 0 | 0.00 | 0 |
| 0 | 0 | 1.00 | 100 |

En pantalla, si hubo descuento, aparece un recuadro **ámbar** junto al criterio con un texto del tipo:

> Se esperaban 3 y se registraron 4: factor 0.7500 (75.0 pts).

Ese recuadro **no** sale en modo **Similitud** (salvo que no haya penalización de curva). En **Cantidades sin descuento** tampoco sale por un extra, porque el extra no descuenta.

---

## 5. Archivos de prueba

Todos en `uml-evaluator/backend/test_files/`:

| Rol | Archivo | Notas |
|-----|---------|--------|
| Solución de clases | `solucion_correcta.xmi` | 3 clases, baseline al 100 % si se compara consigo mismo |
| Estudiante incompleto | `estudiante_incompleto.xmi` | Menos atributos, métodos y relaciones |
| Casos de uso (docente) | `astah_caso_uso_docente.xmi` | |
| Casos de uso (estudiante) | `astah_caso_uso_estudiante.xmi` | |
| Casos de uso defectuoso | `astah_caso_uso_estudiante_malo.xmi` | Nota más baja que el “bueno” |
| Secuencia | `secuencia_astah.xmi` | Compararlo consigo mismo → ~100 % |
| Multi-diagrama / lote | `astah_multi_class_usecase_sequence.xmi` | Clases + casos de uso + secuencia |

### ZIP de lote (hágalo una vez)

1. Copie `astah_multi_class_usecase_sequence.xmi` como `AA00001.xmi`.
2. Copie `estudiante_incompleto.xmi` como `AA00002.xmi` (o use el multi-diagrama y el incompleto con nombres de carné).
3. Mételos en `lote_prueba.zip`.

El nombre del archivo **sin extensión** es el carné que verá en `/lote`.

---

## 6. Guion de pruebas (checklist)

Marque cada ítem al completarlo.

### A. Arranque

- [ ] Backend en `http://localhost:8000` (abrir `/docs` y ver la API).
- [ ] Frontend en `http://localhost:5173`.
- [ ] La home muestra **Nueva comparación**, **Un estudiante** y **Lote**.

### B. Un estudiante — modo Similitud

1. Badge **Un estudiante**.
2. **1. Solución oficial:** `solucion_correcta.xmi`.
3. **2. Solución del estudiante:** el **mismo** `solucion_correcta.xmi`.
4. Expandir **Configuración de pesos**. Dejar **Similitud**. Opcional: dejar solo **Diagrama de Clases**.
5. **Comparar ahora**.

**Esperado:** similitud global **~100 %**, nota **10**, veredicto aprobado. Sin recuadro ámbar de curva. **Ver reporte** abre el acta con Aprobado.

Repetir cambiando el estudiante a `estudiante_incompleto.xmi`.

**Esperado:** similitud **menor a 100 %**, aparecen faltantes (atributos, métodos, relaciones). Sigue sin recuadro ámbar de curva.

- [ ] 100 % consigo mismo
- [ ] Nota baja con el incompleto
- [ ] Acta `/reporte` se imprime / exporta PDF

### C. Un estudiante — Similitud con descuento

Misma pareja **solución vs incompleto**. En **Modo de evaluación** elegir **Similitud con descuento**. No hace falta llenar cantidades: usa el conteo del XMI docente.

**Esperado:** la nota de cada criterio con diferencia de cantidad baja según la curva. Recuadro ámbar: *Se esperaban N y se registraron M*.

Solución vs solución en este modo: **~100 %**, sin ámbar (E = R).

- [ ] Extra o faltante baja la nota con curva
- [ ] Archivo idéntico sigue en 100 %

### D. Un estudiante — Cantidades sin descuento

1. Modo **Cantidades esperadas (sin descuento)**.
2. Debe aparecer **Cantidades esperadas**.
3. En clases, poner **Clases = 3** (el resto puede quedar en 0).
4. Comparar `solucion_correcta.xmi` contra sí mismo.

**Esperado:** criterio Clases en **100 %**. El extra no aplica aquí (mismo archivo).

Para ver que **el extra no descuenta**: hace falta un XMI con **más** clases que las 3 de la solución. Si no lo tiene, este caso queda cubierto por el modo con descuento (sección E) y por la comparación solución vs incompleto (faltante sí baja: 2 de 3 → 67 %, no 100 %).

Con `estudiante_incompleto.xmi` y Clases = 3: si el incompleto aún tiene 3 clases, el criterio Clases puede seguir alto; bajan atributos/métodos/relaciones si usted también pone esas cantidades. Para un primer pase, basta **Clases = 3** y revisar que la pantalla no muestre descuento por curva.

- [ ] Aparece el panel de cantidades
- [ ] Solución vs solución con Clases = 3 → 100 % en clases

### E. Un estudiante — Cantidades con descuento

1. Modo **Cantidades esperadas (con descuento)**.
2. **Clases = 3**.
3. Solución vs solución → factor 3/3 = **100 %**, sin ámbar.
4. Solución vs `estudiante_incompleto.xmi`: si el incompleto tiene **menos** elementos en un criterio cuya cantidad usted fijó, el puntaje de ese criterio es `min(E,R)/max(E,R)×100` y sale el recuadro ámbar.

Caso numérico de referencia (laboratorio): solución con **3 clases** y estudiante con **4** (una extra) → factor **0.75**, criterio Clases **75 %**, texto *Se esperaban 3 y se registraron 4*.

- [ ] Idénticos → 100 %
- [ ] Cantidades distintas → curva + recuadro ámbar

### F. Rúbrica Excel

1. En configuración, bloque **Rúbrica de cantidades esperadas (Excel)**.
2. **Descargar plantilla**.
3. Hoja **Config**, celda del modo: elija uno (para esta prueba, *Cantidades esperadas - con descuento*).
4. Hoja **Clases**: deje **Clases = 3** (o 4 si usa los valores de ejemplo de la plantilla; entonces ajústelos a 3 para coincidir con `solucion_correcta.xmi`).
5. **Subir rúbrica** → debe decir *Rúbrica leída correctamente* y mostrar tarjetas por tipo.
6. **Aplicar a esta evaluación**.
7. Comparar solución vs solución.

**Esperado:** el modo y las cantidades de la rúbrica quedan aplicados; resultado ~100 % si las cantidades coinciden con el XMI.

- [ ] Plantilla descarga un `.xlsx`
- [ ] Parseo sin error
- [ ] Aplicar y comparar funciona

### G. Lote ZIP

1. Badge **Lote (ZIP de estudiantes)**.
2. Solución: `astah_multi_class_usecase_sequence.xmi` (o `solucion_correcta.xmi` si el ZIP solo tiene clases).
3. ZIP: el `lote_prueba.zip` de la sección 5.
4. Elegir un modo (probar al menos **Similitud** y **Cantidades con descuento**).
5. **Evaluar lote**.

En `/lote`:

- [ ] Aparecen los carné (`AA00001`, `AA00002`, …)
- [ ] El archivo “completo” tiene nota más alta que el incompleto
- [ ] **Exportar Excel de notas** baja `notas_lote.xlsx` (hojas Notas / Detalle / Resumen)
- [ ] **Descargar todas las actas (ZIP)** genera un PDF por alumno
- [ ] **PDF consolidado** en una fila funciona
- [ ] **Ver desglose** abre `/lote/desglose` con criterios y, si aplica, recuadros ámbar

### H. Corrección semántica

En configuración, interruptor **Corrección semántica** (FastText; umbral por defecto **0.65**).

- [ ] Con el interruptor **activado**, comparar un par conocido (solución vs incompleto) y anotar la nota
- [ ] Repetir con el interruptor **apagado**
- [ ] Ambos casos terminan sin error; las notas pueden diferir si hay sinónimos o typos

Si no está instalado el modelo FastText, la app sigue funcionando con heurística (typos / nombres parecidos). No es un fallo.

### I. Pesos (opcional)

- [ ] Subir un tipo de diagrama a 100 % y el resto a 0, comparar, y comprobar que el global se parece a ese criterio
- [ ] Aviso “Debe sumar 100 %” si los pesos no cierran (no bloquea el botón; igual conviene dejarlos en 100)

---

## 7. Resultados esperados (resumen)

Pareja base de clases: `solucion_correcta.xmi` (E clases = 3).

| # | Estudiante | Modo | Qué mirar |
|---|------------|------|-----------|
| 1 | El mismo XMI | Similitud | ~100 %, nota 10, sin ámbar |
| 2 | `estudiante_incompleto.xmi` | Similitud | Por debajo de 100 %, faltantes, sin ámbar de curva |
| 3 | El mismo XMI | Similitud con descuento | ~100 % |
| 4 | Incompleto (menos elementos) | Similitud con descuento | Criterios con E ≠ R bajan con la curva; ámbar |
| 5 | El mismo XMI, Clases = 3 | Cantidades sin descuento | Clases 100 %; extra no aplica |
| 6 | El mismo XMI, Clases = 3 | Cantidades con descuento | 100 %, sin ámbar |
| 7 | 4 clases vs E = 3 | Cantidades con descuento | Clases **75 %**, *Se esperaban 3 y se registraron 4* |
| 8 | Lote 2 alumnos | Cualquier modo | Carné en tabla; Excel y PDF; desglose coherente con el modo |

Nota 0–10 ≈ porcentaje / 10. Umbral de aprobado: 6.0.

---

## 8. Limitaciones al probar

No son fallos de su prueba; el motor trabaja así hoy.

1. **Un solo perfil por comparación.** Aunque la rúbrica tenga hojas de clases, casos de uso y secuencia, al evaluar se envía el perfil del **primer tipo seleccionado**.
2. **En lote, los checkboxes de tipo no filtran el API.** Desmarcar “Casos de Uso” no impide que el backend evalúe lo que encuentre en el XMI. En un estudiante sí se envían los tipos elegidos.
3. **Campos de cantidades que sí mueven la nota**
   - Clases: **Clases**, **Atributos totales**, **Métodos totales**. Las relaciones se puntúan como un solo criterio interno (`relationships`), no por Asociación / Agregación / etc.
   - Casos de uso: **Include** y **Extend**. Actores, casos de uso y relaciones actor–CU en el panel usan claves que el motor todavía no lee con esos nombres; el cupo efectivo sale del XMI docente si no hay clave interna.
   - Secuencia: **Líneas de vida** y los tres tipos de **mensajes**. **Fragmentos alt** y **Fragmentos loop** por separado no puntúan: el motor usa un solo criterio de uso de fragmentos.
4. **Campos visibles que aún no cambian la nota:** Asociación, Agregación, Composición, Herencia, Implementación (por separado); Actores / Casos de uso / Relaciones actor-CU (con esas etiquetas); Fragmentos alt vs loop.
5. **Origen XMI fijo a Astah** en el flujo de un estudiante. Visual Paradigm no se elige en esa pantalla.
6. **Fragmentos combinados (`alt` / `loop`):** se extraen del XMI; la calificación fina (operador correcto, guardia, mensajes dentro del fragmento) está pendiente. Ver `fragmentos_combinados_futuro.md`.
7. El flujo de **tres ZIP** (uno por tipo de diagrama) no está en la interfaz; solo en la API (sección 9).

---

## 9. Prueba opcional: evaluación global en Swagger

No forma parte del flujo del docente en la web. Sirve si quiere confirmar el backend.

1. Abrir `http://localhost:8000/docs`.
2. Endpoint `POST /api/compare-global`.
3. Subir **tres** soluciones (`expected_class_file`, `expected_usecase_file`, `expected_sequence_file`) y **tres** ZIP de estudiantes, uno por tipo.
4. Opcional: `evaluation_profile_json`, por ejemplo:

```json
{"mode": "expected_with_penalty", "expected_counts": [{"element_type": "classes", "expected_quantity": 3}]}
```

5. La respuesta lista alumnos con `student_id`, `final_score` y corridas por tipo (`class` / `usecase` / `sequence`).

Plantilla de rúbrica: `GET /api/rubric-template`. Validar un Excel: `POST /api/rubric/parse`.

---

## 10. Si algo falla

| Síntoma | Qué revisar |
|---------|-------------|
| Error de red / “Failed to fetch” | Backend en el puerto 8000; frontend en 5173 |
| Botón deshabilitado | Faltan archivos o no hay ningún tipo de diagrama marcado |
| Rúbrica 422 | Hoja `Config` con un modo de la lista; cantidades enteras ≥ 0; nombres de elemento iguales a la plantilla |
| Lote sin carné | El ZIP debe contener `.xmi` cuyo nombre sea el carné |
| Nota igual en todos los modos | En **Similitud** no se envía perfil; confirme que eligió otro modo **antes** de comparar y, en cantidades, que rellenó **Clases** (u otro campo que sí puntúa) |
| Sin recuadro ámbar | Solo aparece si `penalty_applied > 0` (modos con curva y E ≠ R) |
| ZIP / PDF vacíos | Espere a que termine la evaluación; pruebe con dos archivos pequeños |

Cuando termine el guion (secciones A–G como mínimo), los cuatro modos y los dos flujos de la UI quedaron cubiertos.
