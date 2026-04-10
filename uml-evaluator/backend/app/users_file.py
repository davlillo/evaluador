"""
Lectura y escritura atómica de usuarios en JSON (app/src/data/users.json en monorepo).
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, List, TypedDict


class UserRecord(TypedDict):
    email: str
    password: str
    name: str


_users_lock = threading.Lock()


def _resolve_users_path() -> Path:
    env = os.environ.get("USERS_JSON_PATH", "").strip()
    if env:
        return Path(env).expanduser().resolve()

    here = Path(__file__).resolve()
    # Monorepo: mismo archivo que el frontend; se crea en el primer registro (save_users hace mkdir).
    for parent in here.parents:
        if (parent / "app" / "package.json").is_file():
            return (parent / "app" / "src" / "data" / "users.json").resolve()

    for parent in here.parents:
        candidate = parent / "app" / "src" / "data" / "users.json"
        if candidate.is_file():
            return candidate

    backend_root = here.parents[1]
    fallback = backend_root / "data" / "users.json"
    return fallback


USERS_JSON_PATH = _resolve_users_path()


def load_users() -> List[UserRecord]:
    path = USERS_JSON_PATH
    if not path.is_file():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data: Any = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []
    if not isinstance(data, list):
        return []
    out: List[UserRecord] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        email = item.get("email")
        password = item.get("password")
        name = item.get("name")
        if (
            isinstance(email, str)
            and isinstance(password, str)
            and isinstance(name, str)
            and email.strip()
            and name.strip()
        ):
            out.append(
                {
                    "email": email.strip(),
                    "password": password,
                    "name": name.strip(),
                }
            )
    return out


def save_users(users: List[UserRecord]) -> None:
    path = USERS_JSON_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(path)


def find_user_by_credentials(email: str, password: str) -> UserRecord | None:
    normalized = email.strip().lower()
    for u in load_users():
        if u["email"].lower() == normalized and u["password"] == password:
            return u
    return None


def append_user_if_new(record: UserRecord) -> bool:
    """Añade el usuario al JSON. Retorna False si el correo ya existe."""
    with _users_lock:
        users = load_users()
        if any(u["email"].lower() == record["email"].lower() for u in users):
            return False
        users.append(record)
        save_users(users)
        return True
