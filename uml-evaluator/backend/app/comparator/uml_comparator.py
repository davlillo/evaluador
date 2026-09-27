# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Módulo de comparación de diagramas UML.
Calcula similitud entre diagramas UML con diferentes niveles de granularidad.

UMLComparator reúne el núcleo (nombres, clases, atributos, métodos,
relaciones y nota global) y hereda por diagrama:
  - class_rubric.py:         la rúbrica del docente para clases
  - usecase_comparison.py:   casos de uso
  - sequence_comparison.py:  secuencia
"""

from typing import List, Dict, Any, Tuple, Set, Optional, Callable

from app.models.uml_elements import (
    UMLDiagram, UMLClass, UMLAttribute, UMLMethod,
    UMLRelationship,
)
from app.comparator.semantic_matcher import SemanticMatcher
from app.comparator.scoring_modes import (
    ClassRubricRule, EvaluationProfile, score_criterion,
)
from app.comparator.results import ComparisonDetail, ClassComparisonResult, ComparisonResult
from app.comparator.class_rubric import ClassRubricMixin
from app.comparator.sequence_comparison import SequenceComparisonMixin
from app.comparator.usecase_comparison import UseCaseComparisonMixin

__all__ = [
    "ComparisonDetail", "ClassComparisonResult", "ComparisonResult",
    "UMLComparator", "compare_uml_diagrams",
]


class UMLComparator(ClassRubricMixin, UseCaseComparisonMixin, SequenceComparisonMixin):
    """Comparador de diagramas UML."""

    DEFAULT_WEIGHTS = {
        'classes': 0.35,
        'attributes': 0.25,
        'methods': 0.25,
        'relationships': 0.15,
    }

    def __init__(
        self,
        case_sensitive: bool = False,
        strict_types: bool = True,
        weights: Optional[Dict[str, float]] = None,
        use_semantic_matching: bool = False,
        semantic_threshold: float = 0.65,
        evaluation_profile: Optional[EvaluationProfile] = None,
    ):
        """
        Inicializa el comparador.

        Args:
            case_sensitive: Si la comparación de nombres es sensible a mayúsculas
            strict_types: Si se requiere coincidencia exacta de tipos
            weights: Diccionario con pesos para cada categoría
                     (classes, attributes, methods, relationships).
                     Los valores se normalizan automáticamente.
            use_semantic_matching: Si se usa FastText para matching semántico
            semantic_threshold: Umbral de similitud semántica (0.0 a 1.0)
            evaluation_profile: Perfil de modo de evaluación (ver
                app.comparator.scoring_modes). None o modo "similarity" =
                comportamiento actual sin cambios.
        """
        self.case_sensitive = case_sensitive
        self.strict_types = strict_types
        self._use_semantic_matching = use_semantic_matching
        self._semantic_threshold = semantic_threshold
        self._semantic_matcher = SemanticMatcher() if use_semantic_matching else None
        self.evaluation_profile = evaluation_profile
        # nombre de clase de la rubrica (normalizado) -> nombre de la clase del
        # estudiante (normalizado). Se arma por comparacion en
        # _build_rubric_alias() y lo consulta _rubric_name_matches().
        self._rubric_alias: Dict[str, str] = {}
        # rule_id -> la otra multiplicidad de la misma asociación reflexiva
        self._reflexive_siblings: Dict[str, ClassRubricRule] = {}

        if weights:
            total = sum(weights.values())
            self.weights = {k: v / total for k, v in weights.items()} if total > 0 else self.DEFAULT_WEIGHTS
        else:
            self.weights = dict(self.DEFAULT_WEIGHTS)

    def _rubric_expected_quantity(
        self,
        key: str,
        result: Optional[ComparisonResult],
    ) -> Optional[int]:
        """Resuelve las claves visibles de la rúbrica a los criterios internos."""
        profile = self.evaluation_profile
        if profile is None:
            return None

        direct = profile.expected_counts.get(key)
        if direct is not None:
            return direct.expected_quantity

        diagram_type = result.diagram_type if result is not None else "class"
        aliases = {
            "usecase": {
                "classes": ("actors",),
                "attributes": ("use_cases",),
                "methods": ("actor_associations",),
            },
            "sequence": {
                "fragment_usage": ("alt_fragments", "loop_fragments"),
            },
            "class": {
                "relationships": (
                    "association",
                    "aggregation",
                    "composition",
                    "inheritance",
                    "implementation",
                ),
            },
        }
        alias_keys = aliases.get(diagram_type, {}).get(key, ())
        configured = [
            profile.expected_counts[alias_key].expected_quantity
            for alias_key in alias_keys
            if alias_key in profile.expected_counts
        ]
        return sum(configured) if configured else None

    def _resolve_criterion_score(
        self,
        key: str,
        raw_score: float,
        n_expected_ref: int,
        n_found: int,
        n_correct: Optional[int] = None,
        result: Optional[ComparisonResult] = None,
    ) -> float:
        """Punto único de extensión de modos de evaluación. Sin perfil, el
        score queda intacto (cero regresión). El desglose por criterio se
        registra SIEMPRE que haya perfil —incluido el modo 'similarity'—
        porque el export a Excel necesita las cantidades esperada/registrada
        de cada criterio, cualquiera sea el modo."""
        profile = self.evaluation_profile
        if profile is None:
            return raw_score

        if n_correct is None:
            # Aproximación conservadora si no se pasó correct explícito:
            # asumir que "correct" escala con raw_score sobre lo encontrado.
            n_correct = round(min(n_found, n_expected_ref) * (raw_score / 100.0))

        n_expected_rubric = self._rubric_expected_quantity(key, result)

        outcome = score_criterion(
            mode=profile.mode,
            similarity_f1=raw_score,
            n_expected_ref=n_expected_ref,
            n_expected_rubric=n_expected_rubric,
            n_found=n_found,
            n_correct=n_correct,
        )

        if result is not None:
            result.scoring_mode = profile.mode.value
            result.penalty_breakdown[key] = outcome

        return outcome["score"]
    
    def compare(self, expected: UMLDiagram, student: UMLDiagram) -> ComparisonResult:
        """
        Compara dos diagramas UML y retorna el resultado detallado.

        Args:
            expected: Diagrama de referencia (solución correcta)
            student: Diagrama del estudiante

        Returns:
            ComparisonResult con todos los detalles de la comparación
        """
        if expected.diagram_type == "usecase":
            return self._compare_use_cases_diagram(expected, student)
        if expected.diagram_type == "sequence":
            return self._compare_sequence_diagram(expected, student)
        return self._compare_class_diagram(expected, student)

    def _compare_class_diagram(self, expected: UMLDiagram, student: UMLDiagram) -> ComparisonResult:
        """Comparación para diagramas de clases (lógica original)."""
        result = ComparisonResult(
            diagram_type="class",
            overall_similarity=0.0,
            class_similarity=0.0,
            attribute_similarity=0.0,
            method_similarity=0.0,
            relationship_similarity=0.0,
            total_classes_expected=len(expected.classes),
            total_classes_found=len(student.classes),
            correct_classes=0,
            total_attributes_expected=0,
            total_attributes_found=0,
            correct_attributes=0,
            total_methods_expected=0,
            total_methods_found=0,
            correct_methods=0,
            total_relationships_expected=len(expected.relationships),
            total_relationships_found=len(student.relationships),
            correct_relationships=0,
        )

        self._compare_classes(expected.classes, student.classes, result)
        self._compare_relationships(expected.relationships, student.relationships, result)
        if self.evaluation_profile and self.evaluation_profile.class_rules:
            result.overall_similarity = self._calculate_class_rubric(
                self.evaluation_profile.class_rules,
                expected,
                student,
                result,
            )
        else:
            result.overall_similarity = self._calculate_overall_similarity(result)
        return result

    # ------------------------------------------------------------------
    # Utilidades internas
    # ------------------------------------------------------------------

    def _normalize_name(self, name: str) -> str:
        """Normaliza un nombre para comparación (minúsculas, sin acentos)."""
        if not name:
            return ''
        text = name.strip()
        if not self.case_sensitive:
            text = text.lower()
        return SemanticMatcher.strip_accents(text)

    def _names_match(self, a: str, b: str, *, match_kind: str = 'default') -> bool:
        """Compara dos nombres: exacto o semántico."""
        if self._normalize_name(a) == self._normalize_name(b):
            return True
        if self._use_semantic_matching and self._semantic_matcher is not None:
            threshold = self._semantic_threshold
            if match_kind == 'use_case':
                threshold = max(threshold, 0.85)
            elif match_kind == 'actor':
                threshold = max(threshold, 0.72)
            return (
                self._semantic_matcher.similarity(a, b, kind=match_kind) >= threshold
            )
        return False

    def _semantic_match_dicts(
        self,
        expected_map: Dict[str, Any],
        student_map: Dict[str, Any],
        *,
        match_kind: str = 'default',
        original_name: Optional[Callable[[Any], str]] = None,
    ) -> Tuple[Set[str], Dict[str, str], Set[str], Set[str]]:
        """
        Dados dos dicts keyed por nombre normalizado, devuelve:
        - exact_correct: nombres con match exacto
        - semantic_map: expected_norm -> student_norm para matches semánticos
        - missing: expected sin match
        - extra: student sin match

        `original_name` extrae el nombre SIN normalizar de cada valor del dict
        (por defecto, el propio valor si es un string). El matcher semántico
        necesita el nombre original —con mayúsculas— para poder separar
        palabras compuestas tipo camelCase (p.ej. "fechaHora" -> "fecha hora");
        una vez normalizado a minúsculas plano ese split ya no es posible.
        """
        if original_name is None:
            original_name = lambda v: v  # noqa: E731

        expected_names = set(expected_map.keys())
        student_names = set(student_map.keys())

        exact_correct = expected_names & student_names
        remaining_exp = expected_names - exact_correct
        remaining_stu = student_names - exact_correct

        semantic_map: Dict[str, str] = {}
        used_stu: Set[str] = set()

        if self._use_semantic_matching and self._semantic_matcher is not None:
            threshold = self._semantic_threshold
            if match_kind == 'use_case':
                threshold = max(threshold, 0.85)
            elif match_kind == 'actor':
                threshold = max(threshold, 0.72)
            for exp_name in sorted(remaining_exp):
                candidates_norm = [s for s in remaining_stu if s not in used_stu]
                if not candidates_norm:
                    break
                candidates_original = [original_name(student_map[s]) for s in candidates_norm]
                best, score = self._semantic_matcher.find_best_match(
                    original_name(expected_map[exp_name]), candidates_original, threshold, kind=match_kind,
                )
                if best is not None:
                    norm_best = self._normalize_name(best)
                    semantic_map[exp_name] = norm_best
                    used_stu.add(norm_best)

        matched_semantic = set(semantic_map.keys())
        missing = remaining_exp - matched_semantic
        extra = remaining_stu - set(semantic_map.values())

        return exact_correct, semantic_map, missing, extra
    
    def _attribute_set_similarity(self, class_a: UMLClass, class_b: UMLClass) -> float:
        """F1 score (0-100) de similitud entre atributos de dos clases."""
        a_attrs = {self._normalize_name(a.name): a for a in class_a.attributes}
        b_attrs = {self._normalize_name(a.name): a for a in class_b.attributes}
        if not a_attrs and not b_attrs:
            return 100.0
        a_names = set(a_attrs.keys())
        b_names = set(b_attrs.keys())
        exact = a_names & b_names
        remaining_a = a_names - exact
        remaining_b = b_names - exact
        sem_correct = 0
        used: Set[str] = set()
        if self._use_semantic_matching and self._semantic_matcher is not None:
            for name_a in remaining_a:
                candidates_norm = [n for n in remaining_b if n not in used]
                if not candidates_norm:
                    break
                candidates_original = [b_attrs[n].name for n in candidates_norm]
                best, score = self._semantic_matcher.find_best_match(
                    a_attrs[name_a].name, candidates_original, 0.50,
                )
                if best is not None:
                    sem_correct += 1
                    nbest = self._normalize_name(best)
                    used.add(nbest)
        correct = len(exact) + sem_correct
        return self._f1_similarity_counts(correct, len(a_attrs), len(b_attrs))

    def _compare_classes(self, expected_classes: List[UMLClass], 
                        student_classes: List[UMLClass],
                        result: ComparisonResult) -> None:
        """Compara las clases de ambos diagramas."""
        
        # Crear mapas de clases por nombre normalizado
        expected_map = {self._normalize_name(c.name): c for c in expected_classes}
        student_map = {self._normalize_name(c.name): c for c in student_classes}
        
        exact_correct, semantic_map, missing_norm, extra_norm = self._semantic_match_dicts(
            expected_map, student_map, original_name=lambda cls: cls.name,
        )

        # Fase 3: matching por contenido (atributos)
        CONTENT_MATCH_THRESHOLD = 60.0
        content_matched: Set[str] = set()
        if missing_norm and extra_norm and self._use_semantic_matching:
            for exp_norm in list(missing_norm):
                exp_class = expected_map[exp_norm]
                best_stu = None
                best_score = 0.0
                for stu_norm in list(extra_norm):
                    stu_class = student_map[stu_norm]
                    score = self._attribute_set_similarity(exp_class, stu_class)
                    if score > best_score:
                        best_score = score
                        best_stu = stu_norm
                if best_stu is not None and best_score >= CONTENT_MATCH_THRESHOLD:
                    semantic_map[exp_norm] = best_stu
                    content_matched.add(exp_norm)
                    missing_norm.discard(exp_norm)
                    extra_norm.discard(best_stu)

        correct_names = exact_correct | set(semantic_map.keys())
        result.correct_classes = len(correct_names)
        
        # Clases faltantes
        result.missing_classes = [expected_map[n].name for n in missing_norm]
        
        # Clases extra
        result.extra_classes = [student_map[n].name for n in extra_norm]
        
        # Similitud F1 entre clases (penaliza clases extra o faltantes)
        result.class_similarity = self._f1_similarity_counts(
            result.correct_classes,
            len(expected_map),
            len(student_map),
        )
        
        # Comparar atributos y métodos de cada clase correcta.
        # Los ESPERADOS se acumulan sobre todas las clases de la referencia
        # (no solo las acertadas): si el estudiante no reconoce una clase,
        # sus atributos y métodos cuentan como perdidos, no desaparecen de
        # la rúbrica. Los found/correct sí salen solo de clases acertadas.
        total_attr_expected = sum(len(c.attributes) for c in expected_map.values())
        total_attr_found = 0
        total_attr_correct = 0
        total_method_expected = sum(len(c.methods) for c in expected_map.values())
        total_method_found = 0
        total_method_correct = 0

        # Construir lookup de student class por nombre semántico
        stu_lookup = dict(student_map)
        for exp_norm, stu_norm in semantic_map.items():
            stu_lookup[exp_norm] = student_map[stu_norm]

        for class_name in correct_names:
            expected_class = expected_map[class_name]
            student_class = stu_lookup[class_name]

            class_result = self._compare_class_details(expected_class, student_class)
            result.class_results.append(class_result)

            # Acumular contadores
            total_attr_found += len(student_class.attributes)
            total_attr_correct += class_result.attributes_correct

            total_method_found += len(student_class.methods)
            total_method_correct += class_result.methods_correct

        # Agregar clases faltantes como detalles
        for missing_name in result.missing_classes:
            result.details.append(ComparisonDetail(
                element_type="class",
                name=missing_name,
                status="missing",
                message=f"Clase '{missing_name}' no encontrada en el diagrama del estudiante"
            ))
        
        # Agregar clases extra como detalles
        for extra_name in result.extra_classes:
            result.details.append(ComparisonDetail(
                element_type="class",
                name=extra_name,
                status="extra",
                message=f"Clase extra '{extra_name}' encontrada en el diagrama del estudiante"
            ))
        
        # Agregar clases con match semántico o por contenido como detalles
        for exp_norm, stu_norm in semantic_map.items():
            exp_name = expected_map[exp_norm].name
            stu_name = student_map[stu_norm].name
            if exp_norm in content_matched:
                msg = f"Clase '{exp_name}' coincide por atributos con '{stu_name}'"
            else:
                msg = f"Clase '{exp_name}' coincide semánticamente con '{stu_name}'"
            result.details.append(ComparisonDetail(
                element_type="class",
                name=exp_name,
                status="correct",
                similarity_score=self._semantic_threshold * 100,
                semantic_match_of=stu_name,
                message=msg,
            ))
        
        # Actualizar contadores globales
        result.total_attributes_expected = total_attr_expected
        result.total_attributes_found = total_attr_found
        result.correct_attributes = total_attr_correct
        
        result.total_methods_expected = total_method_expected
        result.total_methods_found = total_method_found
        result.correct_methods = total_method_correct
        
        # Calcular similitudes
        if total_attr_expected > 0:
            result.attribute_similarity = (total_attr_correct / total_attr_expected) * 100
        
        if total_method_expected > 0:
            result.method_similarity = (total_method_correct / total_method_expected) * 100
    
    def _compare_class_details(self, expected: UMLClass, student: UMLClass) -> ClassComparisonResult:
        """Compara los detalles de dos clases."""
        
        result = ClassComparisonResult(
            class_name=expected.name,
            similarity_score=0.0,
            attributes_correct=0,
            attributes_total=len(expected.attributes),
            methods_correct=0,
            methods_total=len(expected.methods)
        )
        
        # Comparar atributos
        self._compare_attributes(expected, student, result)
        
        # Comparar métodos
        self._compare_methods(expected, student, result)
        
        # Calcular similitud de la clase
        attr_score = (result.attributes_correct / result.attributes_total * 100) if result.attributes_total > 0 else 100
        method_score = (result.methods_correct / result.methods_total * 100) if result.methods_total > 0 else 100
        result.similarity_score = (attr_score * 0.5 + method_score * 0.5)
        
        return result
    
    def _compare_attributes(self, expected_class: UMLClass, 
                           student_class: UMLClass,
                           result: ClassComparisonResult) -> None:
        """Compara atributos de dos clases."""
        
        expected_attrs = {self._normalize_name(a.name): a for a in expected_class.attributes}
        student_attrs = {self._normalize_name(a.name): a for a in student_class.attributes}
        
        exact_correct, semantic_map, missing_norm, extra_norm = self._semantic_match_dicts(
            expected_attrs, student_attrs, original_name=lambda attr: attr.name,
        )
        correct_names = exact_correct | set(semantic_map.keys())
        result.attributes_correct = len(correct_names)
        
        # Atributos faltantes
        result.missing_attributes = [expected_attrs[n].name for n in missing_norm]
        
        # Atributos extra
        result.extra_attributes = [student_attrs[n].name for n in extra_norm]
        
        # Construir lookup semántico
        attr_lookup = dict(student_attrs)
        for exp_norm, stu_norm in semantic_map.items():
            attr_lookup[exp_norm] = student_attrs[stu_norm]
        
        # Detalles de atributos correctos
        for attr_name in correct_names:
            expected_attr = expected_attrs[attr_name]
            student_attr = attr_lookup[attr_name]
            
            similarity = self._calculate_attribute_similarity(expected_attr, student_attr)
            status = "correct" if similarity == 1.0 else "partial"
            
            matched_with = student_attr.name if attr_name in semantic_map else None
            result.details.append(ComparisonDetail(
                element_type="attribute",
                name=expected_attr.name,
                status=status,
                expected=expected_attr.to_dict(),
                found=student_attr.to_dict(),
                similarity_score=similarity * 100,
                semantic_match_of=matched_with,
                message=f"Atributo '{expected_attr.name}' - Similitud: {similarity * 100:.0f}%"
            ))
        
        # Detalles de atributos faltantes
        for attr_name in result.missing_attributes:
            result.details.append(ComparisonDetail(
                element_type="attribute",
                name=attr_name,
                status="missing",
                message=f"Atributo '{attr_name}' faltante en clase '{expected_class.name}'"
            ))
    
    def _compare_methods(self, expected_class: UMLClass, 
                        student_class: UMLClass,
                        result: ClassComparisonResult) -> None:
        """Compara métodos de dos clases."""
        
        expected_methods = {self._normalize_name(m.name): m for m in expected_class.methods}
        student_methods = {self._normalize_name(m.name): m for m in student_class.methods}
        
        exact_correct, semantic_map, missing_norm, extra_norm = self._semantic_match_dicts(
            expected_methods, student_methods, original_name=lambda m: m.name,
        )
        correct_names = exact_correct | set(semantic_map.keys())
        result.methods_correct = len(correct_names)
        
        # Métodos faltantes
        result.missing_methods = [expected_methods[n].name for n in missing_norm]
        
        # Métodos extra
        result.extra_methods = [student_methods[n].name for n in extra_norm]
        
        # Construir lookup semántico
        method_lookup = dict(student_methods)
        for exp_norm, stu_norm in semantic_map.items():
            method_lookup[exp_norm] = student_methods[stu_norm]
        
        # Detalles de métodos correctos
        for method_name in correct_names:
            expected_method = expected_methods[method_name]
            student_method = method_lookup[method_name]
            
            similarity = self._calculate_method_similarity(expected_method, student_method)
            status = "correct" if similarity == 1.0 else "partial"
            
            matched_with = student_method.name if method_name in semantic_map else None
            result.details.append(ComparisonDetail(
                element_type="method",
                name=expected_method.name,
                status=status,
                expected=expected_method.to_dict(),
                found=student_method.to_dict(),
                similarity_score=similarity * 100,
                semantic_match_of=matched_with,
                message=f"Método '{expected_method.name}' - Similitud: {similarity * 100:.0f}%"
            ))
        
        # Detalles de métodos faltantes
        for method_name in result.missing_methods:
            result.details.append(ComparisonDetail(
                element_type="method",
                name=method_name,
                status="missing",
                message=f"Método '{method_name}' faltante en clase '{expected_class.name}'"
            ))
    
    def _calculate_attribute_similarity(self, expected: UMLAttribute, student: UMLAttribute) -> float:
        """Calcula la similitud entre dos atributos."""
        score = 0.0
        total = 0
        
        # Nombre (exacto o semántico)
        total += 1
        if self._names_match(expected.name, student.name):
            score += 1
        
        # Tipo
        if self.strict_types:
            total += 1
            if self._normalize_name(expected.type) == self._normalize_name(student.type):
                score += 1
        
        # Visibilidad
        total += 0.5
        if expected.visibility == student.visibility:
            score += 0.5
        
        return score / total if total > 0 else 0
    
    def _calculate_method_similarity(self, expected: UMLMethod, student: UMLMethod) -> float:
        """Calcula la similitud entre dos métodos."""
        score = 0.0
        total = 0
        
        # Nombre (exacto o semántico)
        total += 1
        if self._names_match(expected.name, student.name):
            score += 1
        
        # Tipo de retorno
        if self.strict_types:
            total += 0.5
            if self._normalize_name(expected.return_type) == self._normalize_name(student.return_type):
                score += 0.5
        
        # Parámetros
        total += 1
        expected_params = sorted([(self._normalize_name(p.get('name', '')), self._normalize_name(p.get('type', ''))) 
                                  for p in expected.parameters])
        student_params = sorted([(self._normalize_name(p.get('name', '')), self._normalize_name(p.get('type', ''))) 
                                 for p in student.parameters])
        
        if expected_params == student_params:
            score += 1
        elif len(expected_params) == len(student_params):
            # Misma cantidad de parámetros pero diferentes
            score += 0.5
        
        # Visibilidad
        total += 0.3
        if expected.visibility == student.visibility:
            score += 0.3
        
        return score / total if total > 0 else 0
    
    def _compare_relationships(self, expected: List[UMLRelationship], 
                              student: List[UMLRelationship],
                              result: ComparisonResult) -> None:
        """Compara las relaciones entre clases."""
        
        # Normalizar relaciones para comparación (asociaciones como pares no dirigidos)
        expected_normalized = set()
        for rel in expected:
            key = self._relationship_comparison_key(rel)
            expected_normalized.add((key, rel))
        
        student_normalized = set()
        for rel in student:
            key = self._relationship_comparison_key(rel)
            student_normalized.add((key, rel))
        
        expected_keys = {k for k, _ in expected_normalized}
        student_keys = {k for k, _ in student_normalized}
        
        # Relaciones correctas
        correct_keys = expected_keys & student_keys
        result.correct_relationships = len(correct_keys)
        
        # Relaciones faltantes
        for key in (expected_keys - student_keys):
            result.missing_relationships.append(f"{key[0]} -> {key[1]} ({key[2]})")
            result.details.append(ComparisonDetail(
                element_type="relationship",
                name=f"{key[0]} -> {key[1]}",
                status="missing",
                message=f"Relación faltante: {key[0]} -> {key[1]} ({key[2]})"
            ))
        
        # Relaciones extra
        for key in (student_keys - expected_keys):
            result.extra_relationships.append(f"{key[0]} -> {key[1]} ({key[2]})")
            result.details.append(ComparisonDetail(
                element_type="relationship",
                name=f"{key[0]} -> {key[1]}",
                status="extra",
                message=f"Relación extra: {key[0]} -> {key[1]} ({key[2]})"
            ))
        
        # Relaciones correctas como detalles
        for key in correct_keys:
            result.details.append(ComparisonDetail(
                element_type="relationship",
                name=f"{key[0]} -> {key[1]}",
                status="correct",
                similarity_score=100.0,
                message=f"Relación correcta: {key[0]} -> {key[1]} ({key[2]})"
            ))
        
        # Similitud F1 (penaliza relaciones extra o faltantes)
        n_exp = len(expected_keys)
        n_stu = len(student_keys)
        result.relationship_similarity = self._f1_similarity_counts(
            result.correct_relationships, n_exp, n_stu
        )
    
    def _calculate_overall_similarity(self, result: ComparisonResult) -> float:
        """Calcula la similitud global ponderada.

        Usa el mismo patrón defensivo que los comparadores de casos de uso y
        secuencia: se salta criterios con peso 0 y solo descarta un criterio
        cuando no hay nada esperado NI encontrado (si el estudiante entregó
        elementos que no se pedían, el criterio sigue contando).
        """
        scores = []
        weights = []

        criteria = (
            ('classes', result.class_similarity, result.total_classes_expected,
             result.total_classes_found, result.correct_classes),
            ('attributes', result.attribute_similarity, result.total_attributes_expected,
             result.total_attributes_found, result.correct_attributes),
            ('methods', result.method_similarity, result.total_methods_expected,
             result.total_methods_found, result.correct_methods),
            ('relationships', result.relationship_similarity, result.total_relationships_expected,
             result.total_relationships_found, result.correct_relationships),
        )

        for key, score, n_exp, n_stu, n_correct in criteria:
            w = self.weights.get(key, 0.0)
            if w <= 0:
                continue
            if n_exp == 0 and n_stu == 0:
                continue
            resolved = self._resolve_criterion_score(
                key, score, n_exp, n_stu, n_correct, result,
            )
            scores.append(resolved)
            weights.append(w)

        if not scores:
            return 0.0

        total_weight = sum(weights)
        if total_weight == 0:
            return 0.0

        return sum(s * w / total_weight for s, w in zip(scores, weights))


def compare_uml_diagrams(
    expected: UMLDiagram,
    student: UMLDiagram,
    case_sensitive: bool = False,
    strict_types: bool = True,
    weights: Optional[Dict[str, float]] = None,
    use_semantic_matching: bool = False,
    semantic_threshold: float = 0.65,
    evaluation_profile: Optional[EvaluationProfile] = None,
) -> ComparisonResult:
    """
    Función de conveniencia para comparar dos diagramas UML.

    Args:
        expected: Diagrama de referencia
        student: Diagrama del estudiante
        case_sensitive: Si la comparación es sensible a mayúsculas
        strict_types: Si se requiere coincidencia exacta de tipos
        weights: Pesos personalizados por categoría
                 (classes, attributes, methods, relationships)
        use_semantic_matching: Si se usa FastText para matching semántico
        semantic_threshold: Umbral de similitud semántica (0.0 a 1.0)
        evaluation_profile: Perfil de modo de evaluación opcional (ver
            app.comparator.scoring_modes). None = comportamiento actual.

    Returns:
        ComparisonResult con el resultado de la comparación
    """
    comparator = UMLComparator(
        case_sensitive=case_sensitive,
        strict_types=strict_types,
        weights=weights,
        use_semantic_matching=use_semantic_matching,
        semantic_threshold=semantic_threshold,
        evaluation_profile=evaluation_profile,
    )
    return comparator.compare(expected, student)
