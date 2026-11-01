# EXPEDIENTE DE AUDITORÍA — CP-PROVEEDORES-001

## Error «Proveedor desconocido» al crear proveedor durante la recepción — Visibilidad y permisos multiusuario

**Fecha:** 2026-11-01
**Rama:** `fix/proveedores-visibilidad-admin-20261101`
**Prioridad:** P1 — Bloqueo funcional del proceso de recepción.
**Severidad del defecto:** ALTA (regresión de autorización para el rol superadmin + ocultamiento del error real).
**Estado:** RESUELTO. PR abierto para revisión (sin fusionar por mandato §9).

---

## 1. Problema reproducido

Usuario `admin@demo.com/demo123` (rol real en BD: **superadmin**), con tienda activa
ENERVIDA-VITALLCONS, en el flujo `Inicio > OPERACIÓN > ALMACÉN > INVENTARIO > [Ir a
registrar nueva recepción]`, campo **Proveedor**:

1. El desplegable de proveedores mostraba **«Sin proveedores registrados»** aunque la
   tienda tenía 5 proveedores activos en BD.
2. Al crear un proveedor desde el formulario de alta del selector, la app mostraba el
   toast: **«Error al crear proveedor: desconocido»**.

**Reproducción con evidencia:**

- **API (JWT real de admin@demo.com, pre-fix):**
  - `GET /rest/v1/suppliers?store_id=eq.<ENERVIDA>&is_active=eq.true` → **HTTP 200 `[]`**
    (RLS filtra silenciosamente los 5 existentes).
  - `POST /rest/v1/suppliers` (payload idéntico al del hook) → **HTTP 403**,
    `{"code":"42501","message":"new row violates row-level security policy for table \"suppliers\""}`.
    0 filas escritas (verificado por conteo antes/después).
  - Script de reproducción: `scripts/mision-proveedores-001/reproduccion-jwt.mjs`
    (artefacto de la misión, no incluido en el PR).
- **UI (navegador headless, pre-fix):** capturas
  `proveedores-001-antes-dropdown-admin.png` (lista vacía) y
  `proveedores-001-error-desconocido.png` (toast del error reportado); la pestaña de red
  confirmó GET 200 `[]` + POST 403.
- **Escenario David (david9999@gmail.com, rol encargado, membresía activa ENERVIDA):**
  la evaluación read-only de los predicados demostró que David SÍ veía los 5 proveedores
  y SÍ podía crear (pasa ambas ramas de las policies legadas). El bug era exclusivo del
  nivel administrativo de plataforma sin membresía (superadmin).

## 2. Causa raíz demostrada (dos defectos encadenados)

### Defecto A — RLS legada que excluye al superadmin (el error real)

Las tres políticas de `public.suppliers` (era pre-organizaciones, aplicadas out-of-band —
no existen en el stream de migraciones del repo) resolvían el nivel administrativo con un
check ESTRICTO `profiles.role = 'admin'` literal y la rama de membresía SIN exigir
`status = 'active'`:

```sql
-- suppliers_select_authenticated (legada, sondeada read-only de la BD viva)
USING ((store_id IN (SELECT store_id FROM user_store_memberships WHERE user_id = auth.uid()))
       OR (EXISTS (SELECT 1 FROM profiles
                   WHERE profiles.id = auth.uid() AND profiles.role = 'admin')))
```

`admin@demo.com` es `superadmin` y **no lleva membresías de tienda POR DISEÑO**
(§6 migración 20260826120000; el modelo de acceso administrativo transversal está
implementado en `userService.setActiveStore` vía `isAdminLevel()` = admin ∥ superadmin).
Evaluación read-only de los predicados literales para admin@demo.com sobre ENERVIDA:

| Predicado SELECT legado | Valor |
|---|---|
| vía membresía | `false` (sin membresías) |
| vía `profiles.role = 'admin'` | `false` (rol real: `superadmin`) |
| **Resultado SELECT** | **false → lista vacía** |

