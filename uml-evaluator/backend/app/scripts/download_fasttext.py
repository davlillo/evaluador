import gzip
import os
import shutil
import urllib.request

MODEL_URL = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.es.300.vec.gz"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")
MODEL_PATH = os.path.join(MODELS_DIR, "cc.es.300.vec")
GZ_PATH = MODEL_PATH + ".gz"


def download_model() -> None:
    if os.path.exists(MODEL_PATH):
        print(f"El modelo ya existe en: {MODEL_PATH}")
        return

    os.makedirs(MODELS_DIR, exist_ok=True)

    print(f"Descargando {MODEL_URL} ...")
    print("Esto puede tomar varios minutos (archivo ~1.2 GB).")
    urllib.request.urlretrieve(MODEL_URL, GZ_PATH)
    print("Descarga completada.")

    print("Descomprimiendo archivo .gz ...")
    with gzip.open(GZ_PATH, "rb") as f_in:
        with open(MODEL_PATH, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

    os.remove(GZ_PATH)
    print(f"Modelo guardado en: {MODEL_PATH}")
    print("La primera carga sera lenta (~3 min). Las siguientes seran rapidas.")


if __name__ == "__main__":
    download_model()
