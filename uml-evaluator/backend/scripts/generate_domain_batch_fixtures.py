"""
Genera fixtures de lote para 5 dominios nuevos (no clínica), reutilizando
clinica_solucion.xmi como plantilla estructural (misma topología: 7 clases,
3 actores, 9 casos de uso, 8 mensajes de secuencia) con un renombrado
dirigido por diccionario, y las mismas transformaciones de error ya
probadas contra el parser real.

Uso:
  python scripts/generate_domain_batch_fixtures.py --all
  python scripts/generate_domain_batch_fixtures.py --domain biblioteca
"""
from __future__ import annotations

import argparse
import re
import shutil
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from generate_clinica_batch_fixtures import (
    _drop_messages,
    _inject_extra_actor,
    _remove_attribute_named,
    _remove_class_named,
    _remove_elements_by_tag,
    _remove_generalizations,
    _remove_shared_aggregation,
    _rename_attr,
    _rename_lifeline_label,
    _reorder_first_messages,
    _reverse_extend_owner,
    _strip_to_almost_empty,
    _strip_usecase_and_sequence_model,
    _remove_jude_diagram,
)

CLINICA_SOURCE = Path(r"c:\Users\serda\OneDrive\Escritorio\uml-fixtures-clinica\docente\clinica_solucion.xmi")
OUT_ROOT = Path(r"c:\Users\serda\OneDrive\Escritorio")


def _urlname(text: str) -> str:
    """Codifica un nombre 'con espacios' como lo exporta Astah (+ y %XX)."""
    return text.replace(" ", "+").replace("/", "%2F").replace("(", "%28").replace(")", "%29")


@dataclass
class DomainConfig:
    slug: str
    model_name: str
    # clase clínica -> clase del dominio
    class_renames: dict[str, str]
    # atributo clínica -> atributo del dominio (aplicado global, son únicos por clase en el original)
    attr_renames: dict[str, str]
    # método clínica -> método del dominio
    method_renames: dict[str, str] = field(default_factory=dict)
    # actor clínica -> actor del dominio (nombres en minúscula, como en el XMI)
    actor_renames: dict[str, str] = field(default_factory=dict)
    # caso de uso clínica (texto plano, sin url-encode) -> caso de uso del dominio
    usecase_renames: dict[str, str] = field(default_factory=dict)
    # relaciones con nombre propio (asociaciones nombradas)
    relation_renames: dict[str, str] = field(default_factory=dict)


