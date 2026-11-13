# EXPEDIENTE DE AUDITORÍA — CORRECCIÓN E INTEGRACIÓN DE TRABAJADORES CON NÓMINAS
**COSTPRO 4 MULTITIENDA · RECURSOS HUMANOS → Trabajadores y Comisiones → Nóminas**

- **Fecha:** 2026-11-13 · **Rama:** `fix/trabajadores-nominas-20261113` (base `main` bbbf27fde)
- **Alcance:** Auditoría del modelo de trabajadores ↔ nóminas, corrección de la causa raíz del caso *Dup Test*, selector de trabajadores de búsqueda dinámica e integración «Agregar a Nómina» desde Trabajadores.
- **Independencia:** misión del segundo agente; sin interferencia con `feat/estados-financieros-20261113` (primer agente: solo añade un informe .md, verificado). Sin migraciones ni despliegues en producción.

---

## 1. DIAGNÓSTICO (interfaz / lógica / persistencia / permisos)

### 1.1 LÓGICA — causa raíz del error de incorporación (Problema B)
`POST /api/payrolls` derivaba la tienda del documento **SOLO** de `profiles.active_store_id`, ignorando la tienda que la UI estaba operando (`user.activeStoreId`). El perfil de `admin@demo.com` apunta a **ENERVIDA-VITALLCONS** (tienda donde NO tiene membresía activa — huérfana por una membresía revocada), mientras la UI opera **COSTPRO (Prueba)**. Resultado: la nómina se intentaba crear en ENERVIDA y el trabajador de COSTPRO caía en `ERR_WORKER_NOT_ELIGIBLE` (422) — **la operación nunca se completaba**.

**Reproducción documentada** (`scripts/repro-dup-test.mjs`, flujo HTTP exacto del usuario — sign-in GoTrue → GET workers con tarifa → POST payroll con payload idéntico al de `PayrollEditor`):

```
HTTP 422 {"error":"El trabajador no pertenece a la tienda o no está activo",
          "rpc_error":"ERR_WORKER_NOT_ELIGIBLE: 92cb3140-… (debe pertenecer a la tienda y estar activo)"}
```

Forense (`audit_logs` de producción): 12:10 CHANGE_ACTIVE_STORE→COSTPRO · 12:13 SET_WORKER_SALARY_RATE (Dup Test) · 12:33 CREATE_VALE_SALIDA · 12:36 CHANGE_ACTIVE_STORE→ENERVIDA · **CERO CREATE_PAYROLL** → confirmación de que la nómina jamás se creó.

### 1.2 INTERFAZ — causa raíz del selector inservible (Problema A)
Dos defectos apilados:
1. `GET /api/workers` devuelve `id` como identidad, pero `NominasTab` consumía `worker_id` (undefined) → el `<select>` original renderizaba options sin value → **imposible incorporar a NINGÚN trabajador** (toast «Selecciona un trabajador» en todos los intentos).
2. Aunque hubiera funcionado: lista estática de 53 trabajadores sin búsqueda, sin desambiguación (existen **7 trabajadores "Dup Test"** reales en COSTPRO (Prueba), solo 1 con tarifa), sin elegibilidad por período, inoperable en móvil.

### 1.3 PERSISTENCIA — datos, no defectos de esquema
- 7 trabajadores «Dup Test» duplicados (CIs distintos, creados 2026-09-27) — histórico del propietario, NO se alteraron.
- Solo `92cb3140-0c47-4c8a-9c93-c9bec0b6f909` tiene tarifa: 1000 CUP/día desde 2026-11-01 (vigente).
- `profiles.active_store_id` huérfano (ENERVIDA sin membresía) — no se alteró: el fix lo hace irrelevante para nóminas.
- RLS y constraints CORRECTOS: `workers_store_ci_unique_idx` (CI único por tienda), `payroll_items` UNIQUE (payroll_id, worker_id), tarifas con ventana de vigencia sin solapes (`ERR_RATE_OVERLAP`).

