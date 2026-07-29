"""
Genera fixtures de lote a partir de clinica.xmi (Escritorio).

Uso:
  python scripts/generate_clinica_batch_fixtures.py
  python scripts/generate_clinica_batch_fixtures.py --source "C:/ruta/clinica.xmi" --out "C:/Escritorio/uml-fixtures-clinica"
"""
from __future__ import annotations

import argparse
import re
import shutil
import zipfile
from pathlib import Path


DEFAULT_SOURCE = Path(r"c:\Users\serda\OneDrive\Escritorio\clinica.xmi")
DEFAULT_OUT = Path(r"c:\Users\serda\OneDrive\Escritorio\uml-fixtures-clinica")


def _remove_elements_by_tag(xml: str, tag_local: str) -> str:
    """Elimina elementos <UML:Tag>...</UML:Tag> y auto-cerrados."""
    # idref-only refs like <UML:Extend xmi.idref="..."/>
    xml = re.sub(
        rf"<UML:{tag_local}\b[^>]*/>",
        "",
        xml,
        flags=re.IGNORECASE,
    )
    xml = re.sub(
        rf"<UML:{tag_local}\b[^>]*>.*?</UML:{tag_local}>",
        "",
        xml,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return xml


def _remove_attribute_named(xml: str, attr_name: str) -> str:
    """Quita bloques UML:Attribute con name=attr_name."""
    return re.sub(
        rf'<UML:Attribute\b[^>]*\bname="{re.escape(attr_name)}"[^>]*>.*?</UML:Attribute>',
        "",
        xml,
        flags=re.IGNORECASE | re.DOTALL,
    )


def _rename_attr(xml: str, old: str, new: str) -> str:
    return xml.replace(f'name="{old}"', f'name="{new}"')


def _remove_jude_diagram(xml: str, type_info_substr: str) -> str:
    """Elimina bloques <JUDE:Diagram ...>…</JUDE:Diagram> (no Diagram.*)."""
    # Solo el tag elemento Diagram (espacio o >), no Diagram.presentations / idref
    open_re = re.compile(r"<JUDE:Diagram(?:\s|>)", re.IGNORECASE)
    close_tag = "</JUDE:Diagram>"
    needle = type_info_substr.lower()
    out: list[str] = []
    i = 0
    while True:
        m = open_re.search(xml, i)
        if not m:
            out.append(xml[i:])
            break
        out.append(xml[i : m.start()])
        # Cabecera hasta '>'
        gt = xml.find(">", m.start())
        if gt < 0:
            out.append(xml[m.start() :])
            break
        header = xml[m.start() : gt + 1]
        # Auto-cerrado / idref: no es el diagrama completo
        if header.rstrip().endswith("/>") or "xmi.idref" in header:
            out.append(header)
            i = gt + 1
            continue
        # Emparejar cierre con profundidad (idrefs internos no abren)
        depth = 1
        pos = gt + 1
        while depth > 0:
            next_open = open_re.search(xml, pos)
            next_close = xml.find(close_tag, pos)
            if next_close < 0:
                # XML roto: abortar y dejar resto
                out.append(xml[m.start() :])
                return "".join(out)
            if next_open and next_open.start() < next_close:
                oh_end = xml.find(">", next_open.start())
                oh = xml[next_open.start() : oh_end + 1] if oh_end >= 0 else ""
                if oh and not oh.rstrip().endswith("/>") and "xmi.idref" not in oh:
                    depth += 1
                pos = (oh_end + 1) if oh_end >= 0 else next_open.end()
            else:
                depth -= 1
                pos = next_close + len(close_tag)
        block = xml[m.start() : pos]
        if needle not in block.lower():
            out.append(block)
        i = pos
    return "".join(out)


def _strip_usecase_and_sequence_model(xml: str) -> str:
    """Quita elementos semánticos de UC y secuencia (deja solo clases)."""
    for tag in (
        "Extend",
        "Include",
        "UseCase",
        "Actor",
        "Message",
        "Stimulus",
        "ClassifierRole",
        "Interaction",
        "Collaboration",
    ):
        xml = _remove_elements_by_tag(xml, tag)
    return xml


def _swap_extend_ends(xml: str) -> str:
    """Intercambia extension/base dentro de cada UML:Extend completo."""

    def swap(m: re.Match[str]) -> str:
        block = m.group(0)
        # Only swap if both present
        if "Extend.extension" not in block or "Extend.base" not in block:
            return block
        ext = re.search(
            r"<UML:Extend\.extension>.*?</UML:Extend\.extension>",
            block,
            re.DOTALL,
        )
        base = re.search(
            r"<UML:Extend\.base>.*?</UML:Extend\.base>",
            block,
            re.DOTALL,
        )
        if not ext or not base:
            return block
        # Replace content of each with the other's inner UseCase refs
        ext_inner = re.search(r"<UML:UseCase[^/]*/>", ext.group(0))
        base_inner = re.search(r"<UML:UseCase[^/]*/>", base.group(0))
        if not ext_inner or not base_inner:
            return block
        new_ext = f"<UML:Extend.extension>\n            {base_inner.group(0)}\n          </UML:Extend.extension>"
        new_base = f"<UML:Extend.base>\n            {ext_inner.group(0)}\n          </UML:Extend.base>"
        block2 = block.replace(ext.group(0), "<<<EXT>>>").replace(base.group(0), "<<<BASE>>>")
        return block2.replace("<<<EXT>>>", new_ext).replace("<<<BASE>>>", new_base)

    return re.sub(
        r"<UML:Extend\b(?![^>]*/>)[^>]*>.*?</UML:Extend>",
        swap,
        xml,
        flags=re.DOTALL,
    )


def _drop_messages(xml: str, keep_first: int) -> str:
    """Deja solo los primeros N UML:Message con xmi.id (no idref)."""
    full_msgs = list(
        re.finditer(
            r"<UML:Message\b(?![^>]*xmi\.idref)[^>]*>.*?</UML:Message>",
            xml,
            re.DOTALL,
        )
    )
    if len(full_msgs) <= keep_first:
        return xml
    # Remove from the end to keep indices stable
    out = xml
    for m in reversed(full_msgs[keep_first:]):
        out = out[: m.start()] + out[m.end() :]
    return out


def _reorder_first_messages(xml: str) -> str:
    """Invierte el orden de los dos primeros Message completos."""
    msgs = list(
        re.finditer(
            r"<UML:Message\b(?![^>]*xmi\.idref)[^>]*>.*?</UML:Message>",
            xml,
            re.DOTALL,
        )
    )
    if len(msgs) < 2:
        return xml
    a, b = msgs[0], msgs[1]
    return (
        xml[: a.start()]
        + b.group(0)
        + xml[a.end() : b.start()]
        + a.group(0)
        + xml[b.end() :]
    )


def _rename_lifeline_label(xml: str, old: str, new: str) -> str:
    # ClassifierRole / presentation labels often use + for spaces
    out = xml.replace(f'name="{old}"', f'name="{new}"')
    out = out.replace(f'label="{old}"', f'label="{new}"')
    return out


def _strip_to_almost_empty(xml: str) -> str:
    """Deja un XMI mínimo parseable con una sola clase vacía."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<XMI xmi.version="1.1" xmlns:UML="org.omg.xmi.namespace.UML" xmlns:JUDE="http://objectclub.esm.co.jp/Jude/namespace/">
  <XMI.content>
    <UML:Model xmi.id="m0" name="casi_vacio">
      <UML:Namespace.ownedElement>
        <UML:Class xmi.id="c1" name="Algo"/>
      </UML:Namespace.ownedElement>
    </UML:Model>
    <XMI.extension>
      <JUDE:Diagram xmi.id="d0" name="Class Diagram0" typeInfo="Class Diagram">
        <JUDE:Diagram.presentations>
          <JUDE:ClassPresentation xmi.id="p0">
            <JUDE:UPresentation.semanticModel>
              <UML:Class xmi.idref="c1"/>
            </JUDE:UPresentation.semanticModel>
          </JUDE:ClassPresentation>
        </JUDE:Diagram.presentations>
      </JUDE:Diagram>
    </XMI.extension>
  </XMI.content>
</XMI>
"""


def _remove_class_named(xml: str, class_name: str) -> str:
    """Elimina la definición UML:Class con ese name (bloque completo)."""
    return re.sub(
        rf'<UML:Class\b[^>]*\bname="{re.escape(class_name)}"[^>]*>.*?</UML:Class>',
        "",
        xml,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )


def _remove_generalizations(xml: str) -> str:
    xml = _remove_elements_by_tag(xml, "Generalization")
    # Also remove generalization refs inside Class
    xml = re.sub(
        r"<UML:GeneralizableElement\.generalization>.*?</UML:GeneralizableElement\.generalization>",
        "<UML:GeneralizableElement.generalization></UML:GeneralizableElement.generalization>",
        xml,
        flags=re.DOTALL,
    )
    return xml


def _remove_shared_aggregation(xml: str) -> str:
    """Quita agregación Astah en AssociationEnd (aggregate/shared/composite → none)."""
    def fix_end(m: re.Match[str]) -> str:
        tag = m.group(0)
        return re.sub(
            r'\baggregation="(?:aggregate|shared|composite)"',
            'aggregation="none"',
            tag,
            flags=re.IGNORECASE,
        )

    return re.sub(r"<UML:AssociationEnd\b[^>]*>", fix_end, xml)


def _reverse_extend_owner(xml: str) -> str:
    """
    Invierte el extend Astah moviendo UseCase.extend al otro CU y
    intercambiando Extend.extension / Extend.base.
    """
    # No cruzar límites de UseCase (.*? con DOTALL sí lo haría).
    owner_m = re.search(
        r'<UML:UseCase\b([^>]*)>'
        r'((?:(?!</UML:UseCase>).)*?)'
        r'(<UML:UseCase\.extend>.*?</UML:UseCase\.extend>)'
        r'((?:(?!</UML:UseCase>).)*?)'
        r'</UML:UseCase>',
        xml,
        re.DOTALL,
    )
    if not owner_m:
        return _swap_extend_ends(xml)

    owner_attrs = owner_m.group(1)
    owner_id_m = re.search(r'xmi\.id="([^"]+)"', owner_attrs)
    if not owner_id_m:
        return _swap_extend_ends(xml)
    owner_id = owner_id_m.group(1)
    extend_wrap = owner_m.group(3)

    full_ext_m = re.search(
        r"<UML:Extend\b(?![^>]*/>)[^>]*>.*?</UML:Extend>",
        xml,
        re.DOTALL,
    )
    if not full_ext_m:
        return xml
    ext_ids = re.findall(
        r'<UML:UseCase\s+xmi\.idref="([^"]+)"', full_ext_m.group(0)
    )
    other_id = next((i for i in ext_ids if i != owner_id), None)
    if not other_id:
        return _swap_extend_ends(xml)

    # Quitar wrap del dueño actual
    xml2 = (
        xml[: owner_m.start()]
        + f"<UML:UseCase{owner_attrs}>"
        + owner_m.group(2)
        + owner_m.group(4)
        + "</UML:UseCase>"
        + xml[owner_m.end() :]
    )

    # Swap tags extension/base
    xml2 = _swap_extend_ends(xml2)

    # Insertar wrap en el otro CU
    other_m = re.search(
        rf'(<UML:UseCase\b[^>]*xmi\.id="{re.escape(other_id)}"[^>]*>)'
        rf'((?:(?!</UML:UseCase>).)*)'
        rf'(</UML:UseCase>)',
        xml2,
        re.DOTALL,
    )
    if not other_m:
        return xml2
    if "UseCase.extend" in other_m.group(2):
        return xml2
    xml2 = (
        xml2[: other_m.start()]
        + other_m.group(1)
        + other_m.group(2)
        + "\n              "
        + extend_wrap
        + "\n            "
        + other_m.group(3)
        + xml2[other_m.end() :]
    )
    return xml2


def _inject_extra_actor(xml: str) -> str:
    """Actor extra visible en el diagrama UC + asociación a un caso de uso."""
    actor_id = "actor-extra-enfermero"
    uc_id = "387c-5dac489faaf26b6aa00e04c10625b9c2"  # consultar citas programadas
    diagram_id = "31rq-5dac489faaf26b6aa00e04c10625b9c2"

    actor = (
        f'<UML:Actor xmi.id="{actor_id}" name="enfermero" '
        'version="0" unSolvedFlag="false" isRoot="false" isLeaf="false" '
        'isAbstract="false" isActive="false"/>\n'
    )
    assoc = f"""
            <UML:Association xmi.id="assoc-extra-enfermero" name="" version="0" unSolvedFlag="false">
              <UML:Association.connection>
                <UML:AssociationEnd xmi.id="ae-extra-1" aggregation="none" isNavigable="false">
                  <UML:AssociationEnd.participant>
                    <UML:Classifier xmi.idref="{actor_id}"/>
                  </UML:AssociationEnd.participant>
                </UML:AssociationEnd>
                <UML:AssociationEnd xmi.id="ae-extra-2" aggregation="none" isNavigable="true">
                  <UML:AssociationEnd.participant>
                    <UML:Classifier xmi.idref="{uc_id}"/>
                  </UML:AssociationEnd.participant>
                </UML:AssociationEnd>
              </UML:Association.connection>
            </UML:Association>
"""
    presentation = f"""
          <JUDE:ClassifierPresentation xmi.id="pres-extra-enfermero" version="0" depth="1" width="40.0" height="55.0" visibility="true" label="enfermero" notationType="1">
            <JUDE:UPresentation.semanticModel>
              <UML:Actor xmi.idref="{actor_id}"/>
            </JUDE:UPresentation.semanticModel>
            <JUDE:UPresentation.diagram>
              <JUDE:Diagram xmi.idref="{diagram_id}"/>
            </JUDE:UPresentation.diagram>
          </JUDE:ClassifierPresentation>
"""

    # Insert actor after first complete Actor definition
    m = re.search(r"<UML:Actor\b(?![^>]*/>)[^>]*>.*?</UML:Actor>", xml, re.DOTALL)
    if m:
        xml = xml[: m.end()] + "\n" + actor + xml[m.end() :]
    else:
        m2 = re.search(r"<UML:Namespace\.ownedElement>", xml)
        if m2:
            xml = xml[: m2.end()] + "\n" + actor + xml[m2.end() :]

    # Insert association after first Association (model)
    am = re.search(r"</UML:Association>", xml)
    if am:
        xml = xml[: am.end()] + "\n" + assoc + xml[am.end() :]

    # Insert presentation into UseCase diagram (after Diagram.presentations open)
    pm = re.search(
        rf'(<JUDE:Diagram\b[^>]*xmi\.id="{re.escape(diagram_id)}"[^>]*>.*?<JUDE:Diagram\.presentations>)',
        xml,
        re.DOTALL,
    )
    if pm:
        xml = xml[: pm.end()] + "\n" + presentation + xml[pm.end() :]
    else:
        sm = re.search(
            r'(<JUDE:UPresentation\.semanticModel>\s*<UML:Actor\s+xmi\.idref="[^"]+"/>\s*</JUDE:UPresentation\.semanticModel>)',
            xml,
        )
        if sm:
            after = xml.find("</JUDE:ClassifierPresentation>", sm.end())
            if after > 0:
                end = after + len("</JUDE:ClassifierPresentation>")
                xml = xml[:end] + "\n" + presentation + xml[end:]

    return xml


VARIANT_BUILDERS = {
    "01_perfecto": lambda x: x,
    "02_typos_nombres": lambda x: _rename_attr(
        _rename_attr(x, "fechaHora", "fehcaHora"),
        "especialidad",
        "especialida",
    ),
    "03_falta_cita_attrs": lambda x: _remove_attribute_named(
        _remove_attribute_named(x, "fechaHora"), "estado"
    ),
    "04_falta_herencia": _remove_generalizations,
    "05_falta_agregacion": _remove_shared_aggregation,
    "06_uc_sin_extend": lambda x: _remove_elements_by_tag(x, "Extend"),
    "07_uc_extend_al_reves": _reverse_extend_owner,
    "08_uc_sin_include": lambda x: _remove_elements_by_tag(x, "Include"),
    "09_uc_actor_extra": _inject_extra_actor,
    "10_seq_msgs_faltan": lambda x: _drop_messages(x, keep_first=3),
    "11_seq_orden_cambio": _reorder_first_messages,
    "12_seq_lifeline_renombrada": lambda x: _rename_lifeline_label(x, "paciente", "pacientex"),
    "13_incompleto_solo_clases": lambda x: _strip_usecase_and_sequence_model(
        _remove_jude_diagram(_remove_jude_diagram(x, "UseCase"), "Sequence")
    ),
    "14_sin_persona": lambda x: _remove_class_named(x, "Persona"),
    "15_casi_vacio": lambda _x: _strip_to_almost_empty(_x),
}


# Escapes Unicode: el .py puede abrirse como cp1252 en Windows.
README = (
    "# Fixtures lote \u2014 cl\u00ednica\n"
    "\n"
    "Generados desde tu `clinica.xmi` del Escritorio para probar la evaluaci\u00f3n por lote.\n"
    "\n"
    "## C\u00f3mo usar en la UI\n"
    "\n"
    "1. Abre la app \u2192 modo **Lote** (ZIP de estudiantes).\n"
    "2. **Soluci\u00f3n docente:** `docente/clinica_solucion.xmi`\n"
    "3. **Estudiantes:** `estudiantes.zip`\n"
    "4. Ejecuta la comparaci\u00f3n y revisa `/lote`.\n"
    "\n"
    "Esperado aproximado:\n"
    "- `01_perfecto` \u2192 nota alta\n"
    "- typos / attrs faltantes / herencia / UC / seq \u2192 notas intermedias distintas\n"
    "- `13_incompleto_solo_clases` \u2192 puede marcar incomplete o baja en UC/seq\n"
    "- `15_casi_vacio` \u2192 nota muy baja\n"
    "\n"
    "## Regenerar\n"
    "\n"
    "```bash\n"
    "cd uml-evaluator/backend\n"
    "python scripts/generate_clinica_batch_fixtures.py\n"
    "```\n"
    "\n"
    "No incluye `.asta` (Astah nativo): la app eval\u00faa `.xmi`.\n"
)


def generate(source: Path, out_dir: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"No existe el XMI fuente: {source}")

    xml = source.read_text(encoding="utf-8", errors="replace")

    docente = out_dir / "docente"
    estudiantes = out_dir / "estudiantes"
    docente.mkdir(parents=True, exist_ok=True)
    if estudiantes.exists():
        shutil.rmtree(estudiantes)
    estudiantes.mkdir(parents=True, exist_ok=True)

    solucion = docente / "clinica_solucion.xmi"
    solucion.write_text(xml, encoding="utf-8")

    for name, builder in VARIANT_BUILDERS.items():
        variant = builder(xml)
        (estudiantes / f"{name}.xmi").write_text(variant, encoding="utf-8")

    zip_path = out_dir / "estudiantes.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(estudiantes.glob("*.xmi")):
            zf.write(path, arcname=path.name)

    (out_dir / "README.md").write_text(README, encoding="utf-8")

    print(f"OK fuente: {source}")
    print(f"OK salida: {out_dir}")
    print(f"  docente: {solucion.name}")
    print(f"  estudiantes: {len(list(estudiantes.glob('*.xmi')))} xmi")
    print(f"  zip: {zip_path.name} ({zip_path.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera fixtures batch clínica")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    generate(args.source, args.out)


if __name__ == "__main__":
    main()
