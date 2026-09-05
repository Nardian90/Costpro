# W9.5 — B-8 · MODELO C · 01-policy-matrix.md
# ESPECIFICACIÓN DE POLÍTICA CONGELADA (fuente normativa única)
# fecha: 2026-09-05 · baseline: c57e8de1

## 0. DECISIÓN DE PRODUCTO EJECUTADA

La decisión pendiente del B-8 (GATE 12-D, BACKLOG / DESIGN DECISION REQUIRED)
queda resuelta por el comitente: **implementar MODELO C** — autorización
diferenciada por operación:

* **NIVEL 1 — POS Undo (operativo)**: corrección inmediata de la venta que el
  usuario acaba de realizar, vía flujo POS (toast "Deshacer", MM-9).
* **NIVEL 2 — Reversión administrativa**: reversión de cualquier venta de la
  tienda (o de todas las tiendas para admin global), vía SalesHistory /
  ReverseDocumentModal → `/api/reverse` → `reverse_transaction_v2`.

## 1. RESOLUCIÓN 30s vs 24h (§1 del spec — con evidencia, NO silenciosa)

| Referencia | Fuente | Qué describe | Veredicto |
|---|---|---|---|
| **30 segundos** | `usePOSCheckout.ts:323` (`duration: 30000`) + comentarios `POS-2 MM-9`; toast "Tienes 30s para deshacerla" | Ventana de la operación POS Undo sobre la venta recién creada. ÚNICA lógica temporal existente en código activo. Hoy solo client-side. | **Se congela como ventana server-side de POS Undo = 30 s** medida desde `transactions.created_at`. Es la "ventana POS" de la matriz del spec. |
| **24 horas** | `knowledge/help/03-referencia/02-roles-permisos.md` (doc PREVIA, 6 roles): "Anular ventas (<24h)" clerk/encargado/manager/admin; "(>24h) SOLO admin"; "clerk: puede anular sus ventas dentro de 24h" | Regla temporal de la operación de ANULACIÓN DESDE HISTORIAL (antecesora de la reversión administrativa). **Nunca implementada** en DB/API (auditorías B-2/B-8: cero lógica temporal server-side). | **SUPERSEDADA.** La doc vigente (7 roles) eliminó la ventana; ningún código activo la implementó jamás. Se registra como antecedente histórico. NO se resucita (resucitarla inventaría una restricción nueva sin precedente en capas activas). |
| Sin ventana | `roles-y-permisos.md` vigente (7 roles): `canVoidTransactions` admin/manager/encargado/clerk, sin calificador temporal; `reverse_transaction_v2` live sin chequeo temporal | Política documentada + implementada actual de la reversión administrativa. | **Se congela: Reversión administrativa SIN restricción temporal** (admin: "sin restricción" según matriz del spec; manager/encargado: celda "política" → resuelta a sin-restricción por doc vigente + comportamiento vivo). |

Las dos ventanas describen **dos operaciones distintas** bajo MODELO C; la
contradicción aparente se disuelve al separarlas. Cada operación conserva la
ventana que su evidencia propia documenta. Discrepancia REGISTRADA (este
archivo) y la doc previa recibe banner de supersesión.

## 2. MATRIZ DE AUTORIZACIÓN CONGELADA (celdas ambiguas resueltas)

Fuentes extraídas y congeladas: doc vigente (`roles-y-permisos.md`: Terminal
POS y `canCreateSales` = admin/manager/encargado/clerk; warehouse/usuario/
costo sin POS; costo "sin acceso a POS"); doctrina de `src/lib/roles.ts`
(rol global `admin` = transversal; `manager`/`encargado`/`clerk` = roles de
MEMBERSHIP por tienda; `canManageStore` = patrón de operación administrativa);
precedente `SupervisorAuthModal` (PIN validado contra `membership.role IN
(admin, manager)`); auditoría B-8 (H2b: la DB nunca evaluó rol; gate UI
muerto); matriz del spec §3.

### NIVEL 1 — POS UNDO (`void_transaction`, única vía: flujo POS)

