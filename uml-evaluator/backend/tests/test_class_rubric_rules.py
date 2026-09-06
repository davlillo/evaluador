import pytest

from app.comparator.scoring_modes import ClassRubricRule, EvaluationProfile, ScoringMode
from app.comparator.uml_comparator import UMLComparator
from app.models.uml_elements import (
    RelationshipType,
    UMLClass,
    UMLDiagram,
    UMLRelationship,
)


def _multiplicity(rule_id, label, weight, source, target, end, expected):
    return ClassRubricRule(
        rule_id=rule_id,
        criterion_type="multiplicity",
        label=label,
        weight=weight,
        source=source,
        target=target,
        relationship_type="association",
        multiplicity_end=end,
        expected_multiplicity=expected,
    )


def test_rubrica_excel_califica_cada_multiplicidad_independiente():
    class_names = ["Afiliado", "Ganado", "Producción", "Enfermedad", "Historial", "Medicamento"]
    expected = UMLDiagram(
        name="Docente",
        diagram_type="class",
        classes=[UMLClass(name=name) for name in class_names],
        relationships=[],
    )
    student = UMLDiagram(
        name="Estudiante",
        diagram_type="class",
        classes=[UMLClass(name=name) for name in class_names],
        relationships=[
            UMLRelationship(
                source="Afiliado",
                target="Ganado",
                relationship_type=RelationshipType.ASSOCIATION,
                source_multiplicity="1",
                target_multiplicity="1..*",
            ),
            UMLRelationship(
                source="Ganado",
                target="Producción",
                relationship_type=RelationshipType.ASSOCIATION,
                source_multiplicity="1",
                target_multiplicity="0..*",
            ),
        ],
    )
    rules = [
        ClassRubricRule(
            rule_id="classes",
            criterion_type="classes",
            label="Clases",
            weight=20,
            expected_quantity=5,
        ),
        _multiplicity("a-src", "Multiplicidad Afiliado", 10, "Afiliado", "Ganado", "source", "1..1"),
        _multiplicity("a-tgt", "Multiplicidad Ganado", 10, "Afiliado", "Ganado", "target", "1..*"),
        _multiplicity("p-src", "Multiplicidad Ganado", 10, "Ganado", "Producción", "source", "1"),
        _multiplicity("p-tgt", "Multiplicidad Producción", 10, "Ganado", "Producción", "target", "1..*"),
        ClassRubricRule(
            rule_id="ac-1",
            criterion_type="association_class",
            label="Clase de asociación Enfermedad-Ganado",
            weight=20,
            source="Enfermedad",
            target="Ganado",
            relationship_type="association_class",
        ),
        ClassRubricRule(
            rule_id="ac-2",
            criterion_type="association_class",
            label="Clase de asociación Historial-Medicamento",
            weight=20,
            source="Historial",
            target="Medicamento",
            relationship_type="association_class",
        ),
    ]
    profile = EvaluationProfile(
        mode=ScoringMode.EXPECTED_WITH_PENALTY,
        class_rules=rules,
    )

    result = UMLComparator(evaluation_profile=profile).compare(expected, student)

    assert result.overall_similarity == pytest.approx(46.6667, abs=0.01)
    assert [row["score"] for row in result.class_rubric_breakdown] == pytest.approx(
        [100 * 5 / 6, 100, 100, 100, 0, 0, 0],
        abs=0.01,
    )
    assert sum(row["contribution"] for row in result.class_rubric_breakdown) == pytest.approx(
        result.overall_similarity,
        abs=0.02,
    )


