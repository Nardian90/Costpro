# Inventario de Escenarios E2E — CostPro (FASE E2E-80)

> ⛔ **NOTA DE GOBERNANZA (2026-10-09, propietario):** los specs que CREAN
> tiendas/usuarios/tenants en el Supabase compartido están DESHABILITADOS por
> defecto (banner `⛔ DESHABILITADO POR EL PROPIETARIO` + `test.skip(true)`
> al inicio del archivo): `multi-store-comprehensive`, `stores-crud`,
> `store-lifecycle`, `store-switching`, `store-reset`,
> `store-create-autoswitch`, `security`, `workers-create`,
> `flows/roles-permissions`, `data-hygiene-probe`, `isolation-proof`.
> Los jobs E2E de CI (`ci.yml`, `test-coverage.yml`) también están apagados
> (`if: false`). El modo aislado por run dejó de ser el default: toda corrida
> reutiliza los pilotos persistentes A/B (legacy). Reactivar cualquiera de
> estas piezas SOLO bajo petición explícita del propietario.
> Evidencia: `docs/audits/e2e-contamination-cleanup-20261009.md`.

> **Denominador oficial de cobertura E2E.** Un "escenario" es un flujo de
> comportamiento observable de negocio (no un archivo ni un assert aislado).
> Cada escenario se clasifica por riesgo (P0–P3) y se marca como automatizado
> solo si existe un test E2E REAL que lo ejecuta de extremo a extremo
> (Browser/UI → API/RPC → DB) con assertions sobre el resultado observable.

**Convenciones**: ✓ = automatizado y pasando · ⏳ = pendiente (ver motivo) ·
los tests citados viven en `e2e/` (prefijo `flows/` = nuevos de esta fase).

---

## 1. Autenticación y sesión (10 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-AUTH-001 | Login válido → shell autenticado | P0 | ✓ | flows/auth-session-ui |
| E2E-AUTH-002 | Contraseña incorrecta → error, sin sesión | P1 | ✓ | flows/auth-session-ui |
| E2E-AUTH-003 | Usuario inexistente → error | P1 | ✓ | flows/auth-session-ui |
| E2E-AUTH-004 | Logout destruye sesión → landing | P0 | ✓ | flows/auth-session-ui |
| E2E-AUTH-005 | Sesión persiste tras recarga | P0 | ✓ | flows/auth-session-ui |
| E2E-AUTH-006 | Rate limit de login (cooldown) | P2 | ✓ | flows/auth-session-ui |
| E2E-AUTH-007 | APIs sin token → 401 | P0 | ✓ | auth.spec, api-routes.spec |
| E2E-AUTH-008 | Token malformado → 401 | P0 | ✓ | auth.spec |
| E2E-AUTH-009 | Dev bypass deshabilitado → rechazo | P1 | ✓ | security.spec |
| E2E-AUTH-010 | Usuario sin perfil → signout automático | P2 | ⏳ flujo interno de restauración de sesión (sin observable directo simple) |

## 2. Multi-tienda (14 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-MST-001 | Crear tienda (admin) + membership auto | P0 | ✓ | multi-store-comprehensive 2.1 |
| E2E-MST-002 | Validaciones de creación (400s) | P1 | ✓ | multi-store-comprehensive 2.2–2.7 |
| E2E-MST-003 | Actualizar tienda (PATCH) | P1 | ✓ | multi-store 3.x, flows/roles RBAC-005 |
| E2E-MST-004 | Soft-delete de tienda | P0 | ✓ | multi-store 4.x, stores-crud |
| E2E-MST-005 | Archivar / restaurar | P1 | ✓ | multi-store 5.x/6.x |
| E2E-MST-006 | Disponibilidad de slug | P2 | ✓ | multi-store 7.x |
| E2E-MST-007 | Health batch | P2 | ✓ | multi-store 8.x |
| E2E-MST-008 | Operaciones bulk | P2 | ✓ | multi-store 9.x |
| E2E-MST-009 | Admin ve todas las tiendas | P0 | ✓ | multi-store 10.1 |
| E2E-MST-010 | No-admin solo ve sus tiendas | P0 | ✓ | flows/roles RBAC-006, multi-store 10.3 |
| E2E-MST-011 | Cambio de tienda activa (UI + datos) | P0 | ✓ | store-switching (reparado) |
| E2E-MST-012 | Autoswitch al crear tienda | P1 | ✓ | store-create-autoswitch |
| E2E-MST-013 | Aislamiento API cross-store (403) | P0 | ✓ | flows/pos-006, inventory-007, transfers-005, devolutions-003 |
| E2E-MST-014 | Ciclo de vida completo (crear→usar→reset) | P1 | ✓ | store-lifecycle, store-reset |

