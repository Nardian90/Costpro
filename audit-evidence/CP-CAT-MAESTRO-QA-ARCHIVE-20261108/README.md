# Archivo del maestro de pruebas QA — `QA-CM-20261030-01`

**Fecha:** 2026-11-08 · **Petición del propietario:** «archiva el maestro de pruebas QA para
cuando vuelva a ser necesario» · **Mecanismo:** verificación read-only (sin escrituras: ya
estaba archivado desde el cierre del piloto CP-CAT-MAESTRO-004, 2026-10-30 15:03 UTC).

## Estado vivo verificado (producción `CostproBD` `wthkddeleylijmonclxg`)

Evidencia completa: `estado-readonly-20261108.txt` (salida literal del script
`scripts/ops/qa-master-estado-readonly.mjs`, solo SELECT).

| Comprobación | Resultado |
| --- | --- |
| `master_products.status` | **`archived`** ✅ (desde 2026-10-30 15:03) |
| Filas locales `products` con `master_product_id` | **0** ✅ |
| Referencias operativas (inventory / transaction_items / receipt_items) | **0 / 0 / 0** ✅ |
| `master_change_log` | 5 entradas (creación + identidad v2 + imagen), intactas |
| `audit_logs` | CREATE_MASTER_PRODUCT + 3× UPDATE_MASTER_PRODUCT |
| Objetos Storage del piloto | eliminados al cierre (fase-6 del MAESTRO-004); `image_path` del maestro queda colgante (solo cosmético, sin fila local que lo muestre) |

Conclusión: **el maestro está archivado, preservado y huérfano por diseño** — no aparece en
ningún catálogo de tienda (no tiene fila local) ni interfiere en reconciliaciones (SKU único,
sin colisiones). No se requirió ninguna escritura en producción.

## Runbook de reactivación (cuando vuelva a ser necesario)

1. **Desarchivar el maestro** — NO hay RPC autorizado que acepte `status`
   (`update_master_product` → `fn_master_apply_identity_changes` solo permite
   sku/name/description/image_path/barcode/barcode_type/unit_of_measure/is_service).
   Vía Management API (como la limpieza del piloto):
   `UPDATE public.master_products SET status='active', updated_at=now() WHERE sku='QA-CM-20261030-01';`
2. **(Opcional) limpiar la imagen colgante** — vía `update_master_product` con
   `{"image_path": null}` (sí está permitido por el RPC) o en el mismo UPDATE.
3. **Activar en una tienda** — Catálogo → buscar el SKU → «Activar en esta tienda»
   (RPC `activate_master_product(p_master_id, p_store_id)`): crea la fila local enlazada,
   sin existencias, sin precios de otras tiendas, y audita `ACTIVATE_MASTER_PRODUCT`.
   Nota: con status `archived` el RPC lanza `ERR_MASTER_ARCHIVED` — por eso el paso 1 es
   imprescindible y va primero.
4. **Volver a archivar al terminar** — `UPDATE … SET status='archived'` + eliminar la fila
   local si se desea (misma limpieza de la fase 6 del MAESTRO-004).

## Trazabilidad

- Script de verificación: `scripts/ops/qa-master-estado-readonly.mjs` (solo lectura).
- Origen del objeto: piloto CP-CAT-MAESTRO-004 (`audit-evidence/MAESTRO-004/`).
- Referencia cruzada: `docs/audits/2026-11-08-catalogo-maestro-enervida-recepciones/`
  (lo clasificó como «1 maestro QA archivado sin correspondencia — conservado por diseño»).
