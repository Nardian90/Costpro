# PLAN PRIORIZADO DE CORRECCIONES — COSTPRO 4 MULTITIENDA

**Fecha:** 2026-10-16 · **Base:** inventario maestro `INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md` (101 tareas; 80 abiertas)
**Propósito:** preparar misiones pequeñas, ordenadas por prioridad y dependencia, para ejecutar de forma controlada. **Este plan NO implementa nada todavía.**
**Convención de prioridades:** P0 crítica · P1 alta · P2 media · P3 baja (según impacto/riesgo real, no antigüedad documental).

---

## MISIÓN A — Hotfixes de operación con evidencia ya verificada (P1, ~1 día)

- **Objetivo:** eliminar los 4 defectos de operación confirmados en código durante esta auditoría.
- **Tareas incluidas:** CP-POS-003 · CP-POS-007 · CP-CAT-004 · CP-SEC-019.
- **Dependencias:** ninguna externa. Son 4 PRs pequeños e independientes (o 1 PR con 4 commits separados).
- **Riesgos:** CP-SEC-019 toca 35 archivos: hacerlo por helper compartido (`uuidRegex` canónico ya existe en `useCatalogProducts.ts`) y en 2-3 PRs temáticos para revisión cómoda.
- **Archivos/componentes a investigar:**
  - `src/components/views/terminal/views/inventory_count/useInventoryCount.ts` (+ test).
  - `src/components/views/terminal/views/pos/useSalesCatalog.ts` + schema de `/api/pos/checkout`.
  - `src/hooks/api/useReceptions.ts` (insert de products + tenant_id de sesión).
  - Helper de validación UUID + 35 `route.ts` (lista por grep `z.string().uuid()`).
- **Pruebas necesarias:** unit del hook de conteo; test de contrato del checkout con notas; test de recepción con producto nuevo; suite de contratos con UUID sintético de Central.
- **Criterios de aceptación:**
  1. «Venta por Conteo» lista productos de la tienda activa.
  2. Venta desde Catálogo con nota → nota persistida y visible en detalle.
  3. Alta de producto desde recepción con usuario de tienda → 200.
  4. `grep z.string().uuid()` = 0 en `src/app/api`.
- **Condiciones antes de empezar:** working tree limpio; CI verde en main; rama por fix.
- **Qué NO modificar durante la misión:** migraciones SQL, policies RLS, flujos de pago (`create_sale_v2`), datos de producción.

## MISIÓN B — Verificación pasiva del P0 y triage de bugs activos (P0, ~2 h)

- **Objetivo:** confirmar la vigencia real de CP-SEC-012 (BUG-013/017/022/024) y cerrar el triage.
- **Tareas incluidas:** CP-SEC-012 (verificación + fix si procede).
- **Dependencias:** ninguna; se puede hacer ANTES de la Misión A.
- **Riesgos:** la verificación usa endpoints públicos sin escribir datos (curl con/sin token); cero riesgo si es solo lectura.
- **Archivos/componentes:** `src/app/api/legal/incidents/*`, `src/app/api/reports/*`, `src/components/.../academy` (sanitización de filename), `e2e/auth.spec.ts`, `e2e/reports.spec.ts`, `e2e/academy.spec.ts`, `e2e/legal.spec.ts`.
- **Pruebas necesarias:** curl sin token (esperado 401); E2E de XSS; decisión de persistencia para BUG-024.
- **Criterios de aceptación:** si el bug está vivo → hotfix + invertir `test.fail` a `test.pass`; si está muerto → actualizar specs y cerrar con evidencia.
- **Condiciones antes de empezar:** autorización explícita para tocar esos endpoints (son del dominio legal/reportes).
- **Qué NO modificar:** contenido real de incidents/reportes de producción.

## MISIÓN C — Decisiones del negocio que desbloquean (sin código, 1 sesión)

