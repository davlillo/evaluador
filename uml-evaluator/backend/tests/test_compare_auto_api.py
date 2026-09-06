"""
Invoca compare_files_auto (POST /api/compare-auto) con UploadFile, sin httpx.
Cubre archivos individuales, selected_types, pesos, modos de scoring y errores.
"""
import json

import pytest
from fastapi import HTTPException

from app.api.main import compare_files_auto
from tests.api_helpers import (
    AUTO_FORM_DEFAULTS,
    ESTUDIANTE_INCOMPLETO,
    MULTI_DIAGRAMA,
    SOLUCION_CORRECTA,
    class_comparison,
    class_result,
    profile_json,
    run,
    upload_bytes,
    upload_xmi,
)


def _auto(**kwargs):
    kwargs.setdefault("expected_file", upload_xmi(SOLUCION_CORRECTA))
    kwargs.setdefault("student_file", upload_xmi(SOLUCION_CORRECTA))
    merged = {**AUTO_FORM_DEFAULTS, **kwargs}
    return run(compare_files_auto(**merged))


class TestHappyPath:
    def test_mismo_archivo_da_100(self):
        body = _auto()
        assert body["overall_similarity"] == pytest.approx(100.0, abs=0.05)
        assert body["nota"] == pytest.approx(10.0, abs=0.05)
        assert body["aprobado"] is True
        assert "class" in body["detected_diagrams"]

    def test_estudiante_incompleto_baja_de_100(self):
        body = _auto(student_file=upload_xmi(ESTUDIANTE_INCOMPLETO))
        assert body["overall_similarity"] < 100.0
        assert "class" in body["detected_diagrams"]
        assert class_result(body)["similarity"] < 100.0

    def test_multi_diagrama_contra_si_mismo(self):
        body = _auto(
            expected_file=upload_xmi(MULTI_DIAGRAMA),
            student_file=upload_xmi(MULTI_DIAGRAMA),
        )
        types = set(body["detected_diagrams"])
        assert types == {"class", "usecase", "sequence"}
        assert {r["diagram_type"] for r in body["results"]} == types
        assert body["overall_similarity"] == pytest.approx(100.0, abs=0.5)


class TestConfiguracion:
    def test_selected_types_solo_clases_en_xmi_triple(self):
        body = _auto(
            expected_file=upload_xmi(MULTI_DIAGRAMA),
            student_file=upload_xmi(MULTI_DIAGRAMA),
            selected_types="class",
        )
        assert body["detected_diagrams"] == ["class"]
        assert len(body["results"]) == 1
        assert body["results"][0]["diagram_type"] == "class"

    def test_pesos_de_clase_concentrados_en_classes(self):
        body = _auto(
            student_file=upload_xmi(ESTUDIANTE_INCOMPLETO),
            selected_types="class",
            class_weight_classes=100,
            class_weight_attributes=0,
            class_weight_methods=0,
            class_weight_relationships=0,
        )
        used = body["weights_used"]["class"]
        assert used == {
            "classes": 100.0,
            "attributes": 0.0,
            "methods": 0.0,
            "relationships": 0.0,
        }
        assert class_comparison(body)["weights_used"] == used
        assert body["overall_similarity"] == pytest.approx(
            class_comparison(body)["breakdown"]["classes"]["similarity"], abs=0.05,
        )

    def test_pesos_cero_de_casos_de_uso_no_usan_defaults(self):
        body = _auto(
            expected_file=upload_xmi(MULTI_DIAGRAMA),
            student_file=upload_xmi(MULTI_DIAGRAMA),
            selected_types="usecase",
            usecase_weight_classes=100,
            usecase_weight_attributes=0,
            usecase_weight_methods=0,
            usecase_weight_include=0,
            usecase_weight_extend=0,
        )
        used = body["weights_used"]["usecase"]
        assert used == {
            "classes": 100.0,
            "attributes": 0.0,
            "methods": 0.0,
            "include_relations": 0.0,
            "extend_relations": 0.0,
        }
        assert body["results"][0]["comparison"]["weights_used"] == used

    def test_pesos_cero_de_secuencia_no_usan_defaults(self):
        body = _auto(
            expected_file=upload_xmi(MULTI_DIAGRAMA),
            student_file=upload_xmi(MULTI_DIAGRAMA),
            selected_types="sequence",
            sequence_weight_sync_messages=100,
            sequence_weight_async_messages=0,
            sequence_weight_creation_messages=0,
            sequence_weight_fragment_usage=0,
        )
        used = body["weights_used"]["sequence"]
        assert used == {
            "sync_messages": 100.0,
            "async_messages": 0.0,
            "creation_messages": 0.0,
            "fragment_usage": 0.0,
        }
        assert body["results"][0]["comparison"]["weights_used"] == used

    def test_pesos_globales_concentrados_en_clases(self):
        body = _auto(
            expected_file=upload_xmi(MULTI_DIAGRAMA),
            student_file=upload_xmi(MULTI_DIAGRAMA),
            global_weight_class=100,
            global_weight_usecase=0,
            global_weight_sequence=0,
        )
        gw = body["global_weights_used"]
        assert gw == {"class": 100.0, "sequence": 0.0, "usecase": 0.0}
        class_sim = class_result(body)["similarity"]
        assert body["overall_similarity"] == pytest.approx(class_sim, abs=0.05)

    def test_semantic_matching_off_no_rompe(self):
        body = _auto(
            student_file=upload_xmi(ESTUDIANTE_INCOMPLETO),
            use_semantic_matching=False,
        )
        assert body["overall_similarity"] >= 0
        assert "results" in body


