"""
Indexación de carnés y extracción segura de ZIP (sin parsear UML).
"""
import os
import zipfile
from pathlib import Path

from app.api.main import _index_students_from_dir, _safe_extract_zip
from tests.api_helpers import SOLUCION_CORRECTA, write_zip


def _extract(tmp_path: Path, mapping: dict, zip_name: str = "lote.zip") -> Path:
    zip_path = write_zip(tmp_path / zip_name, mapping)
    target = tmp_path / "extracted"
    target.mkdir()
    _safe_extract_zip(str(zip_path), str(target))
    return target


class TestIndexacionCarne:
    def test_zip_plano_usa_basename(self, tmp_path):
        target = _extract(tmp_path, {"AA00001.xmi": SOLUCION_CORRECTA})
        indexed = _index_students_from_dir(str(target))
        assert list(indexed.keys()) == ["AA00001"]
        assert indexed["AA00001"].endswith("AA00001.xmi")

    def test_nombre_generico_usa_carpeta_padre(self, tmp_path):
        target = _extract(tmp_path, {"2024001/clases.xmi": SOLUCION_CORRECTA})
        indexed = _index_students_from_dir(str(target))
        assert "2024001" in indexed
        assert "clases" not in indexed

    def test_pdf_e_ignorados(self, tmp_path):
        target = _extract(tmp_path, {
            "AA00001.xmi": SOLUCION_CORRECTA,
            "notas.pdf": b"%PDF-1.4 fake",
            "readme.txt": b"hola",
        })
        indexed = _index_students_from_dir(str(target))
        assert list(indexed.keys()) == ["AA00001"]

    def test_duplicado_mismo_basename_el_primero_gana(self, tmp_path):
        target = _extract(tmp_path, {
            "AA00001.xmi": SOLUCION_CORRECTA,
            "sub/AA00001.xmi": SOLUCION_CORRECTA,
        })
        indexed = _index_students_from_dir(str(target))
        assert list(indexed.keys()) == ["AA00001"]
        # os.walk visita primero la raíz del extracto.
        assert Path(indexed["AA00001"]).parent.name == "extracted"

    def test_zip_vacio_o_solo_macosx_mapa_vacio(self, tmp_path):
        zip_path = tmp_path / "vacio.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("__MACOSX/._AA00001.xmi", b"junk")
        target = tmp_path / "extracted"
        target.mkdir()
        _safe_extract_zip(str(zip_path), str(target))
        assert _index_students_from_dir(str(target)) == {}


class TestExtraccionSegura:
    def test_path_con_parent_no_sale_del_destino(self, tmp_path):
        zip_path = tmp_path / "evil.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("../escape.xmi", b"<xmi/>")
            zf.writestr("ok/AA00001.xmi", Path(SOLUCION_CORRECTA).read_bytes())
        target = tmp_path / "extracted"
        target.mkdir()
        _safe_extract_zip(str(zip_path), str(target))

        assert not (tmp_path / "escape.xmi").exists()
        indexed = _index_students_from_dir(str(target))
        assert "AA00001" in indexed
        abs_target = os.path.abspath(str(target))
        for path in indexed.values():
            assert os.path.abspath(path).startswith(abs_target)
