# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Parser de XMI 1.1 de Astah/JUDE, con varios diagramas en un mismo archivo.

Es el que usa el flujo del docente: resuelve las clases realmente dibujadas,
las clases de asociación y la multiplicidad de cada extremo.
"""

import xml.etree.ElementTree as ET
from typing import Optional, Dict, List

from app.models.uml_elements import (
    UMLDiagram, UMLClass, UMLAttribute, UMLMethod,
    UMLRelationship, Visibility, RelationshipType,
    UMLActor, UMLUseCase, UMLLifeline, UMLMessage,
)

from app.parsers.xmi_common import (
    PRIMITIVE_TYPES, is_placeholder_class_name, decode_xmi_name,
)


class XMIParserV11:
    """Parser para archivos XMI 1.1 de Astah/JUDE con múltiples diagramas."""

    NAMESPACES = {
        'jude': 'http://objectclub.esm.co.jp/Jude/namespace/',
        'uml': 'org.omg.xmi.namespace.UML',
    }

    def __init__(self):
        self.all_elements_by_id: Dict[str, ET.Element] = {}
        self.id_to_name: Dict[str, str] = {}

    def _xmi_attr(self, elem, attr_name, default=''):
        """Lee un atributo XMI 1.1, probando xmi.{name} y luego {name}."""
        val = elem.get(f'xmi.{attr_name}')
        if val is not None:
            return val
        return elem.get(attr_name, default)

    def _local_tag(self, elem) -> str:
        """Extrae el nombre local del tag, quitando namespace {} y prefijos UML:"""
        tag = elem.tag if hasattr(elem, 'tag') else str(elem)
        if '}' in tag:
            tag = tag.split('}')[-1]
        if ':' in tag:
            tag = tag.split(':')[-1]
        return tag

    def parse_file_multi(self, file_path: str) -> Dict[str, UMLDiagram]:
        tree = ET.parse(file_path)
        root = tree.getroot()
        return self._parse_root_multi(root)

    def parse_string_multi(self, xml_content: str) -> Dict[str, UMLDiagram]:
        root = ET.fromstring(xml_content)
        return self._parse_root_multi(root)

    def _parse_root_multi(self, root: ET.Element) -> Dict[str, UMLDiagram]:
        self._build_id_maps(root)
        detected_types = self._detect_diagram_types(root)
        diagrams: Dict[str, UMLDiagram] = {}

        for diagram_type in detected_types:
            if diagram_type == 'class':
                diagrams['class'] = self._extract_class_diagram(root)
            elif diagram_type == 'usecase':
                diagrams['usecase'] = self._extract_usecase_diagram(root)
            elif diagram_type == 'sequence':
                diagrams['sequence'] = self._extract_sequence_diagram(root)

        return diagrams

    def _build_id_maps(self, root: ET.Element):
        for elem in root.iter():
            elem_id = self._xmi_attr(elem, 'id')
            if elem_id:
                self.all_elements_by_id[elem_id] = elem
                name = self._decode_name(elem.get('name', ''))
                if name:
                    self.id_to_name[elem_id] = name

    def _build_parent_map(self, root: ET.Element) -> Dict[ET.Element, ET.Element]:
        parent_map: Dict[ET.Element, ET.Element] = {}
        for parent in root.iter():
            for child in parent:
                parent_map[child] = parent
        return parent_map

    def _drawn_classifier_ids(self, root: ET.Element) -> set:
        """IDs de los clasificadores que estan DIBUJADOS en algun diagrama.

        Astah embebe todo el JDK (java.lang, java.util) como <UML:Class> en el
        archivo, y ademas deja clases sueltas que el estudiante creo y borro del
        lienzo. Nada de eso se ve en el diagrama, y el docente cuenta lo que ve.
        Un <JUDE:ClassifierPresentation> por clase dibujada apunta a su clase
        via UPresentation.semanticModel; ese es el conjunto real.
        """
        drawn: set = set()
        for elem in root.iter():
            if self._local_tag(elem) != 'ClassifierPresentation':
                continue
            for child in elem.iter():
                if self._local_tag(child) != 'UPresentation.semanticModel':
                    continue
                for subject in child:
                    ref = self._xmi_attr(subject, 'idref')
                    if ref:
                        drawn.add(ref)
        return drawn

    def _is_java_boilerplate_element(self, elem: ET.Element, parent_map: Dict[ET.Element, ET.Element]) -> bool:
        """True si el elemento vive bajo paquetes java/javax embebidos por Astah."""
        java_packages = {'java', 'javax', 'lang', 'util'}
        current: Optional[ET.Element] = elem
        while current is not None:
            if self._local_tag(current) == 'Package':
                pkg_name = self._decode_name(current.get('name', '')).lower()
                if pkg_name in java_packages:
                    return True
            current = parent_map.get(current)
        return False

    def _get_usecase_diagram_scope_ids(self, root: ET.Element) -> set:
        """IDs semánticos (Actor/UseCase) presentes en diagramas JUDE de casos de uso."""
        scoped: set = set()
        for elem in root.iter():
            if self._local_tag(elem) != 'Diagram':
                continue
            type_info = (elem.get('typeInfo') or elem.get('typeinfo') or '').lower()
            if 'usecase' not in type_info.replace(' ', ''):
                continue
            for node in elem.iter():
                if self._local_tag(node) not in ('Actor', 'UseCase', 'Classifier'):
                    continue
                ref = self._xmi_attr(node, 'idref')
                if ref:
                    scoped.add(ref)
        return scoped

    def _count_domain_classes(self, root: ET.Element) -> int:
        parent_map = self._build_parent_map(root)
        drawn_ids = self._drawn_classifier_ids(root)
        count = 0
        for elem in root.iter():
            if self._local_tag(elem) not in ('Class',):
                continue
            name = self._decode_name(elem.get('name', ''))
            if not name or name.lower() in PRIMITIVE_TYPES:
                continue
            if is_placeholder_class_name(name):
                continue
            if drawn_ids:
                if self._xmi_attr(elem, 'id') not in drawn_ids:
                    continue
            elif self._is_java_boilerplate_element(elem, parent_map):
                continue
            count += 1
        return count

    def _detect_diagram_types(self, root: ET.Element) -> List[str]:
        """Detecta qué tipos de diagramas existen en el archivo XMI 1.1."""
        types = set()
        has_use_cases = False

        for elem in root.iter():
            local = self._local_tag(elem)
            if local in ('Class', 'Interface'):
                types.add('class')
            if local == 'UseCase':
                has_use_cases = True

        # Solo marcar 'usecase' si hay al menos un UseCase real.
        # Un Actor solo puede ser participante de un diagrama de secuencia
        # (Astah lo exporta como UML:Actor aunque no haya diagrama de CU).
        if has_use_cases:
            types.add('usecase')
            # Astah embebe java.* en el mismo XMI; no tratarlo como diagrama de clases.
            if self._count_domain_classes(root) == 0 and 'class' in types:
                types.discard('class')

        # Detección primaria: tag JUDE:SequenceDiagram en la sección de extension
        has_jude_sequence = False
        for elem in root.iter():
            if self._local_tag(elem) == 'SequenceDiagram':
                has_jude_sequence = True
                break

        # Detección secundaria: Collaboration bajo UML:Namespace.collaboration
        collaboration_found = False
        for elem in root.iter():
            if self._local_tag(elem) == 'Collaboration':
                collaboration_found = True
                break

        if collaboration_found or has_jude_sequence:
            has_messages = False
            for elem in root.iter():
                if self._local_tag(elem) == 'Message':
                    has_messages = True
                    break
            if has_messages or has_jude_sequence:
                types.add('sequence')

        # Si hay SequenceDiagram pero no hay clases de dominio, las UML:Class
        # suelen ser boilerplate Java (java.lang, java.util) que Astah embebe.
        # Si hay clases de dominio reales (p. ej. Class Diagram + Sequence en el
        # mismo XMI), conservar 'class'.
        if has_jude_sequence and self._count_domain_classes(root) == 0:
            types.discard('class')

        if not types:
            types.add('class')

        return sorted(list(types))

    def _extract_class_diagram(self, root: ET.Element) -> UMLDiagram:
        """Extrae el diagrama de clases del XMI 1.1."""
        diagram = UMLDiagram(name='Class Diagram', diagram_type='class')
        class_map: Dict[str, UMLClass] = {}
        classes_by_name: Dict[str, UMLClass] = {}
        parent_map = self._build_parent_map(root)
        drawn_ids = self._drawn_classifier_ids(root)

        for elem in root.iter():
            if self._local_tag(elem) not in ('Class',):
                continue

            name = self._decode_name(elem.get('name', ''))
            if not name or name.lower() in PRIMITIVE_TYPES:
                continue
            if is_placeholder_class_name(name):
                continue

            elem_id = self._xmi_attr(elem, 'id')
            if drawn_ids:
                # el archivo trae informacion de diagrama: vale lo dibujado
                if elem_id not in drawn_ids:
                    continue
            elif self._is_java_boilerplate_element(elem, parent_map):
                continue
            name_key = name.lower()
            uml_class = classes_by_name.get(name_key)
            if uml_class is None:
                uml_class = UMLClass(name=name, is_abstract=False, is_interface=False)
                classes_by_name[name_key] = uml_class
                diagram.classes.append(uml_class)
            elif name != name.lower() and uml_class.name == uml_class.name.lower():
                uml_class.name = name

            seen_attrs = {a.name.lower() for a in uml_class.attributes}
            seen_methods = {m.name.lower() for m in uml_class.methods}

            for child in elem:
                child_local = self._local_tag(child)
                if child_local.endswith('feature') or child_local == 'Feature':
                    for feat in child:
                        feat_local = self._local_tag(feat)
                        if feat_local == 'Attribute':
                            attr_name = self._decode_name(feat.get('name', '')).strip()
                            if not attr_name or attr_name.lower() in seen_attrs:
                                continue
                            attr_type = self._astah_attribute_type(feat)
                            uml_class.attributes.append(UMLAttribute(
                                name=attr_name,
                                type=attr_type,
                                visibility=Visibility.PRIVATE
                            ))
                            seen_attrs.add(attr_name.lower())
                        elif feat_local == 'Operation':
                            op_name = self._decode_name(feat.get('name', '')).strip()
                            if not op_name or op_name.lower() in seen_methods:
                                continue
                            return_type = 'void'
                            for param in feat:
                                param_local = self._local_tag(param)
                                if param_local.endswith('parameter'):
                                    p_kind = param.get('kind', '')
                                    if p_kind == 'return':
                                        for p_type in param:
                                            pt_local = self._local_tag(p_type)
                                            if pt_local == 'type':
                                                href = p_type.get('href', '')
                                                if href:
                                                    return_type = href.split('#')[-1]
                                                else:
                                                    type_ref = (
                                                        self._xmi_attr(p_type, 'idref')
                                                        or p_type.get('name', '')
                                                    )
                                                    return_type = self._resolve_type(type_ref) or 'void'
                            uml_class.methods.append(UMLMethod(
                                name=op_name,
                                return_type=return_type,
                                visibility=Visibility.PUBLIC
                            ))
                            seen_methods.add(op_name.lower())

            if elem_id:
                class_map[elem_id] = uml_class
                self.id_to_name[elem_id] = uml_class.name

        for elem in root.iter():
            if self._local_tag(elem) != 'AssociationClass':
                continue
            name = self._decode_name(elem.get('name', ''))
            elem_id = self._xmi_attr(elem, 'id')
            if name and elem_id:
                # fuera de diagram.classes a proposito: el docente puntua las
                # clases de asociacion en su propio criterio, no en "Clases".
                self.id_to_name[elem_id] = name

        diagram.relationships = self._extract_relationships_v11(root, class_map, [], [])
        diagram.packages = self._extract_packages_v11(root)
        return diagram

    def _astah_attribute_type(self, attr_elem: ET.Element) -> str:
        """Resuelve el tipo de un Attribute Astah (attr type= o StructuralFeature.type)."""
        type_ref = attr_elem.get('type', '')
        if type_ref:
            return self._resolve_type(type_ref)

        for child in attr_elem.iter():
            cl = self._local_tag(child)
            if cl == 'Classifier' or cl.endswith('Classifier'):
                ref = self._xmi_attr(child, 'idref')
                if ref:
                    return self._resolve_type(ref)
            if cl == 'DataType' or cl.endswith('DataType'):
                ref = self._xmi_attr(child, 'idref') or child.get('name', '')
                if ref:
                    return self._resolve_type(ref) if self._xmi_attr(child, 'idref') else ref
            if cl == 'type':
                href = child.get('href', '')
                if href:
                    return href.split('#')[-1]
                ref = self._xmi_attr(child, 'idref') or child.get('name', '')
                if ref:
                    return self._resolve_type(ref) if self._xmi_attr(child, 'idref') else ref
        return ''

    def _extract_usecase_diagram(self, root: ET.Element) -> UMLDiagram:
        """Extrae el diagrama de casos de uso del XMI 1.1."""
        diagram = UMLDiagram(name='UseCase Diagram', diagram_type='usecase')
        actors: List[UMLActor] = []
        use_cases: List[UMLUseCase] = []
        actor_ids: set = set()
        scope_ids = self._get_usecase_diagram_scope_ids(root)

        for elem in root.iter():
            local = self._local_tag(elem)
            name = self._decode_name(elem.get('name', ''))
            elem_id = self._xmi_attr(elem, 'id')

            if scope_ids and elem_id and elem_id not in scope_ids:
                continue

            if local == 'Actor' and name and elem_id not in actor_ids:
                actors.append(UMLActor(name=name))
                actor_ids.add(elem_id)
                if elem_id:
                    self.id_to_name[elem_id] = name

            if local == 'UseCase' and name:
                use_cases.append(UMLUseCase(name=name))
                if elem_id:
                    self.id_to_name[elem_id] = name

        diagram.actors = actors
        diagram.use_cases = use_cases

        actor_names = {a.name for a in actors}
        uc_names = {uc.name for uc in use_cases}
        valid_names = actor_names | uc_names

        relationships = []
        # Mapa Extend.id → UseCase.id dueño (quien declara UseCase.extend).
        # En Astah el dueño es la extensión, aunque Extension.base/extension vengan cruzados.
        extend_owner_by_id: Dict[str, str] = {}
        for elem in root.iter():
            if self._local_tag(elem) != 'UseCase':
                continue
            uc_id = self._xmi_attr(elem, 'id')
            if not uc_id:
                continue
            for child in elem:
                if not self._local_tag(child).endswith('extend'):
                    continue
                # UseCase.extend puede envolver Extend xmi.idref o contener el Extend.
                for ref in child.iter():
                    if self._local_tag(ref) != 'Extend':
                        continue
                    ext_id = self._xmi_attr(ref, 'idref') or self._xmi_attr(ref, 'id')
                    if ext_id:
                        extend_owner_by_id[ext_id] = uc_id

        for elem in root.iter():
            local = self._local_tag(elem)

            if local == 'Association':
                source_name, target_name, _, _, _, _ = self._extract_association_ends_v11(elem)
                if not source_name or not target_name:
                    continue
                if source_name not in valid_names or target_name not in valid_names:
                    continue
                relationships.append(UMLRelationship(
                    source=source_name,
                    target=target_name,
                    relationship_type=RelationshipType.ASSOCIATION
                ))

            elif local == 'Include':
                base_id = None
                addition_id = None
                for child in elem:
                    cl = self._local_tag(child)
                    if cl.endswith('base'):
                        for ref in child:
                            if self._local_tag(ref) == 'UseCase':
                                base_id = self._xmi_attr(ref, 'idref')
                    elif cl.endswith('addition'):
                        for ref in child:
                            if self._local_tag(ref) == 'UseCase':
                                addition_id = self._xmi_attr(ref, 'idref')
                base_name = self.id_to_name.get(base_id, '')
                addition_name = self.id_to_name.get(addition_id, '')
                if base_name in valid_names and addition_name in valid_names:
                    relationships.append(UMLRelationship(
                        source=base_name,
                        target=addition_name,
                        relationship_type=RelationshipType.INCLUDE
                    ))

            elif local == 'Extend':
                tagged_base_id = None
                tagged_ext_id = None
                extend_id = self._xmi_attr(elem, 'id')
                for child in elem:
                    cl = self._local_tag(child)
                    if cl.endswith('extension'):
                        for ref in child:
                            if self._local_tag(ref) == 'UseCase':
                                tagged_ext_id = self._xmi_attr(ref, 'idref')
                    elif cl.endswith('base'):
                        for ref in child:
                            if self._local_tag(ref) == 'UseCase':
                                tagged_base_id = self._xmi_attr(ref, 'idref')

                owner_id = extend_owner_by_id.get(extend_id, '') if extend_id else ''
                # Dueño UseCase.extend = extensión; el otro extremo etiquetado = base.
                if owner_id:
                    extension_id = owner_id
                    if tagged_base_id and tagged_base_id != owner_id:
                        base_id = tagged_base_id
                    elif tagged_ext_id and tagged_ext_id != owner_id:
                        base_id = tagged_ext_id
                    else:
                        base_id = tagged_base_id
                else:
                    extension_id = tagged_ext_id
                    base_id = tagged_base_id

                base_name = self.id_to_name.get(base_id or '', '')
                extension_name = self.id_to_name.get(extension_id or '', '')
                if base_name in valid_names and extension_name in valid_names:
                    relationships.append(UMLRelationship(
                        source=extension_name,
                        target=base_name,
                        relationship_type=RelationshipType.EXTEND
                    ))

        diagram.relationships = relationships
        return diagram

    def _extract_sequence_diagram(self, root: ET.Element) -> UMLDiagram:
        """Extrae el diagrama de secuencia del XMI 1.1 (formato Astah/JUDE).

        En Astah XMI 1.1:
        - UML:Collaboration está bajo UML:Namespace.collaboration (no ownedElement).
        - UML:ClassifierRole tiene name="" — el nombre real está en
          ClassifierRole.base → Classifier xmi.idref → nombre de la clase del dominio.
        - Los mensajes están en Collaboration.interaction → Interaction → Interaction.message.
        - Los nombres de mensajes usan URL-form encoding ('+' = espacio).
        """
        diagram = UMLDiagram(name='Sequence Diagram', diagram_type='sequence')
        lifelines: List[UMLLifeline] = []
        messages: List[UMLMessage] = []

        # Paso 1: Construir mapa role_id → nombre_lifeline resolviendo ClassifierRole.base.
        # En Astah, ClassifierRole.name siempre está vacío; el nombre viene de
        # la clase base a la que apunta ClassifierRole.base > Classifier xmi.idref.
        role_id_to_name: Dict[str, str] = {}
        seen_lifeline_names: set = set()

        for elem in root.iter():
            if self._local_tag(elem) != 'ClassifierRole':
                continue

            role_id = self._xmi_attr(elem, 'id')
            if not role_id:
                continue

            # Buscar ClassifierRole.base > Classifier xmi.idref
            base_class_id = ''
            for child in elem:
                if self._local_tag(child).endswith('base'):
                    for base_ref in child:
                        idref = self._xmi_attr(base_ref, 'idref')
                        if idref:
                            base_class_id = idref
                            break
                    break

            # Resolver el ID de la clase base a su nombre
            ll_name = self.id_to_name.get(base_class_id, '').strip()
            if not ll_name:
                # Fallback: usar el nombre directo del ClassifierRole (raro pero posible)
                ll_name = elem.get('name', '').strip()

            if ll_name:
                role_id_to_name[role_id] = ll_name
                if ll_name not in seen_lifeline_names:
                    # represents = nombre de la clase que esta lifeline instancia
                    lifelines.append(UMLLifeline(name=ll_name, represents=ll_name))
                    seen_lifeline_names.add(ll_name)

        # Paso 1.5: Construir mapa operand_id → etiqueta de fragmento combinado.
        # Astah exporta: CombinedFragment[operator] > CombinedFragment.operand >
        #   InteractionOperand[xmi.id] > ModelElement.constraint > InteractionConstraint[name=guardia]
        # Usamos este mapa para asignar UMLMessage.fragment.
        operand_to_fragment: Dict[str, str] = {}

        for elem in root.iter():
            if self._local_tag(elem) != 'CombinedFragment':
                continue
            operator = elem.get('operator', '')
            if not operator or not elem.get('xmi.id'):
                continue

            # Recopilar guardias por operand id
            for cf_child in elem:
                if not self._local_tag(cf_child).endswith('operand'):
                    continue
                for operand_elem in cf_child:
                    if self._local_tag(operand_elem) != 'InteractionOperand':
                        continue
                    op_id = operand_elem.get('xmi.id', '')
                    if not op_id:
                        continue

                    # Buscar guardia: ModelElement.constraint > InteractionConstraint[name]
                    guard_text = ''
                    for op_child in operand_elem:
                        op_child_local = self._local_tag(op_child)
                        if 'constraint' in op_child_local.lower():
                            for constraint_elem in op_child:
                                cname = self._url_decode(
                                    constraint_elem.get('name', '').strip()
                                )
                                if cname and cname.lower() not in ('guard', ''):
                                    guard_text = cname
                                    break
                        if 'guard' in op_child_local.lower() and not guard_text:
                            for gref in op_child:
                                gname = self._url_decode(
                                    gref.get('name', '').strip()
                                )
                                if gname and gname.lower() not in ('guard', ''):
                                    guard_text = gname
                                    break

                    label = operator
                    if guard_text:
                        label = f'{operator} [{guard_text}]'
                    operand_to_fragment[op_id] = label

        # Paso 2: Extraer mensajes desde Collaboration.interaction > Interaction > Interaction.message.
        for elem in root.iter():
            if self._local_tag(elem) != 'Collaboration':
                continue

            for collab_child in elem:
                collab_child_local = self._local_tag(collab_child)
                # Astah usa 'Collaboration.interaction' como tag local
                if 'interaction' not in collab_child_local:
                    continue

                for interaction_elem in collab_child:
                    if self._local_tag(interaction_elem) != 'Interaction':
                        continue

                    for interaction_child in interaction_elem:
                        if not self._local_tag(interaction_child).endswith('message'):
                            continue

                        for msg_elem in interaction_child:
                            if self._local_tag(msg_elem) != 'Message':
                                continue

                            msg_name = self._url_decode(msg_elem.get('name', '').strip())
                            sender_ref = ''
                            receiver_ref = ''
                            is_async = False
                            action_type = '1'  # 1=call, 2=return
                            operand_ref = ''

                            for msg_child in msg_elem:
                                mc_local = self._local_tag(msg_child)
                                if mc_local.endswith('sender'):
                                    for role_ref in msg_child:
                                        idref = self._xmi_attr(role_ref, 'idref')
                                        if idref:
                                            sender_ref = idref
                                            break
                                elif mc_local.endswith('receiver'):
                                    for role_ref in msg_child:
                                        idref = self._xmi_attr(role_ref, 'idref')
                                        if idref:
                                            receiver_ref = idref
                                            break
                                elif mc_local.endswith('action'):
                                    # Leer UML:Action para obtener tipo de mensaje
                                    for action_elem in msg_child:
                                        if self._local_tag(action_elem) == 'Action':
                                            is_async = action_elem.get('isAsynchronous', 'false').lower() == 'true'
                                            action_type = action_elem.get('actionType', '1')
                                            break
                                elif mc_local.endswith('operand'):
                                    # Referencia al InteractionOperand (fragmento combinado)
                                    for op_ref in msg_child:
                                        idref = self._xmi_attr(op_ref, 'idref')
                                        if idref:
                                            operand_ref = idref
                                            break

                            # Determinar message_sort según atributos de Astah:
                            # actionType=2 + isAsynchronous=true  → reply (mensaje de retorno)
                            # actionType=1 + isAsynchronous=true  → asynchCall
                            # actionType=1 + isAsynchronous=false → synchCall
                            if action_type == '0':
                                msg_sort = 'createMessage'
                            elif action_type == '2' and is_async:
                                msg_sort = 'reply'
                            elif is_async:
                                msg_sort = 'asynchCall'
                            else:
                                msg_sort = 'synchCall'

                            source_ll = role_id_to_name.get(sender_ref, sender_ref)
                            target_ll = role_id_to_name.get(receiver_ref, receiver_ref)
                            fragment_label = operand_to_fragment.get(operand_ref) if operand_ref else None

                            if source_ll and target_ll:
                                messages.append(UMLMessage(
                                    name=msg_name,
                                    source_lifeline=source_ll,
                                    target_lifeline=target_ll,
                                    message_sort=msg_sort,
                                    sequence_order=len(messages),
                                    fragment=fragment_label,
                                ))

        diagram.lifelines = lifelines
        diagram.messages = messages
        return diagram

    def _extract_messages(self, collaboration_elem: ET.Element, lifelines: List[UMLLifeline], messages: List[UMLMessage]):
        """Extrae mensajes de un Collaboration."""
        for nested in collaboration_elem:
            nested_local = self._local_tag(nested)
            if nested_local != 'Interaction':
                continue

            for msg_container in nested:
                container_local = self._local_tag(msg_container)
                if not container_local.endswith('message'):
                    continue

                for msg_elem in msg_container:
                    if self._local_tag(msg_elem) != 'Message':
                        continue
                    msg_name = msg_elem.get('name', '').strip()
                    msg_name = self._url_decode(msg_name)

                    sender_ref = None
                    receiver_ref = None
                    for msg_child in msg_elem:
                        mc_local = self._local_tag(msg_child)
                        if mc_local.endswith('sender'):
                            for role in msg_child:
                                if self._local_tag(role) == 'ClassifierRole':
                                    sender_ref = self._xmi_attr(role, 'idref')
                        elif mc_local.endswith('receiver'):
                            for role in msg_child:
                                if self._local_tag(role) == 'ClassifierRole':
                                    receiver_ref = self._xmi_attr(role, 'idref')

                    source_ll = self._resolve_role_name(sender_ref)
                    target_ll = self._resolve_role_name(receiver_ref)

                    if source_ll and target_ll:
                        messages.append(UMLMessage(
                            name=msg_name,
                            source_lifeline=source_ll,
                            target_lifeline=target_ll,
                            message_sort='synchCall',
                            sequence_order=len(messages)
                        ))

    def _extract_association_ends_v11(self, elem: ET.Element) -> tuple:
        """Extrae los extremos de una asociación en XMI 1.1.
        Retorna (source_name, target_name, source_mult, target_mult, source_agg, target_agg)."""
        source_name = None
        target_name = None
        source_mult = None
        target_mult = None
        source_agg = 'none'
        target_agg = 'none'
        end_names = []

        for child in elem:
            child_local = self._local_tag(child)
            if not child_local.endswith('connection'):
                continue

            for end in child:
                if self._local_tag(end) != 'AssociationEnd':
                    continue
                participant_ref = None
                multiplicity = None
                aggregation = end.get('aggregation', 'none')

                for end_child in end:
                    ec_local = self._local_tag(end_child)
                    if ec_local.endswith('participant'):
                        for classifier in end_child:
                            if self._local_tag(classifier) == 'Classifier':
                                participant_ref = self._xmi_attr(classifier, 'idref')
                    elif ec_local.endswith('multiplicity'):
                        for mult in end_child:
                            if self._local_tag(mult) == 'Multiplicity':
                                for rng in mult:
                                    if self._local_tag(rng).endswith('.range') or self._local_tag(rng) == 'range':
                                        for mr in rng:
                                            if self._local_tag(mr) == 'MultiplicityRange':
                                                lower = mr.get('lower', '')
                                                upper = mr.get('upper', '')
                                                if upper == '-1':
                                                    upper = '*'
                                                if lower == '-1':
                                                    lower = '*'
                                                if lower == '*' and upper == '*':
                                                    # así exporta Astah la multiplicidad "*"
                                                    multiplicity = '*'
                                                elif lower and upper:
                                                    multiplicity = f'{lower}..{upper}'
                                                elif lower:
                                                    multiplicity = lower

                name = self.id_to_name.get(participant_ref, '')
                end_names.append(name)
                if not source_name:
                    source_name = name
                    source_mult = multiplicity
                    source_agg = aggregation
                elif not target_name:
                    target_name = name
                    target_mult = multiplicity
                    target_agg = aggregation

        return source_name, target_name, source_mult, target_mult, source_agg, target_agg

    def _extract_relationships_v11(self, root: ET.Element, classes: Dict[str, UMLClass], actors: List[UMLActor], use_cases: List[UMLUseCase]) -> List[UMLRelationship]:
        """Extrae relaciones entre clases en XMI 1.1 (asociaciones + herencia)."""
        relationships = []
        valid_names = {c.name for c in classes.values()}
        # una clase de asociacion es extremo valido de una asociacion normal
        # (en la solucion del docente, Tratamiento se asocia a HistorialEnfermedad)
        association_class_names = set()
        for elem in root.iter():
            if self._local_tag(elem) == 'AssociationClass':
                name = self._decode_name(elem.get('name', ''))
                if name:
                    association_class_names.add(name)
        valid_names |= association_class_names

        for elem in root.iter():
            local = self._local_tag(elem)

            if local == 'AssociationClass':
                source_name, target_name, src_mult, tgt_mult, _, _ = (
                    self._extract_association_ends_v11(elem)
                )
                if not source_name or not target_name:
                    continue
                if source_name not in valid_names or target_name not in valid_names:
                    continue
                rel = UMLRelationship(
                    source=source_name,
                    target=target_name,
                    relationship_type=RelationshipType.ASSOCIATION_CLASS,
                    name=self._decode_name(elem.get('name', '')) or None,
                )
                if src_mult:
                    rel.source_multiplicity = src_mult
                if tgt_mult:
                    rel.target_multiplicity = tgt_mult
                relationships.append(rel)

            elif local == 'Association':
                source_name, target_name, src_mult, tgt_mult, src_agg, tgt_agg = self._extract_association_ends_v11(elem)
                if not source_name or not target_name:
                    continue
                if source_name not in valid_names or target_name not in valid_names:
                    continue

                if src_agg == 'composite' or tgt_agg == 'composite':
                    rel_type = RelationshipType.COMPOSITION
                elif src_agg in ('shared', 'aggregate') or tgt_agg in ('shared', 'aggregate'):
                    rel_type = RelationshipType.AGGREGATION
                else:
                    rel_type = RelationshipType.ASSOCIATION

                rel_name = elem.get('name', '')
                rel = UMLRelationship(
                    source=source_name,
                    target=target_name,
                    relationship_type=rel_type,
                    name=rel_name if rel_name else None
                )
                if src_mult:
                    rel.source_multiplicity = src_mult
                if tgt_mult:
                    rel.target_multiplicity = tgt_mult
                relationships.append(rel)

            elif local == 'Generalization':
                child_id = None
                parent_id = None
                for gc in elem:
                    gc_local = self._local_tag(gc)
                    if gc_local.endswith('child'):
                        for ch in gc:
                            if self._local_tag(ch) == 'GeneralizableElement':
                                child_id = self._xmi_attr(ch, 'idref')
                    elif gc_local.endswith('parent'):
                        for p in gc:
                            if self._local_tag(p) == 'GeneralizableElement':
                                parent_id = self._xmi_attr(p, 'idref')
                child_name = self.id_to_name.get(child_id, '')
                parent_name = self.id_to_name.get(parent_id, '')
                if child_name in valid_names and parent_name in valid_names:
                    relationships.append(UMLRelationship(
                        source=child_name,
                        target=parent_name,
                        relationship_type=RelationshipType.INHERITANCE
                    ))

        return relationships

    def _extract_packages_v11(self, root: ET.Element) -> List[str]:
        """Extrae paquetes del XMI 1.1."""
        packages = []
        for elem in root.iter():
            if self._local_tag(elem) == 'Package':
                name = elem.get('name', '')
                if name:
                    packages.append(name)
        return packages

    def _resolve_type(self, type_ref: str) -> str:
        if not type_ref:
            return ''
        return self.id_to_name.get(type_ref, type_ref)

    def _resolve_role_name(self, role_ref: str) -> str:
        if not role_ref:
            return ''
        return self.id_to_name.get(role_ref, role_ref)

    def _url_decode(self, text: str) -> str:
        import urllib.parse
        try:
            # unquote_plus convierte '+' en espacio ademas de %XX
            return urllib.parse.unquote_plus(text)
        except Exception:
            return text

    def _decode_name(self, name: str) -> str:
        return decode_xmi_name(name)