def test_clase_de_asociacion_astah_como_clase_intermedia():
    expected = UMLDiagram(
        name="Docente",
        diagram_type="class",
        classes=[
            UMLClass(name="Enfermedad"),
            UMLClass(name="Ganado"),
            UMLClass(name="HistoriaEnfermedad"),
        ],
        relationships=[
            UMLRelationship(
                source="HistoriaEnfermedad",
                target="Enfermedad",
                relationship_type=RelationshipType.AGGREGATION,
            ),
            UMLRelationship(
                source="HistoriaEnfermedad",
                target="Ganado",
                relationship_type=RelationshipType.AGGREGATION,
            ),
        ],
    )
    student = UMLDiagram(
        name="Estudiante",
        diagram_type="class",
        classes=[
            UMLClass(name="Enfermedad"),
            UMLClass(name="Ganado"),
            UMLClass(name="HistoriaEnfermedad"),
        ],
        relationships=[
            UMLRelationship(
                source="HistoriaEnfermedad",
                target="Enfermedad",
                relationship_type=RelationshipType.AGGREGATION,
            ),
            UMLRelationship(
                source="HistoriaEnfermedad",
                target="Ganado",
                relationship_type=RelationshipType.AGGREGATION,
            ),
        ],
    )
    profile = EvaluationProfile(
        class_rules=[ClassRubricRule(
            rule_id="association-class",
            criterion_type="association_class",
            label="Clase de asociación Enfermedad-Ganado",
            weight=100,
            source="Enfermedad",
            target="Ganado",
            relationship_type="association_class",
        )],
    )

    result = UMLComparator(evaluation_profile=profile).compare(expected, student)

    assert result.overall_similarity == pytest.approx(100.0)
    assert result.class_rubric_breakdown[0]["modeled"] == "HistoriaEnfermedad"


def test_clase_intermedia_con_nombre_distinto_no_es_clase_de_asociacion():
    expected = UMLDiagram(
        name="Docente",
        diagram_type="class",
        classes=[
            UMLClass(name="Ganado"),
            UMLClass(name="Enfermedad"),
            UMLClass(name="HistoriaEnfermedad"),
        ],
        relationships=[
            UMLRelationship(
                source="HistoriaEnfermedad",
                target="Enfermedad",
                relationship_type=RelationshipType.AGGREGATION,
            ),
            UMLRelationship(
                source="HistoriaEnfermedad",
                target="Ganado",
                relationship_type=RelationshipType.AGGREGATION,
            ),
        ],
    )
    student = UMLDiagram(
        name="RE25012",
        diagram_type="class",
        classes=[
            UMLClass(name="Ganado"),
            UMLClass(name="Enfermedad"),
            UMLClass(name="Vaca"),
        ],
        relationships=[
            UMLRelationship(
                source="Ganado",
                target="Vaca",
                relationship_type=RelationshipType.COMPOSITION,
            ),
            UMLRelationship(
                source="Vaca",
                target="Enfermedad",
                relationship_type=RelationshipType.AGGREGATION,
            ),
        ],
    )
    profile = EvaluationProfile(
        class_rules=[ClassRubricRule(
            rule_id="association-class",
            criterion_type="association_class",
            label="Clase de asociación Enfermedad-Ganado",
            weight=100,
            source="Enfermedad",
            target="Ganado",
            relationship_type="association_class",
        )],
    )

    result = UMLComparator(evaluation_profile=profile).compare(expected, student)

    assert result.overall_similarity == 0
    assert result.class_rubric_breakdown[0]["modeled"] == "Vaca"
    assert "solución exige HistoriaEnfermedad" in result.class_rubric_breakdown[0]["message"]


def test_agregacion_acepta_minusculas_y_tildes():
    expected = UMLDiagram(name="Docente", diagram_type="class")
    student = UMLDiagram(
        name="Estudiante",
        diagram_type="class",
        relationships=[UMLRelationship(
            source="TRATAMIENTÓ",
            target="Historial",
            relationship_type=RelationshipType.AGGREGATION,
            source_multiplicity="0..1",
            target_multiplicity="0..*",
        )],
    )
    rule = ClassRubricRule(
        rule_id="aggregation-source",
        criterion_type="multiplicity",
        label="Multiplicidad del tratamiento",
        weight=100,
        source="tratamiento",
        target="HISTÓRIAL",
        relationship_type="aggregation",
        multiplicity_end="source",
        expected_multiplicity="0..1",
    )

    result = UMLComparator(
        evaluation_profile=EvaluationProfile(class_rules=[rule]),
    ).compare(expected, student)

    assert result.overall_similarity == pytest.approx(100.0)
    assert result.class_rubric_breakdown[0]["relationship_type"] == "aggregation"
    assert result.class_rubric_breakdown[0]["source"] == "tratamiento"
    assert result.class_rubric_breakdown[0]["target"] == "HISTÓRIAL"


