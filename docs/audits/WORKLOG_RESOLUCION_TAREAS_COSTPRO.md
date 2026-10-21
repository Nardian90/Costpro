# WORKLOG MAESTRO DE RESOLUCIÓN — COSTPRO 4 MULTITIENDA

**Naturaleza del documento:** línea de trabajo viva del programa de resolución de la auditoría global del 2026-10-16 (inventario maestro de 101 tareas). Se actualiza tras cada misión y SIEMPRE cierra con el panel de conteo: cuántos están resueltos, cuántos faltan y el % de resolución.

**Actualización:** 2026-10-21 (post misiones 17→21 oct) · **Base:** INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md (101 tareas) · **Hoy:** 105 tareas (101 originales + 4 nacidas: CP-SEC-025/026/027, CP-INFRA-018)
**Repositorio:** Nardian90/Costpro · main @ c08a4038cc (post PR #1435)

---

## PANEL DE CONTROL (estado al 2026-10-21)

| Métrica | 2026-10-16 | 2026-10-21 |
|---|---|---|
| Total de tareas | 101 | 105 |
| RESUELTA VERIFICADA (certificada) | 21 | 24 |
| RESUELTA DESPLEGADA (en main+producción, suite verde) | — | 6 |
| PARCIALMENTE RESUELTA | 10 | 11 |
| PENDIENTE CONFIRMADA | 64 | 58 |
| NO VERIFICABLE | 3 | 3 |
| OBSOLETA O REEMPLAZADA | 3 | 3 |

### CIERRE DEL PANEL — conteo obligatorio

- **RESUELTOS (plenos):** 30 de 105 → **28.6% de resolución** (24 certificadas + 6 desplegadas pendientes de pase funcional para certificar)
- **EN PROGRESO:** 11 parcialmente resueltas (avance real, sin cerrar)
- **FALTAN:** 72 tareas abiertas (58 pendientes + 11 parciales + 3 no verificables) + 3 obsoletas sin acción
- **% de resolución ponderado** (parciales al 50%): **33.8%**

Leyenda de estados: **RESUELTA VERIFICADA** = corrección certificada con evidencia verificada en vivo. **RESUELTA DESPLEGADA** = fix fusionado a main y desplegado (Vercel auto-deploy) con suite de tests verde; exige únicamente pase funcional explícito en despliegue para certificar. **PARCIALMENTE RESUELTA** = avance material con resto pendiente. **NO VERIFICABLE** = falta de acceso/credenciales. **OBSOLETA** = sin acción posible (histórica).

---

## 1. TRABAJO EJECUTADO ENTRE MISIONES (17→21 oct)

| Misión / expediente | Fecha | Alcance | Evidencia |
|---|---|---|---|
| MISIÓN 2 — Hotfixes (A) + verificación P0 (B) | 17/10 | CP-POS-003, CP-POS-007, CP-CAT-004, CP-SEC-019 fix; CP-SEC-012 verificación pasiva 401×3; 20/20 tests nuevos; suite 3170/3170 | PR #1421 + MISION_2_HOTFIXES_OPERATIVOS_SEGURIDAD_2026-10-17.md |
| Incidente ENERVIDA (moneda cobro + SKU 108) | 17/10 | Reporte Entrega: moneda real de cobro USD/CUP + SKU 108 con 12.000 CUP | PRs #1419, #1420 + REGISTRO_OPERACIONES_2026-10-16_ENERVIDA.md |
| Política temporal coherente | 18/10 | Fecha operativa extremo a extremo (venta, vale, inventario, Kardex) + centro de control | PRs #1422, #1423 + POLITICA_TEMPORAL_COSTPRO_2026-10-18.md |
| DT-03 / Decisiones Misión C | 19→20/10 | Decisión B confirmada; matriz de acceso viva; clasificación 11 NULLs; dossier + backfill david9999 ejecutado auditado; decisiones A y B.1 ratificadas; COGS (C) y legal incidents (D) preparadas | DECISIONES_PENDIENTES_MISION_C_2026-10-18.md + evidence/20261019-dt03-matriz-acceso/ |
| **CP-SEC-027** (P1 exposición pública) | 19/10 | Ventana T-0→A→B→C ejecutada: 3 vistas security_barrier, DROP policies anon, REVOKE SELECT tablas; hallazgo P0 write-hole cerrado en vivo + migración durable 20261019000002; vitrinas 404 recuperadas (local+Vercel); **verify 18/18 PASS re-ejecutado 21/10** | evidence/20261019-cp-sec-027-ejecucion/ + PR #1426 |
| F7 Endurecimiento SECURITY DEFINER | 20/10 | REVOKE/DROP aplicados a producción (10 con EXECUTE anon, incl. e2e_hard_delete_*); allowlist v2 (97 entradas); check 2 del gate corregido (pg_proc.proacl); gate 0 hallazgos no permitidos; contract-surface re-certificado | evidence/20261020-sec-definer-hardening/ |
| Cierre decisiones Misión C (C/D) | 20/10 | C: migración COGS derived (8 derivables + 624 not_derivable, CERO UPDATE destructivo) · D: legal incidents → audit_logs (endpoint reescrito + índice) + 8/8 tests · Backfill DT-03 evidenciado | evidence/20261020-mision-c-cierre/ + PR #1431 |
| Features de producto (paralelo) | 19→20/10 | Comprobante térmico POS (#1434), Ingresos/Egresos de caja (#1435), Tipo de artículo Servicios (#1427), modelo servicios (#1427) | PRs citados |

---

## 2. TABLA MAESTRA — estado por tarea (101 originales + 4 nuevas)

La columna «Cambio» cita la evidencia del avance. «=» sin cambio de estado desde el 16/10.

### 2.1 Tareas POS

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-POS-001 | Kardex de la era V2.1: sin reconciliación automática stock↔ledger | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | = (sin cambios) |
| CP-POS-002 | Offline sync sin reserva de stock ni resolución de conflictos | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-POS-003 | «Venta por Conteo» rota: «0 de 0 productos» permanente | PENDIENTE CONFIRMADA | RESUELTA DESPLEGADA | Fix PR #1421 (17/10): `?storeId=` en fetch de Venta por Conteo + fail-closed; 2/2 tests; suite 3170/3170; merge 584440873 → Vercel. |
| CP-POS-004 | Fallback de atribución de comisiones POS sobre-atribuye a todos los wo | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-POS-005 | Firmas del Reporte Entrega globales en localStorage (no scoped por tie | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-POS-006 | Falta test de integración del pro-rateo del motor de comisiones | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-POS-007 | Notas de venta del Catálogo de Ventas se descartan silenciosamente | PENDIENTE CONFIRMADA | RESUELTA DESPLEGADA | Fix PR #1421: `sale_notes` online + `p_notes` offline + schema Zod + replay sync/batch (4 puntos); 8/8 tests; merge → Vercel. |
| CP-POS-008 | Tasa USD 680 hardcodeada como fallback en 8+ puntos del cliente | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-POS-009 | Selector de fecha date-only a medianoche; Vales de Salida sin selector | PENDIENTE CONFIRMADA | RESUELTA DESPLEGADA | PRs #1419 (fecha operativa en Vender) + #1422 (política temporal extremo a extremo) + #1423 (centro de control de fechas + selector en movimientos); suite E2E fechas-trabajo 9/9 ve |
| CP-POS-010 | Reporte Entrega: 7 discrepancias contables D1-D7 + migración ref_type  | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | Avances: PR #1419/#1420 (moneda real de cobro + SKU 108), #1429 (hoja CUP sin columna USD), #1432 (pie de firmas + nombres configurables). Sigue PARCIAL: migración ref_type 2026101 |
| CP-RES-010 | Comisiones Reporte Entrega: modal gestionable + criterio «fecha del pa | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-012 | Eliminación de caminos V1 de venta/devolución + endurecimiento create_ | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |

### 2.2 Tareas INV

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-INV-001 | 4 productos Puerto Padre: inventory.quantity ≠ Σ movimientos (seed leg | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INV-002 | Productos 160-177 sin precio/costo y nombre provisional | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INV-003 | unit_cost=1 CUP placeholder en 13 recepciones | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INV-004 | Precios de catálogo obsoletos (SKU 92, 134, 111) | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INV-005 | 4 divergencias de conciliación (SKU 113/127/135/141) + política de sto | PENDIENTE CONFIRMADA | RESUELTA VERIFICADA | Conciliación read-only 18/10: las 4 divergencias históricas YA NO EXISTEN (SKU 113: 121=121; SKU 127: 0=0); 0 productos con stock negativo en 22 tiendas; Decisión A ratificada 20/1 |
| CP-INV-006 | Desfase de 1 día en 54 recepciones importadas (reception_date 16:00 UT | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INV-007 | SKU 81: ledger «inconsistente» (apertura −100) | OBSOLETA O REEMPLAZADA | OBSOLETA O REEMPLAZADA | = (sin cambios) |
| CP-INV-008 | transfer-service.ts:142 con comentario «stubs pendientes» ambiguo | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INV-009 | Vales de Salida sin superficie UI de reversión (backend existe) | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | = (sin cambios) |
| CP-RES-014 | /api/inventory/adjust 500 en happy path (DEFECT-001) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-015 | Trazabilidad + Kardex: P1-P5 del diagnóstico (iteración 11) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |

### 2.3 Tareas IPV

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-IPV-001 | PRE_LEDGER/RECONCILIATION permanentes (CENTRAL/ENERVIDA) + 26 PRICE_AN | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-IPV-002 | TAREA 3: re-costeo de COGS histórico no iniciado | PENDIENTE CONFIRMADA | PARCIALMENTE RESUELTA | Decisión C ratificada 20/10 (backfill evidencia-based SIN mutar Kardex). Migración 20261020000004_cogs_derived.sql en main: 5 columnas nuevas + 8 derivables con evidencia `wac_chan |
| CP-IPV-003 | 4 WAC vigentes inflados 680x (SKU 67/68/107/121) + diluciones SKU 90/9 | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-IPV-004 | Procedencia de costos ENERVIDA: 0% con evidencia documental | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-IPV-005 | Deuda técnica del módulo IPV clásico (Dexie, componentes sobredimensio | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-RES-007 | WAC cero: TAREA 2 (44 reconstruidos) y TAREA 2B (13 a 1 CUP, decisión  | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-009 | IPV Ventas (vista/API/PDF/Excel) + truncado PostgREST 1000 filas + tex | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |

### 2.4 Tareas CAT

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-CAT-001 | Categorías como texto libre en products.category | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-CAT-002 | confirm_transfer casa producto destino solo por SKU | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-CAT-003 | catalog_selectedCategories persiste entre sesiones | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-CAT-004 | Alta de producto en recepción sin tenant_id → 403 RLS | PENDIENTE CONFIRMADA | RESUELTA DESPLEGADA | Fix PR #1421: resolución fail-closed de `tenant_id` desde `stores` con JWT del usuario antes del INSERT; 5/5 tests; merge → Vercel. |
| CP-CAT-005 | /api/catalog/bulk-import sin Zod por fila + store_id del body | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-CAT-006 | received_services históricos con service_type_id NULL | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-CAT-007 | Gestión de tipos de servicio por tienda sin UI | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-CAT-008 | Formulario/modal de servicios sin pase manual con sesión real | NO VERIFICABLE | NO VERIFICABLE | = (sin cambios) |
| CP-RES-008 | Regresión catálogo 1379 + UUID Central + tipos de servicio global + su | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |

### 2.5 Tareas SEC

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-SEC-001 | RLS «Productos públicos - lectura» cross-tenant | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-SEC-002 | Lectura de ventas por ex-vendedores (policy seller_id) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-SEC-003 | deny_client_writes de products anulado por policies OR de update | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-004 | Sin audit_logs en transfers directos y updates/voids de recepciones | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | = (sin cambios) |
| CP-SEC-005 | Debilidades residuales anti-spoofing (patrón legacy, GRANTs, ?all=true | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | F7 (20/10): saneamiento de permisos APLICADO a BD viva (REVOKE anon/PUBLIC en 10 SECURITY DEFINER + DROP e2e_hard_delete_*; gate post-F7 0 hallazgos no permitidos). Sigue PARCIAL:  |
| CP-SEC-006 | 52 endpoints sin Zod/validación de auth (backlog Security CI Gate) | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-007 | Security CI Gate: checks SQL se auto-desactivan sin DATABASE_URL; doc  | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | F7 + PR #1428/#1433: gate fail-closed, check 2 vía pg_proc.proacl (falso verde corregido), canal push a main añadido (defecto menor `branches: ain]` detectado 21/10 — fix de 2 líne |
| CP-SEC-008 | Backlog formal DT-01..DT-18 (is_admin duplicada, cleanup jobs, store l | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-009 | Modelo de autorización: H-09-AUTH-01..04 (is_admin≡is_global_admin, ro | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-010 | DT-03: decisión single vs multi-tenant sin aprobar | PENDIENTE CONFIRMADA | RESUELTA VERIFICADA | DT-03 Decisión B CONFIRMADA por propietario (19/10): arquitectura multi-tenant conservada. Protocolo 6 pasos ejecutado read-only: matriz viva 30 perfiles × 43 memberships × 24 tien |
| CP-SEC-011 | DT-06: reconciliación de auth.users huérfanos sin implementar | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-012 | Bugs de seguridad ACTIVOS documentados como test.fail (BUG-013/017/022 | PENDIENTE CONFIRMADA | RESUELTA DESPLEGADA | Misión B (17/10): BUG-013/017/022 verificados corregidos (401 local, curl pasivo). BUG-024 (incidents.json FS efímero) reescrito en PR #1431 (19/10): POST→`audit_logs` action=legal |
| CP-SEC-013 | Rate limit in-memory; Upstash Redis obligatorio en prod no configurado | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | Sin cambios (Upstash no configurado). |
| CP-SEC-014 | CSP con 'unsafe-inline' permanente en producción | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-015 | Enumeración de roles inconsistente (superadmin vs super_admin vs encar | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-016 | Webhook Telegram: IP allowlist cosmética sin reverse proxy (checklist  | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-017 | Supabase Admin API /auth/v1/admin/users devuelve 500 | NO VERIFICABLE | NO VERIFICABLE | = (sin cambios) |
| CP-SEC-018 | /api/users/managed-create responde 400 ERR_EMAIL_ALREADY_EXISTS tras c | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-SEC-019 | 35 rutas API con z.string().uuid() estricto (fallan con UUID sintético | PENDIENTE CONFIRMADA | RESUELTA DESPLEGADA | Fix PR #1421: codemod 52 ocurrencias `z.string().uuid()` → `uuidLoose`/`uuidRegex` (semántica PostgreSQL); 5/5 tests contrato Central; merge → Vercel. |
| CP-SEC-020 | RPCs legacy con EXECUTE anon/PUBLIC (5 dropeadas; manage_user_membersh | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | F7 retiró EXECUTE anon de RPCs; `manage_user_memberships` sigue sin resolver (DT-02). Sin cambio de estado. |
| CP-RES-001 | Spoofing de p_user_id en 31 RPCs + BOLA en confirm_transfer + H7/H4 | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-002 | Seteo directo de contraseña por Super Admin (multi-tienda) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-011 | Endurecimiento RLS histórico: productos públicos cross-tenant + transa | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-SEC-025 | Convergencia de capas RLS (flag USE_TENANT_RLS no restringe plenamente | — (nueva) | PENDIENTE CONFIRMADA | Nueva (DT-03 paso 1): coexisten policies legado ungated + tenant flag-gated; USE_TENANT_RLS no restringe plenamente. PENDIENTE. |
| CP-SEC-026 | Memberships de tienda sin auditoría en audit_logs | — (nueva) | PENDIENTE CONFIRMADA | Nueva (DT-03 paso 1): memberships sin trazabilidad en audit_logs. PENDIENTE. |
| CP-SEC-027 | Exposición pública de costos: anon leía cost_average/precios vía polic | — (nueva) | RESUELTA VERIFICADA | Nueva (DT-03 paso 1) → RESUELTA VERIFICADA: PR #1424 (vistas security_barrier + DROP policies anon + REVOKE) + ventana T-0→A→B→C ejecutada 19/10 con hallazgo P0 write-hole cerrado  |

### 2.6 Tareas UI

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-UI-001 | CRUD de reglas de comisión desde UI + sub-ítems contables | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | = (sin cambios) |
| CP-UI-002 | Fases C/D/E del refinamiento Inventario/Vitrina sin ejecutar | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-UI-003 | UX-002..UX-014: breadcrumbs falsos, móvil, sesiones envejecidas, tabló | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | = (sin cambios) |
| CP-UI-004 | Módulos oficiales «En desarrollo» (IPV/Pick3/Billetera/Wiki/Academia/L | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-UI-005 | Diagnóstico Vales de Salida P1-P10 con plan de 7 commits sin constanci | PARCIALMENTE RESUELTA | PARCIALMENTE RESUELTA | = (sin cambios) |
| CP-UI-006 | MVP FC: bug de sesión useSessionManager, cuentas locales hardcodeadas, | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-RES-003 | Aislamiento del landing del tema/modos de la app | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-018 | Certificaciones UI/PDF: Arena FC (9.3/10), 7 plantillas PDF, IPV banca | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |

### 2.7 Tareas DATA

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-DATA-001 | Decisiones humanas de limpieza de datos E2E/QA (6 tiendas D, 16 usuari | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | Evidencia nueva 18/10: 41 divergencias actuales son artefactos QA; ~10 productos de prueba en TIENDA CENTRAL. Decisión de limpieza por lotes sigue PENDIENTE del propietario. |
| CP-DATA-002 | security.spec desactualizado (buscaba create_sale V1, PGRST202) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-DATA-003 | Transacciones históricas de prueba dentro de pilotos A/B sin limpieza | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-DATA-004 | review_queue: 29 componentes sin documentar, webhook no configurado, a | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-DATA-005 | Pares neto-cero no representables (Excel filas 569+570, papel f536/f53 | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-DATA-006 | 20 filas de comisiones de julio con tarifa unitaria antigua | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-RES-005 | Higiene de datos E2E: limpieza 2.638 tiendas + hard-delete + gobernanz | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-006 | Importación ENERVIDA 480 ops + conciliación 179/179 (f854, f873, alta  | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-017 | Suite E2E 382/382 certificada + guardrail net-zero en 13 chunks | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |

### 2.8 Tareas INFRA

| ID | Tarea | Estado 16/10 | Estado 21/10 | Cambio / evidencia |
|---|---|---|---|---|
| CP-INFRA-001 | E2E de CI deshabilitado (if: false) + continue-on-error heredado | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-002 | OOM estructural (4 GB): build/tsc local imposible; CI única autoridad | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-003 | bun audit no bloqueante (|| echo + continue-on-error) + dual lockfile | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-004 | 27 supresiones de ci-gate-allowlist.json expiran 2026-12-31; replay re | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | F7 regeneró allowlist v2: 97 entradas con reason/added_by; 91 expiran 2027-06-30, 6 el 2026-12-31 (bombas reprogramadas; análisis individual por entrada en expediente v5). Sigue PA |
| CP-INFRA-005 | ~100+ skips E2E condicionales + 12 unit skips sin plan + cobertura exc | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-006 | 15 escenarios E2E sin cobertura (2 P0: recepción de mercancía y contra | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-007 | Cementerio de scripts one-off (45 MB, ~60+ scripts de misión, hardcode | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-008 | Inconsistencias de infra: PM2 en modo dev, crons divergentes (24 h vs  | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-009 | Gate de proceso: PRs mergeados con previews en ERROR o E2E advisory | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-010 | Presupuesto de bundles en CI + carrito con Product completos en localS | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-011 | Sin proyecto Supabase aislado para E2E/perf | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-012 | Sin métricas de campo (web-vitals p75) + awaits secuenciales restantes | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-013 | Reevaluación Vercel AI SDK postergada a Q3 2026 sin tracking | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-014 | Branch protection y secrets de GitHub no verificables desde el repo | NO VERIFICABLE | NO VERIFICABLE | = (sin cambios) |
| CP-INFRA-015 | Warnings de deploy Vercel (módulo stripe opcional + 16 warnings tracin | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-016 | Auto-commits diarios del agente auditor a la rama default | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-INFRA-017 | turbopack.memoryLimit no soportada en Next 16.3.3; Sentry monitors omi | PENDIENTE CONFIRMADA | PENDIENTE CONFIRMADA | = (sin cambios) |
| CP-RES-004 | Performance: chunks jspdf/xlsx fuera del grafo POS (CB1), splash (CB2) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-013 | Cortes de deploy Vercel TS2739 (#1373) y TS18048 (#1381) — fixes | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-RES-016 | Backup/Restore BR-2 (migraciones + ejecutor PT-4..PT-8) | RESUELTA VERIFICADA | RESUELTA VERIFICADA | = (sin cambios) |
| CP-OBS-001 | Documentos con cifras obsoletas (SUPABASE_AUDIT 103 tablas→127, mapa_v | OBSOLETA O REEMPLAZADA | OBSOLETA O REEMPLAZADA | = (sin cambios) |
| CP-OBS-002 | Pipeline de mantenimiento automatizado: ciclos 2/3 sin ejecutar (embed | OBSOLETA O REEMPLAZADA | OBSOLETA O REEMPLAZADA | = (sin cambios) |
| CP-INFRA-018 | R1: sin registro formal de migraciones aplicadas en BD viva | — (nueva) | PENDIENTE CONFIRMADA | Nueva (deuda R1, formalizada F7/v5): `schema_migrations` NO existe en BD viva (verificado 21/10) — el control de aplicadas es evidencia documental + verificación de objetos. Requie |

### 2.9 Tareas RES (resueltas certificadas del inventario original)

Las 18 fichas CP-RES-001..018 se mantienen **RESUELTA VERIFICADA** sin reapertura documentada al 21/10 (= sin cambios). Certificación individual emitida 21/10 en `docs/audits/certificaciones/`.

---

## 3. DETALLE DE LAS TRANSICIONES (evidencia completa)

### CP-POS-003: PENDIENTE CONFIRMADA → RESUELTA DESPLEGADA
- Fix PR #1421 (17/10): `?storeId=` en fetch de Venta por Conteo + fail-closed; 2/2 tests; suite 3170/3170; merge 584440873 → Vercel.

### CP-POS-007: PENDIENTE CONFIRMADA → RESUELTA DESPLEGADA
- Fix PR #1421: `sale_notes` online + `p_notes` offline + schema Zod + replay sync/batch (4 puntos); 8/8 tests; merge → Vercel.

### CP-CAT-004: PENDIENTE CONFIRMADA → RESUELTA DESPLEGADA
- Fix PR #1421: resolución fail-closed de `tenant_id` desde `stores` con JWT del usuario antes del INSERT; 5/5 tests; merge → Vercel.

### CP-SEC-019: PENDIENTE CONFIRMADA → RESUELTA DESPLEGADA
- Fix PR #1421: codemod 52 ocurrencias `z.string().uuid()` → `uuidLoose`/`uuidRegex` (semántica PostgreSQL); 5/5 tests contrato Central; merge → Vercel.

### CP-SEC-012: PENDIENTE CONFIRMADA → RESUELTA DESPLEGADA
- Misión B (17/10): BUG-013/017/022 verificados corregidos (401 local, curl pasivo). BUG-024 (incidents.json FS efímero) reescrito en PR #1431 (19/10): POST→`audit_logs` action=legal_incident + GET admin `withRole('admin')` + migración 20261020000005 (índice parcial, PENDIENTE de aplicación) + 8/8 tests.

### CP-POS-009: PENDIENTE CONFIRMADA → RESUELTA DESPLEGADA
- PRs #1419 (fecha operativa en Vender) + #1422 (política temporal extremo a extremo) + #1423 (centro de control de fechas + selector en movimientos); suite E2E fechas-trabajo 9/9 verde; merge → Vercel.

### CP-INV-005: PENDIENTE CONFIRMADA → RESUELTA VERIFICADA
- Conciliación read-only 18/10: las 4 divergencias históricas YA NO EXISTEN (SKU 113: 121=121; SKU 127: 0=0); 0 productos con stock negativo en 22 tiendas; Decisión A ratificada 20/10 (política stock nunca negativo como canónica). Documento: DECISION_A_STOCK_NEGATIVO_2026-10-20.md.

### CP-SEC-010: PENDIENTE CONFIRMADA → RESUELTA VERIFICADA
- DT-03 Decisión B CONFIRMADA por propietario (19/10): arquitectura multi-tenant conservada. Protocolo 6 pasos ejecutado read-only: matriz viva 30 perfiles × 43 memberships × 24 tiendas × 8 tenants; 11 NULL clasificados (1 demostrable + 10 sin evidencia); pruebas T1-T7 PASS. Backfill david9999 EJECUTADO y verificado vivo (tenant_id = Default Tenant + audit atómico 18:29:50Z 19/10).

### CP-IPV-002: PENDIENTE CONFIRMADA → PARCIALMENTE RESUELTA
- Decisión C ratificada 20/10 (backfill evidencia-based SIN mutar Kardex). Migración 20261020000004_cogs_derived.sql en main: 5 columnas nuevas + 8 derivables con evidencia `wac_change_log` (preview JSON) + 624 `not_derivable`. PENDIENTE: aplicar a producción (verificada NO aplicada el 21/10) + aprobación contable de los 8 valores.

---

## 4. PRÓXIMOS PASOS RECOMENDADOS (orden del plan priorizado)

1. **Cierres pendientes de autorización del propietario** (ver expediente `CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md`): aplicar paquete D (índice legal incidents) y paquete C (COGS derived, con aprobación contable de los 8 valores), ratificación del backfill david9999, protección de `main` (ruleset propuesto), decisiones de las 6 entradas allowlist con vencimiento 2026-12-31.
2. **Misión D (red de seguridad)**: Supabase aislado + reactivar E2E de CI (CP-INFRA-011 → CP-INFRA-001) — desbloquea la certificación funcional de las 6 RESUELTA DESPLEGADA.
3. **Misión E (campaña seguridad)**: CP-SEC-006 (52 endpoints), saneamiento del histórico SQL (CP-SEC-005/CP-INFRA-004), CP-SEC-004 (audit transfers), Upstash (CP-SEC-013).
4. **Misión F (contabilidad)**: CP-IPV-003 (WAC 680x), CP-INV-001 (Puerto Padre), migración ref_type del Reporte Entrega (CP-POS-010), backfill ledger IPV (CP-IPV-001) bajo decisiones de Misión C.

---

## 5. CIERRE DEL PANEL — conteo obligatorio (estado al 2026-10-21)

- **RESUELTOS: 30 de 105 (28.6% de resolución plena)** — 24 certificadas + 6 desplegadas a la espera de pase funcional
- **EN PROGRESO (parciales): 11**
- **FALTAN: 72 tareas abiertas** (58 pendientes · 11 parciales · 3 no verificables) — más 3 obsoletas que no requieren acción
- **% DE RESOLUCIÓN: 28.6% pleno · 33.8% ponderado (parciales al 50%)**
- Trayectoria: 20.8% (16/10, 21/101) → 28.6% (21/10, 30/105)
