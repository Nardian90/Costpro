# CP-FIN-110-POSTREVIEW-HARDENING-111 — Expediente

**Misión:** Resolución de los cinco hallazgos de la revisión Codex del PR #1682 — integridad de generaciones, anticipos, CxC, conciliación y seguridad de rectificaciones.
**Tienda auditada:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) — alcance de escritura de datos: **NINGUNO** (solo DDL de funciones).
**Rama:** `fix/cp-fin-110-postreview-hardening-111-20261122` · **Base:** `origin/main` @ `58d550d15` (merge de #1682).
**Fecha:** 2026-11-21/22.

---

## 0. Desviación documentada de la premisa de la misión

La misión parte de «el PR #1682 continúa abierto y tiene cinco observaciones». El estado real del remoto (protocolo 11f, verificado ANTES de actuar) es:

- **#1682 está FUSIONADO** (`merged: true`, merge_commit `58d550d15`, 2026-11-21 17:29:43Z).
- Los cinco comentarios de Codex (ids 4653285201, 4653285207, 4653285211, 4653285217, 4653285221) siguen vigentes en el código ya fusionado a `main`.

Adaptación: no existe rama de PR abierta donde trabajar (el remote no lo permite); se crea rama nueva desde `origin/main` actualizado y un PR nuevo que resuelve los cinco comentarios y los referencia por id. No hay PR superpuesto: el anterior está cerrado por merge.

## A. Estado de los cinco comentarios y cómo se resolvió cada uno

| Id Codex | Hallazgo | Resolución | Prueba que lo demuestra |
|---|---|---|---|
| 4653285201 (P0-1) | Pase 5 solo selecciona `status='completed'`: órdenes `completed→closed` pierden reconocimiento y consumo de anticipos; la conciliación v2 excluye las closed de sus fuentes | Migración `20261122130000`: pase 5 y TODAS las fuentes (ACT_CXC, ING_SERVICIOS_PREST, PAS_ANTICIPOS_CLI, docs_pend, sin_resp) usan el predicado RECONOCIBLE `(completed OR (closed AND completion_date IS NOT NULL))`. No se convierten en ingresos las voided/reversed ni las closed-sin-evidencia. El reconocimiento usa `coalesce(completion_date, order_date)` (fecha real de finalización) y el monto del presupuesto convertido. Los anticipos aplicados no se duplican (métrica `least(anticipos, total)`). | m111-validate-isolated 52/52: ORD-2 (closed con evidencia + anticipo TE 80.000) reconocida por pase 5; ORD-3 (voided), ORD-4 (closed sin evidencia), ORD-5 (draft 100% pagada) NO reconocidas y su anticipo permanece en PAS_ANTICIPOS_CLI (90.000). Contrato SQL 11/11. |
| 4653285211 (P0-2) | CxC mezcla unidades: `budget_total` (moneda del presupuesto) − `paid_amount` (CUP) antes de convertir | ACT_CXC convierte `budget_total × CASE(tasa documental)` ANTES de restar `paid_amount`; filtro de corte por `coalesce(completion_date, order_date)`; contadores alineados. Ejemplo obligatorio verificado. | Aislado: orden 100 USD @ 800, pagado 10 USD (paid_amount 8.000) → métrica total 80.000 / aplicados 8.000 / pendiente 72.000; mayor Dr ACT_CXC 72.000; conciliación ACT_CXC op=132.000 (incluye esta orden) CONCILIADO dif 0. La fórmula buggy habría dado 0. |
| 4653285217 (P0-3) | El detector de fallback suprime el hallazgo por la mera existencia de filas del riel | El detector `fb` usa exactamente el criterio del fallback del motor: sin cobro de EFECTIVO canónico (`payment_method='cash'`, suma por grupo de moneda CUP/USD/EUR/MLC = 0). Una fila de transferencia NO suprime; un cobro efectivo real sí (y no hay duplicación). | Aislado: venta legacy (settlement efectivo 2.000 + transferencia 8.000 en el riel, sin fila de efectivo) → métrica aplica fallback (cob_cash_cup=2.000, fuente=settlement), detector fb.n=1, caja CUP calidad PARCIAL y estado ALERTA (el efectivo del fallback no está en el riel: documentado, no «COMPLETA»); venta con cobro efectivo real en el riel → sin fallback, sin duplicación, ACT_BANCOS CONCILIADO. |
| 4653285207 (P0-4) | `m110-rectification-prod.mjs` inserta asiento y movimientos en operaciones separadas; un reintento tras fallo encuentra el número de documento y omite la reparación (rectificación silenciosamente incompleta) | Nuevo RPC `fin_rectification_apply` (migración 111 §3): asiento + movimientos + partida doble (pre y post-inserción) + documento de auditoría en UNA transacción; idempotencia completa por generación (`ya_completa` solo con asiento + TODOS los movimientos coherentes (multiconjunto exacto) y equilibrados); registro parcial → `ERR_RECTIFICACION_PARCIAL` explícito o reparación controlada (`p_repair=true`, misma transacción, traza `SYSTEM_RECTIFICATION_REPAIRED`); desequilibrio → `ERR_RECTIFICACION_DESQUILIBRADA`; ambigüedad → `ERR_RECTIFICACION_AMBIGUA`; serialización `pg_advisory_xact_lock`. El script m110 delega en el RPC (re-ejecutable, nunca duplica). ACL pura service_role. | Aislado, 8 escenarios P0-4: 4.1 categoría inválida → error, 0 asientos; 4.2 fallo DURANTE inserción de movimientos (tasa no numérica) → rollback total (0 entradas, 0 movimientos); 4.3 desequilibrada → error; 4.4 reintento → `creada` (2 movimientos, saldo 0, 1 auditoría); 4.5 repetición → `ya_completa` mismo asiento; 4.6 asiento parcial sin reparación → error explícito (NO falso éxito); 4.7 reparación controlada → `reparada` (2 movimientos, saldo 0, traza); 4.8 concurrencia (2 llamadas paralelas) → exactamente 1 asiento con 2 movimientos. |
| 4653285221 (P1-5) | Fixture E2E con comodín `name ILIKE '*PILOT*'` puede escribir en pilotos persistentes compartidos | La spec usa `E2E_PILOT_STORE_A` (piloto del run, mecanismo canónico run-env/global-setup), fail-closed: aborta ANTES de escribir si no puede determinar el piloto del run; verifica por ID explícito + nombre del piloto del run (`E2E_PILOT_A_NAME`); `afterAll` del MISMO ámbito: verifica pertenencia de todos los documentos a la tienda del run, conteos ≥ línea base, y restaura `active_store_id` al piloto del run. | Suite E2E aislada: `cpfin-reconciliation-tab` 3/3 PASS + guardrail net delta = 0 (stores=0 users=0 tras teardown); data-hygiene-guard PASS. |

## B. Matriz de órdenes cerradas y su tratamiento contable

| Caso (fixture aislado) | Estado persistido | Evidencia de finalización | ¿Reconoce ingreso? | ¿Consume anticipo? | ¿Anticipo queda en pasivo? |
|---|---|---|---|---|---|
| ORD-1 clásica | completed (trigger) | — | Sí (80.000 → ING) | Sí (20.000) | — |
| ORD-2 closed-completada histórica | closed | completion_date 2026-11-10 + closed_at | Sí — por pase 5 (80.000) | Sí (aplica 80.000; TE 80.000) | — |
| ORD-3 voided | voided (reversed_at) | — | **No** | **No** | Sí (5.000) |
| ORD-4 closed sin ejecución | closed | completion_date NULL | **No** | **No** | Sí (5.000) |
| ORD-5 pagada no ejecutada | draft | — | **No** | **No** | Sí (80.000) |
| ORD-6 USD (P0-2) | completed | — | Sí (80.000 = 100×800) | Sí (8.000) | CxC 72.000 |

Producción (mapa global read-only): **0 órdenes closed con evidencia, 0 voided/reversed en toda la base** — la corrección no altera ningún saldo vigente.

## C. Casos de CxC en CUP y monedas extranjeras (cálculos completos)

- ORD-1 (CUP): presupuesto 80.000; anticipo 20.000 → reconocimiento Dr PAS 20.000 + Dr ACT_CXC 60.000 / Cr ING 80.000. Recon: ACT_CXC op = 60.000 (parte de 132.000) CONCILIADO.
- ORD-2 (CUP, closed-completada): presupuesto 80.000; anticipo TE 100 USD @ 800 = 80.000 → Dr PAS 80.000 / Cr ING 80.000 (sin CxC). Recon: TE op 88.000, ACT_CXC sin esta orden, CONCILIADO.
- **ORD-6 (USD, ejemplo obligatorio): presupuesto 100 USD × tasa 800 = 80.000 CUP-eq; pagado 10 USD = paid_amount 8.000 CUP → CxC = greatest(100×800 − 8.000, 0) = 72.000 CUP.** La fórmula v2 (`greatest(100 − 8.000,0)×800`) daba 0. Recon ACT_CXC op=132.000 = 60.000 (ORD-1) + 72.000 (ORD-6); dif contable 0; CONCILIADO.
- Anticipos en pasivo: ORD-3+4+5 = 90.000; PAS_ANTICIPOS_CLI op 90.000 CONCILIADO.
- Monedas admitidas: CUP (tasa 1), USD y EUR y demás monedas del modelo vía `budget_exchange_rate` documental (con guardas de tasa ≤ 0 → 1). Pagos mixtos/parciales: `anticipos_aplicados = least(Σpt, total)`; exceso → PAS_ANTICIPOS_CLI (subconsulta `exc`). No se cambió `paid_amount` ni se reescribieron pagos históricos.

## D. Casos de fallback efectivo y detección de fuentes alternativas

Ver §A P0-3 (venta legacy + transferencia → fallback aplicado y detectado; calidad PARCIAL honesta; sin duplicación con riel real). La conciliación no declara COMPLETA cuando el efectivo del mayor proviene de una fuente alternativa.

## E. Pruebas de atomicidad e idempotencia de rectificaciones

Ver §A P0-4 (8 escenarios; O se registra todo o nada; nunca éxito parcial). RPC en producción con `fin_rectification_apply` verificado (12/12 marcas); RECT-110-A NO recreada (idempotencia por generación; 2 asientos = 1 GEN-2 original + 1 copia pase 4 en GEN-3, ambos 2 movimientos y saldo 0.00).

## F. Confirmación de aislamiento del fixture E2E

- Selección por ID explícito del run (`E2E_PILOT_STORE_A`) + verificación de nombre (`E2E_PILOT_A_NAME`); aborta sin escribir si falta.
- `afterAll` verifica: todos los documentos de la tienda del run; conteos ≥ línea base; restore del active_store.
- Guardrail del run: net delta = 0 (stores=0 users=0); data-hygiene-guard PASS; pilotos persistentes intactos (gobernanza protegida, no tocados).

## G. Impacto global de la lógica en otras tiendas (solo lectura)

7 tiendas en producción. Clasificación (m111-impact-global-extract, re-emitido post-fix):

| Tienda | Clase | Órdenes sw | Detalle |
|---|---|---|---|
| ENERVIDA-VITALLCONS | 2 — correctamente contabilizadas | 18 (todas draft CUP) | anticipos 16.227.626 en pasivo; 0 reconocibles sin asiento; cxcOp=cxcMayor=0 |
| COSTPRO (Prueba) / FERROCARRIL / PUERTO PADRE / QA Icons / QA-Release / SHADDAI | 1 — sin órdenes afectadas | 0 | — |

Ninguna tienda en clases 3 (closed faltantes) / 4 (diferencias CxC por moneda) / 5 (reconstrucción necesaria). **No se reconstruyó ninguna generación y no se ejecutó ninguna rectificación fuera de ENERVIDA.** Órdenes en moneda extranjera en producción: 0.

## H. Conciliación actualizada de ENERVIDA (read-only, lógica v3 live)

`fin_get_reconciliation` v3 (`CP-FIN-REC-001/v3`), corte 2026-11-21, período 01–21/11:

- **Resumen: 24 conciliadas · 0 diferencias · 0 alertas · 1 incompleta · 22 no conciliables · 0 pendientes · 0 documentos pendientes · 0 movimientos sin respaldo (47 cuentas).**
- Incompleta: ACT_INVENTARIO (calidad PARCIAL documentada — valoración WAC viva; dif 0).
- No conciliables: 22 cuentas SIN_FUENTE (limitaciones de fuentes documentadas — estado real preservado).
- Cuentas clave: Caja CUP 1.673.850 / Caja USD 23.884.450 / TE 16.595.876 / Inventario 594.747,87 / ACT_CXC 0 / PAS_ANTICIPOS_CLI 16.227.626 / ING_SERVICIOS_PREST 0 / GAS_COSTO_VENTAS 106.227,70 — todas dif 0.
- Ecuación del Estado de Situación: 52.752.813,86 = PASIVOS+PATRIMONIO 52.752.813,86 (dif 0); resultado_acumulado 33.563.391,96 (incluido una sola vez).
- **Distinción obligatoria: 24 cuentas conciliadas sin diferencias NO es 47 cuentas completamente conciliadas.** La matriz conserva estados reales y motivos.
- Evidencia completa: `scripts/out/m111-audit/m111-recon-enervida-post.json` + verificador m110-recon-final 13/13 PASS (idéntico al cierre de la misión 110).

## I. Confirmación de que no se alteraron RECT-110-A ni GEN-3 en producción

- Aplicación de migración 111 = SOLO DDL (CREATE OR REPLACE FUNCTION ×3 + ACL). Respaldo PRE de definiciones en `scripts/out/m111-audit/m111-prod-pre-functions.json`.
- Post-verificación (m111-apply-migration-prod, 12/12): GEN-3 activa intacta; RECT-110-A: 2 asientos (GEN-2 + GEN-3), saldo GEN-3 0.00; counts GEN-3 sin cambios (1.103 entradas / 3.708 movimientos); re-verificación m111-prod-recovery-check «RECUPERACIÓN OK — estado 110 intacto».
- No se ejecutó RECT-110-A de nuevo; no se creó GEN-4 ni se modificaron movimientos históricos; no se tocó ninguna otra tienda.

## J. Rama, SHA, PR, CI y evidencia

- Rama: `fix/cp-fin-110-postreview-hardening-111-20261122` (desde `origin/main` 58d550d15).
- Commits por fases: `d50525e6a` (implementación + pruebas) → `69ee775fb` (producción + surface) → expediente/PR.
- PR: ver descripción del PR (referencia los 5 ids de comentarios de #1682).
- Evidencia local: `scripts/out/m111-audit/` (pre-backup, recovery-findings, impact-global, drift-check, prod-pre/post, recon-enervida-post, e2e check/post).
- Batería: tsc exit 0 · ESLint 0 errores (1.612 warnings pre-existentes) · Vitest 6.400+ PASS (corrida final en el PR) · Build compilado (TS interno OOM por RAM del sandbox [MEDIDO 4GB]; CI con 4096 heap) · SQL Static Gate 0 bloqueos (2 warnings pre-existentes documentados) · E2E aislado smoke 43+20 PASS + net-zero.

## K. Migraciones y seguridad (§11)

- `20261122120000_cp_fin110_enervida_reconciliation_fix.sql`: NO editada, NO renombrada.
- Diferencia fecha-de-archivo vs fecha-de-aplicación (documentada, sin renombrar objetos desplegados): 110 lleva nombre 22-11-2026 y se aplicó el 2026-11-21 (Etapa 6 de su expediente); 111 lleva nombre 22-11-2026 (versión posterior lexicográfica 130000 > 120000) y se aplicó el 2026-11-21 ~18:29 UTC. El stream de producción se aplica por canal gobernado (Management API); `supabase_migrations.schema_migrations` solo registra las 12 migraciones tempranas (documentado desde ADN-009) — sin impacto en secuencia.
- Replay del manifiesto regenerado (195 migraciones en el tramo; --check MATCH).
- RLS/ACL/permisos conservados; superficie re-certificada (222 funciones, sha a27f1763) con guardas CP-INFRA-019 y check-writers OK.

## L. Derivas pre-existentes EXTERNAS detectadas (no normalizadas)

Al re-certificar el surface desde live (18:31Z) aparecieron cuerpos LIVE de `create_sale_v2/34` y `register_supplier_payment/12` con cambios de una misión externa concurrente (**CP-LOG-UNIFICATION-001**: §3 gate de estado de recepciones en el lock; §5.1 referencia de transferencia por componente en la idempotencia) aplicados out-of-band entre la certificación 110 (12:58Z) y la re-certificación, SIN migración en `supabase/migrations`. Ambas funciones son AJENAS a esta misión; se documentaron en `ci-gate-allowlist.json → source_of_truth_baseline` (regla BODY_DRIFT_FROM_MIGRATION, expira 2026-12-31, ratificación del propietario pendiente) para no normalizar ni ocultar la deriva. El surface re-certificado (222 funciones) captura el live como fuente de verdad.
