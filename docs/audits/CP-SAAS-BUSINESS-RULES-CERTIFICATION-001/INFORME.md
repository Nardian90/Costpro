# EXPEDIENTE — MISIÓN CP-SAAS-BUSINESS-RULES-CERTIFICATION-001
**Auditoría integral de reglas de negocio, invariantes, procesos transversales y certificación de calidad de COSTPRO 4 Multitienda**
**Fecha:** 2026-11-26 · **Commit examinado:** main `0e684d6c1` · **Rama de entrega:** `feat/cp-bra-001-20261126` · **PR:** (enlazar al crear)

---

## 1. ALCANCE Y MÉTODO

Auditoría arquitectónica, funcional, financiera, documental y de seguridad del SaaS completo, con dos objetivos: (a) construir el mapa real de reglas empresariales y su estado de protección, y (b) instalar un mecanismo permanente (estándar CP-BRA-001 + puerta en CI) que evite regresar al estado anterior.

Método: exploración forense paralela del código real en 5 dominios (arquitectura/plataforma, finanzas, operaciones comerciales, inventario/datos maestros, infraestructura de calidad) + cruce con 627 migraciones (212 en replay), 7 workflows de CI, expedientes históricos de `docs/audits/` y estándares externos (OWASP BLS, ISO/IEC 25010:2023, ISO/IEC/IEEE 29119, ISTQB 4.0, OMG DMN, PBT/metamórfica). Todas las afirmaciones llevan evidencia `archivo:línea` o referencia a expediente.

## 2. ENTREGABLES (los 15 de la misión → ubicación)

| # | Entregable | Ubicación |
|---|---|---|
| 1 | Inventario de módulos y dominios | Sección 3 de este informe (resumen) + informes de dominio incorporados en el catálogo |
| 2 | Catálogo inicial de reglas empresariales (72 reglas, 12 familias) | `docs/quality/business-rules/BUSINESS-RULES-CATALOG.md` |
| 3 | Matriz de invariantes (32 invariantes, 5 dominios) | `docs/quality/business-rules/DOMAIN-INVARIANTS.md` |
| 4 | Máquinas de estados (13 entidades) | `docs/quality/business-rules/STATE-MACHINES.md` |
| 5 | Auditoría de transiciones ilegales (9 casos sistemáticos) | `STATE-MACHINES.md` §16-17 |
| 6 | Mapa de procesos transversales (6 ciclos + tabla de consistencia entre entradas) | `docs/quality/business-rules/CROSS-MODULE-WORKFLOWS.md` |
| 7 | Mapa de controles por capa | `STATE-MACHINES.md` §16 (tabla por capa) + catálogo (controles por regla) |
| 8 | Matriz de trazabilidad (16 reglas críticas, cadena completa) | `docs/quality/business-rules/TRACEABILITY-MATRIX.md` |
| 9 | Registro de riesgos (30 hallazgos: 7 CRÍTICOS/15 ALTOS/5 MEDIOS/3 BAJOS) | `docs/quality/business-rules/RISK-REGISTER.md` |
| 10 | Diagnóstico de deficiencias principales | Este informe §4 |
| 11 | Estándar permanente CP-BRA-001 | `docs/quality/business-rules/STANDARD-CP-BRA-001.md` |
| 12 | Puerta de certificación (diseño + implementación + verificación) | `scripts/ci-gate-business-rules.js` + `ci.yml` (job quality) + `business-rules-manifest.json` + plantilla de PR; verificación en §5 |
| 13 | Resultados de la prueba piloto | `docs/quality/business-rules/PILOT-RESULTS.md` |
| 14 | Plan de remediación priorizado | `RISK-REGISTER.md` (columna Prioridad P1-P4) + este informe §7 |
| 15 | Informe de cobertura y limitaciones | Este informe §8 |

## 3. INVENTARIO RESUMIDO (FASE 1)

