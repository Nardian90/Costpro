# ADDENDUM DE VERIFICACIÓN POST-MERGE — CP-POST-MERGE-VERIFICATION-003
## Verificación integral del PR #1627 tras su fusión a `main` (2026-11-15)

Antecedente: `audit-evidence/CP-POST-MERGE-EXECUTION-002/EXPEDIENTE.md` (ejecución de la adenda
vinculante: freno TRUNCATE, 1 CUP nominal, clasificación `venta`, fix del importador). Este
addendum **verifica** — no repite — esa ejecución: el PR #1627 ya está fusionado y esta misión
comprueba que el código fusionado está integrado en `main`, desplegado en producción y funciona
correctamente. Principio rector: **verificar antes de modificar; proteger la producción por
encima de completar rápidamente**. Todas las consultas a producción fueron **read-only**.

---

## §1. Verificación de integración (BLOQUE 1) — OK

| Verificación | Resultado [MEDIDO 2026-11-14 20:00–20:30 UTC] |
|---|---|
| PR #1627 | `closed`, **merged: true**, fusionado `2026-11-14T17:59:59Z` |
| **Merge commit** | **`337df822822b2df0975fda7ba14497525ff2c6eb`** (padres: `aa3e9e8c0` main previo + `27865bf78` cabeza de rama) |
| `main` contiene el merge | **Sí — es el HEAD actual de `main`** (local = `origin/main` = HEAD) |
| `compare` merge↔main | `identical`, ahead 0 / behind 0 |
| Commits de la rama en main | 5/5 (`5600ef0af`, `6096d17b0`, `fa65161c2`, `671ff6258`, `27865bf78`); `git diff 27865bf78 main` **vacío** |
| Cambios pendientes de integrar | **Ninguno del PR #1627** (rama totalmente contenida; working tree limpio) |
| Workflows de CI sobre el HEAD | **4/4 success** en `337df8228` (evento `push` a main, `2026-11-14T18:00:02Z`): CI, Test Coverage, Security CI Gate, SQL Security Gate |

Observación registrada (no afecta esta verificación): existe **1 PR abierto posterior**,
#1628 «CP-FIN-VALUATION-RECTIFICATION-003» (creado `2026-11-14T19:23:16Z`, trabajo nuevo del
propietario sobre rectificación histórica de valuación). `main` NO lo incluye y no debe
incluirlo: es trabajo posterior e independiente al objeto de esta verificación.

Nota de árbol: el merge commit tiene árbol **idéntico** a `27865bf78` (cabeza de la rama del
PR) porque la rama se creó sobre el main vigente (`aa3e9e8c0`) y main no avanzó en paralelo.
Esto permite reutilizar con seguridad la evidencia de CI ejecutada sobre `27865bf78` (ver §5).

## §2. Verificación del despliegue (BLOQUE 2) — OK

| Verificación | Resultado [MEDIDO] |
|---|---|
| Deployment de Vercel asociado al merge | GitHub Deployment **id 7791554992**, environment **Production**, **sha `337df8228`** (el merge commit), creado `2026-11-14T18:01:36Z`, estado **success** («Deployment has completed») |
| ¿Deployment posterior que lo desplace? | **Ninguno** — los deployments posteriores son todos Preview/e2e-isolated de la rama del PR #1628 (`530e4a5bd`, `67e0ce430`, `93e07a029`, `5970107e7`). El deployment de **Producción vigente corresponde al merge commit** |
| URL de producción | https://costpro4.vercel.app → **HTTP 200** (2.0 s, `x-vercel-id: hkg1::iad1::…`) |
| Health endpoint | `GET /api/health` → **200** `{"status":"ok","service":"costpro-enterprise",…}` (sin versión/uptime: FIX-SEC-03 los oculta en producción — comportamiento correcto) |
| URL específica del deployment | Redirige 302 al SSO de Vercel (protección de deployment sobre alias no-productivos — esperado; el dominio productivo es el que sirve el tráfico) |
| PM2 / Socket.io | **No forman parte del entorno de despliegue de producción** (Vercel sirve Next.js estándar; PM2 + servidor custom con Socket.io son entorno local de desarrollo, verificado online con health 200 en localhost). Cumple el condicional del mandato («si forman parte del entorno de despliegue») |
| Prueba funcional de código del PR en el bundle | La UI productiva renderiza el **Centro de Análisis de Costos** con la columna «Costo Prom. (WAC)» y el catálogo con la columna «Costo» — ver §4 |

