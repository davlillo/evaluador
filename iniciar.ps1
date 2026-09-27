# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

# Levanta el backend y el frontend en dos ventanas, desde la raiz del repo.
#
#   .\iniciar.ps1
#
# La primera vez instala lo que falte (venv, dependencias de Python y de npm).
# Para detenerlos, cerrar las dos ventanas que abre.

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$backend = Join-Path $raiz 'uml-evaluator\backend'
$frontend = Join-Path $raiz 'app'

Write-Host 'UML Evaluador' -ForegroundColor Cyan
Write-Host ''

# --- Backend ---------------------------------------------------------------
$python = Join-Path $backend 'venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    Write-Host 'Creando el entorno virtual de Python...' -ForegroundColor Yellow
    Push-Location $backend
    python -m venv venv
    Pop-Location
}

$marca = Join-Path $backend 'venv\.dependencias-instaladas'
if (-not (Test-Path $marca)) {
    Write-Host 'Instalando dependencias del backend...' -ForegroundColor Yellow
    & $python -m pip install --quiet --upgrade pip
    & $python -m pip install --quiet -r (Join-Path $backend 'requirements.txt')
    New-Item -ItemType File -Path $marca | Out-Null
}

# --- Frontend --------------------------------------------------------------
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Instalando dependencias del frontend (tarda unos minutos)...' -ForegroundColor Yellow
    Push-Location $frontend
    npm install --no-audit --no-fund
    Pop-Location
}

# --- Arranque --------------------------------------------------------------
Write-Host 'Levantando el backend en http://localhost:8000 ...' -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$backend'; & '$python' run.py"
)

Write-Host 'Levantando el frontend en http://localhost:5173 ...' -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$frontend'; npm run dev"
)

Write-Host ''
Write-Host 'Listo. Abri http://localhost:5173 en el navegador.' -ForegroundColor Cyan
Write-Host 'La documentacion de la API queda en http://localhost:8000/docs'