DOMAINS: dict[str, DomainConfig] = {
    "biblioteca": DomainConfig(
        slug="biblioteca",
        model_name="biblioteca",
        class_renames={
            "Doctor": "Bibliotecario",
            "Paciente": "Socio",
            "Hospital": "Sucursal",
            "Receta": "Multa",
            "Medicamento": "Libro",
            "Cita": "Prestamo",
            "Persona": "Persona",
        },
        attr_renames={
            "especialidad": "turno",
            "licencia": "credencial",
            "fehcaNacimiento": "fehcaNacimiento",  # se retipea abajo (typo preexistente -> nuevo dominio)
            "historialClinico": "numeroSocio",
            "Nombre": "nombre",
            "direccion": "direccion",
            "fechaEmision": "fechaEmision",
            "indicaciones": "motivo",
            "nombre": "titulo",
            "dosis": "ejemplares",
            "frecuencia": "categoria",
            "fechaHora": "fechaHora",
            "estado": "estado",
            "motivo": "motivo",
            "id": "id",
            "apellido": "apellido",
            "telefono": "telefono",
            "email": "email",
        },
        method_renames={
            "atenderCita": "registrarPrestamo",
            "emitirReceta": "emitirMulta",
            "solicitarCita": "solicitarPrestamo",
            "verHistorial": "verHistorialPrestamos",
            "registrarDoctor": "registrarBibliotecario",
            "agregarMedicamento": "agregarLibro",
            "getDetalles": "getDetalles",
            "getNombreCompleto": "getNombreCompleto",
            "programar": "programar",
            "cancelar": "cancelar",
        },
        actor_renames={
            "doctor": "bibliotecario",
            "paciente": "socio",
            "administrador": "administrador",
        },
        usecase_renames={
            "consultar citas programadas": "consultar prestamos vencidos",
            "registrar atencion / diagnostico": "registrar devolucion",
            "generar receta meidca": "generar multa",
            "consultar historial clinico del paciente": "consultar historial de prestamos del socio",
            "Solicitar Cita Medica": "Solicitar Prestamo",
            "Cancelar Cita Medica": "Cancelar Reserva",
            "Consultar Recetas Emitidas": "Consultar Multas Emitidas",
            "gestionar doctor": "gestionar bibliotecario",
            "gestionar medicamentos": "gestionar libros",
        },
        relation_renames={
            "contiene": "contiene",
            "atiende": "presta",
            "asiste": "retira",
            "genera": "genera",
        },
    ),
    "ecommerce": DomainConfig(
        slug="ecommerce",
        model_name="ecommerce",
        class_renames={
            "Doctor": "Vendedor",
            "Paciente": "Cliente",
            "Hospital": "Tienda",
            "Receta": "NotaCredito",
            "Medicamento": "Producto",
            "Cita": "Pedido",
            "Persona": "Persona",
        },
        attr_renames={
            "especialidad": "zona",
            "licencia": "credencial",
            "historialClinico": "numeroCliente",
            "Nombre": "nombre",
            "direccion": "direccion",
            "fechaEmision": "fechaEmision",
            "indicaciones": "motivo",
            "nombre": "nombre",
            "dosis": "precio",
            "frecuencia": "stock",
            "fechaHora": "fechaHora",
            "estado": "estado",
            "motivo": "total",
            "id": "id",
            "apellido": "apellido",
            "telefono": "telefono",
            "email": "email",
        },
        method_renames={
            "atenderCita": "procesarPedido",
            "emitirReceta": "emitirNotaCredito",
            "solicitarCita": "realizarPedido",
            "verHistorial": "verHistorialCompras",
            "registrarDoctor": "registrarVendedor",
            "agregarMedicamento": "agregarProducto",
            "getDetalles": "getDetalles",
            "getNombreCompleto": "getNombreCompleto",
            "programar": "programar",
            "cancelar": "cancelar",
        },
        actor_renames={
            "doctor": "vendedor",
            "paciente": "cliente",
            "administrador": "administrador",
        },
        usecase_renames={
            "consultar citas programadas": "consultar pedidos pendientes",
            "registrar atencion / diagnostico": "procesar devolucion",
            "generar receta meidca": "generar nota de credito",
            "consultar historial clinico del paciente": "consultar historial de compras del cliente",
            "Solicitar Cita Medica": "Realizar Pedido",
            "Cancelar Cita Medica": "Cancelar Pedido",
            "Consultar Recetas Emitidas": "Consultar Notas de Credito",
            "gestionar doctor": "gestionar vendedor",
            "gestionar medicamentos": "gestionar productos",
        },
        relation_renames={
            "contiene": "contiene",
            "atiende": "vende",
            "asiste": "compra",
            "genera": "genera",
        },
    ),
    "hotel": DomainConfig(
        slug="hotel",
        model_name="hotel",
        class_renames={
            "Doctor": "Recepcionista",
            "Paciente": "Huesped",
            "Hospital": "Hotel",
            "Receta": "Factura",
            "Medicamento": "Habitacion",
            "Cita": "Reserva",
            "Persona": "Persona",
        },
        attr_renames={
            "especialidad": "turno",
            "licencia": "credencial",
            "historialClinico": "numeroHuesped",
            "Nombre": "nombre",
            "direccion": "direccion",
            "fechaEmision": "fechaEmision",
            "indicaciones": "motivo",
            "nombre": "numero",
            "dosis": "tipo",
            "frecuencia": "tarifa",
            "fechaHora": "fechaHora",
            "estado": "estado",
            "motivo": "noches",
            "id": "id",
            "apellido": "apellido",
            "telefono": "telefono",
            "email": "email",
        },
        method_renames={
            "atenderCita": "registrarCheckIn",
            "emitirReceta": "emitirFactura",
            "solicitarCita": "solicitarReserva",
            "verHistorial": "verHistorialEstadias",
            "registrarDoctor": "registrarRecepcionista",
            "agregarMedicamento": "agregarHabitacion",
            "getDetalles": "getDetalles",
            "getNombreCompleto": "getNombreCompleto",
            "programar": "programar",
            "cancelar": "cancelar",
        },
        actor_renames={
            "doctor": "recepcionista",
            "paciente": "huesped",
            "administrador": "administrador",
        },
        usecase_renames={
            "consultar citas programadas": "consultar reservas del dia",
            "registrar atencion / diagnostico": "registrar checkout tardio",
            "generar receta meidca": "generar factura",
            "consultar historial clinico del paciente": "consultar historial de estadias del huesped",
            "Solicitar Cita Medica": "Solicitar Reserva",
            "Cancelar Cita Medica": "Cancelar Reserva",
            "Consultar Recetas Emitidas": "Consultar Facturas Emitidas",
            "gestionar doctor": "gestionar recepcionista",
            "gestionar medicamentos": "gestionar habitaciones",
        },
        relation_renames={
            "contiene": "contiene",
            "atiende": "atiende",
            "asiste": "reserva",
            "genera": "genera",
        },
    ),
    "proyectos": DomainConfig(
        slug="proyectos",
        model_name="proyectos",
        class_renames={
            "Doctor": "LiderProyecto",
            "Paciente": "Colaborador",
            "Hospital": "Organizacion",
            "Receta": "ReporteAvance",
            "Medicamento": "Tarea",
            "Cita": "Sprint",
            "Persona": "Persona",
        },
        attr_renames={
            "especialidad": "area",
            "licencia": "credencial",
            "historialClinico": "numeroLegajo",
            "Nombre": "nombre",
            "direccion": "direccion",
            "fechaEmision": "fechaEmision",
            "indicaciones": "motivo",
            "nombre": "titulo",
            "dosis": "prioridad",
            "frecuencia": "estimacionHoras",
            "fechaHora": "fechaHora",
            "estado": "estado",
            "motivo": "objetivo",
            "id": "id",
            "apellido": "apellido",
            "telefono": "telefono",
            "email": "email",
        },
        method_renames={
            "atenderCita": "iniciarSprint",
            "emitirReceta": "emitirReporteAvance",
            "solicitarCita": "solicitarSprint",
            "verHistorial": "verHistorialSprints",
            "registrarDoctor": "registrarLiderProyecto",
            "agregarMedicamento": "agregarTarea",
            "getDetalles": "getDetalles",
            "getNombreCompleto": "getNombreCompleto",
            "programar": "programar",
            "cancelar": "cancelar",
        },
        actor_renames={
            "doctor": "lider",
            "paciente": "colaborador",
            "administrador": "administrador",
        },
        usecase_renames={
            "consultar citas programadas": "consultar tareas atrasadas",
            "registrar atencion / diagnostico": "escalar bloqueo",
            "generar receta meidca": "generar reporte de avance",
            "consultar historial clinico del paciente": "consultar historial de sprints del colaborador",
            "Solicitar Cita Medica": "Asignar Tarea",
            "Cancelar Cita Medica": "Cancelar Tarea",
            "Consultar Recetas Emitidas": "Consultar Reportes Emitidos",
            "gestionar doctor": "gestionar lider proyecto",
            "gestionar medicamentos": "gestionar tareas",
        },
        relation_renames={
            "contiene": "contiene",
            "atiende": "lidera",
            "asiste": "participa",
            "genera": "genera",
        },
    ),
    "votacion": DomainConfig(
        slug="votacion",
        model_name="votacion",
        class_renames={
            "Doctor": "Fiscal",
            "Paciente": "Votante",
            "Hospital": "CentroVotacion",
            "Receta": "ActaEscrutinio",
            "Medicamento": "Candidato",
            "Cita": "Voto",
            "Persona": "Persona",
        },
        attr_renames={
            "especialidad": "mesa",
            "licencia": "credencial",
            "historialClinico": "numeroPadron",
            "Nombre": "nombre",
            "direccion": "direccion",
            "fechaEmision": "fechaEmision",
            "indicaciones": "motivo",
            "nombre": "nombre",
            "dosis": "partido",
            "frecuencia": "numeroLista",
            "fechaHora": "fechaHora",
            "estado": "estado",
            "motivo": "mesa",
            "id": "id",
            "apellido": "apellido",
            "telefono": "telefono",
            "email": "email",
        },
        method_renames={
            "atenderCita": "registrarVoto",
            "emitirReceta": "emitirActaEscrutinio",
            "solicitarCita": "emitirVoto",
            "verHistorial": "verHistorialParticipacion",
            "registrarDoctor": "registrarFiscal",
            "agregarMedicamento": "agregarCandidato",
            "getDetalles": "getDetalles",
            "getNombreCompleto": "getNombreCompleto",
            "programar": "programar",
            "cancelar": "cancelar",
        },
        actor_renames={
            "doctor": "fiscal",
            "paciente": "votante",
            "administrador": "administrador",
        },
        usecase_renames={
            "consultar citas programadas": "consultar votos emitidos",
            "registrar atencion / diagnostico": "registrar impugnacion",
            "generar receta meidca": "generar acta de escrutinio",
            "consultar historial clinico del paciente": "consultar historial de participacion del votante",
            "Solicitar Cita Medica": "Emitir Voto",
            "Cancelar Cita Medica": "Anular Voto",
            "Consultar Recetas Emitidas": "Consultar Actas Emitidas",
            "gestionar doctor": "gestionar fiscal",
            "gestionar medicamentos": "gestionar candidatos",
        },
        relation_renames={
            "contiene": "contiene",
            "atiende": "fiscaliza",
            "asiste": "vota",
            "genera": "genera",
        },
    ),
}


