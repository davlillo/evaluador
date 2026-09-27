// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import type { BatchCompareResponse } from '@/types/evaluation-session';
import { API_URL } from '@/lib/api';

export interface BatchXlsxEdits {
  /** carné -> nota final corregida */
  notaOverrides?: Record<string, number>;
  /** carné -> {rule_id: "Modelados" corregido en la hoja} */
  modeledOverrides?: Record<string, Record<string, number>>;
  /** carné -> {rule_id: observación escrita por el docente} */
  observations?: Record<string, Record<string, string>>;
}

/**
 * Descarga el Excel del lote, generado en el backend con openpyxl: la hoja
 * con el formato propio del docente (un bloque por estudiante, con su
 * fórmula viva) más Notas/Detalle/Resumen.
 *
 * Reenvía el batch tal cual está en pantalla — no se re-evalúa en el
 * servidor — junto con todo lo que el docente corrigió a mano, ya que esas
 * ediciones solo viven en el cliente (localStorage).
 */
export async function downloadBatchNotasXlsx(
  batch: BatchCompareResponse,
  edits: BatchXlsxEdits = {},
  filename = 'notas_lote.xlsx',
): Promise<void> {
  const response = await fetch(API_URL + '/api/export/batch-xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch,
      nota_overrides: edits.notaOverrides ?? {},
      modeled_overrides: edits.modeledOverrides ?? {},
      observations: edits.observations ?? {},
    }),
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
