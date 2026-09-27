# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""Archivos que llegan a la API: carpeta temporal, ZIP de entregas y carnés."""

import os
import re
import shutil
import zipfile
from typing import List, Dict



# Crear directorio de uploads si no existe
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


os.makedirs(UPLOAD_DIR, exist_ok=True)

VALID_UML_EXTENSIONS = {'.xmi', '.xml', '.uml'}

GENERIC_STUDENT_IDS = {
    'clase', 'clases', 'class', 'classes',
    'caso', 'casos', 'casodeuso', 'casosdeuso', 'usecase', 'usecases',
    'secuencia', 'sequence',
    'dc', 'dcu', 'ds',
}


def is_hidden_or_system_path(path_parts: List[str]) -> bool:
    for part in path_parts:
        cleaned = part.strip()
        if not cleaned:
            continue
        if cleaned.startswith('.') or cleaned.startswith('__MACOSX'):
            return True
    return False


def safe_extract_zip(zip_path: str, target_dir: str) -> None:
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for member in zf.infolist():
            normalized = member.filename.replace('\\', '/')
            parts = [p for p in normalized.split('/') if p not in ('', '.')]
            if not parts or is_hidden_or_system_path(parts):
                continue
            if any(p == '..' for p in parts):
                continue
            out_path = os.path.join(target_dir, *parts)
            abs_target = os.path.abspath(target_dir)
            abs_out = os.path.abspath(out_path)
            if not abs_out.startswith(abs_target):
                continue
            if member.is_dir():
                os.makedirs(abs_out, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(abs_out), exist_ok=True)
            with zf.open(member, 'r') as src, open(abs_out, 'wb') as dst:
                shutil.copyfileobj(src, dst)


#: Carné UES: dos letras y cinco dígitos (AB12345).
CARNE_RE = re.compile(r'(?<!\d)([A-Za-z]{2}\d{5})(?!\d)')


def student_id_from_filename(filename: str) -> str:
    """El nombre del archivo es el carné, pero a veces viene con basura
    ("proyect.xmiRM25034.xmi"). Si adentro hay exactamente un carné, vale ese."""
    stem = os.path.splitext(os.path.basename(filename))[0].strip()
    carnes = CARNE_RE.findall(stem)
    if len(carnes) == 1:
        return carnes[0].upper()
    return stem


def index_students_from_dir(extracted_dir: str) -> Dict[str, str]:
    indexed: Dict[str, str] = {}
    for root_dir, _, files in os.walk(extracted_dir):
        for filename in files:
            ext = os.path.splitext(filename.lower())[1]
            if ext not in VALID_UML_EXTENSIONS:
                continue
            full_path = os.path.join(root_dir, filename)
            # Regla principal: estudiante = carné en el nombre del archivo.
            student_id = student_id_from_filename(filename)
            normalized = ''.join(ch.lower() for ch in student_id if ch.isalnum())
            if normalized in GENERIC_STUDENT_IDS:
                # Si el nombre es genérico (CLASES/CASOS/SECUENCIA), intentar carpeta padre.
                parent_candidate = os.path.basename(root_dir).strip()
                parent_normalized = ''.join(ch.lower() for ch in parent_candidate if ch.isalnum())
                if parent_candidate and parent_normalized not in GENERIC_STUDENT_IDS:
                    student_id = parent_candidate
            if not student_id:
                continue
            if student_id not in indexed:
                indexed[student_id] = full_path
    return indexed


def merge_student_maps_with_fallback(student_maps: Dict[str, Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    all_students = set()
    for kind in ('class', 'usecase', 'sequence'):
        all_students.update(student_maps.get(kind, {}).keys())

    # Caso normal: devolver unión por nombre detectado.
    merged = {
        sid: {
            'class': student_maps.get('class', {}).get(sid),
            'usecase': student_maps.get('usecase', {}).get(sid),
            'sequence': student_maps.get('sequence', {}).get(sid),
        }
        for sid in sorted(all_students)
    }
    if any(v['class'] and v['usecase'] and v['sequence'] for v in merged.values()):
        return merged

    # Fallback: si cada ZIP trae exactamente 1 archivo, forzar una sola tupla.
    if all(len(student_maps.get(kind, {})) == 1 for kind in ('class', 'usecase', 'sequence')):
        return {
            'estudiante_1': {
                'class': next(iter(student_maps.get('class', {}).values()), None),
                'usecase': next(iter(student_maps.get('usecase', {}).values()), None),
                'sequence': next(iter(student_maps.get('sequence', {}).values()), None),
            }
        }
    return merged