def _rename_name_attr(xml: str, old: str, new: str) -> str:
    """Reemplaza name="old" -> name="new" (old/new ya en la forma exportada, con url-encode si aplica)."""
    if old == new:
        return xml
    return xml.replace(f'name="{old}"', f'name="{new}"')


def _apply_domain_rename(xml: str, config: DomainConfig) -> str:
    xml = xml.replace('name="clinica"', f'name="{config.model_name}"')

    for old, new in config.class_renames.items():
        xml = _rename_name_attr(xml, old, new)

    for old, new in config.attr_renames.items():
        xml = _rename_name_attr(xml, old, new)

    for old, new in config.method_renames.items():
        # Los métodos de secuencia pueden llevar url-encode ("()" -> "%28%29").
        xml = _rename_name_attr(xml, old, new)
        xml = _rename_name_attr(xml, _urlname(old + "()"), _urlname(new + "()"))

    for old, new in config.actor_renames.items():
        xml = _rename_name_attr(xml, old, new)

    for old, new in config.usecase_renames.items():
        xml = _rename_name_attr(xml, _urlname(old), _urlname(new))

    for old, new in config.relation_renames.items():
        xml = _rename_name_attr(xml, old, new)

    # Los labels de presentación (JUDE:LabelPresentation) y algunos mensajes
    # de secuencia embeben el nombre de clase/actor de forma literal (no solo
    # en name="..."), p.ej. label="4%3A+crearReceta%28%29" o label="doctor".
    # Se resuelve con un reemplazo de texto plano por cada clase/actor,
    # aplicado DESPUÉS de los renombrados estructurales de arriba, para no
    # interferir con los replace de name="..." ya hechos por separado.
    for old_class in ("Doctor", "Paciente", "Hospital", "Receta", "Medicamento", "Cita"):
        new_class = config.class_renames.get(old_class, old_class)
        xml = xml.replace(old_class, new_class)
        xml = xml.replace(old_class.lower(), new_class.lower())

    return xml


