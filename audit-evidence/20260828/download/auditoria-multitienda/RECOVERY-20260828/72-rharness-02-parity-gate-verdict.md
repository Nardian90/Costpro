# 72 · R-HARNESS-02 — GATE DE PARIDAD: VEREDICTO

Fecha: 2026-08-28 · Autoridad: protocolo del dueño (Opción A → cargar DDL → migraciones → paridad objeto-a-objeto; «si la paridad falla en un solo objeto material → STOP»).

## Cadena actualizada

```text
RECONSTRUCTED W6 .............. ✅ (9/9, congelado)
PRODUCTION-SCHEMA-SNAPSHOT ... ✅ NUEVO (RECOVERED, informe 71, SHA-256)
HARNESS (lab 17.11) .......... ✅ costpro_audit_v2 = ESPEJO EXACTO DE PROD (S1 diff = 0)
PARITY GATE .................. ✅ PASS (checks 1–9) + checks 10–11 ejecutados y documentados
CASOS A–F .................... ⏳ Siguiente etapa (desbloqueada por este gate)
W6.1 ......................... 🔒 Requiere casos A–F antes
W7 ........................... ⛔ No autorizado (sin cambios)
Producción ................... ✅ Cero mutaciones; solo SELECT de catálogo autorizados por Opción A
```

## 1. Veredicto por los 11 checks del dueño

| # | Check | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Tablas | **PASS** | S1 diff = 0 (`fingerprint/s1-vs-prod.diff` vacío) |
| 2 | Enums | **PASS** | ídem (13/13, labels idénticos) |
| 3 | Columnas/tipos | **PASS** | ídem (orden relativo, tipos, defaults, identity, generated, storage, collation) |
| 4 | Constraints | **PASS** | ídem (581, con deferrable/validated/NOT VALID) |
| 5 | Índices | **PASS** | ídem (definición canónica completa) |
| 6 | Funciones | **PASS** | ídem (478: firma + kind + md5 de cuerpo) |
| 7 | Triggers | **PASS** | ídem (81; def canónica) |
| 8 | RLS | **PASS** | ídem (flags enable/force por tabla + 390 policies con roles/qual/with_check) |
| 9 | Grants | **PASS** | ídem (relaciones, funciones con normalización REVOKE-first, esquema, PUBLIC incluido) |
| 10 | Reaplicación de migraciones | **EJECUTADO** | 369 migraciones → 199 OK / 88 ERR / 10 skip sobre el espejo (`replay/migration-ledger-v3.txt`) |
| 11 | Las 123 OK previas no cambian semántica inesperadamente | **PASS con hallazgos enumerados** | 100/123 siguen OK; 23 ahora ERR, **todas** clasificadas como clase esperada (ver §3); drift repo↔prod cuantificado (§4), nada «inesperado» sin trazabilidad |

**GATE: PARITY = PASS.** El eslabón que faltaba (esquema base) quedó cerrado con evidencia de producción y verificación objeto-a-objeto.

## 2. El baseline del harness (intocable)

- `costpro_audit_v2` = espejo exacto de producción (S1 = 0 diff). **NO fue mutado por el replay**: el replay se ejecutó sobre una copia (`costpro_audit_v3`, creada por `TEMPLATE`). Los casos A–F correrán sobre **v2** (comportamiento = producción real).
- `costpro_audit` (cluster virgen de 369 migraciones, ledger v1) se conserva como historia forense del primer intento.

## 3. Clasificación de las 23 migraciones OK-v1 → ERR-v3 (`replay/ok-v1-now-err-23.txt`)

| Clase | Ejemplos | Lectura forense |
|---|---|---|
| «cannot change return type / name of function» (15) | fix_double_stock_update v1/v2/v3, v2_5_5, v2_7, v2_10_3, v2_11_2/4, v2_12_9/12/33, bulk_update_products, reset_store_data… | Revisiones intermedias del repo superseded por la definición final que ya vive en prod. El espejo no acepta `OR REPLACE` con firma distinta: señal de consistencia, no de drift |
| «policy/constraint already exists» (5) | exchange_rates_capture_method, v2_15_1, v2_25_1, v2_26_hotfix3 | Efecto ya presente en prod (duplicado de aplicación) |
| Otras (3) | rss_mipymes (INSERT columnas), commission_no_overlap (constraint ausente), rss_gaceta (función) | Repo intenta operar sobre estados intermedios inexistentes en prod; sin efecto material en el espejo |

**Las 23 no constituyen drift del harness**: la huella S1 demuestra que el estado final del espejo ≡ prod.

## 4. Hallazgo mayor para W6.1: DIVERGENCIA REPO ↔ PROD (S2)

El replay del repo completo sobre el espejo produce **844 líneas de delta** (`fingerprint/s2-vs-prod.diff`, `replay/s2-classified.json`):

**Repo POR DELANTE de prod (adiciones — código no desplegado):**
- 3 tablas nuevas: `fc_automation_config`, `fc_generation_log`, `fc_pdf_cache` (módulo entero ausente en prod)
- 50 columnas (incl. `cash_closures.opening_balance/cash_movements_total/difference`), 24 constraints, 16 índices, 28 funciones, 7 triggers, 48 policies, ~219 grants
- 1 vista nueva

**Repo MODIFICA prod (85 funciones con md5 de cuerpo distinto al aplicar el repo):**
- Incluye lógica sensible al WAC y al flujo de caja: `adjust_total_amount`, `apply_physical_count`, `approve_transfer`, `bulk_update_products`, `auto_match_bank_items`, toda la familia `audit_*` (lista íntegra con hashes en `replay/funciones-modificadas-repo-vs-prod.txt`)
- 1 constraint y 7 policies con definición distinta

**Repo DESTRUIRÍA objetos de prod (eliminaciones si el repo se aplicase):**
- **7 columnas existentes en prod que el repo no conoce** (would-drop por evolución divergente)
- 2 triggers (`trg_maintain_product_completeness`, versión previa de `trigger_audit_product_changes`)
- 9 policies, 2 grants de función, 1 vista

**Lectura para la auditoría:** prod contiene estado que NO deriva linealmente del repo (hotfixes/manuales o despliegues parciales). El «código de producción» y el «código del repo» difieren en exactamente los puntos que W6.1 necesita examinar (WAC, cierres de caja, ajustes de total, auditoría de cambios). Esta enumeración es un **registro de hallazgos**, no un fallo del gate: la paridad del harness (espejo de prod) es exacta.

## 5. Notas de replay (transparencia)

- 1 de los 88 ERR es un falso positivo del runner: `20260618000001_add_customer_to_transactions.README.md` (documentación con prefijo timestamp) — a excluir en futuros runs.
- 2 archivos SQL con `syntax error` real ya eran ERR en el ledger v1 (no son regresiones).
- Los «relation does not exist» masivos son en su mayoría NOTICE de `DROP ... IF EXISTS` dentro de DO-blocks (verificados en `migration-errors-v3.log`).
- Gap de shim de plataforma detectado: migraciones que tocan `storage.objects` (el shim solo trae `storage.buckets`) — son objetos de plataforma, fuera del alcance de negocio.

## 6. Estado de bloqueos (sin cambios)

⛔ No GO (se mantienen): modificar producción; RPC mutativa en producción; extraer datos; W6.1 (requiere casos A–F); modificar código funcional; W7; backfill; corregir defectos WAC.

✅ Desbloqueado por este gate: **casos canónicos A–F sobre `costpro_audit_v2`** (espejo exacto de producción).