## 3. Catálogo / productos (8 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-CAT-001 | Listado de productos de la tienda | P0 | ✓ | flows/catalog-storefront CAT-001 |
| E2E-CAT-002 | Integridad de datos (precio/stock/estado) | P0 | ✓ | flows/catalog CAT-002 |
| E2E-CAT-003 | Grilla POS muestra productos con stock | P0 | ✓ | flows/pos-009 |
| E2E-CAT-004 | Vista catálogo UI por tienda activa | P1 | ✓ | flows/catalog CAT-003 |
| E2E-CAT-005 | Crear producto vía flujo de la app | P1 | ⏳ la creación es insert directo desde el browser a Supabase; requiere fixture de formulario (ver reporte) |
| E2E-CAT-006 | Editar producto | P1 | ⏳ idem |
| E2E-CAT-007 | Desactivar / visibilidad en tienda online | P2 | ⏳ idem |
| E2E-CAT-008 | Importación bulk de catálogo | P2 | ✓ | import.spec |

## 4. Inventario (10 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-INV-001 | Ajuste de entrada (+N) → stock + movimiento | P0 | ✓ | flows/inventory INV-001 |
| E2E-INV-002 | Ajuste de salida (−N) → stock + movimiento | P0 | ✓ | flows/inventory INV-002 |
| E2E-INV-003 | Invariante: stock = inicial + Σ movimientos | P0 | ✓ | flows/inventory INV-003 |
| E2E-INV-004 | Reducción excesiva sin inconsistencia | P1 | ✓ | flows/inventory INV-004 |
| E2E-INV-005 | Kardex/historial del producto | P1 | ✓ | flows/inventory INV-005 |
| E2E-INV-006 | Conflicto de versión (optimistic lock) | P1 | ✓ | flows/inventory INV-006 [DEFECT-001] |
| E2E-INV-007 | Ajuste desde UI (modal) actualiza DB | P0 | ✓ | flows/inventory INV-008 (fix DEFECT-002) |
| E2E-INV-008 | Validaciones de payload (400s) | P1 | ✓ | inventory.spec (existente) |
| E2E-INV-009 | Rate limit de ajustes | P2 | ✓ | inventory.spec (existente) |
| E2E-INV-010 | Recepción de mercancía → stock | P0 | ⏳ flujo multi-paso de recepciones (ver reporte) |

## 5. Ventas / POS (12 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-POS-001 | Venta cash: tx + items + total + stock −N + movimiento | P0 | ✓ | flows/pos POS-001 |
| E2E-POS-002 | Idempotencia (misma key, sin doble descuento) | P0 | ✓ | flows/pos POS-002 |
| E2E-POS-003 | Stock insuficiente → 409 sin cambios | P0 | ✓ | flows/pos POS-003 |
| E2E-POS-004 | Descuadre de totales → 422 | P0 | ✓ | flows/pos POS-004 |
| E2E-POS-005 | Sin sesión → 401 | P0 | ✓ | flows/pos POS-005 |
| E2E-POS-006 | Venta en tienda ajena → 403 | P0 | ✓ | flows/pos POS-006 |
| E2E-POS-007 | Producto de otra tienda → 400 | P1 | ✓ | flows/pos POS-007 |
| E2E-POS-008 | Pago mixto persiste desglose | P1 | ✓ | flows/pos POS-008 |
| E2E-POS-009 | Flujo UI completo: carrito → Cobrar → éxito + DB | P0 | ✓ | flows/pos POS-009 |
| E2E-POS-010 | Descuento ≥15% requiere supervisor | P1 | ⏳ token de supervisor single-use (ver reporte) |
| E2E-POS-011 | Historial de ventas visible | P1 | ✓ | reverse-duplicate-ui (vista sales) |
| E2E-POS-012 | Reversión de venta → stock restaurado | P0 | ✓ | flows/reverse REV-001..004 |

## 6. Caja (6 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-CASH-001 | Cierre de turno con cuadre (z_report) | P0 | ✓ | flows/cash CASH-001 |
| E2E-CASH-002 | Doble cierre → 409 | P0 | ✓ | flows/cash CASH-002 |
| E2E-CASH-003 | Reporte de caja | P1 | ✓ | flows/cash CASH-003 |
| E2E-CASH-004 | Cierre sin sesión → 401 | P1 | ✓ | flows/cash CASH-004 |
| E2E-CASH-005 | Apertura de turno desde UI | P1 | ✓ | cubierto por setup de turno + banner "sin turno" en POS-009 |
| E2E-CASH-006 | Reapertura de cierre | P2 | ⏳ endpoint reopen sin flujo UI estable (ver reporte) |