- **Plataforma:** Supabase Auth sin NextAuth; wrappers `withAuth/withRole/withStoreAccess` en 213/228 rutas API; 9 roles + `roles` JSONB; multitienda con `user_store_access/memberships` + `has_store_access` en ~280 call sites; Catálogo Maestro MDM híbrido (20261028110000); RLS 154 tablas / 522 policies / 1003 REVOKE / 1207 GRANT; 456 funciones RPC (~394 SD); 112 triggers en 57 tablas; auditoría central `audit_logs` con whitelist; 5 rutas cron (solo 1 con scheduler); realtime doble stack (Socket.io PM2 / Supabase Realtime).
- **Finanzas:** CxP como constructo virtual (receipts + received_services + commissions) con calculador único TS; motor de partida doble completo (`fin_*` con generaciones); 3 RPCs de pago (individual/batch/multi) con idempotencia y locks; reversión con contra-fila estructuralmente única; conciliación v3 con detectores.
- **Comercial:** create_sale_v2 /35 con 15 validaciones fail-closed + supervisor gate ≥15%; POS Express con anti doble-clic en 3 capas; recepciones/PO/servicios/vales/devoluciones/ajustes/OT con máquinas de estado (6 en trigger global BD, 7+ fuera); numeración por tienda (document_sequences + ENT/SRV/VS) y maestro SKU forward-only.
- **Inventario/maestros:** modelo 3 capas (inventory canónica + stock_current sincronizado + ledger inmutable RLS); WAC server-side; IPV con identidad reconstruida; proveedores/clientes SIN unicidad (incidente CP-AP); monedas CUP/USD/EUR/MLC con jerarquía de tasas fail-closed.
- **Calidad:** 7 workflows; SQL Security Gate con allowlist v2 (126 ítems con expiración); security-contract estático 3 capas; writers.manifest (97/44/151); replay de migraciones determinista (212); vitest 503 archivos (~5,884 tests); Playwright 88 specs (~660 tests, workers=1); AGENTS.md como instrucciones permanentes; plantilla de PR con clasificación de riesgo.

## 4. HALLAZGOS PRINCIPALES

**Patrón estructural dominante (causa raíz de 4 de 7 críticos):** las reglas de negocio viven en MÚLTIPLES writers sin contrato — cada writer nuevo o reemisión parcial de trigger rompe un invariante multi-ruta. Casos: rama OT del trigger `update_payment_status` perdida al reemitir (R-01), tres definiciones de «pagado» (R-25), tasa fija 450 en CxC (R-02).

**Los 7 críticos:** R-01 (saldos CxC desactualizados), R-02 (importes distintos por tasa fija 450), R-04 (anulación de recepción no revierte pagos — misma clase que el incidente SRV que motivó la misión), R-05 (ajustes de inventario sin autorización de rol), R-11 (payment_incidents desactiva PT011 sin control), R-14 (reversión sin guard de período), R-15 (proveedores duplicables con incidente real).

**Lo que está bien protegido (certificado):** la cadena transaccional principal venta/pago (locks, idempotencia, seller binding, WAC, tasa canónica, PT011 salvo incidencias), el aislamiento multitienda (has_store_access + RLS + tenant triggers), la no-borrabilidad de pagos, la reversión estructuralmente única, el catálogo maestro gobernado y la numeración documental.

## 5. ESTÁNDAR CP-BRA-001 Y PUERTA (FASE 8-9)

El estándar (19 secciones + 7 plantillas) y la puerta CI están descritos en los documentos hermanos. Puntos clave de la implementación:
- **Integración de bajo riesgo:** el gate vive en el job `quality` de `ci.yml` tras los gates existentes (SEC-TS, destructive) y antes del Build; no toca migraciones, ni allowlists, ni writers.manifest; sin credenciales nuevas (usa `github.token` de lectura para el cuerpo del PR).
- **Comportamiento:** integridad del manifiesto siempre (fail-closed); en PRs que tocan dominios críticos exige la sección «Reglas de negocio afectadas» con IDs válidos del catálogo (NINGUNA sin IDs no basta en dominio crítico).
- **Verificación local:** 6 escenarios (estático, docs sin declaración, crítico sin declaración → exit 1, crítico con declaración → exit 0, ID inexistente → exit 1 con mensaje accionable, sin sección → exit 1) + gates existentes re-ejecutados OK (check-writers, SEC-TS, CP-INFRA-020) + 0 secretos en el diff.
- **No debilita nada:** ningún workflow/gate/RLS fue modificado en su lógica; solo se AÑADEN pasos y la sección de plantilla.

## 6. PRUEBA PILOTO (FASE 13 → PILOT-RESULTS.md)

3 incidentes reales usados como casos de referencia (CP-AP, SRV-00146, FIX-SMOKE-001) + 1 descubrimiento prospectivo (R-05). Conclusión: los 3 incidentes habrían sido interceptados por ≥3 mecanismos del estándar; el método descubrió defectos nuevos no presentes en expedientes previos (R-01, R-02, R-04, R-05, R-08-R-11).

## 7. PLAN DE REMEDIACIÓN PRIORIZADO (sin ejecutar — misión documental)

