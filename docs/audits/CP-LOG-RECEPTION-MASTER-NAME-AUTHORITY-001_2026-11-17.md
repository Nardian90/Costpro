# CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — Expediente de cierre

**Fecha:** 2026-11-17 · **Misión:** Autoridad del nombre del Catálogo Maestro en la importación Excel de recepciones (Inicio → OPERACIÓN → Logística → Recepciones → Nueva Recepción → Importar Excel).

**Decisión vinculante bajo la misión:** el nombre del Catálogo Maestro es la autoridad del producto. El Excel de recepción NO renombra productos maestros existentes; SOLO un producto verdaderamente nuevo (clase D) toma su nombre inicial del Excel. La recepción es un documento operativo, no un mecanismo de edición del catálogo.

---

## 1. Causa raíz (demostrada en la FASE 1 de la misión)

La autoridad del nombre existía SOLO como efecto colateral del trigger de identidad (`trg_products_master_identity_guard`, coerción silenciosa `SELECT m.sku, m.name INTO NEW.sku, NEW.name`). Los escritores y la UI seguían sesgados al Excel:

| Punto de escritura | Sesgo detectado |
|---|---|
| `resolve_reception_import_rows` · activate_local (fila nueva) | `INSERT products` con `COALESCE(v_name_excel, …)` |
| `resolve_reception_import_rows` · new_master en carrera multitienda | fila local de ESTA tienda con el nombre del Excel propio, no del ganador |
| `register_reception` · casos A4/A5 | fila local con el nombre del payload |
| FE previsualización (`ProductReceptionView.tsx`) | nombre Excel PRINCIPAL, maestro en tooltip (§6 violada) |
| FE líneas de borrador (`useReceptionState.ts`) | `item.name` = nombre Excel (§7, borrador) |

`master_products.name` tenía CERO escritores en el flujo (verificado); `receipt_items` no tiene columna `name` (sin instantáneas; el nombre mostrado proviene SIEMPRE de `products.name` → canónico).

## 2. Implementación (PR principal #1645)

