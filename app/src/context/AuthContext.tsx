/* eslint-disable react-refresh/only-export-components -- hooks junto al provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getAuthApiBaseUrl, parseApiErrorMessage } from '@/lib/auth-api';

export interface AuthUser {
  email: string;
  name: string;
}

const SESSION_KEY = 'uml-evaluator-session';

function persistSession(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function readSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string, name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readSession());

  const login = useCallback(async (email: string, password: string) => {
    const base = getAuthApiBaseUrl();
    let res: Response;
    try {
      res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(
        'No se pudo conectar con el servidor. Comprobá que el backend esté en marcha (puerto 8000 por defecto).',
      );
    }
    if (!res.ok) {
      throw new Error(await parseApiErrorMessage(res));
    }
    const next = (await res.json()) as AuthUser;
    setUser(next);
    persistSession(next);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const base = getAuthApiBaseUrl();
    let res: Response;
    try {
      res = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
    } catch {
      throw new Error(
        'No se pudo conectar con el servidor. Comprobá que el backend esté en marcha para guardar el usuario en users.json.',
      );
    }
    if (!res.ok) {
      throw new Error(await parseApiErrorMessage(res));
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    persistSession(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, register }),
    [user, login, logout, register],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}
