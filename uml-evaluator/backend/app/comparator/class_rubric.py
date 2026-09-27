# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Rúbrica del docente para diagramas de clases, criterio por criterio.

Cada criterio (Clases, multiplicidad de un extremo, clase de asociación) se
puntúa con su curva: min(Esperados, Modelados) / max(...) × peso. Las reglas
de este módulo están calibradas contra las 46 notas reales del docente
(ver app/comparator/calibracion.py).
"""

import difflib
from typing import List, Dict, Any, Optional

from app.models.uml_elements import (
    UMLDiagram, UMLRelationship, RelationshipType,
)
from app.comparator.scoring_modes import (
    ClassRubricRule, normal_curve_factor,
)
from app.comparator.results import ComparisonResult


class ClassRubricMixin:
    """Califica un diagrama de clases con la rúbrica del docente.

    Se mezcla en UMLComparator: usa sus utilidades de nombres por `self`.
    """

    # Astah exporta el extremo vacio cuando el multiplicidad dibujada es la
    # implicita de UML ("1"). La solucion docente y las entregas lo dejan asi,
    # y el docente lo califica como "1". Calibrado contra sus 46 notas reales:
    # tratarlo como "1" baja el MAE de 0.75 a 0.59 sobre 10 puntos.
    IMPLICIT_MULTIPLICITY = "1"

    # El docente acepta que se modele con una relacion mas fuerte de la esperada
    # (nota suya en el Excel: "Podria haberse modelado como agregacion, pero no
    # como composicion"). Exigir el tipo exacto empeora el MAE.
    #
    # Medido contra sus 46 notas de Práctica 1 (scripts/reporte_calibracion.py):
    #   - agregación pedida, asociación dibujada: él da el punto. Aceptarlo
    #     baja el MAE de 0.415 a 0.393.
    #   - su nota literal (composición aparte de todo) lo sube a 0.476: en la
    #     práctica sí acepta composición donde pidió asociación.
    # Composición pedida y asociación dibujada no se acepta: no hay ni un caso
    # en sus notas para medirlo, y es la lectura más prudente de su nota.
    RELATIONSHIP_TYPE_COMPATIBILITY = {
        "association": {"association", "aggregation", "composition"},
        "aggregation": {"aggregation", "composition", "association"},
        "composition": {"composition", "aggregation"},
    }

    @staticmethod
    def _normalize_multiplicity(
        value: Optional[str], blank_is_implicit: bool = False,
    ) -> str:
        normalized = (value or "").replace(" ", "").strip()
        if not normalized:
            return ClassRubricMixin.IMPLICIT_MULTIPLICITY if blank_is_implicit else ""
        aliases = {
            "1..1": "1",
            "*": "0..*",
            "*..*": "0..*",
        }
        return aliases.get(normalized, normalized)

    def _accepted_relationship_types(self, rule_type: str) -> set:
        return self.RELATIONSHIP_TYPE_COMPATIBILITY.get(rule_type, {rule_type})

    @staticmethod
    def _relationship_type_label(value: str) -> str:
        return {
            "association": "asociación",
            "aggregation": "agregación",
            "composition": "composición",
            "association_class": "clase de asociación",
        }.get(value, value)

    def _relationship_value_for_rule(
        self,
        rule: ClassRubricRule,
        relationships: List[UMLRelationship],
    ) -> tuple[Optional[UMLRelationship], Optional[str]]:
        """Busca la relación de la regla y orienta la multiplicidad solicitada."""
        sibling = self._reflexive_siblings.get(rule.rule_id)
        if sibling is not None:
            return self._reflexive_value_for_rule(rule, sibling, relationships)

        accepted = self._accepted_relationship_types(rule.relationship_type)
        matches: List[tuple[UMLRelationship, Optional[str]]] = []
        for relationship in relationships:
            actual_type = relationship.relationship_type.value
            if actual_type not in accepted:
                continue
            direct = (
                self._rubric_name_matches(relationship.source, rule.source or "")
                and self._rubric_name_matches(relationship.target, rule.target or "")
            )
            reverse = (
                self._rubric_name_matches(relationship.source, rule.target or "")
                and self._rubric_name_matches(relationship.target, rule.source or "")
            )
            if not direct and not reverse:
                continue

            if rule.multiplicity_end == "source":
                value = (
                    relationship.source_multiplicity
                    if direct else relationship.target_multiplicity
                )
            elif rule.multiplicity_end == "target":
                value = (
                    relationship.target_multiplicity
                    if direct else relationship.source_multiplicity
                )
            else:
                value = None
            matches.append((relationship, value))

        if not matches:
            return None, None
        expected = self._normalize_multiplicity(rule.expected_multiplicity)
        for relationship, value in matches:
            if self._normalize_multiplicity(value, blank_is_implicit=True) == expected:
                return relationship, value
        for relationship, value in matches:
            if not value:
                return relationship, value
        return matches[0]

    def _is_reflexive_rule(self, rule: ClassRubricRule) -> bool:
        return bool(rule.source) and (
            self._normalize_name(rule.source or "")
            == self._normalize_name(rule.target or "")
        )

    def _pair_reflexive_rules(
        self, rules: List[ClassRubricRule],
    ) -> Dict[str, ClassRubricRule]:
        """Empareja las dos multiplicidades de cada asociación reflexiva.

        La rúbrica del docente las escribe una debajo de la otra bajo el mismo
        encabezado ("Asociación reflexiva Sala"); hay que evaluarlas juntas.
        """
        pares: Dict[str, ClassRubricRule] = {}
        pendientes: Dict[tuple, ClassRubricRule] = {}
        for rule in rules:
            if rule.criterion_type != "multiplicity" or not self._is_reflexive_rule(rule):
                continue
            clave = (
                self._normalize_name(rule.source or ""),
                rule.relationship_type,
                rule.group_label or "",
            )
            otra = pendientes.pop(clave, None)
            if otra is None:
                pendientes[clave] = rule
            else:
                pares[rule.rule_id] = otra
                pares[otra.rule_id] = rule
        return pares

    def _reflexive_value_for_rule(
        self,
        rule: ClassRubricRule,
        sibling: ClassRubricRule,
        relationships: List[UMLRelationship],
    ) -> tuple[Optional[UMLRelationship], Optional[str]]:
        """Multiplicidad de una asociación reflexiva (Sala <-> Sala).

        Los dos extremos son la misma clase, así que el nombre no dice cuál
        es el "origen". Se elige la relación y la orientación que mejor calzan
        con el par de multiplicidades esperadas, y cada regla se queda con su
        extremo. El par se mira siempre desde la regla "source" para que las
        dos reglas elijan lo mismo y no se acredite un extremo dos veces.
        """
        accepted = self._accepted_relationship_types(rule.relationship_type)
        primera, segunda = (
            (rule, sibling) if rule.multiplicity_end != "target" else (sibling, rule)
        )
        esperada_1 = self._normalize_multiplicity(primera.expected_multiplicity)
        esperada_2 = self._normalize_multiplicity(segunda.expected_multiplicity)

        mejor: Optional[tuple] = None  # (aciertos, relación, valor 1, valor 2)
        for relationship in relationships:
            if relationship.relationship_type.value not in accepted:
                continue
            clase = rule.source or ""
            if not (
                self._rubric_name_matches(relationship.source, clase)
                and self._rubric_name_matches(relationship.target, clase)
            ):
                continue
            extremos = (relationship.source_multiplicity, relationship.target_multiplicity)
            for valor_1, valor_2 in (extremos, extremos[::-1]):
                aciertos = int(
                    self._normalize_multiplicity(valor_1, blank_is_implicit=True) == esperada_1
                ) + int(
                    self._normalize_multiplicity(valor_2, blank_is_implicit=True) == esperada_2
                )
                if mejor is None or aciertos > mejor[0]:
                    mejor = (aciertos, relationship, valor_1, valor_2)

        if mejor is None:
            return None, None
        _, relationship, valor_1, valor_2 = mejor
        return relationship, (valor_1 if rule is primera else valor_2)

    def _relationship_with_different_type(
        self,
        rule: ClassRubricRule,
        relationships: List[UMLRelationship],
    ) -> Optional[UMLRelationship]:
        """Busca el mismo par cuando existe, pero con un tipo UML diferente."""
        association_family = {
            RelationshipType.ASSOCIATION.value,
            RelationshipType.AGGREGATION.value,
            RelationshipType.COMPOSITION.value,
        }
        accepted = self._accepted_relationship_types(rule.relationship_type)
        for relationship in relationships:
            actual_type = relationship.relationship_type.value
            if actual_type not in association_family or actual_type in accepted:
                continue
            direct = (
                self._rubric_name_matches(relationship.source, rule.source or "")
                and self._rubric_name_matches(relationship.target, rule.target or "")
            )
            reverse = (
                self._rubric_name_matches(relationship.source, rule.target or "")
                and self._rubric_name_matches(relationship.target, rule.source or "")
            )
            if direct or reverse:
                return relationship
        return None

    def _rubric_name_matches(self, actual: str, configured: str) -> bool:
        """Compara nombres de la rúbrica contra los del estudiante.

        Además del match exacto y del plural simple, consulta el mapa de alias
        que arma `_build_rubric_alias`: el estudiante casi nunca usa el mismo
        nombre que la solución (modela `Ganadero` donde el docente puso
        `Afiliado`) y el docente sí le da el punto al leer el diagrama.
        """
        actual_norm = self._normalize_name(actual)
        configured_norm = self._normalize_name(configured)
        if actual_norm == configured_norm:
            return True
        singular = lambda value: value[:-1] if len(value) > 3 and value.endswith("s") else value
        if singular(actual_norm) == singular(configured_norm):
            return True
        return self._rubric_alias.get(configured_norm) == actual_norm

    #: Debajo de esta similitud dos nombres se consideran clases distintas.
    #: Calibrado contra las 46 entregas ya calificadas por el docente.
    RUBRIC_ALIAS_THRESHOLD = 0.55

    def _build_rubric_alias(
        self,
        rules: List[ClassRubricRule],
        student: UMLDiagram,
    ) -> Dict[str, str]:
        """Empareja los nombres de la rúbrica con las clases del estudiante.

        La asignación es uno a uno y golosa por similitud descendente: si no lo
        fuera, `Ganado` se llevaría a `Ganadero` y dejaría a `CabezaGanadoVacuno`
        sin dueño, que es justo el error que hay que evitar cuando el estudiante
        renombra todo el dominio.
        """
        rubric_names = {
            name
            for rule in rules
            for name in (rule.source, rule.target)
            if name
        }
        # las clases de asociacion no viven en diagram.classes pero si son
        # extremos de relaciones, y la rubrica las nombra ("Historial")
        student_names = [c.name for c in student.classes if c.name]
        vistos = {self._normalize_name(n) for n in student_names}
        for relationship in student.relationships:
            for endpoint in (relationship.source, relationship.target):
                if endpoint and self._normalize_name(endpoint) not in vistos:
                    student_names.append(endpoint)
                    vistos.add(self._normalize_name(endpoint))
        if not rubric_names or not student_names:
            return {}

        pares = []
        for rubric_name in rubric_names:
            rubric_norm = self._normalize_name(rubric_name)
            for student_name in student_names:
                student_norm = self._normalize_name(student_name)
                if rubric_norm == student_norm:
                    continue  # el match exacto no necesita alias
                score = self._rubric_name_similarity(rubric_name, student_name)
                if score >= self.RUBRIC_ALIAS_THRESHOLD:
                    pares.append((score, rubric_norm, student_norm))

        pares.sort(key=lambda p: (-p[0], p[1], p[2]))
        tomados_rubrica, tomados_estudiante = set(), set()
        # las clases que ya coinciden literalmente no se pueden reasignar
        for student_name in student_names:
            student_norm = self._normalize_name(student_name)
            if any(self._normalize_name(r) == student_norm for r in rubric_names):
                tomados_rubrica.add(student_norm)
                tomados_estudiante.add(student_norm)

        alias: Dict[str, str] = {}
        for _, rubric_norm, student_norm in pares:
            if rubric_norm in tomados_rubrica or student_norm in tomados_estudiante:
                continue
            alias[rubric_norm] = student_norm
            tomados_rubrica.add(rubric_norm)
            tomados_estudiante.add(student_norm)
        return alias

    def _rubric_name_similarity(self, rubric_name: str, student_name: str) -> float:
        """Qué tan probable es que ambos nombres designen la misma clase."""
        rubric_norm = self._normalize_name(rubric_name)
        student_norm = self._normalize_name(student_name)
        if not rubric_norm or not student_norm:
            return 0.0
        if rubric_norm in student_norm or student_norm in rubric_norm:
            # `Estudio` dentro de `EstudioRealizado`: el más corto manda, pero
            # se descuenta lo que sobra para no premiar coincidencias flojas.
            corto, largo = sorted((len(rubric_norm), len(student_norm)))
            return 0.6 + 0.4 * (corto / largo)
        if self._semantic_matcher is not None:
            return self._semantic_matcher.similarity(rubric_name, student_name)
        return difflib.SequenceMatcher(None, rubric_norm, student_norm).ratio()

    def _has_association_class(
        self,
        rule: ClassRubricRule,
        student: UMLDiagram,
    ) -> tuple[bool, Optional[str], bool]:
        """Busca la clase de asociación entre los dos extremos de la regla.

        Devuelve (encontrada, nombre, es_nativa). `es_nativa` distingue una
        AssociationClass de verdad de la heurística de clase intermedia: para
        la primera el nombre da igual (el docente da el punto aunque el alumno
        la llame `Diagnostico` donde la solución dice `HistorialEnfermedad`),
        para la segunda conviene seguir exigiendo el nombre porque la señal es
        mucho más débil.
        """
        direct, _ = self._relationship_value_for_rule(rule, student.relationships)
        if direct is not None:
            return True, direct.name, True

        intermediate_association_class_links = {
            RelationshipType.AGGREGATION,
            RelationshipType.COMPOSITION,
        }
        for candidate in student.classes:
            if self._names_match(candidate.name, rule.source or "") or self._names_match(
                candidate.name, rule.target or "",
            ):
                continue
            connected_source = False
            connected_target = False
            for relationship in student.relationships:
                if relationship.relationship_type not in intermediate_association_class_links:
                    continue
                other: Optional[str] = None
                if self._names_match(relationship.source, candidate.name):
                    other = relationship.target
                elif self._names_match(relationship.target, candidate.name):
                    other = relationship.source
                if other is None:
                    continue
                connected_source = connected_source or self._rubric_name_matches(
                    other, rule.source or "",
                )
                connected_target = connected_target or self._rubric_name_matches(
                    other, rule.target or "",
                )
            if connected_source and connected_target:
                return True, candidate.name, False
        return False, None, False

    def _calculate_class_rubric(
        self,
        rules: List[ClassRubricRule],
        expected_diagram: UMLDiagram,
        student: UMLDiagram,
        result: ComparisonResult,
    ) -> float:
        """Evalúa clases y relaciones nombradas como criterios independientes."""
        rows: List[Dict[str, Any]] = []
        weighted_sum = 0.0
        total_weight = 0.0
        self._rubric_alias = self._build_rubric_alias(rules, student)
        self._reflexive_siblings = self._pair_reflexive_rules(rules)

        for rule in rules:
            score = 0.0
            expected: Any = None
            modeled: Any = None
            message = ""
            modeled_relationship_type: Optional[str] = None

            if rule.criterion_type == "classes":
                expected = (
                    rule.expected_quantity
                    if rule.expected_quantity is not None
                    else result.total_classes_expected
                )
                modeled = result.total_classes_found
                score = normal_curve_factor(expected, modeled) * 100.0
                # con el emparejamiento de la rúbrica: "Salas" es la "Sala" de
                # la solución aunque el match estricto de nombres diga que no
                reconocidas = sum(
                    1 for esperada in expected_diagram.classes
                    if any(
                        self._rubric_name_matches(propia.name, esperada.name)
                        for propia in student.classes
                    )
                )
                message = (
                    f"Se esperaban {expected} clases y el estudiante modeló "
                    f"{modeled}; {reconocidas} de las {len(expected_diagram.classes)} "
                    f"de la solución se reconocen en su diagrama."
                )
            elif rule.criterion_type == "relationship":
                relationship, value = self._relationship_value_for_rule(
                    rule, student.relationships,
                )
                if relationship is not None:
                    modeled_relationship_type = relationship.relationship_type.value
                expected = f"{rule.source}–{rule.target} ({rule.relationship_type})"
                modeled = (
                    f"{relationship.source}–{relationship.target} "
                    f"({relationship.relationship_type.value})"
                    if relationship is not None
                    else "No encontrada"
                )
                score = 100.0 if relationship is not None else 0.0
                message = (
                    f"Relación {rule.relationship_type} encontrada entre "
                    f"{rule.source} y {rule.target}."
                    if relationship is not None
                    else (
                        f"No se encontró una relación {rule.relationship_type} "
                        f"entre {rule.source} y {rule.target}."
                    )
                )
            elif rule.criterion_type == "multiplicity":
                relationship, value = self._relationship_value_for_rule(
                    rule, student.relationships,
                )
                different_type = None
                if relationship is None:
                    different_type = self._relationship_with_different_type(
                        rule, student.relationships,
                    )
                if relationship is not None:
                    modeled_relationship_type = relationship.relationship_type.value
                elif different_type is not None:
                    modeled_relationship_type = different_type.relationship_type.value
                expected = rule.expected_multiplicity or ""
                implicit = not value and relationship is not None
                modeled_value = self._normalize_multiplicity(
                    value, blank_is_implicit=True,
                )
                modeled = value or (
                    self.IMPLICIT_MULTIPLICITY if implicit else ""
                )
                score = 100.0 if (
                    relationship is not None
                    and modeled_value == self._normalize_multiplicity(expected)
                ) else 0.0
                if different_type is not None:
                    modeled = "No evaluada por tipo incorrecto"
                    message = (
                        f"Se encontró {self._relationship_type_label(different_type.relationship_type.value)} entre "
                        f"{rule.source} y {rule.target}, pero la rúbrica exige "
                        f"{self._relationship_type_label(rule.relationship_type)}; "
                        "no se otorgaron puntos."
                    )
                elif implicit:
                    message = (
                        f"El extremo se dejó en blanco, que en UML equivale a "
                        f"{self.IMPLICIT_MULTIPLICITY}; multiplicidad esperada "
                        f"{expected or 'vacía'}."
                    )
                else:
                    message = (
                        f"Multiplicidad esperada {expected or 'vacía'}; "
                        f"modelada {modeled or 'no encontrada'}."
                    )
            elif rule.criterion_type == "association_class":
                expected_found, expected_association_class, _ = (
                    self._has_association_class(rule, expected_diagram)
                )
                found, association_class_name, es_nativa = (
                    self._has_association_class(rule, student)
                )
                if not expected_found:
                    found = False
                    association_class_name = None
                elif expected_association_class and not es_nativa:
                    # solo la heurística de clase intermedia necesita que el
                    # nombre coincida; una AssociationClass real ya es la prueba
                    found = (
                        found
                        and association_class_name is not None
                        and self._normalize_name(association_class_name)
                        == self._normalize_name(expected_association_class)
                    )
                expected = f"{rule.source or '?'}–{rule.target or '?'}"
                modeled = association_class_name or (expected if found else "No encontrada")
                score = 100.0 if found else 0.0
                if not expected_found:
                    message = (
                        "La solución docente no contiene una clase de asociación "
                        "válida entre ambos extremos; no se otorgaron puntos."
                    )
                elif expected_association_class and association_class_name and not found:
                    message = (
                        f"Se encontró la clase intermedia {association_class_name}, "
                        f"pero la solución exige {expected_association_class}."
                    )
                else:
                    message = (
                        f"Clase de asociación encontrada: {modeled}."
                        if found
                        else (
                            "No se encontró una AssociationClass ni una clase "
                            "intermedia conectada a ambos extremos."
                        )
                    )

            weight = max(0.0, float(rule.weight))
            contribution = score * weight / 100.0
            weighted_sum += contribution
            total_weight += weight
            rows.append({
                "rule_id": rule.rule_id,
                "criterion_type": rule.criterion_type,
                "label": rule.label,
                "group_label": rule.group_label,
                "source": rule.source,
                "target": rule.target,
                "relationship_type": rule.relationship_type,
                "modeled_relationship_type": modeled_relationship_type,
                "multiplicity_end": rule.multiplicity_end,
                "score": round(score, 2),
                "weight": round(weight, 2),
                "contribution": round(contribution, 2),
                "expected": expected,
                "modeled": modeled,
                "correct": score >= 99.999,
                "message": message,
            })

        result.class_rubric_breakdown = rows
        result.scoring_mode = self.evaluation_profile.mode.value
        if total_weight <= 0:
            return 0.0
        return weighted_sum * 100.0 / total_weight
