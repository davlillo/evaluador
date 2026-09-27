# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

"""La firma de davlillos viaja con todo lo que produce el sistema."""
from starlette.responses import JSONResponse

from app.api.main import app, firma_de_autoria
from tests.api_helpers import run


def test_cada_respuesta_de_la_api_lleva_la_firma_del_equipo():
    async def siguiente(_request):
        return JSONResponse({"ok": True})

    respuesta = run(firma_de_autoria(None, siguiente))

    assert respuesta.headers["X-Desarrollado-Por"] == "davlillos"


def test_la_documentacion_de_la_api_nombra_al_equipo():
    esquema = app.openapi()

    assert esquema["info"]["contact"]["name"] == "davlillos"
    assert esquema["info"]["license"]["name"] == "MIT"
    assert "davlillos" in esquema["info"]["description"]