- **Objetivo:** tomar las decisiones que bloquean 12+ tareas técnicas.
- **Tareas incluidas (decisiones):** CP-INV-005 (política stock negativo) · CP-DATA-001 (limpieza E2E/QA por lotes) · CP-SEC-010 (DT-03 tenant) · CP-SEC-011 (DT-06 aprobación) · CP-INV-002/003 (datos comerciales faltantes) · CP-INV-004 (actualizar precios) · CP-IPV-001 (autorización de backfill de ledger) · CP-DATA-005/006 (pares neto-cero y tarifas de julio) · CP-CAT-006 (backfill service_type_id).
- **Dependencias:** el resultado define el alcance de las Misiones E/F.
- **Riesgos:** ninguna técnica; el riesgo es retrasarlas (misiones futuras repetirán investigación).
- **Entregable:** registro de decisiones en `docs/decisions/` con fecha y efecto sobre IDs.
- **Condiciones antes de empezar:** propietario con acceso a Supabase dashboard y a la referencia del papel/Excel.
- **Qué NO modificar:** nada — solo documentar decisiones.

## MISIÓN D — Red de seguridad de calidad (P1, 2-3 días, multiplicador)

- **Objetivo:** reactivar la red E2E sin riesgo de contaminar negocio.
- **Tareas incluidas:** CP-INFRA-011 (prerequisito) · CP-INFRA-001 · CP-INFRA-006 (solo fixtures P0 de recepción) · CP-INFRA-009 (política anti-merge-ERROR) · CP-INFRA-014 (verificar branch protection).
- **Dependencias:** CP-INFRA-011 habilita el resto; Misión C decide credenciales/cuotas.
- **Riesgos:** el proyecto de pruebas debe crearse **vacío** y con guardas (variables E2E_ISOLATION ya existen); no apuntar nunca workflows al proyecto de negocio.
- **Archivos/componentes:** `.github/workflows/ci.yml`, `test-coverage.yml`, `e2e/fixtures.ts`, `playwright.config.ts`, secrets de GitHub, settings de branch protection.
- **Pruebas necesarias:** corrida completa de `test:e2e:creation` aislada; PR con fallo E2E intencional que debe bloquear merge.
- **Criterios de aceptación:**
  1. E2E bloqueante en verde en un PR real.
  2. E2E-INV-010 y E2E-PO-005 automatizados.
  3. Regla «no merge con preview ERROR / tsc fallando» documentada y aplicada.
- **Condiciones antes de empezar:** proyecto Supabase de pruebas provisionado con credenciales en secrets.
- **Qué NO modificar:** el proyecto de negocio (`wthkddeleylijmonclxg`); nada de la app funcional.

## MISIÓN E — Campaña de seguridad por lotes (P1, continuada)

- **Objetivo:** reducir superficie de ataque y eliminar la bomba de tiempo de la allowlist.
- **Tareas incluidas:** CP-SEC-006 (5 endpoints Alta primero: `stores/[id]/backup/restore`, `stores/[id]/archive`, `stores/[id]/restore`, `catalog/bulk-import`, `exchange-rates/bulk-upload`) · CP-CAT-005 · CP-SEC-005 + CP-INFRA-004 (migración de saneamiento del histórico SQL) · CP-SEC-007 (gate fail-closed) · CP-SEC-013 (Upstash) · CP-SEC-004 (audit en transfers/recepciones) · CP-SEC-020 (manage_user_memberships) · CP-SEC-003.
- **Dependencias:** Misión D para correr gates con confianza; Misión C para nada bloqueante aquí.
- **Riesgos:** la migración de saneamiento del histórico SQL es la pieza delicada — hacerla con replay completo en entorno aislado (Misión D) antes de aplicar; cambios de RLS con tests de aislamiento (`supabase/tests/isolation_test.sql`).
- **Archivos/componentes:** endpoints del backlog, `ci-gate-allowlist.json`, `security-gate.yml`, `rate-limit.ts`, `transfers/route.ts`, `useReceptions.ts`, migraciones nuevas «fixup».
- **Pruebas necesarias:** security-contract tests; replay `supabase db reset` + suite; test de rate-limit cross-instancia; test de audit_logs.
- **Criterios de aceptación:** 5 endpoints Alta removidos del backlog; allowlist ≤ 10 ítems justificados; replay limpio sin reintroducir vulnerabilidades; `audit_logs` con actor en transfers/recepciones.
- **Condiciones antes de empezar:** entorno aislado disponible; ventana acordada para la migración fixup.
- **Qué NO modificar:** históricos de datos; solo definiciones de esquema/funciones con protocolo gobernado.

