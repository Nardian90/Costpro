# PRUEBA PILOTO DEL ESTÁNDAR CP-BRA-001 — RESULTADOS
**Versión:** 1.0 · **Fecha:** 2026-11-26 · **Commit:** main `0e684d6c1` + rama de misión
**Objetivo:** demostrar con procesos reales que (a) el estándar habría detectado los incidentes conocidos ANTES de producción y (b) el método descubre defectos NUEVOS, no solo los conocidos.

---

## P1 · Ciclo Recepciones + Cuentas por Pagar (incidente de referencia: CP-AP-FORENSIC-RECONCILIATION-001)

**Incidente real:** KPI de CxP mostraba $68,665 mientras la tabla mostraba $0; proveedor «Tienda Pueblo» (25 docs) duplicado como «TiendaPueblo» (1 doc); 3 recepciones con `supplier='—'` ($19,435).

**Aplicación retrospectiva del estándar:**
| Paso CP-BRA-001 | ¿Habría detectado el fallo? |
|---|---|
| §1 Identificación de reglas con evidencia | La regla FIN-002 (fuente única de cálculo) exigía identificar TODAS las rutas que muestran «pagado» → el KPI era una ruta NO unificada con el calculador → visible en el inventario de writers |
| §7 Pruebas transversales al tocar writers | Cualquier PR que tocara `update_payment_status` habría tenido que listar las rutas consumidoras (CxP API, CxP export, Reporte Entrega, CxC) — la divergencia KPI/tabla emerge del propio listado |
| §11.4 Tabla de decisiones (DMN) para alta de proveedores | La tabla de decisiones «nombre normalizado ya existe → ¿permitir?» habría forzado la decisión de dedup server-side antes de producción |
| Puerta de certificación (gate v1) | El PR real #1711 (migraciones + pagos) HOY queda bloqueado hasta declarar reglas (escenario 3 verificado en FASE 9: EXIT=1) |

**Resultado: DETECTADO en 3 de 4 mecanismos.** La duplicación de proveedores habría requerido además la regla PRO-001 con prueba negativa — que hoy está catalogada como AUSENTE (R-15): el piloto confirma que la ausencia es estructural, no puntual.

## P2 · Servicios Recibidos con pagos (incidente de referencia: SRV-20261123-00146)

**Incidente real:** servicio anulado con pago liquidado; los pagos seguían restando en el Reporte Entrega; creación duplicada del mismo servicio en intentos repetidos.

**Aplicación retrospectiva:**
| Paso | ¿Habría detectado? |
|---|---|
| §STATE-MACHINES matriz de received_services | La máquina exige: toda transición a terminal (voided/cancelled) define su «operación compensatoria». La versión 20261010000002 no definía compensación de pagos → el hueco era visible en la matriz misma |
| §6 Pruebas negativas FIN (anulación con pagos vivos) | La prueba negativa obligatoria de la regla FIN-012 habría fallado: anular con pago liquidado NO producía contra-filas |
| §11 Idempotencia (alta repetida) | La regla SYS-001 exige idempotencia en toda operación con efecto; el alta sin `creation_key` habría fallado la revisión del checklist §17 |
| §13 Excepciones | El fix posterior (20261124120100) incluye exactamente los 3 controles que el estándar exige: contra-filas, idempotencia por creation_key, índice único |

**Resultado: DETECTADO en los 3 mecanismos.** Este caso se usa en TRACEABILITY-MATRIX como TR-FIN-012 CERTIFICADA.

## P3 · Cajero Express con distribuciones por artículo (referencia: CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 / SMOKE-PRODUCTION-001)

**Incidente real (§FIX-SMOKE-001):** el modal «Configurar pago» congelaba el snapshot del ítem — el cajero editaba métodos/referencias que no se veían reflejadas ni persistían como esperaba.

**Aplicación retrospectiva:**
| Paso | ¿Habría detectado? |
|---|---|
| §6 Pruebas negativas POS | El escenario «editar pago → verificar chip vivo + persistencia tras reload» (CERT-UI-E) es un caso límite de la plantilla §18.5 — el defecto era exactamente un fallo de reactividad detectado por la suite nueva |
| §18.5 Plantilla de caso de prueba | Exigir evidencia de captura en cada superficie evita aprobar por «código revisado» |

**Defectos NUEVOS que el método descubrió en este ciclo (no conocidos antes de la misión):** R-09 (referencia de transferencia sin exigencia server-side en `p_payment_components`), R-10 (CI del cliente solo-frontend), R-11 (payment_incidents desactiva PT011 sin control), R-08 (distribuciones sin reconciliación server-side). Los 4 salieron del cruce sistemático «regla en UI vs regla en RPC» de la FASE 6 — ninguno era parte de los expedientes previos.

## P4 · Inventario y ajustes (descubrimiento nuevo, sin incidente previo)

**Aplicación prospectiva:** la auditoría de máquinas de estados reveló que `confirm_inventory_adjustment` sobrescribe `stock_current` a valor arbitrario con autorización mínima (`has_store_access_as`, sin rol/supervisor/tope) — R-05 CRÍTICO. El estándar §10 (multitienda/seguridad) y la matriz SEC exigían segunda barrera; el módulo nunca la tuvo. Este hallazgo NO provenía de ningún incidente documentado → **el método descubre defectos nuevos, no solo recurrencias** (requisito §16 de la misión).

## P5 · La puerta contra un PR histórico real (demostración práctica)

Se ejecutó la puerta v1 en modo retrospectivo contra el diff REAL del merge de PR #1711 (CP-AP: migraciones + API de pagos):
- `node scripts/ci-gate-business-rules.js --pr-body <sin declaración> --changed-from 0e684d6c1~1` → **EXIT=1** con dominios detectados: `seguridad-contratos, finanzas, migraciones-bd` (25 archivos).
- Con declaración válida (`FIN-001, SEC-002`) → **EXIT=0**.
- Con ID inexistente (`FIN-999`) → **EXIT=1** con mensaje accionable.
- Sin sección → **EXIT=1**.
- Suite completa de 6 escenarios en verde (FASE 9 del expediente).

**Conclusión del piloto:** el estándar es operativo (puerta verificada en 6 escenarios), habría interceptado los 3 incidentes de referencia en múltiples puntos, y su aplicación sistemática produjo 7 hallazgos críticos NUEVOS documentados en RISK-REGISTER (R-01, R-02, R-04, R-05, R-11, R-14, R-15) de los cuales al menos 4 no constaban en ningún expediente previo.
