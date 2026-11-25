# CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — INFORME FINAL

**Fecha:** 2026-11-26 · **PR:** #1716 (`fix/payment-lifecycle-supplier-integrity-20261126`, 7 commits) · **Estado CI:** 10/10 checks SUCCESS · mergeStateStatus CLEAN · mergeable MERGEABLE (fusión a criterio del propietario, como en #1711)
**Aplicación a producción:** 4 migraciones por canal gobernado con doble flag, verificadas · Remediación Pixelarte ejecutada por canal canónico.

---

## 1. Estado inicial y final del PR #1711 (§13.1)

| | Inicial (real, verificado) | Final |
|---|---|---|
| Rollup | **FAILURE** — check «E2E Aislado (project)» del evento `pull_request` (run 45648270666) fallido con 4 tests | **SUCCESS** (10/10) |
| Fusión | Abierto | Fusionado por el propietario 2026-11-25T16:41:12Z (0e684d6c1) tras la recuperación |
| Despliegue | — | Vercel producción SUCCESS 16:42:45Z |

## 2. Relación de checks fallidos y su corrección (§13.2)

| Check fallido | Job/Paso | Error exacto | Corrección |
|---|---|---|---|
| E2E Aislado (project) | «Ejecutar suite E2E» | 4 tests: `cpfin-reconciliation-tab` (locator.click timeout 60s, `recon-row-ACT_INVENTARIO`); `pos-checkout E2E-POS-018` (FK `products_store_id_fkey`, tienda piloto `a0bcc753` ausente); `E2E-POS-009` (signIn 400 invalid_credentials); `inventory rate-limit` (429 nunca disparado) | **Re-run oficial de jobs fallidos** del run `pull_request` (GitHub nativo) → attempt 2 SUCCESS 67/67. Cero tests deshabilitados, cero excepciones injustificadas |

## 3. Causa raíz de los problemas de CI (§13.3)

1. **El fallo E2E fue transitorio/ambiental** (estado anómalo intra-run de la BD aislada; mismo SHA + suite → 67/67 en re-ejecución). No correspondía al diff del PR #1711 (cxap UI/calculador/tests).
2. **El diagnóstico del informe previo era equivocado**: «9/9 verde» medía check-runs del SHA — que incluían una re-ejecución manual `workflow_dispatch` — pero **una re-ejecución manual NO actualiza el rollup del PR**; solo los runs del evento `pull_request` cuentan. La recuperación correcta era el re-run del run fallido.

## 4. Diagrama del ciclo de vida de pagos y devoluciones (§13.4)

```
Recepción / Servicio Recibido
        │ (confirmación: doc activo)
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ OBLIGACIÓN (receipts / received_services)                           │
│   Total = total_cost | total_amount×tasa                             │
│   Pagado = neteo del trigger update_payment_status                   │
│          (Σ 'in' − Σ contra-filas 'reversal')                        │
│   Saldo = Total − Pagado                                             │
└──────────────┬──────────────────────────────────────────────────────┘
               │ pago (register_supplier_payment[_multi/_batch])
               ▼
     payment_transactions 'in' ──(asiento 'pago' posted)──► caja/banco
               │
               │ RESOLUCIÓN OFICIAL (procedimiento único, §4.1)
               │   POST /api/payments/[id] → reverse_supplier_payment:
               │   contra-fila 'reversal' (reverses_payment_id, idempotente)
               │   + fin_post_payment_annulment + audit PAYMENT_REVERSED
               ▼
     Pagos vivos = 0  ──────────────►  YA SE PUEDE ANULAR/REVERTIR
                                          │
        ═════════ GUARD (NUEVO, misión §2) │ (antes: campo verde)
        Sin pagos vivos → continuar       │
        Con pagos vivos  → ERR_*_         ▼
        HAS_UNRESOLVED_PAYMENTS      ┌─────────────────────────────┐
        (4 vías RPC + UI con         │ void / reverse del doc      │
        diálogo informativo)         │ · servicios: asiento        │
                                     │   'anulacion' integral      │
                                     │   (trigger diferido)        │
                                     │ · recepciones: stock+WAC    │
                                     │   exactos + kardex          │
                                     └─────────────────────────────┘
```

## 5. Reglas implementadas para pagos confirmados y liquidados (§13.5)

