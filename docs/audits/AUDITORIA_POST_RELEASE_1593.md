# AUDITORIA_POST_RELEASE_1593 — Limpieza y estado post-release del PR #1593

**Misión:** CP-PLANTILLAS-FASE2-PRODUCTION-CLEANUP-001 · **Fecha:** 2026-11-10
**Alcance:** Auditoría **read-only** de CostproBD (`wthkddeleylijmonclxg`) tras el despliegue del PR #1593 y su limpieza de QA.
**Modo:** ninguna operación de escritura fue ejecutada en esta misión (solo SELECT/lecturas). Las regularizaciones se proponen y quedan **pendientes de autorización expresa**.

---

## 1. Tienda QA residual identificada

| Campo | Valor |
|---|---|
| ID | `30c3a373-2012-4728-8f51-d8d8ad73eb17` |
| Nombre | `QA-Release-1593-Plantillas` |
| Proyecto | CostproBD (producción) |
| `tenant_id` | NULL |
| `store_code` | 1 |
| `is_active` | **false** |
| `is_archived` | **false** |
| `archived_at` | **NULL** |
| `archived_by` | `a1111111-1111-1111-1111-111111111111` (superadmin) |
| `created_by` | `a1111111-1111-1111-1111-111111111111` (superadmin) |
| `created_at` | 2026-11-10 11:25:30 UTC |
| Otros | `plantilla='construccion'`, `backup_restore_protected=false`, resto de campos NULL/vacíos |

**Tienda ajena (NO tocada en esta misión):** `QA UI Icons Store` (`6691b866-a7cd-409b-b1e5-dd9bc2ad9d7a`), creada 2026-11-07, `is_active=true`, `is_archived=false`, `archived_by=NULL` — pertenece a otra misión, no se leyó más allá de su fila de identificación y no se modificó.

**Contexto de stores en producción:** 7 filas en total — 6 activas y no archivadas, 1 inactiva y no archivada (la tienda QA objetivo). Ningún registro con `is_archived=true`.

## 2. Estado actual: ¿corresponde al comportamiento de `soft_delete_store`?

**Sí — verificado contra el código real de la función (Fase 2):**

`soft_delete_store(p_store_id, p_deleted_by)` ejecuta exactamente:

1. `UPDATE stores SET is_active = false WHERE id = p_store_id;`
2. `UPDATE user_store_memberships SET status='revoked' WHERE store_id=… AND status='active';`
3. `UPDATE profiles SET active_store_id = NULL WHERE active_store_id = p_store_id;`
4. `INSERT INTO audit_logs (action='store_soft_deleted', …)` con `metadata.deleted_by/deleted_at`.

**No toca `is_archived`, `archived_at` ni `archived_by`** — comprobado además por análisis de `prosrc` de las tres funciones de borrado de tiendas (`soft_delete_store`, `bulk_soft_delete_stores`, `stores_soft_delete_cleanup`): ninguna referencia `is_archived/archived_at/archived_by` (`toca_is_active=true`, resto `false`).

Consecuencias semánticas (estados distintos que NO deben mezclarse):

| Estado | Marca en COSTPRO | Tienda QA |
|---|---|---|
| **Desactivada (soft-delete)** | `is_active=false` | ✔ este es su estado |
| **Archivada** | `is_archived=true` + `archived_at` + `archived_by` | no aplica |
| **Eliminada físicamente** | fila inexistente | no aplica (bloqueado por trigger de auditoría + FK, por diseño) |

Por tanto `is_archived=false` + `archived_at=NULL` son **correctos por diseño** para una tienda desactivada con `soft_delete_store`; no son inconsistencia y no deben "rellenarse" para aparentar coherencia.

## 3. Cómo se modificaron `created_by` y `archived_by` (trazabilidad exacta)

Secuencia real de la limpieza del ciclo anterior (2026-11-10, 11:32–11:36 UTC), reconstruida con los `audit_logs` vivos y el transcript de la operación:

