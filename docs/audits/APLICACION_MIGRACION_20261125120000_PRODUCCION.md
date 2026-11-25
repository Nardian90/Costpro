# APLICACIÓN EN PRODUCCIÓN — 20261125120000 (CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001: cierre del ciclo)

**Fecha:** 2026-11-25 (13:18 UTC aprox.) · **Autorizada por:** instrucción del propietario al cerrar el ciclo del
PR #1708: «procede con el merge; si falta alguna migración por aplicar, aplícala; cierra el ciclo».
**Canal:** Management API `/database/query` + `NOTIFY pgrst, 'reload schema'` (canal canónico documentado,
patrón `scripts/m012-aplicar-migracion-20261112120000.mjs` / `scripts/cpops-apply-migrations-prod.mjs`), guard
CP-INFRA-019 con doble flag del operador (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`), lote único,
sin reintentos.
**Producción:** CostproBD — ref `wthkddeleylijmonclxg`.
**Script versionado:** `scripts/cp-pos-apply-migration-prod.mjs` (declarado en
`scripts/lib/writers.manifest.json`, guardProtected; marcas re-ejecutables + modo `--check`).

---

## 1. Contexto del cierre del ciclo

1. **PR #1708** (CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001) mergeado a main en `a3f398a88`
   (`Merge pull request #1708 from Nardian90/feat/pos-per-item-payments-20261125`), tras quedar el head
   `4e2631013` con los 9 check-runs + Vercel en success y `mergeable_state=clean` (verificado en 11f).
2. **Auditoría de migraciones pendientes (read-only, sonda por marcas):** de la ventana reciente
   (migraciones `20261124*` y `20261125*`) solo una estaba pendiente en producción:
   | Migración | Estado en producción al iniciar el cierre |
   |---|---|
   | `20261124120000_adn011_gaceta_diario_publico` | YA APLICADA (`gaceta_posts` + `public_gaceta_v` presentes) |
   | `20261124120000..120400_cp_ops_enervida_*` (5) | YA APLICADAS por SR-CREATE-BLOCK-20261125 (`fin_post_payment_annulment` y `register_supplier_payment_multi` presentes) |
   | `20261125120000_cp_recep001_confirm_notes_link` | YA APLICADA (`cp_recep001_backfill_confirm_notes` presente) |
   | `20261125120100_cp_recep001_master_sku_consecutivo` | YA APLICADA (`next_master_catalog_sku` + `assign_next_catalog_sku` presentes) |
   | **`20261125120000_cp_pos_per_item_payments`** | **PENDIENTE** (`transaction_items.payment_distributions` ausente; `create_sale_v2` único overload de **34** args) |

   Nota: `supabase_migrations.schema_migrations` NO refleja las aplicaciones por Management API (se queda en
   `20260615…`), por eso el diagnóstico se hace por marcas de artefactos reales, re-ejecutable con
   `scripts/cp-pos-apply-migration-prod.mjs --check`.
3. Dependencia verificada ANTES (read-only): `transactions.customer_ci` ya existe en producción (1/1) — la
   migración la usa pero no la crea (llegó por el ciclo anterior).

## 2. Migración aplicada — `20261125120000_cp_pos_per_item_payments.sql`

- **SHA-256 del archivo:** `4fba2cda50c29ceaba3af667573c6998fe8099993444bf4fd6849f80ee6e4e8d` (73.125 bytes).
- **Contenido (extensión ADITIVA y compatible con históricos):**
  1. `transaction_items.payment_distributions jsonb` (`ADD COLUMN IF NOT EXISTS`) — distribución de pago REAL
     por línea de venta; históricos quedan NULL; los espejos legacy (`cash_paid/transfer_paid/external_transfer_paid`)
     NO cambian (autoridad financiera §13.7 + I1b/PT011 intacta).
  2. `create_sale_v2` firma canónica ÚNICA de **35** args: `DROP FUNCTION IF EXISTS` del overload previo +/OR
     `CREATE OR REPLACE` con `p_customer_ci text DEFAULT NULL` (al final de la firma), validación estructural
     fail-closed de `items[].payments` (≤8 filas, método canónico con normalización `zelle→external_transfer`,
     importe ≥ 0, referencia obligatoria en transferencias con monto > 0) + persistencia de ambas piezas
     (`payment_distributions` + `transactions.customer_ci`) + hash de idempotencia ampliado (patrón v2_26_hotfix2).
  3. `COMMENT` de función/columna con la marca de la misión.
  4. Reconciliación de ACLs tras el DROP (patrón 20261106100000): `REVOKE ALL FROM PUBLIC, anon` +
     `GRANT EXECUTE TO authenticated, service_role`.
- **Validación previa §11g (aislado antes que producción, una sola vez en producción):** la migración ya estaba
  aplicada y certificada en la BD aislada CostproE2E (`lguovmvrozxgssupkwpf`) durante la misión — manifiesto
  replay 205→207, test contador/firma `/35` (7/7), E2E `pos-checkout` 21/21 con workers=1, workflow
  «E2E Aislado» success en el head `4e2631013` del PR. Contraste re-ejecutado en este cierre:
  `node scripts/cp-pos-apply-migration-prod.mjs --target e2e --check` → **10/10 OK, YA APLICADA**.

## 3. Estado ANTES (producción, read-only)

- `transaction_items.payment_distributions`: **AUSENTE**.
- `create_sale_v2`: exactamente **1 overload de 34 args** (sin `p_customer_ci`, sin validación de
  `items[].payments`, sin persistencia de distribuciones).
- `--check` en producción: **8 de 10 marcas AUSENTES** (las 2 presentes eran las vacuas/pre-migración:
  `sobrecarga_unica` sobre el overload viejo y `acl_anon_revocado` por ACL por defecto).

## 4. Aplicación

- Lote único de 73.125 bytes por Management API `/database/query` → **SQL ejecutado sin error** (HTTP 2xx,
  sin filas de resultado: solo DDL + COMMENT + ACLs).
- `NOTIFY pgrst, 'reload schema'` emitido inmediatamente después (procedimiento oficial post-DDL).
- **Aplicación ÚNICA, sin reintentos** (regla de oro §11g); idempotente por diseño
  (`ADD COLUMN IF NOT EXISTS` + `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE`).

## 5. Verificación POST (read-only, fail-closed, re-ejecutable) — 10/10 ✓

| # | Marca (`--check`) | Resultado |
|---|---|---|
| 1 | `col_payment_distributions` — columna jsonb en `transaction_items` | ✓ |
| 2 | `sobrecarga_unica` — exactamente 1 overload de `create_sale_v2` | ✓ |
| 3 | `firma_35_args` — firma canónica de 35 argumentos | ✓ |
| 4 | `p_customer_ci_ultimo_param` — 35.º argumento = `p_customer_ci` | ✓ |
| 5 | `validacion_fail_closed` — cuerpo con `ERR_ITEM_PAYMENTS_INVALID` | ✓ |
| 6 | `persistencia_distribucion` — cuerpo persiste `payment_distributions` | ✓ |
| 7 | `hash_idempotencia_ampliado` — cuerpo incorpora `payments` + `p_customer_ci` al hash | ✓ |
| 8 | `acl_service_role` — EXECUTE concedido a `service_role` | ✓ |
| 9 | `acl_anon_revocado` — `anon` sin EXECUTE | ✓ |
| 10 | `comment_mision` — comentario de función con la marca `CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001` | ✓ |

Re-ejecución posterior del `--check`: `YA APLICADA (todas las marcas presentes). Se salta.`

## 6. Prueba funcional NEGATIVA en producción (fail-closed, CERO escrituras)

- `SELECT public.create_sale_v2(gen_random_uuid(), gen_random_uuid(), '[]'::jsonb)` SIN JWT por el canal
  Management API → **HTTP 400 con `P0001: ERR_UNAUTHORIZED`**, con la firma `/35` completa visible en el
  `CONTEXT` de PL/pgSQL (guard de AUTH §3.1 paso 2, que corre ANTES de idempotencia y de cualquier INSERT).
- Huella verificada post-aborto: **0 transacciones nuevas** en producción (rollback real, cero residuos).
- El camino positivo (venta con `items[].payments` + `customer_ci`) quedó certificado en la BD aislada
  (E2E `pos-checkout` 21/21 del PR #1708, fail-closed 015/016/017 verificados en BD).

## 7. Estado de despliegue tras el cierre

- Vercel producción (main `a3f398a88`): **deploy success** — el código que llama a la firma `/35` quedó
  publicado CON la migración ya aplicada (la firma nueva acepta llamadas que omiten `p_customer_ci` por
  `DEFAULT NULL`, por lo que la ventana de compatibilidad es segura en ambas direcciones).
- `GET https://costpro4.vercel.app/api/health` → **HTTP 200**.
- Sandbox local: main sincronizada (`a3f398a88`), `.env` PRINCIPAL restaurado (15 variables, gitignored).

## 8. Seguridad

- Escaneo de secretos en el diff del PR de cierre (script + manifiesto + este acta): **cero coincidencias**
  para los 5 patrones del protocolo §8 del prompt de inicio (PAT de GitHub, secretos de servicio y publishable
  de Supabase, token de acceso personal de Supabase, JWT de cabecera) y contraseñas de BD.
- El `.env` del sandbox quedó gitignored (`git check-ignore -v .env` → `.gitignore:34:.env*`).
- No se tocaron RLS, pools/totales ni reglas contables (prohibido por la migración misma y por la misión).

## 9. Referencias

- PR del ciclo: https://github.com/Nardian90/Costpro/pull/1708 (merge `a3f398a88`)
- Expediente de la misión: `docs/audits/CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001/` (DIAGNOSTICO.md, RESULTADOS.md, evidencia/)
- Comentario de evidencia CI del PR: issuecomment-7163178265
- Patrones aplicados: `docs/audits/APLICACION_MIGRACION_20261112120000_PRODUCCION.md` (m012),
  `docs/audits/SR-CREATE-BLOCK-20261125/INFORME.md` (cpops), guard CP-INFRA-019.
