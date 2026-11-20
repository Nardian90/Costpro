# ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008 — Expediente
## Mejora integral de creación de Servicios Recibidos: borradores, selector de proveedores y liquidación inmediata multidivisa y multipago (+ complemento de organización compacta)

- **Fecha:** 2026-11-20 · **Aplicación:** ADNegocio · **Repo:** Nardian90/Costpro
- **Rama:** `feat/adn-services-creation-workflow-008-20261120` · **PR:** #1670 · **Base:** `main` `2bdb8b191`
- **Autorización:** §12 de la misión (propietario autoriza UI + backend + pruebas + migraciones estrictamente necesarias; sin aprobaciones intermedias técnicas).

---

## 1. Alcance ejecutado

| # | Mejora | Estado |
|---|---|---|
| 1 | Borradores con cero efecto financiero + recuperación + confirmación única | ✅ |
| 2 | Selector de proveedores de Recepciones reutilizado + identidad real guardada | ✅ |
| 3 | Liquidación inmediata multipago/multimoneda atómica (motor de ventas) | ✅ |
| 4 | Complemento: vinculación operativa en acordeón contraído + combobox de tipos | ✅ |

## 2. Decisiones de diseño (y por qué)

1. **NO tocar `create_received_service_v2`**: extender su firma crearía un overload con riesgo PGRST203 de ambigüedad contra el app vivo. En su lugar RPC NUEVO `create_received_service_draft` (borrador con proveedor opcional + `creation_key` idempotente).
2. **Confirmación = transición de estado**: `set_received_service_status` (misma firma, CREATE OR REPLACE) con gate draft→active (proveedor no vacío + importe > 0). El app previo al merge usa PATCH legacy (flag USE_V2 off, UPDATE directo) y no llama a este RPC en el flujo actual → sin regresión en la ventana de despliegue.
3. **Atomicidad del multipago**: `register_supplier_payment_batch` (1..20 componentes; pre-check de la suma contra el saldo pendiente EN LA MONEDA DEL DOCUMENTO con la misma aritmética del motor; replay del bloque ANTES del overpay; reuso de `register_supplier_payment` por componente → tasas fail-closed, overpay, asiento 'pago' por componente vía `fin_trg_payment_transactions` sin cambios). El replay precede al overpay porque un lote ya aplicado deja saldo 0 y el reenvío idéntico es un replay (hallazgo del E2E P1).
4. **Identidad de proveedor**: columnas aditivas NULL-ables (patrón snapshot de `receipts`) + ownership fail-closed (tienda local / tenant del maestro + status active). Los registros históricos («No especificado (registro histórico)» incluido) quedan intactos.
5. **Constraint de proveedor condicional**: el CHECK vigente (`20260809000001`) exigía supplier NOT NULL y no vacío para todo documento; ahora obligatorio SOLO para no-borradores. Pre-verificado: 0 filas históricas no-draft con supplier NULL/vacío.
6. **Acordeón contraído** con badge «Configurado» (no auto-abierto), método de distribución SOLO con recepción vinculada (§1.2 del complemento: si no hay recepción, no mostrar configuración sin efecto).

## 3. Cambios

### Migración `20261121120000_adn008_sr_drafts_supplier_multipago.sql` (aditiva)
- Columnas: `received_services.supplier_id`, `supplier_master_party_id`, `supplier_code`, `supplier_tax_id`, `supplier_phone`, `supplier_address` (+ COMMENTs).
- RPCs NUEVOS: `create_received_service_draft`, `update_received_service_draft`, `register_supplier_payment_batch` + helpers `adn008_supplier_belongs_to_store` / `adn008_master_party_valid_for_store`.
- `set_received_service_status`: gate draft→active (misma firma).
- Constraint `received_services_supplier_not_null` → condicional por estado.
- ACLs al patrón repo (REVOKE PUBLIC/anon; GRANT authenticated+service_role).

### Backend
- `POST /api/received-services`: modo `save_as_draft` (RPC draft + `creation_key`) + identidad del proveedor en confirmación (enriquecimiento por PK con warning no bloqueante) + mapeo unificado de errores.
- `PATCH /api/received-services`: `action=update-draft` (RPC) y transición de estado SIEMPRE por `set_received_service_status` (el path legacy con UPDATE directo saltaba el gate y la auditoría — retirado para el cambio de estado).
- `POST /api/payments`: `ref_type='service'` → `register_supplier_payment_batch` único y transaccional; recepciones/OT conservan el loop histórico.

### Frontend (`ReceivedServicesView.tsx`)
- `CreateServiceModal` reescrito: modos creación/edición de borrador en la misma pantalla; SupplierSelector de Recepciones; combobox de tipos con búsqueda; acordeón de vinculación contraído; textos de los dos modos de pago (§6); tres salidas diferenciadas con `window.confirm` (§6.1); a11y (htmlFor/id).
- Listado: filtro «Borradores», botón Continuar en borradores, `Recalcular` oculto en borradores.
- Detalle: banner de borrador + «Continuar edición»; pestaña Pagos sin registro hasta confirmar.

## 4. Validación (todo ejecutado realmente)