## §3. Verificación del frontend del reporte de costo nominal (BLOQUE 3) — OK

Sesión real (navegador, credenciales de administrador documentadas) contra
**https://costpro4.vercel.app** (deployment 7791554992). Solo lectura: navegación y
consultas; cero escrituras.

### 3.1 Centro de Análisis de Costos (COSTO → Análisis de datos)

Informe construido en vivo con los campos Producto / **Costo Manual** / **Costo Prom. (WAC)** /
Precio Venta (mismos orígenes de datos que usa la app en producción):

| Comprobación | Resultado |
|---|---|
| Registros del informe (ENERVIDA) | **258 registros · 258 grupos** = exactamente los 258 productos de la tienda en BD |
| Productos con WAC = $1.00 | **182** en la UI = **182** en la BD (verificación cruzada read-only) |
| …de ellos con Costo Manual $0.00 | **171** UI = **171** BD; con costo documentado >0: **11** UI = **11** BD |
| Caso ejemplar PBM-001 («PRUEBA MISIÓN 2026-10-22») | Costo Manual **$100.00** (documental, preservado) · Costo Prom. WAC **$1.00** (nominal) · Precio Venta **$150.00** (intacto) |
| WAC reales NO sustituidos por el nominal | p.ej. «Yee MC4»: WAC **$6,800.00** (recepciones reales) — el nominal 1 CUP solo aplica donde el promedio era cero |
| Distinción nominal vs documental | Columnas separadas y etiquetadas distinto («Costo Manual» vs «Costo Prom. (WAC)»): el 1 CUP nominal **no se presenta como costo real de adquisición** |
| Vista móvil (375×667) | El informe renderiza con los mismos 258 registros y 182 WAC $1.00; catálogo móvil muestra PBM-001 con Costo $100.00 / Precio $150.00 |

### 3.2 Catálogo de productos (ALMACÉN → INVENTARIO → CATÁLOGO) y multi-tienda

- ENERVIDA (desktop + móvil): PBM-001 → columna **Costo $100.00** (costo documental intacto,
  NO reemplazado por el nominal), Minorista **$150.00** (precio de venta intacto).
- QA UI Icons Store (segunda tienda, como superadmin): QA-ICON-001 → **Costo $50.00** /
  Precio $100.00; QA-ICON-002 → **Costo $80.00** / Precio $200.00. Los 4 costos documentales
  de referencia (PROD-033 13200; PBM-001 100; QA-ICON-001 50; QA-ICON-002 80) verificados
  intactos en BD y en UI.
- Sin alteraciones de precios de venta, costos documentales ni movimientos históricos
  (ver §4-K/L): la adenda solo tocó `products.cost_average` y `products.operational_class`.

Capturas: `ui-003-*.png` (login, terminal, catálogo, informe completo, informe PBM-001,
informe móvil, QA store).

## §4. Verificaciones críticas de producción (BLOQUE 4) — OK con 1 hallazgo (§6)

Batería read-only re-ejecutada el 2026-11-14 ~20:28 UTC (script
`scripts/sql/verify_post_merge_003_hoy.sql` del sandbox, reutilizable; salida
`verify_post_merge_003_hoy.json`). Todas las consultas pasan por el guard fail-closed
que rechaza cualquier sentencia de escritura.

