# 02_FORENSIC_ANALYSIS — Análisis forense por inconsistencia

Evidencia completa en `evidencia/` (forense-ABC.json, forense-origen.json, correccion-storage.json, storage-recuperacion.json). Todas las consultas ejecutadas contra la copia local fiel del dump `20261108-0056`.

---

## A. Las 72 versiones de reglas de comisión huérfanas

**Qué son.** `commission_rule_versions` es la tabla de snapshots de reglas de comisión (columna jsonb `snapshot`): cada INSERT/UPDATE de una regla en `commission_rules` dispara `snapshot_commission_rule()` que crea una versión numerada con la configuración completa (tipo, porcentaje/fijo/salario, base de cálculo, prioridad, vigencias, worker, tienda, rangos de precio, modo producto). Es el mecanismo para **reconstruir comisiones históricas**.

**Qué se encontró.**
- 72 filas huérfanas (98,6 % de la tabla), una por cada una de 72 reglas padre **distintas**. Todas son versión **1** con `change_reason` NULL — el snapshot de creación de cada regla, creado orgánicamente por el trigger.
- Rango temporal: 2026-08-06 → 2026-10-05, con ráfagas concentradas (29-sep: 23, 30-sep: 5, 1-oct: 11, 4-oct: 16, 5-oct: 5, más 2 del 10-sep, 2 del 6-ago, etc.).
- Los snapshots referencian **72 workers distintos y 21 tiendas distintas — ninguno existe hoy** (verificado contra `workers` y `stores`): la inmensa mayoría de una tienda muerta `6b5eff1a` (51 versiones).
- **Cero dependencias financieras vivas**: el único `commission_payment` existente referencia la regla VIVA; `commission_payments.rule_applied_id` no tiene huérfanos; no existe `commission_receptions`; 0 menciones de las reglas muertas en `business_events` y `audit_logs`.
- **Cero evidencia del borrado**: `audit_logs` no tiene ni un solo registro sobre `commission_rules`/`commission_rule_versions` (acción DELETE o de otro tipo); `user_audit_log` vacío para los implicados.
- Las 21 tiendas muertas de los snapshots tampoco existen en `stores` (hoy hay 6 tiendas vivas, ninguna coincide).

**Cómo pudieron quedar huérfanas.** La FK `rule_id → commission_rules ON DELETE CASCADE` estaba **validada** en producción. Con triggers activos es imposible que la regla muera y la versión sobreviva. Por tanto las filas entraron o los padres salieron con triggers FK desactivados. El patrón coincide con los scripts de reset del repo (`supabase/scripts/reset_demo_data_pro.sql`, `DEMO_RESET_SCRIPT*.sql`) que ejecutan `SET session_replication_role='replica'` y truncan `profiles`, `stores`, `purchase_orders`, `products`… pero **no** las tablas de snapshot (`commission_rule_versions`, `purchase_order_items` no están en su lista de TRUNCATE) — o con un borrado manual equivalente en el SQL Editor. *(Seguimiento CP-INFRA-020, 2026-11-10: esos scripts ya no pueden ejecutarse contra producción — guard embebido fail-closed que exige BD desechable; ver `supabase/scripts/README.md`.)* La ráfaga sep–oct y la presencia de workers de una tienda de demo hoy inexistente apuntan a un teardown masivo de datos de demostración/prueba sin auditoría.

**¿Legítimo el borrado o error?** Indeterminable con la evidencia disponible (no hay log del borrado). Lo verificable: (a) los datos eran de tiendas/workers de demostración ya inexistentes; (b) no queda ninguna dependencia financiera viva de esas reglas; (c) los snapshots en sí son el único registro de que esas reglas existieron.

**¿Necesarias para reconstruir comisiones históricas?** Los snapshots contienen la configuración completa por la que se rigieron comisiones de su época; aunque hoy no hay pagos que las referencien, son el archivo histórico del sistema de comisiones y la única evidencia de la configuración aplicada entre agosto y octubre de 2026. **Sí se conservan** (tratamiento R2).

