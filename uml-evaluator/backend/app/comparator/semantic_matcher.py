import os
import re

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


_SYNONYM_MAP = {
    'admin': 'administrador',
    'adm': 'administrador',
}


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

    @staticmethod
    def _split_camel_case(name: str) -> list[str]:
        parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|\d|\s|$)|[a-z]+', name)
        return [p.lower() for p in parts if p]

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
        if word in _SYNONYM_MAP:
            variants.append(_SYNONYM_MAP[word])
        for key, val in _SYNONYM_MAP.items():
            if val == word:
                variants.append(key)
        if word.endswith('s') and len(word) > 3:
            singular = word[:-1]
            if singular != word:
                variants.append(singular)
            if word.endswith('es') and len(word) > 4:
                singular2 = word[:-2]
                if singular2 != word:
                    variants.append(singular2)
        return variants

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

    def similarity(self, a: str, b: str) -> float:
        a = a.lower().strip()
        b = b.lower().strip()
        if a == b:
            return 1.0
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

    def find_best_match(
        self, name: str, candidates: list[str], threshold: float = 0.50
    ) -> tuple[str | None, float]:
        name = name.lower().strip()
        normalized_candidates = {c.lower().strip(): c for c in candidates}
        if name in normalized_candidates:
            return (normalized_candidates[name], 1.0)
        best_score = 0.0
        best_candidate = None
        for norm_candidate, original in normalized_candidates.items():
            score = self.similarity(name, norm_candidate)
            if score > best_score:
                best_score = score
                best_candidate = original
        if best_score >= threshold:
            return (best_candidate, best_score)
        return (None, 0.0)