| # | Control | Resultado esperado | Resultado [MEDIDO] |
|---|---|---|---|
| A | Freno TRUNCATE: función `block_truncate` | Endurecida | SECURITY INVOKER + cuerpo bloquea `anon`/`authenticated` ✓ |
| A2 | Triggers del freno | 34/34 ENABLE ALWAYS | **34/34 `tgenabled='A'`**, 0 no-A, 34 tablas distintas ✓ |
| B | `cost_average` nulo/cero/negativo | 0 en el universo de la fusión (355) | **97/97 asignados conservan 1** (ver C); 0 nulos, 0 negativos; **64 ceros NUEVOS post-fusión por acción del propietario — hallazgo §6, NO regresión** |
| C | Asignación nominal 97/97 | Snapshot íntegro | **97/97 en 1 CUP**, 0 divergentes, **0 costos documentales alterados**, 0 precios nulos, 0 clasificaciones alteradas ✓ |
| D | Clasificación operativa | 355/355 `venta` | **355/355 `venta`** (+ 64 nuevos del §6 también `venta` por DEFAULT: 419/419), 0 nulos, 0 fuera de enum ✓ |
| D2 | Columna `operational_class` | NOT NULL + DEFAULT `venta` | Confirmado ✓ |
| E | Importador `managed_bulk_import_products` | Defaults correctos + anti-degradación | `nominal_cost_assigned` ✓, DEFAULT `venta` ✓, origen moneda extranjera reportado (`non_cup_cost_not_seeded_pending_wac`) ✓, re-import conservador (`v_oc_was_default`, sin tocar `cost_average`/stock/imagen) ✓ |
| F | WAC: escritor canónico + guard | Activos | `fn_recalc_wac` presente ✓; **trigger `trg_guard_wac_writer` ACTIVO** (función `w62_guard_wac_writer`, tgtype 19 = BEFORE UPDATE ROW, `tgenabled='O'` habilitado) ✓; **97 asientos en `wac_change_log`** de la asignación nominal (95 canónicos + 2 QA manuales auditados) ✓ |
| G | Libro de migraciones | Registrado y conciliado | 59 filas / 58 applied; adenda completa (ids 55–60: `20261110120000-2` = 55, `20261114180300` = 56, `20261114190000` = 57, `20261114190100` = 58, `20261114190200` = 59, `20261114190300` = 60); `ledger-sync-check` **exit 0, OK** ✓ |
| H | Tabla auditoría 1 CUP | RLS deny-all | `relrowsecurity=true`, **0 políticas** (solo owner/service_role) ✓ |
| I | Multitienda | Sin contaminación | RLS activo en `products`/`stores`/`master_products`/`transactions`; **0 productos huérfanos**; `master_products` = **260 sin cambios** (el catálogo maestro compartido no se tocó); distribución por tienda coherente ✓ |
| J | Delta de negocio | Sin alteraciones por el merge | products 355→419 (+64 = §6), transactions 1010→1012 (2–3 ventas normales ENERVIDA 19:08–19:13 UTC, una voided), masters 260 (0), stores 7 (0) ✓ |
| K | Precios de venta | Íntegros | 0 negativos, 0 nulos ✓ |
| L | Movimientos históricos | Sin recodificar | Distribución por tipo (sale 1062, purchase 309, adjustment 77, issue_slip_out 306, return/void/reverse…) — la adenda no tocó `stock_movements` ✓ |

**Prohibiciones respetadas**: ninguna operación destructiva ni escritura de prueba sobre
producción (guard fail-closed activo en todas las consultas); ninguna migración aplicada
fue modificada; ninguna operación completada fue repetida.

## §5. CI y controles sobre el HEAD actual (BLOQUE 5) — OK

### 5.1 Ejecutados EN esta verificación (HEAD `337df8228`, sandbox local)

| Control | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | **0 errores** (exit 0) |
| ESLint | **0 errores** (1.569 warnings preexistentes, sin cambios de umbral) |
| Suite unitaria+integración (vitest, segmentada) | **6069 PASS / 0 FAIL** — idéntico al conteo del PR |
| `check-writers` | OK (40 guards producción + 18 aislamiento + 103 excepciones) |
| `check-destructive-guard` | OK (CP-INFRA-020 sin destructivos sin guard) |
| `build-migrations-replay --check` | **MATCH** (digest `75fbbbe7377e48f2…`, manifiesto 171 migraciones, sin deriva) |
| `security-contract-test.cjs` (contrato **LIVE** contra producción) | **208/208 funciones, 0 violaciones** |
| `ledger-sync-check` | **OK, exit 0** (libro sincronizado; 2 no-aplicadas documentadas: `20261106120000` no-op por diseño y `20261110090000` sustituida por la correctiva `20261114190100`) |
| `verify-remote-e2e` (BD aislada CostproE2E) | **OK — centinela=true, REST 200, Base aislada PREPARADA** |

### 5.2 Heredados (evidenciados por CI sobre el MISMO árbol, SHA `27865bf78` ≡ HEAD de main)

Distinguimos explícitamente — como exige el mandato — entre lo ejecutado arriba y los
resultados históricos heredados del PR:

