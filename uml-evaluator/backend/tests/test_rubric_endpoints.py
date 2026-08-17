"""
Tests de los endpoints de rúbrica (GET /api/rubric-template, POST
/api/rubric/parse), invocando las funciones async directamente (sin
TestClient/httpx, no es dependencia del proyecto) para validar el flujo
completo: generar plantilla -> subir -> parsear -> preview JSON.
"""
import asyncio
import io
import os

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.api.main import download_rubric_template, parse_rubric
from app.parsers.rubric_template_builder import generate_rubric_template


def _make_upload_file(path: str) -> UploadFile:
    with open(path, "rb") as f:
        content = f.read()
    return UploadFile(
        filename=os.path.basename(path),
        file=io.BytesIO(content),
        headers=Headers({"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),
    )


class TestDownloadTemplate:
    def test_genera_y_sirve_el_archivo(self):
        response = asyncio.run(download_rubric_template())
        assert os.path.exists(response.path)
        assert response.path.endswith(".xlsx")


class TestParseRubricEndpoint:
    def test_sube_y_parsea_plantilla_valida(self, tmp_path):
        template_path = generate_rubric_template(tmp_path / "rubric.xlsx")
        upload = _make_upload_file(str(template_path))

        result = asyncio.run(parse_rubric(rubric_file=upload))

        assert set(result.keys()) == {"class", "usecase", "sequence"}
        assert result["class"]["mode"] == "expected_with_penalty"
        classes_entry = next(
            ec for ec in result["class"]["expected_counts"] if ec["element_type"] == "classes"
        )
        assert classes_entry["expected_quantity"] == 4

    def test_extension_invalida_rechazada(self, tmp_path):
        bad_file = tmp_path / "rubrica.csv"
        bad_file.write_text("a,b,c")
        upload = _make_upload_file(str(bad_file))

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(parse_rubric(rubric_file=upload))
        assert exc_info.value.status_code == 400
