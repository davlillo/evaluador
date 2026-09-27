# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Reglas compartidas por los parsers XMI 2.x y 1.1: qué no es una clase del
dominio, qué parece un caso de uso y cómo se decodifican los nombres.
"""

import re



# Tipos primitivos que Astah (y otros) definen como uml:Class pero no son
# clases del dominio — se excluyen de la lista final de clases.
PRIMITIVE_TYPES = {
    'integer', 'int', 'string', 'str', 'boolean', 'bool', 'float', 'double',
    'long', 'short', 'byte', 'char', 'void', 'date', 'datetime', 'object',
    'number', 'real', 'decimal', 'natural', 'unlimited', 'unlimitednatural',
    'any', 'null', 'undefined',
    # java.time y afines: Astah los materializa como <UML:Class> stub cuando
    # el estudiante escribe el tipo de un atributo, pero no son clases del
    # dominio y el docente no las cuenta.
    'localdate', 'localdatetime', 'localtime', 'time', 'timestamp',
    'bigdecimal', 'biginteger', 'character',
}

# Nombres por defecto que Astah asigna al soltar una clase sin renombrarla
# ("Class0", "Clase3"...). El docente las descarta al contar; el sistema
# tambien, si no infla el conteo de clases modeladas.
DEFAULT_CLASS_NAME_RE = re.compile(r'^(?:class|clase)\d+$', re.IGNORECASE)


def is_placeholder_class_name(name: str) -> bool:
    """True si el nombre es un placeholder de la herramienta, no del dominio."""
    return bool(DEFAULT_CLASS_NAME_RE.match((name or '').strip()))

# Verbos en infinitivo (ES/EN) que indican que una clase es un caso de uso.
UC_VERBS = {
    'gestionar', 'crear', 'buscar', 'editar', 'eliminar', 'registrar',
    'actualizar', 'modificar', 'ver', 'listar', 'consultar', 'administrar',
    'agregar', 'añadir', 'borrar', 'cancelar', 'procesar', 'generar',
    'enviar', 'recibir', 'autenticar', 'validar', 'iniciar', 'cerrar',
    'obtener', 'mostrar', 'calcular', 'realizar', 'ejecutar', 'confirmar',
    'verificar', 'revisar', 'marcar', 'pasar', 'agendar', 'programar',
    'reservar', 'solicitar', 'autorizar', 'aprobar', 'pagar', 'cobrar',
    'facturar', 'emitir', 'imprimir', 'exportar', 'importar', 'subir',
    'descargar', 'asignar', 'notificar', 'reportar', 'analizar',
    'manage', 'create', 'search', 'edit', 'delete', 'register',
    'update', 'view', 'list', 'consult', 'add', 'remove', 'cancel',
    'process', 'generate', 'send', 'receive', 'authenticate', 'validate',
    'login', 'logout', 'get', 'show', 'calculate', 'execute', 'confirm',
    'verify', 'check', 'review', 'schedule', 'book', 'pay', 'charge',
}


def looks_like_use_case_name(name: str) -> bool:
    """True si el nombre parece un caso de uso (verbo de acción al inicio)."""
    if not name:
        return False
    words = decode_xmi_name(name).lower().split()
    if not words:
        return False
    return words[0] in UC_VERBS


def decode_xmi_name(name: str) -> str:
    """Decodifica nombres exportados en URL-form ('+' como espacio)."""
    import urllib.parse
    if not name:
        return ''
    try:
        return urllib.parse.unquote_plus(name).strip()
    except Exception:
        return name.strip()