| Rol (fuente del rol) | Propia ≤30s | Ajena | Misma tienda | Otra tienda | Ventana |
|---|---|---|---|---|---|
| admin global (`profiles.role='admin'`) | ✓* | ✗ | ✓ | ✗ (matriz §3) | 30 s |
| membership `admin` (por tienda) | ✓ | ✗ | ✓ | ✗ | 30 s |
| membership `manager` | ✓ | ✗ | ✓ | ✗ | 30 s |
| membership `encargado` | ✓ | ✗ | ✓ | ✗ | 30 s |
| membership `clerk` | ✓ | ✗ | ✓ | ✗ | 30 s |
| membership `warehouse` / `usuario` / `costo` | ✗ | ✗ | ✗ | ✗ | — |

\* CORRECCIÓN CON EVIDENCIA (pre-implementación): la lectura literal "admin
global SIN membership no puede POS-undo" crearía una TRAMPA FUNCIONAL:
`create_sale_v2` autoriza con `has_store_access_as` (admin global transversal,
verificado en vivo), de modo que el admin podría CREAR la venta en cualquier
tienda pero no DESHACER su propia venta de hace segundos. Se aplica el
principio transversal ya confirmado por el asterisco de la matriz (alcance
admin global, probado B-2 P5): **el admin global puede POS-undo SU PROPIA
venta en cualquier tienda** — ownership + ventana 30s + estado completed
siguen siendo obligatorios. La celda "Otra tienda ✗" de las filas POS protege
a los actores con alcance por-membresía (clerk/manager/encargado/etc.: sin
membership activa en la tienda de la tx → DENIED); para el admin global "otra
tienda" no está fuera de su alcance de acceso (principio * ya confirmado).

Resoluciones de celdas "según política":
* **"Otra persona" para admin/manager/encargado = ✗.** §1 del spec: POS Undo
  existe para "corregir inmediatamente una venta que acaban de realizar" —
  estrictamente propia. Anular venta ajena es operación administrativa →
  Nivel 2 (que estos roles ya poseen). El flujo POS solo ofrece la última
  venta de la sesión (propia); server-side se añade `seller_id = actor`
  para TODOS los roles.
* **clerk propia = ✓.** clerk es operador POS (`canCreateSales`, Terminal POS
  ✓ en doc vigente); la doc previa le reconocía la anulación de SUS ventas;
  MM-9 construyó el undo para operadores POS (clerk incluido); quitarlo
  rompería la corrección inmediata del operador más común.

Reglas server-side de `void_transaction` (en orden):
1. `FOR UPDATE` como primera lectura relevante (se mantiene).
2. Actor = `auth.uid()` (para no-service_role; `p_user_id` ignorado — se
   mantiene). service_role puede pasar identidad de servicio controlada.
3. STORE ACCESS: `has_store_access_as(actor, tx.store_id)` (se mantiene —
   capa de membresía/acceso, NUNCA sustituye al rol).
4. Estado: `voided` → `ERR_ALREADY_VOIDED`; `<> 'completed'` →
   `ERR_INVALID_TRANSITION` (pre-chequeo explícito; endurecimiento B-9a).
5. OPERATION AUTHORIZATION (NUEVO, función normativa única
   `can_pos_undo_transaction(tx_id, actor)`):
   - `tx.seller_id = actor` (ownership estricto);
   - `tx.created_at >= now() - interval '30 seconds'` (ventana server-side);
   - `tx.status = 'completed'`;
   - rol operativo POS: `profiles.role='admin'` (transversal, ver *) OR
     membership ACTIVA en `tx.store_id` con rol ∈ (admin, manager, encargado, clerk).
   Si es false → `ERR_UNAUTHORIZED` (mensaje explica los 3 requisitos).

### NIVEL 2 — REVERSIÓN ADMINISTRATIVA (`reverse_transaction_v2` vía `/api/reverse`)

