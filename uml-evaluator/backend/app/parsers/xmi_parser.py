"""
Parser para archivos XMI/XML de diagramas UML.
Soporta múltiples herramientas de modelado (StarUML, Enterprise Architect,
Visual Paradigm, Astah, etc.)
"""

import xml.etree.ElementTree as ET
from typing import Optional, Dict, List, Any
import re

from app.models.uml_elements import (
    UMLDiagram, UMLClass, UMLAttribute, UMLMethod,
    UMLRelationship, Visibility, RelationshipType,
    UMLActor, UMLUseCase, UMLLifeline, UMLMessage,
)

# Tipos primitivos que Astah (y otros) definen como uml:Class pero no son
# clases del dominio — se excluyen de la lista final de clases.
PRIMITIVE_TYPES = {
    'integer', 'int', 'string', 'str', 'boolean', 'bool', 'float', 'double',
    'long', 'short', 'byte', 'char', 'void', 'date', 'datetime', 'object',
    'number', 'real', 'decimal', 'natural', 'unlimited', 'unlimitednatural',
    'any', 'null', 'undefined',
}

# Verbos en infinitivo (ES/EN) que indican que una clase es un caso de uso.
UC_VERBS = {
    'gestionar', 'crear', 'buscar', 'editar', 'eliminar', 'registrar',
    'actualizar', 'modificar', 'ver', 'listar', 'consultar', 'administrar',
    'agregar', 'añadir', 'borrar', 'cancelar', 'procesar', 'generar',
    'enviar', 'recibir', 'autenticar', 'validar', 'iniciar', 'cerrar',
    'obtener', 'mostrar', 'calcular', 'realizar', 'ejecutar', 'confirmar',
    'verificar', 'manage', 'create', 'search', 'edit', 'delete', 'register',
    'update', 'view', 'list', 'consult', 'add', 'remove', 'cancel',
    'process', 'generate', 'send', 'receive', 'authenticate', 'validate',
    'login', 'logout', 'get', 'show', 'calculate', 'execute', 'confirm',
    'verify',
}


