# W9.5 — B-10b-OBS-2 · 17-final-verdict.md
# Veredicto final de la fase

## B-10b-OBS-2

STATUS: **CLOSED WITH CONDITIONS** — causa demostrada con cadena de evidencia
completa; la reparación (consagración del stock como apertura contable y descarte de
residuos Test) requiere DECISIÓN EMPRESARIAL/CONTABLE (§25); el sistema queda sin
mutaciones, con root cause identificado, test permanente creado y regresión PASS.

ROOT CAUSE: **purge SQL directo store-scoped** ejecutado ≈ 2026-08-17 02:00-02:50 UTC
(actor: UNKNOWN/HISTORICAL — irrecuperable, no inventado) que borró TODAS las filas de
d1c4ba0e en inventory (114), stock_movements (242), kardex_entries (242), transactions
(20), transaction_items, receipts, transfers (5) y payment_transactions (66), FUERA del
pipeline `reset_store_data`/restore (0 eventos audit; 0 restore_sessions; NINGUNA de las
7 versiones del reset deja stock>0), preservando products (114/114, stock_current
incluido), devolutions (13), audit_logs (365), warehouses, commission_rules, z_reports,
inventory_reservations y memberships. El stock huérfano de hoy ES el estado pre-purge
de products.stock_current congelado fila a fila (110/114 productos del backup 08-02
idénticos; 0 escrituras a products tras 2026-08-16T22:01Z). El origen del stock es un
IMPORT MASIVO 2026-07-30T03:00Z (114 productos con timestamps externos + ledger
retroactivo con triggers OFF — patrón DEMO_RESET_SCRIPT / truth-model legacy) seguido de
operación comercial REAL 07-30→08-17 (ledger consistente Σ5.495 u verificado en el
payload del backup 08-02).

STORE: d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576 ("TIENDA CENTRAL COSTPRO", activa, tenant
5364ccf8; creada 2026-02-09).

AFFECTED PRODUCTS: 108 huérfanos vivos (de U=124): 110 frozen del backup (97 con
stock>0 al 08-02) + 4 mutados post-backup + 10 Test 08-07; 16 con stock=0 no afectados.

ORPHAN UNITS: 6.553 (6.427 stock real respaldado + 126 Test). Global: 142 productos /
≈7.118 u huérfanas en toda la BD (resto: tiendas ARCHIVED de auditoría/test).

LEDGER STATUS: inexistente para la tienda (0 movements / 0 inventory / 0 kardex /
0 transactions). Reconstrucción: MISSING_LEDGER 108/108; MATCH_BACKUP 110/114;
4 con delta post-08-02 no reconstruible 1:1 (audit sin items).

INVENTORY STATUS: 0 filas (purgado); sin huérfanos invertidos (0 inventory sin product).

KARDEX STATUS: 0 filas (purgado con el resto del ledger; no se reconstruyó nada para
no falsificar historial).

FINANCIAL IMPACT: **0** — payment_transactions purgadas JUNTO con transactions (66→0):
0 pagos huérfanos (verificado contra el payload); commissions 0 filas globales;
commission_rules (config, 60) intactas. Sin daño contable demostrable.

ECONOMIC VALUE: 21.932.698,27 **ESTIMATED** (6.553 u × cost_average/WAC vigente;
nunca precio arbitrario; ver 12-economic-impact.csv).

RESET CONNECTION: el purge NO fue reset_store_data (prueba por 7 versiones + ACL +
0 eventos); los resets AUDITADOS del periodo (08-09..08-16) corresponden a OTRAS
tiendas (5e6fe821 ×7, 43a4dabc ×1, keep_catalog=false). La conexión real es indirecta:
el ecosistema de reset/seed/restore/test del sistema genera y destruye estado fuera de
auditoría — ver BACKLOG.

GLOBAL SCOPE: defecto PUNTUAL, no sistémico. Las tiendas comerciales vivas (43a4dabc,
5e6fe821) están 100% consistentes (0 MISMATCH global en 142 anomalías, todas
ORPHAN_FULL, ~todas en tiendas archived de test).

REPAIR REQUIRED: SÍ (para operación de la tienda activa: catálogo no vendible por el
pipeline canónico — riesgo prevent_negative_inventory), PERO sujeto a decisión humana.

RECOMMENDED MODEL: **B (apertura formal auditada por producto vía pipeline canónico)
+ C restringido a los 10 productos Test** — ver 13-repair-options.md; NO EJECUTADO.

DATA MUTATED: **0** — 0 UPDATE / 0 INSERT / 0 DELETE / 0 DDL / 0 RPC de escritura
(15-zero-mutation-verification.md: 34 métricas PRE==POST, checksums idénticos).

TEST: `src/__tests__/integration/iteration-17-b10b-obs2-orphan-ledger.test.ts` —
detector global permanente (ORPHAN_FULL / NO_INVENTORY / NO_MOVEMENTS / MISMATCH / OK),
16 tests 514 assertions PASS; congela universo, escaneo global, prueba del backup,
clasificación del stock y HUMAN_DECISION_REQUIRED.

REGRESSION: PASS — 1.989 tests / 0 fail / 24 skipped (94 archivos) · lint 0 errors ·
tsc 0 · build OK (193/193 páginas) · PM2 3/3 · HTTP 200 ×2.

GIT: commit `audit(w9): forensic analysis of orphan inventory ledger` (SHA en raw-git/
SHA256SUMS; solo añade pack de evidencia + test permanente; 0 cambios de producción).

PUSH: origin/main == HEAD verificado tras push.

FINAL VERDICT: las 6.553 unidades EXISTEN porque un purge SQL directo (≈08-17, fuera de
todo pipeline auditado) borró el ledger de la tienda sin tocar products; el stock es
REAL (respaldado por el payload 08-02 con ledger consistente 114/114/242/242/20 y por
la auditoría de operación comercial 07-30→08-17), salvo 126 u de 10 productos Test.
No se reparó: la consagración contable del stock como apertura exige decisión humana
(§18). La pregunta del mandato — "¿por qué existen 6.553 unidades declaradas sin ledger
y qué evidencia permite afirmar qué representan?" — queda respondida con evidencia
reproducible en este pack (SHA256SUMS al final).

## BACKLOG registrado en esta fase (NO reparar aquí, §26)

1. Purges/seed/restore fuera de auditoría: SQL directo puede destruir estado sin dejar
   rastro (este incidente). Propuesta: gate de escritura masiva + audit obligatorio.
2. `reset_store_data` v3-arg DESTRUYE el snapshot que la API route acaba de crear
   (route.ts:267-272 inserta; RPC :206 lo borra) — snapshots de reset siempre vacíos.
3. Writers LEGACY vivos con UPDATE directo de stock_current (reverse_receipt_v2
   vigente, reverse_transfer/production, duplicate_adjustment) — migrar a canónico.
4. `store_reset_snapshots` sin retención efectiva (0 filas globales; expires_at sin GC).
5. Residuos post-purge sin soporte (z_reports 6, reservations 8, memberships 9,
   warehouses 3, commission_rules 60 en la tienda purgada).
6. Tiendas TEST/HOT (~25) con huérfanos archived (≈366 u) — limpieza cosmética futura.
7. `products.has_movements` creada out-of-band (sin migración en repo).
8. Ventana de doble conteo register_reception V2.12.16 (27-jul) — evaluar si dejó
   drift en otras tiendas (ninguno detectado hoy: 0 MISMATCH global).