- Rama `fix/reception-master-name-authority-20261117` (3 commits: `7d954267a` fix · `6ff96dd99` test · `d75f3d8b7` hardening+evidencia) → **fusionada en `main` como merge `2eb8fc14f59cf2e8c042c5ca0137209ce8a7e22c`** (mecanismo normal de GitHub, sin bypass; base avanzada con PRs docs #1643/#1644 sin solapamiento de archivos).
- CI del PR sobre el head `d75f3d8b7`: **9/9 success** (TypeCheck+Lint+Unit+Build · Unit&Integration · E2E Aislado (project) · Security Audit · SQL Static · SQL DB Security · TypeScript Security · Allowlist Review · Vercel Preview).
- Archivos: migración + FE (`ProductReceptionView.tsx`, `useReceptionState.ts`, helper `src/lib/receptions/name-authority.ts`) + pruebas (helper puro, contrato estático de migración, E2E 646 líneas, manifiesto replay 178) + allowlist con las 2 baselines temporales.

## 3. Migración aplicada en producción (autorizada)

- Archivo: `supabase/migrations/20261117120000_cp_reception_import_name_authority.sql`
- **SHA-256: `66987de709dedf3c70152daf6f218cf11dfdff38132323204b568d1e6f61e6a4`** (61386 bytes; coincide con el archivo fusionado y con `audit-evidence/INFRA-011/e2e-migrations-manifest.json`, posición 178).
- **Preflight (8/8 controles, solo lectura):** migración no aplicada (schema_migrations=0, ledger=0); orden válido (última aplicada 20261116140100); `trg_products_master_identity_guard` y `trg_products_master_link_guard` activos (`tgenabled='O'`); precondiciones LIVE exactas (classify sin `effective_name`; resolve con `COALESCE(v_name, v_class->>'name')`, sin `master_name`, sin UPDATE de maestros; register con payload-name, SECURITY DEFINER, RETURNS uuid, fail-closed, trazabilidad); sin sesiones concurrentes sobre las funciones; libro en estado esperado. Snapshots pre: maestros 260 (259 activos) hash `b960aeb6ca32ca2d454bb73d2afa2f5e`; products 436 hash `7f1a1dab3e372e288d358459dd9436fb`.
- **Aplicación:** mecanismo canónico del proyecto (Management API, lote ÚNICO atómico, guard doble `--authorize` + `ALLOW_PROD_WRITE`, script `scripts/prod-apply-migration.mjs`). `NOTIFY pgrst, 'reload schema'` OK. El guard estructural del final de la migración (`CP-LOG-NAME-AUTHORITY-GUARD`) pasó — el lote es transaccional, si hubiera fallado nada se aplicaría.
- **Libro canónico:** fila id=68, version `20261117120000`, status `applied`, mechanism `management_api`, evidence JSON con misión/SHA/merge/autorización. (El applier imprimió "Registrar el libro manualmente YA" porque su `ON CONFLICT (version)` no matchea el índice parcial `(version) WHERE status='applied'`; el registro manual idempotente fue la vía correcta, misma que instruye el propio script.)
- **Integridad de datos:** hashes post-migración **idénticos** a los pre (`b960aeb6…` / `7f1a1dab…`) — **cero cambios de datos**: la migración solo redefine funciones y ejecuta su guard estructural (sin DML sobre negocio, verificado antes de fusionar).

## 4. Recertificación LIVE de las funciones (FASE 5)

Cuerpos LIVE (`pg_get_functiondef`) vs cuerpos del repo, **byte a byte**:

| Función | LIVE == repo | Tamaño |
|---|---|---|
| `fn_classify_reception_import_row` | idéntico | 11515 bytes |
| `resolve_reception_import_rows` | idéntico | 18522 bytes |
| `register_reception` | idéntico | 16162 bytes |

Aserciones de la autorización (todas en verde sobre producción):

- **A — classify:** salida ADITIVA `effective_name`; `v_effective_name := v_master_name` (autoridad del maestro) en 4 ramas de salida; Excel solo para clase D / `new_local`; `master_name` explícito para distinguir del nombre recibido.
- **B — resolve:** `v_master_name := NULLIF(v_class->>'master_name','')` explícito; SIN `UPDATE (public.)master_products`; la carrera multitienda relee el nombre del ganador (`SELECT id, status, name INTO v_master_id, v_master_status, v_master_name`); `product_name` canónico en los 4 resultados; contrato jsonb preservado; idempotencia probada por E2E.
- **C — register_reception:** ramas conectadas A4/A5 comparten la fila VALUES `p_store_id, v_new_tenant_id, v_master_id, v_new_sku, v_master_name` (≥2 apariciones); el caso histórico B (tienda NO conectada, `btrim(v_new_product->>'name')`) aparece EXACTAMENTE una vez; marcador `name_source, 'master_canonical'`; trazabilidad `local_name_requested` conservada; fail-closed `ERR_MASTER_LINK_CONFLICT` / `ERR_MASTER_ARCHIVED` / `ERR_UNAUTHORIZED_MASTER_CREATE` intactos.
- **D — identidad:** trigger activo con eventos `BEFORE INSERT OR UPDATE OF sku, name, master_product_id`; la función de identidad coherciona `m.sku, m.name` — ningún escritor del flujo puede introducir un nombre divergente.
- **E — recepción guardada:** `receipt_items` SIN columna `name` (sin instantáneas del Excel); las 309 líneas existentes de producción resuelven su nombre vía el producto asociado (join `receipt_items→products`) — 309/309 con nombre canónico.
- **ACL:** `classify_reception_import_rows`, `resolve_reception_import_rows`, `register_reception` — `anon` SIN execute, `authenticated` CON execute (contrato preservado).

## 5. Contract-surface y retirada de las 2 baselines temporales (FASE 6)

- Surface re-exportado desde producción LIVE: **210 funciones**, SHA-256 `50859b269156d133f93a1609a315ba482d3f501f2c8a08f7319fee2e9bd22845`.
- Drift del surface: EXACTAMENTE las 2 funciones de la misión (`register_reception/11`, `resolve_reception_import_rows/4`) — ninguna otra función cambió.
- **Retiradas las 2 entradas temporales** de `source_of_truth_baseline` de esta misión (`resolve_reception_import_rows/4` y `register_reception/11`, `BODY_DRIFT_FROM_MIGRATION`) una vez demostrado el drift desaparecido.
- Excepciones legítimas de otras misiones intactas: `create_devolution_v2/12` (PR #1616) conservada; baselines históricas de SEARCH_PATH/ANTI_SPOOFING intactas. Sin limpieza general.
- Contrato LIVE re-ejecutado tras la retirada: **210/210 PASS, 0 violaciones**. Contrato estático: **210/210 representadas, 0 divergencias bloqueantes** (2 warnings MEDIUM/LOW preexistentes, semántica idéntica al LIVE).

## 6. Verificación funcional en producción — SOLO LECTURA (FASE 8)

Sonda `classify_reception_import_rows` (STABLE, sin escrituras — verificado por hashes idénticos antes/después) contra producción con auth service-role, tienda conectada real (ENERVIDA-VITALLCONS):

| Escenario | Fila | Resultado LIVE |
|---|---|---|
| Producto existente y activo con nombre Excel diferente | SKU `157`, Excel «royal cole 157 (nombre Excel distinto)» | `status=identified`; **`effective_name=«Royal Cole»`** (nombre oficial del maestro); `master_name=«Royal Cole»`; nombre Excel disponible como secundario; reasons=[] |
| Producto verdaderamente nuevo | SKU `RNAU-…-NUEVO` | `status=new_master`; **`effective_name`=nombre del Excel** (única vía legítima del Excel para nombrar); `master_name=null` |

Escenarios restantes verificados por estructura LIVE + E2E aislado con auth real (la escritura pertenece a la BD aislada, como exige la autorización): local inactiva → activación conservando el nombre canónico; archivado global → reactivación gobernador-only sin tocar el nombre; ambigüedad/nombre que coincide con otro SKU → `review` con `ERR_NAME_MATCH_REQUIRES_REVIEW` (no se crea ni renombra nada); reimportación del mismo Excel → idempotente; dos tiendas con nombres diferentes para el mismo maestro → ambas filas locales con el nombre del maestro ganador (carrera re-leída); tienda NO conectada → alta local histórica con su nombre (comportamiento preservado).

**Evidencia UI (BD aislada, código idéntico al fusionado):** `audit-evidence/cp-reception-name-authority-001/preview-nombre-oficial.png` — previsualización con el nombre oficial del maestro como principal, el nombre recibido en Excel como secundario y la acción explicada (§6). La línea de borrador usa el nombre canónico (§7).

**Regla absoluta demostrada:** la importación NO renombra un producto existente del Catálogo Maestro (E2E test 17 específico: cero UPDATEs no autorizados de `master_products.name` en el flujo completo; `master_change_log` sin entradas de renombrado).

## 7. Controles finales (FASE 9 — sobre el head de conciliación)

| Control | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | 0 errores |
| ESLint | 0 errores (1570 warnings preexistentes) |
| Pruebas unitarias (vitest, suite completa) | **6155 passed**, 0 fallos (452 ficheros) |
| E2E aislado de la misión | **17/17 passed** (16 escenarios §11 + UPDATE no autorizado + flujo UI con captura) |
| E2E regresión misión previa (integridad Catálogo Maestro) | **20/20 passed** |
| data-hygiene-guard | **PASS — net delta = 0** (stores=0, users=0; residuo del primer intento abortado limpiado vía RPC canónico `e2e_hard_delete_store`) |
| SQL Security Gate (estático) | PASS |
| Security Audit | success (CI del merge 2eb8fc14f: 7/7 checks del commit) |
| check-writers | OK (todos los escritores declarados; 147 excepciones justificadas) |
| Guard de operaciones destructivas (CP-INFRA-020) | PASS (sin destructivos sin guard) |
| bola-contract | 5/5 PASS |
| Contrato estático | OK — 0 divergencias bloqueantes |
| Contrato LIVE | OK — 210/210 |
| Replay y manifiesto de migraciones | `--check` MATCH (sin deriva; manifiesto 178 migraciones) |
| ledger-sync-check | OK — libro sincronizado; 0 migraciones aplicadas sin registrar |
| CI del head de conciliación | ver PR complementario (checks en verde antes del merge) |

Controles ejecutados AHORA (post-merge, en esta sesión de cierre) vs resultados históricos del PR #1645: los históricos (9/9 sobre `d75f3d8b7`) son de la sesión de implementación; los de esta tabla se re-ejecutaron sobre el estado fusionado + conciliación.

## 8. Deployment (FASE 10)

- `https://costpro4.vercel.app` accesible (HTTP 200); `/api/health` HTTP 200 `{"status":"ok","service":"costpro-enterprise"}`.
- **Deployment Vercel verificado:** check `Vercel = success` sobre el merge del PR principal `2eb8fc14f59cf2e8c042c5ca0137209ce8a7e22c` y sobre el merge del PR complementario `1e96bef3724063785491ceeb6e99e0906af915e6` (HEAD final de `main`). `https://costpro4.vercel.app` HTTP 200; `/api/health` HTTP 200 `{"status":"ok","service":"costpro-enterprise"}`. Las dos funciones corregidas viven en la BD (recertificadas byte-a-byte); el bundle FE aporta la jerarquía §6/§7 incluida en el merge de #1645.

## 9. Alcance y garantías

- **No se modificó** ningún nombre, costo, precio, stock, documento ni movimiento histórico de producción: hashes de contenido idénticos pre/post migración y pre/post sonda; la migración no contiene DML sobre negocio.
- La autoridad del nombre queda garantizada en TRES capas: (1) escritores explícitos con `v_master_name`/`effective_name`; (2) trigger de identidad como barrera estructural; (3) guard de migración que falla si alguien reintroduce el sesgo del Excel.
- `master_products.name` sin ningún escritor de la importación; `products.name` de filas vinculadas SIEMPRE del maestro; el Excel nombra únicamente lo verdaderamente nuevo al crearse por primera vez.

## 10. PR complementario

Este expediente se entregó junto con la conciliación (surface regenerado + retirada de las 2 baselines temporales) en el **PR complementario #1646** — fusionado con el mecanismo normal tras CI 9/9 success sobre su head final `d966722851ff78fc17422ad3619d2b5b44c326e6`; **merge SHA `1e96bef3724063785491ceeb6e99e0906af915e6`**. El worklog registra el ciclo completo.
