// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * Dónde está el backend. Un solo lugar, en vez de una constante por archivo.
 *
 * - En desarrollo (`npm run dev`) viene de app/.env: http://localhost:8000.
 * - En Docker se compila con VITE_API_URL vacío: mismo origen, y nginx
 *   reenvía /api al contenedor del backend. Así la app funciona también si
 *   el docente entra desde otra máquina de la red (http://IP-del-servidor:8080);
 *   con "localhost" el navegador buscaría el backend en su propia máquina.
 *
 * Por eso se distingue "no configurada" (undefined) de "vacía" (''): un `||`
 * trataría la cadena vacía como falta de configuración.
 */
const configured: string | undefined = import.meta.env.VITE_API_URL;

export const API_URL = configured === undefined
  ? 'http://localhost:8000'
  : configured.replace(/\/+$/, '');