class XMIParser:
    """Parser para archivos XMI/XML de diagramas UML."""

    NAMESPACES = {
        'xmi': 'http://www.omg.org/spec/XMI/20131001',
        'uml': 'http://www.eclipse.org/uml2/5.0.0/UML',
        'uml2': 'http://www.omg.org/spec/UML/20161101',
        'staruml': 'http://staruml.io/schema/staruml',
        'vp': 'http://www.visual-paradigm.com/XMI',
        'ea': 'http://www.sparxsystems.com.au/schemas/ea',
    }

    def __init__(self, xmi_source: str = 'astah'):
        # xmi:id → UMLClass  (clases del dominio + primitivos para resolución)
        self.element_id_map: Dict[str, Any] = {}
        # xmi:id → ET.Element  (todos los elementos con ID)
        self.all_elements_by_id: Dict[str, ET.Element] = {}
        # xmi:id de ownedAttribute → nombre de la clase dueña
        self.property_owner_map: Dict[str, str] = {}
        self.ns_xmi = '{http://www.omg.org/spec/XMI/20131001}'
        self.xmi_source = xmi_source

    # ------------------------------------------------------------------
    # Entrada pública
    # ------------------------------------------------------------------

    def parse_file(self, file_path: str) -> UMLDiagram:
        """Parsea un archivo XMI/XML y retorna un UMLDiagram."""
        tree = ET.parse(file_path)
        root = tree.getroot()
        return self._parse_root(root)

    def parse_string(self, xml_content: str) -> UMLDiagram:
        """Parsea un string XML y retorna un UMLDiagram."""
        root = ET.fromstring(xml_content)
        return self._parse_root(root)

    # ------------------------------------------------------------------
    # Orquestación principal
    # ------------------------------------------------------------------

    def _parse_root(self, root: ET.Element) -> UMLDiagram:
        """Parsea el elemento raíz del XML."""
        self._detect_namespace(root)
        self._build_id_maps(root)

        diagram_type = self._detect_diagram_type(root)
        diagram = UMLDiagram(
            name=self._get_diagram_name(root),
            diagram_type=diagram_type,
        )

        if diagram_type == "sequence":
            diagram.lifelines, diagram.messages = self._extract_interaction(root)
            diagram.packages = self._extract_packages(root)

        elif diagram_type == "usecase":
            actors, use_cases, excluded_ids = self._extract_use_cases_and_actors(root)
            diagram.actors = actors
            diagram.use_cases = use_cases
            diagram.classes = self._extract_classes(root, excluded_ids)
            self._build_property_owner_map()
            diagram.relationships = self._extract_relationships(
                root, diagram.classes, actors, use_cases
            )
            diagram.packages = self._extract_packages(root)

        else:
            diagram.classes = self._extract_classes(root)
            self._build_property_owner_map()
            diagram.relationships = self._extract_relationships(root, diagram.classes)
            diagram.packages = self._extract_packages(root)

        return diagram

    # ------------------------------------------------------------------
    # Detección de tipo de diagrama
    # ------------------------------------------------------------------

    def _detect_diagram_type(self, root: ET.Element) -> str:
        """Infiere el tipo de diagrama analizando los elementos del XMI."""
        for elem in root.iter():
            elem_type = elem.get(f'{self.ns_xmi}type', '') or elem.get('type', '')
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

            if 'Interaction' in elem_type or tag_local == 'Interaction':
                return "sequence"
            if 'Actor' in elem_type or 'UseCase' in elem_type:
                return "usecase"

        # Heurística secundaria: clases con nombres de actor o verbos de CU
        for elem in root.iter():
            elem_type = elem.get(f'{self.ns_xmi}type', '') or elem.get('type', '')
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

            is_class = (
                tag_local in ['Class', 'Interface']
                or 'Class' in elem_type
                or 'Interface' in elem_type
            )
            if not is_class:
                continue

            name = elem.get('name', '').strip().lower()
            if not name or name in PRIMITIVE_TYPES:
                continue

            first_word = name.split()[0]
            if first_word.startswith('actor') or first_word in UC_VERBS:
                return "usecase"

        return "class"

    # ------------------------------------------------------------------
    # Detección de namespace y mapas de IDs
    # ------------------------------------------------------------------

    def _detect_namespace(self, root: ET.Element):
        """Detecta dinámicamente el namespace XMI del documento."""
        tag = root.tag
        if '}' in tag:
            ns_uri = tag[1:tag.index('}')]
            if 'XMI' in ns_uri or 'xmi' in ns_uri.lower():
                self.ns_xmi = '{' + ns_uri + '}'
                return

        # Si el tag raíz no es XMI, buscar en atributos de los primeros elementos
        for elem in root.iter():
            for attr in elem.attrib:
                if '}' in attr:
                    attr_ns_uri = attr[1:attr.index('}')]
                    attr_local = attr[attr.index('}') + 1:]
                    if attr_local in ('id', 'type', 'idref') and (
                        'XMI' in attr_ns_uri or 'xmi' in attr_ns_uri.lower()
                    ):
                        self.ns_xmi = '{' + attr_ns_uri + '}'
                        return

    def _build_id_maps(self, root: ET.Element):
        """Escanea todos los elementos y construye xmi:id → ET.Element."""
        for elem in root.iter():
            elem_id = elem.get(f'{self.ns_xmi}id')
            if elem_id:
                self.all_elements_by_id[elem_id] = elem

    def _build_property_owner_map(self):
        """Construye xmi:id de ownedAttribute → nombre de la clase dueña."""
        for elem_id, uml_class in self.element_id_map.items():
            class_elem = self.all_elements_by_id.get(elem_id)
            if class_elem is None:
                continue
            for child in class_elem:
                tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag_local in ('ownedAttribute', 'attribute'):
                    prop_id = child.get(f'{self.ns_xmi}id')
                    if prop_id:
                        self.property_owner_map[prop_id] = uml_class.name

    # ------------------------------------------------------------------
    # Nombre del diagrama
    # ------------------------------------------------------------------

    def _get_diagram_name(self, root: ET.Element) -> str:
        """Extrae el nombre del diagrama."""
        for attr in ['name', f'{self.ns_xmi}name', 'UML:Model.name']:
            if attr in root.attrib:
                return root.attrib[attr]

        for elem in root.iter():
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            if tag_local in ['Model', 'Package', 'Diagram']:
                if 'name' in elem.attrib:
                    return elem.attrib['name']

        return "Diagrama sin nombre"

    # ------------------------------------------------------------------
    # Extracción de clases
    # ------------------------------------------------------------------

    def _extract_classes(self, root: ET.Element, excluded_ids: set = None) -> List[UMLClass]:
        """Extrae todas las clases del diagrama (excluye tipos primitivos y IDs dados)."""
        classes = []
        found_elements: set = set()
        excluded_ids = excluded_ids or set()

        for elem in root.iter():
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

            elem_type = elem.get(f'{self.ns_xmi}type') or elem.get('type', '')
            is_class = (
                tag_local in ['Class', 'Interface']
                or 'Class' in elem_type
                or 'Interface' in elem_type
            )

            if not is_class:
                continue

            elem_id = elem.get(f'{self.ns_xmi}id') or elem.get('id')

            # Omitir elementos ya clasificados como actores/casos de uso
            if elem_id and elem_id in excluded_ids:
                continue

            # Registrar primitivos en el mapa de IDs para resolución de tipos,
            # pero no incluirlos como clases del dominio.
            name = elem.get('name', '')
            if name.lower() in PRIMITIVE_TYPES:
                if elem_id and elem_id not in found_elements:
                    found_elements.add(elem_id)
                    temp = UMLClass(name=name, is_abstract=False, is_interface=False)
                    self.element_id_map[elem_id] = temp
                continue

            if elem_id and elem_id in found_elements:
                continue

            uml_class = self._parse_class_element(elem)
            if uml_class:
                classes.append(uml_class)
                if elem_id:
                    found_elements.add(elem_id)
                    self.element_id_map[elem_id] = uml_class

        return classes

    def _parse_class_element(self, elem: ET.Element) -> Optional[UMLClass]:
        """Parsea un elemento de clase."""
        name = elem.get('name')
        if not name:
            return None

        elem_type = elem.get(f'{self.ns_xmi}type') or elem.get('type', '')
        tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

        is_interface = 'Interface' in elem_type or tag_local == 'Interface'
        is_abstract = elem.get('isAbstract') == 'true'

        uml_class = UMLClass(
            name=name,
            is_abstract=is_abstract,
            is_interface=is_interface,
        )
        uml_class.attributes = self._extract_attributes(elem)
        uml_class.methods = self._extract_methods(elem)

        return uml_class

    # ------------------------------------------------------------------
    # Atributos
    # ------------------------------------------------------------------

    def _extract_attributes(self, class_elem: ET.Element) -> List[UMLAttribute]:
        """Extrae atributos de una clase."""
        attributes = []
        found_attrs: set = set()

        for child in class_elem:
            tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if tag_local in ['ownedAttribute', 'attribute']:
                attr = self._parse_attribute_element(child)
                if attr and attr.name not in found_attrs:
                    attributes.append(attr)
                    found_attrs.add(attr.name)

        return attributes

    def _parse_attribute_element(self, elem: ET.Element) -> Optional[UMLAttribute]:
        """Parsea un elemento de atributo."""
        name = elem.get('name')
        if not name:
            return None

        # Limpiar tipo embebido en el nombre: "idPoliza: Integer" → "idPoliza"
        if ':' in name:
            name = name.split(':')[0].strip()
        if not name:
            return None

        # Tipo del atributo: buscar en atributo directo primero
        attr_type = elem.get('type', '')

        # Luego en elemento hijo <type>
        if not attr_type:
            for child in elem:
                tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag_local == 'type':
                    href = child.get('href', '')
                    if href:
                        attr_type = href.split('#')[-1]
                    else:
                        attr_type = child.get('name', '')
                    break

        # Resolver ID interno al nombre real del tipo
        attr_type = self._resolve_type_id(attr_type)

        visibility_str = elem.get('visibility', 'private')
        visibility = self._parse_visibility(visibility_str)

        default_value = None
        for child in elem:
            tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if tag_local == 'defaultValue':
                default_value = child.get('value')
                break

        is_static = elem.get('isStatic') == 'true' or elem.get('is_static') == 'true'
        is_final = elem.get('isReadOnly') == 'true' or elem.get('is_final') == 'true'

        return UMLAttribute(
            name=name,
            type=attr_type,
            visibility=visibility,
            default_value=default_value,
            is_static=is_static,
            is_final=is_final,
        )

    # ------------------------------------------------------------------
    # Métodos
    # ------------------------------------------------------------------

    def _extract_methods(self, class_elem: ET.Element) -> List[UMLMethod]:
        """Extrae métodos de una clase."""
        methods = []
        found_methods: set = set()

        for child in class_elem:
            tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if tag_local in ['ownedOperation', 'operation']:
                method = self._parse_method_element(child)
                if method:
                    method_key = f"{method.name}_{len(method.parameters)}"
                    if method_key not in found_methods:
                        methods.append(method)
                        found_methods.add(method_key)

        return methods

    def _parse_method_element(self, elem: ET.Element) -> Optional[UMLMethod]:
        """Parsea un elemento de método/operación."""
        name = elem.get('name')
        if not name:
            return None

        return_type = "void"
        parameters = []

        for child in elem:
            tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if tag_local in ['ownedParameter', 'parameter']:
                param_name = child.get('name')
                param_type = self._resolve_type_id(child.get('type', ''))
                direction = child.get('direction', 'in')

                if direction == 'return':
                    return_type = param_type or 'void'
                elif param_name:
                    parameters.append({'name': param_name, 'type': param_type})

        # Fallback: buscar tipo de retorno en elemento <type> hijo
        if return_type == "void":
            for child in elem:
                tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag_local == 'type':
                    href = child.get('href', '')
                    if href:
                        return_type = href.split('#')[-1]
                    else:
                        return_type = child.get('name', 'void')
                    break

        visibility_str = elem.get('visibility', 'public')
        visibility = self._parse_visibility(visibility_str)

        is_static = elem.get('isStatic') == 'true' or elem.get('is_static') == 'true'
        is_abstract = elem.get('isAbstract') == 'true' or elem.get('is_abstract') == 'true'

        return UMLMethod(
            name=name,
            return_type=return_type,
            visibility=visibility,
            parameters=parameters,
            is_static=is_static,
            is_abstract=is_abstract,
        )

    # ------------------------------------------------------------------
    # Casos de uso
    # ------------------------------------------------------------------

    def _extract_use_cases_and_actors(
        self, root: ET.Element
    ):
        """Extrae actores y casos de uso usando tipos nativos y heurísticas.

        Retorna (actors, use_cases, excluded_ids) donde excluded_ids es el
        conjunto de xmi:id de los elementos ya clasificados como actor/CU,
        para que _extract_classes los omita.
        """
        actors: List[UMLActor] = []
        use_cases: List[UMLUseCase] = []
        excluded_ids: set = set()
        actor_names: set = set()
        usecase_names: set = set()

        for elem in root.iter():
            elem_type = elem.get(f'{self.ns_xmi}type', '') or elem.get('type', '')
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            elem_id = elem.get(f'{self.ns_xmi}id') or elem.get('id')
            name = elem.get('name', '').strip()

            if not name:
                continue

            is_actor = 'Actor' in elem_type or tag_local == 'Actor'
            is_usecase = 'UseCase' in elem_type or tag_local == 'UseCase'

            if not is_actor and not is_usecase:
                # Solo aplicar heurísticas a elementos de tipo clase
                is_class_elem = (
                    tag_local in ['Class', 'Interface']
                    or 'Class' in elem_type
                    or 'Interface' in elem_type
                )
                if not is_class_elem or name.lower() in PRIMITIVE_TYPES:
                    continue

                stereotype = elem.get('stereotype', '').lower()
                name_lower = name.lower()
                first_word = name_lower.split()[0] if name_lower.split() else name_lower

                if stereotype == 'actor' or first_word.startswith('actor'):
                    is_actor = True
                elif stereotype == 'usecase' or first_word in UC_VERBS:
                    is_usecase = True

            if is_actor and name not in actor_names:
                actors.append(UMLActor(name=name))
                actor_names.add(name)
                if elem_id:
                    excluded_ids.add(elem_id)
                    # Proxy UMLClass para resolución de relaciones
                    self.element_id_map[elem_id] = UMLClass(name=name)

            elif is_usecase and name not in usecase_names:
                use_cases.append(UMLUseCase(name=name))
                usecase_names.add(name)
                if elem_id:
                    excluded_ids.add(elem_id)
                    self.element_id_map[elem_id] = UMLClass(name=name)

        # Segunda pasada: muchas herramientas exportan actor y CU como uml:Class.
        # Si el nombre empieza con verbo de caso de uso → CU; si no → actor (p. ej. «Consultor»).
        for elem in root.iter():
            elem_type = elem.get(f'{self.ns_xmi}type', '') or elem.get('type', '')
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            elem_id = elem.get(f'{self.ns_xmi}id') or elem.get('id')
            name = elem.get('name', '').strip()
            if not name or name.lower() in PRIMITIVE_TYPES:
                continue
            is_class_elem = (
                tag_local in ['Class', 'Interface']
                or 'Class' in elem_type
                or 'Interface' in elem_type
            )
            if not is_class_elem:
                continue
            if name in actor_names or name in usecase_names:
                continue
            name_lower = name.lower()
            first_word = name_lower.split()[0] if name_lower.split() else name_lower
            if first_word in UC_VERBS:
                use_cases.append(UMLUseCase(name=name))
                usecase_names.add(name)
                if elem_id:
                    excluded_ids.add(elem_id)
                    self.element_id_map[elem_id] = UMLClass(name=name)
            else:
                actors.append(UMLActor(name=name))
                actor_names.add(name)
                if elem_id:
                    excluded_ids.add(elem_id)
                    self.element_id_map[elem_id] = UMLClass(name=name)

        return actors, use_cases, excluded_ids

    # ------------------------------------------------------------------
    # Secuencia
    # ------------------------------------------------------------------

    def _extract_interaction(self, root: ET.Element):
        """Extrae líneas de vida y mensajes de un diagrama de secuencia."""
        lifelines: List[UMLLifeline] = []
        messages: List[UMLMessage] = []
        found_lifeline_ids: set = set()

        for elem in root.iter():
            elem_type = elem.get(f'{self.ns_xmi}type', '') or elem.get('type', '')
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            tag_local = tag_local.split(':')[-1]

            if 'Interaction' not in elem_type and tag_local != 'Interaction':
                continue

            # Mapeo xmi:id de lifeline → nombre (para resolver eventos)
            lifeline_id_map: Dict[str, str] = {}

            for child in elem:
                child_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                child_tag = child_tag.split(':')[-1]
                if child_tag == 'lifeline':
                    ll_name = child.get('name', '').strip()
                    ll_id = child.get(f'{self.ns_xmi}id') or child.get('id', '')
                    represents = child.get('represents', '')
                    if ll_name:
                        lifelines.append(UMLLifeline(name=ll_name, represents=represents))
                        if ll_id:
                            lifeline_id_map[ll_id] = ll_name

            for order, child in enumerate(elem):
                child_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                child_tag = child_tag.split(':')[-1]
                if child_tag == 'message':
                    msg_name = child.get('name', '').strip()
                    send_event_id = child.get('sendEvent', '')
                    recv_event_id = child.get('receiveEvent', '')
                    msg_sort = child.get('messageSort', '')

                    source_ll = self._resolve_event_to_lifeline(
                        send_event_id, lifeline_id_map
                    )
                    target_ll = self._resolve_event_to_lifeline(
                        recv_event_id, lifeline_id_map
                    )

                    messages.append(UMLMessage(
                        name=msg_name,
                        source_lifeline=source_ll,
                        target_lifeline=target_ll,
                        message_sort=msg_sort,
                        sequence_order=order,
                    ))

        # Fallback para XMI 1.x de Visual Paradigm:
        # lifelines como UML:ClassifierRole y mensajes como UML:Message
        if self.xmi_source == 'visual_paradigm' and not lifelines and not messages:
            activation_to_lifeline: Dict[str, str] = {}

            for elem in root.iter():
                tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
                tag_local = tag_local.split(':')[-1]
                if tag_local != 'ClassifierRole':
                    continue

                ll_name = elem.get('name', '').strip()
                ll_id = elem.get(f'{self.ns_xmi}id') or elem.get('xmi.id') or elem.get('id', '')
                if ll_name:
                    lifelines.append(UMLLifeline(name=ll_name, represents=''))
                    if ll_id:
                        found_lifeline_ids.add(ll_id)

                # Activaciones anidadas en extensiones de VP: vpumlModel id="..."
                for nested in elem.iter():
                    nested_tag = nested.tag.split('}')[-1] if '}' in nested.tag else nested.tag
                    nested_tag = nested_tag.split(':')[-1]
                    if nested_tag != 'vpumlModel':
                        continue
                    if nested.get('modelType') != 'Activation':
                        continue
                    activation_id = nested.get('id', '').strip()
                    if activation_id and ll_name:
                        activation_to_lifeline[activation_id] = ll_name

            order_counter = 0
            for elem in root.iter():
                tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
                tag_local = tag_local.split(':')[-1]
                if tag_local != 'Message':
                    continue

                msg_name = elem.get('name', '').strip()
                sender_id = elem.get('sender', '')
                receiver_id = elem.get('receiver', '')

                source_ll = sender_id
                target_ll = receiver_id
                if sender_id in found_lifeline_ids:
                    source_ll = next((l.name for l in lifelines if l.name and sender_id == (self.all_elements_by_id.get(sender_id, {}).get(f'{self.ns_xmi}id') if isinstance(self.all_elements_by_id.get(sender_id), dict) else sender_id)), source_ll)
                if receiver_id in found_lifeline_ids:
                    target_ll = next((l.name for l in lifelines if l.name and receiver_id == (self.all_elements_by_id.get(receiver_id, {}).get(f'{self.ns_xmi}id') if isinstance(self.all_elements_by_id.get(receiver_id), dict) else receiver_id)), target_ll)

                # Resolver IDs a nombre de lifeline de manera directa
                if sender_id and sender_id in found_lifeline_ids:
                    sender_elem = self.all_elements_by_id.get(sender_id)
                    if sender_elem is not None:
                        source_ll = sender_elem.get('name', source_ll)
                if receiver_id and receiver_id in found_lifeline_ids:
                    receiver_elem = self.all_elements_by_id.get(receiver_id)
                    if receiver_elem is not None:
                        target_ll = receiver_elem.get('name', target_ll)

                # Resolver por activación usando extensión VP (from/to)
                msg_sort = 'synchCall'
                number_value = ''
                for nested in elem.iter():
                    nested_tag = nested.tag.split('}')[-1] if '}' in nested.tag else nested.tag
                    nested_tag = nested_tag.split(':')[-1]
                    if nested_tag == 'asynchronous':
                        if nested.get(f'{self.ns_xmi}value', '') == 'true' or nested.get('xmi.value', '') == 'true':
                            msg_sort = 'asynchCall'
                    elif nested_tag == 'number':
                        number_value = nested.get(f'{self.ns_xmi}value', '') or nested.get('xmi.value', '')
                    elif nested_tag == 'from':
                        from_id = nested.get(f'{self.ns_xmi}value', '') or nested.get('xmi.value', '')
                        if from_id in activation_to_lifeline:
                            source_ll = activation_to_lifeline[from_id]
                    elif nested_tag == 'to':
                        to_id = nested.get(f'{self.ns_xmi}value', '') or nested.get('xmi.value', '')
                        if to_id in activation_to_lifeline:
                            target_ll = activation_to_lifeline[to_id]

                sequence_order = order_counter
                order_counter += 1
                if number_value:
                    seq_digits = re.sub(r'[^0-9.]', '', number_value)
                    if seq_digits:
                        sequence_order = len(messages)

                messages.append(UMLMessage(
                    name=msg_name,
                    source_lifeline=source_ll,
                    target_lifeline=target_ll,
                    message_sort=msg_sort,
                    sequence_order=sequence_order,
                ))

        return lifelines, messages

    def _resolve_event_to_lifeline(
        self, event_id: str, lifeline_id_map: Dict[str, str]
    ) -> str:
        """Resuelve un ID de evento a un nombre de línea de vida."""
        if not event_id:
            return ''
        if event_id in lifeline_id_map:
            return lifeline_id_map[event_id]
        # El evento es un MessageOccurrenceSpecification; buscar su lifeline
        event_elem = self.all_elements_by_id.get(event_id)
        if event_elem is not None:
            covered_id = event_elem.get('covered', '')
            if covered_id and covered_id in lifeline_id_map:
                return lifeline_id_map[covered_id]
        return event_id

    # ------------------------------------------------------------------
    # Relaciones
    # ------------------------------------------------------------------

    def _extract_relationships(
        self,
        root: ET.Element,
        classes: List[UMLClass],
        actors: list = None,
        use_cases: list = None,
    ) -> List[UMLRelationship]:
        """Extrae relaciones entre clases, actores y casos de uso."""
        relationships = []
        # Nombres válidos para los extremos de las relaciones
        valid_names = {cls.name for cls in classes}
        if actors:
            valid_names.update(a.name for a in actors)
        if use_cases:
            valid_names.update(uc.name for uc in use_cases)

        id_to_name = {eid: cls.name for eid, cls in self.element_id_map.items()}
        found_rels: set = set()

        parent_map = {c: p for p in root.iter() for c in p}

        for elem in root.iter():
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            elem_type = elem.get(f'{self.ns_xmi}type', '')

            rel = None

            # Herencia
            if tag_local == 'generalization':
                specific_id = elem.get('specific', '')
                if not specific_id:
                    parent = parent_map.get(elem)
                    if parent is not None:
                        specific_id = parent.get(f'{self.ns_xmi}id') or parent.get('id', '')

                rel = self._make_rel(
                    specific_id, elem.get('general', ''),
                    RelationshipType.INHERITANCE, elem.get('name'),
                    id_to_name, valid_names,
                )

            # Dependencia
            elif tag_local == 'dependency' or elem_type == 'uml:Dependency':
                rel = self._make_rel(
                    elem.get('client', ''), elem.get('supplier', ''),
                    RelationshipType.DEPENDENCY, elem.get('name'),
                    id_to_name, valid_names,
                )

            # Realización / implementación
            elif tag_local in ('realization', 'interfaceRealization') or \
                    elem_type in ('uml:Realization', 'uml:InterfaceRealization'):
                src_id = elem.get('implementingClassifier', '') or elem.get('client', '')
                tgt_id = elem.get('contract', '') or elem.get('supplier', '')
                rel = self._make_rel(
                    src_id, tgt_id,
                    RelationshipType.IMPLEMENTATION, elem.get('name'),
                    id_to_name, valid_names,
                )

            # Include (casos de uso) — varias variantes de namespace/tipo
            elif (tag_local or '').lower() == 'include' or 'Include' in (elem_type or ''):
                including_id = elem.get('includingCase', '')
                if not including_id:
                    parent = parent_map.get(elem)
                    if parent is not None:
                        including_id = parent.get(f'{self.ns_xmi}id') or parent.get('id', '')
                addition_id = elem.get('addition', '')
                rel = self._make_rel(
                    including_id, addition_id,
                    RelationshipType.INCLUDE, elem.get('name'),
                    id_to_name, valid_names,
                )

            # Extend (casos de uso)
            elif (tag_local or '').lower() == 'extend' or 'Extend' in (elem_type or ''):
                extended_id = elem.get('extendedCase', '')
                extension_id = elem.get('extension', '')
                if not extension_id:
                    parent = parent_map.get(elem)
                    if parent is not None:
                        extension_id = parent.get(f'{self.ns_xmi}id') or parent.get('id', '')
                rel = self._make_rel(
                    extension_id, extended_id,
                    RelationshipType.EXTEND, elem.get('name'),
                    id_to_name, valid_names,
                )

            # Asociaciones (cubre uml:Association de Astah/Eclipse)
            elif 'Association' in elem_type or tag_local == 'association' or tag_local == 'associationClass':
                if 'AssociationClass' in elem_type or tag_local == 'associationClass':
                    rel_type = RelationshipType.ASSOCIATION_CLASS
                elif 'Composition' in elem_type:
                    rel_type = RelationshipType.COMPOSITION
                elif 'Aggregation' in elem_type:
                    rel_type = RelationshipType.AGGREGATION
                else:
                    rel_type = RelationshipType.ASSOCIATION
                rel = self._parse_association_element(
                    elem, rel_type, id_to_name, valid_names
                )

            if rel:
                rel_key = f"{rel.source}_{rel.target}_{rel.relationship_type.value}"
                if rel_key not in found_rels:
                    relationships.append(rel)
                    found_rels.add(rel_key)

        return relationships

    def _parse_association_element(
        self, elem: ET.Element, rel_type: RelationshipType,
        id_to_name: Dict[str, str], valid_names: set,
    ) -> Optional[UMLRelationship]:
        """Parsea una asociacion con soporte multi-formato, cardinalidad y direccion."""
        source_name = None
        target_name = None
        source_mult = None
        target_mult = None
        determined_rel_type = rel_type

        # Estrategia 1: ownedEnd con atributo type (Eclipse/StarUML)
        owned_ends = []
        for child in elem:
            tag_local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if tag_local == 'ownedEnd':
                type_ref = child.get('type', '')
                resolved_name = id_to_name.get(type_ref, type_ref) if type_ref else None

                # Extraer cardinalidad de <lowerValue> y <upperValue>
                lower = None
                upper = None
                for gc in child:
                    gc_tag = gc.tag.split('}')[-1] if '}' in gc.tag else gc.tag
                    if gc_tag == 'lowerValue':
                        lower = gc.get('value')
                    elif gc_tag == 'upperValue':
                        upper = gc.get('value')
                multiplicity = self._format_multiplicity(lower, upper)

                # Detectar aggregation en el ownedEnd
                agg = child.get('aggregation', '')
                if agg == 'composite':
                    determined_rel_type = RelationshipType.COMPOSITION
                elif agg == 'shared':
                    determined_rel_type = RelationshipType.AGGREGATION

                # Detectar navigability
                is_navigable = child.get('isNavigable', 'true')
                owned_ends.append({
                    'name': resolved_name,
                    'type_ref': type_ref,
                    'multiplicity': multiplicity,
                    'is_navigable': is_navigable != 'false',
                    'aggregation': agg,
                })

        if len(owned_ends) >= 2:
            nav_ends = [e for e in owned_ends if e['is_navigable']]
            non_nav_ends = [e for e in owned_ends if not e['is_navigable']]

            if non_nav_ends and nav_ends:
                source_name = non_nav_ends[0]['name']
                target_name = nav_ends[0]['name']
                source_mult = non_nav_ends[0]['multiplicity']
                target_mult = nav_ends[0]['multiplicity']
            elif len(owned_ends) >= 2:
                # Ambos navegables: usar cardinalidad para inferir dirección
                # En UML la flecha va del lado "uno" al lado "muchos"
                # source = lado con menor cardinalidad, target = lado con mayor cardinalidad
                def cardinality_weight(mult):
                    if mult is None:
                        return 0
                    if '*' in mult:
                        if mult.startswith('0'):
                            return 3  # 0..*
                        return 2  # 1..*
                    try:
                        val = int(mult)
                        return val  # 1, 2, etc.
                    except ValueError:
                        return 1

                w0 = cardinality_weight(owned_ends[0]['multiplicity'])
                w1 = cardinality_weight(owned_ends[1]['multiplicity'])

                if w0 < w1:
                    # End 0 tiene menor cardinalidad → source
                    source_name = owned_ends[0]['name']
                    target_name = owned_ends[1]['name']
                    source_mult = owned_ends[0]['multiplicity']
                    target_mult = owned_ends[1]['multiplicity']
                elif w1 < w0:
                    # End 1 tiene menor cardinalidad → source
                    source_name = owned_ends[1]['name']
                    target_name = owned_ends[0]['name']
                    source_mult = owned_ends[1]['multiplicity']
                    target_mult = owned_ends[0]['multiplicity']
                else:
                    # Misma cardinalidad: usar orden XML
                    source_name = owned_ends[0]['name']
                    target_name = owned_ends[1]['name']
                    source_mult = owned_ends[0]['multiplicity']
                    target_mult = owned_ends[1]['multiplicity']

        # Estrategia 2: memberEnd + resolución de extremos por owner/type (Astah/StarUML/VP)
        if not source_name or not target_name:
            member_end = elem.get('memberEnd', '')
            if member_end:
                ends = member_end.split()
                if len(ends) >= 2:
                    # En XMI de asociaciones, la multiplicidad guardada en un end
                    # suele describir el extremo opuesto. Soporta:
                    # - ownedAttribute dueño de clase (owner conocido)
                    # - ownedEnd dentro de la asociación (owner no mapeado)
                    end_data = []
                    for end_id in ends[:2]:
                        end_elem = self.all_elements_by_id.get(end_id)
                        owner = self.property_owner_map.get(end_id, '')
                        type_ref = ''
                        lower = None
                        upper = None
                        if end_elem:
                            type_ref = end_elem.get('type', '')
                            for gc in end_elem:
                                gc_tag = gc.tag.split('}')[-1] if '}' in gc.tag else gc.tag
                                if gc_tag == 'lowerValue':
                                    lower = gc.get('value')
                                elif gc_tag == 'upperValue':
                                    upper = gc.get('value')
                        if not owner and type_ref:
                            owner = id_to_name.get(type_ref, type_ref)
                        mult = self._format_multiplicity(lower, upper)
                        end_data.append({'owner': owner, 'mult': mult, 'type_ref': type_ref})

                    if len(end_data) >= 2:
                        # La cardinalidad en end[i] es la mult del OTRO extremo
                        # mult at end_data[0].owner end = end_data[1].mult
                        # mult at end_data[1].owner end = end_data[0].mult
                        mult_at_0 = end_data[1]['mult']  # mult at owner of end[0]
                        mult_at_1 = end_data[0]['mult']  # mult at owner of end[1]

                        def cardinality_weight(mult):
                            if mult is None:
                                return 0
                            if '*' in mult:
                                if mult.startswith('0'):
                                    return 3
                                return 2
                            try:
                                return int(mult)
                            except ValueError:
                                return 1

                        w0 = cardinality_weight(mult_at_0)
                        w1 = cardinality_weight(mult_at_1)

                        if w0 < w1:
                            source_name = end_data[0]['owner']
                            target_name = end_data[1]['owner']
                            source_mult = mult_at_0
                            target_mult = mult_at_1
                        elif w1 < w0:
                            source_name = end_data[1]['owner']
                            target_name = end_data[0]['owner']
                            source_mult = mult_at_1
                            target_mult = mult_at_0
                        else:
                            source_name = end_data[0]['owner']
                            target_name = end_data[1]['owner']
                            source_mult = mult_at_0
                            target_mult = mult_at_1

        # Estrategia 2b (Visual Paradigm): fallback explícito cuando owner quedó vacío.
        if (not source_name or not target_name) and self.xmi_source == 'visual_paradigm':
            member_end = elem.get('memberEnd', '')
            if member_end:
                ends = member_end.split()
                end_data = []
                for end_id in ends[:2]:
                    end_elem = self.all_elements_by_id.get(end_id)
                    if end_elem is None:
                        continue
                    type_ref = end_elem.get('type', '')
                    end_name = id_to_name.get(type_ref, type_ref)
                    lower = None
                    upper = None
                    for gc in end_elem:
                        gc_tag = gc.tag.split('}')[-1] if '}' in gc.tag else gc.tag
                        if gc_tag == 'lowerValue':
                            lower = gc.get('value')
                        elif gc_tag == 'upperValue':
                            upper = gc.get('value')
                    end_data.append({'name': end_name, 'mult': self._format_multiplicity(lower, upper)})

                if len(end_data) >= 2:
                    # Igual que en Astah: la multiplicidad de un end aplica al extremo opuesto.
                    source_name = end_data[0]['name']
                    target_name = end_data[1]['name']
                    source_mult = end_data[1]['mult']
                    target_mult = end_data[0]['mult']

        # Estrategia 3: atributos source/target directos
        if not source_name or not target_name:
            src_id = elem.get('source', '')
            tgt_id = elem.get('target', '')
            if src_id and tgt_id:
                source_name = id_to_name.get(src_id, src_id)
                target_name = id_to_name.get(tgt_id, tgt_id)

        if (
            source_name and target_name
            and source_name in valid_names
            and target_name in valid_names
            and source_name != target_name
        ):
            return UMLRelationship(
                source=source_name,
                target=target_name,
                relationship_type=determined_rel_type,
                name=elem.get('name'),
                source_multiplicity=source_mult,
                target_multiplicity=target_mult,
            )
        return None

    def _format_multiplicity(self, lower, upper):
        """Formatea los valores lower/upper en notacion de multiplicidad UML."""
        if lower is None and upper is None:
            return None
        if lower == upper:
            return lower
        if lower is None:
            return upper
        if upper is None:
            return lower
        return f'{lower}..{upper}'

    def _make_rel(
        self, src_id: str, tgt_id: str,
        rel_type: RelationshipType, name: Optional[str],
        id_to_name: Dict[str, str], valid_names: set,
    ) -> Optional[UMLRelationship]:
        """Crea una UMLRelationship si ambos extremos son elementos conocidos."""
        src_name = id_to_name.get(src_id, src_id)
        tgt_name = id_to_name.get(tgt_id, tgt_id)
        if src_name in valid_names and tgt_name in valid_names and src_name != tgt_name:
            return UMLRelationship(
                source=src_name,
                target=tgt_name,
                relationship_type=rel_type,
                name=name,
            )
        return None

    # ------------------------------------------------------------------
    # Paquetes
    # ------------------------------------------------------------------

    def _extract_packages(self, root: ET.Element) -> List[str]:
        """Extrae nombres de paquetes."""
        packages = []
        for elem in root.iter():
            tag_local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            if tag_local == 'Package':
                name = elem.get('name')
                if name:
                    packages.append(name)
        return packages

    # ------------------------------------------------------------------
    # Utilidades
    # ------------------------------------------------------------------

    def _resolve_type_id(self, type_str: str) -> str:
        """Resuelve un ID interno de tipo al nombre legible.

        Usa all_elements_by_id (disponible desde el inicio del parseo) para
        que la resolución funcione aunque la clase aún no esté en element_id_map.
        """
        if not type_str:
            return type_str
        # Si está en el mapa de UMLClass (ya procesado)
        if type_str in self.element_id_map:
            return self.element_id_map[type_str].name
        # Si está en el mapa de elementos crudos (todavía no procesado como clase)
        if type_str in self.all_elements_by_id:
            resolved = self.all_elements_by_id[type_str].get('name', '')
            if resolved:
                return resolved
        return type_str

    def _parse_visibility(self, visibility_str: str) -> Visibility:
        """Convierte string de visibilidad a enum."""
        visibility_map = {
            'public': Visibility.PUBLIC,
            'private': Visibility.PRIVATE,
            'protected': Visibility.PROTECTED,
            'package': Visibility.PACKAGE,
            '+': Visibility.PUBLIC,
            '-': Visibility.PRIVATE,
            '#': Visibility.PROTECTED,
            '~': Visibility.PACKAGE,
        }
        return visibility_map.get(visibility_str.lower(), Visibility.PRIVATE)


def parse_xmi_file(file_path: str, xmi_source: str = 'astah') -> UMLDiagram:
    """Función de conveniencia para parsear un archivo XMI."""
    parser = XMIParser(xmi_source=xmi_source)
    return parser.parse_file(file_path)


def parse_xmi_string(xml_content: str, xmi_source: str = 'astah') -> UMLDiagram:
    """Función de conveniencia para parsear un string XMI."""
    parser = XMIParser(xmi_source=xmi_source)
    return parser.parse_string(xml_content)
