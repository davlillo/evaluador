const REGISTRY_KEY = 'uml-evaluator-users-registry';

export interface StoredUserRecord {
  email: string;
  password: string;
  name: string;
}

export function loadRegisteredUsers(): StoredUserRecord[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredUserRecord =>
        typeof item === 'object' &&
        item !== null &&
        'email' in item &&
        'password' in item &&
        'name' in item &&
        typeof (item as StoredUserRecord).email === 'string' &&
        typeof (item as StoredUserRecord).password === 'string' &&
        typeof (item as StoredUserRecord).name === 'string',
    );
  } catch {
    return [];
  }
}

export function appendRegisteredUser(record: StoredUserRecord): void {
  const next = [...loadRegisteredUsers(), record];
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
}
