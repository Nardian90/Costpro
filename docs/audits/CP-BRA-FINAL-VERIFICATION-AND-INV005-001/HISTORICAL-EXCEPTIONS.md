# HISTORICAL-EXCEPTIONS — Excepciones históricas documentadas

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Método:** verificación read-only directa en producción (`scripts/cpbra-historical-exceptions.mjs`, re-ejecutable) + cruzado con los expedientes CP-AP-FORENSIC-RECONCILIATION-001 (§6) y CP-BRA-REMEDIATION-001 (INFORME §5.4). **Ningún dato fue modificado ni asignado por conveniencia** (misión §8: «No asignes proveedores por conveniencia»).

---

## 1. Las 3 recepciones sin proveedor (valor $19,435.00 — verificado exacto)

La misión previa las reportó agrupadas bajo la clave literal **`supplier='—'`** (em-dash, no NULL). Verificación directa hoy:

| # | ID | reference_doc | Fecha recepción | Total | Ítems (cantidad × costo unitario) | Estado | Pagos |
|---|---|---|---|---|---|---|---|
| 1 | `0b026405…` | `—` | 2026-10-12 | **$19,200.00** | Cemento blanco 5kg ×4 @ $4,800 | active, unpaid | 0 |
| 2 | `79ffb3a9…` | `0000` | 2026-10-19 | **$35.00** | Cemento Cola ×35 @ $1 | active, unpaid | 0 |
| 3 | `e564adca…` | `0002` | 2026-10-22 | **$200.00** | Canaleta gris 60x35 ×100 @ $1 + Expansiones anaranjada 6*40mm/Rapita ×100 @ $1 | active, unpaid | 0 |

**Total verificado: 19,200 + 35 + 200 = $19,435.00 — coincide exactamente con lo informado.**
Todas de la tienda **ENERVIDA-VITALLCONS**; sin NIT (`supplier_tax_id=null`), sin teléfono, sin `supplier_code`, sin notas; `document_number` null en las tres; ninguna recepción rectificativa/devolución vinculada (`original_receipt_id` sin hijos).

### Inventario afectado (verificado vía `stock_movements`)

- Cemento blanco 5kg: **purchase +4** el 10-12 («Recepción de mercancía») ✓ — el mismo día existe además un Vale de Salida VS-000169 −4 (misma cantidad: a documentar, ver §3).
- Cemento Cola: **purchase +35** el 10-19 16:00, con el **ID de la recepción en `notes` del movimiento** ✓ trazabilidad inversa confirmada.
- Canaleta gris: **purchase +100** el 10-22 ✓ · Expansiones: **purchase +100** el 10-22 ✓.

Las tres entradas de inventario EXISTEN y son trazables. Los costos unitarios $1 (Canaleta, Expansiones, Cemento Cola) y $4,800 (Cemento blanco) son los registrados en la recepción; el patrón «$1» coincide con el convenio usado también en la carga inicial (07-01) — calidad de datos a revisar por el propietario, no defecto del motor.

### Efectos contables (verificados)

- **0 pagos** (`payment_transactions`) y **0 fin_movements** con traza de estas recepciones — coherente con `unpaid`.
- El efecto financiero existente es **la obligación en CxP** dentro del bucket «—» del reporte Cuentas por Pagar por proveedor: $19,435.00 pendientes de pago (confirmado por la tabla de saldos del expediente CP-AP-FORENSIC §3).

### Posibles duplicados

- Ningún par de recepciones sin proveedor con mismo `total_cost` y fechas cercanas (query de duplicados: 0 resultados).
- Los 3 `reference_doc` son distintos (`—`, `0000`, `0002`); `0000` y `0002` sugieren numeración de origen externo (facturas/comandas del proveedor real) — la identidad externa NO está en el sistema.

## 2. Clasificación (identificadas / verificadas / requieren documentación externa)

| Operación | Identificada | Verificada en sistema | Requiere documentación externa |
|---|---|---|---|
| 3 recepciones «—» ($19,435) | ✅ (ID, fechas, importes) | ✅ (estado, inventario, 0 pagos, obligación CxP) | ✅ **sí** — identidad del proveedor real, factura/contrato de origen; sin NIT/contacto el sistema no puede deducirla |
| Venta `1df5d727…` total=0 con 12.000 CUP cobrados (R-11) | ✅ | ✅ (incidencia `overpayment` trazada, notas documentadas) | ✅ — decisión de negocio: qué hacer con el descuadre de precio en catálogo en el momento de la venta (el precio ACTUAL del ítem «Cajita Breckera sencilla gris» es 12.000, igual al cobrado) |
| Venta `28e94349…` pendiente real de 8.100 CUP (R-11) | ✅ | ✅ (3 incidencias coherentes: `mixed_breakdown_mismatch`, `insufficient_payment`, `rate_difference`) | ✅ — decisión de negocio: cobrar el pendiente, anular, o aceptar la pérdida (la puerta MISIÓN-FLEX está abierta por decisión del propietario) |
| Venta `8ab7becf…` sobrepago +200 CUP (R-11) | ✅ | ✅ (incidencia válida y trazada) | opcional — definir destino del sobrepago (crédito/devolución) |

## 3. Otras excepciones similares registradas (barrido)

- **Servicios recibidos sin proveedor real:** 0 (el único caso histórico, SRV-20261026-00087 «TiendaPueblo» $400, fue saneado por la migración gobernada `20261126120100` de CP-AP-ACCOUNTING-INTEGRITY con auditoría `SR_SUPPLIER_NORMALIZED` — verificado en el SQL versionado y en el expediente).
- **Recepciones `supplier IS NULL`:** 0 — el placeholder «—» es el único patrón.
- **Cierres fiscales:** 0 (R-14 sin exposición actual).
- **Proveedores/clientes duplicados por nombre normalizado:** 0 (R-15 limpio).
- **Quirk residual documentado (no excepción abierta):** 2 pagos con `payment_date` un día antes del `created_at` del documento (consistente con fecha de negocio Habana vs medianoche UTC, módulo SR — documentado por CP-AP-FORENSIC §5; corrección pertenece a ese módulo).

## 4. Riesgo de conciliación y recomendación (sin ejecutar)

1. **Riesgo:** las obligaciones «—» ($19,435) no son conciliables contra un tercero real mientras no se identifique el proveedor; cualquier pago futuro a ellas heredaría la identidad desconocida (rompe la trazabilidad DOC→tercero que exige el estándar).
2. **Recomendación al propietario (no ejecutada por esta misión):**
   - Identificar el proveedor real con la documentación externa (referencias `0000`/`0002` parecen numeración de origen) y, si se confirma la misma entidad de las recepciones de octubre, registrar el proveedor en la tienda y **re-asignar mediante una operación gobernada y auditada** (patrón `SR_SUPPLIER_NORMALIZED`), NO con UPDATE silencioso.
   - Si la identidad no puede establecerse, conservar el bucket «—» como excepción formal con nota en el cierre (la política actual lo mantiene separado y visible — correcto).
   - Añadir a futuro un guard de creación de recepción que exija proveedor real (o marque el documento como `draft` hasta completarlo) — decisión del propietario; evitaría nuevos casos «—».
3. **No se asignó ningún proveedor en esta misión** y no se modificó ningún registro.
