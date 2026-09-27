# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Corre la rubrica del docente contra sus entregas reales y mide la brecha.

Es el nucleo compartido entre el test de calibracion
(tests/test_calibracion_docente.py) y el reporte para el docente
(scripts/reporte_calibracion.py): un solo lugar donde vive "como se compara
la nota del sistema contra la que el puso a mano".
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.comparator.scoring_modes import ClassRubricRule, EvaluationProfile
from app.comparator.uml_comparator import UMLComparator
from app.parsers.xmi_parser import parse_xmi_file_multi

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "test_files" / "calibracion"
RUBRICAS_JSON = FIXTURE_DIR / "rubricas.json"


@dataclass
class ResultadoAlumno:
    carne: str
    turno: str
    nota_docente: float
    nota_sistema: float
    #: etiqueta del criterio -> (modelados del docente, modelados del sistema).
    #: Va por etiqueta y no por rule_id porque los ids se repiten entre turnos.
    desacuerdos: Dict[str, tuple] = field(default_factory=dict)

    @property
    def error(self) -> float:
        return abs(self.nota_sistema - self.nota_docente)

    @property
    def delta(self) -> float:
        return self.nota_sistema - self.nota_docente


@dataclass
class ResumenCalibracion:
    resultados: List[ResultadoAlumno]

    @property
    def total(self) -> int:
        return len(self.resultados)

    @property
    def mae(self) -> float:
        """Error absoluto medio, en puntos de la escala 0-10."""
        if not self.resultados:
            return 0.0
        return sum(r.error for r in self.resultados) / len(self.resultados)

    @property
    def mediana(self) -> float:
        if not self.resultados:
            return 0.0
        errores = sorted(r.error for r in self.resultados)
        medio = len(errores) // 2
        if len(errores) % 2:
            return errores[medio]
        return (errores[medio - 1] + errores[medio]) / 2

    @property
    def peor(self) -> float:
        return max((r.error for r in self.resultados), default=0.0)

    def dentro_de(self, margen: float) -> int:
        return sum(1 for r in self.resultados if r.error <= margen)

    def proporcion_dentro_de(self, margen: float) -> float:
        if not self.resultados:
            return 0.0
        return self.dentro_de(margen) / len(self.resultados)

    def desacuerdos_por_criterio(self) -> Dict[str, int]:
        conteo: Dict[str, int] = {}
        for resultado in self.resultados:
            for etiqueta in resultado.desacuerdos:
                conteo[etiqueta] = conteo.get(etiqueta, 0) + 1
        return dict(sorted(conteo.items(), key=lambda kv: -kv[1]))


def _rule_from_dict(raw: Dict[str, Any]) -> ClassRubricRule:
    return ClassRubricRule(
        rule_id=raw["rule_id"],
        criterion_type=raw["criterion_type"],
        label=raw["label"],
        weight=raw["weight"],
        expected_quantity=raw.get("expected_quantity"),
        source=raw.get("source"),
        target=raw.get("target"),
        relationship_type=raw.get("relationship_type", "association"),
        multiplicity_end=raw.get("multiplicity_end"),
        expected_multiplicity=raw.get("expected_multiplicity"),
    )


def _class_diagram(path: Path):
    diagramas = parse_xmi_file_multi(str(path), xmi_source="astah")
    diagrama = diagramas.get("class")
    if diagrama is None and diagramas:
        diagrama = next(iter(diagramas.values()))
    return diagrama


def _modelados_docente(valor: Optional[str]) -> Optional[float]:
    """La columna D del Excel; el docente dejo alguna celda con texto suelto."""
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def evaluar_turno(
    turno: str,
    datos: Dict[str, Any],
    use_semantic_matching: bool = True,
) -> List[ResultadoAlumno]:
    reglas = [_rule_from_dict(raw) for raw in datos["reglas"]]
    solucion = _class_diagram(FIXTURE_DIR / "soluciones" / datos["solucion"])
    perfil = EvaluationProfile(class_rules=reglas)

    resultados: List[ResultadoAlumno] = []
    for carne, esperado in sorted(datos["alumnos"].items()):
        entrega = _class_diagram(FIXTURE_DIR / turno / ("%s.xmi" % carne))
        if entrega is None:
            continue
        comparador = UMLComparator(
            evaluation_profile=perfil,
            use_semantic_matching=use_semantic_matching,
        )
        comparacion = comparador.compare(solucion, entrega)

        desacuerdos = {}
        for fila in comparacion.class_rubric_breakdown:
            del_docente = _modelados_docente(
                esperado["modelados_docente"].get(fila["rule_id"]),
            )
            if del_docente is None:
                continue
            try:
                del_sistema = float(fila["modeled"])
            except (TypeError, ValueError):
                # criterios binarios: el motor reporta texto, no cantidad
                del_sistema = 1.0 if fila["correct"] else 0.0
            if del_docente != del_sistema:
                desacuerdos[fila["label"]] = (del_docente, del_sistema)

        resultados.append(ResultadoAlumno(
            carne=carne,
            turno=turno,
            nota_docente=esperado["nota_docente"],
            nota_sistema=round(comparacion.overall_similarity / 10.0, 4),
            desacuerdos=desacuerdos,
        ))
    return resultados


def correr_calibracion(use_semantic_matching: bool = True) -> ResumenCalibracion:
    """Evalua las 46 entregas con la rubrica que el docente uso el ano pasado."""
    datos = json.loads(RUBRICAS_JSON.read_text(encoding="utf-8"))
    resultados: List[ResultadoAlumno] = []
    for turno, contenido in datos.items():
        resultados.extend(evaluar_turno(turno, contenido, use_semantic_matching))
    return ResumenCalibracion(resultados=resultados)