- **GitHub Actions sobre `337df8228`** (push del merge, `18:00:02Z`): CI ✓, Test Coverage ✓,
  Security CI Gate ✓, SQL Security Gate ✓ — 4/4 success. (Ejecutados por GitHub sobre el
  HEAD; reportados aquí como estado, no re-ejecutados.)
- **E2E Aislado (CostproE2E)** sobre `27865bf78` (árbol idéntico al HEAD de main, diff vacío):
  **success** (`2026-11-14T17:45:41Z`, evento pull_request). Incluye el replay actualizado
  (171 migraciones) y el guard de residuos net-zero. No se repite localmente porque el árbol
  es idéntico y el mandato prohíbe re-ejecutar pasos ya completados.

## §6. Hallazgos (con clasificación e impacto)

### H-1 [IMPORTANTE — nuevo, NO regresión del PR #1627] 64 productos con costo promedio cero creados tras la fusión por activación de maestros

- **Qué**: entre `2026-11-14T19:56:34Z` y `19:58:37Z`, **admin@demo.com** (superadmin — el
  propietario) ejecutó `CHANGE_ACTIVE_STORE` (19:54Z) y **64 × `ACTIVATE_MASTER_PRODUCT`** en
  la tienda **PUERTO PADRE**. Los 64 productos nuevos tienen `cost_price=0`, `cost_average=0`,
  `price=0`, `stock=0`, sin movimientos, todos `venta`.
- **Impacto**: el invariante «0 productos con costo promedio cero» (logrado por la decisión
  del 1 CUP sobre los 97) queda erosionado: 64 ceros nuevos. Los **97 de la decisión siguen
  intactos al 100%** (§4-C) y los reportes siguen siendo coherentes (los 64 muestran WAC $0.00
  y aún no son vendibles: precio 0, stock 0).
- **Por qué NO es regresión del PR #1627**: la vía usada es `activate_master_product`, **fuera
  del alcance del fix del importador** (que cubre `managed_bulk_import_products`). El cuerpo
  de `activate_master_product` (re-certificado por `20261114190100`) inserta por diseño una
  fila local «pendiente de primera recepción» con price=0/cost_price=0/sin stock (misión
  maestro §10: sin contaminación entre tiendas); el WAC real llega con la primera recepción
  vía `fn_recalc_wac`. La decisión nominal del propietario cubría **los 97 existentes al
  2026-11-14**, no incorporaciones futuras.
- **Clasificación**: IMPORTANTE (no bloquea el cierre — los 6 criterios se cumplen — pero
  requiere decisión y acción del propietario).
