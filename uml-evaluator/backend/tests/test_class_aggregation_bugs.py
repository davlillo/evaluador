"""
Regresión de dos bugs de agregación en diagramas de clases:

Bug A: _calculate_overall_similarity era el único de los tres bloques de
agregación que no usaba el patrón defensivo (weights.get, saltar peso 0,
descartar solo si expected y found son ambos 0). Indexaba self.weights
directamente (KeyError con pesos parciales) y descartaba criterios donde el
estudiante entregó elementos que no se pedían.

Bug B: los atributos/métodos ESPERADOS se acumulaban solo sobre las clases
acertadas, así que un estudiante que no reconocía ninguna clase hacía
desaparecer el 50% de la rúbrica del promedio en vez de perder esos puntos.
"""
import pytest

from app.models.uml_elements import UMLDiagram, UMLClass, UMLAttribute, UMLMethod
from app.comparator.uml_comparator import UMLComparator


def _cls(name, attrs=(), methods=()):
    return UMLClass(
        name=name,
        attributes=[UMLAttribute(name=a, type='String') for a in attrs],
        methods=[UMLMethod(name=m, return_type='void') for m in methods],
    )


def _diagram(classes):
    return UMLDiagram(name='d', diagram_type='class', classes=list(classes))


class TestBugBAtributosPerdidos:
    def test_sin_clases_acertadas_los_atributos_esperados_no_desaparecen(self):
        expected = _diagram([
            _cls('Cliente', attrs=['nombre', 'dni'], methods=['comprar']),
            _cls('Producto', attrs=['precio'], methods=['aplicarDescuento']),
        ])
        student = _diagram([
            _cls('Xxxxx', attrs=['aaa']),
            _cls('Yyyyy', attrs=['bbb']),
        ])

        result = UMLComparator().compare(expected, student)

        assert result.correct_classes == 0
        # Los 3 atributos y 2 métodos de la referencia siguen siendo el
        # denominador aunque no se haya reconocido ninguna clase.
        assert result.total_attributes_expected == 3
        assert result.total_methods_expected == 2
        assert result.correct_attributes == 0
        assert result.correct_methods == 0
        assert result.attribute_similarity == 0.0
        assert result.method_similarity == 0.0

    def test_clases_acertadas_parcialmente_cuentan_todo_lo_esperado(self):
        expected = _diagram([
            _cls('Cliente', attrs=['nombre', 'dni']),
            _cls('Producto', attrs=['precio', 'stock']),
        ])
        # Solo acierta Cliente; los 2 atributos de Producto siguen esperados.
        student = _diagram([
            _cls('Cliente', attrs=['nombre', 'dni']),
        ])

        result = UMLComparator(use_semantic_matching=False).compare(expected, student)

        assert result.total_attributes_expected == 4
        assert result.correct_attributes == 2
        assert result.attribute_similarity == pytest.approx(50.0)


class TestBugAPatronDefensivo:
    def test_pesos_parciales_sin_clave_no_lanzan_keyerror(self):
        expected = _diagram([_cls('Cliente', attrs=['nombre'])])
        student = _diagram([_cls('Cliente', attrs=['nombre'])])

        # Dict de pesos sin la clave 'classes' — antes reventaba con KeyError.
        comparator = UMLComparator(weights={'attributes': 1.0})
        result = comparator.compare(expected, student)

        assert result.overall_similarity == pytest.approx(100.0)

    def test_criterio_con_peso_cero_se_descarta(self):
        expected = _diagram([_cls('Cliente', attrs=['nombre', 'dni'])])
        # Falla todos los atributos, pero atributos pesa 0.
        student = _diagram([_cls('Cliente', attrs=['zzz', 'www'])])

        comparator = UMLComparator(
            weights={'classes': 1.0, 'attributes': 0.0, 'methods': 0.0, 'relationships': 0.0},
            use_semantic_matching=False,
        )
        result = comparator.compare(expected, student)

        # Solo cuenta clases, que están perfectas.
        assert result.overall_similarity == pytest.approx(100.0)

    def test_solo_clases_no_da_cero(self):
        """Un diagrama sin atributos/métodos/relaciones se evalúa solo por clases."""
        expected = _diagram([_cls('Cliente'), _cls('Producto')])
        student = _diagram([_cls('Cliente'), _cls('Producto')])

        result = UMLComparator(use_semantic_matching=False).compare(expected, student)

        assert result.overall_similarity == pytest.approx(100.0)

    def test_elementos_extra_no_pedidos_si_penalizan(self):
        """Si la referencia no espera atributos pero el estudiante inventa 4,
        el criterio ya no se descarta silenciosamente."""
        expected = _diagram([_cls('Cliente')])
        student = _diagram([_cls('Cliente', attrs=['a', 'b', 'c', 'd'])])

        result = UMLComparator(use_semantic_matching=False).compare(expected, student)

        assert result.total_attributes_expected == 0
        assert result.total_attributes_found == 4
        # El criterio de atributos entra al promedio con 0 y arrastra la nota.
        assert result.overall_similarity < 100.0
