"""
Preprocesa el modelo .vec a formato nativo .kv de gensim.
Se ejecuta UNA SOLA VEZ (fuera del servidor).
El servidor carga el .kv en segundos.
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")
VEC_PATH = os.path.join(MODELS_DIR, "cc.es.300.vec")
KV_PATH = os.path.join(MODELS_DIR, "cc.es.300.kv")
LIMIT = 500000  # 500K palabras ~ cubre vocabulario UML


def preprocess():
    if not os.path.exists(VEC_PATH):
        print(f"ERROR: No se encuentra {VEC_PATH}")
        print("Ejecuta primero: python app/scripts/download_fasttext.py")
        sys.exit(1)

    # Eliminar .kv anterior si existe
    for f in os.listdir(MODELS_DIR):
        if f.startswith("cc.es.300.kv"):
            os.remove(os.path.join(MODELS_DIR, f))
            print(f"Eliminado: {f}")

    print(f"Cargando .vec con limite de {LIMIT} palabras...")
    print("Esto puede tardar varios minutos...")
    t0 = time.time()

    from gensim.models import KeyedVectors

    model = KeyedVectors.load_word2vec_format(VEC_PATH, binary=False, limit=LIMIT)

    print(f"Cargado en {time.time() - t0:.0f}s")
    print(f"Vocabulario: {len(model)} palabras")
    print(f"Dimensiones: {model.vector_size}")

    print("Guardando formato nativo .kv ...")
    t1 = time.time()
    model.save(KV_PATH)
    print(f"Guardado en {time.time() - t1:.0f}s")
    print(f"Archivo: {KV_PATH}")
    print("Listo. El servidor cargara este .kv en ~1-2s.")


if __name__ == "__main__":
    preprocess()