class TestModosYCantidades:
    def test_similarity_with_penalty_factor_1_conserva_similitud(self):
        body = _auto(
            student_file=upload_xmi(ESTUDIANTE_INCOMPLETO),
            selected_types="class",
            evaluation_profile_json=profile_json("similarity_with_penalty"),
        )
        comp = class_comparison(body)
        assert comp["scoring_mode"] == "similarity_with_penalty"
        classes = comp["penalty_breakdown"]["classes"]
        assert classes["factor"] == pytest.approx(1.0)
        assert classes["score"] == pytest.approx(
            comp["breakdown"]["classes"]["similarity"],
            abs=0.01,
        )

    def test_expected_no_penalty_recall_sobre_clases(self):
        body = _auto(
            student_file=upload_xmi(ESTUDIANTE_INCOMPLETO),
            selected_types="class",
            evaluation_profile_json=profile_json(
                "expected_no_penalty",
                [{"element_type": "classes", "expected_quantity": 3}],
            ),
        )
        comp = class_comparison(body)
        assert comp["scoring_mode"] == "expected_no_penalty"
        classes = comp["penalty_breakdown"]["classes"]
        assert classes["penalty_applied"] == pytest.approx(0.0)
        assert classes["score"] == pytest.approx(200.0 / 3.0, abs=0.5)

    def test_expected_with_penalty_usa_correctos_como_modelados(self):
        body = _auto(
            student_file=upload_xmi(ESTUDIANTE_INCOMPLETO),
            selected_types="class",
            evaluation_profile_json=profile_json(
                "expected_with_penalty",
                [{"element_type": "classes", "expected_quantity": 3}],
            ),
        )
        comp = class_comparison(body)
        assert comp["scoring_mode"] == "expected_with_penalty"
        classes = comp["penalty_breakdown"]["classes"]
        assert classes["delivered"] == comp["breakdown"]["classes"]["correct"]
        assert classes["factor"] == pytest.approx(2 / 3)
        assert classes["score"] == pytest.approx(200 / 3)

    def test_json_invalido_422(self):
        with pytest.raises(HTTPException) as exc:
            _auto(evaluation_profile_json="{not json")
        assert exc.value.status_code == 422

    def test_modo_hybrid_retirado_422(self):
        with pytest.raises(HTTPException) as exc:
            _auto(evaluation_profile_json=json.dumps({"mode": "hybrid"}))
        assert exc.value.status_code == 422


class TestErrores:
    def test_extension_txt_400(self):
        with pytest.raises(HTTPException) as exc:
            _auto(expected_file=upload_bytes("solucion.txt", b"no es xmi"))
        assert exc.value.status_code == 400
        assert "extensión" in str(exc.value.detail).lower() or "no válida" in str(exc.value.detail)

    def test_selected_types_ausente_en_ambos_archivos_400(self):
        with pytest.raises(HTTPException) as exc:
            _auto(selected_types="usecase")
        assert exc.value.status_code == 400
        assert "tipos seleccionados" in str(exc.value.detail).lower()

    def test_selected_types_desconocido_400(self):
        with pytest.raises(HTTPException) as exc:
            _auto(selected_types="foo")
        assert exc.value.status_code == 400
