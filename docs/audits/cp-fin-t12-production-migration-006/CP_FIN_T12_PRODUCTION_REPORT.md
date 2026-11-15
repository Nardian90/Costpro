# CP_FIN_T12_PRODUCTION_REPORT.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 (UTC) · Rama del expediente: `docs/cp-fin-t12-production-migration-006-20261115` (PR independiente, sin ediciones en `main`)
Precedentes: misiones 001-005 (expedientes en el repo) · Autorización: misión 006 §1 (migración T12 ÚNICAMENTE)

---

## A. Git, PR y SHA

| Elemento | Estado verificado |
|---|---|
| PR #1628 | **MERGED** (merge `55d4e47250a1410ddc9f30e2fdbb4f6384a7980e`, 2026-11-14T23:06:02Z) — verificado por API |
| `main` HEAD al iniciar | `011e9a23f` (merge PR #1629, docs) — contiene íntegro el árbol integrado del #1628 |
| Archivo migración en el árbol | `supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql` |
| SHA-256 vs manifiesto 005 | `3429613c4bd26e33843be28b8174c336a785189330033433309bec6573e19481` = `RECT005_SHA256SUMS.txt` **MATCH** |
| Cambios a este expediente | rama propia + PR normal (regeneración del contract-surface + retirada de la excepción temporal + evidencia); sin pushes a `main` |

## B. Identidad de la BD de destino (fail-closed)

- Producción demostrada por tres vías independientes: (1) `NEXT_PUBLIC_SUPABASE_URL` del entorno del propietario → `wthkddeleylijmonclxg`; (2) guard oficial CP-INFRA-019 con el ref exacto de la petición; (3) Management API `GET /v1/projects/wthkddeleylijmonclxg` → `{name: CostproBD, region: us-east-1, status: ACTIVE_HEALTHY}`.
- El proyecto E2E (`lguovmvrozxgssupkwpf`) no recibió ninguna operación en esta misión. No se usó ninguna conexión genérica de destino no identificable. **Sin secretos en consolas, archivos ni expedientes.**

## C. Preflight (§2-§6 de la misión)

- **Ledger real vs repo**: libro `production_migration_ledger` con 59 filas pre; `20261115100000` NO aplicada; última `20261114190300`; `ledger-sync-check` OK; pendientes: T12 + 2 históricas con compuerta propia (no tocadas). Mecanismo oficial identificado: **Management API** (el de todas las migraciones recientes del libro).
- **SQL inspeccionado íntegramente**: instala exactamente A (motor: distinción total/parcial, `ERR_PARTIAL_REVERSAL_PENDING`, canal `_safe` registra) y B (trigger `fin_t12_receipt_annulment_block` BEFORE UPDATE OF status en receipts, sin escape hatch). Compatibilidad: canal `_safe` intacto; grants de `service_role` conservados; idempotente; rollback posible (definiciones previas capturadas).
- **Congelación previa (§6)**: pre-flight institucional del runbook VIGENTE (m050b+m053: 20/20 idénticas) + captura propia m054 (17 hashes; referencias §6 confirmadas). Nota de clasificación de m050b/m053 en `MIGRATION_PREFLIGHT.md` §5.1 (lecturas de la fase §6; sin escrituras).
- **Línea base de deriva** oficial registrada (drift-report).

## D. Aplicación (§7)

- **UN único POST** con el contenido EXACTO del archivo (10.475 bytes) → **HTTP 201 Created `[]` = ÉXITO** (2026-11-15T12:23:15.983Z). Transacción implícita única del servidor.
- Incidencia menor documentada con transparencia: la primera ejecución del script clasificó 201 como fallo (falso negativo); el estado real se verificó por catálogo inmediatamente (aplicada, completa); **no se reenvió el SQL, no se ejecutaron fragmentos, no se eliminó nada, no se aplicó migración inversa**. Cronología completa en `MIGRATION_EXECUTION_EVIDENCE.md/.json`.
- Registro en el libro (paso 2 del proceso oficial): fila `20261115100000 · management_api · agent · applied · sha256 aprobado` (12:26:09.697Z). `ledger-sync-check` post: **OK**.

## E. Certificación posterior (§8) — SOLO LECTURA

**PASS 22/22** (`PRODUCTION_POSTCHECK.md/.json`, script re-ejecutable m056):

- **A. Ledger**: registrada una vez; checksum = archivo aprobado; mecanismo/estado correctos; **ninguna migración adicional**.
- **B. Motor**: definición viva = cuerpo aprobado (hash verbatim); cobertura parcial → `ERR_PARTIAL_REVERSAL_PENDING`; cobertura total → idempotencia conservada; canal `_safe` intacto y registrador.
- **C. Trigger**: existe, habilitado (`O`), `BEFORE UPDATE OF status ON public.receipts`, función ejecutora = código aprobado, ningún mecanismo que anule su efecto, sin escape hatch.
- **D. Integridad**: RLS intacta (6 tablas, byte a byte); ACL sin PUBLIC/anon; `service_role` operativo; sin rutas de escritura nuevas; **11 secciones de datos financieros hash-idénticas pre→post**; `fin_posting_errors` = 0.
- Demostración funcional: **pruebas E2E aisladas 9/9** (misión 005) + inspección del código desplegado. En producción **no se simuló ninguna anulación** (prohibido).

## F. Antes/después (§9)

Cambios de esquema autorizados y **exclusivos** (drift oficial: +2 funciones, +1 trigger; políticas/constraints/índices/RLS invariantes):
`fin_entry_reversal_residual` (nueva) · `fin_t12_block_receipt_annulment` (nueva) · `fin_post_document_annulment` (redefinida T12) · trigger `fin_t12_receipt_annulment_block` (nuevo) · comentarios y ACL de esas funciones.

**Cero cambios de datos financieros**: FAC-VITALLCONS-001 (activa, 192.039.436, 101 líneas) · asiento `93bb5da9…` (posted, 0 reversiones) · CXP pendiente · stock 10/20 · WAC 1 · COGS 7 · vales contabilizados · kardex · 71 líneas no verificables · 4 discrepancias de moneda · resto de documentos — todo **invariante** (11/11 secciones + 20/20 del pre-flight). Informe: `BEFORE_AFTER_SCHEMA_DIFF.md`.

## G. Contract-surface y allowlist (§10)

- Surface regenerado desde producción viva (208 funciones; `b15b9d2c…585829f`): la definición viva coincide con el código y la migración.
- Excepción temporal `fin_post_document_annulment/2`: **retirable** (0 divergencias bloqueantes sin ella; único consumidor: el test estático). Retirada en la rama del PR junto con el surface regenerado. La excepción `create_devolution_v2/12` del PR #1616 NO se tocó (ajena a esta migración; nota: su migración ya figura aplicada en el libro).
- Resultado: `CONTRACT_SURFACE_RESULT.md`.

## H. Aplicación (§11) y estado operativo

- Vercel producción: **success** «Deployment has completed» sobre `011e9a23fe` (main, 2026-11-15T11:51:53Z; vercel[bot]); la integración del #1628 (`55d4e47250`) ya tenía deployment Production success (23:07Z). La migración es un cambio de BD y no requiere redeploy.
- App responde: HTTP 302 (redirect al shell protegido — comportamiento normal ante sondas sin sesión, igual que en la misión 005).
- Sin errores nuevos atribuibles a la migración (`fin_posting_errors` = 0; ningún error de aplicación detectado). La instalación de T12 **no activó automáticamente ninguna rectificación** (RECT-1/RECT-2 siguen NO ejecutadas).

## I. Declaraciones

1. **T12 instalada y verificada en producción. Rectificación financiera todavía NO ejecutada.**
2. Se aplicó **exclusivamente** la migración `20261115100000` por el cauce oficial; ninguna otra migración, limpieza, reset o reconstrucción.
3. **RECT-1 (151.299.851 CUP) y RECT-2 (24 CUP): NO ejecutadas** — quedan pendientes de la autorización contable expresa e independiente del propietario, referida expresamente a `RECT004_PRODUCTION_RUNBOOK.md` y `RECT004_ADDENDUM_T12_GUARD.md`.
4. La autorización de esta misión se interpretó con su alcance estricto (instalar y verificar la protección T12); **no** como permiso para el runbook financiero.
5. El total corregido 40.739.585 CUP continúa siendo **PRELIMINAR**.
6. Ningún secreto o credencial fue impreso, copiado o commiteado (escaneo en la preparación del PR).

## J. Criterios de aceptación (§13)

| Control | Resultado |
|---|---|
| Identidad del proyecto | **PASS** — producción inequívoca (3 vías) |
| SHA integrado | **PASS** — main `011e9a23f` contiene `55d4e4725` (PR #1628 merged) |
| Archivo SQL | **PASS** — checksum aprobado |
| Migraciones pendientes adicionales | **PASS** — ninguna aplicada (solo T12) |
| Migración T12 | **PASS** — aplicada una sola vez |
| Ledger | **PASS** — registro correcto (A1-A4) |
| Función contable | **PASS** — definición viva certificada (B1-B5) |
| Trigger | **PASS** — existente, habilitado, efectivo según su definición (C1-C7) |
| RLS y privilegios | **PASS** — integridad conservada (D1-D4) |
| Datos financieros | **PASS** — sin cambios (D5-D6) |
| Snapshot antes/después | **PASS** — importes y cantidades invariantes |
| Contract-surface | **PASS** — resultado documentado; excepción T12 retirada en PR |
| RECT-1 | **NO EJECUTADA** |
| RECT-2 | **NO EJECUTADA** |
| Expediente | **PASS** — completo y con hashes (SHA256SUMS.txt) |

**Veredicto de la misión: PASS (ninguna condición crítica en FAIL o BLOCKED).**

## K. Contenido del expediente

`MIGRATION_PREFLIGHT.md` · `MIGRATION_EXECUTION_EVIDENCE.md/.json` · `PRODUCTION_POSTCHECK.md/.json` · `BEFORE_AFTER_SCHEMA_DIFF.md` · `CONTRACT_SURFACE_RESULT.md` · `RECTIFICATION_READINESS.md` · `WORKLOG_MISION_006.md` · `SHA256SUMS.txt` · evidencia machine-readable: `prestate-snapshot.json`, `poststate-snapshot.json`, `ledger-pre-aplicacion.json`, `drift-report-baseline.txt`, `drift-report-post.txt`, `apply-console-first-run.txt` · scripts re-ejecutables: `scripts/m054-t12-prod-prestate.mjs`, `scripts/m055-t12-apply.mjs`, `scripts/m056-t12-postcert.mjs`.

## L. CI del PR del expediente (#1630) — resultados y atribución

Ejecución sobre el SHA inicial de la rama (`308b3a1ac`), 2026-11-15T12:39Z: 9 check-runs — verdes: Vercel Preview Comments · TypeScript Security Checks · SQL Static Checks · Allowlist Review (+ en curso: Unit&Integration, E2E Aislado, TypeCheck+Lint+Unit+Build). Dos fallos, clasificados:

1. **Security Audit — hallazgo legítimo del control del repo, CORREGIDO en la rama**: el verificador de escritores (`check-writers`) detectó los 3 scripts nuevos (m054/m055/m056) sin declarar en `scripts/lib/writers.manifest.json`. Corrección: m055 declarado `guardProtected` (importa `assert-not-production` con projectRef real + doble flag + `--aplicar`), m054/m056 declarados `exceptions` READ-ONLY (solo SELECT; misma convención que m050b/m053). `node scripts/lib/check-writers.mjs` → **OK** (43 guardProtected · 24 isolationProtected · 134 excepciones). La corrección va en el segundo push de la rama (sin desactivar ningún control: el manifiesto es exactamente el mecanismo previsto).

2. **SQL DB Security Checks — fallo PREEXISTENTE, no introducido por esta misión**: el job exige `secrets.DATABASE_URL` y en este run la vio vacía. El secret EXISTE en el repo (`DATABASE_URL`, updated 2026-10-19). Evidencia de preexistencia: el **run #264 del mismo workflow (2026-11-14T17:40Z, head `671ff6258f`, PR ajeno a esta misión) falló con el error idéntico** «DATABASE_URL no está configurado», y los runs #265/#269/#270/#271 pasaron. Clasificación: comportamiento de inyección de secrets en eventos `pull_request` (infra GitHub), externo al contenido de la rama (el job estático SQL Static Checks pasa y el PR no toca `supabase/migrations/**`). No se desactivó ni degradó ningún control para obtener verde; el gate de BD en vivo fue certificado en esta misión por canales independientes (catálogos vía Management API con guard, m056 22/22).

## M. Re-chequeo post-corrección

Segundo push de la rama (manifiesto de escritores + addendum): nueva ejecución de los gates sobre el SHA actualizado; Security Audit pasa con la declaración de escritores; el estado del SQL DB Gate se registra tal cual (sin manipularlo). El expediente de esta misión no depende del CI del PR: la migración quedó aplicada y certificada en producción por evidencia independiente (ledger + catálogos + m056).
