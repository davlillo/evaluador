// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

const labels: Record<string, string> = {
  class: 'Diagrama de Clases',
  usecase: 'Diagrama de Casos de Uso',
  sequence: 'Diagrama de Secuencia',
};

/** Nombre del tipo de diagrama para títulos de la interfaz. */
export function getDiagramLabel(diagramType: string): string {
  return labels[diagramType] || diagramType;
}
