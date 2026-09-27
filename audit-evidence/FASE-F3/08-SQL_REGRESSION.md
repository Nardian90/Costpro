# FASE F3 — 08 SQL REGRESSION (Gates F3-5/F3-6 prueba aislada + F3-8 validación SQL)

**Fecha**: 2026-09-27 · Scripts: `scripts/f3-sandbox-test.cjs` (prueba aislada), `scripts/f3-analyze.cjs` (extracción), `scripts/f3-analysis.json` (crudos). Cero acceso a producción; cero mutaciones de datos (§9/§22).

## Gate F3-5 — prueba aislada (sandbox, antes de tocar el repo)

Método: copias de los 6 archivos de migraciones en `/home/z/my-project/scripts/f3-sandbox/` → aplicar los 9 cambios candidatos → parsear ANTES y DESPUÉS con el extractor EXACTO del detector → aserciones por función:

```text
9/9 edits aplicados en sandbox sin ambigüedad (cada old_str = 1 coincidencia exacta)

| función | body sha | args | secdef | WRITE_RE | sp ANTES | sp DESPUÉS | sp objetivo |
|---|---|---|---|---|---|---|---|
| cleanup_old_aggregates/1 | idéntico b5c95f23 | idénticos | true→true | igual | (vacío) | pg_catalog,public | pg_catalog,public |
| close_service_order_as_sale/6 | idéntico 428c260c | idénticos | true→true | igual | (vacío) | extensions,public | extensions,public |
| fn_audit_stock_reception/0 | idéntico b3f8c687 | idénticos | true→true | igual | (vacío) | pg_catalog,public | pg_catalog,public |
| fn_audit_transaction_voiding/0 | idéntico 87a02da6 | idénticos | true→true | igual | (vacío) | pg_catalog,public | pg_catalog,public |
| purge_old_reset_snapshots/1 | idéntico e5476dfe | idénticos | true→true | igual | (vacío) | pg_catalog,public | pg_catalog,public |
| receive_production_output/4 | idéntico 30241fd1 | idénticos | true→true | igual | (vacío) | extensions,public | extensions,public |
| snapshot_commission_rule/0 | idéntico 0f694329 | idénticos | true→true | igual | (vacío) | pg_catalog,public | pg_catalog,public |
| upsert_usage_aggregate/7 | idéntico fdff5a4d | idénticos | true→true | igual | (vacío) | pg_catalog,public | pg_catalog,public |
| withdraw_production_item/4 | idéntico fbcc048b | idénticos | true→true | igual | (vacío) | extensions,public | extensions,public |

RESULTADO SANDBOX: ✅ 9/9 PASS — cambio mínimo probado (solo añade search_path; cero cambios funcionales)
```

Cobertura de los 10 puntos del mandato (§9):

1. **elimina el hallazgo del contrato** — sp DESPUÉS poblado en 9/9 → check 4 satisfecho (verificado después en el repo real: 07).
2. **mantiene la resolución de objetos** — 04: con pg_catalog+public (y extensions) TODOS los objetos resuelven igual; las referencias sin calificar (receive/withdraw) caen en public.* exactamente como antes.
3. **no altera el resultado funcional** — cuerpos byte-idénticos (sha256) → la ejecución es la misma.
4. **no modifica permisos** — 0 statements GRANT/REVOKE en el diff (06); CREATE OR REPLACE conserva ACLs existentes por semántica PG.
5. **no modifica RLS** — 0 statements de políticas en el diff.
6. **no modifica GRANT EXECUTE** — ídem 4.
7. **no cambia firmas** — argsRaw idéntico 9/9 (parser).
8. **no cambia retornos** — RETURNS idéntico 9/9 (INTEGER/uuid/TRIGGER/VOID).
9. **no cambia transacciones** — 0 cambios de BEGIN/COMMIT/ISOLATION; los triggers conservan su contexto.
10. **no introduce dependencias nuevas** — el path solo contiene schemas ya usados por la familia (pg_catalog/public/extensions); ningún objeto nuevo.

Pruebas NO ejecutadas por diseño (mandato §9 + §22): ninguna prueba mutativa contra datos reales; no se usaron ENER-VIDA, PUERTO PADRE ni TIENDA CENTRAL; no hubo sandbox con BD (no existe entorno de staging disponible sin credenciales; la prueba aislada es el replay estático — el mecanismo EXACTO que consume CI — y la equivalencia de resolución se probó analíticamente en 04).

## Gate F3-6 — comparación semántica ANTES/DESPUÉS por función

```text
ANTES                                    DESPUÉS                                   Δ
resolución:                              resolución:
  calificadas → public.*                  calificadas → public.*                   IDÉNTICO
  no calificadas → path de sesión         no calificadas → pg_catalog→public       IDÉNTICO en efecto
    ("$user", public → public.*)            (→ public.*; pg_catalog no sombra      (mismo objeto destino;
  pg_temp implícito-último en sesión        nada: 0 tablas/fns de negocio en        la resolución deja de
    (solo nombres de relación)              pg_catalog)                            depender de la sesión)
resultado esperado: idéntico al PRE (cuerpos byte-idénticos + resolución idéntica → mismas filas leídas/escritas)
única diferencia: el atributo proconfig `search_path` de la función (seguridad, no funcional)
```

## Gate F3-8 — validación SQL POST (9/9)

| verificación | resultado | evidencia |
|---|---|---|
| Sintaxis (parseo detector + estructura statement) | 0 errores — detector exit 2 no producido; statements completos | 02/07 |
| Existencia | 9/9 funciones presentes en el replay | 07 (Capa B 189 writeFns) |
| Firmas idénticas | 9/9 (argsRaw byte-idéntico) | sandbox + f3-analyze POST |
| Retornos idénticos | 9/9 (INTEGER/uuid/TRIGGER/VOID) | ídem |
| Permisos (EXECUTE/PUBLIC/roles) | sin cambios — 0 GRANT/REVOKE en diff; replay ACL idéntico (Capa C sin UNEXPECTED_ACL_DRIFT) | 07 |
| RLS | sin cambios — Capa C sin divergencias nuevas; 0 policies en diff | 07 |
| Cuerpos idénticos | 9/9 sha256 PRE=POST | scripts/f3-analysis.json |
| SECURITY DEFINER | 9/9 true→true | ídem |
| Volatilidad | 9/9 volatile→volatile | ídem |

Comprobación adicional del repo CI: `node scripts/ci-gate-sql-checks.js` → exit 0 (genera su checks.sql informativo; verificación psql LIVE fuera de alcance por no haber DATABASE_URL — la parte estática pasa).

## Gate F3-9 — regresión funcional

```text
$ CI=true bun run test          → exit 0
  Test Files  110 passed | 1 skipped (111)
       Tests  2278 passed | 24 skipped (2302)      ← 1:1 con baseline/F1/F2 (2278/0/24)
  Duration   210.69s

$ bunx tsc --noEmit             → exit 0 · 0 líneas de salida → 0 errors

$ bun run lint                  → exit 0 · 0 errors · 1294 warnings (stock idéntico a F1/F2)

$ NODE_OPTIONS=--max-old-space-size=4096 bun run build  → exit 137 (SIGKILL/OOM)
  Firma IDÉNTICA a R-INFRA-1 (preexistente F1/F2: "Creating an optimized production build …
  error: script "build" was terminated by signal SIGKILL") → NO es regresión (mandato §14);
  la autoridad para Build es CI (09-CI.md).
```

Smoke runtime HTTP no ejecutable localmente (el build local OOMea por R-INFRA-1 y no produce `.next`); la validación runtime corresponde a CI (Build SUCCESS + suite completa).
