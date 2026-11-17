# CP-SRV-PUERTO-PADRE-DELETE-PAID-OPERATIONS-001 — Eliminación controlada de tres servicios recibidos y reversión de sus pagos en Puerto Padre

**Fecha de ejecución:** 2026-11-17 (13:04 Habana / 18:04 UTC) · **Estado:** COMPLETADA
**Autorización:** expresamente otorgada por el propietario para los 3 documentos y exclusivamente sus pagos (misión 2026-11-18, con aclaración vinculante de restauración integral).
**Alcance:** PUERTO PADRE únicamente. Sin modificaciones en ENERVIDA-VITALLCONS ni otras tiendas. Sin cambios de código ni migraciones.

---

## 1. Verificación inicial (identidad de los documentos)

Tienda: **PUERTO PADRE** — `store_id 899d2503-d000-41d2-89f0-0827f4ac37ab`, `tenant_id 5364ccf8-e6cd-4c38-aea8-b167b3b5576f`. Los tres identificadores tienen coincidencia única en todo el sistema (consulta `service_number IN (...)` sobre `received_services` sin restricción de tienda: exactamente 3 filas, todas de esta tienda).

| Identificador | Servicio | Fecha efectiva almacenada | Importe | Moneda | Estado pre | id interno |
|---|---|---|---:|---|---|---|
| SRV-20261107-00126 | Comisión | 2026-11-07 (creado 2026-11-17 17:32 UTC, retrodatado) | 2,900.00 | CUP | active · paid | `6a9bdab2-8ad1-4cda-aa09-1cc00cffc020` |
| SRV-20261110-00116 | Custodios | 2026-11-09 (id. codifica 11-10; editado a 11-09 el 2026-11-10 por Frank, encargado) | 4,000.00 | CUP | active · paid | `804a5e3d-90bc-45d1-935c-3de55f1b35a6` |
| SRV-20261110-00115 | Comisión | 2026-11-09 (ídem) | 2,900.00 | CUP | active · paid | `e350a933-7063-4e1c-9d24-aa48ee7266e4` |
| **Total** | | | **9,800.00** | | | |

Contraste de fechas: la fecha codificada en el identificador NO siempre coincide con la efectiva (SRV-20261110-00115/00116 → efectiva 2026-11-09; SRV-20261107-00126 → efectiva 2026-11-07 con creación retrodatada el 17-11). Proveedor en los tres: «Tienda Puerto Padre» (autorreferente, consistente con registros erróneos).

## 2. A. ESTADO ANTERIOR (fotografía previa — evidencia completa en `audit-evidence/CP-SRV-PUERTO-PADRE-DELETE-PAID-OPERATIONS-001/out-pp-01-investigate.json` y `out-pp-02-actor-state.json`)

### 2.1 Pagos vinculados (uno por documento; sin pagos parciales ni adicionales)

| Pago (id) | Servicio | Importe | Método | Moneda | payment_date | direction | Creado |
|---|---|---:|---|---|---|---|---|
| `5360fdd0-6746-4d6f-9ef3-bccb9484a0f5` | SRV-20261107-00126 | 2,900.00 | cash | CUP | 2026-11-07 17:00 UTC | in | 2026-11-17 17:32:26 UTC |
| `7c008277-c39b-471b-b015-b4387cfb4e2b` | SRV-20261110-00116 | 4,000.00 | cash | CUP | 2026-11-09 17:00 UTC | in | 2026-11-10 11:07:15 UTC |
| `2fa12d54-5ed0-479c-8017-40f3d46320ce` | SRV-20261110-00115 | 2,900.00 | cash | CUP | 2026-11-09 17:00 UTC | in | 2026-11-10 11:06:55 UTC |

### 2.2 Determinación de desembolso real

- `transaction_id = NULL` en los 3 pagos (sin vínculo con ventas).
- Cero `cash_flow_documents` por `payment_transaction_id` y por `related_document_id` (sin comprobante de egreso documentado).
- Método `cash`, sin integración bancaria; los propios registros de pago eran la única «evidencia» de salida de dinero.
- Conclusión: **pagos nunca desembolsados realmente — registros introducidos por error en COSTPRO**, conforme al criterio de la aclaración vinculante §1. Tratamiento aplicado: retirada integral de sus efectos.

### 2.3 Dependencias y libro contable (pre)