def _transpose_letters(word: str, index: int = 1) -> str:
    """Intercambia las letras en index/index+1 (mismo tipo de typo que fechaHora->fehcaHora)."""
    if len(word) <= index + 1:
        return word
    chars = list(word)
    chars[index], chars[index + 1] = chars[index + 1], chars[index]
    return "".join(chars)


def _typo_pair_for(config: DomainConfig) -> tuple[str, str]:
    """Atributo 'fecha*' del dominio para inyectar el typo de transposición clásico."""
    fecha_attr = config.attr_renames.get("fechaHora", "fechaHora")
    return fecha_attr, _transpose_letters(fecha_attr)


VARIANT_NAMES = [
    "01_perfecto",
    "02_typos_nombres",
    "03_faltan_attrs",
    "04_falta_herencia",
    "05_falta_agregacion",
    "06_uc_sin_extend",
    "07_uc_extend_al_reves",
    "08_uc_sin_include_actor_extra",
    "09_seq_incompleta_reordenada",
    "10_casi_vacio",
]


def _build_variants(xml: str, config: DomainConfig) -> dict[str, str]:
    fecha_attr, fecha_typo = _typo_pair_for(config)
    licencia_attr = config.attr_renames.get("licencia", "licencia")
    licencia_typo = licencia_attr[:-1] + "a" if licencia_attr else licencia_attr
    estado_attr = config.attr_renames.get("fechaHora", "fechaHora")

    return {
        "01_perfecto": xml,
        "02_typos_nombres": _rename_attr(
            _rename_attr(xml, fecha_attr, fecha_typo),
            licencia_attr,
            licencia_typo,
        ),
        "03_faltan_attrs": _remove_attribute_named(
            _remove_attribute_named(xml, fecha_attr), "estado"
        ),
        "04_falta_herencia": _remove_generalizations(xml),
        "05_falta_agregacion": _remove_shared_aggregation(xml),
        "06_uc_sin_extend": _remove_elements_by_tag(xml, "Extend"),
        "07_uc_extend_al_reves": _reverse_extend_owner(xml),
        "08_uc_sin_include_actor_extra": _inject_extra_actor(
            _remove_elements_by_tag(xml, "Include")
        ),
        "09_seq_incompleta_reordenada": _reorder_first_messages(
            _drop_messages(xml, keep_first=5)
        ),
        "10_casi_vacio": _strip_to_almost_empty(xml),
    }


