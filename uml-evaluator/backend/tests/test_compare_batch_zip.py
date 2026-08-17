"""
Invoca compare_batch (POST /api/compare-batch) con ZIP sintéticos.
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api.main import compare_batch
from app.parsers.xmi_parser import parse_xmi_file_multi as real_parse
from tests.api_helpers import (
    BATCH_FORM_DEFAULTS,
    ESTUDIANTE_INCOMPLETO,
    MULTI_DIAGRAMA,
    profile_json,
    run,
    upload_bytes,
    upload_xmi,
    upload_zip,
)


def _batch(tmp_path, mapping, expected=MULTI_DIAGRAMA, **kwargs):
    merged = {**BATCH_FORM_DEFAULTS, **kwargs}
    return run(compare_batch(
        expected_file=upload_xmi(expected),
        students_zip=upload_zip(tmp_path, mapping),
        **merged,
    ))


class TestLoteHappyPath:
    def test_dos_alumnos_completo_e_incompleto(self, tmp_path):
        body = _batch(tmp_path, {
            "AA00001.xmi": MULTI_DIAGRAMA,
            "AA00002.xmi": ESTUDIANTE_INCOMPLETO,
        })
        assert body["students_total"] == 2
        by_id = {r["student_id"]: r for r in body["results"]}
        assert set(by_id) == {"AA00001", "AA00002"}

        completo = by_id["AA00001"]
        incompleto = by_id["AA00002"]
        assert completo["complete"] is True
        assert completo["status"] == "ok"
        assert completo["final_score"] > incompleto["final_score"]
        assert incompleto["complete"] is False

    def test_perfil_expected_with_penalty_llega_al_run_de_clases(self, tmp_path):
        body = _batch(
            tmp_path,
            {"AA00001.xmi": MULTI_DIAGRAMA},
            evaluation_profile_json=profile_json(
                "expected_with_penalty",
                [{"element_type": "classes", "expected_quantity": 3}],
            ),
        )
        run_class = body["results"][0]["runs"]["class"]
        assert run_class["status"] == "ok"
        assert run_class["comparison"]["scoring_mode"] == "expected_with_penalty"

    def test_pesos_globales_100_en_clases(self, tmp_path):
        body = _batch(
            tmp_path,
            {"AA00001.xmi": MULTI_DIAGRAMA},
            global_weight_class=100,
            global_weight_usecase=0,
            global_weight_sequence=0,
        )
        gw = body["global_weights_used"]
        assert gw["class"] == pytest.approx(100.0)
        assert gw.get("usecase", 0) == pytest.approx(0.0)
        assert gw.get("sequence", 0) == pytest.approx(0.0)
        class_sim = body["results"][0]["runs"]["class"]["similarity"]
        assert body["results"][0]["final_score"] == pytest.approx(class_sim, abs=0.05)


class TestLoteBordesZip:
    def test_archivo_que_no_es_zip_400(self, tmp_path):
        with pytest.raises(HTTPException) as exc:
            run(compare_batch(
                expected_file=upload_xmi(MULTI_DIAGRAMA),
                students_zip=upload_bytes("alumnos.rar", b"no es zip"),
                **BATCH_FORM_DEFAULTS,
            ))
        assert exc.value.status_code == 400
        assert ".zip" in str(exc.value.detail)

    def test_zip_sin_xmi_400(self, tmp_path):
        with pytest.raises(HTTPException) as exc:
            _batch(tmp_path, {"notas.pdf": b"%PDF-1.4"})
        assert exc.value.status_code == 400
        assert "No se encontraron archivos XMI" in str(exc.value.detail)

    def test_xmi_corrupto_marca_error_y_el_otro_sigue(self, tmp_path):
        body = _batch(tmp_path, {
            "AA00001.xmi": MULTI_DIAGRAMA,
            "AA00002.xmi": b"<not-valid-xmi",
        })
        assert body["students_total"] == 2
        by_id = {r["student_id"]: r for r in body["results"]}
        assert by_id["AA00001"]["status"] == "ok"
        assert by_id["AA00001"]["complete"] is True
        assert by_id["AA00002"]["status"] == "error"
        assert by_id["AA00002"]["final_score"] == 0.0

    def test_estudiante_solo_clases_contra_solucion_triple(self, tmp_path):
        # El XMI multi tiene los tres tipos; al parsear al alumno se deja
        # solo clases (mismo modelo) para simular entrega incompleta.
        parse_calls = {'n': 0}

        def parse_student_solo_clases(path, xmi_source='astah'):
            diagrams = real_parse(path, xmi_source=xmi_source)
            parse_calls['n'] += 1
            if parse_calls['n'] == 1:
                return diagrams
            return {'class': diagrams['class']}

        with patch('app.api.main.parse_xmi_file_multi', side_effect=parse_student_solo_clases):
            body = _batch(tmp_path, {"AA00001.xmi": MULTI_DIAGRAMA})

        row = body["results"][0]
        assert row["complete"] is False
        assert row["runs"]["class"]["status"] == "ok"
        assert row["runs"]["usecase"]["status"] == "missing"
        assert row["runs"]["sequence"]["status"] == "missing"
        class_sim = row["runs"]["class"]["similarity"]
        class_weight = body["global_weights_used"]["class"] / 100.0
        assert class_sim == pytest.approx(100.0, abs=0.5)
        assert row["final_score"] == pytest.approx(class_sim * class_weight, abs=0.05)
        assert row["final_score"] == pytest.approx(40.0, abs=1.0)
