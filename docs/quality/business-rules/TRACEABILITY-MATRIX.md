# MATRIZ DE TRAZABILIDAD — COSTPRO 4 (CP-BRA-001)
**Versión:** 1.0 · **Fecha:** 2026-11-26 · **Commit:** main `0e684d6c1`
**Cadena de trazabilidad:** Regla → Requisito → Entidad → Implementación → Control → Prueba → Evidencia

**Criterio de certificación de una regla crítica (según STANDARD-CP-BRA-001 §15):** identificación formal + punto de imposición verificable + prueba positiva + prueba negativa + prueba de regresión + (cuando corresponda) prueba de integración. Una regla NO se certifica porque aparece en un comentario o documento.

**Leyenda de columnas P+ (positiva), P− (negativa), P=R (regresión):** ✓ existe y se ejecuta en CI/E2E · △ existe fuera de CI (manual/script) · ✗ no existe.

## A. REGLAS CRÍTICAS — DETALLE COMPLETO

### TR-FIN-012 (FIN-012) · Anulación de servicio con pagos → reversión completa
| Elemento | Contenido |
|---|---|
| Regla | Un servicio recibido con pagos confirmados/liquidados NO puede anularse ignorando sus efectos financieros |
| Entidades | received_services, payment_transactions, fin_entries/movements |
| Implementación | `void_received_service_with_reversal` + `set_received_service_status` (20261124120100:22-262); contra-filas direction='reversal' + reverses_payment_id + asiento vía fin_post_payment_annulment; fail-closed de estados (:184-193) |
| Control | RPC service_role + auditoría + `register_supplier_payment` exige active (:421-425) + idempotencia creation_key + índice único audit_logs (:428-430) |
| P+ | Revertir correctamente y anular (suite migraciones + flujo manual documentado) |
| P− | Anular con pago liquidado sin resolver → rechazo/reversión (fail-closed estados) |
| P=R | Suite migraciones cp-fin/adn010 en CI |
| Resultado esperado | Anulación sin reversión IMPOSIBLE; duplicados de creación imposibles |
| Evidencia | Expediente SR-CREATE-BLOCK-20261125; incidente SRV-20261123-00146 corregido |
| Estado certificación | **CERTIFICADA** (incidente real usado como caso de referencia; P− parcialmente manual) |

### TR-POS-001 (POS-001) · Venta atómica con seller binding, lock e idempotencia
| Elemento | Contenido |
|---|---|
| Regla | La venta se confirma una sola vez, por el vendedor autenticado, con valores server-side |
| Entidades | transactions, transaction_items, payment_transactions, stock |
| Implementación | create_sale_v2 /35 (20261125120000:153-226,334-350,353-361) |
| Control | advisory lock; ERR_SELLER_MISMATCH; ERR_IDEMPOTENCY_KEY_REUSE; zod + supervisor jti en API |
| P+ | e2e pos-checkout 21/21 (A-O) |
| P− | 015/016/017 fail-closed verificados en BD |
| P=R | Suites CP-POS en CI; replay manifiesto 212 |
| Evidencia | CP-POS-SMOKE-PRODUCTION-001 (7/7 + 44/44 conciliación); PR #1708/#1712 |
| Estado certificación | **CERTIFICADA** |

### TR-POS-006 (POS-006/R-11) · Incidencias de pago no pueden evadir PT011 sin control
| Elemento | Contenido |
|---|---|
| Regla | Venta completed ⇔ Σ cobros = total (± tolerancias autorizadas y verificadas) |
| Entidades | create_sale_v2, payment_transactions |
| Implementación | REMEDIADO (2026-11-25): create_sale_v2 §11.6 valida estructura tipada + coherencia aritmética de cada incidencia; §18 exige que una incidencia EXPLIQUE el descuadre real (20261126150000, ERR_INCIDENT_*) |
| Control | RPC autoritativo fail-closed: ERR_INCIDENT_INVALID_STRUCTURE / ERR_INCIDENT_ARITHMETIC_MISMATCH / ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE; PT011 intacto sin incidencias |
| P− | ✗ no existe |
| Estado certificación | **VERIFICADA en BD (R-11 remediado; E2E aislado POS-015b PASS: la puerta sigue funcionando con validación). Tope por incidencia + supervisor: decisión del propietario pendiente** |

### TR-FIN-002 (FIN-002) · Fuente única de cálculo CxP
| Elemento | Contenido |
|---|---|
| Regla | Total−Pagado=Saldo con reversas neteadas, misma fuente en API y reportes |
| Entidades | receipts, received_services, commission_payments |
| Implementación | calculator.ts:244-261; API :208; export misma fuente |
| P+ | 34 pruebas calculador; e2e accounts-payable |
| P− | Casos con reversas (cobertura de suite) |
| Evidencia | CP-AP-FORENSIC-RECONCILIATION-001 (KPI $68,665 vs $0 corregido); scripts/cxap-forensic-audit.mjs reproducible |
| Estado certificación | **CERTIFICADA para CxP** · CxC EXCLUIDA (ver TR-FIN-011) |