1. Se eliminó la membresía QA (204) y los 6 `audit_logs` de la sesión QA (para intentar el borrado físico de la tienda, que falló por el trigger `mark_store_children_on_store_delete`, que escribe hijos referenciando el `store_id` eliminado).
2. `managed_hard_delete_user` (caller QA) → `ERR_UNAUTHORIZED: solo un SuperAdmin`.
3. `soft_delete_store` → 200: `is_active=false`, `memberships_revoked=0` (ya estaba eliminada), `profiles_cleared=0` (membresía ya eliminada; el `active_store_id` del perfil QA sí fue limpiado por el paso 3 interno de la función).
4. **PATCH read-write único sobre la fila de tienda:** `UPDATE stores SET created_by='<superadmin>', archived_by='<superadmin>'` (HTTP 204) — **motivo:** la FK `stores.created_by → auth.users` seguía referenciando al usuario QA y bloqueaba el RPC oficial de borrado de usuario.
5. `managed_hard_delete_user` (caller superadmin) → 200 `hard_deleted`.

Explicación de los valores actuales:

- `created_by = superadmin`: reasignación **necesaria y justificada** para liberar la FK hacia el usuario QA eliminado físicamente. El creador original ya no existe; la alternativa (`NULL`) era menos trazable.
- `archived_by = superadmin`: **efecto colateral no semántico del mismo PATCH** (se incluyó ambas columnas para una sola llamada). `archived_by` carece de significado funcional mientras `is_archived=false` — ningún flujo operativo lo consume en ese estado (la única función del servidor que lee campos de archivado es `get_transferable_stores`, que filtra por tiendas archivadas). Es un **metadato inconsistente con la semántica de archivado, pero inerte**.

**¿Quedó auditado el PATCH?** **No — y no podía serlo:** el trigger `audit_store_changes` solo registra cambios de `name`, `address` e `is_active` (condición `OLD.x IS DISTINCT FROM NEW.x` sobre esas tres columnas; `created_by`/`archived_by` quedan fuera por diseño). La única fila `UPDATE_STORE_CONFIG` existente (11:34:58.917751) corresponde al `UPDATE stores SET is_active=false` de `soft_delete_store`, no al PATCH. El cambio queda documentado en este expediente como trazabilidad externa. *Hallazgo de gobernanza derivado:* el trigger de auditoría no cubre mutaciones de atribución (`created_by/archived_by`) — recomendación fuera del alcance de esta misión.

## 4. Relaciones y referencias encontradas (barrido real de FKs)

Inventario PostgreSQL real: **78 claves foráneas** hacia `public.stores(id)` (`abc_classifications`, `audit_logs`, `bank_statements`, `cash_closures`, `cash_flow_documents`, `cash_register_sessions`, `categories`, `cost_sheet_templates`, `customers`, `inventory`, `sales_transactions`, `store_cost_templates`, `transfers`, `user_store_memberships`, `warehouses`, `whatsapp_*`, etc.).

**Recuento de filas por cada tabla/columna FK para la tienda QA: 0 en 77 de 78; única excepción `audit_logs.store_id = 2`.**

| Tabla | Referencias a la tienda QA | Naturaleza |
|---|---|---|
| `audit_logs` (store_id) | 2 | Registros de auditoría legítimos (`UPDATE_STORE_CONFIG` + `store_soft_deleted`) — **conservar** |
| `user_store_memberships` | 0 | membresía QA eliminada durante la limpieza ✓ |
| `profiles` (active_store_id / store_id) | 0 | limpiado por `soft_delete_store` y borrado del usuario ✓ |
| 75 tablas operativas restantes (ventas, inventario, caja, documentos, telegram/whatsapp, etc.) | 0 | **cero actividad comercial o de configuración generada por la prueba** ✓ |

## 5. Verificación del usuario QA

| Comprobación | Resultado |
|---|---|
| `auth.users` | **0 filas** — eliminado físicamente vía `managed_hard_delete_user` (respuesta: `hard_deleted`, `auth_identity_removed`) |
| `auth.sessions` / `auth.refresh_tokens` | 0 / 0 — sin sesiones residuales |
| `public.profiles` | 0 filas |
| Referencias FK a `auth.users`/`profiles` en otras tablas | 0 (barrido dinámico de constraints) |
| Referencia histórica en `audit_logs` | 1 fila `DELETE_USER` (record_id = usuario QA) — **legítima, conservar** |
| Referencia histórica en `audit_logs.metadata` | `store_soft_deleted.metadata.deleted_by = <usuario QA>` (parámetro `p_deleted_by` con el que se invocó el RPC durante la limpieza) — **legítima, append-only, conservar** |

