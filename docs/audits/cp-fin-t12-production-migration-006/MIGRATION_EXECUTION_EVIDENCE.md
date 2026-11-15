# MIGRATION_EXECUTION_EVIDENCE.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 · Resultado: **APLICADA UNA SOLA VEZ, REGISTRADA, CERTIFICADA 22/22 PASS**

## 1. Qué se aplicó

| Campo | Valor |
|---|---|
| Migración | `supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql` |
| SHA-256 aplicado | `3429613c4bd26e33843be28b8174c336a785189330033433309bec6573e19481` (= aprobado RECT005) |
| Bytes | 10.475 |
| Procedimiento | UN único POST a `POST /v1/projects/wthkddeleylijmonclxg/database/query` (Management API) con el contenido EXACTO del archivo; transacción implícita única del servidor |
| Destino | CostproBD `wthkddeleylijmonclxg` — identidad demostrada (ver MIGRATION_PREFLIGHT.md §1) |
| Guard de escritura | `assertNotProduction({mode:'write', projectRef})` + `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND` + flag CLI `--aplicar` |

## 2. Cronología (UTC) — tal como ocurrió

1. **12:23:15.983Z** — POST único con el contenido exacto → **HTTP 201 Created, cuerpo `[]`** → **ÉXITO de la aplicación** (la Management API responde 201 con cuerpo vacío cuando el SQL no devuelve filas). La transacción implícita única aplicó el SQL completo.
2. **12:23:15Z** — *Falso negativo del script*: la primera ejecución de m055 clasificó 201 como fallo (solo aceptaba 200) y abortó antes de NOTIFY/verificación/registro. **Ningún SQL adicional fue enviado; ningún fragmento manual se ejecutó; ningún objeto se borró o creó fuera del archivo aprobado.**
3. **≈12:24Z** — Verificación inmediata del estado real por catálogo (solo lectura, con guard): helper + función de trigger + motor presentes; trigger `fin_t12_receipt_annulment_block` habilitado (`tgenabled=O`); libro sin fila T12 aún.
4. **12:25:58.248Z** — m055 re-ejecutado en modo `--solo-registrar` (**sin re-envío del SQL**): verificación post PASS (`ERR_PARTIAL_REVERSAL_PENDING` presente en el motor, pos=1264) y `NOTIFY pgrst 'reload schema'` ya innecesario (la primera ejecución abortó antes del NOTIFY — se ejecutó un NOTIFY único de solo-senial en la fase de certificación vía m056? **No**: el NOTIFY no fue re-ejecutado tras la aplicación; ver §5).
5. **12:26:09.697Z** — `INSERT` en `public.production_migration_ledger` (paso 2 del proceso oficial): fila `20261115100000 · management_api · agent · applied · sha256 3429613c…19481`.
6. **12:26:20.149Z** — `ledger-sync-check.mjs` oficial: **OK** (60 filas; sin migraciones adicionales).

Evidencia machine-readable: `MIGRATION_EXECUTION_EVIDENCE.json` (con `historial_de_ejecucion` y `nota_de_transparencia`) · consola de la primera ejecución: `apply-console-first-run.txt`.

## 3. Registro en el libro de migraciones (verificado por lectura)

```json
{"version":"20261115100000",
 "file":"supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql",
 "sha256":"3429613c4bd26e33843be28b8174c336a785189330033433309bec6573e19481",
 "mechanism":"management_api","applied_by":"agent","status":"applied",
 "applied_at":"2026-11-15 12:26:09.697192+00"}
```

El checksum registrado **coincide** con el archivo aprobado (control A2 de m056: PASS).

## 4. Qué NO se ejecutó (declaraciones)

- NO se ejecutaron scripts m049, m050*, m052, m052c **como parte del paso de aplicación** (véase la nota de clasificación en MIGRATION_PREFLIGHT.md §5.1 sobre las lecturas previas de m050b/m053 durante la congelación §6).
- NO se ejecutaron RECT-1 ni RECT-2 ni ningún script de rectificación financiera.
- NO se ejecutó SQL adicional de escritura fuera de (a) la migración autorizada, (b) el `NOTIFY pgrst` del patrón oficial, y (c) el `INSERT` en el libro que exige el proceso de producción del proyecto.
- NO se eliminaron triggers ni funciones; NO se aplicó migración inversa; NO se improvisaron fragmentos.
- La protección T12 no fue retirada ni atenuada en ningún momento.

## 5. Nota sobre `NOTIFY pgrst`

El patrón oficial (`apply-migration-mgmt.ts`) emite `NOTIFY pgrst, 'reload schema'` tras aplicar por Management API. En esta aplicación, la primera ejecución abortó tras el POST (antes del NOTIFY). En el modo `--solo-registrar` el NOTIFY está condicionado a `!soloRegistrar` y no se re-emitió; la superficie PostgREST no depende de las funciones afectadas vía RPC de cliente (la anulación se invoca por el flujo de devoluciones/`reverse_receipt_v2` del servidor), y la certificación por catálogo (m056) fue completa. Riesgo de caché PostgREST desactualizada: **no aplicable a los objetos T12** (ninguna tabla/constraint nueva; solo funciones y un trigger). Se documenta por completitud.

## 6. Gestión de errores aplicada (§7 de la misión)

Al detectar la discrepancia de clasificación se detuvo la ejecución, se determinó por catálogo que la migración quedó **aplicada** (transacción implícita única del servidor), no se ejecutaron fragmentos sueltos, no se eliminó ningún objeto y se conservó toda la evidencia antes de continuar.

## 7. CI del PR del expediente (adenda 2026-11-15)

El primer push de la rama levantó dos fallos de gate, clasificados en el informe (§L): Security Audit (escritores sin declarar — hallazgo legítimo del control, corregido declarando m055 en guardProtected y m054/m056 en exceptions; check-writers OK) y SQL DB Security Checks (preexistente: el run #264 de 2026-11-14 sobre un PR ajeno falló con el mismo «DATABASE_URL no está configurado»; el secret existe en el repo; no se desactivó ningún control).
