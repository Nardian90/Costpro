# 03_OF1_PRE_HTTP — reproducción HTTP PRE-fix (§4) (raw: pre_http_out.txt)

Fecha: 2026-09-09T23:36Z · Camino real de FiscalCloseView (POST /api/fiscal-close)

## Setup
- Usuario fixture: admin@demo.com (uid a1111111-…-1111, profiles.role=admin, member STORE_A)
- Control positivo: GET /api/fiscal-close?store_id=STORE_A&year=2026&month=9 → HTTP 200
  {"status":"closed",...} (SELECT funciona; el defecto es solo en RPC de escritura)

## REPRO OF-1 (lock): POST {store_id, year:2026, month:9, action:'lock'} (periodo closed F2)
- HTTP **500**
- body: {"error":"Could not find the function public.lock_fiscal_period(p_month, p_store_id, p_user_id, p_year) in the schema cache"}
- PGRST202: PostgREST lista EXPLÍCITAMENTE los 4 argumentos enviados por la ruta; la firma
  real tiene 3 (p_store_id, p_year, p_month) → route argument mismatch demostrado.

## REPRO OF-3 (close): POST {store_id, year:2026, month:10, action:'close'} (sin fila previa)
- HTTP **500**
- body: {"error":"relation \"public.fiscal_period_closures\" does not exist"}
- 42P01: la tabla referenciada por close_fiscal_period no existe (05_FISCAL_MODEL_MAP).

## 0 estado parcial tras ambos intentos (verificado en vivo)
- F2 sigue: status='closed', locked_by=NULL
- 0 filas nuevas 2026-10 (preexistente 3f410a7a de F4-06b, sin cambios)
- n_audit_fiscal = 10 (sin nuevas filas de auditoría)

CONCLUSIÓN: el 500 de lock es EXCLUSIVAMENTE route argument mismatch (mismo usuario,
mismo store, mismo JWT logra 200 en GET/SELECT) — no hay otro defecto en el camino.