- **Plan correctivo propuesto** (ninguna acción ejecutada — la producción no se tocó):
  1. **Decisión del propietario** sobre los 64: (a) asignarles el nominal 1 CUP (extensión
     explícita de la decisión, nueva migración con snapshot propio, o (b) mantenerlos a la
     espera de recepciones/precios reales (comportamiento diseñado), o (c) asignar costos y
     precios reales desde la UI.
  2. **Prevención de reincidencia** (si se opta por nominal universal): extender la siembra
     nominal a `activate_master_product` mediante **migración NUEVA** (jamás modificar las
     aplicadas `20261114190100`/`20261114190200`, inmutables por el replay).
  3. Mientras tanto, el reporte de la UI ya distingue WAC $0.00 de los demás y el catálogo
     marca «sin costo» — la visibilidad existe.

### Observaciones menores (MENOR, informativas)

- O-1: PR #1628 abierto (trabajo nuevo del propietario, rectificación histórica de valuación).
  No afecta `main`; su rama tiene deployments Preview/e2e-isolated propios.
- O-2: 2–3 transacciones de venta nuevas en ENERVIDA (19:08–19:13Z, una anulada) — actividad
  productiva normal post-fusión que confirma la app operativa.
- O-3: el URL específico del deployment (alias `costpro-ozkzlvvj5…`) está tras SSO de Vercel
  (protección de deployments no-productivos): la verificación HTTP se hizo sobre el dominio
  productivo, que es el que sirve tráfico.

## §7. Diferencias con el expediente CP-POST-MERGE-EXECUTION-002

| Aspecto | Expediente 002 (ejecución, 14/11 temprano) | Esta verificación (14–15/11) |
|---|---|---|
| Estado del PR #1627 | Abierto, CI 5/5 verde, pendiente de merge | **Fusionado** (`337df8228` = HEAD de main) |
| Deployment | Pendiente (el frontend del informe nominal «pendiente merge → Vercel») | **Production 7791554992 = merge SHA, success**; informe nominal verificado EN producción |
| Universo de costos | 355 productos, 0 cero tras la asignación | 97/97 intactos; **+64 ceros nuevos** por activación del propietario (H-1) |
| Evidencia de tests | Suite local pre-merge (6069) + CI del PR | Re-ejecutada HOY sobre el HEAD fusionado (6069/6069, tsc/eslint/guards/contrato LIVE/ledger OK) + CI heredado 4/4 sobre el merge |
| Libro | 59 filas al cierre de la ejecución | 59 filas (sin cambios; ledger-sync-check OK re-ejecutado) |

## §8. Juicio de cierre — Criterios del mandato (6/6)

| # | Criterio | Estado |
|---|---|---|
| 1 | El merge está confirmado en `main` | **CUMPLE** (§1) |
| 2 | El deployment corresponde al commit del merge | **CUMPLE** (§2: Production 7791554992, sha 337df8228, Ready/success, sin deployment productivo posterior) |
| 3 | La aplicación responde correctamente | **CUMPLE** (§2: HTTP 200 + health ok; sesión real de navegación productiva completa) |
| 4 | El reporte de costo nominal es visible y coherente | **CUMPLE** (§3: 258/182/171/11 exactos contra BD; distinción Manual/WAC clara; desktop + móvil; multi-tienda) |
| 5 | Los controles críticos de producción están intactos | **CUMPLE** (§4: freno 34/34, 97/97 nominales, 355/355 venta, libro conciliado, importador con defaults, guard WAC activo, multitienda sin contaminación, movimientos históricos intactos) |
| 6 | No hay regresiones críticas | **CUMPLE** (H-1 NO es regresión del PR: vía distinta, acción posterior del propietario, fuera del alcance fusionado; los 97 y todos los controles del merge intactos) |

### **VEREDICTO: VERIFICACIÓN CERRADA (6/6 criterios cumplidos)**

con **1 hallazgo IMPORTANTE (H-1)** que queda registrado con plan correctivo para decisión del
propietario — no oculta fallos ni presenta éxitos parciales como cierre completo: el cierre
alcanza al **PR #1627 y su despliegue**; el hallazgo H-1 es un hecho nuevo posterior, con
impacto y plan documentados en §6.

## §9. Evidencia reproducible

- Script de integración/despliegue (GitHub API, read-only): `scripts/verify-integration-003.mjs`
  (sandbox) → `scripts/evidencia/verify-integration-003.json`
- Batería de producción read-only: `scripts/sql/verify_post_merge_003_hoy.sql` →
  `scripts/evidencia/verify_post_merge_003_hoy.json` (guard fail-closed anti-escrituras)
- Ledger: `node scripts/ops/ledger-sync-check.mjs` (repo) → exit 0
- Contrato LIVE: `node scripts/security-contract-test.cjs` (repo) → 208/208
- Manifiesto replay: `node e2e/infra/build-migrations-replay.mjs --check` (repo) → MATCH
- Suite: `bash scripts/run-vitest-segmented.sh` (sandbox) → 6069/0
- Capturas UI producción: `scripts/evidencia/ui-003-*.png` (login, terminal, catálogo,
  informe completo, informe PBM-001, móvil, QA store)
- GitHub Actions: runs 43624113773 (CI), 43624113863 (Test Coverage), 43624114015 (Security
  CI Gate), 43624113646 (SQL Security Gate) sobre `337df8228`; E2E Aislado success sobre
  `27865bf78` (árbol idéntico) a las `2026-11-14T17:45:41Z`

## §10. Pendientes transferidos al propietario

1. Decisión H-1: tratamiento de los 64 productos PUERTO PADRE (nominal / recepciones reales /
   costos manuales) y, en su caso, migración nueva que extienda la siembra nominal a
   `activate_master_product`.
2. Merge del PR #1628 cuando corresponda (trabajo nuevo, no parte de esta verificación).
3. Frentes abiertos previos no cancelados por este mandato: CP-SEC-PAYROLL (parcialmente
   cerrado en 002), CP-SEC-PRIVILEGES, CP-SEC-RATELIMIT, BUG-024, IPV-003,
   CP-COMMISSION-CONSTRAINT — ver expedientes respectivos.
