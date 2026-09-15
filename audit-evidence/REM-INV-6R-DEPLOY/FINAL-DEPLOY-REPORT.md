# REM-INV-6R — R1 DEPLOY REPORT

VEREDICTO: **R1 CLOSED — DEPLOY VERIFIED** · 2026-09-15T22:52Z

## Qué se desplegó (a producción, por orden explícita del propietario)

| Migración | Naturaleza | Resultado |
|---|---|---|
| `20260916000003` rescue_hidden_write_surface | Materialización canónica (sin cambio de comportamiento) | ✅ aplicada · defs verbatim (1 normalización CRLF→LF) · ACLs ya service_role-only (no-ops) |
| `20260916000004` kpi_store_access_guard | **Fix de seguridad** — guard `has_store_access` en `get_batch_store_daily_kpis` para callers no-service_role | ✅ aplicada · guard presente en LIVE · ACL `authenticated` preservada |

## Cadena de verificación (00→03)

1. **PRE** capturado (defs + ACLs + zero-touch) — KPI sin guard, como esperaba el residual R1
2. **Aplicación** vía script existente del repo (Management API) — 2× HTTP OK
3. **POST**: 6 defs idénticos / 1 con guard nuevo; 0 cambios de ACL; zero-touch **BITWISE IDENTICAL**
4. **Layer A LIVE**: 141/141, 0 violaciones, PIN REM-INV-2R OK
5. **Layer B/C estático**: CONTRATO OK, 141/141 representadas, 0 divergencias, mismos 9 LOW documentados
6. **Snapshot** regenerado (census read-only) — diff: timestamp + CRLF→LF únicamente
7. **App**: health OK post-deploy

## Impacto de seguridad

- **Cerrado** el hallazgo A6 (lectura cross-tenant de KPIs agregados vía RLS
  bypass SECDEF): cualquier caller `authenticated` que solicite tiendas sin
  membresía/acceso activo recibe SQLSTATE 42501 `ERR_UNAUTHORIZED_STORE`.
- service_role conserva capability sin guard (confianza interna explícita).
- El caller legítimo (dashboard client-side con tiendas propias) queda intacto
  (verificado en staging 14/14 y ACL sin cambios).

## Residual actualizado

- **R1: CLOSED** (esta evidencia).
- R2 (extender contract a SECDEF-read) y R3 (E2E CI preexistente) permanecen
  abiertos como fases futuras.
- 9 LOW SEARCH_PATH_NOT_SET históricos sin cambio.

## Proceso documentado

No se usó `supabase db push` (schema_migrations congelada en 20260615 —
proceso de facto es SQL directo; ver 01). Commit de cierre: evidencia
REM-INV-6R-DEPLOY + snapshot regenerado. Zero cambios de código de aplicación.
