# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Punto de entrada para parsear XMI/XML de diagramas UML.

Detecta la versión del archivo y delega: XMI 1.1 (Astah/JUDE) en
xmi11_parser, XMI 2.x (StarUML, Enterprise Architect, Visual Paradigm...)
en xmi2_parser. Reexporta los nombres públicos para que el resto del
código siga importando desde aquí.
"""

import xml.etree.ElementTree as ET
from typing import Dict, Optional

from app.models.uml_elements import UMLDiagram
from app.parsers.xmi_common import (
    PRIMITIVE_TYPES, DEFAULT_CLASS_NAME_RE, is_placeholder_class_name, UC_VERBS, looks_like_use_case_name, decode_xmi_name,
)
from app.parsers.xmi11_parser import XMIParserV11
from app.parsers.xmi2_parser import XMIParser

__all__ = [
    "PRIMITIVE_TYPES", "DEFAULT_CLASS_NAME_RE", "is_placeholder_class_name",
    "UC_VERBS", "looks_like_use_case_name", "decode_xmi_name",
    "XMIParser", "XMIParserV11",
    "parse_xmi_file", "parse_xmi_string", "parse_xmi_file_multi", "parse_xmi_string_multi",
]


def _pick_diagram_from_multi(
    diagrams: Dict[str, UMLDiagram],
    diagram_type: Optional[str] = None,
) -> UMLDiagram:
    """Elige un diagrama de un mapa multi-diagrama."""
    if diagram_type:
        want = diagram_type.strip().lower()
        if want in diagrams:
            return diagrams[want]
        raise ValueError(
            f"No se encontró diagrama de tipo '{want}'. "
            f"Tipos detectados: {', '.join(sorted(diagrams.keys())) or 'ninguno'}."
        )
    if len(diagrams) == 1:
        return next(iter(diagrams.values()))
    for preferred in ('usecase', 'class', 'sequence'):
        if preferred in diagrams:
            return diagrams[preferred]
    return next(iter(diagrams.values()))


def parse_xmi_file(
    file_path: str,
    xmi_source: str = 'astah',
    diagram_type: Optional[str] = None,
) -> UMLDiagram:
    """Función de conveniencia para parsear un archivo XMI (XMI 1.1 o 2.x)."""
    return _pick_diagram_from_multi(
        parse_xmi_file_multi(file_path, xmi_source=xmi_source),
        diagram_type=diagram_type,
    )


def parse_xmi_string(
    xml_content: str,
    xmi_source: str = 'astah',
    diagram_type: Optional[str] = None,
) -> UMLDiagram:
    """Función de conveniencia para parsear un string XMI (XMI 1.1 o 2.x)."""
    return _pick_diagram_from_multi(
        parse_xmi_string_multi(xml_content, xmi_source=xmi_source),
        diagram_type=diagram_type,
    )


def _xmi_version_from_root(root: ET.Element) -> str:
    """Lee la versión XMI del elemento raíz (con o sin namespace)."""
    version = root.get('xmi.version', '')
    if version:
        return version.strip()
    for attr, val in root.attrib.items():
        local = attr.split('}')[-1] if '}' in attr else attr
        if local == 'version' and val:
            return val.strip()
    return ''


def _is_xmi_11_root(root: ET.Element) -> bool:
    version = _xmi_version_from_root(root)
    if version.startswith('1.1'):
        return True
    sample = ET.tostring(root, encoding='unicode')[:4000]
    return 'JUDE' in sample or 'jude/' in sample.lower()


def parse_xmi_file_multi(
    file_path: str,
    xmi_source: str = 'astah',
) -> Dict[str, UMLDiagram]:
    """Parsea un archivo XMI y retorna un diccionario con todos los diagramas detectados."""
    tree = ET.parse(file_path)
    root = tree.getroot()
    if _is_xmi_11_root(root):
        return XMIParserV11().parse_file_multi(file_path)
    diagram = XMIParser(xmi_source=xmi_source).parse_file(file_path)
    return {diagram.diagram_type: diagram}


def parse_xmi_string_multi(
    xml_content: str,
    xmi_source: str = 'astah',
) -> Dict[str, UMLDiagram]:
    """Parsea un string XMI y retorna un diccionario con todos los diagramas detectados."""
    root = ET.fromstring(xml_content)
    if _is_xmi_11_root(root):
        return XMIParserV11().parse_string_multi(xml_content)
    diagram = XMIParser(xmi_source=xmi_source).parse_string(xml_content)
    return {diagram.diagram_type: diagram}
