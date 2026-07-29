"""
Motor de similitud semántica para nombres de elementos UML.

Capas (en orden de preferencia al combinar):

  1. Normalización (minúsculas, sin acentos).
  2. Tokenización (camelCase, snake_case, guiones y espacios).
  3. Sinónimos genéricos UML + opcionales por dominio.
  4. Distancia de edición (Levenshtein) para erratas.
  5. Solapamiento de tokens (F1) para nombres compuestos.
  6. Embeddings FastText ES (opcional): coseno de media de tokens.
     Si no hay modelo en backend/models/, se ignora sin romper el servidor.
"""
from __future__ import annotations

import os
import re
import unicodedata
from typing import Any, Iterable, Optional, Sequence

import numpy as np

# Sinónimos GENÉRICOS de UML: verbos de acción (CRUD) y roles comunes.
# Deliberadamente NO incluye vocabulario de ningún dominio concreto.
_GENERIC_SYNONYM_GROUPS: list[frozenset[str]] = [
    frozenset({'crear', 'registrar', 'agregar', 'anadir', 'alta', 'nuevo', 'insertar'}),
    frozenset({'eliminar', 'borrar', 'quitar', 'baja', 'remover'}),
    frozenset({'modificar', 'editar', 'actualizar', 'cambiar'}),
    frozenset({'consultar', 'ver', 'mostrar', 'listar', 'buscar', 'visualizar'}),
    frozenset({'validar', 'verificar', 'comprobar', 'revisar', 'chequear'}),
    frozenset({'realizar', 'hacer', 'ejecutar', 'efectuar', 'procesar'}),
    frozenset({'iniciar', 'comenzar', 'empezar'}),
    frozenset({'usuario', 'user'}),
    frozenset({'administrador', 'admin', 'administrator'}),
]

_MODELS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'models')
)
_DEFAULT_KV_PATH = os.path.join(_MODELS_DIR, 'cc.es.300.kv')
_DEFAULT_VEC_PATH = os.path.join(_MODELS_DIR, 'cc.es.300.vec')
_DEFAULT_BIN_PATH = os.path.join(_MODELS_DIR, 'cc.es.300.bin')
_VEC_LOAD_LIMIT = 500_000

# Estado compartido del modelo (una carga por proceso).
_shared_model: Any = None
_shared_load_attempted: bool = False


def _default_model_paths() -> tuple[str, str, str]:
    return _DEFAULT_KV_PATH, _DEFAULT_VEC_PATH, _DEFAULT_BIN_PATH


def embeddings_model_exists(
    kv_path: str | None = None,
    vec_path: str | None = None,
    bin_path: str | None = None,
) -> bool:
    """True si hay .kv, .vec o .bin listo para cargar/preprocesar."""
    kv = kv_path or _DEFAULT_KV_PATH
    vec = vec_path or _DEFAULT_VEC_PATH
    bin_p = bin_path or _DEFAULT_BIN_PATH
    return os.path.exists(kv) or os.path.exists(vec) or os.path.exists(bin_p)


def reset_embedding_cache() -> None:
    """Solo para tests: fuerza un nuevo intento de carga."""
    global _shared_model, _shared_load_attempted
    _shared_model = None
    _shared_load_attempted = False


