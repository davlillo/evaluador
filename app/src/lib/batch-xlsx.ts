import type { BatchCompareResponse } from '@/types/evaluation-session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Descarga el Excel de notas del lote (hojas Notas/Detalle/Resumen),
 * generado en el backend con openpyxl. Reemplaza el CSV plano anterior
 * (batch-csv.ts), que solo tenía Carné/Similitud/Nota/Estado.
 *
 * Reenvía el batch tal cual está en pantalla — no se re-evalúa en el
 * servidor — junto con las notas editadas manualmente por el docente
 * (notaOverrides), ya que esas ediciones solo viven en el cliente.
 */
export async function downloadBatchNotasXlsx(
  batch: BatchCompareResponse,
  notaOverrides: Record<string, number> = {},
  filename = 'notas_lote.xlsx',
): Promise<void> {
  const response = await fetch(API_URL + '/api/export/batch-xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch, nota_overrides: notaOverrides }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || 'Error al generar el Excel de notas.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
