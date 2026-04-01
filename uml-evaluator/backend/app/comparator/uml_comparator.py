"""
Módulo de comparación de diagramas UML.
Calcula similitud entre diagramas UML con diferentes niveles de granularidad.
"""

from typing import List, Dict, Any, Tuple, Set, Optional
from dataclasses import dataclass, field

from app.models.uml_elements import (
    UMLDiagram, UMLClass, UMLAttribute, UMLMethod,
    UMLRelationship, Visibility,
    UMLActor, UMLUseCase, UMLLifeline, UMLMessage,
)


@dataclass
class ComparisonDetail:
    """Detalle de comparación de un elemento específico."""
    element_type: str  # "class", "attribute", "method", "relationship"
    name: str
    status: str  # "correct", "missing", "extra", "partial"
    expected: Any = None
    found: Any = None
    similarity_score: float = 0.0
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
    missing_relationships: List[str] = field(default_factory=list)
    extra_relationships: List[str] = field(default_factory=list)
    class_results: List[ClassComparisonResult] = field(default_factory=list)
    details: List[ComparisonDetail] = field(default_factory=list)
    # Orden de mensajes (secuencia): porcentaje de mensajes en posición correcta
    message_order_score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convierte el resultado a diccionario con estructura adaptada al tipo de diagrama."""
        base = {
            "overall_similarity": round(self.overall_similarity, 2),
            "diagram_type": self.diagram_type,
            "details": [
                {
                    "element_type": d.element_type,
                    "name": d.name,
                    "status": d.status,
                    "similarity_score": round(d.similarity_score, 2),
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

        elif self.diagram_type == "sequence":
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
    ):
        """
        Inicializa el comparador.

        Args:
            case_sensitive: Si la comparación de nombres es sensible a mayúsculas
            strict_types: Si se requiere coincidencia exacta de tipos
            weights: Diccionario con pesos para cada categoría
                     (classes, attributes, methods, relationships).
                     Los valores se normalizan automáticamente.
        """
        self.case_sensitive = case_sensitive
        self.strict_types = strict_types

        if weights:
            total = sum(weights.values())
            self.weights = {k: v / total for k, v in weights.items()} if total > 0 else self.DEFAULT_WEIGHTS
        else:
            self.weights = dict(self.DEFAULT_WEIGHTS)
    
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

    def _compare_use_cases_diagram(
        self, expected: UMLDiagram, student: UMLDiagram
    ) -> ComparisonResult:
        """Comparación para diagramas de casos de uso."""
        result = ComparisonResult(
            diagram_type="usecase",
            overall_similarity=0.0,
            class_similarity=0.0,       # actor similarity
            attribute_similarity=0.0,   # use-case similarity
            method_similarity=0.0,
            relationship_similarity=0.0,
            total_classes_expected=len(expected.actors),
            total_classes_found=len(student.actors),
            correct_classes=0,
            total_attributes_expected=len(expected.use_cases),
            total_attributes_found=len(student.use_cases),
            correct_attributes=0,
            total_methods_expected=0,
            total_methods_found=0,
            correct_methods=0,
            total_relationships_expected=len(expected.relationships),
            total_relationships_found=len(student.relationships),
            correct_relationships=0,
        )

        self._compare_named_list(
            expected.actors, student.actors,
            element_type="actor",
            result_correct_attr="correct_classes",
            result_missing_attr="missing_classes",
            result_extra_attr="extra_classes",
            result_similarity_attr="class_similarity",
            total_expected=len(expected.actors),
            result=result,
        )

        self._compare_named_list(
            expected.use_cases, student.use_cases,
            element_type="use_case",
            result_correct_attr="correct_attributes",
            result_missing_attr=None,
            result_extra_attr=None,
            result_similarity_attr="attribute_similarity",
            total_expected=len(expected.use_cases),
            result=result,
        )

        self._compare_relationships(expected.relationships, student.relationships, result)

        scores, weights = [], []
        if result.total_classes_expected > 0:
            scores.append(result.class_similarity)
            weights.append(self.weights.get('classes', 0.35))
        if result.total_attributes_expected > 0:
            scores.append(result.attribute_similarity)
            weights.append(self.weights.get('attributes', 0.25))
        if result.total_relationships_expected > 0:
            scores.append(result.relationship_similarity)
            weights.append(self.weights.get('relationships', 0.40))

        if scores:
            total_w = sum(weights)
            result.overall_similarity = sum(
                s * w / total_w for s, w in zip(scores, weights)
            )

        return result

    def _compare_named_list(
        self,
        expected_items: list,
        student_items: list,
        element_type: str,
        result_correct_attr: str,
        result_missing_attr: Optional[str],
        result_extra_attr: Optional[str],
        result_similarity_attr: str,
        total_expected: int,
        result: ComparisonResult,
    ) -> None:
        """Compara dos listas de elementos con atributo 'name' (actores, casos de uso, lifelines)."""
        exp_map = {self._normalize_name(e.name): e for e in expected_items}
        stu_map = {self._normalize_name(e.name): e for e in student_items}

        correct = set(exp_map.keys()) & set(stu_map.keys())
        missing = [exp_map[n].name for n in (set(exp_map.keys()) - set(stu_map.keys()))]
        extra = [stu_map[n].name for n in (set(stu_map.keys()) - set(exp_map.keys()))]

        setattr(result, result_correct_attr, len(correct))
        if result_missing_attr:
            setattr(result, result_missing_attr, missing)
        if result_extra_attr:
            setattr(result, result_extra_attr, extra)
        if total_expected > 0:
            setattr(result, result_similarity_attr, len(correct) / total_expected * 100)

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
        for name in [exp_map[n].name for n in correct]:
            result.details.append(ComparisonDetail(
                element_type=element_type,
                name=name,
                status="correct",
                similarity_score=100.0,
                message=f"'{name}' correcto",
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
            total_expected=len(expected.lifelines),
            result=result,
        )

        # Comparar mensajes (existencia + orden)
        self._compare_messages(expected.messages, student.messages, result)

        scores, weights = [], []
        if result.total_classes_expected > 0:
            scores.append(result.class_similarity)
            weights.append(0.40)
        if result.total_relationships_expected > 0:
            scores.append(result.relationship_similarity)
            weights.append(0.60)

        if scores:
            total_w = sum(weights)
            result.overall_similarity = sum(
                s * w / total_w for s, w in zip(scores, weights)
            )

        return result

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
        """Normaliza un nombre para comparación."""
        if not self.case_sensitive:
            return name.lower().strip()
        return name.strip()
    
    def _compare_classes(self, expected_classes: List[UMLClass], 
                        student_classes: List[UMLClass],
                        result: ComparisonResult) -> None:
        """Compara las clases de ambos diagramas."""
        
        # Crear mapas de clases por nombre normalizado
        expected_map = {self._normalize_name(c.name): c for c in expected_classes}
        student_map = {self._normalize_name(c.name): c for c in student_classes}
        
        expected_names = set(expected_map.keys())
        student_names = set(student_map.keys())
        
        # Clases correctas (intersección)
        correct_names = expected_names & student_names
        result.correct_classes = len(correct_names)
        
        # Clases faltantes
        result.missing_classes = [expected_map[name].name for name in (expected_names - student_names)]
        
        # Clases extra
        result.extra_classes = [student_map[name].name for name in (student_names - expected_names)]
        
        # Calcular similitud de clases
        if result.total_classes_expected > 0:
            result.class_similarity = (result.correct_classes / result.total_classes_expected) * 100
        
        # Comparar atributos y métodos de cada clase correcta
        total_attr_expected = 0
        total_attr_found = 0
        total_attr_correct = 0
        total_method_expected = 0
        total_method_found = 0
        total_method_correct = 0
        
        for class_name in correct_names:
            expected_class = expected_map[class_name]
            student_class = student_map[class_name]
            
            class_result = self._compare_class_details(expected_class, student_class)
            result.class_results.append(class_result)
            
            # Acumular contadores
            total_attr_expected += class_result.attributes_total
            total_attr_found += len(student_class.attributes)
            total_attr_correct += class_result.attributes_correct
            
            total_method_expected += class_result.methods_total
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
        
        expected_names = set(expected_attrs.keys())
        student_names = set(student_attrs.keys())
        
        # Atributos correctos
        correct_names = expected_names & student_names
        result.attributes_correct = len(correct_names)
        
        # Atributos faltantes
        result.missing_attributes = [expected_attrs[name].name for name in (expected_names - student_names)]
        
        # Atributos extra
        result.extra_attributes = [student_attrs[name].name for name in (student_names - expected_names)]
        
        # Detalles de atributos correctos
        for attr_name in correct_names:
            expected_attr = expected_attrs[attr_name]
            student_attr = student_attrs[attr_name]
            
            similarity = self._calculate_attribute_similarity(expected_attr, student_attr)
            status = "correct" if similarity == 1.0 else "partial"
            
            result.details.append(ComparisonDetail(
                element_type="attribute",
                name=expected_attr.name,
                status=status,
                expected=expected_attr.to_dict(),
                found=student_attr.to_dict(),
                similarity_score=similarity * 100,
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
        
        expected_names = set(expected_methods.keys())
        student_names = set(student_methods.keys())
        
        # Métodos correctos
        correct_names = expected_names & student_names
        result.methods_correct = len(correct_names)
        
        # Métodos faltantes
        result.missing_methods = [expected_methods[name].name for name in (expected_names - student_names)]
        
        # Métodos extra
        result.extra_methods = [student_methods[name].name for name in (student_names - expected_names)]
        
        # Detalles de métodos correctos
        for method_name in correct_names:
            expected_method = expected_methods[method_name]
            student_method = student_methods[method_name]
            
            similarity = self._calculate_method_similarity(expected_method, student_method)
            status = "correct" if similarity == 1.0 else "partial"
            
            result.details.append(ComparisonDetail(
                element_type="method",
                name=expected_method.name,
                status=status,
                expected=expected_method.to_dict(),
                found=student_method.to_dict(),
                similarity_score=similarity * 100,
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
        
        # Nombre (siempre debe coincidir)
        total += 1
        if self._normalize_name(expected.name) == self._normalize_name(student.name):
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
        
        # Nombre
        total += 1
        if self._normalize_name(expected.name) == self._normalize_name(student.name):
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
        
        # Normalizar relaciones para comparación
        expected_normalized = set()
        for rel in expected:
            key = (
                self._normalize_name(rel.source),
                self._normalize_name(rel.target),
                rel.relationship_type.value,
                rel.source_multiplicity or '',
                rel.target_multiplicity or '',
            )
            expected_normalized.add((key, rel))
        
        student_normalized = set()
        for rel in student:
            key = (
                self._normalize_name(rel.source),
                self._normalize_name(rel.target),
                rel.relationship_type.value,
                rel.source_multiplicity or '',
                rel.target_multiplicity or '',
            )
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
        
        # Calcular similitud de relaciones
        if result.total_relationships_expected > 0:
            result.relationship_similarity = (result.correct_relationships / result.total_relationships_expected) * 100
    
    def _calculate_overall_similarity(self, result: ComparisonResult) -> float:
        """Calcula la similitud global ponderada."""
        
        scores = []
        weights = []
        
        # Similitud de clases
        if result.total_classes_expected > 0:
            scores.append(result.class_similarity)
            weights.append(self.weights['classes'])

        # Similitud de atributos
        if result.total_attributes_expected > 0:
            scores.append(result.attribute_similarity)
            weights.append(self.weights['attributes'])

        # Similitud de métodos
        if result.total_methods_expected > 0:
            scores.append(result.method_similarity)
            weights.append(self.weights['methods'])

        # Similitud de relaciones
        if result.total_relationships_expected > 0:
            scores.append(result.relationship_similarity)
            weights.append(self.weights['relationships'])
        
        if not scores:
            return 0.0
        
        # Normalizar pesos
        total_weight = sum(weights)
        if total_weight == 0:
            return 0.0
        
        normalized_weights = [w / total_weight for w in weights]
        
        # Calcular promedio ponderado
        overall = sum(s * w for s, w in zip(scores, normalized_weights))
        return overall


def compare_uml_diagrams(
    expected: UMLDiagram,
    student: UMLDiagram,
    case_sensitive: bool = False,
    strict_types: bool = True,
    weights: Optional[Dict[str, float]] = None,
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

    Returns:
        ComparisonResult con el resultado de la comparación
    """
    comparator = UMLComparator(
        case_sensitive=case_sensitive,
        strict_types=strict_types,
        weights=weights,
    )
    return comparator.compare(expected, student)
