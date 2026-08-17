"""
Módulo de comparación de diagramas UML.
Calcula similitud entre diagramas UML con diferentes niveles de granularidad.
"""

from typing import List, Dict, Any, Tuple, Set, Optional, Callable
from dataclasses import dataclass, field

from app.models.uml_elements import (
    UMLDiagram, UMLClass, UMLAttribute, UMLMethod,
    UMLRelationship, Visibility, RelationshipType,
    UMLActor, UMLUseCase, UMLLifeline, UMLMessage,
)
from app.comparator.semantic_matcher import SemanticMatcher
from app.comparator.scoring_modes import (
    EvaluationProfile, ScoringMode, ExpectedCount, score_criterion,
)
from app.parsers.xmi_parser import looks_like_use_case_name


@dataclass
class ComparisonDetail:
    """Detalle de comparación de un elemento específico."""
    element_type: str  # "class", "attribute", "method", "relationship"
    name: str
    status: str  # "correct", "missing", "extra", "partial"
    expected: Any = None
    found: Any = None
    similarity_score: float = 0.0
    semantic_match_of: Optional[str] = None
    message: str = ""


@dataclass
class ClassComparisonResult:
    """Resultado de comparación de una clase."""
    class_name: str
    similarity_score: float
    attributes_correct: int
    attributes_total: int
    methods_correct: int
    methods_total: int
    details: List[ComparisonDetail] = field(default_factory=list)
    missing_attributes: List[str] = field(default_factory=list)
    extra_attributes: List[str] = field(default_factory=list)
    missing_methods: List[str] = field(default_factory=list)
    extra_methods: List[str] = field(default_factory=list)