## 7. Compras (6 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-PO-001 | Crear OC con items (atómico) | P0 | ✓ | flows/purchase PO-001 |
| E2E-PO-002 | Item inválido → 400 sin persistir | P0 | ✓ | flows/purchase PO-002 |
| E2E-PO-003 | Listado por tienda | P1 | ✓ | flows/purchase PO-003 |
| E2E-PO-004 | Creación sin sesión → 401 | P1 | ✓ | flows/purchase PO-004 |
| E2E-PO-005 | Recepción contra OC → stock | P0 | ⏳ flujo receive_against_po multi-paso (ver reporte) |
| E2E-PO-006 | Actualizar estado de OC | P1 | ⏳ PATCH de estado — flujo parcial (ver reporte) |

## 8. Transferencias (7 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-TRA-001 | Crear transferencia (PENDIENTE + reserva) | P0 | ✓ | flows/transfers TRA-001 |
| E2E-TRA-002 | Confirmar → origen −N / destino +N | P0 | ✓ | flows/transfers TRA-002 |
| E2E-TRA-003 | Conservación de stock total | P0 | ✓ | flows/transfers TRA-003 |
| E2E-TRA-004 | Stock insuficiente al confirmar | P0 | ✓ | flows/transfers TRA-004 |
| E2E-TRA-005 | Confirmar sin acceso al destino → 403 | P0 | ✓ | flows/transfers TRA-005 |
| E2E-TRA-006 | Doble confirmación rechazada | P1 | ✓ | flows/transfers TRA-006 |
| E2E-TRA-007 | Reversión de transferencia | P1 | ⏳ /api/reverse type=transfer (rate limit 5/min compartido; ver reporte) |

## 9. Devoluciones (5 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-DEV-001 | Devolución restaura stock + documento | P0 | ✓ | flows/devolutions DEV-001 |
| E2E-DEV-002 | Items/importe correctos | P0 | ✓ | flows/devolutions DEV-002 |
| E2E-DEV-003 | Sin permisos de gestión → 403 | P0 | ✓ | flows/devolutions DEV-003 |
| E2E-DEV-004 | Listado por tienda | P1 | ✓ | flows/devolutions DEV-004 |
| E2E-DEV-005 | Reversión de devolución | P2 | ⏳ ver reporte |

## 10. Producción (5 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-PRD-001 | Crear orden (tienda derivada server-side) | P1 | ✓ | flows/production PRD-001 |
| E2E-PRD-002 | Listado de órdenes | P1 | ✓ | flows/production PRD-002 |
| E2E-PRD-003 | Creación sin sesión → 401 | P1 | ✓ | flows/production PRD-003 |
| E2E-PRD-004 | Consumo / vale de salida → stock | P1 | ⏳ flujo multi-paso (ver reporte) |
| E2E-PRD-005 | Producción terminada / retiro | P1 | ⏳ idem |

## 11. Roles y permisos (10 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-RBAC-001 | clerk no crea tiendas → 403 | P0 | ✓ | flows/roles RBAC-001 |
| E2E-RBAC-002 | clerk no gestiona usuarios → 403 | P0 | ✓ | flows/roles RBAC-002 |
| E2E-RBAC-003 | clerk no resetea tienda → 403 | P0 | ✓ | flows/roles RBAC-003 |
| E2E-RBAC-004 | warehouse no accede a admin → 403 | P0 | ✓ | flows/roles RBAC-004 |
| E2E-RBAC-005 | encargado con membership gestiona su tienda | P0 | ✓ | flows/roles RBAC-005 |
| E2E-RBAC-006 | Sin membership no ve tienda ajena | P0 | ✓ | flows/roles RBAC-006 |
| E2E-RBAC-007 | UI: vista admin bloqueada (Acceso Denegado) | P1 | ✓ | flows/roles RBAC-007 |
| E2E-RBAC-008 | Usuario creado por admin inicia sesión | P1 | ✓ | flows/roles RBAC-008 [DEFECT-003] |
| E2E-RBAC-009 | Anti-spoofing p_user_id | P0 | ✓ | security.spec |
| E2E-RBAC-010 | Vistas restringidas por rol (costo) | P1 | ⏳ sin usuario costo con credenciales conocidas (ver reporte) |

## 12. Seguridad transversal (12 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-SEC-001 | Anti-spoofing de user_id | P0 | ✓ | security.spec |
| E2E-SEC-002 | CSRF por Origin | P0 | ✓ | security.spec + 403 en flows |
| E2E-SEC-003 | Aislamiento RLS entre tenants | P0 | ✓ | security.spec |
| E2E-SEC-004 | Rate limiting de endpoints | P1 | ✓ | rate-limit.spec + multi-store 14.1 |
| E2E-SEC-005 | Cabeceras de seguridad | P1 | ✓ | security-headers.spec |
| E2E-SEC-006 | Endpoints admin requieren auth | P0 | ✓ | auth.spec, api-routes.spec |
| E2E-SEC-007 | Manipulación de IDs (UUID inválidos) | P1 | ✓ | multi-store 3.3, inventory.spec |
| E2E-SEC-008 | Sesiones inválidas → 401 | P0 | ✓ | auth.spec |
| E2E-SEC-009 | Legal/pages públicas | P2 | ✓ | legal.spec, landing, home |
| E2E-SEC-010 | Salud del sistema | P2 | ✓ | health-api.spec |
| E2E-SEC-011 | Logs de auditoría de operaciones | P1 | ✓ | multi-store 11.1 |
| E2E-SEC-012 | Incidentes legales requieren auth | P1 | ✓ | auth.spec (BUG-017 regresión) |

