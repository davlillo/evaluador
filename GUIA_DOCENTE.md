# Guía rápida para el docente

El sistema califica diagramas de clases con **su propia rúbrica**: la misma
tabla de Excel que usa para calificar a mano
(Criterio · % · Esperados · Modelados · Nota ponderada · Observaciones).
El sistema llena la columna *Modelados* leyendo el XMI de cada estudiante, y
usted la corrige donde su criterio sea distinto.

## Cómo arrancarlo

Con **Docker Desktop** instalado, desde la raíz del proyecto:

```powershell
docker compose up --build
```

y abrir **`http://localhost:8080`**. La primera vez tarda unos minutos porque
arma todo; después arranca en segundos. Desde otra computadora de la misma
red se entra con `http://IP-de-este-equipo:8080`.

Para apagarlo: `Ctrl+C` en esa ventana, o `docker compose down`.

Sin Docker también funciona: `.\iniciar.ps1` instala lo que falte y deja la
aplicación en `http://localhost:5173`.

## El flujo, en tres pasos

### 1. Rúbrica

Arrastre su rúbrica `.xlsx` a la primera caja. Se muestra tal como está en su
hoja: *Clases*, la sección *Relaciones*, cada relación con sus
multiplicidades y las clases de asociación.

Ahí mismo puede ajustar:

- el **%** de cada criterio (el total tiene que dar 100; si no, no deja seguir),
- las **clases esperadas**,
- cada **multiplicidad esperada** (por ejemplo cambiar `1` por `0..1`),
- y quitar un criterio pasando el mouse por la fila.

Si su hoja tiene algún error de tipeo en el nombre de una clase (por ejemplo
`OdenServicio` en un encabezado y `OrdenServicio` en las filas), el sistema lo
corrige y lo avisa en amarillo arriba de la tabla.

Cuando esté conforme: **Usar esta rúbrica**.

> ¿No tiene la rúbrica en Excel? Debajo de la caja está la opción
> *Armarla desde tu solución*: lee su XMI y propone una rúbrica con 20% para
> clases y el resto repartido entre las relaciones. La ajusta igual.

### 2. Solución y entregas

- **Tu solución**: el XMI de la solución, exportado desde Astah.
- **Entregas**: un `.xmi` para un solo estudiante, o un `.zip` con todo el
  grupo. El nombre de cada archivo es el carné (`AB12345.xmi`).

Si el ZIP trae también la solución (por ejemplo `CLAVEIMPAR.xmi` dentro de la
carpeta), no se califica como un alumno: se avisa arriba de la tabla. Un
archivo **con carné** idéntico a la solución sí se califica, porque es una
copia de la clave y usted tiene que verlo.

Al subir la solución, el sistema la califica con su propia rúbrica: tendría
que sacar 10. Si no, avisa en amarillo qué criterios no cumple ni la
solución. Eso pasa cuando la rúbrica es de otro turno, o cuando la rúbrica
pide algo distinto a lo que dibujó (en Práctica 1, la rúbrica pedía `0..*` en
Tratamiento y la solución tenía `1`). Puede ajustar la rúbrica o evaluar
igual.

Botón **Evaluar grupo** (o *Evaluar estudiante* si subió un solo XMI).

La rúbrica queda guardada: para evaluar otro grupo con la misma rúbrica,
vuelva al inicio y va directo a este paso.

### 3. Resultados

- Con un ZIP llega a la **tabla del grupo**. *Abrir hoja* en cualquier fila.
- Con un solo XMI llega directo a la **hoja** de ese estudiante.

En la hoja, la columna **Modelados** viene llena por el sistema. Si no está de
acuerdo con un valor, escríbalo encima: la nota ponderada y el total se
recalculan al instante. El lápiz marca lo que corrigió a mano; *Restaurar
valores del sistema* lo deshace. Las flechas ← → pasan al siguiente
estudiante.

Todo queda guardado en el navegador: recargar la página no pierde nada.

## Actas para los estudiantes

En la tabla del grupo, **PDF consolidado** en cada fila, o **Descargar todas
las actas** (un ZIP con un PDF por estudiante). El acta trae la nota, qué
cumplió y qué le faltó por relación, y el desglose **con la misma forma de su
hoja** (Clases, Relaciones, cada relación con sus multiplicidades). Sus
correcciones y observaciones de la hoja ya vienen aplicadas.

## Exportar las notas

En la tabla del grupo, **Exportar Excel de notas**. La primera hoja del
archivo tiene un bloque por estudiante **con el mismo formato de su rúbrica**
y las fórmulas vivas: si cambia un *Modelados* en Excel, el total se
recalcula ahí también. Sus correcciones hechas en pantalla ya vienen
aplicadas.

## ¿Qué tan parecido califica al docente?

Se midió contra las 46 entregas de Práctica 1 que usted calificó a mano, con
su rúbrica de ese momento:

| | |
|---|---|
| Nota idéntica a la suya | 28 de 46 |
| Error promedio | 0.39 puntos sobre 10 |
| Dentro de ±1 punto | 41 de 46 |
| Peor caso | 2 puntos |

Donde el sistema no acierta solo es cuando el estudiante renombró el dominio
(`Ganadero` donde la solución dice `Afiliado`) o dejó clases repetidas. Para
eso está la columna *Modelados* editable.

### Reglas que salieron de sus propias notas

No se inventaron: son las que mejor reproducen cómo calificó Práctica 1.

- Un extremo **en blanco** vale como multiplicidad `1` (el valor por defecto de UML).
- *Clases* cuenta las clases **dibujadas**; una clase de asociación se puntúa
  aparte, en su propio criterio.
- Si la rúbrica pide **asociación** y el alumno dibujó agregación o
  composición, cuenta.
- Si la rúbrica pide **agregación** y el alumno dibujó una asociación simple,
  cuenta. Así calificó usted en Práctica 1.
- Si la rúbrica pide **composición** y el alumno dibujó una asociación simple,
  **no cuenta**. Para este caso no hay ninguna nota suya con qué medirlo; si
  usted lo acepta, se corrige en la hoja.

Para ver la comparación estudiante por estudiante:

```powershell
cd uml-evaluator\backend
venv\Scripts\python.exe scripts\reporte_calibracion.py
```

## Si algo no anda

- **"Ninguna hoja tiene la tabla de la rúbrica"**: el Excel tiene que tener
  una fila con `Criterio | % | Esperados | Modelados`.
- **"no se reconoce el criterio"**: la hoja acepta *Clases*,
  *Multiplicidad X en Clase* (debajo de un encabezado *Asociación*,
  *Agregación*, *Composición* o *Asociación reflexiva*) y
  *Clase de asociación A - B*. El mensaje dice en qué fila está.
- **"No se detectó diagrama de clases"**: el XMI está vacío o no es de Astah.
  Expórtelo desde Astah (XMI 1.1).
