"""
CLI para generar la plantilla Excel de rúbrica de evaluación. La lógica de
construcción vive en app/parsers/rubric_template_builder.py (también usada
por el endpoint GET /api/rubric-template).

Uso:
  python scripts/generate_rubric_template.py [ruta_salida.xlsx]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.parsers.rubric_template_builder import generate_rubric_template  # noqa: E402

DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "rubric_template.xlsx"


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    path = generate_rubric_template(out)
    print(f"Plantilla generada en: {path}")
