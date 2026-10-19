# EVIDENCIA — DT-03 / DECISIÓN B: matriz de acceso multi-tienda y verificación de aislamiento (2026-10-19)

**Proyecto:** COSTPRO 4 Multitienda · **BD viva:** Supabase `wthkddeleylijmonclxg` (tenant real de negocio: `Default Tenant` / `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`)
**Contexto:** el propietario CONFIRMÓ la Decisión B (2026-10-19): arquitectura multi-tenant conservada; single-tenant solo como descripción operativa; un mismo usuario puede tener acceso autorizado a dos o más tiendas; pertenencia a tenant ≠ permisos de acceso a tiendas.
**Método:** consultas READ-ONLY vía Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query`. Las pruebas de suplantación RLS se ejecutaron en bloques `BEGIN … SET LOCAL ROLE authenticated … ROLLBACK` (efecto neto cero: sin escrituras, sin DDL). Scripts reproducibles en `/home/z/my-project/scripts/dt03_*.js`; datos crudos en `raw/`.
**Garantía:** 0 escrituras de datos, 0 migraciones aplicadas, 0 cambios de permisos. El backfill propuesto NO se ejecutó.

---

## PASO 1-2 — Esquema real: funciones de autorización y políticas RLS (inspección viva, no solo migraciones)

### 1.1 Primitivas de autorización (definiciones VIVAS vía `pg_get_functiondef`)

| Función | Semántica verificada en vivo |
|---|---|
| `is_admin()` | `profiles.role = 'admin'` → TRUE. **No incluye superadmin ni tenant_admin.** El admin es GLOBAL: no está acotado por tenant. |
| `is_global_admin()` | Idéntica a `is_admin()` (mismo predicado `role = 'admin'`). |
| `has_store_access(store)` | NULL user/store → false. **Admin → TRUE para cualquier tienda (bypass global).** No-admin → membership activa Y (`p.tenant_id IS NULL OR s.tenant_id IS NULL OR p.tenant_id = s.tenant_id`) — **guard NULL-safe**: un perfil o tienda sin tenant no queda bloqueado; con ambos seteados y distintos, deniega. |
| `has_store_role(store, roles)` / `has_store_role_as(user, store, roles)` | Membership activa con rol específico. `has_store_role_as` además hace bypass para `role IN ('admin','superadmin')`. |
| `current_user_tenant_id()` | `profiles.tenant_id` del `auth.uid()`. NULL si el perfil lo es. |
| `current_user_store_ids()` | **Admin:** tiendas activas de SU tenant (`tenant_id = current_user_tenant_id()` — con tenant NULL devuelve array VACÍO). **No-admin:** tiendas con membership activa (independiente del tenant). |
| `is_admin_with_access(store)` | No-admin → delega en `has_store_access`. Admin → permite solo si la tienda es tenant-NULL o coincide con su tenant. **Inconsistencia estructural con `has_store_access`** (que da bypass total al admin): dos semánticas distintas para admin según la función usada. |
| `is_tenant_member(tenant)` | `p_tenant_id IS NOT NULL AND = current_user_tenant_id()` → **un perfil tenant-NULL NO obtiene permisos implícitos de tenant por esta vía.** |

### 1.2 Modelo de datos

- `profiles(id, email, role user_role, tenant_id NULLable, is_active, active_store_id, created_by, deleted_at, …)` — 30 perfiles vivos (no borrados).
- `user_store_memberships(user_id, store_id, role user_role, status membership_status{active,revoked}, UNIQUE(user_id,store_id))` — 43 filas (activas+revocadas). **Es la fuente canónica de acceso a tiendas.**
- `stores(id, name, tenant_id NULLable, is_active)` — 24 tiendas; solo `QA-H1-A` y `QA-H1-B` tienen tenant NULL.
- `tenants` — 8; el de negocio real es `Default Tenant` (8 tiendas: TIENDA CENTRAL COSTPRO, ENERVIDA-VITALLCONS, Puerto Padre VITALLCONS, pilotos y artefactos); los otros 7 son de pruebas/E2E.
- `user_role` enum: `{admin, superadmin, manager, clerk, warehouse, encargado, usuario, costo, tenant_admin}`.

### 1.3 Dos capas de políticas RLS que conviven (hallazgo estructural clave)

En `products` (y patrón análogo en las demás tablas de negocio) conviven:
1. **Capa legado (ungated):** `products_select_rls` = `EXISTS(membership activa en products.store_id)`. Sin tenant, sin admin, aplica SIEMPRE.
2. **Capa tenant (flag-gated):** `products_tenant_select` = `CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN tenant_id = current_user_tenant_id() AND (…) ELSE is_admin() OR has_store_access(store_id) END`.

PostgreSQL **OR-ea** todas las políticas SELECT aplicables al rol. Consecuencia verificada empíricamente (T6.1): activar `app.use_tenant_rls` **NO activa el aislamiento por tenant completo**, porque la capa legado sigue otorgando acceso por membership. El flag solo restringe lo que la capa legado no cubre (p. ej. el admin global pierde productos de otros tenants — T6.2). El middleware (`src/lib/rls-middleware.ts`) activa el flag por sesión solo si `USE_TENANT_RLS=true` (hoy ausente del `.env` → modo latente).

Además existe `products_public_read_anon` (SELECT TO `anon`: `is_active AND visible_en_tienda`) y `stores_select_anon` (`is_active`) → ver Hallazgo F3.

---

## PASO 3 — Matriz por usuario (30 perfiles vivos, consultados hoy)

`[tienda]` = tenant distinto del Default Tenant. Datos crudos: `raw/08_matriz_por_usuario.json`, resumen `raw/09_resumen_por_perfil.json`, linaje `raw/10_linaje_creacion.json` (los 30 perfiles tienen `created_by` NULL → todos self-signup o seed; la asignación de memberships no está auditada — Hallazgo F2).

| Usuario | Rol perfil | Tenant perfil | Tiendas autorizadas (memberships activas) | Categoría |
|---|---|---|---|---|
| admin@costpro.com | admin | Default Tenant | ENERVIDA-VITALLCONS | ADMIN GLOBAL |
| admin@demo.com | admin | Default Tenant | Puerto Padre VITALLCONS; ENERVIDA-VITALLCONS; TIENDA CENTRAL COSTPRO | ADMIN GLOBAL, MULTI-TIENDA(3) |
| adrianpompasantana@gmail.com | costo | Default Tenant | — | SIN MEMBERSHIP |
| almacen@demo.com | warehouse | Default Tenant | — | SIN MEMBERSHIP |
| belkis9999@gmail.com | encargado | Default Tenant | ENERVIDA-VITALLCONS; Puerto Padre VITALLCONS | MULTI-TIENDA(2) |
| cajero@demo.com | clerk | Default Tenant | — | SIN MEMBERSHIP |
| costo@demo.com | costo | WAC Test Tenant | — | SIN MEMBERSHIP |
| david9999@gmail.com | clerk | NULL | ENERVIDA-VITALLCONS | TENANT NULL |
| e2e-e2e20261009d0978e-adm@costpro.test | admin | E2E TENANT E2E-20261009-D0978E | 6 tiendas [E2E TENANT E2E-20261009-D0978E] | PRUEBA/QA, ADMIN, MULTI-TIENDA(6) |
| e2e-e2e20261009d0978e-enc@costpro.test | encargado | E2E TENANT E2E-20261009-D0978E | — | PRUEBA/QA, SIN MEMBERSHIP |
| e2e-e2e20261009d0978e-usr@costpro.test | clerk | E2E TENANT E2E-20261009-D0978E | E2E PILOT A CostPro E2E-20261009-D0978E [E2E TENANT E2E-20261009-D0978E] | PRUEBA/QA |
| e2e-e2e20261009d0978e-wh@costpro.test | warehouse | E2E TENANT E2E-20261009-D0978E | — | PRUEBA/QA, SIN MEMBERSHIP |
| e2e-e2e20261018f22f80-adm@costpro.test | admin | E2E TENANT E2E-20261018-F22F80 | 2 tiendas [E2E TENANT E2E-20261018-F22F80] | PRUEBA/QA, ADMIN, MULTI-TIENDA(2) |
| e2e-e2e20261018f22f80-enc@costpro.test | encargado | E2E TENANT E2E-20261018-F22F80 | — | PRUEBA/QA, SIN MEMBERSHIP |
| e2e-e2e20261018f22f80-usr@costpro.test | clerk | E2E TENANT E2E-20261018-F22F80 | E2E PILOT A [E2E TENANT E2E-20261018-F22F80] | PRUEBA/QA |
| e2e-e2e20261018f22f80-wh@costpro.test | warehouse | E2E TENANT E2E-20261018-F22F80 | — | PRUEBA/QA, SIN MEMBERSHIP |
| encargado@demo.com | encargado | Default Tenant | — | SIN MEMBERSHIP |
| f243he2en2ejpm@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| f244ab40u9o0m@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| f244bc7klbb6p@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| f244beh00he8i@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| f244zxe5gmk@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| f246empresa01@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| g3g3af38ck3v6@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| g3g3b4isid7xo@uberip.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| juanmanuelcabreravargas@gmail.com | tenant_admin | NULL | — | TENANT_ADMIN, SIN MEMBERSHIP, TENANT NULL |
| landing.demo@costpro-e2e.com | admin | Grupo Demo CostPro | 3 tiendas [Grupo Demo CostPro] | PRUEBA/QA, ADMIN, MULTI-TIENDA(3) |
| qa.h1.a@costpro.test | usuario | NULL | — | PRUEBA/QA, SIN MEMBERSHIP, TENANT NULL |
| ronaldoguerra984@gmail.com | costo | Default Tenant | — | SIN MEMBERSHIP |
| tery201194@gmail.com | costo | Default Tenant | — | SIN MEMBERSHIP |

**Qué representa `tenant_id` en perfiles:** es la pertenencia ORGANIZATIVA (a qué tenant/organización pertenece la cuenta), usada solo por la capa tenant-gated de RLS y por helpers (`current_user_tenant_id`, `is_tenant_member`). La relación con el `tenant_id` de cada tienda es de co-pertenencia: en `has_store_access` el guard `p.tenant_id = s.tenant_id` (con NULL-safe) verifica coherencia cuando ambos existen. **El acceso operativo a tiendas NO depende del tenant del perfil: depende de `user_store_memberships`** (para no-admins) o del rol admin global (bypass). Pertenencia y permisos son ejes independientes, tal como fijó el propietario.

---

## PASO 4 — Clasificación de los 11 perfiles con `tenant_id` NULL

Origen verificado en `auth.users` (`raw/12_auth_users_origen.json`):

| Perfil | Rol | Memberships | Origen (auth.users) | Pertenencia demostrable |
|---|---|---|---|---|
| **david9999@gmail.com** | clerk | 1 activa: ENERVIDA-VITALLCONS [Default Tenant], creada 2026-10-09 12:19 (30 min tras su signup) | email, confirmado, 1 login 2026-10-09 | **SÍ → Default Tenant** (única tienda activa pertenece a ese tenant; ninguna contradicción) |
| f243he2en2ejpm@uberip.com | tenant_admin | 0 | email, creado 2026-09-14 22:08, 1 login | NO — sin evidencia |
| f244ab40u9o0m@uberip.com («Usuario FC A») | tenant_admin | 0 | email, 2026-09-15 00:08, nunca login, sin confirmar | NO — sin evidencia |
| f244zxe5gmk@uberip.com | tenant_admin | 0 | email, 2026-09-15 00:08, 1 login | NO — sin evidencia |
| f244bc7klbb6p@uberip.com | tenant_admin | 0 | email, 2026-09-15 00:26, 1 login | NO — sin evidencia |
| f244beh00he8i@uberip.com | tenant_admin | 0 | email, 2026-09-15 00:26, 1 login | NO — sin evidencia |
| g3g3af38ck3v6@uberip.com | tenant_admin | 0 | email, 2026-09-15 02:09, 1 login | NO — sin evidencia |
| g3g3b4isid7xo@uberip.com | tenant_admin | 0 | email, 2026-09-15 02:09, 1 login | NO — sin evidencia |
| f246empresa01@uberip.com («Empresa») | tenant_admin | 0 | email, 2026-09-15 18:30, 1 login | NO — sin evidencia |
| juanmanuelcabreravargas@gmail.com | tenant_admin | 0 | **google**, 2026-09-16, login inmediato único | NO — sin evidencia |
| qa.h1.a@costpro.test | usuario | 0 | email, 2026-10-04 (QA H1) | NO — cuenta de pruebas |

**Lectura:** los 8 @uberip.com y juanmanuelcabreravargas son **self-signups de onboarding** (dominio desechable/externo, ráfagas de creación 14-15 sep, rol tenant_admin asignado por el flujo de registro público) que **no pertenecen a ninguna organización**: 0 tiendas, 0 memberships, 0 tenant demostrable. Asignarles `Default Tenant` sería **inventar pertenencia** (y los convertiría formalmente en miembros de la organización de negocio). qa.h1.a es artefacto de pruebas. **Solo david9999 tiene pertenencia demostrable.** Clasificación programática reproducible: `raw/11_clasificacion_programatica.json`.

---

## PASO 5 — Pruebas de acceso multi-tienda (suplantación RLS en vivo, ROLLBACK)

Resultados completos en `raw/13_rls_impersonacion.json`. Contexto: `products.tenant_id` = 226 NULL / 151 Default Tenant / 1 E2E.

| # | Prueba | Esperado | Obtenido | Veredicto |
|---|---|---|---|---|
| T1.1 | belkis9999 (encargado) ve productos de ENERVIDA (tienda autorizada 1) | >0 | **183** | ✅ |
| T1.2 | belkis9999 ve productos de Puerto Padre (tienda autorizada 2) | >0 | **36** | ✅ conserva AMBOS accesos |
| T1.3 | belkis9999 NO ve productos de TIENDA CENTRAL (3ª tienda NO autorizada, mismo tenant) | 0 | **0** | ✅ |
| T1.4 | belkis9999 NO ve productos de Sucursal Vedado (otro tenant) | 0 | **0** | ✅ |
| T1.5 | `has_store_access(belkis→ENERVIDA)` | true | **true** | ✅ |
| T1.6 | `has_store_access(belkis→TIENDA CENTRAL)` | false | **false** | ✅ |
| T2.1 | e2e-usr (clerk, tenant E2E-D0978E) NO ve ENERVIDA (cross-tenant) | 0 | **0** | ✅ |
| T2.2 | e2e-usr ve su propia tienda E2E PILOT A | >0 | **1** | ✅ |
| T3.1 | david9999 (clerk, perfil tenant NULL) ve ENERVIDA (membership legítima) | >0 | **183** | ✅ NULL no revoca lo legítimo |
| T3.2 | david9999 NO ve TIENDA CENTRAL (sin membership) | 0 | **0** | ✅ |
| T3.3 | `has_store_access(david→ENERVIDA)` (ruta NULL-safe) | true | **true** | ✅ |
| T4.1 | juanmanuel (tenant_admin NULL, 0 memberships) ve productos | 0 | **0** | ✅ |
| T4.2 | juanmanuel ve transacciones | 0 | **0** | ✅ |
| T4.3 | juanmanuel ve stock_movements | 0 | **0** | ✅ |
| T4.4 | juanmanuel ve SOLO su propio perfil | 1 | **1** | ✅ |
| T4.5 | juanmanuel ve tiendas | 0 | **0** | ✅ |
| T4.6 | juanmanuel ve tenants | 0 | **0** | ✅ |
| T5.1 | admin@demo.com ve ENERVIDA (su tenant) | >0 | **183** | ✅ |
| T5.2 | admin@demo.com ve Sucursal Vedado (OTRO tenant) — semántica actual | >0 | **5** | ⚠ documentada (ver 5.3) |
| T5.3 | admin@demo.com ve QA-H1-A (store tenant NULL) | ≥0 | **2** | informativo |
| T6.1 | [flag ON] david9999 (NULL) sobre ENERVIDA | (esperado 0) | **183** | ⚠ hallazgo F1: capa legado sigue otorgando |
| T6.2 | [flag ON] admin@demo.com sobre Sucursal Vedado | 0 | **0** | ✅ el flag SÍ restringe al admin |
| T6.3 | [flag ON] belkis sobre ENERVIDA | ≥0 | **183** | informativo |
| T7.1 | qa.h1.a (usuario NULL, 0 memberships) ve productos | 0 | **0** | ✅ |

### 5.3 Conclusiones de las pruebas

1. **Usuario autorizado a dos tiendas conserva ambos accesos y no accede a una tercera no autorizada** (T1): VERIFICADO en vivo sobre la BD real.
2. **Aislamiento cross-tenant para no-admins** (T2): VERIFICADO. La frontera efectiva hoy es la membership; un usuario sin membership en la tienda de otro tenant no la ve, aunque el tenant de su perfil coincida (T1.3 lo demuestra incluso dentro del MISMO tenant: sin membership no hay acceso).
3. **Perfiles tenant-NULL no obtienen permisos implícitos** (T4, T7): VERIFICADO — 0 productos/transacciones/movimientos/tiendas/tenants visibles; solo su propia fila de perfil. Y el NULL tampoco otorga nada extra: david9999 ve exactamente SU tienda con membership (T3) y ninguna más.
4. **Semántica del admin global (modo latente)** (T5.2): el admin NO está acotado por tenant — accede a tiendas de otros tenants. Es el diseño actual («Admin global tiene acceso a todo» en `has_store_access`) y coincide con la inconsistencia documentada en 1.1 (`is_admin_with_access` sí acota). **No es una relajación introducida por esta sesión ni por los datos; es el comportamiento del código actual.** Con el flag ON el admin SÍ queda acotado (T6.2). El propietario debe decidir si en producción el admin debe ser global o tenant-acotado — registrado dentro de la Decisión B como sub-decisión B.1 (no ejecutamos cambio).
5. **El flag `app.use_tenant_rls` NO activa hoy un aislamiento pleno por tenant** (T6.1 vs T6.2, hallazgo F1): la capa legado de policies (ungated) sigue OR-eando acceso por membership. Activar el modo estricto exige primero: (a) resolver la coexistencia de capas, (b) backfill de `products.tenant_id` (226 NULL) y de los perfiles, (c) sub-decisión B.1. **Este es el corazón del plan de transición.**

---

## HALLAZGOS NUEVOS (registrados como tareas nuevas y vinculadas)

**F1 — Coexistencia de dos capas RLS: el flag tenant no restringe plenamente.** `products_select_rls` (legado, ungated, membership) coexiste con `products_tenant_select` (flag-gated); Postgres OR-ea ambas. Mismo patrón en las demás tablas de negocio (56 políticas vivas en las 10 tablas inspeccionadas). Consecuencia: activar `USE_TENANT_RLS` da una falsa sensación de frontera tenant. → **NUEVA TAREA CP-SEC-025** (P2): plan de convergencia de políticas (elegir capa canónica por tabla; alinear o retirar la legado; re-certificar surface). Evidencia: T6.1=183.

**F2 — Las mutaciones de `user_store_memberships` no quedan auditadas.** `audit_logs` tiene 10.402 filas (activa, última 2026-10-18) y 0 eventos sobre `user_store_memberships` (nadie sabe quién otorgó/revocó un acceso a tienda; el linaje de los 30 perfiles también es opaco: todos `created_by` NULL). → **NUEVA TAREA CP-SEC-026** (P2): auditar grants/revocations de memberships (trigger o en `manage_user_memberships` RPC) con actor, tienda, rol y timestamp. Vinculada a DT-03/CP-SEC-010.

**F3 — Lectura pública (anon) de productos expone `cost_average` y precios; `stores` expone tenant_id.** `products_public_read_anon` (SELECT TO anon: `is_active AND visible_en_tienda`) expone TODAS las columnas legibles del rol, incluido **`cost_average` (costo WAC real)** — verificado con la clave publishable anónima vía PostgREST: `GET /rest/v1/products?select=id,sku,name,cost_average,price` → 200 con costos reales de ENERVIDA. `stores_select_anon` expone nombres + tenant_id de tiendas activas. Si existe una función de catálogo público (bandera `visible_en_tienda`), exponer el costo interno no es parte legítima de ella. → **NUEVA TAREA CP-SEC-027** (P1): restringir columnas legibles por `anon` (revocar SELECT de columnas sensibles y conceder solo el subconjunto público, o vista dedicada `public_products`). No se modificó nada: requiere decidir qué columnas son legítimas para el flujo público.

**F3.1 — Investigación de consumidores (mismo día, read-only sobre código).** Se localizaron TODOS los consumidores del flag `visible_en_tienda` y del catálogo público:
- `src/lib/whatsapp/publish.ts` y `src/lib/telegram/publish.ts`: consultan productos con el cliente **service-role** (línea 74 / 71: `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)`), seleccionando explícitamente columnas de presentación (`id, name, description, sku, price, price_currency, price_visible, stock_visible, stock_current, on_promotion, unit_of_measure, image_url, public_image_url, is_active, visible_en_tienda`) — **no usan la policy anon**.
- `src/app/tienda/[slug]/page.tsx` (vitrina pública web): usa `getSupabaseAdminSafe()` (service-role, SSR) — **no usa la policy anon**.
- El cliente de navegador (`src/lib/supabaseClient.ts`, clave anon) lo consumen las vistas autenticadas del terminal (catálogo, inventario), que viajan con JWT de usuario → RLS evalúa como `authenticated`, no como `anon`.
- Conclusión: **la policy anon no tiene consumidor activo en el código actual**; fue creada (20260726000032, «C2: tienda pública») y conservada deliberadamente (20260807000012), pero los flujos públicos actuales fueron migrados a service-role.
- **Propuesta concreta (marcada como PROPUESTA, no ejecutada):** (1) RECOMENDADA — sustituir el acceso anon a la TABLA por una vista `public_catalog_v` con solo las columnas de presentación (las que ya seleccionan los publish flows) + DROP de `products_public_read_anon`/`stores_select_anon` o su re-scoping a la vista; cero impacto en los flujos conocidos; migración reversible; requiere re-certificar contract-surface. (2) Alternativa — `GRANT SELECT (columnas…)` a nivel de columna sobre las tablas (PostgREST lo respeta; RLS puede leer cualquier columna). En ambas, la decisión de negocio pendiente es si algún consumidor externo/futuro necesita catálogo anónimo (p. ej. app pública o integración de terceros) y con qué columnas exactas.

**F4 — Dos tiendas QA con tenant NULL (QA-H1-A/B)** y 10 perfiles self-signup sin organización: higiene de datos/onboarding por decidir (vinculada a la tarea de higiene de pruebas ya registrada el 2026-10-18).

---

## PROPUESTA DE BACKFILL CONTROLADO (NO EJECUTADA — requiere su OK por escrito)

**Alcance: exactamente 1 perfil.** david9999@gmail.com (`84ef824e-8066-4efa-afc7-102918c6c982`) → `tenant_id = 5364ccf8-…` (Default Tenant).

**Justificación:** pertenencia demostrable por relación existente (membership activa clerk en ENERVIDA-VITALLCONS, tienda del Default Tenant, desde 2026-10-09). Sin contradicciones (0 memberships en otros tenants). **Los otros 10 perfiles NULL NO se modifican** (pertenencia no demostrable — su caso se documenta arriba y queda pendiente de decisión de producto sobre onboarding/self-signup).

**Propiedades del backfill (cuando autorice):**
1. **Controlado:** `UPDATE public.profiles SET tenant_id = '5364ccf8-…' WHERE id = '84ef824e-…' AND tenant_id IS NULL;` — el WHERE doble garantiza idempotencia y no tocar nada más. Verificación previa en la misma transacción: membership activa existente y coherencia store-tenant.
2. **Auditable:** fila explícita en `audit_logs` (action `dt03_backfill_tenant`, old_data/new_data, actor = propietario autorizador, metadata con la evidencia de pertenencia) en la MISMA transacción.
3. **Reversible:** `UPDATE … SET tenant_id = NULL WHERE id = '…';` restaura el estado exacto previo (el campo no dispara cascadas; verificado: ninguna política viva depende del valor para conceder — solo para restringir en modo estricto).
4. **Sin efecto sobre accesos a tiendas:** las memberships quedan intactas (verificado T3 pre/post lógicamente equivalente: el guard NULL-safe de `has_store_access` da el mismo TRUE con tenant seteado coherente). Efecto esperado sobre RLS: NINGUNO en modo latente (T3.1/T3.3 siguen igual); en modo estricto futuro le PERMITE mantener su acceso (corrige el hipotético T6.1=0 para su caso).

**Orden de transición recomendado (para cuando se decida activar el modo estricto):** (1) resolver CP-SEC-025 (convergencia de capas de políticas); (2) backfill de `products.tenant_id` (226 filas NULL → tenant de su store; regla derivable, reversible, auditable); (3) backfill de perfiles demostrables (este documento: 1 perfil); (4) sub-decisión B.1 (admin global vs tenant-acotado — homogeneizar `has_store_access`/`is_admin_with_access`); (5) re-certificar contract-surface y activar el flag con piloto RLS_PILOT_STORES.

---

## Trazabilidad

- Scripts: `dt03_live_introspection.js`, `dt03_build_matrix.js`, `dt03_classify.js`, `dt03_auth_origin.js`, `dt03_rls_tests.js` (en `/home/z/my-project/scripts/`).
- Crudo: `raw/01..13_*.json` (funciones vivas, columnas, 56 políticas, enums, capability transaccional, tenants, stores, matriz 43 filas, resumen 30, linaje, origen auth.users, clasificación, pruebas RLS con resultados).
- Tests de regresión añadidos al repo: `src/__tests__/integration/dt03-multi-tenant-access.test.ts` (invariantes de código + invariantes de la evidencia, ejecutables en CI).
- PR #1421 (ya integrado, SHA 5844408) y PR #1422: esta evidencia se commitea en la rama del PR #1422 para proteger el trabajo.

---

## ACTUALIZACIÓN 2026-10-19 (sesión siguiente — instrucción operativa DT-03/PR #1422)

1. **Corrección de la conclusión de consumidores de F3.1:** la investigación más profunda de la sesión siguiente encontró que `createServerClient()` (`src/lib/supabaseClient.ts`) usa la clave **anon** sin JWT — la vitrina SSR (`src/app/tienda/[slug]/page.tsx`: generateStaticParams, generateMetadata, página + fallback de productos que seleccionaba cost_price/cost_average) y la storefront API (`src/app/api/storefront/[slug]/route.ts`) **SÍ consumen las policies anon**. La conclusión «sin consumidor activo» era incorrecta para stores/productos. Evidencia completa: `../20261019-cp-sec-027-publico/INFORME.md` (rama `fix/cp-sec-027-catalogo-publico`).
2. **CP-SEC-027 implementado como PR independiente desde main:** PR **#1424** (`fix/cp-sec-027-catalogo-publico`) — migración `20261019000001` con vistas `public_catalog_v`/`public_storefronts_v`/`public_variants_v`, DROP de policies anon, REVOKE de tabla, consumidores migrados, 26 tests nuevos, suite 3196/3196, contrato OK. Decisión de ubicación (PR separado desde main, alcance exclusivo CP-SEC-027) tomada según los tres criterios del propietario: migración independiente + riesgo distinto + complicaría la revisión de #1422. **La migración NO está aplicada a la BD viva** (pendiente autorización expresa; despliegue en 3 fases documentado). Verificación post-migración preparada: `scripts/cpsec027_post_migration_verify.js` (18/18 checks fallan pre-fix — línea base congelada).
3. **Backfill david9999:** dossier de autorización COMPLETO en `BACKFILL_DAVID9999_DOSSIER.md` (fila exacta viva `raw/14_…json`, valores anterior/nuevo, SQL transaccional idempotente con audit_log en la misma transacción, reversión exacta, precondiciones verificadas en dry-run). ⛔ **NO EJECUTADO** — requiere confirmación escrita específica del propietario. Ejecutable solo con doble bandera: `EXECUTE=1 I_CONFIRM_BACKFILL_DAVID9999=YES`.
4. **CP-SEC-025 / CP-SEC-026:** hallazgos y tareas vinculadas CONSERVADOS sin cambios; sin refactorizaciones generales de RLS ni auditoría de memberships en ninguno de los dos PR (scope disciplinado según instrucción §2.C).
