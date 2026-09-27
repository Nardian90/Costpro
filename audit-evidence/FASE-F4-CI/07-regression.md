# FASE F4-CI — 07 Prueba de no-regresión

## Batería ejecutada tras el fix (rama `audit/f4-create-sale-v2-reconciliation`)

| Check | Resultado | Detalle |
|---|---|---|
| Security Audit (static contract) | **PASS** | exit 0 — `CONTRATO OK — Capa A: 141/141 · Capa B: 189 verificadas, 17 baseline, 0 nuevas · Capa C: 141/141 representadas, 0 divergencias` |
| Security Audit (LIVE contract, `security-contract-test.cjs`) | **PASS** | exit 0 — `Funciones verificadas: 141 · violaciones: 0 · PIN REM-INV-2R: receive_purchase(uuid) sigue ausente` |
| BOLA contract | **PASS** | `Resultados: 5 pasaron, 0 fallaron — Todos los endpoints tienen BOLA guard explícito` |
| V2-only contract | **PASS** | `V2-ONLY CONTRACT: PASS (baseline REM-V2-1 consistente)` |
| TypeCheck (`bunx tsc --noEmit`) | **PASS** | exit 0, cero errores |
| Lint (`bun run lint`) | **PASS** | exit 0, 0 errors / 1294 warnings (idéntico al baseline; warnings = deuda histórica) |
| Unit (`bun run test`, CI=true) | **PASS** | 109 files passed / 2 skipped; **2269 tests passed** / 33 skipped (216.5s). Incluye `src/__tests__/api/pos-checkout-price-integrity.test.ts` e integración (iteration-11/13/fiscal/rls) — la regresión funcional E-SEC |
| Build (`bun run build`) | **PASS parcial host** | Turbopack compile ✓ (70s) + `runAfterProductionCompile` ✓; fase TS embebida muere por OOM del host de 4GB (SIGKILL 137) — precedente `bbb74f4c` "local build OOM was host-only"; `tsc --noEmit` standalone PASS; validación final en CI (runner 7GB) |
| E2E (local, API-level) | **PASS** | `E2E-POS-001 (P0) venta cash exitosa registra transacción, items y descuenta stock` — 1 passed (19.7s) contra LIVE + servidor local. Prueba end-to-end real del camino E-SEC-FINAL (venta + integridad DB) |
| E2E (local, UI-level) | **FAIL (no F4)** | `E2E-POS-009 (P0) flujo completo UI` falla en fixture: `global-setup` reporta `product=N/A` (tienda piloto del admin sin productos activos → `TypeError: Cannot read properties of undefined (reading 'id')`). Drift de datos del harness, preexistente, sin relación con el cambio F4 (que no toca código TS ni el listado de productos). En CI el E2E ni siquiera llega aquí: `global-setup` aborta antes por secrets ausentes (categoría D) |
| Sección 20 — propiedades create_sale_v2/24 | **PASS 19/19** | Ver detalle abajo |

## Sección 20 — verificación LIVE de create_sale_v2/24 (post-fix)

```
✅ SECURITY DEFINER                          ✅ snapshot D4 (v_line_snapshot)
✅ search_path seguro (public,pg_temp)       ✅ columnas D4 en transaction_items (3/3)
✅ autorización supervisor (has_store_role)  ✅ rounding D5 (ROUND(x,2))
✅ permisos ACL canónico (sin anon)          ✅ inventario (register_stock_movement)
✅ precio server-side (ERR_INVALID_PRICE)    ✅ idempotencia (p_idempotency_key)
✅ descuentos por línea D1 (>=15 por línea)  ✅ auditoría (metadata lines/reason/jti)
✅ supervisor requerido (ERR_SUPERVISOR_...) ✅ supervisor_token_usages: RLS activo
✅ razón D2 (ERR_DISCOUNT_REASON_REQUIRED)   ✅ supervisor_token_usages: 0 grants anon/auth
✅ token D3 (p_supervisor_token_jti)
✅ JTI single-use (ON CONFLICT + TOKEN_REUSED)
```

ACL LIVE final: `{=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` — patrón canónico certificado.

## Zero-touch del fix LIVE

- La única operación en LIVE fue `REVOKE EXECUTE ... FROM anon` sobre la /24 — metadata ACL, sin datos, sin DDL, sin DML.
- Privilegios efectivos sin cambio (anon conserva EXECUTE vía PUBLIC, como siempre).
- Tiendas protegidas (E-SEC-FINAL §11): sin acceso a datos de tienda alguna durante toda la fase F4-CI (solo lecturas de catálogo de sistema: `pg_proc`, `information_schema`).