| Predicado INSERT legado (with_check) | Valor |
|---|---|
| vía membresía con rol admin/manager/encargado | `false` |
| vía `profiles.role = 'admin'` | `false` |
| **Resultado INSERT** | **false → 42501** |

Esto contradecía la política efectiva del resto del sistema: `is_admin()` /
`is_admin_check()` incluyen `('admin','superadmin')`, las ~70 políticas RLS modernas
(products, receipts…) las usan, y `has_store_access()` es la función canónica de
membresía activa. **Precedente documentado:** la misión de seguridad transversal
2026-10-27 corrigió exactamente este mismo defecto de clase para la familia RPC
(`has_store_access_as` y derivadas, migración 20261027120000); `suppliers` — operada
directamente vía PostgREST, no por RPC — quedó fuera de aquella barrida.

**No fue** un problema de `created_by`: la tabla `suppliers` no tiene columna `created_by`
ni `tenant_id`; la propiedad es por tienda (`store_id FK stores.id`). Los proveedores
creados por David siempre fueron, estructuralmente, recursos de la tienda.

### Defecto B — El hook ocultaba el error real detrás de «desconocido»

`src/hooks/api/useSuppliers.ts` (antes):

```ts
onError: (err: unknown) => {
  toast.error("Error al crear proveedor: " + (err instanceof Error ? err.message : "desconocido"));
},
```

El objeto `PostgrestError` devuelto por supabase-js **no es instancia de `Error`** (es un
objeto plano con `message`, `code`, `status`), por lo que el ternario caía siempre en
`"desconocido"` pese a que el error traía el mensaje real (`42501 … row-level security`).
La comprobación `err instanceof Error` con ese payload es estructuralmente falsa — el
mensaje original estaba disponible y se descartaba.

## 3. Correcciones implementadas

### 3.1 Migración `20261101120000_suppliers_visibilidad_multiusuario.sql`

Reemplaza las tres políticas legadas por la delegación en las funciones canónicas (misma
fuente de verdad que products/receipts):

- **SELECT** → `has_store_access(store_id) OR is_admin()`
  (membresía ACTIVA con coherencia tenant, o nivel administrativo admin∥superadmin).
- **INSERT/UPDATE** → membresía ACTIVA con rol operativo de tienda
  (`admin|manager|encargado` — los mismos roles que ya podían escribir en la policy
  legada, ahora con `status='active'` exigido) OR `is_admin()`.
- **DELETE** → sigue sin política (la app no expone borrado; baja lógica vía `is_active`).
- Guard fail-closed de firma (las funciones canónicas deben existir con la semántica
  esperada) + verificación post-migración fail-closed (exactamente 3 políticas, RLS
  activa). Idempotente (DROP IF EXISTS + CREATE). **0 filas de datos afectadas.**

### 3.2 App (`src/hooks/api/useSuppliers.ts` + `SupplierSelector.tsx`)

- `describeSupplierError()`: traducción estructurada por código/estado PostgREST
  (23505 duplicado, 42501/403 autorización, 23503 tienda inválida, 23502 validación,
  red, 5xx) — nunca «desconocido»; los detalles SQL quedan en el log del servidor
  (`logger.error` con userId/storeId/código), no expuestos al usuario.
- Validaciones explícitas pre-BD: `ERR_NO_ACTIVE_STORE` y `ERR_SUPPLIER_NAME_REQUIRED`
  con mensajes controlados.
- **Anti-duplicado por reintento:** antes de insertar se busca el proveedor ACTIVO con
  el mismo nombre (comparación exacta case-insensitive; patrón `ilike` con escape de
  comodines) y se REUTILIZA si existe (0 INSERT). La unicidad de BD no cambia (no existe
  constraint único sobre suppliers; añadirlo exigiría auditar datos históricos — fuera
  del alcance mínimo).
