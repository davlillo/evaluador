# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

# Backend de UML Evaluador (FastAPI).
#
# Se construye desde docker-compose.yml en la raíz del repo:
#     docker compose up --build
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/backend

# primero las dependencias: si solo cambia el código, esta capa se reusa.
# Sin gensim (y el scipy que arrastra, ~200 MB): solo sirve para el matching
# semántico con FastText, que la app no usa porque medido contra las notas del
# docente empeora el resultado. Sin él, semantic_matcher cae a la heurística.
COPY requirements.txt .
RUN grep -iv '^gensim' requirements.txt > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt

COPY app ./app

# sin usuario root: el backend solo escribe en uploads/ (archivos temporales)
RUN useradd --create-home --uid 1000 evaluador \
    && mkdir -p uploads \
    && chown -R evaluador:evaluador /srv/backend
USER evaluador

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=4)"

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