README_TEMPLATE = """# Fixtures lote — {slug}

Generados desde clinica_solucion.xmi (misma topología, renombrado por dominio)
para probar la evaluación por lote.

## Cómo usar en la UI

1. Abre la app → modo **Lote** (ZIP de estudiantes).
2. **Solución docente:** `docente/{slug}_solucion.xmi`
3. **Estudiantes:** `estudiantes.zip`
4. Ejecuta la comparación y revisa `/lote`.

Esperado aproximado:
- `01_perfecto` → nota alta
- `02_typos_nombres` → NO debe bajar la nota (typo de letras, mismo campo/clase)
- `03_faltan_attrs` en adelante → notas intermedias distintas por error real
- `10_casi_vacio` → nota muy baja

## Regenerar

```bash
cd uml-evaluator/backend
python scripts/generate_domain_batch_fixtures.py --domain {slug}
```
"""


def generate_domain(slug: str) -> None:
    config = DOMAINS[slug]
    if not CLINICA_SOURCE.is_file():
        raise FileNotFoundError(f"No existe la plantilla clínica: {CLINICA_SOURCE}")

    base_xml = CLINICA_SOURCE.read_text(encoding="utf-8", errors="replace")
    domain_xml = _apply_domain_rename(base_xml, config)

    out_dir = OUT_ROOT / f"uml-fixtures-{slug}"
    docente = out_dir / "docente"
    estudiantes = out_dir / "estudiantes"
    docente.mkdir(parents=True, exist_ok=True)
    if estudiantes.exists():
        shutil.rmtree(estudiantes)
    estudiantes.mkdir(parents=True, exist_ok=True)

    solucion = docente / f"{slug}_solucion.xmi"
    solucion.write_text(domain_xml, encoding="utf-8")

    variants = _build_variants(domain_xml, config)
    for name in VARIANT_NAMES:
        (estudiantes / f"{name}.xmi").write_text(variants[name], encoding="utf-8")

    zip_path = out_dir / "estudiantes.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(estudiantes.glob("*.xmi")):
            zf.write(path, arcname=path.name)

    (out_dir / "README.md").write_text(README_TEMPLATE.format(slug=slug), encoding="utf-8")

    print(f"OK dominio: {slug}")
    print(f"  salida: {out_dir}")
    print(f"  estudiantes: {len(list(estudiantes.glob('*.xmi')))} xmi")
    print(f"  zip: {zip_path.name} ({zip_path.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera fixtures batch multi-dominio")
    parser.add_argument("--domain", choices=sorted(DOMAINS.keys()))
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    if args.all:
        for slug in DOMAINS:
            generate_domain(slug)
    elif args.domain:
        generate_domain(args.domain)
    else:
        parser.error("Usa --domain <slug> o --all")


if __name__ == "__main__":
    main()
