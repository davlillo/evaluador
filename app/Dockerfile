# SPDX-FileCopyrightText: 2026 davlillos
# SPDX-License-Identifier: MIT

# Frontend de UML Evaluador: se compila con Node y se sirve con nginx.
#
# Se construye desde docker-compose.yml en la raíz del repo:
#     docker compose up --build

# --- compilación --------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Vacío = mismo origen: nginx reenvía /api al backend (ver src/lib/api.ts).
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

# base "/" y no "./" (el de vite.config.ts): con rutas relativas, al recargar
# /lote/desglose el navegador pediría /lote/assets/... y recibiría el HTML.
RUN npx tsc -b && npx vite build --base=/

# --- servidor -----------------------------------------------------------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
