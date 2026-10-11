#!/usr/bin/env bash
# bench-route.sh — Medición reproducible de rutas para la auditoría de rendimiento
# Uso: bash bench-route.sh <url> [iteraciones] [salida.json]
# Mide: TTFB, tiempo total, tamaño transferido (contenido comprimido) y descomprimido.
set -euo pipefail

URL="${1:?Uso: bench-route.sh <url> [iteraciones] [salida.json]}"
N="${2:-5}"
OUT="${3:-}"

for i in $(seq 1 "$N"); do
  curl -s -o /dev/null -w "%{time_starttransfer}\t%{time_total}\t%{size_download}\t%{http_code}\t%{content_type}\n" \
    --compressed --max-time 120 "$URL"
done | awk -v url="$URL" 'BEGIN{print "ttfb\ttotal\tbytes\tcode\ttype\turl"}
{print $0"\t"url}'
