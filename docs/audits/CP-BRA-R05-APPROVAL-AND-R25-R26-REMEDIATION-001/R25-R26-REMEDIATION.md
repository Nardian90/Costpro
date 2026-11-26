# R25-R26-REMEDIATION — Causa raíz, corrección, evidencia y despliegue productivo

**Misión:** CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 · **Fecha:** 2026-11-27
**Alcance autorizado (misión §0.2):** investigar, implementar, probar y preparar remediaciones para R-25/F011-001 y R-26/F011-002 — **defectos de funcionamiento e integridad financiera, no nuevas políticas de negocio**. Sin modificación de datos históricos.

---

## 1. R-25 / F011-001 — Pagos individuales de OT imposibles desde la app

### 1.1 Causa raíz

| Elemento | Detalle |
|---|---|
| Defecto | Las vías single de pagos a órdenes de trabajo invocaban `register_supplier_payment` con el **cliente de sesión** (JWT del usuario); la ACL de la función es service_role exclusiva desde REM-INV-6 (20260916000002) → `permission denied` para toda sesión real |
| Código responsable | `src/app/api/payments/route.ts` (loop `production_order|work`) · `src/app/api/production-orders/[id]/payments/route.ts` · **descubierto en la auditoría §3.2:** `src/app/api/accounts-payable/bulk-pay/route.ts` (recepciones/servicios por el mismo RPC; sin gate) |
| Impacto operativo | Todo pago a OT desde la interfaz/API roto desde el hardening ACL; los pagos OT históricos (18/18 reconciliados) preceden al cambio. La vía batch (service/receipt) y la reversión sí funcionaban (cliente admin tras gate) |
| Invariante afectado | FIN-002 (motor de pagos — canal de invocación), FIN-004 (autorización de gestión — ausente en 2 rutas) |

### 1.2 Corrección (patrón canónico §3.3 — mismo que batch y reversión)

1. Llamada privilegiada vía `getSupabaseAdminSafe()` **exclusivamente tras el gate `canManageStore`** (server-side).
2. **Gate añadido** a `/api/production-orders/[id]/payments` y `/api/accounts-payable/bulk-pay` (rutas que invocaban privilegios sin él — inconsistencia con `/api/payments` y `/api/payments/multi`).
3. Actor auditado `p_paid_by = session.user.id` (jamás parámetro del cliente); tienda del contexto validado (`profiles.active_store_id`); pre-check RLS de pertenencia OT↔tienda; `idempotency_key` opcional en la ruta OT (paridad con `/api/payments`).
4. **La ACL de la BD NO se debilita** (service_role exclusiva intacta); el cliente service_role nunca llega al navegador.

### 1.3 Pruebas (misión §3.4 — 16/16 PASS en CostproE2E vía API real con Bearer JWT)

| Caso | Resultado |
|---|---|
| Usuario autorizado registra pago (manager, `/api/payments`) | PASS — actor real en `paid_by` |
| Admin plataforma (ruta production-orders) | PASS |
| Usuario no autorizado / clerk / usuario ordinario | PASS — 403 por `canManageStore` |
| Usuario de otra tienda / OT de otra tienda | PASS — 404/403 sin fuga de datos (RLS) |
| OT anulada | PASS — 409 `ERR_ORDER_NOT_PAYABLE` (guard del RPC) |
| Solicitud no autenticada | PASS — 401 |
| Manipulación de actor (`paid_by`/`p_user_id` del cliente) | PASS — ignorado, actor real |
| Manipulación de tienda (`store_id` del cliente) | PASS — ignorado, tienda real |
| Idempotencia (misma clave) | PASS — mismo pago, sin duplicado |
| Reintento de solicitud | PASS |
| Dos pagos concurrentes | PASS — FOR UPDATE serializa; sobrepago concurrente rechazado |
| Pago parcial / completo | PASS — `partial` / `paid`+`paid_at` (trigger) |
| Auditoría con actor real | PASS — `paid_by` real + entrada fin `ORDEN_TRABAJO` con partida doble |

`data-hygiene-guard` → **PASS — net delta = 0**. Vitest de contrato actualizado al estado post R-25 (`adn008-payments-batch.test.ts` 12/12): loop OT por cliente administrativo tras gate, sesión sin rpc privilegiados, actor de sesión, OT ajena 403.

