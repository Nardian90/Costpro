# 03_REMEDIATION_PLAN — Decisiones y justificaciones

**Principio rector de la misión:** cero huérfanos NO es el objetivo absoluto; la integridad histórica y contable tiene prioridad. Ningún tratamiento introduce datos ficticios ni destruye históricos.

---

## Matriz de decisión por categoría

| Registro | Tabla/ubicación | Problema | Dependencias | Impacto funcional | Recuperable | Acción | Evidencia |
|---|---|---|---|---|---|---|---|
| 72 versiones v1 (72 reglas muertas) | `commission_rule_versions.rule_id` | FK rota (regla eliminada con triggers FK off) | 0 financieras vivas; snapshots jsonb completos | Ninguno operativo; archivo histórico de comisiones ago–oct 2026 | Padre: no (tiendas/workers también muertos, sin auditoría); snapshot: sí (existe) | **R2 Conservar** con referencia suave + `parent_deleted_at` | forense-ABC.json §A; overlap=18/72/54 |
| 18 filas `changed_by` (17 perfiles muertos) | `commission_rule_versions.changed_by` | FK rota (perfil + Auth eliminados físicamente) | `changed_by` no se consume en UI; solo proveniencia | Ninguno | No (sin auth.users, sin user_audit_log, sin email) | **R2 Conservar** UUID como referencia suave de proveniencia | forense-origen.json: barrido de FKs a profiles = solo esta tabla |
| 10 renglones de pedido | `purchase_order_items.po_id` / `.product_id` | FKs rotas (pedidos y productos eliminados; tabla en uso activo) | 0 en kardex/stock/transacciones; snapshot comercial autónomo (nombre/sku/costo/cantidades) | SC-2-01 lee la tabla con snapshot: sin imagen rota | Padres: no; renglón: sí (snapshot completo) | **R2 Conservar** + marcadores `parent_deleted_at`/`product_deleted_at` | forense-ABC.json §C: purchase_orders VACÍA, 4 productos muertos |
| 31 objetos Storage (bucket `stores`) | `storage.objects` ↔ archivos físicos | **Ninguno: falso positivo del descargador** — los 31 archivos existen con bytes exactos | 10 referencias vivas de tiendas (todas resuelven GET 200) | Ninguno (no hay imágenes rotas) | — | **R-corr: sin acción sobre datos** + auditoría de corrección del diagnóstico | correccion-storage.json: re-verificación GET autenticado 200 ×31 |
| 153 archivos anidados fuera del respaldo 7z | Respalto `20261108-0056` (bucket privado) | Bug del descargador (URL sin prefijo + recursión sin prefijo acumulado) | Integridad del respaldo (RPO) | Ninguno en producción | Sí: re-descarga completa | **R1 Reparar el respaldo**: descargador corregido + addendum cifrado 307 archivos verificado por hash | storage-manifiesto regenerado; addendum .7z + .sha256 |

## A. Problema A — diseño de la remediación (R2: conservación histórica con trazabilidad)

**Por qué no R1 (recuperar padres):** recrear 72 reglas + 21 tiendas + ~72 workers + 17 perfiles con identidad Auth sería inventar entidades operativas que el negocio ya no tiene — prohibido (§2.5). No existe evidencia suficiente para reconstruirlos fielmente (el borrado no dejó auditoría).

**Por qué no R3 (eliminar):** los snapshots son la única evidencia de que esas reglas/configuraciones existieron y de cómo se configuraron las comisiones en su época; los renglones de pedido son evidencia de compras históricas con valor contable-documental. No hay dependencias que su conservación dañe. Eliminarlos destruiría historial para conseguir un contador a cero — exactamente lo que la misión prohíbe.

**Qué se hace (migración `20261108140000`):**
1. `parent_deleted_at` (y `product_deleted_at` en items) — marcador explícito y con comentario de esquema que documenta que el backfill usa la fecha de **primera detección certificada** (la fecha real del borrado es indeterminable).
2. Las 4 FKs duras de las tablas de snapshot se retiran (`DROP CONSTRAINT IF EXISTS`): el CASCADE de `rule_id`/`po_id` era el mecanismo que **destruiría** el histórico en cada borrado legítimo por UI/API (regla: `DELETE /api/commissions/rules/[id]`); `changed_by` debe sobrevivir a la eliminación de cuentas.
3. **Integridad de escritura restaurada** con triggers BEFORE (`trg_commission_rule_versions_validate_refs`, `trg_purchase_order_items_validate_refs`): INSERT/UPDATE hacia padre inexistente → `23503`. Las filas nuevas no pueden crear huérfanos; solo la eliminación de padres deja de destruir (que es lo querido).
4. **Triggers de marcado** (`trg_commission_rules_mark_versions`, `trg_purchase_orders_mark_items`, `trg_products_mark_po_items`): al borrar un padre (por UI, API o cascada), sus snapshots quedan marcados con timestamp — nunca más borrado silencioso.
5. Backfill de los 72+18+10 existentes (idempotente: `IS NULL` + `NOT EXISTS`) y auditoría en `audit_logs` (tag `mission=DATA-INTEGRITY-REMEDIATION-001`).

