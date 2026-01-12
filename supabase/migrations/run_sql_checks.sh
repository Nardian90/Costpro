#!/usr/bin/env bash
# Ejecuta sql_checks.sql y guarda salida en supabase/migrations

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL no está definido. Exporta DATABASE_URL antes de ejecutar."
  exit 1
fi

TS=$(date +%s)
OUTFILE="supabase/migrations/sql_checks_results_${TS}.txt"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/sql_checks.sql > "$OUTFILE" 2>&1

if [ $? -eq 0 ]; then
  echo "SQL checks ejecutados correctamente. Resultado: $OUTFILE"
else
  echo "Hubo errores. Revisa: $OUTFILE"
  exit 2
fi