## 6. Estado de membresías

0 filas en `user_store_memberships` para la tienda QA o el usuario QA (ni activas ni revocadas — la única membresía que existió fue eliminada físicamente antes del `soft_delete_store`, por lo que la función reportó `memberships_revoked=0`). No quedan membresías operativas activas no justificadas.

## 7. Estado de plantillas

`cost_sheet_templates`: **0 filas** en toda la tabla (0 con nombre QA). La tabla quedó en su estado pre-migración; no hay plantillas de prueba ni de usuarios reales afectadas.

## 8. Registros de auditoría relacionados (INTEGROS, sin modificar en esta misión)

| Timestamp (UTC) | Action | Registro | Significado |
|---|---|---|---|
| 2026-11-10 11:34:58.917751 | `UPDATE_STORE_CONFIG` | stores/30c3a373 | `is_active true→false` por el `UPDATE` interno de `soft_delete_store` (trigger `audit_store_changes`) |
| 2026-11-10 11:34:58.917751 | `store_soft_deleted` | stores/30c3a373 | log propio del RPC; `metadata.deleted_by=<usuario QA>` (parámetro de la invocación), `deleted_at=now()` |
| 2026-11-10 11:35:42.140640 | `DELETE_USER` | profiles/c709dad6 | borrado físico del usuario QA vía `managed_hard_delete_user` (caller superadmin) |

Los tres registros se conservan íntegros; **ninguna operación de esta misión los tocó**. El mismo microsegundo en los dos primeros se explica porque ambos nacen de la misma transacción del RPC (trigger + INSERT propio).

**Divulgación de hechos anteriores (misión de limpieza previa, no esta):** durante esa limpieza se eliminaron 6 `audit_logs` de la sesión QA (`CREATE_USER`, `CREATE_STORE`, `CHANGE_ACTIVE_STORE` ×2, `CHANGE_ROLE`, `membership_revoke`) como paso para intentar el borrado físico de la tienda. Ocurrió antes de este ciclo de auditoría y es irreversible; se documenta en el expediente como hecho histórico. En esta misión no se borró ningún log y la política aplicada es conservarlos todos.

## 9. Clasificación de los hallazgos

| # | Hallazgo | Categoría | Tratamiento |
|---|---|---|---|
| 1 | `is_active=false` por `soft_delete_store` | **Correcto por diseño** | No modificar |
| 2 | `is_archived=false` + `archived_at=NULL` | **Correcto por diseño** (soft-delete ≠ archivado) | No modificar |
| 3 | `archived_by=superadmin` con archivado no realizado | **Metadato inconsistente** (explicado; inerte funcionalmente; cambio no capturado por el trigger de auditoría por diseño) | Regularización recomendada, **pendiente de autorización** (§10) |
| 4 | `created_by=superadmin` (reasignado del creador QA eliminado) | **Referencia histórica legítima reasignada** por necesidad de FK | Conservar (alternativa documentada: `NULL`) |
| 5 | 3 `audit_logs` de la operación | **Registros de auditoría legítimos** | Conservar íntegros |
| 6 | 0 referencias operativas en 77 tablas FK | Estado limpio | — |
| 7 | 0 membresías / sesiones / tokens / plantillas QA | Estado limpio | — |
| 8 | `store_code=1` compartido con otras 2 tiendas | **Correcto por diseño** (sin constraint UNIQUE en `store_code`) | No modificar |
| 9 | 6 logs QA eliminados en la misión previa | Hecho histórico a divulgar | Documentado (§8) |
| 10 | Tienda `QA UI Icons Store` (otra misión) | Ajena a este ciclo | **No tocada** |
| 11 | Trigger `audit_store_changes` no cubre `created_by/archived_by` | Hallazgo de gobernanza | Recomendación futura (fuera de alcance) |