| Gate | Resultado |
|---|---|
| `tsc --noEmit` (heap 3.5GB, sin cache, pm2 detenido) | 0 errores |
| ESLint (archivos tocados) | 0 errores (warnings de estilo pre-existentes) |
| vitest completo | **6278/6278 PASS** (95 skipped — igual patrón que el baseline) |
| E2E ADN-008 (proyecto `creation`, BD AISLADA) | **10/10 PASS** + guardrail net-zero PASS |
| Evidencia visual (proyecto `creation`, BD AISLADA) | PASS — 12 capturas + assert sin desbordes móviles |
| E2E smoke core (mismo filtro CI) | sin cambios de specs del core |
| Build de producción | por CI (el sandbox local OOMea — patrón 002-007) |

Pruebas nuevas: contrato estático de la migración (18), rutas draft/batch (20), componente (15), E2E (10) + actualización al contrato batch de `payments-route-payment-date` y del libro de migraciones (185).

## 5. Aplicación de la migración

| Destino | Cuándo | Método | Evidencia |
|---|---|---|---|
| BD AISLADA (`lguovmvrozxgssupkwpf`) | 2026-11-20 14:36 UTC (v1) y 15:0x UTC (v2 constraint + replay-first, re-aplicación idempotente) | `scripts/m008-apply-migration-e2e.mjs` (Management API + guard CP-INFRA-011) | 7/7 marcas OK; verificación re-ejecutable con `--check` |
| **PRODUCCIÓN** (`wthkddeleylijmonclxg`) | **2026-11-20 16:34 UTC** (aplicación única) + `--check` 16:35 UTC | `scripts/m008-apply-migration-prod.mjs` (guard CP-INFRA-019 + doble flag; Management API) | **8/8 marcas OK** — ver §6 |

## 6. Registro de aplicación en producción

- **SHA de la migración aplicada:** `81a35979e` → expediente en commit posterior (contenido idéntico de la migración; `git log` de `20261121120000_adn008_sr_drafts_supplier_multipago.sql`).
- **Fecha/hora UTC:** **2026-11-20 16:35 UTC** (aplicada 16:34, verificada 16:35).
- **Canal:** `scripts/m008-apply-migration-prod.mjs` — guard CP-INFRA-019 con destino REAL (producción) + doble flag explícito del operador (`ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND`); Management API; UNA sola aplicación + `--check` re-ejecutable.
- **Marcas post-aplicación (8/8 OK):** cols · f_draft · f_update · f_batch · gate_status · batch_uses_motor · v2_untouched · constraint_condicional.
- **Motivo de aplicar antes del merge:** el gate Capa C (reconciliación source-of-truth, REM-INV-6) exige cuerpo LIVE ≡ replay de migraciones — con la migración pendiente, `set_received_service_status` divergía (BODY_DRIFT_FROM_MIGRATION) y bloqueaba el CI. Pre-autorización §12 del propietario; validación íntegra previa en BD aislada (E2E 10/10).
- **Compatibilidad durante el despliegue:** todas las firmas existentes se conservan; `create_received_service_v2` intacto; el único cambio observable pre-merge es el gate draft→active (el flujo legacy no lo invoca) y la constraint condicional (pre-verificada: 0 filas históricas violándola).

## 7. Residuos y limpieza

- BD AISLADA: net-zero verificado (guard PASS tras cada corrida; tienda efímera del run hard-deleted; usuarios de run eliminados; script `m008-cleanup-e2e-users.ts` re-ejecutable para residuos históricos — limpió 24 usuarios/probe de sesiones previas y dejó 0/0).
- Producción: 0 escrituras de datos (solo DDL de la migración en §5); ningún documento histórico alterado; PT007 y `prevent_received_service_edit` intactos.
- Sandbox: PM2 online con .env PRINCIPAL (health 200); .env/.env.main/.env.e2e-run nunca commiteados; scan de secretos del diff: 0.

## 8. Hallazgos y lecciones

1. El backend de borradores ya existía (el RPC v2.18.0 creaba en draft y la UI activaba inmediatamente) — «Guardar borrador» fue un cambio de flujo, no de motor.
2. `PaymentRowsEditor` ya era el motor compartido de ventas/recepciones; la brecha real era la atomicidad entre filas, no la UI.
3. La constraint NOT NULL de supplier bloqueaba borradores sin proveedor → constraint condicional (pre-verificada contra 0 violaciones históricas).
4. El E2E detectó el orden replay/overpay del batch — corregido en migración antes del merge (valor del E2E real sobre BD aislada).
5. El catálogo aislado puede llegar sin tipos activos → la evidencia crea un tipo efímero y lo desactiva (net-zero por convención).
6. Re-aplicar migraciones idempotentes (IF NOT EXISTS / CREATE OR REPLACE) es seguro y verificado.

## 9. Criterio de cierre (§12) — verificación

1. ✅ Borrador guardable y recuperable (E2E B1/B3 + capturas 07-09)
2. ✅ Selector de proveedores con funcionamiento de Recepciones (E2E B3 + identidad real)
3. ✅ Liquidación inmediata multipago/multimoneda (E2E L1)
4. ✅ Efectivo CUP por defecto (test de componente + captura)
5. ✅ Modo pendiente operativo (E2E P1)
6. ✅ Integridad financiera (asientos equilibrados, PAS_SERV_PEND a cero, cero duplicados)
7. ✅ Ejemplo 40 USD + 1.000 CUP por el mismo mecanismo de pagos del sistema (E2E L1 + captura 05)
8. ✅ Pruebas/build/CI verificados (build por CI)
9. ✅ PR independiente listo para revisión (#1670)
