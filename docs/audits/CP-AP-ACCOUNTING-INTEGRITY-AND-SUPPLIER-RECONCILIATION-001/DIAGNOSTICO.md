# CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — DIAGNÓSTICO

**Fecha:** 2026-11-26 · **Sucursal auditada:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) · **Rama:** `fix/payment-lifecycle-supplier-integrity-20261126` · **PR:** #1716

---

## 1. FASE 0 — Estado real verificado (no se asume el informe previo)

| Elemento | Estado real encontrado | vs informe previo |
|---|---|---|
| PR #1711 | OPEN con `statusCheckRollup=FAILURE`: el check «E2E Aislado (project)» del evento `pull_request` (run 45648270666) falló con 4 tests | El informe previo decía «9/9 checks verdes»: midió los check-runs del SHA (que incluían la re-ejecución manual `workflow_dispatch`, exitosa), NO el rollup del PR — **una re-ejecución manual NO actualiza el check del PR** |
| Merge de #1711 | Fusionado por el propietario a las 2026-11-25T16:41:12Z tras la recuperación oficial del CI (re-run de jobs fallidos) | — |
| Despliegue | Vercel producción del merge commit 0e684d6c1: SUCCESS (16:42:45Z) | — |
| Migración 20261125153000 en producción | **NO aplicada** (`authenticated` conservaba EXECUTE en `add_reception_items`/`save_pending_reception_changes`) | El worklog previo la daba por aplicada con doble flag |

**Causa raíz del fallo E2E (4 tests, run pull_request):** transitorio/ambiental — la tienda piloto efímera `a0bcc753` del run desapareció intra-run (FK en `products`, `signIn` invalid_credentials), el rate-limit 429 no disparó y `recon-row-ACT_INVENTARIO` nunca renderizó. Mismo SHA + mismo suite → 67/67 PASS en re-ejecución. Recuperación: `rerun-failed-jobs` del run `pull_request` (procedimiento nativo GitHub) → attempt 2 SUCCESS → rollup SUCCESS → fusión.

## 2. FASE 2 — Mapeo del ciclo de vida de pagos (hallazgos)

1. **Mecanismo oficial de reversión (existe, desplegado 24/11):** RPC `reverse_supplier_payment` (20261124120000 §4) — idempotente (advisory lock + `uq_payment_reversal_origin` + `idempotency_key='reversal:<id>'`), transaccional, service_role. Inserta contra-fila (`direction='reversal'`, `reverses_payment_id`), llama `fin_post_payment_annulment` y audita `PAYMENT_REVERSED`. Canal HTTP: `POST /api/payments/[id]`. UI: `PaymentHistoryRow` (botón anular por fila) + pestañas de pagos de recepciones y servicios.
2. **Asimetría receptora:** `void_received_service_with_reversal` y `set_received_service_status` YA auto-revertían pagos al anular (contra-filas + asientos). `reverse_receipt_v2` y `void_pending_reception` NO: solo reseteaban `paid_amount=0` y appendlan notas — el dinero quedaba como salida elegible sin contra-fila.
3. **NINGÚN guard de pagos** existía en ninguna de las 4 vías de anulación/devolución (campo verde).
4. **Estados reales:** `payment_transactions` no tiene columna de estado — el estado es implícito: `'in'` sin contra-fila = aplicado; con contra-fila = revertido. La "liquidación" por lote (`register_supplier_payment_multi`) no deja estado propio. El trigger `update_payment_status` netea contra-filas en `paid_amount` (reemitido 20261124120000 §2).
5. **Deuda UI detectada:** botón «Registrar Pago» visible en servicios `voided`/`cancelled`; `totalPaid` sin netear reversals en `ServiceDetailModal` y `PaymentsTab`; `/api/accounts-payable` y el calculador no excluían receipts `reversed` ni services `cancelled`/`draft` (obligaciones fantasma que el RPC de pago rechazaba).
6. **Cuenta de anticipos:** `ACT_ANTICIPOS_PROV` existe en el plan (sin uso en reglas) — disponible si un caso futuro exige reclasificación en lugar de reversión.

## 3. FASE 3 — Expediente del caso Pixelarte F-23112026