def test_multiplicidad_elige_la_relacion_correcta_entre_duplicadas():
    expected = UMLDiagram(name="Docente", diagram_type="class")
    student = UMLDiagram(
        name="Estudiante",
        diagram_type="class",
        relationships=[
            UMLRelationship(
                source="Cliente",
                target="Pedido",
                relationship_type=RelationshipType.ASSOCIATION,
                target_multiplicity="1",
            ),
            UMLRelationship(
                source="Cliente",
                target="Pedido",
                relationship_type=RelationshipType.ASSOCIATION,
                target_multiplicity="1..*",
            ),
        ],
    )
    rule = _multiplicity(
        "orders", "Pedidos del cliente", 100,
        "cliente", "pedido", "target", "1..*",
    )

    result = UMLComparator(
        evaluation_profile=EvaluationProfile(class_rules=[rule]),
    ).compare(expected, student)

    assert result.overall_similarity == pytest.approx(100.0)
    assert result.class_rubric_breakdown[0]["modeled"] == "1..*"


def test_relacion_exige_el_tipo_configurado_sin_suponer_equivalencias():
    expected = UMLDiagram(name="Docente", diagram_type="class")
    student = UMLDiagram(
        name="EJ25001",
        diagram_type="class",
        relationships=[UMLRelationship(
            source="Tratamiento",
            target="Medicamento",
            relationship_type=RelationshipType.ASSOCIATION,
        )],
    )
    rule = ClassRubricRule(
        rule_id="aggregation",
        criterion_type="relationship",
        label="Agregación Tratamiento-Medicamento",
        weight=100,
        source="Tratamiento",
        target="Medicamento",
        relationship_type="aggregation",
    )

    result = UMLComparator(
        evaluation_profile=EvaluationProfile(class_rules=[rule]),
    ).compare(expected, student)

    assert result.overall_similarity == 0
    assert result.class_rubric_breakdown[0]["modeled"] == "No encontrada"


def test_multiplicidad_ausente_no_recibe_puntos():
    expected = UMLDiagram(name="Docente", diagram_type="class")
    student = UMLDiagram(
        name="Estudiante",
        diagram_type="class",
        relationships=[UMLRelationship(
            source="Afiliados",
            target="Ganado",
            relationship_type=RelationshipType.ASSOCIATION,
        )],
    )
    rule = _multiplicity(
        "missing-multiplicity", "Multiplicidad en Ganado", 100,
        "Afiliado", "Ganado", "target", "1..*",
    )

    result = UMLComparator(
        evaluation_profile=EvaluationProfile(class_rules=[rule]),
    ).compare(expected, student)

    assert result.overall_similarity == 0
    assert result.class_rubric_breakdown[0]["modeled"] == "No exportada"


def test_multiplicidad_informa_si_el_par_tiene_otro_tipo():
    expected = UMLDiagram(name="Docente", diagram_type="class")
    student = UMLDiagram(
        name="EJ25001",
        diagram_type="class",
        relationships=[UMLRelationship(
            source="Tratamiento",
            target="Medicamento",
            relationship_type=RelationshipType.ASSOCIATION,
            target_multiplicity="1..*",
        )],
    )
    rule = ClassRubricRule(
        rule_id="aggregation-multiplicity",
        criterion_type="multiplicity",
        label="Multiplicidad en Medicamento",
        weight=100,
        source="Tratamiento",
        target="Medicamento",
        relationship_type="aggregation",
        multiplicity_end="target",
        expected_multiplicity="1..*",
    )

    result = UMLComparator(
        evaluation_profile=EvaluationProfile(class_rules=[rule]),
    ).compare(expected, student)
    row = result.class_rubric_breakdown[0]

    assert result.overall_similarity == 0
    assert row["modeled_relationship_type"] == "association"
    assert "rúbrica exige agregación" in row["message"]


def test_asociacion_generica_acepta_composicion_como_especializacion():
    expected = UMLDiagram(name="Docente", diagram_type="class")
    student = UMLDiagram(
        name="HN22002",
        diagram_type="class",
        relationships=[UMLRelationship(
            source="Afiliados",
            target="Ganado",
            relationship_type=RelationshipType.COMPOSITION,
            source_multiplicity="1..1",
            target_multiplicity="1..*",
        )],
    )
    rules = [
        _multiplicity(
            "source", "Multiplicidad en Afiliado", 50,
            "Afiliado", "Ganado", "source", "1",
        ),
        _multiplicity(
            "target", "Multiplicidad en Ganado", 50,
            "Afiliado", "Ganado", "target", "1..*",
        ),
    ]

    result = UMLComparator(
        evaluation_profile=EvaluationProfile(class_rules=rules),
    ).compare(expected, student)

    assert result.overall_similarity == pytest.approx(100)
    assert all(row["score"] == 100 for row in result.class_rubric_breakdown)