### 1.4 Evidencia productiva

- CI del PR **#1728** (7/7 checks success, incl. E2E Aislado y Unit & Integration Tests) · fusionado en **`8c3dbf815`**.
- La corrección es de capa aplicación: no requiere migración ni despliegue de BD.
- Producción (solo lectura, post-merge): la ACL del RPC y los pagos históricos intactos.

## 2. R-26 / F011-002 — Neteo de contra-filas en el pre-check del batch

### 2.1 Auditoría del cálculo (misión §4.2)

| Pregunta | Respuesta verificada |
|---|---|
| Filas consideradas pagos originales | Todas las `payment_transactions` del `(ref_type, ref_id)` |
| Contra-filas | `direction='reversal'` con `reverses_payment_id` al original (CHECK de la tabla: in/out/refund/recovery/reversal) |
| Identificación de dirección | Columna `direction` — históricas NULL tratadas como `'in'` (`COALESCE`) |
| Estados que entran al cálculo | Todas las filas (la tabla no tiene status; una reversión es expresamente una contra-fila) |
| SUMs del pre-check | **UNO solo** (`v_paid`); `v_sum_in_doc` acumula componentes del lote (no consulta BD) |
| Importe comparado | `v_sum_in_doc > v_balance` → `ERR_BATCH_OVERPAY` |
| Reversas parciales/totales/múltiples | Cada contra-fila es por la fila COMPLETA revertida; el neteo por acumulación las cubre |
| Idempotencia | Fast-path de replay precede al pre-check de overpay — intacto (un lote reenviado no es overpay) |

El motor single (20261126140000 §2) y el trigger `update_payment_status` SÍ netean → **dos fórmulas para el mismo concepto de saldo** (violación de la invariante exigida por la misión §4.3).

### 2.2 Corrección (migración `20261127120000_cpbra_r26_batch_reversal_netting.sql`)

