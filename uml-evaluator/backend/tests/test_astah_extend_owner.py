"""Parseo Astah de «extend»: el dueño UseCase.extend es la extensión."""
from pathlib import Path

from app.parsers.xmi_parser import parse_xmi_file_multi

TEST_FILES = Path(__file__).resolve().parent.parent / 'test_files'


def test_astah_docente_extend_direction():
    path = TEST_FILES / 'astah_caso_uso_docente.xmi'
    diagrams = parse_xmi_file_multi(str(path), xmi_source='astah')
    assert 'usecase' in diagrams
    d = diagrams['usecase']
    extends = [
        r for r in d.relationships
        if r.relationship_type.value == 'extend'
    ]
    assert len(extends) == 1
    assert extends[0].source == 'Autorizar pago con tarjeta'
    assert extends[0].target == 'Realizar venta'


def test_astah_extend_owner_wins_over_swapped_tags():
    """Si Extension.base/extension vienen cruzados, manda UseCase.extend."""
    path = TEST_FILES / 'astah_extend_swapped_tags.xmi'
    diagrams = parse_xmi_file_multi(str(path), xmi_source='astah')
    d = diagrams['usecase']

    by_kind = {}
    for r in d.relationships:
        by_kind.setdefault(r.relationship_type.value, []).append(r)

    extends = by_kind.get('extend', [])
    assert len(extends) == 1
    assert extends[0].source == 'generar receta meidca'
    assert extends[0].target == 'registrar atencion / diagnostico'

    includes = by_kind.get('include', [])
    assert len(includes) == 1
    assert includes[0].source == 'registrar atencion / diagnostico'
    assert includes[0].target == 'consultar historial clinico del paciente'

    actor_targets = set()
    for r in by_kind.get('association', []):
        ends = {r.source, r.target}
        if 'doctor' in ends:
            actor_targets |= ends - {'doctor'}
    assert 'consultar citas programadas' in actor_targets
    assert 'registrar atencion / diagnostico' in actor_targets
    assert 'generar receta meidca' in actor_targets  # residual en XMI; la vista lo filtra
