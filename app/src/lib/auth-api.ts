const DEFAULT_API_URL = 'http://localhost:8000';

export function getAuthApiBaseUrl(): string {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || DEFAULT_API_URL;
}

export async function parseApiErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string | Array<{ msg?: string }> };
    const { detail } = data;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0]?.msg;
      if (typeof first === 'string' && first.trim()) {
        return first;
      }
    }
  } catch {
    // Respuesta no JSON o cuerpo vacío
  }
  return `Error del servidor (${res.status})`;
}