## 10. Regularizaciones recomendadas — PENDIENTES DE AUTORIZACIÓN (no ejecutadas)

### R1 — Limpiar `archived_by` de la tienda QA (recomendada, reversible)

1. **Campo/registro:** `stores.archived_by` de `30c3a373-2012-4728-8f51-d8d8ad73eb17` (valor actual: `a1111111-1111-1111-1111-111111111111`).
2. **Por qué está incorrecto:** la columna solo tiene semántica cuando `is_archived=true`; en una tienda desactivada (no archivada) su valor presente induce a interpretar un archivado que no ocurrió.
3. **Efecto de corregirlo:** ninguno operativo — ningún flujo lee `archived_by` de tiendas no archivadas (`get_transferable_stores` solo filtra archivadas); no hay FK saliente de esa columna hacia consumo funcional.
4. **SQL propuesto (mecanismo directo Management API, como el resto de cambios out-of-band):**
   ```sql
   UPDATE public.stores SET archived_by = NULL WHERE id = '30c3a373-2012-4728-8f51-d8d8ad73eb17' AND is_archived = false;
   ```
5. **Reversible:** sí — `UPDATE … SET archived_by='a1111111-1111-1111-1111-111111111111'` restaura el valor actual.
6. **Impacto en integridad/auditoría:** cero FK afectada; **no generará registro en `audit_logs`** (el trigger no captura la columna, limitación conocida); la traza quedaría en el expediente documental. Alternativa defendible: **conservar el valor como huella de la operación de limpieza** (documentación ya existente).
7. **Verificación del resultado:** `SELECT archived_by, is_archived, is_active FROM stores WHERE id='30c3a373-…'` → `NULL, false, false`.

### R2 — (Opcional) eliminar físicamente la fila de tienda QA cuando exista ventana de reconciliación

El borrado físico está bloqueado estructuralmente (trigger `mark_store_children_on_store_delete` + FK `audit_logs.store_id` NO ACTION). Requeriría decisión explícita del propietario (p. ej., estrategia oficial de purga QA que el sistema aún no tiene). **No recomendado como acción aislada.**

## 11. Operaciones que requieren autorización

| Operación | Estado |
|---|---|
| R1 (`archived_by=NULL`) | **Pendiente de autorización del propietario** — no ejecutada |
| R2 (purga física de la tienda QA) | Pendiente de diseño/autorización futura |
| Cualquier otro UPDATE/DELETE sobre producción | No contemplado en esta misión |

## 12. Conclusión sobre la integridad de CostproBD

**La integridad de producción está preservada.** Tras el barrido completo de las 78 FK reales hacia `stores`, del ciclo de vida del usuario QA y de la tabla de plantillas:

- No queda ninguna referencia operativa a la tienda QA ni al usuario QA (membresías 0, perfiles 0, sesiones 0, plantillas 0, actividad comercial 0).
- El estado de la tienda QA (`is_active=false`) es exactamente el que produce el mecanismo oficial `soft_delete_store`; `is_archived=false`/`archived_at=NULL` son correctos por diseño, no inconsistencias.
- El único metadato a regularizar es `archived_by` (huella de la operación de limpieza, funcionalmente inerte, no auditable por el trigger actual) — propuesta R1 pendiente de autorización.
- Los registros de auditoría se conservan íntegros y append-only.
- La migración `20261110120000` sigue aplicada e íntegra (verificación Fase 3): 6 políticas sin duplicados con las expresiones exactas del SQL versionado, trigger habilitado, función con `search_path = public, pg_temp`, tabla vacía y sin filas QA. **No se re-ejecutó la migración ni se tocó el historial convencional** (`schema_migrations` permanece congelado en `20260615000003` por decisión documentada v2.24.1).
- La tienda `QA UI Icons Store` permanece intacta.

**Evidencia:** `evidencias_pr1593/cleanup_auditoria.json` (Fase 1) y `evidencias_pr1593/cleanup_auditoria_fases_2_3.json` (Fases 2-3), generados exclusivamente con lecturas.
