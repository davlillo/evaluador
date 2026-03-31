"""
Modelos de datos para elementos UML.
Define las estructuras de datos para representar clases, atributos, métodos y relaciones UML.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


class Visibility(Enum):
    """Tipos de visibilidad en UML."""
    PUBLIC = "public"
    PRIVATE = "private"
    PROTECTED = "protected"
    PACKAGE = "package"


class RelationshipType(Enum):
    """Tipos de relaciones UML."""
    ASSOCIATION = "association"
    ASSOCIATION_CLASS = "association_class"
    INHERITANCE = "inheritance"
    IMPLEMENTATION = "implementation"
    DEPENDENCY = "dependency"
    AGGREGATION = "aggregation"
    COMPOSITION = "composition"
    INCLUDE = "include"
    EXTEND = "extend"


@dataclass
class UMLAttribute:
    """Representa un atributo de una clase UML."""
    name: str
    type: str = ""
    visibility: Visibility = Visibility.PRIVATE
    default_value: Optional[str] = None
    is_static: bool = False
    is_final: bool = False
    
    def __hash__(self):
        return hash((self.name, self.type))
    
    def __eq__(self, other):
        if not isinstance(other, UMLAttribute):
            return False
        return self.name == other.name and self.type == other.type
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "visibility": self.visibility.value,
            "default_value": self.default_value,
            "is_static": self.is_static,
            "is_final": self.is_final
        }


@dataclass
class UMLMethod:
    """Representa un método de una clase UML."""
    name: str
    return_type: str = "void"
    visibility: Visibility = Visibility.PUBLIC
    parameters: List[Dict[str, str]] = field(default_factory=list)
    is_static: bool = False
    is_abstract: bool = False
    
    def __hash__(self):
        param_str = ",".join([f"{p.get('name', '')}:{p.get('type', '')}" for p in self.parameters])
        return hash((self.name, self.return_type, param_str))
    
    def __eq__(self, other):
        if not isinstance(other, UMLMethod):
            return False
        # Dos métodos son iguales si tienen el mismo nombre y parámetros
        self_params = sorted([(p.get('name', ''), p.get('type', '')) for p in self.parameters])
        other_params = sorted([(p.get('name', ''), p.get('type', '')) for p in other.parameters])
        return self.name == other.name and self_params == other_params
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "return_type": self.return_type,
            "visibility": self.visibility.value,
            "parameters": self.parameters,
            "is_static": self.is_static,
            "is_abstract": self.is_abstract
        }


@dataclass
class UMLRelationship:
    """Representa una relación entre clases UML."""
    source: str  # Nombre de la clase origen
    target: str  # Nombre de la clase destino
    relationship_type: RelationshipType
    name: Optional[str] = None
    source_multiplicity: Optional[str] = None
    target_multiplicity: Optional[str] = None
    
    def __hash__(self):
        return hash((self.source, self.target, self.relationship_type.value, self.name or ""))
    
    def __eq__(self, other):
        if not isinstance(other, UMLRelationship):
            return False
        return (self.source == other.source and 
                self.target == other.target and 
                self.relationship_type == other.relationship_type and
                self.name == other.name)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "source": self.source,
            "target": self.target,
            "relationship_type": self.relationship_type.value,
            "name": self.name,
            "source_multiplicity": self.source_multiplicity,
            "target_multiplicity": self.target_multiplicity
        }


@dataclass
class UMLClass:
    """Representa una clase UML."""
    name: str
    attributes: List[UMLAttribute] = field(default_factory=list)
    methods: List[UMLMethod] = field(default_factory=list)
    is_abstract: bool = False
    is_interface: bool = False
    stereotype: Optional[str] = None
    package: Optional[str] = None
    
    def __hash__(self):
        return hash(self.name)
    
    def __eq__(self, other):
        if not isinstance(other, UMLClass):
            return False
        return self.name == other.name
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "attributes": [attr.to_dict() for attr in self.attributes],
            "methods": [method.to_dict() for method in self.methods],
            "is_abstract": self.is_abstract,
            "is_interface": self.is_interface,
            "stereotype": self.stereotype,
            "package": self.package
        }


@dataclass
class UMLActor:
    """Representa un actor en un diagrama de casos de uso."""
    name: str

    def __hash__(self):
        return hash(self.name)

    def __eq__(self, other):
        if not isinstance(other, UMLActor):
            return False
        return self.name == other.name

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name}


@dataclass
class UMLUseCase:
    """Representa un caso de uso en un diagrama de casos de uso."""
    name: str

    def __hash__(self):
        return hash(self.name)

    def __eq__(self, other):
        if not isinstance(other, UMLUseCase):
            return False
        return self.name == other.name

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name}


@dataclass
class UMLLifeline:
    """Representa una línea de vida en un diagrama de secuencia."""
    name: str
    represents: str = ""

    def __hash__(self):
        return hash(self.name)

    def __eq__(self, other):
        if not isinstance(other, UMLLifeline):
            return False
        return self.name == other.name

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "represents": self.represents}


@dataclass
class UMLMessage:
    """Representa un mensaje en un diagrama de secuencia."""
    name: str
    source_lifeline: str
    target_lifeline: str
    message_sort: str = ""
    sequence_order: int = 0

    def __hash__(self):
        return hash((self.name, self.source_lifeline, self.target_lifeline))

    def __eq__(self, other):
        if not isinstance(other, UMLMessage):
            return False
        return (
            self.name == other.name
            and self.source_lifeline == other.source_lifeline
            and self.target_lifeline == other.target_lifeline
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "source_lifeline": self.source_lifeline,
            "target_lifeline": self.target_lifeline,
            "message_sort": self.message_sort,
            "sequence_order": self.sequence_order,
        }


@dataclass
class UMLDiagram:
    """Representa un diagrama UML completo."""
    name: str
    diagram_type: str  # "class", "usecase", "sequence", etc.
    classes: List[UMLClass] = field(default_factory=list)
    relationships: List[UMLRelationship] = field(default_factory=list)
    packages: List[str] = field(default_factory=list)
    actors: List[UMLActor] = field(default_factory=list)
    use_cases: List[UMLUseCase] = field(default_factory=list)
    lifelines: List[UMLLifeline] = field(default_factory=list)
    messages: List[UMLMessage] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "name": self.name,
            "diagram_type": self.diagram_type,
            "classes": [cls.to_dict() for cls in self.classes],
            "relationships": [rel.to_dict() for rel in self.relationships],
            "packages": self.packages,
        }
        if self.actors:
            d["actors"] = [a.to_dict() for a in self.actors]
        if self.use_cases:
            d["use_cases"] = [uc.to_dict() for uc in self.use_cases]
        if self.lifelines:
            d["lifelines"] = [ll.to_dict() for ll in self.lifelines]
        if self.messages:
            d["messages"] = [msg.to_dict() for msg in self.messages]
        return d