@dataclass
class ComparisonResult:
    """Resultado completo de la comparación de dos diagramas UML."""
    # Campos requeridos
    overall_similarity: float
    class_similarity: float       # actores (usecase) | lifelines (sequence)
    attribute_similarity: float   # casos de uso (usecase) | 0 (sequence)
    method_similarity: float      # 0 para diagramas no-clase
    relationship_similarity: float
    total_classes_expected: int
    total_classes_found: int
    correct_classes: int
    total_attributes_expected: int
    total_attributes_found: int
    correct_attributes: int
    total_methods_expected: int
    total_methods_found: int
    correct_methods: int
    total_relationships_expected: int
    total_relationships_found: int
    correct_relationships: int

    # Campos opcionales
    diagram_type: str = "class"
    missing_classes: List[str] = field(default_factory=list)
    extra_classes: List[str] = field(default_factory=list)
    missing_use_cases: List[str] = field(default_factory=list)
    extra_use_cases: List[str] = field(default_factory=list)
    missing_relationships: List[str] = field(default_factory=list)
    extra_relationships: List[str] = field(default_factory=list)
    # Subcriterios de relaciones en diagramas de casos de uso
    include_similarity: float = 0.0
    extend_similarity: float = 0.0
    total_include_expected: int = 0
    total_include_found: int = 0
    correct_include: int = 0
    total_extend_expected: int = 0
    total_extend_found: int = 0
    correct_extend: int = 0
    missing_actor_associations: List[str] = field(default_factory=list)
    extra_actor_associations: List[str] = field(default_factory=list)
    missing_include_relations: List[str] = field(default_factory=list)
    extra_include_relations: List[str] = field(default_factory=list)
    missing_extend_relations: List[str] = field(default_factory=list)
    extra_extend_relations: List[str] = field(default_factory=list)
    class_results: List[ClassComparisonResult] = field(default_factory=list)
    details: List[ComparisonDetail] = field(default_factory=list)
    # Orden de mensajes (secuencia): porcentaje de mensajes en posición correcta
    message_order_score: float = 0.0
    # Criterios de secuencia (v2)
    sequence_criteria: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Modo de evaluación usado y desglose de penalización por criterio
    # (ver app.comparator.scoring_modes). Vacío/"similarity" cuando no aplica.
    scoring_mode: str = "similarity"
    penalty_breakdown: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convierte el resultado a diccionario con estructura adaptada al tipo de diagrama."""
        base = {
            "overall_similarity": round(self.overall_similarity, 2),
            "diagram_type": self.diagram_type,
            "scoring_mode": self.scoring_mode,
            "penalty_breakdown": self.penalty_breakdown,
            "details": [
                {
                    "element_type": d.element_type,
                    "name": d.name,
                    "status": d.status,
                    "similarity_score": round(d.similarity_score, 2),
                    "semantic_match_of": d.semantic_match_of,
                    "message": d.message,
                }
                for d in self.details
            ],
        }

        if self.diagram_type == "usecase":
            base["breakdown"] = {
                "actors": {
                    "similarity": round(self.class_similarity, 2),
                    "expected": self.total_classes_expected,
                    "found": self.total_classes_found,
                    "correct": self.correct_classes,
                    "missing": self.missing_classes,
                    "extra": self.extra_classes,
                },
                "use_cases": {
                    "similarity": round(self.attribute_similarity, 2),
                    "expected": self.total_attributes_expected,
                    "found": self.total_attributes_found,
                    "correct": self.correct_attributes,
                    "missing": self.missing_use_cases,
                    "extra": self.extra_use_cases,
                },
                "actor_associations": {
                    "similarity": round(self.method_similarity, 2),
                    "expected": self.total_methods_expected,
                    "found": self.total_methods_found,
                    "correct": self.correct_methods,
                    "missing": self.missing_actor_associations,
                    "extra": self.extra_actor_associations,
                },
                "include_relations": {
                    "similarity": round(self.include_similarity, 2),
                    "expected": self.total_include_expected,
                    "found": self.total_include_found,
                    "correct": self.correct_include,
                    "missing": self.missing_include_relations,
                    "extra": self.extra_include_relations,
                },
                "extend_relations": {
                    "similarity": round(self.extend_similarity, 2),
                    "expected": self.total_extend_expected,
                    "found": self.total_extend_found,
                    "correct": self.correct_extend,
                    "missing": self.missing_extend_relations,
                    "extra": self.extra_extend_relations,
                },
            }

        elif self.diagram_type == "sequence":
            if self.sequence_criteria:
                base["breakdown"] = {
                    "sync_messages": self.sequence_criteria.get("sync_messages", {}),
                    "async_messages": self.sequence_criteria.get("async_messages", {}),
                    "creation_messages": self.sequence_criteria.get("creation_messages", {}),
                    "fragment_usage": self.sequence_criteria.get("fragment_usage", {}),
                    "order_score": round(self.message_order_score, 2),
                    # Se mantiene para vistas comparativas existentes.
                    "lifelines": {
                        "similarity": round(self.class_similarity, 2),
                        "expected": self.total_classes_expected,
                        "found": self.total_classes_found,
                        "correct": self.correct_classes,
                        "missing": self.missing_classes,
                        "extra": self.extra_classes,
                    },
                }
            else:
                # Estructura legacy para retrocompatibilidad.
                base["breakdown"] = {
                    "lifelines": {
                        "similarity": round(self.class_similarity, 2),
                        "expected": self.total_classes_expected,
                        "found": self.total_classes_found,
                        "correct": self.correct_classes,
                        "missing": self.missing_classes,
                        "extra": self.extra_classes,
                    },
                    "messages": {
                        "similarity": round(self.relationship_similarity, 2),
                        "order_score": round(self.message_order_score, 2),
                        "expected": self.total_relationships_expected,
                        "found": self.total_relationships_found,
                        "correct": self.correct_relationships,
                        "missing": self.missing_relationships,
                        "extra": self.extra_relationships,
                    },
                }

        else:
            base["breakdown"] = {
                "classes": {
                    "similarity": round(self.class_similarity, 2),
                    "expected": self.total_classes_expected,
                    "found": self.total_classes_found,
                    "correct": self.correct_classes,
                    "missing": self.missing_classes,
                    "extra": self.extra_classes,
                },
                "attributes": {
                    "similarity": round(self.attribute_similarity, 2),
                    "expected": self.total_attributes_expected,
                    "found": self.total_attributes_found,
                    "correct": self.correct_attributes,
                },
                "methods": {
                    "similarity": round(self.method_similarity, 2),
                    "expected": self.total_methods_expected,
                    "found": self.total_methods_found,
                    "correct": self.correct_methods,
                },
                "relationships": {
                    "similarity": round(self.relationship_similarity, 2),
                    "expected": self.total_relationships_expected,
                    "found": self.total_relationships_found,
                    "correct": self.correct_relationships,
                    "missing": self.missing_relationships,
                    "extra": self.extra_relationships,
                },
            }
            base["class_details"] = [
                {
                    "class_name": cr.class_name,
                    "similarity": round(cr.similarity_score, 2),
                    "attributes": {
                        "correct": cr.attributes_correct,
                        "total": cr.attributes_total,
                        "missing": cr.missing_attributes,
                        "extra": cr.extra_attributes,
                    },
                    "methods": {
                        "correct": cr.methods_correct,
                        "total": cr.methods_total,
                        "missing": cr.missing_methods,
                        "extra": cr.extra_methods,
                    },
                }
                for cr in self.class_results
            ]

        return base


class UMLComparator:
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

        if weights:
            total = sum(weights.values())
            self.weights = {k: v / total for k, v in weights.items()} if total > 0 else self.DEFAULT_WEIGHTS
        else:
            self.weights = dict(self.DEFAULT_WEIGHTS)

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

        rubric_count = profile.expected_counts.get(key)
        n_expected_rubric = rubric_count.expected_quantity if rubric_count else None

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
        result.overall_similarity = self._calculate_overall_similarity(result)
        return result
    
    # ------------------------------------------------------------------
    # Comparador de casos de uso
    # ------------------------------------------------------------------

    def _resolve_usecase_weights(self) -> Dict[str, float]:
        """Normaliza pesos de casos de uso; mapea 'relationships' legacy a include/extend/asoc."""
        w = dict(self.weights)
        has_uc_keys = any(k in w for k in ('include_relations', 'extend_relations'))
        legacy_rel = w.pop('relationships', 0.0)
        if legacy_rel > 0 and not has_uc_keys:
            third = legacy_rel / 3.0
            w['methods'] = w.get('methods', 0.0) + third
            w['include_relations'] = w.get('include_relations', 0.0) + third
            w['extend_relations'] = w.get('extend_relations', 0.0) + third
        total = sum(v for v in w.values() if v > 0)
        if total <= 0:
            return {
                'classes': 0.15,
                'attributes': 0.25,
                'methods': 0.25,
                'include_relations': 0.20,
                'extend_relations': 0.15,
            }
        return {k: v / total for k, v in w.items() if v > 0}

    def _compare_use_cases_diagram(
        self, expected: UMLDiagram, student: UMLDiagram
    ) -> ComparisonResult:
        """Comparación para diagramas de casos de uso."""
        uc_weights = self._resolve_usecase_weights()
        exp_actor_names = {a.name for a in expected.actors}
        exp_uc_names = {uc.name for uc in expected.use_cases}
        stu_actor_names = {a.name for a in student.actors}
        stu_uc_names = {uc.name for uc in student.use_cases}

        exp_actor_assoc, exp_include, exp_extend = self._partition_usecase_relationships(
            expected.relationships, exp_actor_names, exp_uc_names,
        )
        stu_actor_assoc, stu_include, stu_extend = self._partition_usecase_relationships(
            student.relationships, stu_actor_names, stu_uc_names,
        )
        exp_include, exp_extend = self._align_extend_relationships(
            exp_include, exp_extend, stu_extend,
        )
        stu_include, stu_extend = self._align_extend_relationships(
            stu_include, stu_extend, exp_extend,
        )

        result = ComparisonResult(
            diagram_type="usecase",
            overall_similarity=0.0,
            class_similarity=0.0,
            attribute_similarity=0.0,
            method_similarity=0.0,
            relationship_similarity=0.0,
            total_classes_expected=len(expected.actors),
            total_classes_found=len(student.actors),
            correct_classes=0,
            total_attributes_expected=len(expected.use_cases),
            total_attributes_found=len(student.use_cases),
            correct_attributes=0,
            total_methods_expected=len(exp_actor_assoc),
            total_methods_found=len(stu_actor_assoc),
            correct_methods=0,
            total_relationships_expected=len(expected.relationships),
            total_relationships_found=len(student.relationships),
            correct_relationships=0,
            total_include_expected=len(exp_include),
            total_include_found=len(stu_include),
            correct_include=0,
            total_extend_expected=len(exp_extend),
            total_extend_found=len(stu_extend),
            correct_extend=0,
        )

        self._compare_named_list(
            expected.actors, student.actors,
            element_type="actor",
            result_correct_attr="correct_classes",
            result_missing_attr="missing_classes",
            result_extra_attr="extra_classes",
            result_similarity_attr="class_similarity",
            result=result,
        )

        self._compare_named_list(
            expected.use_cases, student.use_cases,
            element_type="use_case",
            result_correct_attr="correct_attributes",
            result_missing_attr="missing_use_cases",
            result_extra_attr="extra_use_cases",
            result_similarity_attr="attribute_similarity",
            result=result,
        )

        vocabulary_stu_to_exp = self._build_usecase_vocabulary_map(expected, student)

        self._compare_usecase_relationship_subset(
            exp_actor_assoc, stu_actor_assoc, result,
            element_type="actor_association",
            similarity_attr="method_similarity",
            correct_attr="correct_methods",
            missing_attr="missing_actor_associations",
            extra_attr="extra_actor_associations",
            vocabulary_stu_to_exp=vocabulary_stu_to_exp,
        )
        self._compare_usecase_relationship_subset(
            exp_include, stu_include, result,
            element_type="include_relation",
            similarity_attr="include_similarity",
            correct_attr="correct_include",
            missing_attr="missing_include_relations",
            extra_attr="extra_include_relations",
            vocabulary_stu_to_exp=vocabulary_stu_to_exp,
            uc_link_types={'include', 'association'},
        )
        self._compare_usecase_relationship_subset(
            exp_extend, stu_extend, result,
            element_type="extend_relation",
            similarity_attr="extend_similarity",
            correct_attr="correct_extend",
            missing_attr="missing_extend_relations",
            extra_attr="extra_extend_relations",
            vocabulary_stu_to_exp=vocabulary_stu_to_exp,
            uc_link_types={'extend', 'association'},
        )

        result.correct_relationships = (
            result.correct_methods + result.correct_include + result.correct_extend
        )
        all_exp = len(exp_actor_assoc) + len(exp_include) + len(exp_extend)
        all_stu = len(stu_actor_assoc) + len(stu_include) + len(stu_extend)
        result.relationship_similarity = self._f1_similarity_counts(
            result.correct_relationships, all_exp, all_stu,
        )

        scores, weights = [], []
        criteria = (
            ('classes', result.class_similarity, result.total_classes_expected, result.total_classes_found, result.correct_classes),
            ('attributes', result.attribute_similarity, result.total_attributes_expected, result.total_attributes_found, result.correct_attributes),
            ('methods', result.method_similarity, result.total_methods_expected, result.total_methods_found, result.correct_methods),
            ('include_relations', result.include_similarity, result.total_include_expected, result.total_include_found, result.correct_include),
            ('extend_relations', result.extend_similarity, result.total_extend_expected, result.total_extend_found, result.correct_extend),
        )
        for key, score, n_exp, n_stu, n_correct in criteria:
            w = uc_weights.get(key, 0)
            if w <= 0:
                continue
            if n_exp == 0 and n_stu == 0:
                continue
            score = self._resolve_criterion_score(key, score, n_exp, n_stu, n_correct, result)
            scores.append(score)
            weights.append(w)

        if scores:
            total_w = sum(weights)
            if total_w > 0:
                result.overall_similarity = sum(
                    s * w / total_w for s, w in zip(scores, weights)
                )

        return result

    def _partition_usecase_relationships(
        self,
        relationships: List[UMLRelationship],
        actor_names: Set[str],
        uc_names: Set[str],
    ) -> Tuple[List[UMLRelationship], List[UMLRelationship], List[UMLRelationship]]:
        """Separa relaciones en asociaciones actor-CU, include y extend."""
        actor_assoc: List[UMLRelationship] = []
        include_rels: List[UMLRelationship] = []
        extend_rels: List[UMLRelationship] = []

        for rel in relationships:
            src_kind = self._usecase_endpoint_kind(rel.source, actor_names, uc_names)
            tgt_kind = self._usecase_endpoint_kind(rel.target, actor_names, uc_names)
            rt = rel.relationship_type

            if rt == RelationshipType.INCLUDE:
                include_rels.append(rel)
            elif rt == RelationshipType.EXTEND:
                extend_rels.append(rel)
            elif rt in (RelationshipType.ASSOCIATION, RelationshipType.DEPENDENCY):
                if src_kind == 'actor' and tgt_kind == 'usecase':
                    actor_assoc.append(rel)
                elif src_kind == 'usecase' and tgt_kind == 'actor':
                    actor_assoc.append(rel)
                elif src_kind == 'usecase' and tgt_kind == 'usecase':
                    include_rels.append(rel)

        return actor_assoc, include_rels, extend_rels

    def _usecase_endpoint_kind(
        self,
        name: str,
        actor_names: Set[str],
        uc_names: Set[str],
    ) -> str:
        """Clasifica un extremo de relación como actor, usecase o unknown."""
        n = self._normalize_name(name)
        actors_norm = {self._normalize_name(a) for a in actor_names}
        ucs_norm = {self._normalize_name(u) for u in uc_names}
        is_actor = n in actors_norm
        is_uc = n in ucs_norm

        if is_actor and is_uc:
            return 'usecase' if looks_like_use_case_name(name) else 'actor'
        if is_uc:
            return 'usecase'
        if is_actor:
            return 'actor'
        if looks_like_use_case_name(name):
            return 'usecase'
        return 'unknown'

    def _directed_uc_pair(self, rel: UMLRelationship) -> tuple:
        return (
            self._normalize_name(rel.source),
            self._normalize_name(rel.target),
        )

    def _align_extend_relationships(
        self,
        include_rels: List[UMLRelationship],
        extend_rels: List[UMLRelationship],
        other_extend: List[UMLRelationship],
    ) -> Tuple[List[UMLRelationship], List[UMLRelationship]]:
        """Mueve vínculos CU-CU al bucket extend si el otro diagrama los modela como extend."""
        other_pairs = {self._directed_uc_pair(r) for r in other_extend}
        if not other_pairs:
            return include_rels, extend_rels

        kept_include: List[UMLRelationship] = []
        promoted: List[UMLRelationship] = []
        for rel in include_rels:
            pair = self._directed_uc_pair(rel)
            if pair in other_pairs and rel.relationship_type in (
                RelationshipType.ASSOCIATION,
                RelationshipType.INCLUDE,
                RelationshipType.DEPENDENCY,
            ):
                promoted.append(rel)
            else:
                kept_include.append(rel)

        return kept_include, extend_rels + promoted

    def _f1_similarity_counts(self, correct: int, n_expected: int, n_student: int) -> float:
        """
        F1 entre precisión (correct/student) y recall (correct/expected).
        Penaliza elementos extra o faltantes (evita 100% solo por recall).
        """
        if n_expected == 0 and n_student == 0:
            # Nada que esperar y nada encontrado = coincidencia perfecta.
            return 100.0
        if n_expected == 0:
            return 0.0 if n_student > 0 else 100.0
        if n_student == 0:
            return 0.0
        if correct == 0:
            return 0.0
        p = correct / n_student
        r = correct / n_expected
        return 100.0 * (2 * p * r) / (p + r)

    def _relationship_comparison_key(
        self,
        rel: UMLRelationship,
        uc_link_types: Optional[Set[str]] = None,
    ) -> tuple:
        """Clave estable para comparar relaciones; asociaciones simples como no dirigidas."""
        s = self._normalize_name(rel.source)
        t = self._normalize_name(rel.target)
        rt = rel.relationship_type.value
        if uc_link_types and rt in uc_link_types:
            rt = 'uc_link'
        sm = rel.source_multiplicity or ''
        tm = rel.target_multiplicity or ''
        if rel.relationship_type == RelationshipType.ASSOCIATION and rt != 'uc_link':
            if s > t:
                s, t = t, s
                sm, tm = tm, sm
        return (s, t, rt, sm, tm)

    def _relationship_key_with_aliases(
        self,
        rel: UMLRelationship,
        stu_to_exp: Dict[str, str],
        remap_student_side: bool,
        uc_link_types: Optional[Set[str]] = None,
    ) -> tuple:
        """Construye clave de relación; opcionalmente alinea nombres del estudiante al vocabulario esperado."""
        source = rel.source
        target = rel.target
        if remap_student_side:
            source = stu_to_exp.get(self._normalize_name(source), source)
            target = stu_to_exp.get(self._normalize_name(target), target)
        return self._relationship_comparison_key(
            UMLRelationship(
                source=source,
                target=target,
                relationship_type=rel.relationship_type,
                source_multiplicity=rel.source_multiplicity,
                target_multiplicity=rel.target_multiplicity,
            ),
            uc_link_types=uc_link_types,
        )

    def _build_usecase_vocabulary_map(
        self,
        expected: UMLDiagram,
        student: UMLDiagram,
    ) -> Dict[str, str]:
        """Mapeo global estudiante→esperado usando actores y casos de uso ya alineados."""
        mapping: Dict[str, str] = {}
        exp_actors = {a.name for a in expected.actors}
        stu_actors = {a.name for a in student.actors}
        mapping.update(self._build_student_to_expected_name_map(
            exp_actors, stu_actors, match_kind='actor',
        ))
        exp_uc = {uc.name for uc in expected.use_cases}
        stu_uc = {uc.name for uc in student.use_cases}
        mapping.update(self._build_student_to_expected_name_map(
            exp_uc, stu_uc, match_kind='use_case',
        ))
        return mapping

    def _build_student_to_expected_name_map(
        self,
        expected_names: set,
        student_names: set,
        *,
        use_semantic: bool = True,
        match_kind: str = 'default',
    ) -> Dict[str, str]:
        """Mapeo nombre normalizado del estudiante → nombre normalizado esperado (exacto + semántico)."""
        exp_map = {self._normalize_name(n): n for n in expected_names}
        stu_map = {self._normalize_name(n): n for n in student_names}
        exact = set(exp_map.keys()) & set(stu_map.keys())
        semantic_map: Dict[str, str] = {}
        if use_semantic:
            _, semantic_map, _, _ = self._semantic_match_dicts(
                exp_map, stu_map, match_kind=match_kind,
            )
        stu_to_exp: Dict[str, str] = {s: s for s in exact}
        for exp_norm, stu_norm in semantic_map.items():
            stu_to_exp[stu_norm] = exp_norm
        return stu_to_exp

    def _compare_usecase_relationship_subset(
        self,
        expected: List[UMLRelationship],
        student: List[UMLRelationship],
        result: ComparisonResult,
        *,
        element_type: str,
        similarity_attr: str,
        correct_attr: str,
        missing_attr: str,
        extra_attr: str,
        vocabulary_stu_to_exp: Optional[Dict[str, str]] = None,
        uc_link_types: Optional[Set[str]] = None,
    ) -> None:
        """Compara un subconjunto de relaciones de casos de uso (actor-CU, include o extend)."""
        exp_names = {rel.source for rel in expected} | {rel.target for rel in expected}
        stu_names = {rel.source for rel in student} | {rel.target for rel in student}
        local_map = self._build_student_to_expected_name_map(
            exp_names, stu_names, use_semantic=not vocabulary_stu_to_exp,
        )
        stu_to_exp = dict(local_map)
        if vocabulary_stu_to_exp:
            stu_to_exp.update(vocabulary_stu_to_exp)

        expected_normalized = set()
        for rel in expected:
            key = self._relationship_key_with_aliases(
                rel, stu_to_exp, remap_student_side=False, uc_link_types=uc_link_types,
            )
            expected_normalized.add((key, rel))

        student_normalized = set()
        for rel in student:
            key = self._relationship_key_with_aliases(
                rel, stu_to_exp, remap_student_side=True, uc_link_types=uc_link_types,
            )
            student_normalized.add((key, rel))

        expected_keys = {k for k, _ in expected_normalized}
        student_keys = {k for k, _ in student_normalized}

        correct_keys = expected_keys & student_keys
        setattr(result, correct_attr, len(correct_keys))

        missing_list = getattr(result, missing_attr)
        extra_list = getattr(result, extra_attr)

        for key in (expected_keys - student_keys):
            label = f"{key[0]} -> {key[1]} ({key[2]})"
            missing_list.append(label)
            result.missing_relationships.append(label)
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=f"{key[0]} -> {key[1]}",
                status="missing",
                message=f"Relación faltante: {key[0]} -> {key[1]} ({key[2]})",
            ))

        for key in (student_keys - expected_keys):
            label = f"{key[0]} -> {key[1]} ({key[2]})"
            extra_list.append(label)
            result.extra_relationships.append(label)
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=f"{key[0]} -> {key[1]}",
                status="extra",
                message=f"Relación extra: {key[0]} -> {key[1]} ({key[2]})",
            ))

        for key in correct_keys:
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=f"{key[0]} -> {key[1]}",
                status="correct",
                similarity_score=100.0,
                message=f"Relación correcta: {key[0]} -> {key[1]} ({key[2]})",
            ))

        n_exp = len(expected_keys)
        n_stu = len(student_keys)
        sim = self._f1_similarity_counts(len(correct_keys), n_exp, n_stu)
        setattr(result, similarity_attr, sim)

    def _compare_named_list(
        self,
        expected_items: list,
        student_items: list,
        element_type: str,
        result_correct_attr: str,
        result_missing_attr: Optional[str],
        result_extra_attr: Optional[str],
        result_similarity_attr: str,
        result: ComparisonResult,
    ) -> None:
        """Compara dos listas de elementos con atributo 'name' (actores, casos de uso, lifelines)."""
        exp_map = {self._normalize_name(e.name): e for e in expected_items}
        stu_map = {self._normalize_name(e.name): e for e in student_items}

        kind = 'default'
        if element_type == 'actor':
            kind = 'actor'
        elif element_type == 'use_case':
            kind = 'use_case'

        exact_correct, semantic_map, missing_norm, extra_norm = self._semantic_match_dicts(
            exp_map, stu_map, match_kind=kind, original_name=lambda item: item.name,
        )
        correct_names = exact_correct | set(semantic_map.keys())
        missing = [exp_map[n].name for n in missing_norm]
        extra = [stu_map[n].name for n in extra_norm]

        setattr(result, result_correct_attr, len(correct_names))
        if result_missing_attr:
            setattr(result, result_missing_attr, missing)
        if result_extra_attr:
            setattr(result, result_extra_attr, extra)
        n_exp = len(exp_map)
        n_stu = len(stu_map)
        sim = self._f1_similarity_counts(len(correct_names), n_exp, n_stu)
        setattr(result, result_similarity_attr, sim)

        for name in missing:
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=name,
                status="missing",
                message=f"'{name}' no encontrado en el diagrama del estudiante",
            ))
        for name in extra:
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=name,
                status="extra",
                message=f"'{name}' extra en el diagrama del estudiante",
            ))
        for name in [exp_map[n].name for n in exact_correct]:
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=name,
                status="correct",
                similarity_score=100.0,
                message=f"'{name}' correcto",
            ))
        for exp_norm, stu_norm in semantic_map.items():
            exp_name = exp_map[exp_norm].name
            stu_name = stu_map[stu_norm].name
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=exp_name,
                status="correct",
                similarity_score=self._semantic_threshold * 100,
                semantic_match_of=stu_name,
                message=f"'{exp_name}' coincide semánticamente con '{stu_name}'",
            ))

    # ------------------------------------------------------------------
    # Comparador de secuencia
    # ------------------------------------------------------------------

    def _compare_sequence_diagram(
        self, expected: UMLDiagram, student: UMLDiagram
    ) -> ComparisonResult:
        """Comparación para diagramas de secuencia."""
        result = ComparisonResult(
            diagram_type="sequence",
            overall_similarity=0.0,
            class_similarity=0.0,       # lifeline similarity
            attribute_similarity=0.0,
            method_similarity=0.0,
            relationship_similarity=0.0,  # message similarity
            total_classes_expected=len(expected.lifelines),
            total_classes_found=len(student.lifelines),
            correct_classes=0,
            total_attributes_expected=0,
            total_attributes_found=0,
            correct_attributes=0,
            total_methods_expected=0,
            total_methods_found=0,
            correct_methods=0,
            total_relationships_expected=len(expected.messages),
            total_relationships_found=len(student.messages),
            correct_relationships=0,
        )

        # Comparar líneas de vida
        self._compare_named_list(
            expected.lifelines, student.lifelines,
            element_type="lifeline",
            result_correct_attr="correct_classes",
            result_missing_attr="missing_classes",
            result_extra_attr="extra_classes",
            result_similarity_attr="class_similarity",
            result=result,
        )

        # Comparar mensajes (existencia + orden)
        self._compare_messages(expected.messages, student.messages, result)

        # Desglose por criterios de secuencia (v2).
        sync_expected = [m for m in expected.messages if self._is_sync_message(m)]
        sync_student = [m for m in student.messages if self._is_sync_message(m)]
        async_expected = [m for m in expected.messages if self._is_async_message(m)]
        async_student = [m for m in student.messages if self._is_async_message(m)]
        creation_expected = [m for m in expected.messages if self._is_creation_message(m)]
        creation_student = [m for m in student.messages if self._is_creation_message(m)]

        sync_breakdown = self._compare_message_subset(
            sync_expected, sync_student, "sync_message", result
        )
        async_breakdown = self._compare_message_subset(
            async_expected, async_student, "async_message", result
        )
        creation_breakdown = self._compare_message_subset(
            creation_expected, creation_student, "creation_message", result
        )
        fragment_breakdown = self._compare_fragment_usage(expected.messages, student.messages, result)

        result.sequence_criteria = {
            "sync_messages": sync_breakdown,
            "async_messages": async_breakdown,
            "creation_messages": creation_breakdown,
            "fragment_usage": fragment_breakdown,
        }

        scores, weights = [], []
        sequence_weight_map = {
            "sync_messages": self.weights.get("sync_messages", 0.0),
            "async_messages": self.weights.get("async_messages", 0.0),
            "creation_messages": self.weights.get("creation_messages", 0.0),
            "fragment_usage": self.weights.get("fragment_usage", 0.0),
            "message_order": self.weights.get("message_order", 0.0),
            "lifelines": self.weights.get("classes", 0.0),
        }

        # Compatibilidad con esquema antiguo (classes/relationships) cuando no vengan pesos v2.
        msg_keys = ("sync_messages", "async_messages", "creation_messages", "fragment_usage", "message_order")
        if sum(sequence_weight_map[k] for k in msg_keys) <= 0:
            rel_w = self.weights.get("relationships", 0.60)
            # Orden ~15% del bloque de mensajes; el resto se reparte como antes.
            sequence_weight_map["message_order"] = rel_w * 0.15
            sequence_weight_map["sync_messages"] = rel_w * 0.40
            sequence_weight_map["async_messages"] = rel_w * 0.20
            sequence_weight_map["creation_messages"] = rel_w * 0.125
            sequence_weight_map["fragment_usage"] = rel_w * 0.125
            if sequence_weight_map["lifelines"] <= 0:
                sequence_weight_map["lifelines"] = self.weights.get("classes", 0.40)

        # Lifelines (class_similarity)
        ll_w = sequence_weight_map.get("lifelines", 0.0)
        if ll_w > 0 and (
            result.total_classes_expected > 0 or result.total_classes_found > 0
        ):
            ll_score = self._resolve_criterion_score(
                'lifelines', float(result.class_similarity),
                result.total_classes_expected, result.total_classes_found,
                result.correct_classes, result,
            )
            scores.append(ll_score)
            weights.append(ll_w)

        # Orden de mensajes coincidentes: no es un conteo de cantidad
        # esperada/entregada (es un score de posición relativa), por lo que
        # queda fuera del sistema de descuento por exceso en todos los modos.
        order_w = sequence_weight_map.get("message_order", 0.0)
        if order_w > 0 and (
            result.total_relationships_expected > 0 or result.total_relationships_found > 0
        ):
            scores.append(float(result.message_order_score))
            weights.append(order_w)

        for key, breakdown in result.sequence_criteria.items():
            w = sequence_weight_map.get(key, 0.0)
            if w <= 0:
                continue
            # Descartar criterios sin elementos esperados ni encontrados
            # (igual que clases y casos de uso): no deben inflar ni penalizar.
            if breakdown.get("expected", 0) == 0 and breakdown.get("found", 0) == 0:
                continue
            score = self._resolve_criterion_score(
                key, float(breakdown.get("similarity", 0.0)),
                breakdown.get("expected", 0), breakdown.get("found", 0),
                breakdown.get("correct", 0), result,
            )
            scores.append(score)
            weights.append(w)

        if scores:
            total_w = sum(weights)
            if total_w > 0:
                result.overall_similarity = sum(
                    s * w / total_w for s, w in zip(scores, weights)
                )

        return result

    def _normalize_message_sort(self, sort: str) -> str:
        return self._normalize_name(sort or "")

    def _is_sync_message(self, msg: UMLMessage) -> bool:
        kind = self._normalize_message_sort(msg.message_sort)
        return kind in {"synchcall", "synccall", "call", "sync"}

    def _is_async_message(self, msg: UMLMessage) -> bool:
        kind = self._normalize_message_sort(msg.message_sort)
        return kind in {"asynchcall", "asynccall", "async", "asynchronous"}

    def _is_creation_message(self, msg: UMLMessage) -> bool:
        kind = self._normalize_message_sort(msg.message_sort)
        name = self._normalize_name(msg.name)
        return kind in {"createmessage", "create", "creation"} or name.startswith("create")

    def _message_key(self, m: UMLMessage) -> Tuple[str, str, str]:
        return (
            self._normalize_name(m.name),
            self._normalize_name(m.source_lifeline),
            self._normalize_name(m.target_lifeline),
        )

    def _compare_message_subset(
        self,
        expected: List[UMLMessage],
        student: List[UMLMessage],
        element_type: str,
        result: ComparisonResult,
    ) -> Dict[str, Any]:
        exp_set = {self._message_key(m) for m in expected}
        stu_set = {self._message_key(m) for m in student}
        correct = exp_set & stu_set

        similarity = self._f1_similarity_counts(len(correct), len(exp_set), len(stu_set))
        missing = [f"{k[0]} ({k[1]}→{k[2]})" for k in sorted(exp_set - stu_set)]
        extra = [f"{k[0]} ({k[1]}→{k[2]})" for k in sorted(stu_set - exp_set)]

        for key in (exp_set - stu_set):
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=key[0],
                status="missing",
                message=f"{element_type} faltante: {key[0]} ({key[1]}→{key[2]})",
            ))
        for key in (stu_set - exp_set):
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=key[0],
                status="extra",
                message=f"{element_type} extra: {key[0]} ({key[1]}→{key[2]})",
            ))

        return {
            "similarity": round(similarity, 2),
            "expected": len(exp_set),
            "found": len(stu_set),
            "correct": len(correct),
            "missing": missing,
            "extra": extra,
        }

    def _fragment_operator(self, fragment: Optional[str]) -> str:
        if not fragment:
            return ""
        raw = self._normalize_name(fragment)
        if "[" in raw:
            raw = raw.split("[", 1)[0].strip()
        return raw

    def _compare_fragment_usage(
        self, expected_msgs: List[UMLMessage], student_msgs: List[UMLMessage], result: ComparisonResult
    ) -> Dict[str, Any]:
        target_ops = {"loop", "alt", "opt"}

        def fragment_key(m: UMLMessage) -> Optional[Tuple[str, str, str, str]]:
            op = self._fragment_operator(m.fragment)
            if not op or op not in target_ops:
                return None
            return (
                self._normalize_name(m.name),
                self._normalize_name(m.source_lifeline),
                self._normalize_name(m.target_lifeline),
                self._normalize_name(m.fragment or op),
            )

        exp_set = {k for m in expected_msgs if (k := fragment_key(m)) is not None}
        stu_set = {k for m in student_msgs if (k := fragment_key(m)) is not None}
        correct = exp_set & stu_set
        similarity = self._f1_similarity_counts(len(correct), len(exp_set), len(stu_set))

        missing = [f"{k[0]} ({k[1]}→{k[2]}) [{k[3]}]" for k in sorted(exp_set - stu_set)]
        extra = [f"{k[0]} ({k[1]}→{k[2]}) [{k[3]}]" for k in sorted(stu_set - exp_set)]

        for key in (exp_set - stu_set):
            result.details.append(ComparisonDetail(
                element_type="fragment_usage",
                name=key[0],
                status="missing",
                message=f"Uso de fragmento faltante: {key[0]} ({key[1]}→{key[2]}) [{key[3]}]",
            ))
        for key in (stu_set - exp_set):
            result.details.append(ComparisonDetail(
                element_type="fragment_usage",
                name=key[0],
                status="extra",
                message=f"Uso de fragmento extra: {key[0]} ({key[1]}→{key[2]}) [{key[3]}]",
            ))

        return {
            "similarity": round(similarity, 2),
            "expected": len(exp_set),
            "found": len(stu_set),
            "correct": len(correct),
            "missing": missing,
            "extra": extra,
        }

    def _compare_messages(
        self,
        expected: List[UMLMessage],
        student: List[UMLMessage],
        result: ComparisonResult,
    ) -> None:
        """Compara mensajes validando existencia y orden."""

        def msg_key(m: UMLMessage) -> Tuple[str, str, str]:
            return (
                self._normalize_name(m.name),
                self._normalize_name(m.source_lifeline),
                self._normalize_name(m.target_lifeline),
            )

        exp_keys = [msg_key(m) for m in expected]
        stu_keys = [msg_key(m) for m in student]

        exp_set = set(exp_keys)
        stu_set = set(stu_keys)

        correct_keys = exp_set & stu_set
        result.correct_relationships = len(correct_keys)

        if result.total_relationships_expected > 0:
            result.relationship_similarity = (
                len(correct_keys) / result.total_relationships_expected * 100
            )

        # Orden: contar cuántos mensajes coincidentes aparecen en el mismo orden relativo
        if correct_keys and len(expected) > 0:
            exp_order = [k for k in exp_keys if k in correct_keys]
            stu_order = [k for k in stu_keys if k in correct_keys]
            in_order = sum(1 for e, s in zip(exp_order, stu_order) if e == s)
            result.message_order_score = in_order / len(exp_order) * 100 if exp_order else 0.0

        for key in (exp_set - stu_set):
            label = f"{key[0]} ({key[1]}→{key[2]})"
            result.missing_relationships.append(label)
            result.details.append(ComparisonDetail(
                element_type="message",
                name=key[0],
                status="missing",
                message=f"Mensaje faltante: {label}",
            ))

        for key in (stu_set - exp_set):
            label = f"{key[0]} ({key[1]}→{key[2]})"
            result.extra_relationships.append(label)
            result.details.append(ComparisonDetail(
                element_type="message",
                name=key[0],
                status="extra",
                message=f"Mensaje extra: {label}",
            ))

        for key in correct_keys:
            result.details.append(ComparisonDetail(
                element_type="message",
                name=key[0],
                status="correct",
                similarity_score=100.0,
                message=f"Mensaje correcto: {key[0]} ({key[1]}→{key[2]})",
            ))

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
