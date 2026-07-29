"""Parseo Astah de clase Cita: merge anti-duplicado + tipos StructuralFeature."""
from pathlib import Path

from app.parsers.xmi_parser import parse_xmi_file_multi

TEST_FILES = Path(__file__).resolve().parent.parent / 'test_files'


def test_cita_merged_with_typed_attributes():
    path = TEST_FILES / 'astah_cita_duplicate.xmi'
    diagrams = parse_xmi_file_multi(str(path), xmi_source='astah')
    assert 'class' in diagrams
    d = diagrams['class']

    cita_classes = [c for c in d.classes if c.name.lower() == 'cita']
    assert len(cita_classes) == 1, f'esperaba 1 Cita, hubo {[c.name for c in cita_classes]}'

    cita = cita_classes[0]
    attr_names = {a.name for a in cita.attributes}
    assert attr_names == {'fechaHora', 'estado', 'motivo'}

    by_name = {a.name: a for a in cita.attributes}
    assert by_name['fechaHora'].type in ('Date', 'dt-date') or 'date' in by_name['fechaHora'].type.lower()
    assert by_name['estado'].type in ('String', 'dt-string') or 'string' in by_name['estado'].type.lower()
    assert by_name['motivo'].type in ('String', 'dt-string') or 'string' in by_name['motivo'].type.lower()

    method_names = {m.name for m in cita.methods}
    assert 'programar' in method_names
    assert 'cancelar' in method_names
