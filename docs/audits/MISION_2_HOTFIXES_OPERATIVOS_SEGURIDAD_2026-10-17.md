# MISION_2_HOTFIXES_OPERATIVOS_SEGURIDAD — 2026-10-17

**Aplicación:** COSTPRO 4 Multitienda
**Programa:** MISIÓN 2 — Hotfixes operativos y seguridad inmediata (Plan Priorizado de Correcciones 2026-10-16, Misiones A + B)
**Branch:** `fix/mision-2-hotfixes-operativos` · **PR:** [#1421](https://github.com/Nardian90/Costpro/pull/1421) (base `main`)
**Base:** `main` @ `10af2706c` (post PR #1420)
**Estado:** Implementado en rama de trabajo — **NO desplegado en producción**. Sin migraciones nuevas (la misión es de código de aplicación cliente/API únicamente).

---

## 1. Objetivo y alcance

Ejecutar la MISIÓN 2 del plan priorizado: los 4 hotfixes operativos de la Misión A (CP-POS-003, CP-POS-007, CP-CAT-004, CP-SEC-019) más la verificación pasiva del P0 de la Misión B (CP-SEC-012 — BUG-013/017/022/024). Cada corrección con pruebas de regresión que habrían fallado antes del cambio, verificación de tipo completa y suite íntegra.

**Qué NO toca esta misión** (límites del plan): migraciones SQL, policies RLS, flujos de pago (`create_sale_v2` ya desplegado en repo), datos de producción, endpoints del dominio legal/reportes (solo lectura pasiva).

## 2. Verificación previa (Paso 2 del protocolo — el defecto sigue vivo)

Cada defecto se re-verificó en el código actual ANTES de modificar (HEAD `10af2706c`):

| ID | Verificación de vigencia | Resultado |
|---|---|---|
| CP-POS-003 | Lectura de `useInventoryCount.ts:148-155` + contrato del endpoint (`route.ts` exige `storeId` → 400) | **ACTIVO** — fetch sin `storeId`, igual que el repro del 15/10 |
| CP-POS-007 | Lectura de `confirmCheckout` + body del fetch + `createSaleParamsSchema` + `v2Payload` de sync/batch | **ACTIVO** — `notes` descartada en los 4 puntos del camino |
| CP-CAT-004 | Lectura de `useSavePendingReception` + policy `products_tenant_insert` (migración 20260827000005, sin flag) | **ACTIVO** en el hook legacy/fallback (la vista nueva ya tenía su fix) |
| CP-SEC-019 | Grep con conteo exacto por script | **ACTIVO Y CRECIDO** — 36 archivos / 52 ocurrencias (la auditoría documentó 35) |
| CP-SEC-012 | Verificación pasiva con curl (sin token, esperar 401) contra el servidor local dev + lectura de código | **BUG-013/017/022 CORREGIDOS** (ya existían los fixes; esta misión aporta la EVIDENCIA de vigencia); **BUG-024 ABIERTO** |

## 3. Correcciones implementadas

### 3.1 CP-POS-003 — «Venta por Conteo» rota (fetch sin storeId)

- `src/components/views/terminal/views/inventory_count/useInventoryCount.ts`:
  - `fetchProducts()` adjunta `?storeId=<tienda activa>` (con `encodeURIComponent`), patrón canónico de LotsView/DevolutionsView/WorkersView.
  - Fail-closed accionable si no hay tienda activa (error claro en toast en lugar del «0 de 0 productos» silencioso).
  - El `useEffect` inicial añade `user?.activeStoreId` a las dependencias (re-fetch al cambiar de tienda).
- **Criterio de aceptación original:** «Venta por Conteo» lista productos de la tienda activa. El listado se pobla con la respuesta del endpoint (verificado por test).

### 3.2 CP-POS-007 — Notas de venta del Catálogo descartadas (4 puntos)

1. `useSalesCatalog.ts` (online): `sale_notes: notes?.trim() ? notes.trim().slice(0,1000) : null` en el body de `/api/pos/checkout`. El endpoint ya aceptaba `sale_notes` (z.string().max(1000).nullable().optional()) y lo pasa como `p_notes` al RPC.
2. `useSalesCatalog.ts` (offline): `p_notes` en el enqueue a `createSale`.
3. `src/validation/schemas.ts`: `p_notes: z.string().max(1000).nullable().optional()` en `createSaleParamsSchema` — **sin esto el punto 2 es inútil**: zod `.parse()` elimina claves no declaradas.
4. `src/app/api/sync/batch/route.ts`: `p_notes: op.payload.p_notes || null` en el `v2Payload` del replay. `create_sale_v2` une la nota manual con la automática de incidencias SIN sobrescribir (`v_notes_final`, migración 20261017000000 ya en repo).

### 3.3 CP-CAT-004 — Alta de producto en recepción sin tenant_id → 403 RLS

- `src/hooks/api/useReceptions.ts` (`useSavePendingReception`): antes del insert de productos nuevos, resuelve `tenant_id` leyendo `stores.tenant_id` con el JWT del usuario (mismo patrón RLS-FIX que `useReceptionState`: `stores_tenant_select` solo devuelve tiendas del propio tenant → el valor queda validado contra la identidad del usuario, no es dato arbitrario del cliente). Fail-closed: tienda ilegible o `tenant_id` NULL → abort sin INSERT con error accionable.
- **Alcance:** cubre el camino de fallback que sobrevivía en el hook legacy. La vista nueva de inventario ya tenía su propio fix (verificado y protegido por `useReceptionState-tenant-rls.test.tsx`).

### 3.4 CP-SEC-019 — Validadores UUID estrictos (52 ocurrencias → 0)

- **Censo actualizado:** 36 archivos, 52 ocurrencias (51 simples + 1 con mensaje custom en `service-types/route.ts`).
- **Codemod idempotente** (script externo versionado + revisión manual del diff completo):
  - `z.string().uuid()` → `uuidLoose` — fuente única declarada en `@/validation/api-schemas` («SINGLE source of truth»), patrón ya dominante (45 archivos lo usaban).
  - `z.string().uuid('Identificador de tipo inválido')` → `z.string().regex(uuidRegex, 'Identificador de tipo inválido')` — conserva el mensaje custom.
- **Racional de seguridad:** el regex permisivo (8-4-4-4-12 hex, case-insensitive) replica EXACTAMENTE la semántica del tipo `uuid` de PostgreSQL, que es quien decide al final. No se amplía la superficie de ataque: la basura sigue rechazada (verificado por test). Se ALINEA cliente y BD en lugar de mantener un validador cliente más estricto que la BD (la causa del incidente Central).
- **Ajuste colateral:** `iteration-rls.test.ts` PT-RLS.4.1 — la aserción literal del patrón viejo se actualiza al patrón vigente (el contrato B4 —activeStoreId validado como UUID— se conserva).

### 3.5 CP-SEC-012 — Verificación pasiva del P0 (Misión B, sin cambios de código)

Ejecutada contra el servidor local dev (PM2, `bun server.ts`) con el código actual de `main`:

| Bug | Verificación | Resultado |
|---|---|---|
| BUG-017 | `POST /api/legal/incidents` sin token | **401** ✓ (código: `getServerSession` + 401 en route.ts:79-84) |
| BUG-022 | `GET /api/reports/download/[runId]` sin token | **401** ✓ (código: `withAuth` + ownership) |
| BUG-013 | `POST /api/academy/generate` sin token | **401** ✓ (código: session + sanitización FIX-SEC-009 del filename) |
| BUG-024 | Persistencia de incidents | **ABIERTO** — `data/incidents.json` (FS efímero en serverless); requiere decisión arquitectural |

- Sin escritura residual: `data/incidents.json` permanece vacío (el 401 bloquea antes de tocar el archivo).
- Los specs E2E con `test.fail` condicional quedan auto-correctos con el bug corregido (la rama `test.fail` no se ejecuta; el `expect(401)` pasa en verde).
- **Limitación declarada:** esta verificación es contra el servidor LOCAL con el código actual. La vigencia en el DESPLIEGO de producción (Vercel) debe repetirse con curl cuando se autorice. No se afirma que producción esté verificada.

## 4. Archivos modificados

| Archivo(s) | Cambio | Tarea |
|---|---|---|
| `src/components/views/terminal/views/inventory_count/useInventoryCount.ts` | storeId en fetch + fail-closed + deps del effect | CP-POS-003 |
| `src/components/views/terminal/views/pos/useSalesCatalog.ts` | `sale_notes` online + `p_notes` offline | CP-POS-007 |
| `src/validation/schemas.ts` | `p_notes` declarado en `createSaleParamsSchema` | CP-POS-007 |
| `src/app/api/sync/batch/route.ts` | `p_notes` propagado al replay V2 | CP-POS-007 |
| `src/hooks/api/useReceptions.ts` | resolución fail-closed de tenant_id + campo en insert | CP-CAT-004 |
| 36 rutas bajo `src/app/api/**` | `z.string().uuid()` → `uuidLoose`/`uuidRegex` | CP-SEC-019 |
| `src/__tests__/integration/iteration-rls.test.ts` | aserción PT-RLS.4.1 al patrón vigente | CP-SEC-019 (colateral) |
| 5 archivos de tests nuevos | ver §5 | — |

**Total:** 42 archivos modificados + 5 nuevos tests. Sin migraciones, sin cambios de RLS, sin secretos en el diff (verificado).

## 5. Pruebas (matriz completa)

### Tests nuevos de regresión (habrían FALLADO antes de cada fix)

| Archivo | Tests | Cubre |
|---|---|---|
| `src/__tests__/hooks/useInventoryCount-storeId.test.tsx` | 2/2 ✓ | fetch con `?storeId=` + fail-closed sin tienda |
| `src/__tests__/hooks/useSalesCatalog-notes.test.tsx` | 5/5 ✓ | nota en body online, null sin nota, truncado 1000, `p_notes` offline, schema no elimina `p_notes` |
| `src/__tests__/hooks/useSavePendingReception-tenant-rls.test.tsx` | 5/5 ✓ | insert con tenant verificado, fail-closed NULL, fail-closed error BD, camino sin `is_new` intacto |
| `src/__tests__/api/uuid-loose-central-contract.test.ts` | 5/5 ✓ | sintéticos de Central aceptados, basura rechazada, grep-vivo anti-reintroducción (0 rutas), contratos representativos |
| `src/__tests__/integration/sync-batch-pnotes.test.ts` | 3/3 ✓ | contrato de fuente del replay + contrato RPC (migración 20261017000000) |

**Subtotal: 20/20 ✓**

### Suites ejecutadas

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **EXIT 0** (0 errores) |
| `npx vitest run` (suite completa) | **3170 passed / 0 failed / 24 skipped** (188 archivos + 1 skipped; los skips son los preexistentes por credenciales E2E ausentes — CP-INFRA-005, no introducidos por esta misión) |
| curl pasivo BUG-013/017/022 | **401/401/401** ✓ |

### Limitaciones del entorno declaradas

- E2E de Playwright NO ejecutado en esta misión (requiere `E2E_TEST_USER_TOKEN` y entorno — CP-INFRA-011 pendiente). La verificación funcional de las vistas queda como evidencia pendiente en cada ficha.
- La verificación de CP-SEC-012 es contra el servidor local; producción (Vercel) queda pendiente de autorización/repetición.
- El `tsc --noEmit` global SÍ pudo ejecutarse en esta ocasión (2.7 GiB disponibles); se documenta porque la auditoría original reportaba OOM (CP-INFRA-002).

## 6. Estados del inventario tras la misión

| ID | Estado anterior | Estado nuevo | Justificación |
|---|---|---|---|
| CP-POS-003 | PENDIENTE CONFIRMADA | **PENDIENTE DE VERIFICACIÓN** | Fix + 2/2 tests + suite íntegra; falta pase funcional en despliegue |
| CP-POS-007 | PENDIENTE CONFIRMADA | **PENDIENTE DE VERIFICACIÓN** | Fix 4 puntos + 8/8 tests; falta E2E con nota visible en detalle |
| CP-CAT-004 | PENDIENTE CONFIRMADA | **PENDIENTE DE VERIFICACIÓN** | Fix + 5/5 tests; falta E2E de recepción con producto nuevo |
| CP-SEC-019 | PENDIENTE CONFIRMADA | **PENDIENTE DE VERIFICACIÓN** | 52→0 + 5/5 tests; falta smoke test contra Central |
| CP-SEC-012 | PENDIENTE CONFIRMADA (P0) | **PARCIALMENTE RESUELTA** | BUG-013/017/022 verificados corregidos (401 local); BUG-024 abierto (decisión arquitectural) |

Resumen global del inventario (101 tareas): PENDIENTE CONFIRMADA 65→**60** · PARCIALMENTE RESUELTA 9→**10** · PENDIENTE DE VERIFICACIÓN 0→**4** · RESUELTA VERIFICADA 21 · NO VERIFICABLE 3 · OBSOLETA 3.

**Ninguna tarea se marca RESUELTA VERIFICADA en esta misión** porque ninguna superó aún la verificación funcional en el entorno desplegado — exactamente el estándar del protocolo (regla §4: no presentar una corrección local como solución certificada).

## 7. Riesgos residuales y seguimiento

1. **BUG-024 (CP-SEC-012):** incidents persistidos en FS efímero. Propuesta técnica: migrar a tabla `legal_incidents` en Supabase con RLS. Requiere decisión del propietario. Es el único sub-defecto P0 vivo.
2. **uuidLoose relaja el validador de entrada al nivel exacto de PostgreSQL:** cualquier ID 8-4-4-4-12 hex pasa el gate Zod. Esto NO amplía la superficie real (la BD ya lo aceptaba), pero el PR debe revisarse con ese lente. El test de contrato ancla ambos lados (sintéticos aceptados, basura rechazada).
3. **La verificación pasiva es local:** repetir los 3 curls contra producción (cuando el código desplegado incluya o ya tenga estos fixes) y registrar la evidencia en esta ficha.
4. **Pendiente de verificación funcional:** los 4 hotfixes necesitan pase real en preview/despliegue (pasos E2E con tienda activa) para cerrar como RESUELTA VERIFICADA.

## 8. Próxima tarea recomendada

Siguiendo el plan priorizado (Misión A → C → D), la siguiente tarea elegible es:

- **MISIÓN C (decisiones de negocio):** CP-INV-005 (política de stock negativo), CP-DATA-001 (limpieza E2E/QA), CP-SEC-010/DT-03 (modelo tenant), CP-INV-002/003/004 (datos comerciales), CP-IPV-001 (backfill ledger). Sin decisiones, las misiones E/F no pueden cerrar tareas.
- En paralelo si hay margen: **CP-CAT-005** (bulk-import Zod — siguiente P1 de la campaña de seguridad, independiente de decisiones) o **CP-POS-002** (offline sync, P1).

## 9. Trazabilidad

- Inventario maestro actualizado con bloques «REMEDIACIÓN MISIÓN 2» en las 5 fichas: `docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md`.
- Este informe: `docs/audits/MISION_2_HOTFIXES_OPERATIVOS_SEGURIDAD_2026-10-17.md`.
- Rama: `fix/mision-2-hotfixes-operativos` (base `main` @ `10af2706c`) · PR #1421.
- Verificación del diff: 42 archivos modificados, 5 tests nuevos, 0 secretos, 0 migraciones, 0 cambios de RLS.