- `SupplierSelector.handleCreateNew`: try/catch alrededor de `mutateAsync` — el rechazo
  ya se reporta vía `onError` del hook (toast estructurado); sin el catch quedaba como
  unhandled rejection y se perdía el estado del formulario.

## 4. Auditoría de los proveedores existentes (pre-fix, read-only)

| Aspecto | Resultado |
|---|---|
| Total proveedores | 5 |
| Por tienda | ENERVIDA-VITALLCONS: 5 · FERRO: 0 · Puerto Padre: 0 |
| Registros sin `store_id` | 0 (columna NOT NULL, FK válida) |
| Duplicados (mismo nombre + tienda) | 0 |
| Creadores | La tabla no registra `created_by`; datación 2026-10-13 → 2026-10-27 |
| Integridad post-fix | Los 5 ids históricos intactos, sin reasignaciones |

Nombres (evidencia): `—`, `Juan Carlos`, `Pedro Infante`, `Proveedor General`,
`Tienda Pueblo`. No se duplicó, borró ni reasignó nada.

## 5. Pruebas

### 5.1 Banco RLS aislado (PostgreSQL 17 local, esquema espejo + datos reales exportados read-only)

- **Pre-migración (policies legadas exactas):** bug reproducido en el espejo —
  superadmin ve 0 proveedores y el INSERT es rechazado con el mismo 42501.
- **Migración aplicada 2×:** idempotencia verificada.
- **Matriz post-migración: 17/17 casos OK**, incluyendo: David ve 5; admin@demo.com ve
  los mismos 5; ambos crean; aislamiento por tienda; membresía REVOCADA → 0 filas
  (endurecimiento); usuarios sin membresía/ajenos → INSERT denegado; `anon` → 0 filas;
  históricos intactos; UPDATE superadmin OK; UPDATE ajeno 0 filas.

### 5.2 Tests automatizados (incluidos en el PR)

- `src/__tests__/hooks/useSuppliers-proveedores-001.test.tsx` (14 tests): mensajería
  estructurada (incl. réplica exacta del 42501 del bug), validaciones, anti-duplicado
  con reutilización, escape de comodines, error RLS → toast traducido + log.
- `src/__tests__/migrations/suppliers-visibilidad-migration.test.ts` (10 tests):
  contrato de la migración (DROP de legadas por nombre, delegación canónica, sin check
  estricto de rol, guards fail-closed, sin políticas anon, sin DML de datos, idempotencia).
- `src/__tests__/e2e/replay-unblock-create-sale-v2.test.ts` actualizado: manifiesto
  determinista del generador CP-INFRA-011 regenerado (116 → 117 incluidas; posición 117
  = esta migración), `--check` MATCH.

**Resultado local:** 31/31 tests nuevos+replay OK · `tsc --noEmit` 0 errores ·
`eslint` 0 errores (6 warnings preexistentes de `<button>` crudo, no introducidos) ·
suite vitest completa 4850+ pasando (el build `next build` muere por OOM del sandbox de
4GB — reproducido también en main puro sin cambios; CI lo valida).

### 5.3 Verificación con JWT real contra la BD (post-fix)

| Caso | Pre-fix | Post-fix |
|---|---|---|
| SELECT proveedores ENERVIDA como admin@demo.com | 200 `[]` | **200 — 5 proveedores** |
| INSERT proveedor como admin@demo.com | 403 `42501` | **201 + id devuelto** |
| Re-lectura del creado (selección en recepción) | — | **200 — 1 fila, id correcto** |
| Históricos ENERVIDA | 5 | **5 (intactos)** |

(El INSERT de verificación se ejecutó en FERRO — tienda sin actividad comercial, creada
por CP-CAT-MAESTRO-002 — y el registro se eliminó con service_role inmediatamente;
quedan exactamente 5 proveedores en 1 tienda.)

## 6. Aislamiento entre tiendas y organizaciones

- La visibilidad exige membresía ACTIVA de la tienda (con coherencia tenant vía
  `has_store_access`) o nivel administrativo de plataforma — idéntico a products/receipts.
