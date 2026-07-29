import { percentToNota } from '@/lib/rubric';
import type { BatchCompareResponse } from '@/types/evaluation-session';

/**
 * Genera y descarga un CSV con las notas del lote (una fila por estudiante).
 * Columnas: Carné, Similitud (%), Nota (0-10), Estado.
 * Pensado para importarse a Excel o al sistema académico.
 */
export function downloadBatchNotasCsv(batch: BatchCompareResponse, filename = 'notas.csv') {
  const header = ['Carné', 'Similitud (%)', 'Nota (0-10)', 'Estado'];

  const rows = batch.results.map((r) => {
    if (r.status === 'error') {
      return [r.student_id, '', '', 'Error'];
    }
    const estado = r.complete ? 'Completo' : 'Incompleto';
    return [
      r.student_id,
      r.final_score.toFixed(2),
      percentToNota(r.final_score).toFixed(1),
      estado,
    ];
  });

  const escape = (cell: string) => {
    if (/[",\n;]/.test(cell)) {
      return '"' + cell.replace(/"/g, '""') + '"';
    }
    return cell;
  };

  const lines = [header, ...rows].map((row) => row.map(escape).join(','));
  // BOM para que Excel reconozca UTF-8 (acentos correctos).
  const csv = '﻿' + lines.join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