**Compatibilidad verificada:** `commission_rule_products` conserva su CASCADE (join operativo sin valor histórico); `commission_payments.rule_applied_id` conserva `ON DELETE SET NULL` (semántica ya correcta); la lectura de versiones por UI/API no consume `changed_by` (solo metadatos) — la referencia suave es invisible para la app. `managed_hard_delete_user` ya no necesita desvincular `changed_by` (la FK no existe) — sin cambios de comportamiento para el PR #1544.

## B. Problema B — corrección del diagnóstico (migración `20261108140200` + `20261108140100`)

El hallazgo original era un falso positivo (ver 02 §D). La decisión tomada:
- **CERO modificaciones de datos**: ninguna fila de `storage.objects` se toca (la primera versión de la migración B, que eliminaba 21 filas "fantasma", se desechó antes de desplegar; el clúster de verificación donde se probó fue revertido).
- La migración `20261108140100` queda como **auditoría de la corrección del diagnóstico** (incluye el registro de las 4 escrituras PUT idempotentes de la fase R1 y la causa raíz del falso positivo).
- El daño real (respaldo incompleto) se repara fuera de la BD: descargador corregido + addendum `costpro-respaldo-addendum-storage-20261108-0056.7z` (AES-256, 307 archivos, verificado por hash tras la subida).
- La UI de placeholders (banner/logo/promos con `onError`) se mantiene: no es necesaria para el estado actual, pero es la defensa correcta contra roturas futuras (archivos borrados del bucket, URLs malformadas) — misión §3 FASE III: "Evitar imágenes rotas en la interfaz".

## C. Prevención (migración `20261108140200`)

| Control | Mecanismo | Qué evita |
|---|---|---|
| `check_data_integrity()` RPC | Inventario vivo: huérfanos de referencia dura (debe ser 0), snapshots marcados vs sin marcar (debe ser 0), referencias suaves conocidas (18) | Que un huérfano nuevo pase desapercibido; detección uniforme producción/E2E |
| `reconcile_storage_metadata()` RPC | Filas del bucket `stores` sin referencia viva + referencias vivas sin fila | Fantasmas reales y referencias muertas, detectables por consulta |
| Trigger `trg_stores_mark_orphan_versions` | Marcado por `store_id` al borrar tienda (belt-and-suspenders sobre el marcado por regla) | Huecos si el borrado de tienda cae por un camino que no dispare el marcado por regla |
| `scripts/reconcile-storage.mjs` | Verificador read-only: HEAD público por cada referencia viva + RPC de filas | Verificación física (lo que SQL no puede); re-ejecutable en cualquier momento |
| Prueba estática `data-integrity-remediation-001.test.ts` | 23 asserts: idempotencia de las migraciones, triggers presentes, sin CASCADE destructivo, sin DELETE de storage.objects, placeholders UI, dry-run | Regresión de cualquiera de estas garantías |
| Descargador corregido (`12-descargar-storage.py`) | Rutas completas en URL y recursión con prefijo acumulado | Que el próximo respaldo vuelva a perder objetos anidados y fabrique fantasmas |

## D. Riesgos del propio plan y mitigación

- **Retirar FKs duras** podría permitir huérfanos si alguien INSERTA con triggers de validación desactivados. Mitigado: los triggers de validación corren con `session_replication_role=replica` DESACTIVADO no son salteables por vías normales; y `check_data_integrity()` detecta el estado. El compromiso es deliberado: la FK dura era el mecanismo de DESTRUCCIÓN del histórico (CASCADE); preferimos integridad de escritura + detección a integridad destructiva.
- **El trigger de marcado dispara por cada fila** en borrados masivos por cascada (coste O(n)). Volúmenes actuales (73 versiones, 10 items) lo hacen irrelevante; documentado como riesgo menor.