- **Guard de pagos vivos** en las 4 vías (`reverse_receipt_v2`, `void_pending_reception`, `void_received_service_with_reversal`, `set_received_service_status`): un documento con filas `'in'` sin contra-fila NO se anula/revierte — primero se resuelve cada pago con la reversión oficial. Error estructurado `ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS` / `ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS` con `pagos_vivos=, importe_vivo=, total_documento=, saldo_actual=`.
- **Escenarios de la misión §4.2**: A (sin pagos → flujo habitual) ✓ · B (pago no liquidado → cancelar por reversión oficial y luego anular) ✓ · C (pago confirmado/aplicado → bloqueo con guía) ✓ · D (liquidado → nunca desaparece por anulación de registro; la reversión registra la operación compensatoria) ✓ · E (parcial → el guard considera solo los importes efectivamente aplicados; la contra-fila espeja el pago completo) ✓ · F (varios pagos/documentos → cada aplicación reversible individualmente por pago) ✓.
- **Atomicidad/idempotencia**: los 4 RPC son transaccionales (una excepción revierte todo); `reverse_supplier_payment` es idempotente (advisory lock + índice único + idempotency_key).
- Los bucles de auto-reversión preexistentes se conservan como defensa en profundidad (no se creó un segundo mecanismo).

## 6-10. Expediente Pixelarte (§13.6-13.10)

**Identificación:** servicio `fedb7c40` (SRV-20261123-00146, F-23112026, Pixelarte, $1,800 CUP), voided 21s después de su creación y 18s después de registrarse el pago `4783f9ae` (cash, 21:34:51); reemplazo activo `602eb3c1` (SRV-20261123-00147, mismo importe) creado 60s después del void.

**¿Salieron los $1,800 de caja?** El desembolso real único está representado por el REEMPLAZO ACTIVO (asientos posted; el pago del anulado fue compensado por el trigger al instante del void — entries a 'reversed' + asientos 'anulacion' enlazados). Doctrina ya documentada en la migración 20261124120200 de CP-OPS-ENERVIDA. **Caso 1** de la misión §5.2.

**Asientos originales y compensatorios:** reconocimiento (Dr GAS_SERVICIOS / Cr PAS_SERV_PEND — reversed) · pago (Dr PAS_SERV_PEND / Cr ACT_EFECTIVO_CUP — reversed) · anulacion ×2 posted (reversal_of enlazados a ambos). La reversión ejecutada NO generó asientos adicionales (idempotente: solo compensa entries 'pago' posted, y la del anulado ya estaba 'reversed').

**Estado final de la obligación:** cancelada — `paid_amount=0`, `payment_status='unpaid'`, excluida de CxP (voided). **Anticipo/derecho de recuperación:** NO procede (Caso 1; no hubo desembolso propio del anulado). Si el propietario aportara evidencia física contraria, el tratamiento sería el Caso 2 (reclasificación a `ACT_ANTICIPOS_PROV`), pero la evidencia contable existente es unívoca.

**Ejecución:** `POST /api/payments/4783f9ae` (canal canónico, sesión admin) → HTTP 201, contra-fila `db3b6ced`. **8/8 verificaciones §5.4 OK** (expediente: `pixelarte-reversal-evidencia.json`).

**Bug latente descubierto y corregido** (migración 20261126120200): `reverse_supplier_payment` era inoperante sobre servicios voided — el trigger de inmutabilidad bloqueaba el neteo del motor de pagos (`ERR_SERVICE_VOIDED`). Fix quirúrgico: sobre voided sin configs de RPC solo se admite el neteo de campos de pago (estado y campos de negocio intactos).

## 11. Identificación de las tres recepciones por $19,435 (§13.11)

`0b026405` («—», $19,200, 4× Cemento blanco 5kg, 12/10) · `79ffb3a9` («0000», $35, 35× Cemento Cola, 19/10) · `e564adca` («0002», $200, 100× Canaleta + 100× Expansiones, 22/10). Σ exacta $19,435.00 ✓. **Sin evidencia de identificación** (sin NIT, factura, contacto, notas, OC ni pagos). Decisión §7.3: se conservan como excepciones pendientes con trazabilidad; no se asignan por conveniencia ni se inventan proveedores. **Datos que faltan por recepción:** razón social y NIT/CI del proveedor, número y emisor de la factura original, contacto o referencia de compra.

## 12-13. Tienda Pueblo / TiendaPueblo y consolidación (§13.12-13.13)

**NO eran dos proveedores:** un único supplier local canónico «Tienda Pueblo» (03988f54) y UN documento con variante de digitación. Corrección gobernada (migración 20261126120100): supplier + supplier_id normalizados, audit `SR_SUPPLIER_NORMALIZED`, importes intactos. Verificado: 21 servicios bajo el canónico ($20,744.00), variante eliminada de CxP. No se fusionaron registros (no existía duplicidad de registros); el mecanismo oficial de consolidación local↔maestro (`consolidate_local_party`) sigue disponible si el propietario desea promover el local a maestro.

## 14-15. Cambios de código y migraciones (§13.14-13.15)

