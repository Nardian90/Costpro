# PRODUCTION_POSTCHECK.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 · Fase: certificación posterior a la aplicación · Modo: **EXCLUSIVAMENTE LECTURA**

Mecánica: script `scripts/m056-t12-postcert.mjs` (re-ejecutable; guard de ref de producción; sin escrituras). Detalle machine-readable: `PRODUCTION_POSTCHECK.json`.

**VEREDICTO GLOBAL: PASS — 22/22 controles.**

La demostración funcional del bloqueo proviene de las **pruebas E2E aisladas 9/9** (`scripts/m052-t12-guard-regression.mjs`, evidencia `t12-guard-regression.json` de la misión 005) y de la **inspección del código desplegado en producción** (abajo). En producción NO se simuló ninguna anulación sobre recepción real (prohibido por la misión); todas las comprobaciones fueron de catálogo/lectura.

## A. Ledger (migraciones)

| Control | Resultado | Detalle |
|---|---|---|
| A1 Migración registrada exactamente una vez | **PASS** | 1 fila `20261115100000` |
| A2 Checksum registrado = archivo aprobado | **PASS** | `3429613c…19481` |
| A3 Mecanismo oficial y estado | **PASS** | `management_api` / `applied` |
| A4 Sin migraciones adicionales | **PASS** | únicas nuevas vs pre-aplicación: `[20261115100000]` |

## B. Función del motor (pg_get_functiondef)

| Control | Resultado | Detalle |
|---|---|---|
| B1 Detección de cobertura parcial | **PASS** | `v_residual <= 0.01` → `CONTINUE`; si no, `RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING…'` |
| B2 Cobertura total conservada (idempotencia ordinaria) | **PASS** | rama exacta `IF v_residual <= 0.01 THEN … CONTINUE;` presente; cuerpo vivo = cuerpo aprobado |
| B3 Cuerpo desplegado = archivo aprobado | **PASS** | hash del cuerpo entre `$function$` idéntico (248 líneas verbatim) |
| B4 Helper `fin_entry_reversal_residual` = aprobado | **PASS** | hash de cuerpo idéntico |
| B5 Canal `_safe` intacto y registrador | **PASS** | `fin_post_annulment_safe` sin cambios pre→post; captura `WHEN others` → inserta en `fin_posting_errors` (auditoría visible) |

## C. Trigger

| Control | Resultado | Detalle |
|---|---|---|
| C1 Existe | **PASS** | `fin_t12_receipt_annulment_block` en `receipts` |
| C2 Habilitado | **PASS** | `tgenabled='O'` |
| C3 Tabla y evento correctos | **PASS** | `BEFORE UPDATE OF status ON public.receipts FOR EACH ROW EXECUTE FUNCTION fin_t12_block_receipt_annulment()` |
| C4 Función ejecutora = código aprobado | **PASS** | hash de cuerpo idéntico |
| C5 Bloquea y advierte | **PASS** | `RAISE EXCEPTION` + `RAISE WARNING`; solo transiciones vivas→`voided/reversed` |
| C6 Ningún otro trigger anula el efecto | **PASS** | 6 triggers de receipts, ninguno deshabilitado; sin mecanismos alternativos |
| C7 Sin escape hatch | **PASS** | sin `session_replication_role`, sin `DISABLE TRIGGER`, sin `ALTER TABLE` en el código desplegado |

## D. Integridad y permisos

| Control | Resultado | Detalle |
|---|---|---|
| D1 RLS intacta (6 tablas clave, pre→post idéntico) | **PASS** | receipts/items, fin_entries/movements/posting_errors/ledger |
| D2 Sin EXECUTE para PUBLIC/anon | **PASS** | ACL endurecida aplicada; grants vivos: postgres (owner) + `service_role` (motor/safe) + `authenticated`/`service_role` (helper y función de trigger, según el propio archivo aprobado) |
| D3 `service_role` conserva EXECUTE del motor | **PASS** | la operativa de la app no se rompe |
| D4 Sin rutas de escritura nuevas fuera del diseño | **PASS** | solo las 3 funciones esperadas de anulación |
| D5 Datos financieros invariantes | **PASS** | 11 secciones hash-idénticas pre→post (ver BEFORE_AFTER_SCHEMA_DIFF.md) |
| D6 `fin_posting_errors` sigue vacío | **PASS** | 0 filas — ningún intento bloqueado ni error |

## Nota sobre privilegios de la función de trigger

`fin_t12_block_receipt_annulment()` muestra EXECUTE para `authenticated`/`service_role`: proviene de los **privilegios por defecto de la plataforma** al crear la función, no de ampliaciones de la migración (el archivo solo hace `REVOKE … FROM PUBLIC, anon`, exactamente como aprobado). Se trata de una función de trigger (solo ejecutable en contexto de trigger) y el alcance `anon` quedó revocado: no constituye una ruta de escritura alternativa ni un escape hatch (control C7).
