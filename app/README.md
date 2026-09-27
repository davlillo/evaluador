# UML Evaluador — frontend

SPA en React 19 + TypeScript + Vite. La documentación general (flujo del docente,
arquitectura, tecnologías y deuda técnica) está en el [README de la raíz](../README.md).

## Comandos

```bash
npm install
npm run dev       # http://localhost:5173, llama al backend en http://localhost:8000
npm run build     # chequeo de tipos + build de producción
npm run lint
npm test          # Vitest
```

## Dónde está cada cosa

| Ruta | Qué hay |
|------|---------|
| `src/pages/UploadPage.tsx` | Asistente de 3 pasos: rúbrica, solución y entregas, calificar |
| `src/pages/BatchResultsPage.tsx` | Tabla del lote (`/lote`), Excel y actas |
| `src/pages/GradingSheetPage.tsx` | Hoja de calificación editable (`/hoja`) |
| `src/components/RubricTable.tsx` | Editor de la rúbrica y hoja llena |
| `src/lib/grading-sheet.ts` | La fórmula del docente: `min(E,M)/max(E,M) × peso` |
| `src/lib/teacher-rubric.ts` | Importar, derivar y chequear la rúbrica contra el backend |
| `src/lib/student-edits.ts` | Aplica las correcciones de la hoja al resultado de cada estudiante |
| `src/lib/report-pdf.ts` | Actas PDF (jsPDF + autotable) |
| `src/lib/persisted-state.ts` | Persistencia en `localStorage` |
| `src/lib/api.ts` | URL del backend: sin `VITE_API_URL` usa `localhost:8000`; vacío, el mismo origen |

## Docker

`Dockerfile` compila con `VITE_API_URL` vacío y `--base=/`, y sirve el resultado con nginx
(`nginx.conf`), que reenvía `/api`, `/docs` y `/health` al backend. Se levanta desde la raíz
con `docker compose up --build`.