**Tratamiento.** R2 — conservación histórica con trazabilidad: FK dura → referencia suave + `parent_deleted_at` (marcador explícito). Ver 03 §A.

## B. Las 18 referencias a perfiles inexistentes (`changed_by`)

**Qué se encontró.** 18 filas de `commission_rule_versions` (de las 72 de arriba — el solapamiento es total: 18 = filas cuyo `changed_by` tampoco existe) con `changed_by` apuntando a **17 perfiles inexistentes** (uno repetido en 2 filas).

- Ninguno de los 17 UUID existe en `auth.users` — **sin identidad recuperable** (no es "usuario dado de baja con identidad viva": la identidad Auth fue eliminada físicamente).
- `user_audit_log`: 0 registros para esos 17 (no fueron borrados por `managed_hard_delete_user` — la RPC del PR #1544 escribe auditoría; además esa RPC no existía en la época de la ráfaga).
- `audit_logs`: 0 DELETE sobre `profiles`.
- El barrido de TODAS las FKs del esquema hacia `profiles` (todas las columnas de todas las tablas) encuentra huérfanos **únicamente** en `commission_rule_versions.changed_by` — ninguna otra tabla quedó apuntando a estos perfiles. Esto descarta "error de sincronización" y confirma un borrado físico masivo de perfiles (mismo episodio de teardown que A).

**Origen.** Los perfiles fueron eliminados físicamente (con Auth incluida) por el mismo mecanismo de teardown masivo con triggers desactivados que eliminó las reglas/tiendas/workers. La FK `changed_by → profiles` (NO ACTION) no bloqueó nada porque estaba desactivada en ese momento, y quedó "validada" de mentira (el validado es de antes de la inserción de las filas huérfanas o el trigger se reactivó después).

**¿Identidad recuperable y demostrable?** No: sin `auth.users`, sin `user_audit_log`, sin `audit_logs`, sin email, sin nombre. La única evidencia es el UUID en `changed_by`.

**Tratamiento.** R2 — conservación como **referencia suave de proveniencia**: `changed_by` conserva el UUID (el registro histórico de quién configuró cada regla es valioso aunque la cuenta ya no exista); la FK dura se retira y `check_data_integrity()` reporta el conteo como estado conocido y trazable (18), no como error. Ver 03 §A.

## C. Las 10 posiciones de pedido huérfanas

**Qué se encontró.** `purchase_order_items` tiene exactamente 10 filas y **las 10 son huérfanas por ambos lados**: `purchase_orders` está VACÍA (0 pedidos) y los 4 `product_id` referenciados no existen.

- Cada renglón es un **snapshot comercial completo y autónomo**: `product_name`, `sku`, `quantity_ordered`/`quantity_received`, `unit_cost`, `unit_of_measure`, `created_at` (2026-09-10 ×7, 09-11 ×1, 09-27 ×1 — 9 pedidos muertos distintos).
- **Cero impacto contable vivo**: 0 referencias desde `kardex_entries`, `stock_movements`, `transaction_items`, `receipts` (po_id) a los pedidos/productos muertos; 0 menciones en `business_events`.
- El documento legal SC-2-01 (`sc201.ts`) lee esta tabla con sus columnas snapshot: el nombre/costo del renglón NO depende del producto vivo.
- Los 20 `audit_logs` de pedidos existentes son de OTROS pedidos (8-ago) que también fueron borrados después — también sin log de borrado.

**Origen.** Idéntico al de A: los pedidos (`purchase_orders`) y productos fueron eliminados con triggers FK desactivados; los renglones snapshot sobrevivieron porque su FK (`po_id ON DELETE CASCADE`) no actuó. La tabla NO es legada: está en uso activo (API de pedidos, SC-2-01, E2E).

**Tratamiento.** R2 — conservación (el renglón es la evidencia histórica de compras hechas; su snapshot no depende de los padres) + marcadores `parent_deleted_at`/`product_deleted_at` + validación de escritura para filas nuevas. Ver 03 §A.

## D. Los 31 objetos "inexistentes" de Storage — FALSO POSITIVO

**Historia del hallazgo.** El manifiesto del respaldo (`storage-manifiesto-20261108-0056.json`, generado por `scripts/respaldo-costpro/12-descargar-storage.py`) reportó 31 "objetos fantasma" en el bucket `stores`: filas de `storage.objects` cuyo GET devolvía `NoSuchKey`.

**Re-verificación de esta misión (cronología completa):**
1. FASE I.D reprodujo el NoSuchKey para las 31 rutas (02:00 UTC aprox.) — **con el mismo método defectuoso** (ver abajo), pareciendo confirmar el diagnóstico.
2. La verificación con **rutas completas** contra el origen (GET autenticado, ~02:20 UTC) demostró que **los 31 archivos existen físicamente** con sus bytes exactos de metadato — incluidas las 21 rutas que esta misión había clasificado R3 ("eliminación justificada") y las 10 con referencia viva.
3. Consecuencia inmediata: la eliminación R3 preparada en la primera versión de la migración B **se desechó** antes de llegar a producción (las 21 filas solo se borraron en el clúster local de verificación, que fue revertido re-restaurando el dump). Ninguna fila de `storage.objects` de producción fue eliminada en ningún momento.

**Causa raíz del falso positivo (dos bugs en el descargador):**
- Bug 1: al recursar carpetas, el list (`POST /storage/v1/object/list/{bucket}` con `prefix`) devuelve `name` **relativo al prefijo**; la URL de descarga se construía como `/object/{bucket}/{name}` **omitiendo el prefijo** → pedía `/object/stores/277fc216-….jpg` en vez de `/object/stores/store-banners/277fc216-….jpg` → `NoSuchKey` → "fantasma".
- Bug 2: la recursión de carpetas hacía `procesar(nombre, ruta + '/')` perdiendo el prefijo acumulado — sin efecto en `stores` (un solo nivel de carpeta) pero letal para `reports` (doble anidación `reports/cost_sheet/…`): ese bucket descargó 0 archivos.

**El defecto REAL descubierto:** el respaldo 7z original NO contiene los 153 objetos anidados (31 de `stores` + 122 de `reports`) — 307 archivos reales vs 153 respaldados. Corregido: descargador arreglado (ambos bugs), re-descarga completa verificada (307 archivos, 0 errores, 0 discrepancias de tamaño, SHA-256 por archivo en el manifiesto regenerado) y **addendum cifrado** `costpro-respaldo-addendum-storage-20261108-0056.7z` subido al bucket privado `respaldos-costpro` y verificado por hash.

**Escrituras en producción durante la fase R1 (antes del descubrimiento):** 4 PUT (banner + 3 promos de ENERVIDA) con copias byte-exacta del repositorio (proveniencia git `e595fcda0`, 2026-07-05) a sus **mismas rutas**: PUT idempotente sobre objetos que ya existían, verificado GET público 200 y SHA-256 idéntico al original del repo. Sin efecto neto sobre los datos (mismo contenido, misma ruta, mismo tamaño registrado). Registrado en `audit_logs` por la migración B.

**Estado real del bucket `stores`:** 31 filas ↔ 31 archivos físicos; las 10 referencias vivas (logo/banner/firma/sello/3 promos de ENERVIDA; logo/firma/sello de COSTPRO (Prueba)) resuelven todas con GET 200. **No hay imágenes rotas en producción.** (La UI placeholders del PR queda como defensa para roturas futuras.)

## E. Síntesis causal

Un único episodio (o pocos) de **borrado masivo con triggers FK desactivados** (patrón de los scripts demo-reset) eliminó en producción: ≥72 reglas de comisión + sus workers (≥72) + 21 tiendas + 17 perfiles con su identidad Auth + ≥9 pedidos con sus productos — sin escribir una línea de auditoría. Los snapshots (72 versiones + 10 renglones) sobrevivieron de milagro por el mismo mecanismo que debería haberlos destruido (CASCADE desactivado). El diseño estructural que lo permitió y lo seguiría permitiendo: FKs CASCADE sobre tablas de histórico + verificaciones de integridad inexistentes + borrados por UI sin trazabilidad. Las migraciones A y C cierran esas tres vías.
