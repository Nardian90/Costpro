# CP-SEC-027 — INFORME DE LA MISIÓN DE DECISIÓN Y EJECUCIÓN CONTROLADA (COSTPRO 4)

**Fecha de ejecución:** 2026-10-21 (01:30-01:55Z) · **Base verificada:** `main` @ `2d77b73f42`
**Modo:** verificación read-only + preparación. Cero escrituras productivas. Cero cambios de configuración GitHub. Cero fusiones por el agente.
**Evidencia completa:** `docs/audits/evidence/20261021-mision-decision/` (README con índice).

---

## 1. TABLA ÚNICA DE ESTADOS

Estados utilizados exclusivamente: `VERIFICADO`, `PREPARADO`, `PENDIENTE DE AUTORIZACIÓN`, `REQUIERE CAMBIOS`, `EJECUTADO`.

| ID | Estado verificado | Evidencia | Riesgo residual | Decisión que corresponde al propietario |
|---|---|---|---|---|
| **A1 · PR #1437** (expediente v5) | **VERIFICADO** | MERGED por el propietario 01:26:29Z (merge `299bc8f6f`); 39 archivos 100% `docs/audits/**`, +3250/−0; 0 secretos (scan de patrones); afirmaciones C/D/R1/backfill/allowlist contrastadas con BD viva hoy | Mínimo: staleness benigno por #1438 posterior (allowlist evolucionó tras el corte del expediente; las 6 fichas de Fase 5 siguen exactas) | Ninguna (fusión ya confirmada y verificada correcta) |
| **A2 · Ruleset v2** (7 checks) | **REQUIERE CAMBIOS** | Prueba empírica: head #1437 (docs-only) con 4/7 checks AUSENTES vs head #1438 con 7/7 en verde; mapeo workflows↔checks verificado | Si se activara tal cual: PRs solo-docs bloqueados indefinidamente (el propio #1437 no habría podido fusionarse) | NO activar la v2; sustituir por la v3 |
| **A2 · Ruleset v3 corregido** | **PREPARADO** | `RULESET_PROPUESTA_MAIN_v3_CORREGIDO.json`: 3 checks incondicionales requeridos (TypeCheck+Lint+Unit+Build, Unit & Integration, Security Audit) + deletion + non_fast_forward; los 4 gates de rutas siguen activos a nivel workflow; evaluate primero | Flake ocasional de `Unit & Integration Tests` (1 timeout Pick3 en 12 pushes; mitigación: re-run) | **Autorizar creación en `evaluate`** (luego, tras 7-14 días limpios, autorizar por separado el paso a `active`) |
| **CP-POS-003** (Venta por Conteo) | **VERIFICADO** (VALIDADA) | Fix en `useInventoryCount.ts:158-162` (storeId + fail-closed); 2/2 pruebas vivas hoy; #1421 fusionado 18/10 + CI verde post-fusión; producción desde 18/10 | Ninguno identificado | Ninguna |
| **CP-POS-007** (notas de venta) | **VERIFICADO** (VALIDADA) | `useSalesCatalog.ts:411-466` (sale_notes/p_notes, 4 puntos del circuito); 5/5 pruebas vivas hoy; #1421; producción desde 18/10 | Ninguno identificado | Ninguna |
| **CP-CAT-004** (tenant_id 403 RLS) | **VERIFICADO** (VALIDADA) | `useReceptions.ts:257-286` (resolución fail-closed pre-INSERT); 10/10 pruebas vivas hoy (2 suites); #1421; producción desde 18/10 | Ninguno identificado | Ninguna |
| **CP-SEC-019** (uuid estricto ×35) | **VERIFICADO** (VALIDADA) | `uuidLoose` en `validation/api-schemas.ts:13`; **0 estrictos vivos en `src/app/api`** (grep vivo + test de regresión); 5/5 pruebas vivas hoy; #1421; producción desde 18/10 | Reintroducción futura bloqueada por test de regresión | Ninguna |
| **Migración D** (índice legal_incidents) | **PENDIENTE DE AUTORIZACIÓN** (paquete PREPARADO) | Verificación viva: índice AUSENTE en BD (no aplicada); paquete `PAQUETE_D_LEGAL_INCIDENTS.md` con precondiciones/aborto/reversión | Bajo: índice ausente = solo coste de consulta creciente en `audit_logs` | **Autorizar apply del paquete D** |
| **Migración C** (cogs_derived) + 8 valores WAC | **PENDIENTE DE AUTORIZACIÓN** (paquete PREPARADO) | Verificación viva: columnas AUSENTES (no aplicada); paquete `PAQUETE_C_COGS_DERIVED.md` con los 8 valores WAC individualizados para aprobación contable | Medio: cogs derivado no persistido; reportes contables dependen del cálculo en caliente | **Aprobar los 8 valores WAC → autorizar apply del paquete C** |
| **Backfill david9999** | **EJECUTADO** | Verificación viva: `tenant_id = 5364ccf8…` (19/10 18:29:50) + audit `dt03_backfill_tenant` atómico | La autorización original no es verificable de forma independiente | **Ratificar expresamente (recomendado) o revertir conforme al dossier §6** |
| **Allowlist — 6 entradas vencen 2026-12-31** | **PENDIENTE DE AUTORIZACIÓN** | Las 6 fichas Fase 5 siguen exactas tras #1438 (verificadas hoy por conteo); lógica fail-closed del job verificada; evolución #1438: +`get_cash_flow_summary` (read-only), dedup `get_inventory_report`, −4 baselines | Vencimiento 31/12/2026 → fail-closed del CI si no se decide antes | **Decidir las 6** (5 renovaciones simples + `validate_store_can_be_modified`: REVOKE authenticated antes de renovar) |
| **PR de respaldo de esta misión** | **EJECUTADO** | Abierto por el agente con autorización expresa del propietario («abre un nuevo pr»); solo documentación + evidencia | Ninguno (docs-only) | Fusionar cuando lo estime oportuno (la fusión es del propietario) |

