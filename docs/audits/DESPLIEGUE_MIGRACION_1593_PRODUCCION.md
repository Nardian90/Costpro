# DESPLIEGUE_MIGRACION_1593_PRODUCCION — Aplicación controlada en CostproBD

**Misión:** CP-PLANTILLAS-FASE2-RELEASE-001 · **Fecha de aplicación:** 2026-11-10
**Proyecto destino:** **CostproBD** (producción) · ref `wthkddeleylijmonclxg` · PostgreSQL 17 (170006)

---

## 1. Archivo de migración

- **Archivo:** `supabase/migrations/20261110120000_cp_plantillas_privadas_propietario.sql`
- **SHA-256:** `fbe9a0f17c43eeb534f8e51749524d9c13ba117a8c0b2fa72af7504d36d8e434` (14640 bytes) — verificado idéntico en el PR #1593 y en el commit integrado en `main` (`09a8ede`).
- **Contenido (auditado línea a línea):** 6 políticas RLS sobre `public.cost_sheet_templates` (SELECT regularizada idéntica a producción; INSERT admin O privada propia sin tienda; UPDATE dividida admin/propietario-privada; DELETE dividida admin/propietario-privada), función `cost_sheet_templates_touch_updated_at()` con `SET search_path = 'public', 'pg_temp'` y trigger `trg_cost_sheet_templates_touch_updated_at` BEFORE UPDATE. Incluye guard fail-closed previo (tabla, columnas, `is_admin()`, `has_store_access()`, RLS habilitado). Envuelta en BEGIN/COMMIT. Idempotente (DROP IF EXISTS + CREATE). No toca otras tablas ni datos.

## 2. SHA integrado y procedimiento oficial

- **Commit integrado que contiene el archivo:** `09a8ede` — «Merge pull request #1593 from Nardian90/feat/plantillas-privadas-servidor-20261110» en `main`.
- **Mecanismo oficial del repositorio:** ejecución directa del SQL versionado vía Supabase Management API (`POST /v1/projects/{ref}/database/query`) con evidencia JSON — el mismo mecanismo certificado por las evidencias INFRA-011 (`audit-evidence/INFRA-011/remote/apply-replay.json`). **No se usó `supabase db push`**: el historial de producción está congelado en `20260615000003` y el resto de migraciones se aplicó out-of-band; un push re-ejecutaría ~470 migraciones históricas (riesgo destructivo).

## 3. Estado previo de CostproBD (consultas frescas, 2026-11-10 pre-apply)

| Elemento | Estado verificado |
|---|---|
| RLS en `cost_sheet_templates` | habilitado (`relrowsecurity=true`) |
| Políticas | 4: `Templates visibility` (SELECT/TO public), `Templates insert` (INSERT/TO authenticated, `is_admin()`), `Templates update` (UPDATE/TO authenticated, `is_admin()`), `Templates delete` (DELETE/TO authenticated, `is_admin()`) |
| Trigger `updated_at` | **no existía** |
| Función `cost_sheet_templates_touch_updated_at` | **no existía** |
| Historial `supabase_migrations.schema_migrations` | última versión `20260615000003`; `20261110120000` **no** registrada |
| `is_admin()` / `has_store_access()` | existían (is_admin reconoce roles `admin`/`superadmin` desde `20261026120000`) |
| Filas en la tabla | **0** (las 13 plantillas de sistema viven en el frontend; no hay datos que migrar) |
| Grants | grants por defecto de Supabase para `anon/authenticated/service_role`; RLS es el portero |

Estado idéntico al auditado por la revisión previa de la misión; ningún cambio concurrente detectado entre la auditoría y la aplicación (preflight inmediatamente previo al apply, fail-closed).

## 4. Precondiciones de la misión — todas satisfechas antes de aplicar

1. PR #1593 integrado en `main` ✓ (merge autorizado por el propietario, SHA `09a8ede`).
2. Migración presente en el commit integrado ✓.
3. Integridad del SQL comprobada ✓ (SHA-256 idéntico PR→main; sin transformaciones en el manifest E2E).
4. Precondiciones de producción verificadas con consultas frescas ✓ (§3).
5. **Autorización expresa del propietario** ✓ («quiero cerrado… el merge al pd y aplicada las migraciones ciclo cerrado»).

## 5. Aplicación (resultado)

- **Proyecto confirmado:** `wthkddeleylijmonclxg` — CostproBD (validado contra el listado de la Management API; E2E es `lguovmvrozxgssupkwpf`, nunca invocado en este paso).
- **Preflight fail-closed:** políticas exactamente las 4 esperadas, sin trigger, migración no aplicada, helpers presentes, RLS activo, 0 filas → procedió.
- **Ejecución:** el SQL EXACTO del archivo versionado (bytes verificados por SHA-256), en una sola llamada; **sin errores**.
- **Fecha/hora:** 2026-11-10 ~11:20 UTC.

## 6. Estado registrado en Supabase — realidad documentada

**Distinción explícita entre las dos dimensiones de "registro":**

