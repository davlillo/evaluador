"""Detección multi-diagrama en XMI Astah/JUDE 1.1."""
from pathlib import Path

from app.parsers.xmi_parser import parse_xmi_file_multi

TEST_FILES = Path(__file__).resolve().parent.parent / 'test_files'


def test_astah_multi_detects_class_usecase_and_sequence():
    """Class Diagram + UseCase + Sequence en el mismo XMI deben reportar los 3 tipos."""
    path = TEST_FILES / 'astah_multi_class_usecase_sequence.xmi'
    diagrams = parse_xmi_file_multi(str(path), xmi_source='astah')

    assert set(diagrams.keys()) == {'class', 'usecase', 'sequence'}
    assert len(diagrams['class'].classes) >= 2
    class_names = {c.name for c in diagrams['class'].classes}
    assert 'Doctor' in class_names
    assert 'Paciente' in class_names


def test_astah_sequence_only_still_drops_boilerplate_class():
    """XMI de solo secuencia (boilerplate java.*) no debe reportar class."""
    path = TEST_FILES / 'secuencia_astah.xmi'
    if not path.exists():
        return
    diagrams = parse_xmi_file_multi(str(path), xmi_source='astah')
    assert 'sequence' in diagrams
    # Si solo hay boilerplate Java, class no debe aparecer.
    # Si el fixture tiene clases de dominio, class puede aparecer (comportamiento nuevo).
    if 'class' in diagrams:
        names = {c.name.lower() for c in diagrams['class'].classes}
        java_noise = {'string', 'integer', 'boolean', 'object', 'class', 'math'}
        assert names - java_noise, 'class reportado solo con ruido Java'