**Frontend:** `lib/payments/live-payments.ts` (nuevo) · `components/payments/UnresolvedPaymentsDialog.tsx` (nuevo) · pre-chequeos + backstops en `useReceptionsHistoryView`/`ReceptionsHistoryView` (Anular/Revertir/Invertir) · `ReceivedServicesView` (Anular + totalPaid neteado + botón pagar oculto en anulados) · `ReceptionDetailsModal` (totalPaid neteado) · `/api/accounts-payable` (filtros por estado con paridad exacta a los gates de pago) · `calculator.ts` (filtro defensivo) · `/api/received-services` y `/api/reverse` (mapeo 409 del guard) · `SupplierSelector` + `useSuppliers` + `ClientesProveedoresView` (prevención de duplicados con advertencia previa).

**Backend/DB:** 3 migraciones nuevas (guards 20261126120000 · TiendaPueblo 20261126120100 · fix trigger 20261126120200) + 20261125153000 (REVOKE de main, pendiente en producción). **Manifiesto replay 212→215.** Reversión de cada migración: reemitir cuerpos previos (git); el saneamiento documenta el UPDATE inverso en su audit.

## 16. Pruebas ejecutadas (§13.16)

- **Nuevas 38 PASS** (4 suites): contrato de migraciones (14: guards/orden/sin debilitación + saneamiento + fix trigger) · live-payments (10: escenarios §8.A) · calculador (5: filtros + **caso Pixelarte reproducido**) · proveedores (10: §8.D).
- **Regresión relacionada 100/100**: calculator 34/34 · useSuppliers 13/13 · navegación CxP 7/7 · adn008/payments 46/46 · assert-not-production 75/75.
- **E2E actualizado, no eliminado**: `cpfin003 A14` ahora valida el contrato nuevo (bloqueo 409 → reversión oficial → anulación → neto 0). CI del PR: **10/10 SUCCESS** (incluido E2E Aislado contra BD preparada con las migraciones). tsc EXIT 0 · ESLint 0 errores.

## 17. Estado real del despliegue (§13.17)

- **Producción (BD):** 4 migraciones aplicadas por canal gobernado (doble flag) y verificadas por sonda — guards activos, TiendaPueblo saneado, trigger corregido, REVOKE aplicado.
- **Producción (remediación):** reversión Pixelarte ejecutada por canal canónico; verificación financiera 14/14 OK.
- **Contrato de seguridad:** surface re-certificado desde LIVE (232 funciones, 0 divergencias bloqueantes).
- **App:** el PR #1716 queda listo para fusión (el propietario fusiona, como en #1711). Los cambios de UI verificados localmente contra datos reales de producción.

## 18. Commits y PR de cierre (§13.18)

`2afcefdf8` guards+saneamiento · `bf0bac835` app (guard UI, filtros, prevención) · `b3c202757` pruebas · `ad766d376` fix trigger + A14 · `8ebbe0634` tipos · `a4e3c1d3b` writers+verificación · `27dac878e`+`54c42518b` surface+expediente. **PR: https://github.com/Nardian90/Costpro/pull/1716** — CI 10/10, mergeable.

---

## Certificación (misión §10)

| Área | Condición | Estado |
|---|---|---|
| PR #1711 | CI completo e integración verificada | ✅ Rollup SUCCESS + fusionado + deploy verificado |
| Pagos | Ciclo de vida consistente | ✅ Guard en 4 vías + reversión oficial operativa (bug del trigger corregido) |
| Devoluciones | Protegidas ante pagos sin resolver | ✅ RPC + UI con diálogo informativo y guía |
| Pixelarte | Obligación $1,800 cancelada | ✅ paid=0/unpaid, contra-fila enlazada, 8/8 §5.4 |
| Caja y banco | Movimientos reales conservados | ✅ Sin fantasmas; desembolso real resta 1 vez (reemplazo) |
| Contabilidad | Reversiones correctas | ✅ Idempotentes, enlazadas reversal_of, sin dobles |
| Recepciones sin proveedor | Identificadas o documentadas | ✅ Documentadas como pendientes ($19,435, sin datos para identificar) |
| Tienda Pueblo/TiendaPueblo | Duplicidad resuelta o descartada | ✅ Descartada (quirk de digitación) y corregida con evidencia |
| Clientes y Proveedores | Mecanismo oficial | ✅ Investigado y usado como referencia; consolidación disponible |
| Cuentas por Pagar | Totales conciliados | ✅ $3,031,493.90 − $68,665.00 = $2,962,828.90 (documentos==proveedores) |
| Multitienda | Aislamiento conservado | ✅ Sin cambios de RLS; guards con has_store_access_as intactos |
| RLS | Seguridad intacta | ✅ Sin ACL nuevas; REVOKE pendiente aplicado; contract-surface 0 drift |
| Pruebas | Regresión y E2E aprobadas | ✅ 38 nuevas + 100 relacionadas + CI 10/10 (E2E incluido) |