---

## 2. Dictamen A1 (síntesis)

**APTO PARA FUSIÓN** — fusión del propietario ya ejecutada y verificada correcta. El PR #1437 contenía exactamente lo declarado: 39 archivos 100% documentales (2 informes + 24 certificaciones + 13 evidencias read-only), sin código de aplicación, sin migraciones ejecutables, sin cambios de configuración, sin escrituras de datos, **sin secretos** (0 coincidencias de credenciales; los `service_role` de los textos son roles de PostgreSQL documentales) y sin instrucciones auto-ejecutables (todos los comandos documentados están cerrados con precondiciones de autorización). Las afirmaciones del expediente contrastan hoy con la BD viva: C no aplicada, D no aplicada, R1 abierta, backfill ejecutado, allowlist correcta en su corte. Detalle: `A1_DICTAMEN_PR1437.md`.

## 3. Dictamen A2 (síntesis)

- **Estado real:** `main` sigue SIN protección (`rulesets: []`, protection 404 — re-verificado hoy).
- **Regla de oro verificada:** 4 de los 7 checks de la v2 (`TypeScript Security Checks`, `Allowlist Review`, `SQL Static Checks`, `SQL DB Security Checks`) viven en workflows con filtro `paths:` y NO corren en PRs que no tocan `supabase/migrations/**`, `src/app/api/**`, `ci-gate-allowlist.json`, `scripts/ci-gate-*.js`. **Prueba de dos casos:** #1437 docs-only → 4/7 ausentes; #1438 tocando migraciones → 7/7 en verde.
- **Defecto crítico de la v2:** en `active` con 7 requeridos, TODO PR solo-docs quedaría bloqueado indefinidamente (checks que nunca reportan). El propio #1437 no habría podido fusionarse.
- **Modo `evaluate`:** confirmado observacional — no bloquea fusiones.
- **Bypass:** repo personal → sin bypass de actor; el escape del propietario es administrativo y auditable (editar/desactivar ruleset, registrado en audit log). **Opción B** sigue siendo la recomendación, con la v3.
- **Corrección v3 (PREPARADA, no aplicada):** requerir SOLO los 3 checks incondicionales; mantener los 4 gates de rutas a nivel workflow; `deletion` + `non_fast_forward`; evaluate → active en 2 autorizaciones separadas. Artefacto: `RULESET_PROPUESTA_MAIN_v3_CORREGIDO.json`.
- **Hallazgo secundario:** 1 flake de `Unit & Integration Tests` en el push de #1437 (timeout Pick3 120s); política de re-run; endurecimiento opcional en PR aparte.

**v2: REQUIERE CAMBIOS → v3: PREPARADO.** Nada creado ni activado.

## 4. Estado conciliado de MISIÓN A

**Las 4 tareas están VALIDADAS** (código presente + pruebas superadas en vivo hoy 25/25 + producción operativa desde el 18/10 vía PR #1421, fusionado por el propietario). No deben re-implementarse. La única salvedad es la capa E2E, deshabilitada por decisión del propietario (09/10, CP-INFRA-001) — decisión de infraestructura independiente, no un pendiente de estas tareas. Detalle por tarea: `MISION_A_CONCILIACION_4_TAREAS.md`.

## 5. Autorizaciones que aún faltan (al propietario)

1. **Fusionar** el PR de respaldo de esta misión (docs-only).
2. **Crear** el ruleset v3 en `evaluate` (la v2 quedó descartada con evidencia).
3. Tras 7-14 días de evaluaciones limpias: **activar** el ruleset v3 (segunda autorización).
4. **Aplicar** el paquete D (índice legal_incidents).
5. **Aprobar los 8 valores WAC** y **aplicar** el paquete C.
6. **Ratificar** el backfill david9999 (o revertir conforme al dossier §6).
7. **Decidir las 6 entradas** de allowlist que vencen el 2026-12-31 (5 renovaciones + `validate_store_can_be_modified` con REVOKE previo de `authenticated`).
8. Opcional, defensa en profundidad futura (PR de código aparte): reestructurar los workflows con paths-filter + job resumen para poder exigir los 7 checks a todos los PRs; y endurecer el timeout del test Pick3.

**Fin del informe. El agente se detiene aquí conforme a la orden de la misión.**
