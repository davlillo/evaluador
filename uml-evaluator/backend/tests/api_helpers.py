"""Helpers para invocar endpoints de comparación sin TestClient/httpx."""
import asyncio
import io
import os
import zipfile
from pathlib import Path

from fastapi import UploadFile
from starlette.datastructures import Headers

TEST_FILES = Path(__file__).resolve().parent.parent / "test_files"

SOLUCION_CORRECTA = TEST_FILES / "solucion_correcta.xmi"
ESTUDIANTE_INCOMPLETO = TEST_FILES / "estudiante_incompleto.xmi"
MULTI_DIAGRAMA = TEST_FILES / "astah_multi_class_usecase_sequence.xmi"
CASO_USO_DOCENTE = TEST_FILES / "astah_caso_uso_docente.xmi"
SECUENCIA_ASTAH = TEST_FILES / "secuencia_astah.xmi"
SECUENCIA_STARUML_FRAGMENTS = TEST_FILES / "staruml_sequence_alt_loop.xmi"


def run(coro):
    return asyncio.run(coro)


def upload_xmi(path: str | os.PathLike, filename: str | None = None) -> UploadFile:
    path = Path(path)
    content = path.read_bytes()
    name = filename or path.name
    return UploadFile(
        filename=name,
        file=io.BytesIO(content),
        headers=Headers({"content-type": "application/xml"}),
    )


def upload_bytes(filename: str, content: bytes, content_type: str = "application/octet-stream") -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(content),
        headers=Headers({"content-type": content_type}),
    )


def write_zip(zip_path: Path, mapping: dict[str, str | os.PathLike | bytes]) -> Path:
    """Escribe un ZIP. El valor puede ser ruta a copiar o bytes crudos."""
    with zipfile.ZipFile(zip_path, "w") as zf:
        for arcname, src in mapping.items():
            if isinstance(src, (bytes, bytearray)):
                zf.writestr(arcname, bytes(src))
            else:
                zf.write(src, arcname)
    return zip_path


def upload_zip(tmp_path: Path, mapping: dict[str, str | os.PathLike | bytes], name: str = "students.zip") -> UploadFile:
    zip_path = write_zip(tmp_path / name, mapping)
    return UploadFile(
        filename=name,
        file=io.BytesIO(zip_path.read_bytes()),
        headers=Headers({"content-type": "application/zip"}),
    )


def class_result(body: dict) -> dict:
    for item in body.get("results") or []:
        if item.get("diagram_type") == "class":
            return item
    raise AssertionError(f"No hay resultado de clases en {body.get('detected_diagrams')}")


def class_comparison(body: dict) -> dict:
    return class_result(body)["comparison"]


def profile_json(mode: str, counts: list[dict] | None = None) -> str:
    import json
    return json.dumps({"mode": mode, "expected_counts": counts or []})


# FastAPI deja Form() sin resolver si se llama la función a mano: hay que
# pasar Python reales, no los objetos Form.
AUTO_FORM_DEFAULTS = {
    "case_sensitive": False,
    "strict_types": True,
    "xmi_source": "astah",
    "use_semantic_matching": False,
    "semantic_threshold": 0.65,
    "selected_types": None,
    "class_weight_classes": None,
    "class_weight_attributes": None,
    "class_weight_methods": None,
    "class_weight_relationships": None,
    "usecase_weight_classes": None,
    "usecase_weight_attributes": None,
    "usecase_weight_methods": None,
    "usecase_weight_include": None,
    "usecase_weight_extend": None,
    "usecase_weight_relationships": None,
    "sequence_weight_classes": None,
    "sequence_weight_relationships": None,
    "sequence_weight_sync_messages": None,
    "sequence_weight_async_messages": None,
    "sequence_weight_creation_messages": None,
    "sequence_weight_fragment_usage": None,
    "global_weight_class": None,
    "global_weight_usecase": None,
    "global_weight_sequence": None,
    "evaluation_profile_json": None,
}

BATCH_FORM_DEFAULTS = {
    "use_semantic_matching": False,
    "semantic_threshold": 0.65,
    "xmi_source": "astah",
    "global_weight_class": 40.0,
    "global_weight_usecase": 35.0,
    "global_weight_sequence": 25.0,
    "evaluation_profile_json": None,
}