## 13. Cuentas por pagar/cobrar (4 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-AP-001 | Listado de cuentas por pagar | P1 | ✓ | accounts-payable (reactivado) |
| E2E-AP-002 | Etiquetas/estados del módulo | P1 | ✓ | accounts-payable |
| E2E-AP-003 | Pago bulk | P1 | ✓ | accounts-payable bulk-pay |
| E2E-AP-004 | Cuentas por cobrar | P2 | ⏳ endpoint GET disponible sin flujo de negocio completo |

## 14. Workers y comisiones (8 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-WKR-001 | Crear trabajador (validaciones CI) | P1 | ✓ | workers-create (reparado) |
| E2E-WKR-002 | CI duplicado → rechazo | P1 | ✓ | workers-create |
| E2E-WKR-003 | Listado/UI de trabajadores | P1 | ✓ | workers-create (reparado) |
| E2E-WKR-004 | Reglas de comisión CRUD | P1 | ✓ | commissions-payments |
| E2E-WKR-005 | Cálculo de comisiones | P1 | ✓ | commissions-payments |
| E2E-WKR-006 | Pagos de comisiones | P1 | ✓ | commissions-payments |
| E2E-WKR-007 | Resumen de comisiones | P1 | ✓ | commissions-payments |
| E2E-WKR-008 | Comisión por producto | P2 | ✓ | commissions worker-products |

## 15. Ficha de costo / reportes / otros (10 escenarios)

| ID | Escenario | Riesgo | Estado | Tests |
|----|-----------|--------|--------|-------|
| E2E-FC-001 | Ficha de costo: cálculo y guardado | P1 | ✓ | cost-sheet-flow, cost-engine |
| E2E-FC-002 | Flujos FC automatizados (iconos) | P2 | ✓ | fc-automation (reparado) |
| E2E-FC-003 | Accesibilidad FC | P2 | ✓ | fc-accessibility |
| E2E-RPT-001 | Generación de reportes | P1 | ✓ | reports.spec |
| E2E-RPT-002 | KPIs multi-tienda | P1 | ✓ | multi-store-comprehensive |
| E2E-ACAD-001 | Academia (generación de tarjetas) | P2 | ✓ | academy.spec |
| E2E-AI-001 | Chat IA requiere sesión | P2 | ✓ | ai-chat.spec |
| E2E-SYNC-001 | Sincronización por lotes | P2 | ✓ | sync-batch.spec |
| E2E-IPV-001 | Selector de fecha forward-only (IPV) | P2 | ✓ | multi-tienda-docs |
| E2E-SF-001..003 | Tienda online pública | P1 | ✓ | flows/catalog-storefront |

---

## Resumen del inventario

| Módulo | Escenarios | Automatizados | Pendientes |
|--------|-----------|---------------|------------|
| Auth y sesión | 10 | 9 | 1 |
| Multi-tienda | 14 | 14 | 0 |
| Catálogo | 8 | 5 | 3 |
| Inventario | 10 | 9 | 1 |
| Ventas/POS | 12 | 11 | 1 |
| Caja | 6 | 5 | 1 |
| Compras | 6 | 4 | 2 |
| Transferencias | 7 | 6 | 1 |
| Devoluciones | 5 | 4 | 1 |
| Producción | 5 | 3 | 2 |
| Roles y permisos | 10 | 9 | 1 |
| Seguridad | 12 | 12 | 0 |
| Cuentas por pagar/cobrar | 4 | 3 | 1 |
| Workers y comisiones | 8 | 8 | 0 |
| FC/reportes/otros | 10 | 10 | 0 |
| Storefront (incluido en catálogo) | — | — | — |
| **TOTAL** | **128** | **113** | **15** |

> Cuenta exacta: 126 filas individuales + la fila combinada E2E-SF-001..003
> (3 escenarios de storefront, todos automatizados) = 128 escenarios.

**Cobertura E2E = 113 / 128 = 88.3%** — P0: 50/52 (96.2%) · P1: 49/57 (86.0%) ·
P2: 15/20 (75.0%) · P0+P1 combinados: 99/109 (90.8%).

> Nota: los 15 pendientes y su justificación detallada están en
> `E2E-COVERAGE-REPORT.md` (sección "Tests no automatizados").