- Re-emisión del batch con **cambio quirúrgico verificado programáticamente**: identidad byte con el cuerpo vivo (20261121200000) salvo el SUM (diff de 17 líneas: 9 comentario + 8 código).
- El pre-check adopta el **mismo CASE de neteo del motor single**: las contra-filas RESTAN en la moneda del documento.
- Guards fail-closed `R26-GUARD` (firma) y `R26-VERIFY` (neteo en el CÓDIGO sin contar comentarios — lección R-05; ACL service_role exclusiva; overpay intacto).
- ACL re-declarada (REVOKE PUBLIC/anon/authenticated; GRANT service_role).
- **Contabilidad protegida:** cero UPDATE/DELETE sobre `payment_transactions`/`fin_*` (verificado por test estático #9 y batería I); el neteo es un cambio de LECTURA.

### 2.3 Pruebas (misión §4.4 — casos A–H)

| Caso | Escenario | Resultado |
|---|---|---|
| A | obligación 1.000, pago batch 1.000, sin reversión | PASS — paid |
| B | pago 1.000, reversión, resto vivo 300, batch paga el pendiente legítimo (700) | PASS — neto 1.000 paid |
| C | pago 1.000, reversión TOTAL, registro posterior válido | PASS — neto 500 |
| D | reversas MÚLTIPLES (3 filas revertidas) → batch consistente con el mayor | PASS — neto 500 = paid |
| E | sobrepago verdadero (701 > saldo NETO 600) rechazado; pago exacto (600) aceptado | PASS — ERR_BATCH_OVERPAY + sin filas nuevas |
| F | reintento con la misma clave de idempotencia | PASS — replay, mismos ids, sin duplicados |
| G | operaciones concurrentes | PASS — FOR UPDATE serializa; ambos sobrepagos concurrentes rechazados |
| H | individual ≡ batch sobre obligaciones equivalentes | PASS — mismo saldo neto (700/partial) |
| I | integridad contable | PASS — contra-filas y asientos compensatorios jamás mutados |
| APP | liquidación batch vía API real tras reversión | PASS — 201, saldo neto correcto |

Batería: `scripts/e2e/cpbra-r26-batch-netting-battery-e2e.mjs` (11/11 PASS run 5, limpieza por TAG OK). Contrato estático: `cpbra-r26-batch-netting-migration.test.ts` (12/12). Suite FIN-011 completa con pines convertidos: **16/16 PASS** (teardown net-zero).

### 2.4 Despliegue productivo gobernado (§11g)

| Paso | Evidencia |
|---|---|
| Aislada primero | PRE `c4fd6cc7` (defecto) → POST `9ab5db94` (neteo) — `cpbra-r26-apply-e2e.mjs` |
| Contratos y replay | static 12/12; replay 219→220 posición 220; security-contract 0 divergencias |
| Validación de seguridad | SQL DB Security + SQL Static + Security Audit + Allowlist Review: success en #1729 |
| Commit y PR | PR **#1729** (9/9 checks success incl. E2E Aislado) — apilado sobre #1728 (dependencia real del spec FIN-011 documentada) |
| Fusión | **`c9350fb421`** (2026-11-27) |
| Aplicación productiva UNA vez | `cpbra-r26-apply-prod.mjs` (guard CP-INFRA-019 + doble flag): PRE conforme (body `c4fd6cc7` idéntico al de la aislada — sin drift), 6/6 marcas POST, NOTIFY pgrst |
| Verificación posterior | body_hash producción = **`9ab5db94537d7152e9b38ffebd191558`** = idéntico al de la aislada; 1 contra-fila histórica (1.800) intacta; 4.415 fin_entries intactos |
| Reexportación del surface | `contract-surface.sql` (233 funciones, sha `d5975f5f…`) re-certificado desde LIVE. NOTA: el batch NO figura en el surface por diseño (filtro write-detector REM-INV-6R: sus escrituras ocurren dentro del motor single, que SÍ está certificado); el contrato del batch se verifica por replay del stream (capa B/C) y tests estáticos. Entradas allowlist `register_supplier_payment_batch/7` y `confirm_inventory_adjustment/2` **RETIRADAS** (ambos despliegues aplicados) |

## 3. Pins N6/N7 → regresiones positivas (misión §5)

- **N6** → positivo: el pago OT vía app FUNCIONA (actor real) + negativo conservado (OT ajena rechazada sin fuga).
- **N7** → positivo: el batch NETEA — el pago por el saldo restablecido prospera tras las reversiones del ciclo + el sobrepago verdadero sigue rechazado + contra-filas intactas.
- Sin pérdida de cobertura negativa: N1–N5 intactos; las baterías dedicadas R-25 (16 casos) y R-26 (11 casos) añaden la matriz completa.
- Suite FIN-011: 16/16 PASS post-conversión.

## 4. Riesgos residuales

1. **R-25:** `pay_commission` (ACL authenticated) es invocable por miembros sin rol de gestión vía PostgREST directo — tiene guards propios (advisory lock, validación física de efectivo, idempotencia); elevar su ACL al patrón gestionado es decisión del propietario (fuera de alcance §0.2).
2. **R-26:** el `ERR_BATCH_OVERPAY` del batch ahora opera sobre saldo NETO — coherente con el motor; el overpay de OT por la vía batch no existe (la ruta batch es service|receipt).
3. Los pines de la suite FIN-011 en ramas que NO contengan las conversiones fallarán contra la BD ya migrada (comportamiento por diseño del ciclo del pin) — ocurrió en el CI de #1726 (gaceta, sesión paralela): se resuelve integrando main. Documentado como estado de test/infraestructura, no defecto de producto.

## 5. Registro de ejecución post-fusión

| Batería | Resultado |
|---|---|
| Vitest completo (5 chunks) | **5.335 tests PASS · 0 FAIL** (90 skips preexistentes) |
| ESLint | 0 errores (1.658 warnings preexistentes) |
| ci-gate-business-rules | GATE PASS |
| check-writers | OK (manifests R-25/R-26 declarados) |
| security-contract-test-static | OK — 0 divergencias bloqueantes |
| build-migrations-replay --check | MATCH (220 migraciones) |
| CI #1728 / #1729 | 7/7 y 9/9 success (incl. E2E Aislado) |
| TS typecheck local | limitación documentada (heap OOM preexistente) — cubierto por CI (TypeCheck success) |
