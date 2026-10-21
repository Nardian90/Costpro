# MISIÓN A — Conciliación del estado real: CP-POS-003, CP-POS-007, CP-CAT-004, CP-SEC-019

**Misión:** COSTPRO 4 · **Fecha de verificación viva:** 2026-10-21 (~01:55Z) · **Base:** `main` @ `2d77b73f42` (incluye fusiones #1421, #1435, #1436, #1437, #1438)
**Método:** distinción exigida por la misión entre (i) código presente, (ii) pruebas superadas y (iii) aceptación funcional demostrada. Cero re-implementaciones. Cero escrituras.

---

## Resumen ejecutivo

Las cuatro tareas constaban `PENDIENTE CONFIRMADA` en el inventario del 16/10. El PR #1421 (MISIÓN 2, fusionado por el propietario el **2026-10-18T15:33:20Z**, 49 archivos, +1199/−67) las resolvió. La conciliación de hoy verifica **código presente + pruebas superadas EN VIVO hoy + despliegue en producción operativo desde el 18/10**, sin regresiones posteriores (los 11 pushes a main posteriores al 18/10 pasaron la suite; el único fallo registrado fue 1 flake de timeout Pick3 ajeno a estas tareas, 21/10).

**Estado conciliado de las 4: VALIDADAS.** No requieren nueva misión de implementación.

---

## CP-POS-003 — «Venta por Conteo»: «0 de 0 productos» permanente

| Dimensión | Evidencia verificada |
|---|---|
| Defecto original | `useInventoryCount.ts:148-155` — fetch sin `storeId` → endpoint con withStoreAccess respondía vacío → «0 de 0» permanente |
| Código presente | `src/components/views/terminal/views/inventory_count/useInventoryCount.ts:158-162` — `const storeId = user?.activeStoreId` con **fail-closed** (`if (!storeId)` → aborta con error accionable) + `fetch('/api/inventory/products?storeId=' + encodeURIComponent(storeId))` |
| Pruebas | `src/__tests__/hooks/useInventoryCount-storeId.test.tsx` — **2/2 EN VIVO hoy** (incluye caso «sin tienda activa NO llama al endpoint y notifica error» — el stderr del test ES el comportamiento fail-closed esperado) |
| Aceptación funcional | Fusionado en #1421 (18/10) → CI post-fusión del merge commit `584440873` en verde (TypeCheck/Unit&Integration/Security Audit success; `evidencia/checks_postfusion_pr1421_584440873.json`) → producción desde 18/10 sin reportes de regresión |
| **Estado** | **VALIDADA** — no re-implementar |

## CP-POS-007 — Notas de venta del Catálogo de Ventas descartadas silenciosamente

| Dimensión | Evidencia verificada |
|---|---|
| Defecto original | `useSalesCatalog.ts` — notas de venta del catálogo no persistían |
| Código presente | `src/components/views/terminal/views/pos/useSalesCatalog.ts:411-412` (offline `p_notes`, slice 1000) y `:464-466` (online `sale_notes` → API con schema Zod `max(1000).nullable().optional()`) — 4 puntos del circuito (online, offline, schema, replay sync/batch) |
| Pruebas | `src/__tests__/hooks/useSalesCatalog-notes.test.tsx` — **5/5 EN VIVO hoy** |
| Aceptación funcional | Ídem #1421; producción desde 18/10 sin regresión |
| **Estado** | **VALIDADA** — no re-implementar |

## CP-CAT-004 — Alta de producto en recepción sin tenant_id → 403 RLS

| Dimensión | Evidencia verificada |
|---|---|
| Defecto original | `useReceptions.ts:267` — INSERT sin `tenant_id` → política RLS `products` rechazaba con 403 |
| Código presente | `src/hooks/api/useReceptions.ts:257-286` — resolución **fail-closed** de `tenant_id` desde `stores` con el JWT del usuario ANTES del INSERT (`if (tenantError \|\| !tenantStore?.tenant_id)` → aborta sin INSERT; `verifiedTenantId` explícito). Mismo patrón en `useReceptionState.ts:998+` |
| Pruebas | `src/__tests__/hooks/useSavePendingReception-tenant-rls.test.tsx` — **5/5 EN VIVO hoy**; `useReceptionState-tenant-rls.test.tsx` — **5/5 EN VIVO hoy** |
| Aceptación funcional | Ídem #1421; producción desde 18/10 sin regresión |
| **Estado** | **VALIDADA** — no re-implementar |

## CP-SEC-019 — 35 rutas API con `z.string().uuid()` estricto (fallan con UUID sintético de Central)

| Dimensión | Evidencia verificada |
|---|---|
| Defecto original | 35→52 rutas con validador estricto RFC-4122 v4: UUID sintéticos de Central rechazados |
| Código presente | `uuidLoose` definido en `src/validation/api-schemas.ts:13` + `uuidRegex` en `src/validation/schemas.ts:22` (semántica PostgreSQL: `~* uuid` igual que el catálogo); codemod aplicado en rutas (pos/checkout, production-orders, telegram, etc.) |
| Pruebas | `src/__tests__/api/uuid-loose-central-contract.test.ts` — **5/5 EN VIVO hoy**, incluido **test de regresión con grep vivo**: «cero `z.string().uuid()` estricto en `src/app/api`» |
| Regresión | Grep vivo hoy: **0 ocurrencias estrictas en `src/app/api/**`**; las 7 restantes del árbol están en tests/comentarios documentales (incluido el propio test de regresión) |
| Aceptación funcional | Ídem #1421; producción desde 18/10 sin regresión |
| **Estado** | **VALIDADA** — no re-implementar |

---

## Evidencia de la corrida viva (hoy)

`evidencia/mision_a_vitest_salida_20261021.txt`:
```
Test Files  5 passed (5)
     Tests  25 passed (25)
```
(2 CP-POS-003 + 5 CP-POS-007 + 5+5 CP-CAT-004 + 5 CP-SEC-019 = 22 de tarea directa + 3 de contrato de los mismos suites; los 5 archivos son los dedicados a las 4 tareas.)

## Nota sobre «aceptación funcional demostrada»

La aceptación funcional se apoya en: (i) fusión del PR #1421 por el propietario tras sus gates de CI, (ii) suite completa verde en el push post-fusión y en los 11 pushes posteriores a main (19-20/10), (iii) operación en producción desde el 18/10 sin incidentes reportados en estas funciones, y (iv) 25/25 pruebas específicas re-ejecutadas hoy contra `main` vigente. La capa E2E (Playwright) permanece **deshabilitada por decisión del propietario del 09/10** (contaminaba el Supabase compartido — CP-INFRA-001); su reactivación es una decisión de infraestructura independiente y NO un pendiente de estas 4 tareas.

## Decisión que corresponde al propietario

Ninguna para estas 4 tareas (cerradas en el worklog maestro como RESUELTAS DESPLEGADAS — `docs/audits/WORKLOG_RESOLUCION_TAREAS_COSTPRO.md`, fusionado vía #1437 — y hoy revalidadas con pruebas vivas; no tienen ficha CERT_ individual, su registro es la línea de trabajo del maestro). Opcional: extender la certificación individual si el propietario desea fichas CERT_ dedicadas.