## MISIÓN F — Contabilidad, catálogo y datos maestros (P1/P2, por lotes)

- **Objetivo:** restaurar la verdad contable del catálogo y de los costos.
- **Tareas incluidas:** CP-IPV-003 (WAC 680x, corrección gobernada) → CP-IPV-002 (TAREA 3 COGS bajo política de la Misión C) → CP-INV-001 (4 productos Puerto Padre) → CP-POS-010 (aplicar migración `ref_type` + confirmación viva del Reporte Entrega) → CP-IPV-001 (backfill autorizado) → CP-INV-002/003/004 (altas/precios/costos con datos de la Misión C) → CP-INV-005/006 (ajustes de conciliación autorizados).
- **Dependencias:** Misión C (todas las decisiones) y Misión D (entorno para validar).
- **Riesgos:** escrituras históricas — cada una con `wac_change_log`/audit, delta 0 verificado y baseline antes/después (patrón ya probado en TAREA 2/2B, CP-RES-007).
- **Archivos/componentes:** protocolos `fn_recalc_wac`, `reconcile_stock`, `products_tenant_insert`, migración `20261012000001_cash_report_adjustments.sql`, `period-attribution.ts`.
- **Pruebas necesarias:** conciliaciones solo-lectura antes/después; baseline ENERVIDA con `isolation_check.py`; verificación en vivo del Reporte Entrega.
- **Criterios de aceptación:** 0 productos con WAC implausible; conciliación inventario↔ledger sin divergencias no clasificadas; cash report con ajustes en despliegue.
- **Condiciones antes de empezar:** decisiones firmadas (Misión C); autorización explícita por lote de escritura.
- **Qué NO modificar:** ventas/devoluciones ya registradas sin autorización específica; datos de tiendas protegidas (ENERVIDA-VITALLCONS con baseline commiteado).

## MISIÓN G — UX, higiene y deuda menor (P2/P3, intercalable)

- **Tareas incluidas:** CP-POS-008 (tasas 680) · CP-POS-009 (selector de fecha) · CP-POS-004/005/006 (comisiones fallback/firmas/test) · CP-INV-008/009 · CP-CAT-001/002/003/007 · CP-UI-001 (sub-ítems 2-5) · CP-UI-005 (cerrar P1-P10) · CP-UI-002/003/006 · CP-IPV-005 · CP-DATA-004 · CP-INFRA-002/003/005/007/008/010/012/013/015/016/017 · CP-OBS-001/002 (triage final) · CP-INFRA-012.
- **Dependencias:** independiente; útil como relleno entre misiones A-E.
- **Riesgos:** bajos; cada tarea es autónoma con su PR.
- **Criterios de aceptación:** por tarea, según ficha del inventario maestro.
- **Qué NO modificar:** nada de las áreas activas de las misiones anteriores durante sus ventanas.

---

## Secuencia recomendada y dependencias

```
Misión B (P0 verificación) ─┐
Misión A (hotfixes) ────────┼──► Misión C (decisiones) ──► Misión D (red E2E) ──► Misión E (seguridad) ──► Misión F (contabilidad)
                            └────────────────────────── Misión G (intercalable siempre)
```

- **Regla de oro operativa:** ninguna escritura a BD compartida sin autorización explícita por lote; ninguna migración sin replay probado en entorno aislado; baseline de ENERVIDA verificado antes y después de cada misión (`scripts/ci-fix/isolation_check.py`).
- **Cierre de misión:** actualizar estados en el inventario maestro (los IDs CP-* son estables), mover tareas de PENDIENTE a RESUELTA con evidencia, y commitear el informe en `docs/audits/`.