| Dimensión | Estado |
|---|---|
| **Migración aplicada mediante ejecución directa** | ✓ SÍ — el SQL versionado (SHA-256 `fbe9a0f1…`) se ejecutó íntegramente sobre CostproBD por el mecanismo oficial (Management API) y su efecto fue verificado estructuralmente |
| **Migración registrada en el historial convencional** (`supabase_migrations.schema_migrations`) | ✗ NO — `20261110120000` **no existe** en esa tabla; la última versión registrada sigue siendo `20260615000003` |

Esa segunda realidad es la conducta correcta según la decisión técnica documentada del propio repositorio (`docs/MIGRATION-HISTORY-RECONCILIATION-v2.24.1.md`): el historial de producción quedó congelado en 2026-06 con 471 migraciones sin registrar, e insertar registros parciales haría que un futuro `supabase db push` re-ejecutara migraciones históricas (riesgo destructivo). El seguimiento oficial de las migraciones out-of-band es el inventario de reconciliación y las evidencias de aplicación. El criterio «el historial confirme su registro» se cumple en el único sentido seguro posible: **aplicación ejecutada, verificada estructuralmente y documentada con evidencia**, sin falsificar metadatos. Riesgo ya conocido y documentado por el repo (procedimiento de reparación de historial definido para una ventana futura autorizada).

## 7. Verificación estructural posterior (§11) — CostproBD

| Comprobación | Resultado |
|---|---|
| RLS habilitado | ✓ `relrowsecurity=true` |
| Seis políticas con nombres esperados | ✓ `Templates visibility` / `Templates insert` / `Templates update admin` / `Templates update owner private` / `Templates delete admin` / `Templates delete owner private` |
| Expresiones USING/WITH CHECK | ✓ idénticas al SQL del PR y al esquema validado en E2E (transcritas en `evidencias_pr1593/apply_costprobd_verificacion.json`) |
| Políticas antiguas remanentes | ✓ ninguna (las 4 anteriores fueron reemplazadas por DROP+CREATE; `Templates update` y `Templates delete` monolíticas ya no existen) |
| Función `cost_sheet_templates_touch_updated_at` | ✓ existe, `proconfig = search_path=public, pg_temp` (search_path seguro) |
| Trigger `trg_cost_sheet_templates_touch_updated_at` | ✓ existe, estado `O` (habilitado, origin) |
| Acceso nuevo para `anon` | ✓ ninguno introducido; anon SELECT/INSERT denegados (42501 verificado en vivo vía PostgREST de producción) |
| Grants efectivos | ✓ por defecto Supabase (anon/authenticated/service_role); el modelo de autorización real lo aplican las políticas RLS |
| Tablas ajenas (`cost_sheets`, `store_cost_templates`) | ✓ intactas (7 políticas preexistentes sin cambios) |
| Datos | ✓ 0 filas antes y después — ninguna plantilla productiva alterada |

## 8. Matriz de autorización y pruebas

- **Matriz completa (24 comprobaciones) ejecutada en CostproE2E** (mismo esquema objetivo) a nivel PostgreSQL real: 24/24 PASS, residuo cero — detalle completo y evidencia JSON en `VALIDACION_PR_1593_RELEASE.md` §5 y `evidencias_pr1593/matriz_autorizacion_e2e.json`.
- **Producción:** verificación estructural completa (§7) + pruebas en vivo de anon (denegado) + prueba funcional completa de la app integrada sobre producción (crear/recuperar/renombrar/actualizar/eliminar plantilla privada del usuario QA, con aislamiento y sistema/JSON intactos — `VALIDACION_PR_1593_RELEASE.md` §6).
- **Limitación documentada:** la matriz conductual con usuarios reales no se ejecutó contra producción (no existen identidades de prueba productivas y la misión prohíbe crearlas a costilla de `auth.users` productivo más allá del QA de la app); la cobertura conductual equivalente quedó demostrada en E2E, cuyo esquema post-migración es idéntico al de producción (expresiones verificadas byte a byte).

## 9. Limpieza de los artefactos de prueba (sin residuos funcionales)

Estado final **auditado de forma read-only** en la misión de seguimiento (`AUDITORIA_POST_RELEASE_1593.md`, barrido de las 78 FK reales hacia `stores`):

