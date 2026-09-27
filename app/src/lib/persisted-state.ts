// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * Persistencia liviana en localStorage para que un F5 no borre la sesión.
 *
 * El proyecto no tiene base de datos a propósito: el docente evalúa un lote,
 * corrige a mano y exporta. Lo que no puede pasar es que recargar la página
 * le tire abajo dos horas de correcciones, que es lo que ocurría antes
 * (todas las páginas hacen `<Navigate to="/" replace/>` si el contexto está vacío).
 *
 * Todo acceso va envuelto en try/catch: en navegación privada o con las cookies
 * bloqueadas, `localStorage` tira excepción en vez de devolver null.
 */

const PREFIX = 'uml-evaluator:';

export function readPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePersisted(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // sin espacio o sin permiso: la app sigue andando, solo sin recordar
  }
}

export function clearPersisted(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ver arriba
  }
}