### 3.1 Reconstrucción documental (solo lectura, producción)

| Hora (UTC 23/11) | Evento | Evidencia |
|---|---|---|
| 21:34:48 | Creación del servicio `fedb7c40` (SRV-20261123-00146, F-23112026, Pixelarte, $1,800 CUP, con `supplier_id` estructurado) | audit `SERVICE_CREATED` (usuario a1111111) |
| 21:34:50 | Activación (draft→active) | audit `SERVICE_STATUS_CHANGED` |
| 21:34:51 | **Pago $1,800 cash** (`4783f9ae`, direction='in', sin contra-fila) | audit `SUPPLIER_PAYMENT_REGISTERED` + asiento `pago` posted |
| 21:35:09 | **VOID del servicio** — trigger diferido `fin_trg_received_services` → `fin_post_document_annulment` compensó ÍNTEGRO (reconocimiento + pago): entries a status='reversed' + asientos 'anulacion' enlazados vía `reversal_of` | fin_entries: reconocimiento×1 reversed, pago×1 reversed, anulacion×2 posted |
| 21:36:09 | **Servicio de REEMPLAZO activo** `602eb3c1` (mismo F-23112026, mismo importe, texto libre sin `supplier_id`) | entries reconocimiento+pago posted |

### 3.2 Determinación de qué ocurrió con el dinero (misión §5.1)

- El **ledger ya compensó** el pago del documento anulado en el propio instante del void (asientos de anulacion posted 21:35:09.628).
- El **desembolso real único** de $1,800 está representado por el **servicio de reemplazo activo** (entries posted) — doctrina ya documentada por CP-OPS-ENERVIDA en la migración 20261124120200: *«su reemplazo activo SRV-20261123-00147 sigue restando exactamente una vez»*.
- Reportes de caja: el pago del documento anulado YA estaba excluido (regla de elegibilidad) y la contra-fila sobre documento anulado TAMBIÉN lo está → el par original+reversa netea a cero en caja.
- **Conclusión: Caso 1 de la misión §5.2** — el pago del documento anulado no tiene desembolso propio; el desembolso real pertenece al reemplazo. No corresponde reclasificar como anticipo (Caso 2) ni registrar reembolso (Caso 3).

### 3.3 Bug latente descubierto al ejecutar la remediación

Primer intento de `POST /api/payments/4783f9ae` → HTTP 500 `ERR_SERVICE_VOIDED: no se puede editar un servicio anulado`. Cadena: `reverse_supplier_payment` inserta contra-fila → trigger `update_payment_status` hace UPDATE del servicio voided (`paid_amount`/`payment_status`) → `trg_prevent_received_service_edit` rechaza (las configs de escape `app.is_void_rpc`/`app.is_status_change_rpc` solo las fijan los RPCs de anulación, no el motor de pagos). **El mecanismo oficial era inoperante sobre servicios anulados.** El intento fue transaccional: cero efectos.

**Fix (migración 20261126120200):** sobre un servicio voided sin configs de RPC, un UPDATE se admite SOLO si el estado no cambia y NINGÚN campo de negocio varía — únicamente el neteo de `payment_status/paid_amount/paid_at/payment_method/updated_at` (el motor de pagos). La inmutabilidad de auditoría queda intacta.

### 3.4 Resolución ejecutada (FASE 9, canal canónico)

- Aplicación gobernada de las 4 migraciones (doble flag, validadas antes en la BD aislada E2E).
- `POST /api/payments/4783f9ae` con sesión admin real → **HTTP 201**, contra-fila `db3b6ced` ($1,800, `reverses_payment_id=4783f9ae`, `idempotency_key='reversal:4783f9ae…'`), motivo documentado completo.
- **8/8 verificaciones de la misión §5.4 en verde** (evidencia: `download/cpai-evidencia/pixelarte-reversal-evidencia.json`): anulación histórica conservada, obligación cancelada (paid=0/unpaid), pago des-aplicado con contra-fila enlazada, movimiento original conservado (PT007), importe espejado, sin asientos duplicados (idempotente: la entry 'pago' ya estaba 'reversed'), fin_entries sin cambios.