- `service_reception_links`, `service_cost_distributions`, `service_production_order_links`: **0 filas** por servicio (sin vínculos operativos; ninguna distribución de costo a productos).
- Libro partida doble (`fin_entries`/`fin_movements`): solo SRV-20261107-00126 tenía asientos (creado tras el despliegue del motor 2026-11-13):
  - `e14fdced` reconocimiento `posted` — GAS_SERVICIOS débito 2,900 / PAS_SERV_PEND crédito 2,900
  - `995e4198` pago `posted` — ACT_EFECTIVO_CUP crédito 2,900 / PAS_SERV_PEND débito 2,900
  - Los otros dos servicios (creados 2026-11-10) no tenían asientos (anteriores al motor).
- Auditoría pre preservada: `SERVICE_CREATED` ×3, `SUPPLIER_PAYMENT_REGISTERED` ×3, `PAYMENT_TRANSACTION_UPDATED` ×2 (ediciones de fecha), `service_audit_log` ×5.

### 2.4 Saldos del libro de Puerto Padre (neto por categoría, PRE)

| Categoría | PRE (CUP) |
|---|---:|
| ACT_BANCOS | 20,000.00 |
| ACT_EFECTIVO_CUP | 1,100.00 |
| ACT_INVENTARIO | 5,318.50 |
| GAS_COSTO_VENTAS | 20.00 |
| **GAS_SERVICIOS** | **2,900.00** ← efecto de SRV-00126 |
| ING_VENTAS | −24,000.00 |
| PAS_CXP_PROV | −5,338.50 |
| PAS_SERV_PEND | 0.00 |

## 3. B. EJECUCIÓN (procedimientos canónicos desplegados, verificados en LIVE antes de escribir)

Hallazgo previo determinante: el borrado de `payment_transactions` está **prohibido por diseño** desde 2026-10-24 (`validate_payment_transactions_invariants` → `ERR_PAYMENT_DELETE_FORBIDDEN` PT007; verificado con `pg_get_functiondef` en LIVE). La vía segura **ya implementada y documentada por el propio sistema** (migración `20261026150000_payment_tx_integrity.sql`, patrón CP-ORG-001 §8.2) es **archivar la fila con motivo en `payment_transactions_purga_20261026_archive` y purgar vía `app.restore_mode='true'` ejecutando como postgres** (canal Management API `/database/query`, `current_user=postgres` verificado). La anulación de servicios se ejecutó con el RPC transaccional canónico y el retiro físico del documento erróneo se hizo respetando integridad (sin triggers DELETE en la tabla; dependencias CASCADE; auditoría sin FK → preservada).

Orden por documento (efectos financieros primero): **archivo+purga del pago → anulación RPC → retiro físico del documento.** Actor: `a1111111-1111-1111-1111-111111111111` (superadmin, creador de los documentos, acceso verificado vía `has_store_access_as`).

| Documento | Pago archivado+purgado | Anulación (RPC `void_received_service_with_reversal`) | Retiro físico | Resultado |
|---|---|---|---|---|
| SRV-20261107-00126 | `5360fdd0` (2,900) 18:04:15 UTC | OK 18:04:17 UTC → `SERVICE_VOIDED` en `audit_logs` | OK | retirado |
| SRV-20261110-00116 | `7c008277` (4,000) 18:04:20 UTC | OK 18:04:21 UTC → `SERVICE_VOIDED` | OK | retirado |
| SRV-20261110-00115 | `2fa12d54` (2,900) 18:04:24 UTC | OK 18:04:26 UTC → `SERVICE_VOIDED` | OK | retirado |

- Importes revertidos/retirados: **2,900 + 4,000 + 2,900 = 9,800.00 CUP** (exactamente los pagos vinculados; no existían otros).
- Guardas fail-closed ejecutadas antes de cada escritura (identidad, tienda, moneda, importe, fecha efectiva, dirección del pago, dependencias, libro previo, canal postgres). Dos intentos previos abortados por error transitorio de red (gateway reset) **sin producir ninguna mutación** (verificado read-only antes de reintentar).
- Motivo registrado: «CP-SRV-PUERTO-PADRE-DELETE-PAID-OPERATIONS-001: retiro autorizado por el propietario (servicio y pagos registrados por error; restauracion del estado anterior).»

## 4. C. ESTADO POSTERIOR (conciliación independiente — `out-pp-09-postconcilia.json`)

