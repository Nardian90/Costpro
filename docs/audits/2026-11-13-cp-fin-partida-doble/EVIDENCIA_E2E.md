# CP-FIN — Evidencia de validación (BD aislada + suite unitaria)

Fecha: 2026-11-13 · Rama: `feat/estados-financieros-20261113` · Evidencia: `audit-evidence/CP-FIN-20261113/`

## 1. Alcance de la validación

Motor de partida doble validado contra la BD E2E **aislada** (CostproE2E, ref `lguovmvrozxgssupkwpf`) mediante scripts Node vía Management API con guard de ref exacto (producción `wthkddeleylijmonclxg` rechazada por diseño). Producción prohibida para E2E (regla de sesión §9). Scripts persistidos y re-ejecutables en `/home/z/my-project/scripts/` (protocolo 11d).

## 2. Resultados

| Verificación | Resultado | Evidencia |
|---|---|---|
| Esquema FIN en aislado | 8 tablas `fin_*`, 44 categorías, 15 tipos documentales, 10 versiones de regla, centinela `e2e_is_isolated_db()=true` | `e2e-fin-schema-state.txt` |
| Smoke funcional del motor | TODO OK — Casos A (venta equilibrada 160 D = 160 C), C (servicio: gasto + CxP, pago sin doble gasto), idempotencia de pago (1 asiento), G (anulación compensatoria, originales reversed), ecuación patrimonial cuadrada (dif=0), Rendimiento neto 0 tras anulación | `e2e-fin-smoke.txt` |
| Signos del Estado de Rendimiento | income `{gastos:-100, rdo_operativo:-100, neto:-100}` vs dashboard `{gastos:100, neto:-100}` — convención consistente | `e2e-fin-sign-check.txt` |
| Guardrail de higiene | `PASS — net delta = 0` (stores=0, users=0; 5 tiendas protegidas por config intactas) | `e2e-fin-hygiene-guard.txt` |
| Suite unitaria FIN | 33/33 — contrato de migraciones (16), navegación (5), presentación/signos (8), smoke de vista (4) | `unit-fin-suite.txt` |
| Backfill (validación previa) | `dry_run` detecta pendientes reales; gate rechaza no-admins (commit 18f3f6e08) | commit message |

## 3. Estado de producción (read-only, 2026-11-13 13:29 UTC)

- **CERO tablas `fin_*`** en producción (`wthkddeleylijmonclxg`): la migración CP-FIN **NO está aplicada**.
- La aplicación a producción queda **pendiente del merge del PR** y decisión del propietario (patrón FASE 7 de NOMINAS-SC406: canal canónico Management API + registro `APLICACION_MIGRACION_*_PRODUCCION.md` con cuándo/qué/SHA, regla 11g).
- Las migraciones son idempotentes (CREATE IF NOT EXISTS / guards / DROP POLICY IF EXISTS) y el motor aísla errores en `fin_posting_errors` sin bloquear la operación comercial.

## 4. Residuos

Cero residuos en la BD aislada tras la validación completa (entradas=0, movimientos=0, errores=0; guard `net delta = 0`). Los scripts de smoke crean y limpian sus datos de prueba en la misma ejecución.

## 5. Reproducibilidad

```bash
# Requisito: SUPABASE_ACCESS_TOKEN en entorno (o .env del repo) + vars E2E de sesión
node /home/z/my-project/scripts/fin-diag-e2e.mjs            # diagnóstico read-only
node /home/z/my-project/scripts/fin-smoke-e2e.mjs           # smoke funcional (net delta 0)
node /home/z/my-project/scripts/fin-sign-check-e2e.mjs      # signos del Rendimiento
node e2e/scripts/data-hygiene-guard.cjs                     # guardrail formal
bun run vitest run src/__tests__/migrations/cp-fin-partida-doble-migration.test.ts \
  src/__tests__/navigation/fin-navigation.test.ts \
  src/__tests__/lib/fin-presentation.test.ts \
  src/__tests__/components/financial-statements-view.test.tsx
```