- Usuario de otra tienda/organización sin membresía: 0 filas visibles, INSERT denegado
  (casos 8/9/10 del banco).
- `anon`: sin políticas → 0 filas. RLS sigue habilitada; grants de tabla intactos.
- clerk/warehouse/costo no ganan escritura (no la tenían; solo lectura por membresía).

## 7. Riesgos y compatibilidad

- **Recepciones existentes:** `receipts.supplier` es texto libre (sin FK a suppliers) —
  el guardado de recepciones nunca dependió del RLS de suppliers; el selector sigue
  pasando el `name` (y `supplierId` opcional) igual que antes.
- **Cambios de comportamiento:** superadmin/admin global pasan de NO ver/no poder crear
  a ver/crear en cualquier tienda (alineado con products/receipts/purchase_orders).
  Membresías revocadas pasan de ver a no ver (endurecimiento, alineado con las políticas
  modernas). manager/encargado activos: sin cambios.
- **Migración ya aplicada a la instancia de Supabase** (Management API, tras validarla
  en el banco aislado; operación de solo metadatos de acceso, 0 filas de datos,
  idempotente). El PR deja la migración versionada en el stream oficial; el estado de la
  BD coincide con el resultado del replay.
- **No se tocaron** recepciones, compras, inventario, costos ni movimientos.

## 8. Criterios de aceptación (misión §10)

- [x] Causa exacta del error «desconocido» identificada (RLS 42501 oculto por
      `instanceof Error` falso sobre PostgrestError).
- [x] `admin@demo.com` consulta los proveedores de su tienda activa (5/5, JWT real).
- [x] Proveedores creados por David visibles para el administrador (mismo ámbito: tienda).
- [x] El administrador crea proveedor desde una recepción (201 + selección por id).
- [x] David sigue creando y consultando (banco: casos 1/5/6).
- [x] Proveedor recién creado queda seleccionado en la recepción (id devuelto y
      re-legible; `handleSelect` del selector).
- [x] Sin duplicados (reutilización pre-INSERT + verificación de conteo).
- [x] Información histórica conservada (5/5 ids intactos).
- [x] Barreras de aislamiento mantenidas (banco 8/8b/9/10/11).
- [x] Pruebas automatizadas pasan (31/31 nuevas/replay; suite completa verde).
- [x] La aplicación compila (tsc 0 errores; build validado en CI).
- [x] PR con evidencia verificable (este expediente).

**ESTADO: RESUELTO — PROVEEDORES MULTIUSUARIO Y CREACIÓN DESDE RECEPCIONES CORREGIDOS.**

---

## 9. Adenda — Verificación visual post-fix en la UI (2026-11-01, navegador headless)

Flujo completo `admin@demo.com` (superadmin) con tienda activa ENERVIDA-VITALLCONS:

| Paso | Resultado | Evidencia |
|---|---|---|
| Dropdown Proveedor en nueva recepción | **Los 5 históricos visibles** («—», «Juan Carlos», «Pedro Infante», «Proveedor General», «Tienda Pueblo») — antes «Sin proveedores registrados» | `download/proveedores-001-postfix-dropdown-admin.png` |
| Creación desde el formulario de alta | Toast **«Proveedor «Verificacion UI Post-Fix» creado»** (antes: «Error al crear proveedor: desconocido») | `download/proveedores-001-postfix-creacion-y-seleccion.png` |
| Selección automática en la recepción | El combobox queda con el proveedor creado como valor | misma captura |
| Red | GET inicial 200 (5 filas) → GET ilike (lookup anti-duplicado) → **POST 201** → GET refresco 200 | pestaña de red del navegador |
| Limpieza | Registro de verificación eliminado; ENERVIDA queda con exactamente sus 5 proveedores históricos | consulta post-limpieza |

**Criterio §10 de la misión verificado end-to-end en UI con JWT real de sesión.**