| Prioridad | Hallazgos | Misión de remediación sugerida |
|---|---|---|
| P1 | R-01, R-02, R-04, R-05, R-11, R-15 | 6 misiones independientes (CP-REM-001..006), cada una con migración aditiva + RPC + pruebas positiva/negativa/regresión + conciliación ANTES/DESPUÉS |
| P2 | R-03, R-06, R-07, R-08, R-09, R-13, R-14, R-16, R-18, R-19, R-21, R-25 | Planificación por dominio; varias requieren DECISIÓN DEL PROPIETARIO (roles de confirmación, flujo directo de vales, filtro de rol de precios, guard de período) |
| P3-P4 | R-10, R-12, R-17, R-20, R-22, R-23, R-24, R-26, R-27, R-28, R-29, R-30, R-31, R-32 | Backlog; algunas solo documentación |

Restricciones respetadas: no se alteró ninguna operación histórica, saldo, regla ambigua, inventario ni producción; NO se ejecutó migración alguna; la única escritura fue documental + scripts de CI estáticos.

## 8. COBERTURA Y LIMITACIONES

**Cubierto (examinado en profundidad):** arquitectura/plataforma (auth, roles, tenancy, RLS, API, RPC, triggers, cron, realtime, import/export, auditoría) · finanzas (CxP, CxC, pagos, anulaciones, caja, monedas, partida doble, conciliación) · operaciones comerciales (ventas/POS, compras/recepciones, servicios recibidos, vales, devoluciones, ajustes, OT, transferencias) · inventario/datos maestros (stock, kardex, IPV, unidades, variantes/SKU, precios, catálogo maestro, terceros, tasas, medios de pago) · infraestructura de calidad (workflows, gates, manifests, suites, convenciones).

**Excluido / examen superficial (se declara explícitamente):** HR/nómina (solo inventario de superficie), WhatsApp/Telegram (13 rutas cada uno, no auditados funcionalmente), billing/Stripe, cost-sheets con AI, storefront público, fichas de costo, cotizaciones/ofertas (hallazgos menores anotados), Pick3. BD de producción NO consultada (auditoría estática sobre repositorio y migraciones; ningún acceso a datos reales).

**Limitaciones:** (a) sin ejecución E2E nueva — las pruebas citadas son evidencia de CI previa y suites existentes; (b) análisis estático no puede garantizar comportamiento en runtime ante cargas concurrentes reales; (c) el catálogo v1.0 cubre 72 reglas — el estándar §19 obliga a ampliarlo por misión; (d) varios hallazgos requieren decisión del propietario antes de cualquier corrección.

## 9. CERTIFICACIÓN (auto-aplicación de la política)

**Estado del SISTEMA GLOBAL: CONDICIONAL** — no existe defecto crítico sin control documentado ni contradicción no registrada, PERO: 7 defectos críticos abiertos (R-01/02/04/05/11/14/15), 3 reglas críticas RECHAZADAS y 3 CONDICIONALES en la matriz de trazabilidad, y cobertura incompleta (exclusiones §8). El alcance de ESTA misión (estándar + catálogo + puerta + piloto) queda **CERTIFICADO** como instrumento operativo: puerta verificada en 6 escenarios, estándar probado contra 3 incidentes reales y 1 descubrimiento nuevo.

Certificado de alcance completo: `docs/quality/business-rules/CERTIFICATION-POLICY.md` §8.

## 10. ARCHIVOS DE LA MISIÓN

```
docs/quality/business-rules/
  STANDARD-CP-BRA-001.md          estándar permanente (19 secciones + 7 plantillas)
  BUSINESS-RULES-CATALOG.md       72 reglas / 12 familias con evidencia file:line
  DOMAIN-INVARIANTS.md            32 invariantes / 5 dominios con estado
  STATE-MACHINES.md               13 máquinas + matriz por capa + 9 casos ilegales
  CROSS-MODULE-WORKFLOWS.md       6 ciclos + tabla de consistencia entre entradas
  TRACEABILITY-MATRIX.md          16 reglas críticas con cadena completa
  RISK-REGISTER.md                30 hallazgos con prioridad P1-P4
  CERTIFICATION-POLICY.md         estados, certificado de alcance, proceso
  PILOT-RESULTS.md                piloto con incidentes reales
  business-rules-manifest.json    manifiesto consumido por la puerta CI
scripts/ci-gate-business-rules.js puerta (estática, fail-closed, sin credenciales)
.github/pull_request_template.md  sección «Reglas de negocio afectadas (CP-BRA-001)»
.github/workflows/ci.yml          2 pasos nuevos en job quality (integridad + declaración)
AGENTS.md                         sección permanente CP-BRA-001 (§19 de la misión)
```