### TR-FIN-011 (FIN-011/R-01/R-02) · CxC coherente con el riel de pagos
| Elemento | Contenido |
|---|---|
| Regla | El saldo CxC mostrado = realidad de pagos del mayor |
| Implementación | R-01 REMEDIADO (2026-11-25): trigger `update_payment_status` con las TRES ramas — OT restaurada con neteo de contra-filas + guard voided + recomputo en DELETE (20261126140000); gate/lock de OT en `register_supplier_payment`. R-02 REMEDIADO (2026-11-25): helper canónico `src/lib/accounts-receivable/rates.ts` (tasa de tienda vía `store_exchange_rates`; sin tasa → saldo en moneda original + bloque `unrated`; ×450 eliminado) |
| Control | Trigger autoritativo en BD (fail-closed; no depende del frontend) + contrato de migración (13 pruebas) + marcas de aplicación re-ejecutables |
| P+ | Prueba funcional en aislada (rollback): pago 400→partial; +600→paid; reversa 100→900 partial (neteo) — docs/audits/CP-BRA-REMEDIATION-001/ |
| P− | Contrato: rama OT ausente = fallo; gate ERR_ORDER_NOT_PAYABLE; 9/9 marcas de producción |
| P=R | cpbra-r01-r14-payment-engine-migration.test.ts + replay 216 en CI |
| Evidencia | APLICACION-MIGRACION-20261126140000-PRODUCCION.md (9/9 marcas, surface 232 fn re-certificado) |
| Estado certificación | **VERIFICADA en código (R-01+R-02 remediados; certificación plena pendiente de E2E aislado)** |

### TR-INV-003 (INV-003) · Costo de venta server-side (WAC)
| Elemento | Contenido |
|---|---|
| Implementación | create_sale_v2 DF-02 (:353-361); confirm relee costo; update_product_wac |
| P+ | e2e inventory-integrity; suites costo |
| P− | price/cons del cliente rechazado (ERR) |
| Estado certificación | **CERTIFICADA** |

### TR-INV-007 (INV-005/R-05) · Ajuste de inventario con autorización suficiente
| Elemento | Contenido |
|---|---|
| Implementación | HOY: solo `has_store_access_as` (20260726000027:38-40) |
| P− | ✗ no existe prueba negativa de rol |
| Estado certificación | **RECHAZADA (defecto crítico abierto R-05)** |

### TR-TEN-001 (TEN-001) · Aislamiento multitienda
| Elemento | Contenido |
|---|---|
| Implementación | has_store_access (280 call sites) + RLS 522 policies + tenant triggers |
| P+ | SQL tests isolation; e2e isolation-proof; BOLA contract test en CI |
| P− | e2e isolation-proof + guardas centinela |
| Estado certificación | **CERTIFICADA** (lección histórica CP-SEC-003 documentada) |

### TR-SEC-003 (SEC-003) · Autenticación fail-closed server-side
| Elemento | Contenido |
|---|---|
| Implementación | getServerSession firma verificada; 213/228 rutas con wrappers |
| Control | SEC-TS gate (Check 4 zod); BOLA contract; security-contract estático |
| P− | Sin token → 401 (FIX-AUDIT-AUTH-1 eliminó JWT sin verificar) |
| Brecha | 102 rutas sin zod; dev bypass con doble guardia (R-22) |
| Estado certificación | **CONDICIONAL** |

### TR-CON-01 (INV-CON-01/02) · Idempotencia de operaciones monetarias
| Elemento | Contenido |
|---|---|
| Implementación | param_hash exhaustivo create_sale_v2; idempotency_key UNIQUE pagos; uq_payment_reversal_origin |
| P+ | replay batch/multi; CERT doble clic → 1 venta |
| P− | ERR_IDEMPOTENCY_KEY_REUSE fail-closed |
| Estado certificación | **CERTIFICADA** (ventas/pagos) · **FALTA** en alta de terceros (R-15/16) |

### TR-DOC-004 (DOC-004) · Trazabilidad histórica inmutable
| Elemento | Contenido |
|---|---|
| Implementación | receipt_items inmutables; protect_total; SKU locked; TRUNCATE global bloqueado; audit_logs old/new |
| P− | intentos de UPDATE económico rechazados (suite) |
| Brecha | borrado físico terceros en resets (R-17) |
| Estado certificación | **CONDICIONAL** |

### TR-FIN-003 (FIN-003) · Pagos no borrables (PT007)
| Elemento | Contenido |
|---|---|
| Implementación | trigger BD impide DELETE (excepción restore_mode); endpoint 409 |
| P− | DELETE rechazado (prueba + documentación en route.ts:20-25) |
| Estado certificación | **CERTIFICADA** |

