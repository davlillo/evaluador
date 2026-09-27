# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Comparación de diagramas de casos de uso: actores, casos de uso y relaciones
(asociación actor-caso, include, extend).
"""

from typing import List, Dict, Tuple, Set, Optional

from app.models.uml_elements import (
    UMLDiagram, UMLRelationship, RelationshipType,
)
from app.parsers.xmi_parser import looks_like_use_case_name
from app.comparator.results import ComparisonDetail, ComparisonResult


class UseCaseComparisonMixin:
    """Compara diagramas de casos de uso. Se mezcla en UMLComparator."""


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
