import os
import re
import unicodedata

import numpy as np

try:
    import gensim
    from gensim.models import KeyedVectors
except ImportError:
    gensim = None
    try:
        import fasttext
    except ImportError:
        fasttext = None


# Grupos de sinónimos frecuentes en diagramas UML (español)
_SYNONYM_GROUPS: list[frozenset[str]] = [
    frozenset({'doctor', 'medico', 'médico', 'dr', 'doctores', 'medicos'}),
    frozenset({'verificar', 'revisar', 'comprobar', 'validar', 'chequear', 'consultar'}),
    frozenset({'realizar', 'hacer', 'ejecutar', 'efectuar'}),
    frozenset({'agenda', 'calendario', 'horario', 'cita', 'citas'}),
    frozenset({'paciente', 'pacientes', 'enfermo'}),
    frozenset({'cliente', 'clientes', 'comprador', 'compradores'}),
    frozenset({'cuadro', 'ficha', 'historial', 'expediente'}),
    frozenset({'receta', 'prescripcion', 'prescripción', 'medicamento'}),
    frozenset({'consulta', 'cita', 'atencion', 'atención', 'visita'}),
    frozenset({'admin', 'administrador', 'adm'}),
    frozenset({'recepcionista', 'recepcion', 'secretaria', 'secretario'}),
    frozenset({'examen', 'examenes', 'exámenes', 'analisis', 'análisis', 'prueba'}),
    frozenset({'marcar', 'agendar', 'programar', 'reservar', 'registrar'}),
    frozenset({'autorizar', 'aprobar', 'validar', 'confirmar'}),
    frozenset({'pago', 'pagos', 'cobro', 'cobrar'}),
    frozenset({'venta', 'vender', 'vender', 'comercializar'}),
]

_TOKEN_CANONICAL: dict[str, str] = {}
for _group in _SYNONYM_GROUPS:
    _canonical = min(_group, key=len)
    for _word in _group:
        _TOKEN_CANONICAL[_word] = _canonical