## 4. FASE 5 — Las tres recepciones sin proveedor ($19,435.00)

| Recepción | Doc | Total | Fecha | Items | Pagos |
|---|---|---|---|---|---|
| `0b026405` | «—» | $19,200.00 | 2026-10-12 (23:59:59 — patrón de carga/importación) | 4× Cemento blanco 5kg @ $4,800 | 0 |
| `79ffb3a9` | «0000» | $35.00 | 2026-10-19 | 35× Cemento Cola @ $1 | 0 |
| `e564adca` | «0002» | $200.00 | 2026-10-22 | 100× Canaleta gris 60x35 + 100× Expansiones anaranjada @ $1 | 0 |

Σ = **$19,435.00 exactos** ✓. Sin NIT, sin teléfono, sin notas, sin referencia de compra, sin pagos, sin órdenes de compra vinculadas.

**Decisión (misión §7.3):** NO hay evidencia suficiente para identificar a los proveedores reales. NO se asignan a Proveedor General, Vitallcons ni ningún otro por conveniencia; NO se inventan proveedores. Permanecen como **excepciones pendientes de resolución** con trazabilidad completa. Datos exactos que faltan para identificar cada uno: razón social/NIT del proveedor, factura original (número y emisor), contacto y/o referencia de compra.

## 5. FASE 6 — Tienda Pueblo / TiendaPueblo

**Resultado de la investigación:** NO existen dos registros de proveedor. Hay UN proveedor local canónico «Tienda Pueblo» (`03988f54`, creado 2026-10-26 15:03 UTC, sin vínculo a maestro) y **un único documento** con la variante de digitación «TiendaPueblo»: el servicio SRV-20261026-00087 (ref. C26102026, $400, tipo Comisión, activo y pagado, observación «Pago de comisión 26/10/2026»), creado el MISMO día que el proveedor local. Los otros 20 servicios y 5 recepciones usan la forma canónica.

**Corrección (misión §8.2, vía gobernada — no existe RPC oficial de edición del proveedor de un documento):** migración 20261126120100 — UPDATE quirúrgico del snapshot textual + `supplier_id` estructurado, con guards de identificación (service_number + reference_doc + supplier exacto), fail-closed (sin canónico único → NOTICE y pendiente), audit `SR_SUPPLIER_NORMALIZED` con antes/después y hint de reversión, no-op en replays. **Verificado:** importes/pagos/estado intactos; la variante desapareció (21 servicios bajo «Tienda Pueblo», $20,744.00).

**Prevención futura (§8.4):** `normalizeSupplierName` (TiendaPueblo ≡ Tienda Pueblo) + `findSupplierMatches` (nombre normalizado / NIT / teléfono) con advertencia ANTES de crear (AlertDialog con «Usar existente» / «Crear de todos modos») en `SupplierSelector` (recepciones + servicios) y en el alta de terceros de Clientes y Proveedores. Unicidad NO estricta por nombre; el reuse automático sigue siendo solo por coincidencia exacta.

## 6. FASE 7 — Comprobaciones financieras (post-corrección, 14/14 OK)

| Métrica | Valor final | Punto forense previo | Delta |
|---|---|---|---|
| Documentos incluidos | 119 | 120 | −1 (servicio cancelled excluido) |
| **Total original** | **$3,031,493.90** | $3,032,493.90 | −$1,000.00 |
| **Pagado aplicado** | **$68,665.00** | $68,665.00 | 0 |
| **Saldo** | **$2,962,828.90** | $2,963,828.90 | −$1,000.00 |

- Delta explicado íntegramente por la semántica corregida: el servicio `cancelled` «Comis-21112026» ($1,000) ya no figura como obligación (gate de pago: solo `active` es pagable).
- Identidad `Total − Pagado = Saldo` al centavo ✓ · Suma por documentos == suma por proveedores ✓.
- Caja: sin entradas fantasma por la contra-fila del anulado (elegibilidad) y el desembolso real resta exactamente una vez (reemplazo activo).
- Integridad: cero pagos vivos sobre documentos anulados · cero huérfanos · una sola reversión por pago · obligación del F-23112026 cancelada.
