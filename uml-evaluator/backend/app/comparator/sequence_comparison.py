# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Comparación de diagramas de secuencia: líneas de vida, mensajes síncronos,
asíncronos y de creación, y uso de fragmentos combinados.
"""

from typing import List, Dict, Any, Tuple, Optional

from app.models.uml_elements import (
    UMLDiagram, UMLMessage,
)
from app.comparator.results import ComparisonDetail, ComparisonResult


class SequenceComparisonMixin:
    """Compara diagramas de secuencia. Se mezcla en UMLComparator."""


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