class SemanticMatcher:
    """Comparador de nombres UML: heurística + embeddings FastText opcionales."""

    def __init__(
        self,
        domain_synonyms: Iterable[Sequence[str]] | None = None,
        *,
        use_generic_synonyms: bool = True,
        model_path: str | None = None,
        use_embeddings: bool = True,
    ):
        """
        Args:
            domain_synonyms: grupos de sinónimos propios del ejercicio (opcional).
            use_generic_synonyms: si False, ignora los sinónimos genéricos de UML.
            model_path: ruta a .kv o .vec; por defecto backend/models/cc.es.300.*
            use_embeddings: si False, solo heurística (útil en tests).
        """
        groups: list[frozenset[str]] = []
        if use_generic_synonyms:
            groups.extend(_GENERIC_SYNONYM_GROUPS)
        if domain_synonyms:
            for group in domain_synonyms:
                normalized = {self.normalize_text(w) for w in group if w and w.strip()}
                if len(normalized) >= 2:
                    groups.append(frozenset(normalized))

        self._token_canonical: dict[str, str] = {}
        for group in groups:
            canonical = min(group, key=len)
            for word in group:
                self._token_canonical[self.normalize_text(word)] = canonical

        self._use_embeddings = use_embeddings
        if model_path is None:
            self._kv_path, self._vec_path, self._bin_path = _default_model_paths()
        elif model_path.endswith('.vec'):
            self._vec_path = model_path
            self._kv_path = model_path[:-4] + '.kv'
            self._bin_path = model_path[:-4] + '.bin'
        elif model_path.endswith('.kv'):
            self._kv_path = model_path
            self._vec_path = model_path[:-3] + '.vec'
            self._bin_path = model_path[:-3] + '.bin'
        elif model_path.endswith('.bin'):
            self._bin_path = model_path
            self._kv_path = model_path[:-4] + '.kv'
            self._vec_path = model_path[:-4] + '.vec'
        else:
            self._kv_path = model_path + '.kv'
            self._vec_path = model_path + '.vec'
            self._bin_path = model_path + '.bin'

    # ------------------------------------------------------------------ #
    # Normalización / tokenización
    # ------------------------------------------------------------------ #
    @staticmethod
    def strip_accents(text: str) -> str:
        normalized = unicodedata.normalize('NFD', text)
        return ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')

    @staticmethod
    def normalize_text(text: str) -> str:
        return SemanticMatcher.strip_accents(text.lower().strip())

    @staticmethod
    def _split_camel_case(name: str) -> list[str]:
        parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|\d|\s|$)|[a-z]+', name)
        return [p.lower() for p in parts if p]

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        text_deaccented = SemanticMatcher.strip_accents(text.strip())
        parts = re.split(r'[\s_\-/]+', text_deaccented)
        tokens: list[str] = []
        for part in parts:
            if not part:
                continue
            if any(c.isdigit() for c in part):
                tokens.append(part.lower())
                continue
            split = SemanticMatcher._split_camel_case(part)
            tokens.extend(split if split else [part.lower()])
        return [t for t in tokens if t]

    def _canonical_token(self, token: str) -> str:
        t = self.normalize_text(token)
        return self._token_canonical.get(t, t)

    # ------------------------------------------------------------------ #
    # Distancia de edición / equivalencia de tokens
    # ------------------------------------------------------------------ #
    @staticmethod
    def _levenshtein_distance(s1: str, s2: str) -> int:
        if len(s1) < len(s2):
            s1, s2 = s2, s1
        if len(s2) == 0:
            return len(s1)
        prev_row = list(range(len(s2) + 1))
        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                cost = 0 if c1 == c2 else 1
                curr_row.append(
                    min(prev_row[j + 1] + 1, curr_row[j] + 1, prev_row[j] + cost)
                )
            prev_row = curr_row
        return prev_row[-1]

    def _tokens_equivalent(self, a: str, b: str, *, strict: bool = False) -> bool:
        ca = self._canonical_token(a)
        cb = self._canonical_token(b)
        if ca == cb:
            return True
        na, nb = self.normalize_text(a), self.normalize_text(b)
        if ca == nb or cb == na:
            return True
        if strict:
            return False
        max_len = max(len(ca), len(cb))
        if max_len == 0:
            return True
        dist = self._levenshtein_distance(ca, cb)
        if max_len <= 4:
            return dist <= 1
        return dist / max_len <= 0.2

    # ------------------------------------------------------------------ #
    # Similitud de frases (nombres compuestos / casos de uso)
    # ------------------------------------------------------------------ #
    def _token_similarity_ordered(self, a: str, b: str, *, strict: bool = False) -> float:
        ta = self._tokenize(a)
        tb = self._tokenize(b)
        if not ta and not tb:
            return 1.0
        if not ta or not tb:
            return 0.0
        if not self._tokens_equivalent(ta[0], tb[0], strict=strict):
            return 0.0
        limit = min(len(ta), len(tb))
        matched = sum(
            1 for i in range(limit) if self._tokens_equivalent(ta[i], tb[i], strict=strict)
        )
        return matched / max(len(ta), len(tb))

    def _token_f1(self, a: str, b: str) -> float:
        ta = self._tokenize(a)
        tb = self._tokenize(b)
        if not ta or not tb:
            return 0.0
        cb = [self._canonical_token(t) for t in tb]
        used = [False] * len(cb)
        matched = 0
        for ta_tok in ta:
            cta = self._canonical_token(ta_tok)
            for j, ctb in enumerate(cb):
                if not used[j] and self._tokens_equivalent(cta, ctb):
                    used[j] = True
                    matched += 1
                    break
        if matched == 0:
            return 0.0
        precision = matched / len(ta)
        recall = matched / len(tb)
        return 2 * precision * recall / (precision + recall)

    def _phrase_similarity(self, a: str, b: str, *, strict: bool = False) -> float:
        a_norm = self.normalize_text(a)
        b_norm = self.normalize_text(b)
        if a_norm == b_norm:
            return 1.0
        ordered = self._token_similarity_ordered(a, b, strict=strict)
        if strict:
            return ordered
        return max(ordered, self._token_f1(a, b))

    def _single_word_similarity(self, a: str, b: str) -> float:
        a_norm = self.normalize_text(a)
        b_norm = self.normalize_text(b)
        if a_norm == b_norm:
            return 1.0
        if self._tokens_equivalent(a_norm, b_norm):
            return 1.0
        max_len = max(len(a_norm), len(b_norm))
        if max_len > 0:
            dist = self._levenshtein_distance(a_norm, b_norm)
            if dist <= 1 and max_len >= 4:
                return 1.0 - dist / max_len
        return 0.0

    def _heuristic_similarity(self, a: str, b: str, *, kind: str = 'default') -> float:
        ta = self._tokenize(a)
        tb = self._tokenize(b)
        multi = len(ta) > 1 or len(tb) > 1
        if kind == 'use_case':
            return self._phrase_similarity(a, b, strict=True)
        if multi:
            return self._phrase_similarity(a, b, strict=False)
        return self._single_word_similarity(a, b)

    # ------------------------------------------------------------------ #
    # Embeddings FastText (opcional)
    # ------------------------------------------------------------------ #
    def _load_model(self) -> bool:
        global _shared_model, _shared_load_attempted
        if not self._use_embeddings:
            return False
        if _shared_load_attempted:
            return _shared_model is not None
        _shared_load_attempted = True
        try:
            from gensim.models import KeyedVectors
        except ImportError:
            return False

        try:
            if os.path.exists(self._kv_path):
                _shared_model = KeyedVectors.load(self._kv_path, mmap='r')
                return True
            if os.path.exists(self._vec_path):
                _shared_model = KeyedVectors.load_word2vec_format(
                    self._vec_path, binary=False, limit=_VEC_LOAD_LIMIT,
                )
                try:
                    os.makedirs(os.path.dirname(self._kv_path), exist_ok=True)
                    _shared_model.save(self._kv_path)
                except OSError:
                    pass
                return True
            if os.path.exists(self._bin_path):
                from gensim.models.fasttext import load_facebook_vectors

                full = load_facebook_vectors(self._bin_path)
                # Recortar a LIMIT y persistir .kv para próximas cargas rápidas.
                n = min(_VEC_LOAD_LIMIT, len(full))
                keys = list(full.index_to_key[:n])
                vectors = [full[k] for k in keys]
                trimmed = KeyedVectors(vector_size=full.vector_size)
                trimmed.add_vectors(keys, vectors)
                _shared_model = trimmed
                try:
                    os.makedirs(os.path.dirname(self._kv_path), exist_ok=True)
                    trimmed.save(self._kv_path)
                except OSError:
                    pass
                return True
        except Exception:
            _shared_model = None
            return False
        return False

    def embeddings_available(self) -> bool:
        """True si el modelo FastText está cargado o se puede cargar."""
        return self._load_model()

    def _token_vector(self, token: str) -> Optional[np.ndarray]:
        if _shared_model is None:
            return None
        t = self.normalize_text(token)
        if not t:
            return None
        try:
            if t in _shared_model:
                return np.asarray(_shared_model[t], dtype=np.float64)
        except Exception:
            return None
        return None

    def _phrase_vector(self, text: str) -> Optional[np.ndarray]:
        tokens = self._tokenize(text)
        if not tokens:
            return None
        vectors: list[np.ndarray] = []
        for tok in tokens:
            vec = self._token_vector(tok)
            if vec is not None:
                vectors.append(vec)
            else:
                # Intentar forma canónica de sinónimo UML (admin -> administrador)
                canon = self._canonical_token(tok)
                if canon != tok:
                    vec = self._token_vector(canon)
                    if vec is not None:
                        vectors.append(vec)
        if not vectors:
            # Último recurso: palabra completa sin tokenizar
            whole = self.normalize_text(text).replace(' ', '')
            vec = self._token_vector(whole)
            if vec is None:
                return None
            return vec
        return np.mean(vectors, axis=0)

    @staticmethod
    def _cosine(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
        norm_a = float(np.linalg.norm(vec_a))
        norm_b = float(np.linalg.norm(vec_b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        score = float(np.dot(vec_a, vec_b) / (norm_a * norm_b))
        return max(0.0, min(1.0, score))

    @staticmethod
    def _calibrate_embedding(score: float) -> float:
        """
        FastText ES suele dar ~0.55–0.70 para sinónimos cercanos (doctor/medico).
        Estira [0.55, 0.75] → [0.65, 1.0] para alinear con semantic_threshold=0.65.
        Por debajo de 0.55 no se infla (ruido / no relacionados).
        """
        if score < 0.55:
            return score
        if score >= 0.75:
            return 1.0
        return 0.65 + (score - 0.55) * (0.35 / 0.20)

    def _embedding_similarity(self, a: str, b: str) -> float:
        if not self._load_model():
            return 0.0
        vec_a = self._phrase_vector(a)
        vec_b = self._phrase_vector(b)
        if vec_a is None or vec_b is None:
            return 0.0
        return self._calibrate_embedding(self._cosine(vec_a, vec_b))

    # ------------------------------------------------------------------ #
    # API pública
    # ------------------------------------------------------------------ #
    def similarity(self, a: str, b: str, *, kind: str = 'default') -> float:
        a = a.strip()
        b = b.strip()
        if not a or not b:
            return 0.0
        if self.normalize_text(a) == self.normalize_text(b):
            return 1.0

        heuristic = self._heuristic_similarity(a, b, kind=kind)
        if heuristic >= 1.0:
            return 1.0

        embedding = self._embedding_similarity(a, b) if self._use_embeddings else 0.0
        return max(heuristic, embedding)

    def is_available(self) -> bool:
        """Heurística siempre disponible; embeddings son opcionales."""
        return True

    def find_best_match(
        self,
        name: str,
        candidates: list[str],
        threshold: float = 0.50,
        *,
        kind: str = 'default',
    ) -> tuple[str | None, float]:
        name_norm = self.normalize_text(name)
        normalized_candidates = {self.normalize_text(c): c for c in candidates}
        if name_norm in normalized_candidates:
            return (normalized_candidates[name_norm], 1.0)
        best_score = 0.0
        best_candidate: str | None = None
        for original in candidates:
            score = self.similarity(name, original, kind=kind)
            if score > best_score:
                best_score = score
                best_candidate = original
        if best_candidate is not None and best_score >= threshold:
            return (best_candidate, best_score)
        return (None, 0.0)
