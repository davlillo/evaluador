# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Convierte la Calificacion.xlsx del docente en la fixture de calibracion.

El docente califico 89 entregas a mano en 4 turnos, con una hoja por turno.
Cada bloque de alumno tiene la misma tabla:

    Criterio | % | Esperados | Modelados | Nota ponderada | Observacion

con la formula =IF(C>=D,(D/C)*B,IF(C<D,(C/D)*B,0)) y Total = SUMA(E)*10.

De ahi se extrae:
  - la rubrica de cada turno, traducida a ClassRubricRule
  - la nota final que puso el docente por alumno
  - su columna "Modelados", para poder comparar criterio por criterio

Los nombres de clase del Excel vienen abreviados ("Historial" por
"HistorialEnfermedad"), asi que se resuelven contra el XMI de solucion.

Uso:
    python scripts/build_calibracion_fixture.py
"""
from __future__ import annotations

import difflib
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

FIXTURE_DIR = BACKEND / "test_files" / "calibracion"
XLSX = FIXTURE_DIR / "calificacion_docente.xlsx"
OUT = FIXTURE_DIR / "rubricas.json"

MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

# hoja del Excel -> (carpeta de entregas, xmi de solucion)
TURNOS = {
    "Tuno10AMImpar": ("T1-IMPAR", "Turno1Impar.xmi"),
    "Turno10AMPar": ("T1-PAR", "Turno1Par.xmi"),
    "Turno1110AMImpar": ("T2-IMPAR", "Turno2Ambas.xmi"),
    "Turno1110AMPar": ("T2-PAR", "Turno2Ambas.xmi"),
}

O = chr(0xF3)  # o con tilde, sin depender del encoding de este archivo
ASOC, AGRE, COMP = "Asociaci" + O + "n", "Agregaci" + O + "n", "Composici" + O + "n"

GROUP_RE = re.compile("(%s|%s|%s)" % (ASOC, AGRE, COMP) + r"\s+(.+?)-(.+)$")
MULT_RE = re.compile(r"Multiplicidad\s+(\S+)\s+en\s+(.+)$")
ASSOC_CLASS_RE = re.compile("Clase de asociaci" + O + r"n\s+(.+?)-(.+)$")
STUDENT_RE = re.compile(r"^[A-Z]{2}\d{5}$")

GROUP_KIND = {ASOC: "association", AGRE: "aggregation", COMP: "composition"}


def norm(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value or "")
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", stripped.lower())


def read_sheets(path: Path) -> dict:
    """Lee el .xlsx sin openpyxl: solo interesa el valor crudo de cada celda."""
    with zipfile.ZipFile(path) as zf:
        shared = [
            "".join(t.text or "" for t in si.iter(MAIN_NS + "t"))
            for si in ET.fromstring(zf.read("xl/sharedStrings.xml"))
        ]
        rels = {
            rel.get("Id"): rel.get("Target")
            for rel in ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        }
        book = ET.fromstring(zf.read("xl/workbook.xml"))
        sheets = {}
        for sheet in book.find(MAIN_NS + "sheets"):
            grid = {}
            target = rels[sheet.get(REL_ID)]
            for row in ET.fromstring(zf.read("xl/" + target)).iter(MAIN_NS + "row"):
                for cell in row.findall(MAIN_NS + "c"):
                    value = cell.find(MAIN_NS + "v")
                    if value is None:
                        continue
                    if cell.get("t") == "s":
                        grid[cell.get("r")] = shared[int(value.text)]
                    else:
                        grid[cell.get("r")] = value.text
            sheets[sheet.get("name")] = grid
        return sheets


def blocks_from_grid(grid: dict) -> list:
    """Parte la hoja en un bloque por alumno."""
    rows = sorted({int(re.match(r"[A-Z]+(\d+)", k).group(1)) for k in grid})
    found, current = [], None
    for row in rows:
        label = (grid.get("A%d" % row) or "").strip()
        if STUDENT_RE.match(label):
            current = {"carne": label, "filas": [], "nota": None}
        elif label == "Total" and current is not None:
            try:
                current["nota"] = round(float(grid.get("E%d" % row)), 4)
            except (TypeError, ValueError):
                current["nota"] = None  # el docente dejo una celda con error
            found.append(current)
            current = None
        elif current is not None and label and label != "Criterio":
            current["filas"].append({
                "criterio": label,
                "peso": grid.get("B%d" % row),
                "esperados": grid.get("C%d" % row),
                "modelados": grid.get("D%d" % row),
                "observacion": grid.get("F%d" % row),
            })
    return found


def solution_names(xmi: Path) -> list:
    """Nombres de clase y de clase de asociacion del XMI de solucion."""
    from app.parsers.xmi_parser import PRIMITIVE_TYPES

    uml = "{org.omg.xmi.namespace.UML}"
    root = ET.parse(xmi).getroot()
    names = []
    for tag in ("Class", "AssociationClass"):
        for elem in root.iter(uml + tag):
            name = elem.get("name")
            if elem.get("xmi.id") and name and name.lower() not in PRIMITIVE_TYPES:
                names.append(name)
    return names


def resolve(label: str, names: list) -> str:
    """El Excel abrevia ("Historial"); el XMI trae "HistorialEnfermedad"."""
    target = norm(label)
    if not target:
        return label
    for name in names:
        if norm(name) == target:
            return name
    contained = [n for n in names if target in norm(n) or norm(n) in target]
    if contained:
        return min(contained, key=lambda n: abs(len(norm(n)) - len(target)))
    close = difflib.get_close_matches(target, [norm(n) for n in names], 1, 0.7)
    if close:
        return next(n for n in names if norm(n) == close[0])
    return label


def build_rules(filas: list, names: list) -> list:
    """Traduce las filas del Excel a ClassRubricRule.

    Los renglones "Asociacion X-Y" son encabezados de grupo: no puntuan solos,
    definen el par de clases y el tipo de relacion de sus hijas. Solo se emiten
    las filas hoja, cuyos pesos ya suman 1.0 en el Excel del docente.
    """
    rules, group, index = [], None, 0
    for fila in filas:
        criterio = fila["criterio"]
        peso, esperados = fila["peso"], fila["esperados"]

        group_match = GROUP_RE.match(criterio)
        if group_match and esperados is None:
            group = {
                "kind": GROUP_KIND[group_match.group(1)],
                "source": resolve(group_match.group(2).strip(), names),
                "target": resolve(group_match.group(3).strip(), names),
            }
            continue
        if peso is None or esperados is None:
            continue  # "Relaciones" y demas encabezados sin puntaje

        index += 1
        rule = {
            "rule_id": "r%d" % index,
            "label": criterio,
            "weight": round(float(peso) * 100, 6),
        }
        mult_match = MULT_RE.match(criterio)
        assoc_match = ASSOC_CLASS_RE.match(criterio)
        if criterio == "Clases":
            rule.update(
                criterion_type="classes",
                expected_quantity=int(float(esperados)),
            )
        elif mult_match and group:
            end_class = resolve(mult_match.group(2).strip(), names)
            rule.update(
                criterion_type="multiplicity",
                source=group["source"],
                target=group["target"],
                relationship_type=group["kind"],
                multiplicity_end=(
                    "source" if end_class == group["source"] else "target"
                ),
                expected_multiplicity=mult_match.group(1),
            )
        elif assoc_match:
            rule.update(
                criterion_type="association_class",
                source=resolve(assoc_match.group(1).strip(), names),
                target=resolve(assoc_match.group(2).strip(), names),
                relationship_type="association_class",
            )
        else:
            raise SystemExit("Criterio no reconocido: %r" % criterio)
        rules.append(rule)
    return rules


def main() -> None:
    sheets = read_sheets(XLSX)
    salida = {}
    for hoja, (carpeta, solucion) in TURNOS.items():
        names = solution_names(FIXTURE_DIR / "soluciones" / solucion)
        bloques = blocks_from_grid(sheets[hoja])
        rules = build_rules(bloques[0]["filas"], names)

        total = sum(r["weight"] for r in rules)
        assert abs(total - 100.0) < 0.01, "%s: los pesos suman %s" % (hoja, total)

        alumnos = {}
        for bloque in bloques:
            xmi = FIXTURE_DIR / carpeta / ("%s.xmi" % bloque["carne"])
            if bloque["nota"] is None or not xmi.exists():
                continue
            leaf = [f for f in bloque["filas"]
                    if f["peso"] is not None and f["esperados"] is not None]
            alumnos[bloque["carne"]] = {
                "nota_docente": bloque["nota"],
                "modelados_docente": {
                    rule["rule_id"]: fila["modelados"]
                    for rule, fila in zip(rules, leaf)
                },
            }
        salida[carpeta] = {
            "hoja_excel": hoja,
            "solucion": solucion,
            "reglas": rules,
            "alumnos": alumnos,
        }
        print("%-10s %2d reglas, %2d alumnos con XMI y nota (de %d calificados)"
              % (carpeta, len(rules), len(alumnos), len(bloques)))

    OUT.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nEscrito %s" % OUT)


if __name__ == "__main__":
    main()