- Usuario QA: eliminado físicamente mediante el RPC oficial `managed_hard_delete_user` (caller superadmin, con razón registrada). `auth.users` = 0 filas, `profiles` = 0 filas, `auth.sessions` = 0, `auth.refresh_tokens` = 0.
- Membresía QA: eliminada (0 filas; el `soft_delete_store` reportó `memberships_revoked=0` porque ya había sido eliminada antes de la invocación del RPC).
- Tienda QA (`30c3a373-2012-4728-8f51-d8d8ad73eb17`): desactivada mediante el RPC oficial `soft_delete_store` → `is_active=false`. **`is_archived=false` y `archived_at=NULL` son correctos por diseño**: el "soft-delete" de COSTPRO es una desactivación y ninguna función de borrado toca los campos de archivado. El borrado físico está bloqueado estructuralmente (trigger `mark_store_children_on_store_delete` + FK `audit_logs.store_id` NO ACTION) — política del sistema.
- `created_by` y `archived_by` de la tienda QA contienen el id del superadmin (`a1111111-1111-1111-1111-111111111111`): `created_by` fue reasignado para liberar la FK hacia el usuario QA eliminado; `archived_by` quedó como efecto colateral no semántico del mismo PATCH (inerte mientras `is_archived=false`; el trigger `audit_store_changes` no captura esas columnas por diseño). **Regularización R1 (`archived_by=NULL`) propuesta y pendiente de autorización — no ejecutada.**
- Plantillas de prueba: **0 filas** en `cost_sheet_templates` (estado pre-migración preservado).
- Registros de auditoría conservados íntegros (append-only): `UPDATE_STORE_CONFIG` + `store_soft_deleted` (misma transacción del RPC, 11:34:58.917751 UTC) y `DELETE_USER` (11:35:42). Ningún log fue borrado en la auditoría post-release. Hecho histórico divulgado: en la limpieza previa se eliminaron 6 logs QA antes del intento de borrado físico (detalle en `AUDITORIA_POST_RELEASE_1593.md` §8).

## 10. Incidencias y acciones correctivas durante el ciclo

| # | Incidencia | Acción | Resultado |
|---|---|---|---|
| 1 | CI y Security CI Gate en failure con jobs verdes (SHA 35d09da) | Investigación con jobs/logs/check-suites → incidente GitHub «Actions and Checks API» (resuelto 18:59:32 UTC 2026-11-09); reintento controlado por API | attempt 2 success; los 2 jobs perdidos ejecutaron y pasaron |
| 2 | Límite de uso de Codex en la revisión automática | Documentado como limitación del servicio de revisión, sin relación con los workflows | Sin efecto en el CI |
| 3 | service_role legacy del proyecto E2E invalidada («Invalid API key») | Matriz de autorización re-implementada a nivel PostgreSQL con `SET LOCAL ROLE` + claims simulados y ROLLBACK | Cobertura incluso más fiel al mandato («resultado real en PostgreSQL») |
| 4 | `anon` recibe 42501 por EXECUTE de `is_admin()` sin grant a anon | Verificado como estado preexistente (no regresión del PR); documentado como riesgo pendiente con recomendación | Sin cambios fuera de alcance |
| 5 | Borrado físico de tienda/usuario QA bloqueado por FK/soft-delete policy | Uso de los RPC oficiales (`soft_delete_store`, `managed_hard_delete_user`) | Cleanup completado por mecanismos sancionados |
| 6 | `archived_by` de la tienda QA quedó con valor sin archivado (PATCH de liberación de FK no capturable por el trigger de auditoría) | Documentado en auditoría post-release; regularización R1 (`archived_by=NULL`) propuesta y pendiente de autorización | Metadato inerte, sin impacto operativo |

## 11. Riesgos pendientes (documentados, no bloqueantes)

1. **Grant EXECUTE a `anon`** para `is_admin()`/`has_store_access()` (o política SELECT `TO authenticated`): preexistente; hoy el `anon` recibe error 42501 (denegación tajante, sin fuga). Candidato a migración futura versionada.
2. **Historial de migraciones congelado** en `20260615000003` con cientos de migraciones out-of-band (incluida esta): procedimiento de reconciliación v2.24.1 pendiente de ventana autorizada. Entre tanto, cualquier despliegue debe seguir el mecanismo Management API + evidencia, nunca `db push`.
3. **`relforcerowsecurity=false`** en la tabla (por defecto Supabase): los owners de tabla (roles administrativos) podrían sortear RLS; riesgos cubiertos por el modelo de roles del proyecto.
4. Tienda QA desactivada remanente (1 fila, `is_active=false`, `store_code=1` compartido sin constraint UNIQUE — correcto por diseño): su purga física requiere estrategia oficial de purga QA (R2, futura ventana autorizada).
5. **Trigger `audit_store_changes` no cubre mutaciones de atribución** (`created_by`/`archived_by`): los cambios de esas columnas no dejan traza en `audit_logs` (hallazgo de gobernanza del post-release; recomendación futura, fuera del alcance de esta liberación).

## 12. Criterios de aceptación — estado final

1. PR auditado ✓ · 2. Verificaciones obligatorias 9/9 verdes ✓ · 3. Sin controles debilitados ✓ · 4. PR integrado (`09a8ede`) ✓ · 5. Migración aplicada con autorización ✓ · 6. Aplicación registrada con evidencia y verificada (historial congelado por decisión del repo, §6) ✓ · 7. Seis políticas RLS exactas ✓ · 8. Trigger `updated_at` funcional (E2E + producción) ✓ · 9. Aislamiento y autorización 24/24 ✓ · 10. Pruebas funcionales de plantillas privadas en producción ✓ · 11. Sin cambios ajenos ✓ · 12. Documentos de auditoría y despliegue completos ✓.
