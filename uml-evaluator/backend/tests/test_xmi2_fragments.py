"""
Tests de extracción de fragmentos combinados (alt/loop) en XMI 2.x genérico
(StarUML/EA/Visual Paradigm), a diferencia de Astah XMI 1.1 que ya tenía
soporte end-to-end. Ver XMIParser._extract_interaction /
_map_occurrences_to_fragments.
"""
import os

import pytest

from app.parsers.xmi_parser import parse_xmi_file_multi

FIXTURE = os.path.join(
    os.path.dirname(__file__), '..', 'test_files', 'staruml_sequence_alt_loop.xmi'
)


@pytest.fixture
def sequence_diagram():
    diagrams = parse_xmi_file_multi(FIXTURE, xmi_source='staruml')
    seq = diagrams.get('sequence')
    assert seq is not None, "El fixture debe contener un diagrama de secuencia"
    return seq


def _msg(diagram, name):
    match = [m for m in diagram.messages if m.name == name]
    assert match, f"mensaje '{name}' no encontrado en {[m.name for m in diagram.messages]}"
    return match[0]


class TestFragmentosXMI2:
    def test_mensaje_fuera_de_fragmento_no_tiene_fragment(self, sequence_diagram):
        assert _msg(sequence_diagram, 'iniciarSesion').fragment is None

    def test_mensajes_dentro_de_alt_tienen_fragment_alt(self, sequence_diagram):
        ok = _msg(sequence_diagram, 'accesoConcedido')
        error = _msg(sequence_diagram, 'accesoDenegado')
        assert ok.fragment == 'alt [credenciales validas]'
        assert error.fragment == 'alt [credenciales invalidas]'

    def test_mensajes_dentro_de_loop_tienen_fragment_loop(self, sequence_diagram):
        query = _msg(sequence_diagram, 'consultarRegistro')
        assert query.fragment == 'loop [i less than n]'

    def test_fragmento_anidado_usa_el_mas_interno(self, sequence_diagram):
        encontrado = _msg(sequence_diagram, 'registroEncontrado')
        assert encontrado.fragment == 'alt [registro existe]'

    def test_conteo_de_fragmentos_distintos(self, sequence_diagram):
        labels = {m.fragment for m in sequence_diagram.messages if m.fragment}
        assert labels == {
            'alt [credenciales validas]',
            'alt [credenciales invalidas]',
            'loop [i less than n]',
            'alt [registro existe]',
        }