### 1.4 PERMISOS — SIN defecto (verificado)
- `has_store_access_as()` cubre superadmin (`is_admin_check`) y membresías activas.
- `current_user_store_ids()` tiene bypass superadmin (migración 20261026160000) → RLS de `payrolls`/`worker_salary_rates` funciona para el superadmin.
- Los RPC `create_payroll`/`update_payroll`/`set_worker_salary_rate` autorizan con `has_store_access_as(v_caller_uid, store)` — el fix **no relaja nada**: un `store_id` ajeno devuelve 403 `ERR_UNAUTHORIZED`.
- **Conclusión: NO se necesita migración** — la corrección es API + frontend.

---

## 2. CORRECCIONES

### 2.1 Backend
| Archivo | Cambio |
|---|---|
| `src/app/api/payrolls/route.ts` | POST acepta `store_id` explícito opcional (uuidLoose) del body — la tienda operada por la UI; autorización intacta en el RPC (`has_store_access_as`); fallback a `profiles.active_store_id` si el body no lo trae (compatibilidad scripts legacy). |
| `src/app/api/workers/route.ts` | GET: `q` (búsqueda insensible a mayúsculas/acentos — normalización NFD — sobre nombre, apellidos, CI, expediente, cargo, categoría, área), `period_start`/`period_end` (tarifa vigente evaluada al PERÍODO de la nómina con la misma regla de `fn_payroll_validate_items`, no contra hoy), expone `rate_valid_from`/`rate_valid_to`/`has_any_rate` (distingue «sin tarifa configurada» de «tarifa no vigente para el período»), alias `worker_id ≡ id` (fix causa raíz nº2). |

### 2.2 Frontend
| Archivo | Cambio |
|---|---|
| `nominas/WorkerSearchSelect.tsx` (nuevo) | Selector de búsqueda dinámica tipo selector de productos (debounce 200ms): identidad completa por resultado (nombre, CI, expediente, cargo, categoría, área, estado, tarifa + unidad horaria/diaria), inelegibles deshabilitados CON explicación (inactivo / ya agregado / sin tarifa / tarifa no vigente para el período), teclado ↑↓/Enter/Esc, móvil (targets ≥44px, lista en flujo), al seleccionar limpia y conserva el foco para agregar otro. |
| `nominas/NominasTab.tsx` | `<select>` estático eliminado → `WorkerSearchSelect`; carga TODOS los estados (no oculta inactivos); el editor re-consulta trabajadores al cambiar el período (elegibilidad real); POST con `store_id` explícito; props `openPayrollId`/`onOpenPayrollConsumed` para el flujo desde Trabajadores. |
| `nominas/AddToPayrollModal.tsx` (nuevo) | Incorporación desde Trabajadores: elegibilidad explicada → nómina borrador existente (PUT — añade línea conservando las previas) o nueva (POST con store explícito + idempotency_key) — **mismo servicio backend que el editor**; ya presente en el borrador → informado y bloqueado; estimación de devengado; `onDone` solo tras guardado REAL → navega a la pestaña Nóminas y abre el editor en esa nómina. |
| `WorkersView.tsx` | Botón «Agregar a Nómina» (FilePlus2, esmeralda) por fila en escritorio y móvil + estado del modal + NominasTab con apertura de nómina. |

### 2.3 Backend NO tocado (por diseño)
RPCs, RLS y migraciones del módulo SC-4-06 (20261112180000): **sin cambios** — la validación del servidor (`fn_payroll_validate_items`: elegibilidad, tarifa vigente al período, duplicados, totales) sigue siendo la única fuente de verdad.

---

## 3. PRUEBAS Y RESULTADOS

