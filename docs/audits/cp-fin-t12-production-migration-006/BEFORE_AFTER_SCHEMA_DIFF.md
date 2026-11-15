# BEFORE_AFTER_SCHEMA_DIFF.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 · Comparación entre `prestate-snapshot.json` (2026-11-15T12:18:05Z, pre-aplicación) y `poststate-snapshot.json` (2026-11-15T12:27:40Z aprox, post-aplicación), más los informes oficiales de deriva (`drift-report-baseline.txt` 12:21:44Z / `drift-report-post.txt` 12:31:36Z).

## 1. Resumen

**La migración produjo cambios EXCLUSIVAMENTE en objetos de esquema autorizados: 2 funciones nuevas + 1 función redefinida + 1 trigger nuevo + comentarios. CERO cambios en datos financieros (importes, cantidades, saldos, estados).**

## 2. Objetos de esquema creados o redefinidos (los únicos cambios)

| Objeto | Cambio | Fuente aprobada |
|---|---|---|
| `public.fin_entry_reversal_residual(uuid)` | **CREADA** — `STABLE SECURITY DEFINER`, owner `postgres`, search_path fijado | migración §1 |
| `public.fin_post_document_annulment(text, uuid)` | **REDEFINIDA** (T12 v2) — mismo cuerpo que el archivo aprobado (hash de cuerpo verbatim idéntico, control B3 de m056) | migración §2 |
| `public.fin_t12_block_receipt_annulment()` | **CREADA** — función de trigger `SECURITY DEFINER` | migración §3 |
| `fin_t12_receipt_annulment_block` ON `receipts` | **CREADO** — `CREATE TRIGGER fin_t12_receipt_annulment_block BEFORE UPDATE OF status ON public.receipts FOR EACH ROW EXECUTE FUNCTION fin_t12_block_receipt_annulment()` | migración §3 |
| `COMMENT ON FUNCTION` × 3 | comentarios documentales sobre las 3 funciones | migración §§1-3 |
| ACL de funciones | `REVOKE ALL … FROM PUBLIC, anon` (3 funciones) + `GRANT EXECUTE` del helper a `authenticated, service_role` — exactamente lo aprobado | migración §4 |

Evidencia de catálogo: contadores del informe de deriva oficial — funciones public 615→**617** (+2 nuevas), SECURITY DEFINER 365→**367** (+2; la redefinida ya contaba), triggers 149→**150** (+1), políticas 449 (invariante), constraints 821 (invariante), índices 706 (invariante), tablas 180/180 con RLS (invariante).

## 3. Invariancia de datos financieros (11 secciones hash-idénticas pre→post)

| Sección (hash SHA-256 en los snapshots) | Pre | Post | Resultado |
|---|---|---|---|
| `fvc_cabecera` — FAC-VITALLCONS-001 | activa · 192.039.436.00 · unpaid | idéntico | **INVARIANTE** |
| `fvc_lineas` — 101 líneas (suma recomputada 192.039.436.00) | 101 | idéntico | **INVARIANTE** |
| `asiento_reconocimiento` — `93bb5da9-0afd-4325-baad-a275710062c5` | `posted` · 192.039.436 D/C | idéntico | **INVARIANTE** |
| `reversiones_asiento` | **0** | idéntico | **INVARIANTE** |
| `fin_movements_cxp_fvc` + `mayor_pas_cxp_prov` — deuda al proveedor | pendiente (1 movimiento crédito 192.039.436) | idéntico | **INVARIANTE** |
| `inventario_111_112` | 10 / 20 u | idéntico | **INVARIANTE** |
| `wac_log` | before 0 → after 1 (ambos SKU) | idéntico | **INVARIANTE** |
| `cogs_ventas` | **7 CUP** (5 asientos) | idéntico | **INVARIANTE** |
| `conteos_totales` — fin_entries 1041 · fin_movements 3540 · receipts 98 · receipt_items 309 · fin_posting_errors 0 | idéntico | idéntico | **INVARIANTE** |
| `movimientos_postcorte_111_112` | 0 | idéntico | **INVARIANTE** |
| `fin_posting_errors` | 0 filas | 0 filas | **INVARIANTE** |

Controles m056: **D5 PASS** (11/11 secciones hash-idénticas) · **D6 PASS**. Las 71 líneas no verificables, las 4 discrepancias de moneda, los vales contabilizados, el reingreso VS-000223 y el resto de documentos/asientos quedan comprendidos en las secciones congeladas y en el snapshot m050b/m053 vigente (20/20 idénticas antes de aplicar).

## 4. Integridad estructural (pre→post)

- RLS de las 6 tablas clave: idéntica byte a byte (relrowsecurity / relforcerowsecurity).
- Triggers de `receipts`: mismos 6 triggers preexistentes (todos habilitados) **+** el nuevo T12; ningún trigger deshabilitado o eliminado.
- Privilegios: `service_role` conserva EXECUTE en `fin_post_document_annulment` y `fin_post_annulment_safe` (operativa de la app); ninguna función con EXECUTE para PUBLIC/anon tras la ACL endurecida.
- Libro de migraciones: +1 fila exacta (`20261115100000`, sha256 aprobado); ninguna otra versión nueva (control A4).

## 5. Conclusión

Los cambios de esquema autorizados (2 funciones nuevas + 1 redefinición + 1 trigger + comentarios + ACL de esas funciones) **no deben confundirse con cambios de datos financieros**: la comparación demostró que no hubo modificaciones de importes, cantidades ni saldos.