1. **Servicios:** 0 filas por id y 0 por `service_number` en todo el sistema. Los documentos ya no aparecen en Servicios Recibidos (ni activos ni anulados): estado equivalente a su inexistencia.
2. **Pagos:** 0 vivos por id y por `ref_type='service'` de los 3 documentos; 0 pagos de servicio vivos en toda la tienda. Los 3 en el archivo con motivo de misión (total archivo **exactamente 9,800.00 CUP**).
3. **Libro contable:** asientos originales `e14fdced`/`995e4198` → `reversed`; **2 asientos de `anulacion` `posted`** con `reversal_of` enlazado (patrón del sistema: histórico intacto + contra-asiento). 8 movimientos fin (4 originales + 4 compensatorios). Sin duplicados.
4. **Saldos restaurados** (neto por categoría, POST — solo cambian las dos categorías con efecto de la operación):

| Categoría | PRE | POST | Δ esperado |
|---|---:|---:|---:|
| ACT_BANCOS | 20,000.00 | 20,000.00 | 0 ✓ |
| ACT_EFECTIVO_CUP | 1,100.00 | **4,000.00** | +2,900 (pago purgado) ✓ |
| ACT_INVENTARIO | 5,318.50 | 5,318.50 | 0 ✓ |
| GAS_COSTO_VENTAS | 20.00 | 20.00 | 0 ✓ |
| **GAS_SERVICIOS** | **2,900.00** | **0.00** | −2,900 (gasto retirado) ✓ |
| ING_VENTAS | −24,000.00 | −24,000.00 | 0 ✓ |
| PAS_CXP_PROV | −5,338.50 | −5,338.50 | 0 ✓ |
| PAS_SERV_PEND | 0.00 | 0.00 | 0 ✓ |

5. **Integridad del perímetro:** los 15 borradores de Comisión de Puerto Padre comparados campo a campo contra el snapshot pre — **0 divergencias**; las 2 ventas y sus 2 pagos del 17-11 (ref_type=`sale`, 20,000 + 4,000 CUP) intactos; 18 servicios activos de otras tiendas sin cambios; ningún `cash_flow_document`, producto, recepción, costo o stock modificado.
6. **Auditoría preservada:** `audit_logs` conserva `SERVICE_CREATED` ×3, `SUPPLIER_PAYMENT_REGISTERED` ×3, `PAYMENT_TRANSACTION_UPDATED` ×2 y los nuevos `SERVICE_VOIDED` ×3 con el motivo; `service_audit_log` conserva sus 5 filas; el libro fin conserva la evidencia histórica con anulaciones enlazadas; la tabla de archivo conserva copia íntegra de los 3 pagos con motivo. Trazabilidad restringida completa de lo ocurrido.
7. **Informes:** con 0 pagos de servicio vivos en Puerto Padre, los informes de caja/servicios y el libro dejan de considerar los tres pagos como operaciones vigentes.

## 5. Criterio de cierre — verificación

| # | Criterio | Resultado |
|---|---|---|
| 1 | Los tres identificadores corresponden a Puerto Padre | ✓ coincidencia única, store/tenant verificados |
| 2 | Las tres operaciones fueron retiradas correctamente | ✓ 0 filas en todo el sistema |
| 3 | Sus pagos dejaron de estar vigentes | ✓ 0 vivos; 3 archivados con motivo |
| 4 | Las cuentas financieras reflejan las reversiones | ✓ tabla de saldos §4.4 |
| 5 | No existen reversiones ni movimientos duplicados | ✓ 2 anulaciones enlazadas, 8 movimientos, archivo 1:1 |
| 6 | No quedan relaciones financieras huérfanas | ✓ sin cash_flow, sin vínculos, sin pagos huérfanos |
| 7 | Las demás operaciones y tiendas permanecen intactas | ✓ 0 divergencias en perímetro |
| 8 | La auditoría conserva la trazabilidad | ✓ audit_logs + service_audit_log + fin + archivo |
| 9 | La conciliación final está documentada | ✓ 9,800.00 CUP cuadrado en §2/§3/§4 |

**CP-SRV-PUERTO-PADRE-DELETE-PAID-OPERATIONS-001 — COMPLETADA**

*Nota de fechas: la sesión corre con reloj UTC+8 (2026-11-18); la fecha efectiva de ejecución en Habana es 2026-11-17 (13:04). El texto de `archive_reason` de los pagos menciona 2026-11-18 por el reloj de sesión — se documenta aquí la correspondencia exacta.*
