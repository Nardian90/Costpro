# CP-CAT-MAESTRO-002 — Inicialización del catálogo maestro VITALLCONS + creación de FERRO + conexión ENERVIDA/FERRO

**Fecha:** 2026-10-31
**Entorno:** Producción (https://costpro4.vercel.app) con protección especial de los datos de ENERVIDA
**Mecanismo de migración:** Management API + NOTIFY pgrst (procedimiento oficial del repo, patrón m004)
**Actor auditable:** `a1111111-1111-1111-1111-111111111111` (Admin Demo, superadmin, **owner del tenant VITALLCONS** → gobernador del catálogo por diseño `is_catalog_governor`)

---

## 1. Estado inicial del tenant y tiendas (FASE 0 — inspección viva, 2026-10-31)

| Entidad | Valor verificado en vivo |
|---|---|
| Organización VITALLCONS | `tenant_id = 5364ccf8-e6cd-4c38-aea8-b167b3b5576f`, owner `a1111111-…` |
| ENERVIDA-VITALLCONS | `store_id = 5e6fe821-5465-48b1-b3f1-3aa3182edc38` (2026-07-04, activa) |
| Puerto Padre VITALLCONS | `store_id = 43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` (2026-06-24, activa) |
| FERRO | **NO existía** (creada en FASE 3 de esta misión) |
| Otra organización | WAC Test Tenant `2de3d368-…` (externa, intocada) |

**Estado del catálogo maestro antes de la misión (verificación viva, no los números históricos de la auditoría del 29-10):**

- `master_products` del tenant VITALLCONS: **1** registro (`QA-CM-20261030-01`, *archived*, producto técnico del piloto CP-CAT-MAESTRO-004). **El catálogo real de ENERVIDA NO estaba cargado.**
- `products.master_product_id`: **0** vínculos en toda la base.
- `catalog_store_links`: **1** fila — Puerto Padre, estado **`disconnected`** desde 2026-10-31T11:30:29Z (estado previo respetado por esta misión: no se conectó ni desconectó ninguna otra tienda).
- PRs previos fusionados: #1518/#1519/#1520/#1521 (CP-CAT-MAESTRO-001 — modelo), #1524 (CP-CAT-MAESTRO-002 mecanismo — gobernanza, alta con identidad compartida, imagen compartida segura), #1525 (003 — contratos + batería E2E), #1528 (004 — piloto Puerto Padre + fix CHECK auditoría). **Mecanismo completo; inicialización de datos pendiente — objeto de esta misión.**

**GAP funcional identificado y resuelto:** no existía una operación segura para incorporar productos LOCALES EXISTENTES al catálogo maestro (`create_master_product` rechaza SKU ya existente local: `ERR_SKU_EXISTS_LOCAL: …vincúlelo al catálogo en lugar de duplicar`, pero el mecanismo de vinculación no existía). La misión §3.2 autoriza expresamente implementarlo: «implementa el mecanismo versionado necesario, con autorización, controles de tenant, idempotencia y auditoría».

## 2. Identificación de los productos de ENERVIDA (manifiesto)

Consulta viva paginada (500/500, orden `created_at ASC`) contra `products?store_id=eq.5e6fe821…`:

| Métrica | Valor |
|---|---|
| Total productos ENERVIDA | **188** (coincide con la auditoría 29-10) |
| Con SKU y nombre no vacíos | 188/188 |
| Con código de barras | 188 (tipos: INTERNAL/EAN13/CODE128) |
| Con imagen (referencia bucket) | 111 |
| Servicios | 2 |
| Unidades de medida | unidad / metro / rollo |
| SKU duplicados en ENERVIDA | **0** |
| Códigos de barras duplicados en ENERVIDA | **0** |
| Colisiones SKU con maestros existentes | **0** |
| Colisiones barcode con maestros existentes | **0** |
| Colisiones SKU con Puerto Padre (mismo tenant) | **0** (36 productos PP verificados) |
| Productos ya vinculados (`master_product_id`) | 0 |

Manifiesto completo con identificadores y campos: `download/cp-cat-maestro-002-manifiesto-enervida.json` (expediente local de la misión; en el repo se documenta la conciliación).

## 3. Manifiesto previo a la carga (dry-run)

Ejecución `incorporate_store_products_to_master(p_store_id=ENERVIDA, p_dry_run=true, p_user_id=owner)` en producción:

```json
{ "status": "success", "dry_run": true, "total_candidates": 188,
  "would_create": 188, "would_link": 0, "conflicts": 0, "skipped": 0, "exceptions": [] }
```

**Proyección exacta 1:1 sin escrituras** (verificado: 0 vínculos y 0 maestros nuevos tras el dry-run). Evidencia: `cp-cat-maestro-002-dryrun-PRODUCCION.json`.

## 4. Conciliación de cada producto con su identidad maestra (resultado)

Ejecución real (misma RPC, `p_dry_run=false`), misma transaccionalidad fila a fila con aislamiento de excepciones:

```json
{ "status": "success", "total_candidates": 188, "created": 188,
  "linked_existing": 0, "conflicts": 0, "skipped": 0, "exceptions": [],
  "audit_actor": "a1111111-1111-1111-1111-111111111111" }
```

**Verificación posterior campo a campo contra el manifiesto original (read-only):**

- 188/188 productos con `master_product_id` → 188 maestros del run.
- **FIDELIDAD_ERRORES = 0**: sku, nombre, descripción, código de barras, tipo de código, unidad de medida, indicador de servicio, imagen (por referencia) y estado (mapeo documentado `is_active→active`) verificados idénticos al registro de origen para cada uno de los 188.
- SKU duplicados entre maestros del tenant: **0**. Maestros huérfanos del run: **0**.
- Vínculo 1:1 sobre la fila local ORIGINAL — **ningún segundo INSERT local** (garantizado por diseño de la RPC y por trigger `trg_products_master_identity_guard`, que coerciona SKU/nombre desde el maestro — no-op con copia fiel).

Evidencia: `cp-cat-maestro-002-backfill-PRODUCCION.json` (reporte completo por producto).

## 5. Cantidad de productos maestros creados y vinculados

| Concepto | Valor |
|---|---|
| Maestros creados por la misión | **188** |
| Productos locales vinculados | **188** (todos los conciliables; 0 excepciones) |
| Total maestros del tenant tras la misión | 189 (188 + 1 QA archived preexistente) |
| Auditoría `master_change_log` | 376 entradas (sku+name por maestro) |
| Auditoría `audit_logs` | 188 entradas `INCORPORATE_PRODUCT_TO_MASTER` con metadatos de fidelidad |

## 6. Excepciones, duplicados o conflictos detectados

**Ninguno.** El manifiesto previo no contenía SKU duplicados, códigos de barras duplicados, productos sin SKU, campos obligatorios vacíos ni imágenes no disponibles. La RPC contempla y registra (no aborta) los casos `ERR_IDENTITY_CONFLICT`, `ERR_BARCODE_CONFLICT`, `ERR_PRODUCT_WITHOUT_SKU`, `ERR_SKU_WITH_SPACES`, `ERR_PRODUCT_WITHOUT_NAME` y `ERR_ROW_PROCESSING` — la carga completa se declaró exitosa porque 188/188 conciliaron sin excepciones (criterio §3.3: «No marques la carga completa como exitosa» solo procede con bloqueos reales; no los hubo).

**Limitación documentada del modelo maestro (misión §3.1):** `category`, `supplier`, `public_image_url`, `precio_empresa` y demás atributos operativos/comerciales NO se representan en `master_products` (por diseño — misión §8: información compartida = identidad únicamente). Esos atributos **se conservan íntegros en el registro local** (verificado por digest comercial §14). Nada se descartó.

## 7. Identificador de la tienda FERRO

| Campo | Valor |
|---|---|
| `store_id` | **`8eb56fa3-7e22-408e-a44b-8f14cdd7f52f`** |
| Nombre exacto | FERRO |
| Creada por | `create_store_with_membership` (mecanismo nativo; misma RPC que envuelve `POST /api/stores`) con `p_created_by=owner`, `p_tenant_id=5364ccf8…`, `p_max_stores=10` (plan enterprise del creador — idéntico parámetro que pasaría la API), `p_plantilla='construccion'` (default) |
| Fecha | 2026-10-31T13:54Z |

## 8. Pruebas de pertenencia de FERRO a VITALLCONS

- `stores.tenant_id = 5364ccf8-e6cd-4c38-aea8-b167b3b5576f` (**mismo tenant que ENERVIDA y Puerto Padre**) — verificado por SELECT directo.
- `is_active = true`, `is_archived = false`.
- **No se creó otro tenant** (el tenant existía y es el del creador: la RPC resuelve `v_tenant := COALESCE(p_tenant_id, profiles.tenant_id)`; se pasó explícito).
- No se copiaron usuarios, contraseñas, membresías de ENERVIDA (la única membresía creada es la estándar del flujo nativo: admin = creador), ni ventas, transacciones, movimientos, documentos, cajas ni existencias (FERRO nació con 0 productos locales — verificado `count=0`).
- Valores por defecto de configuración de nueva tienda (plantilla `construccion`), sin datos comerciales inventados.

## 9. Evidencia de las dos conexiones activas

`catalog_store_links` tras la misión (SELECT vivo):

| Tienda | tenant | status | connected_at | created_by |
|---|---|---|---|---|
| ENERVIDA-VITALLCONS | 5364ccf8… | **connected** | 2026-10-31T13:53:09Z | a1111111… |
| FERRO | 5364ccf8… | **connected** | 2026-10-31T13:54:07Z | a1111111… |
| Puerto Padre VITALLCONS | 5364ccf8… | disconnected (intocado) | 2026-10-30T14:14:23Z | 54c54d88… |

Ambas conexiones comparten **el mismo catálogo** (mismo `tenant_id` → un único conjunto de `master_products` por organización). Puerto Padre y el resto de tiendas/organizaciones **no fueron conectados ni alterados** (misión §6). El aislamiento frente a organizaciones externas lo garantiza RLS (`master_products_select → can_read_master_catalog(tenant_id)`: admin global, gobernador del tenant o miembro activo de una tienda CONECTADA de ese tenant) más los GRANT de solo-lectura.

## 10. Evidencia de las pruebas de creación desde ambos almacenes

Ejecutadas en el **entorno E2E aislado** (CostproE2E `lguovmvrozxgssupkwpf`, guard CP-INFRA-011 fail-closed que rechaza producción, JWT de usuarios autenticados reales — jamás service_role para las pruebas de permisos, misión §9). Batería nueva `e2e/flows/master-catalog-backfill-m002.spec.ts` (11/11 PASSED) + batería previa `e2e/flows/master-catalog-full.spec.ts` (12/12 PASSED):

- **B09** — Creación de tienda vía API REAL (`POST /api/stores`) → pertenece al MISMO tenant y queda conectada al MISMO catálogo.
- **B11** — Creación de producto desde la tienda nueva (FERRO simulada) vía `create_master_product` (la misma RPC que invoca la UI real de `Inicio > OPERACIÓN > Almacén > Inventario > Catálogo` a través de `useCreateMasterProduct`/`CreateProductModal`): queda asociada al registro local con defaults del alta manual (precio 0/existencia 0), aparece INMEDIATAMENTE en el catálogo maestro, es visible desde ENERVIDA **antes** de activarse, y existe **exactamente 1** identidad maestra.
- **C02/C08** (batería previa) — alta con identidad compartida desde la tienda A; duplicado concurrente del MISMO SKU desde A y B en paralelo → exactamente 1 éxito + 1 `ERR_MASTER_SKU_EXISTS` (nunca dos maestros).
- **B05/B06** — idempotencia de la incorporación (segunda ejecución → 0 maestros nuevos) y conflicto de SKU con identidad contradictoria → detectado, sin fusión silenciosa ni duplicado.
- **C09** — desconexión/reconexión sin pérdida de identidades ni duplicados.

En producción, la creación de productos de prueba está **prohibida por la misión §11** («No crees productos ficticios de comprobación en ENERVIDA ni en FERRO productivo»), por lo que la validación productiva posterior fue **no destructiva** (§15).

## 11. Evidencia de disponibilidad cruzada del catálogo

- **FERRO → productos existentes de ENERVIDA:** `search_master_products(p_store_id=FERRO, p_search="110")` → encuentra el maestro `110 · Intermedio` (imagen por referencia original, barcode, unidad) con `activated=false, local_product_id=null` — FERRO VE la identidad pero NO tiene fila local.
- **Total visible desde FERRO:** búsqueda vacía → `total_count=189` (188 de ENERVIDA + 1 QA archived del tenant).
- **ENERVIDA → propios:** `search_master_products(p_search="panel")` → 5/5 con `activated=true, local=true`.
- **POS tras los vínculos:** el escaneo por código de barras resuelve por la fila local Y por el maestro (SQL vivo: `INT000000000058` → sku 110 con barcode local y de maestro idénticos); la batería E2E B12 verifica `get_products_for_pos` por SKU y por barcode vía JWT real.

## 12. Evidencia de separación de precios, costos y existencias

- **Digest comercial idéntico PRE/POST** (§14): precio, moneda, costo, costo promedio, existencias, mínimo, imagen, estado y código de barras de los 188 productos de ENERVIDA — sin ningún cambio atribuible a la misión.
- E2E **B03** — datos comerciales de la tienda origen intactos tras la incorporación; **B10** — FERRO sin existencias de productos de ENERVIDA (`count=0`); **C04/C06** (batería previa) — activación con defaults del alta manual (precio 0/CUP, min_stock 1, existencia 0) y precios/costos INDEPENDIENTES por tienda.
- El modelo maestro **no tiene** columnas de precio/costo/existencia (misión §8): nada que copiar, nada que heredar.
- La incorporación de un producto maestro al inventario de FERRO se hace mediante el flujo normal (`activate_master_product`), conservando sus datos operativos propios.

## 13. Resultados de RLS, seguridad, E2E y CI

| Control | Resultado |
|---|---|
| Guard de aislamiento E2E (CP-INFRA-011) | Destino validado (producción rechazada sin conectar; centinela `e2e_is_isolated_db()=true`) |
| Batería E2E nueva (backfill/inicialización) | **11/11 PASSED** (B01–B12) |
| Batería E2E previa (catálogo maestro) | **12/12 PASSED** (C01–C12, regresión) |
| Guardrail de higiene E2E (net zero) | **PASS — net delta = 0** |
| Tests estáticos de la migración | **14/14 PASSED** (`cp-catalogo-m002-backfill-migration.test.ts`) |
| Test de manifiesto replay | **7/7 PASSED** (113→114 incluidas, determinista, `--check` MATCH) |
| Suite unitaria/integración (vitest local) | 4825+ passed; 1 fallo PREEXISTENTE en main (`cash-report-view` «intervalo inválido», reproducido en main limpio sin cambios de esta misión; CI de main en el mismo commit = SUCCESS) |
| SQL Static Checks | OK (checks generados e íntegros) |
| SQL DB Security (en vivo, réplica local vía Management API) | **TODO PASS** — 104 hallazgos, 104 en allowlist, 0 violaciones; 0 grants públicos; 0 tablas sin RLS |
| Contract surface | Regenerado desde producción con el generador oficial: **166 funciones** (165 + `incorporate_store_products_to_master`), sha256 `ca43f1a6…` |
| TypeScript / ESLint | Archivos nuevos sin errores (tsc del proyecto completo no cabe en RAM del sandbox local; CI lo ejecuta) |
| Pruebas con JWT reales (misión §9) | Sí — `rpcAsUser()` firma sesiones reales; service_role solo para verificación de estado y ejecución productiva autorizada |

## 14. Integridad de ENERVIDA antes y después

Snapshots read-only idénticos en estructura (PRE 13:51:02Z / POST tras todas las operaciones):

| Métrica | PRE | POST | Veredicto |
|---|---|---|---|
| Productos | 188 | 188 | sin altas/bajas |
| **Digest comercial (sha256 de id·sku·nombre·precio·moneda·costo·costo promedio·existencia·mínimo·imagen·estado·barcode)** | `f2c3c7c1…` | `f2c3c7c1…` | **IDÉNTICO** |
| Vínculos a maestro | 0 | **188** | único cambio atribuible a la misión (identidad maestra + relación) |
| Transacciones | 701 | 701 | intacto |
| Recibos | 82 | 82 | intacto |
| Filas de inventario | 155 | 155 | intacto |
| Movimientos de stock (kardex) | 1281 | 1281 | intacto |
| Puerto Padre (productos/vínculos/enlace) | 36 / 0 / disconnected | 36 / 0 / disconnected | **intacto** |

Los cambios atribuibles a la misión son exclusivamente: 188 maestros de identidad + 188 vínculos `master_product_id` + 376 filas de `master_change_log` + 188 de `audit_logs` + 1 tienda FERRO + 2 conexiones de catálogo. No se modificó inventario comercial, precios, costos, SKU locales, ventas, movimientos, documentos ni imágenes (referencias conservadas, sin duplicar objetos del bucket).

## 15. PR fusionados, SHA definitivos y despliegue

- Migración: `supabase/migrations/20261031140000_cp_catalogo_master_incorporacion_backfill.sql` — aplicada a producción ANTES del PR (Management API + NOTIFY pgrst, pre-vuelo y verificación POST incluidos: SECURITY DEFINER, owner postgres, grants `authenticated`+`service_role`), patrón oficial de #1525/#1528.
- Repositorio: rama `feat/catalogo-m002-inicializacion-vitallcons-20261031`; el PR incluye la migración + test estático (14) + batería E2E (11 casos) + manifiesto replay regenerado (114) + contract-surface regenerado (166) + este expediente.
- CI del PR: TypeCheck+Lint+Unit+Build, Unit & Integration, Security Audit, TypeScript Security, SQL Static, SQL DB Security, Allowlist Review, Vercel Preview Comments. (Resultado y SHA definitivos registrados en el worklog al fusionar.)
- Despliegue: Vercel producción (verificación del commit desplegado y smoke tests no destructivos registrados en el worklog).

## 16. Incidencias y riesgos residuales

1. **Test local preexistente** `cash-report-view` («intervalo inválido») falla en el sandbox local TAMBIÉN en main limpio (reproducido con `git stash`); CI de main en el mismo SHA = SUCCESS. No relacionado con esta misión (ningún archivo de esa área fue tocado).
2. **Residuos E2E preexistentes** (usuarios/tiendas de corridas abortadas del 22-30/10) fueron limpiados por los mecanismos sancionados (soft-delete de perfiles + archivo de tiendas; el DELETE físico está bloqueado a propósito por la política Iteración 12 Q6). El guardrail termina en PASS con net delta 0.
3. **Usuarios admin de run abortados en la base E2E** quedan soft-deleted (email anonimizado `deleted+…@anonymized.local`); sus identidades GoTrue huérfanas son inertes (sin perfil activo no pueden autenticar con efecto).
4. **Regla de identidad documentada**: el barcode INTERNAL es un artefacto de tienda (la unicidad global de `products.barcode` fuerza divergencia entre tiendas); NO cuenta como contradicción de identidad para reutilizar un maestro. Los barcodes comerciales (EAN13/CODE128) contradictorios sí generan `ERR_IDENTITY_CONFLICT`. Regla implementada, documentada en la migración y fijada por test estático.
5. **Estado del QA master**: el registro `QA-CM-20261030-01` (archived) del piloto anterior permanece; no interfiere (los SKU no colisionan). Su limpieza queda a criterio del propietario (no autorizada por esta misión).
6. **Puerto Padre sigue desconectado** por decisión previa del propietario (11:30Z hoy); su futura conexión/incorporación no está autorizada por esta misión.

---

## CERTIFICACIÓN

La misión se declara completada cuando el PR esté fusionado y el despliegue verificado (worklog). Estado de los criterios de éxito:

- [x] El catálogo maestro de VITALLCONS está inicializado con los productos reales de ENERVIDA (188/188).
- [x] Cada producto conciliado conserva sus atributos originales (fidelidad literal verificada campo a campo; 0 errores).
- [x] ENERVIDA tiene sus productos locales correctamente asociados al maestro (188 vínculos 1:1, sin segunda copia local).
- [x] FERRO existe y pertenece a VITALLCONS (`8eb56fa3-7e22-408e-a44b-8f14cdd7f52f`).
- [x] ENERVIDA está conectada al catálogo.
- [x] FERRO está conectada al mismo catálogo.
- [x] FERRO encuentra los productos existentes de ENERVIDA (búsqueda verificada, 189 visibles).
- [x] Un producto creado desde ENERVIDA se incorpora al maestro y queda disponible para FERRO (E2E C02/C03 + integración UI existente PR #1524).
- [x] Un producto creado desde FERRO se incorpora al maestro y queda disponible para ENERVIDA (E2E B11, simetría verificada).
- [x] No se crean duplicados maestros ni locales (idempotencia B05, carrera C08, 0 duplicados en producción).
- [x] Precios, costos y existencias permanecen independientes (digest idéntico + E2E C04/C06/B03/B10).
- [x] Se conserva la integridad de los datos productivos de ENERVIDA (PRE/POST §14).
- [x] No se altera Puerto Padre ni se conectan otras tiendas (§14 última fila).
- [x] Las pruebas de seguridad y E2E pasan (11/11 + 12/12 + gate vivo TODO PASS).
- [ ] La aplicación desplegada funciona correctamente (se verifica tras el merge — worklog).