class SemanticMatcher:
    def __init__(self, model_path: str | None = None):
        if model_path is None:
            base = os.path.join(
                os.path.dirname(__file__), '..', '..', 'models', 'cc.es.300'
            )
            self._vec_path = base + '.vec'
            self._kv_path = base + '.kv'
        elif model_path.endswith('.vec'):
            self._vec_path = model_path
            self._kv_path = model_path.replace('.vec', '.kv')
        else:
            self._vec_path = model_path
            self._kv_path = model_path
        self._model = None
        self._loaded = False
        self._use_synonym_fallback = True

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
        text = SemanticMatcher.normalize_text(text)
        parts = re.split(r'[\s_\-/]+', text)
        tokens: list[str] = []
        for part in parts:
            if not part:
                continue
            part_lower = part.lower()
            # Preservar tokens alfanuméricos (p. ej. cuad0) sin partir camelCase.
            if any(c.isdigit() for c in part_lower):
                tokens.append(part_lower)
                continue
            split = SemanticMatcher._split_camel_case(part)
            tokens.extend(split if split else [part_lower])
        return [t for t in tokens if t]

    @staticmethod
    def _canonical_token(token: str) -> str:
        t = SemanticMatcher.normalize_text(token)
        return _TOKEN_CANONICAL.get(t, t)

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

    @classmethod
    def _tokens_equivalent(cls, a: str, b: str, *, strict: bool = False) -> bool:
        ca = cls._canonical_token(a)
        cb = cls._canonical_token(b)
        if ca == cb:
            return True
        if ca == cls.normalize_text(b) or cb == cls.normalize_text(a):
            return True
        if strict:
            return False
        max_len = max(len(ca), len(cb))
        if max_len == 0:
            return True
        dist = cls._levenshtein_distance(ca, cb)
        if max_len <= 4:
            return dist <= 1
        return dist / max_len <= 0.2

    @classmethod
    def _token_similarity_ordered(cls, a: str, b: str, *, strict: bool = False) -> float:
        """Similitud estricta por tokens en orden (casos de uso)."""
        ta = cls._tokenize(a)
        tb = cls._tokenize(b)
        if not ta and not tb:
            return 1.0
        if not ta or not tb:
            return 0.0
        if not cls._tokens_equivalent(ta[0], tb[0], strict=strict):
            return 0.0
        limit = min(len(ta), len(tb))
        matched = sum(
            1 for i in range(limit) if cls._tokens_equivalent(ta[i], tb[i], strict=strict)
        )
        return matched / max(len(ta), len(tb))

    @classmethod
    def _token_similarity(cls, a: str, b: str, *, strict: bool = False) -> float:
        return cls._token_similarity_ordered(a, b, strict=strict)

    @classmethod
    def _phrase_similarity(cls, a: str, b: str, *, strict: bool = False) -> float:
        """Comparación estricta para nombres compuestos (casos de uso)."""
        a_norm = cls.normalize_text(a)
        b_norm = cls.normalize_text(b)
        if a_norm == b_norm:
            return 1.0
        return cls._token_similarity_ordered(a, b, strict=strict)

    @classmethod
    def _single_word_similarity(cls, a: str, b: str, fasttext_score: float) -> float:
        """Comparación para actores u otros identificadores de una palabra."""
        a_norm = cls.normalize_text(a)
        b_norm = cls.normalize_text(b)
        if a_norm == b_norm:
            return 1.0
        if cls._tokens_equivalent(a_norm, b_norm):
            return 1.0
        max_len = max(len(a_norm), len(b_norm))
        if max_len > 0:
            dist = cls._levenshtein_distance(a_norm, b_norm)
            if dist <= 1 and max_len >= 4:
                return 1.0 - dist / max_len
        # FastText solo para actores muy cercanos; evita falsos positivos (vendedor/comprador).
        if fasttext_score >= 0.88:
            return fasttext_score
        return 0.0

    @classmethod
    def _heuristic_similarity(cls, a: str, b: str) -> float:
        a_norm = cls.normalize_text(a)
        b_norm = cls.normalize_text(b)
        if a_norm == b_norm:
            return 1.0
        ta = cls._tokenize(a)
        tb = cls._tokenize(b)
        if len(ta) > 1 or len(tb) > 1:
            return cls._phrase_similarity(a, b)
        return cls._single_word_similarity(a, b, 0.0)

    def _load_model(self) -> bool:
        if self._loaded:
            return True
        if gensim is not None:
            try:
                if os.path.exists(self._kv_path):
                    self._model = KeyedVectors.load(self._kv_path)
                elif os.path.exists(self._vec_path):
                    print("Cargando vectores .vec (500K palabras mas frecuentes)...")
                    self._model = KeyedVectors.load_word2vec_format(
                        self._vec_path, binary=False, limit=500000
                    )
                    self._model.save(self._kv_path)
                    print(f"Modelo guardado en formato nativo: {self._kv_path}")
                else:
                    return False
                self._loaded = True
                return True
            except Exception:
                self._loaded = False
                return False
        if fasttext is not None:
            try:
                path = self._vec_path.replace('.vec', '.bin')
                if os.path.exists(path):
                    self._model = fasttext.load_model(path)
                    self._loaded = True
                    return True
            except Exception:
                pass
        return False

    def is_available(self) -> bool:
        if not self._loaded:
            self._load_model()
        return self._loaded

    def _find_closest(self, word: str, max_distance: int = 2) -> str | None:
        best_word = None
        best_dist = max_distance + 1
        vocab = self._model.index_to_token if hasattr(self._model, 'index_to_token') else list(self._model.key_to_index.keys())
        for candidate in vocab:
            if abs(len(candidate) - len(word)) > max_distance:
                continue
            if candidate[0] != word[0]:
                continue
            dist = self._levenshtein_distance(word, candidate)
            if dist < best_dist:
                best_dist = dist
                best_word = candidate
                if dist == 1:
                    break
        return best_word

    def _word_variants(self, word: str) -> list[str]:
        variants = [word]
        if not self._use_synonym_fallback:
            return variants
        canonical = self._canonical_token(word)
        if canonical != word:
            variants.append(canonical)
        if word.endswith('s') and len(word) > 3:
            singular = word[:-1]
            if singular != word:
                variants.append(singular)
            if word.endswith('es') and len(word) > 4:
                singular2 = word[:-2]
                if singular2 != word:
                    variants.append(singular2)
        return list(dict.fromkeys(variants))

    def _best_vector(self, word: str) -> np.ndarray | None:
        word = word.lower().strip()
        if word in self._model:
            return self._model[word]
        closest = self._find_closest(word, max_distance=2)
        if closest is not None:
            return self._model[closest]
        parts = self._split_camel_case(word)
        if len(parts) == 1 and parts[0] == word:
            return None
        vectors = []
        for part in parts:
            vec = self._best_vector(part)
            if vec is not None:
                vectors.append(vec)
        if not vectors:
            return None
        return np.mean(vectors, axis=0)

    def _cosine(self, vec_a: np.ndarray, vec_b: np.ndarray) -> float:
        dot = np.dot(vec_a, vec_b)
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        score = float(dot / (norm_a * norm_b))
        return max(0.0, score)

    def _fasttext_similarity(self, a: str, b: str) -> float:
        if not self._load_model():
            return 0.0
        best = 0.0
        a_variants = self._word_variants(a)
        b_variants = self._word_variants(b)
        for va in a_variants:
            for vb in b_variants:
                if va == vb:
                    return 1.0
                vec_a = self._best_vector(va)
                vec_b = self._best_vector(vb)
                if vec_a is not None and vec_b is not None:
                    best = max(best, self._cosine(vec_a, vec_b))
        return best

    def similarity(self, a: str, b: str, *, kind: str = 'default') -> float:
        a = a.strip()
        b = b.strip()
        if not a or not b:
            return 0.0
        if self.normalize_text(a) == self.normalize_text(b):
            return 1.0

        ta = self._tokenize(a)
        tb = self._tokenize(b)
        multi = len(ta) > 1 or len(tb) > 1

        if kind == 'use_case' or multi:
            return self._phrase_similarity(a, b, strict=(kind == 'use_case'))

        if kind == 'actor':
            ft = self._fasttext_similarity(a, b)
            return self._single_word_similarity(a, b, ft)

        heuristic = self._heuristic_similarity(a, b)
        if heuristic >= 1.0:
            return 1.0
        if multi:
            return heuristic
        ft = self._fasttext_similarity(a, b)
        return max(heuristic, self._single_word_similarity(a, b, ft))

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
        best_candidate = None
        for norm_candidate, original in normalized_candidates.items():
            score = self.similarity(name, original, kind=kind)
            if score > best_score:
                best_score = score
                best_candidate = original
        if best_score >= threshold:
            return (best_candidate, best_score)
        return (None, 0.0)