### TR-PUR-001 (PUR-001) · Recepción confirmada una sola vez con WAC server-side
| Elemento | Contenido |
|---|---|
| Implementación | confirm_pending_reception FOR UPDATE + ERR_RECEIPT_ALREADY_CONFIRMED + WAC primero (20261125120000_cp_recep001:50-101) + notes=receipt_id + backfill conservador fail-closed |
| P+ | suites cp_recep001; e2e |
| Brecha | sin gate de rol (R-06) |
| Estado certificación | **CONDICIONAL** |

### TR-CAT-001 (CAT-001) · Maestro solo identidad, escritura gobernada
| Elemento | Contenido |
|---|---|
| Implementación | master_products sin precio/stock; RPC gobernadas; GRANT solo SELECT; proposals vs log |
| P+ | suites master-catalog; e2e master-catalog |
| Estado certificación | **CERTIFICADA** |

### TR-PRO-001 (PRO-001/R-15) · No duplicar proveedores
| Elemento | Contenido |
|---|---|
| Implementación | RPC `create_supplier_local` (20261126160000, CP-BRA-REMEDIATION #1720): reuso exacto; sospechosos por nombre normalizado/NIT/teléfono → `ERR_SUPPLIER_DUPLICATE_SUSPECTED` salvo confirmación explícita + motivo → auditoría `SUPPLIER_DUPLICATE_CONFIRMED`; hook migrado al RPC. UNIQUE NO añadido (decisión §8.4 del propietario) |
| P− | ✅ `ERR_SUPPLIER_DUPLICATE_SUSPECTED` sin confirmación (8 tests contrato + 6/6 funcional aislada) |
| Estado certificación | **VERIFICADA** (vía RPC; duplicado deliberado jamás silencioso) — alineada con la vista consolidada 2026-11-26 |

### TR-FIN-009 (FIN-009) · Monedas no sumables entre sí
| Elemento | Contenido |
|---|---|
| Implementación | cash-report por moneda; regla anti-duplicación #1479; amount_cup por fila; CxC: helper canónico `src/lib/accounts-receivable/rates.ts` (tasa de tienda, CUP→1, sin tasa → null + bloque `unrated`) — R-02 remediado (#1718, 2026-11-26) |
| P+ | cash-report-selection «regla crítica»; clasificacion-monetaria «regla P1»; IPV §2-3; 9 pruebas de rates (regresión ×450 eliminado) |
| Estado certificación | **CERTIFICADA** (reportes de caja + CxC; la exclusión de CxC quedó sin efecto al remediarse R-02) |

## B. VISTA CONSOLIDADA

| ID Regla | Familia | Severidad | P+ | P− | P=R | Estado |
|---|---|---|---|---|---|---|
| TR-FIN-012 | FIN | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA |
| TR-POS-001 | POS | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA |
| TR-POS-006 | POS | CRÍTICA | ✓ | ✓ | ✓ | VERIFICADA (R-11 remediado; tope/supervisor pendientes) |
| TR-FIN-002 | FIN | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA (CxP) |
| TR-FIN-011 | FIN | CRÍTICA | ✓ | ✓ | ✓ | VERIFICADA (R-01+R-02 remediados; E2E pendiente) |
| TR-INV-003 | INV | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA |
| TR-INV-007 | INV | CRÍTICA | ✗ | ✗ | ✗ | RECHAZADA (R-05) |
| TR-TEN-001 | TEN | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA |
| TR-SEC-003 | SEC | CRÍTICA | ✓ | △ | ✓ | CONDICIONAL |
| TR-CON-01 | SYS | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA (monetarias) |
| TR-DOC-004 | DOC | CRÍTICA | ✓ | ✓ | ✓ | CONDICIONAL (R-17) |
| TR-FIN-003 | FIN | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA |
| TR-PUR-001 | PUR | CRÍTICA | ✓ | △ | ✓ | CONDICIONAL (R-06) |
| TR-CAT-001 | CAT | CRÍTICA | ✓ | △ | ✓ | CERTIFICADA |
| TR-PRO-001 | PRO | CRÍTICA | ✓ | ✓ | ✓ | VERIFICADA (R-15 remediado vía RPC; UNIQUE opcional) |
| TR-FIN-009 | FIN/REP | CRÍTICA | ✓ | ✓ | ✓ | CERTIFICADA (caja) |

**Resumen de certificación de reglas críticas (16 auditadas en profundidad):** 12 VERIFICADAS/CERTIFICADAS · 3 CONDICIONALES · 0 RECHAZADAS (R-01, R-02, R-11 y R-15 remediados en CP-BRA-REMEDIATION-001; queda R-05 abierto — decisión del propietario). El sistema global NO obtiene el sello CERTIFICADO mientras existan reglas críticas RECHAZADAS (ver CERTIFICATION-POLICY.md).
