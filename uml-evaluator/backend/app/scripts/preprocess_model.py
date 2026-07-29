"""
Preprocesa vectores FastText a formato nativo .kv de gensim.
Se ejecuta UNA SOLA VEZ (fuera del servidor).
El servidor carga el .kv en segundos.

Acepta, en este orden:
  1. models/cc.es.300.vec  (word2vec text; preferido, se puede limitar al leer)
  2. models/cc.es.300.bin  (FastText nativo Facebook; p. ej. ya descargado)
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")
VEC_PATH = os.path.join(MODELS_DIR, "cc.es.300.vec")
BIN_PATH = os.path.join(MODELS_DIR, "cc.es.300.bin")
KV_PATH = os.path.join(MODELS_DIR, "cc.es.300.kv")
LIMIT = 500000  # 500K palabras ~ cubre vocabulario UML


def _clear_old_kv() -> None:
    if not os.path.isdir(MODELS_DIR):
        return
    for f in os.listdir(MODELS_DIR):
        if f.startswith("cc.es.300.kv"):
            os.remove(os.path.join(MODELS_DIR, f))
            print(f"Eliminado: {f}")


def _save_limited_kv(source_kv, limit: int) -> None:
    from gensim.models import KeyedVectors

    n = min(limit, len(source_kv))
    keys = list(source_kv.index_to_key[:n])
    vectors = [source_kv[k] for k in keys]
    out = KeyedVectors(vector_size=source_kv.vector_size)
    out.add_vectors(keys, vectors)
    out.save(KV_PATH)
    print(f"Guardado {n} palabras en: {KV_PATH}")


def preprocess() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    _clear_old_kv()

    t0 = time.time()
    if os.path.exists(VEC_PATH):
        print(f"Cargando .vec con limite de {LIMIT} palabras...")
        print("Esto puede tardar varios minutos...")
        from gensim.models import KeyedVectors

        model = KeyedVectors.load_word2vec_format(VEC_PATH, binary=False, limit=LIMIT)
        print(f"Cargado en {time.time() - t0:.0f}s — vocabulario: {len(model)}")
        print("Guardando formato nativo .kv ...")
        t1 = time.time()
        model.save(KV_PATH)
        print(f"Guardado en {time.time() - t1:.0f}s — {KV_PATH}")
    elif os.path.exists(BIN_PATH):
        print(f"Cargando .bin FastText (Facebook): {BIN_PATH}")
        print("Esto puede tardar varios minutos y usar bastante RAM...")
        from gensim.models.fasttext import load_facebook_vectors

        model = load_facebook_vectors(BIN_PATH)
        print(f"Cargado en {time.time() - t0:.0f}s — vocabulario: {len(model)}")
        print(f"Recortando a {LIMIT} palabras y guardando .kv ...")
        t1 = time.time()
        _save_limited_kv(model, LIMIT)
        print(f"Guardado en {time.time() - t1:.0f}s")
        del model
    else:
        print("ERROR: No se encuentra cc.es.300.vec ni cc.es.300.bin en models/")
        print("Ejecuta primero: python app/scripts/download_fasttext.py")
        print("  (o coloca el .bin de FastText ES en models/)")
        sys.exit(1)

    print("Listo. El servidor cargara este .kv en ~1-2s.")


if __name__ == "__main__":
    preprocess()