| Prueba | Resultado | Evidencia |
|---|---|---|
| Reproducción del error original (producción, flujo HTTP del usuario) | HTTP 422 ERR_WORKER_NOT_ELIGIBLE, sin escrituras | `repro-error-original.txt` |
| Caso Dup Test corregido (producción, ciclo auditable) | **14/14 PASS** — 201 NOM-000001-2026, snapshot 1000 CUP/día, 5 días → 5000 CUP, duplicado 409, anulación con motivo (queda voided como evidencia) | `verify-dup-test-fixed-14de14.txt` |
| Verificación integral BD aislada (selector + causa raíz + seguridad multitienda + net-zero) | **26/26 PASS** | `verify-trabajadores-nominas-aislado-26de26.txt` |
| E2E browser real (proyecto 'creation', BD aislada) | **2/2 PASS** (S1 selector + S2 Agregar a Nómina con navegación) | `regresion-completa.txt` |
| Tests unitarios nuevos | **47/47** (elegibilidad 8, selector 18, modal 6, rutas 15) | — |
| Suite vitest FULL | **5956 passed** / 95 skipped pre-existentes | `regresion-completa.txt` |
| tsc / eslint | 0 errores / 0 errores | `regresion-completa.txt` |
| Gates CI (ts-security, check-writers, sql-checks) | ALL PASSED | `regresion-completa.txt` |
| data-hygiene-guard (residuos E2E) | PASS — net delta = 0 | `regresion-completa.txt` |

### Matriz de seguridad verificada (26/26, extracto)
- Legado sin `store_id` (perfil divergente) → 422 ERR_WORKER_NOT_ELIGIBLE (reproducción en aislado).
- `store_id` de la tienda operada → 201 (el fix).
- Encargado de OTRA tienda → POST a store1 → **403 ERR_UNAUTHORIZED** (autorización intacta).
- `store_id` no-uuid → 400 zod (sin tocar el RPC).
- RPC directo con anon (sin JWT) → **401 permission denied** (EXECUTE revocado a anon).
- `set_worker_salary_rate` sobre trabajador ajeno → ERR_UNAUTHORIZED.
- RLS cross-store: encargado de store2 NO lista trabajadores de store1.
- Nómina confirmada NO acepta incorporaciones (ERR_NOT_DRAFT); duplicado en documento → 409; sin tarifa → 422; tarifa vencida → 422; trabajador de otra tienda → 422.
- Actores SIEMPRE del JWT (`p_user_id`), nunca del body; items solo identificadores y cantidades.

---

## 4. ARCHIVOS MODIFICADOS
- `src/app/api/payrolls/route.ts` (POST: store_id explícito)
- `src/app/api/workers/route.ts` (q + período + ventana de tarifa + alias)
- `src/components/views/terminal/views/workers/nominas/WorkerSearchSelect.tsx` (nuevo)
- `src/components/views/terminal/views/workers/nominas/AddToPayrollModal.tsx` (nuevo)
- `src/components/views/terminal/views/workers/nominas/NominasTab.tsx`
- `src/components/views/terminal/views/workers/WorkersView.tsx`
- `src/__tests__/lib/worker-eligibility.test.ts` (nuevo)
- `src/__tests__/components/worker-search-select.test.tsx` (nuevo)
- `src/__tests__/components/add-to-payroll-modal.test.tsx` (nuevo)
- `src/__tests__/api/payrolls-workers-integration-route.test.ts` (nuevo)
- `scripts/e2e/verify-trabajadores-nominas.mjs` (nuevo, declarado en writers.manifest.json)
- `e2e/creation/nominas-worker-selector.spec.ts` (nuevo)
- `scripts/lib/writers.manifest.json`
- `docs/audits/TRABAJADORES-NOMINAS-20261113/*` (este expediente)

## 5. NOTAS DE SEGURIDAD
- **Sin migraciones** — superficie SQL sin cambios (verificado por ci-gate-sql-checks).
- Trust boundary intacto: totales/tarifas/identidad SIEMPRE servidor; el selector solo es UX.
- Escritura E2E únicamente contra la BD aislada CostproE2E (guard fail-closed CP-INFRA-011 verificado en cada corrida).
- Los scripts del sandbox (`repro-dup-test.mjs`, `verify-dup-test-fixed.mjs`, `inspect-dup-test.mjs`) son read-only + ciclo documental auditable (nómina de verificación anulada con motivo, jamás borrado físico, políticas intactas).
- El servidor queda con el `.env` principal del propietario activo (health 200 verificado).
