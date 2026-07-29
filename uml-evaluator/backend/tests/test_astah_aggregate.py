"""Astah XMI 1.1: aggregation=\"aggregate\" debe parsearse como agregación."""
from pathlib import Path

from app.models.uml_elements import RelationshipType
from app.parsers.xmi_parser import parse_xmi_file_multi

TEST_FILES = Path(__file__).resolve().parent.parent / 'test_files'


def test_astah_aggregate_is_aggregation():
    path = TEST_FILES / 'astah_aggregate_assoc.xmi'
    diagrams = parse_xmi_file_multi(str(path), xmi_source='astah')
    assert 'class' in diagrams
    rels = diagrams['class'].relationships
    assert len(rels) >= 1
    agg = [r for r in rels if r.relationship_type == RelationshipType.AGGREGATION]
    assert len(agg) == 1, (
        f'esperaba 1 aggregation, tipos={[r.relationship_type.value for r in rels]}'
    )
    names = {agg[0].source, agg[0].target}
    assert names == {'Clinica', 'Doctor'}
