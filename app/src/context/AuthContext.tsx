/* eslint-disable react-refresh/only-export-components -- hooks junto al provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import usersDb from '@/data/users.json';
import {
  appendRegisteredUser,
  loadRegisteredUsers,
  type StoredUserRecord,
} from '@/lib/registered-users-storage';

export interface AuthUser {
  email: string;
  name: string;
}

interface UserRecord {
  email: string;
  password: string;
  name: string;
}

const SESSION_KEY = 'uml-evaluator-session';

function getUsers(): UserRecord[] {
  const fromFile = usersDb as UserRecord[];
  const registered = loadRegisteredUsers();
  return [...fromFile, ...registered];
}

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
    const normalized = email.trim().toLowerCase();
    const found = getUsers().find(
      (u) => u.email.toLowerCase() === normalized && u.password === password,
    );
    if (!found) {
      throw new Error('Correo o contraseña incorrectos.');
    }
    const next: AuthUser = { email: found.email, name: found.name };
    setUser(next);
    persistSession(next);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !trimmedName) {
      throw new Error('Completá correo y nombre.');
    }
    const normalized = trimmedEmail.toLowerCase();
    const exists = getUsers().some((u) => u.email.toLowerCase() === normalized);
    if (exists) {
      throw new Error('Ya existe una cuenta con ese correo.');
    }
    const record: StoredUserRecord = {
      email: trimmedEmail,
      password,
      name: trimmedName,
    };
    appendRegisteredUser(record);
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