| Actor | Propia | Ajena | Misma tienda | Otra tienda | Ventana |
|---|---|---|---|---|---|
| admin global (`profiles.role='admin'`) | ✓ | ✓ | ✓ | ✓* | sin restricción |
| membership `admin` (por tienda) | ✓ | ✓ | ✓ | ✗ | sin restricción |
| membership `manager` | ✓ | ✓ | ✓ | ✗ | sin restricción |
| membership `encargado` | ✓ | ✓ | ✓ | ✗ | sin restricción |
| membership `clerk` / `warehouse` / `usuario` / `costo` | ✗ | ✗ | ✗ | ✗ | — |

\* Confirmado por la política vigente de admin global: `has_store_access_as`
(concede todas las tiendas), `canManageStore` (admin global → true),
doctrina `roles.ts` ("Ve y gestiona TODAS las tiendas… by design"), y prueba
en vivo B-2 P5. → El `*` de la matriz del spec se resuelve a **✓**.

Reglas:
* Ownership NO requerido (venta ajena ✓ dentro del alcance) — es la esencia
  de la operación administrativa.
- Ventana: sin restricción temporal (§1 de este archivo).
* Función normativa única `can_admin_reverse_transaction(actor, store_id)`:
  admin global OR membership activa con rol ∈ (admin, manager, encargado) en
  ESA tienda — espejo exacto de `canManageStore` llevado a la DB.
* Todo lo demás de `reverse_transaction_v2` se conserva (GATE 14 del B-8):
  SECURITY DEFINER, search_path `public,pg_temp`, `FOR UPDATE` primera
  lectura, guard de estados (`voided`→idempotente; `<>completed`→
  `ERR_INVALID_STATUS`), stock/WAC/pagos/auditoría/idempotencia.
* Identidad: `p_user_id` solo honrado para service_role (la API inyecta
  `session.user.id`); para llamadas de usuario, `auth.uid()`. El cliente no
  puede convertir actor en vendedor ni viceversa.

## 3. SEPARACIÓN RBAC vs MEMBERSHIP (§12)

* **STORE ACCESS** — "¿puede operar en esta tienda?" →
  `has_store_access_as` (admin global OR membresía activa). SIN CAMBIOS.
* **OPERATION AUTHORIZATION** — "¿puede realizar ESTA operación?" →
  `can_pos_undo_transaction` / `can_admin_reverse_transaction` (rol de
  membership en la tienda + ownership/ventana cuando corresponde). NUEVO.
* Un clerk PUEDE entrar a la tienda y POS-undo su venta recién hecha, pero NO
  puede reversar administrativamente ventas ajenas.

## 4. IDENTIDAD DEL ACTOR (§5)

* Nunca `p_user_id`/`seller_id` del frontend como identidad del actor.
* Actor efectivo = `auth.uid()` (usuario) o identidad de servicio estricta
  (service_role + `p_user_id` inyectado server-side por la API).
* `seller_id` de la transacción = sujeto propietario histórico (lo fija
  `create_sale_v2`); NO es modificable por el cliente.

## 5. AUDITORÍA (§16)

| Operación | acción (histórica, se conserva) | metadata (ADD, aditivo) |
|---|---|---|
| POS Undo | `VOID_SALE` | `operation='POS_UNDO'`, `old_status` (ya existía), `new_status='voided'`, `reason` |
| Reversión admin | `REVERSE_TRANSACTION_V2` | `operation='ADMIN_REVERSE'`, `old_status` (NUEVO), `new_status='voided'`, `reason`, `units_restored` |

Las etiquetas de acción históricas se conservan (continuidad de dashboards y
forense: 16 eventos históricos ya clasificados); la distinción operacional
exigida queda explícita en `metadata.operation`. Ambas acciones ya estaban
separadas (nunca compartieron etiqueta).

## 6. ALCANCE (fuera de B-8)

`/api/reverse` despacha 6 tipos (transaction/receipt/transfer/adjustment/
devolution/production_order). El gate de rol administrativo se aplica SOLO a
`type='transaction'` (venta → `reverse_transaction_v2`). Los demás tipos
(operaciones de almacén: recepciones, transferencias, ajustes, devoluciones,
producción) conservan su política vigente — extenderles MODELO C es backlog
(B-10 propuesto), no parte de la decisión ejecutada aquí.
