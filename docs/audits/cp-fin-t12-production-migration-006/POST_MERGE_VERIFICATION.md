# POST_MERGE_VERIFICATION.md — CP-FIN-T12-PR-CLOSE-007

Fecha: 2026-11-16 · Fase: verificación post-fusión del PR #1630 · Modo: **100 % SOLO LECTURA contra producción** (SELECT vía Management API `/database/query`; GitHub API; HTTP GET de salud). Sin DML/DDL; sin re-ejecución de T12; sin operaciones financieras.

Evidencia maquina: `pr1630-postmerge-evidence.json` (m057 `postmerge`, capturado 2026-11-15T20:22:27Z) — **veredicto PASS 26/26**.

## Tabla maestra — 10 controles post-fusión (§8)

| # | Control | Resultado | Evidencia |
|---|---|---|---|
| 1 | SHA terminal de `main` = commit de fusión de #1630 | **PASS** | `main = 4107f6b0deec83dd96c1f21e1e75762ae22f8358` «Merge pull request #1630 from Nardian90/docs/cp-fin-t12-production-migration-006-20261115»; padre `5d33a86e3` |
| 2 | `main` contiene los cambios de #1630 | **PASS** | 26 archivos presentes en el árbol de `main` (21 del expediente + m054/m055/m056/m057 + writers.manifest.json); `git diff origin/main pr-1630` vacío (árboles idénticos) |
| 3 | Workflows del commit de integración | **PASS** | push `4107f6b0d` 19:58:09Z: CI run 43755349423 **success**; Test Coverage run 43755349385 **success**. SQL Security Gate: no disparado por filtro de rutas (diff de fusión sin rutas gated; estado del contenido fusionado certificado success en run 43753691957 `5d33a86e3`). E2E Aislado: workflow_dispatch-only por política del repo (no aplica a push) |
| 4 | Contract-surface consistente con producción | **PASS** | surface en `main` hash `0ba2181f…`; sin `source_of_truth_baseline`; `fin_post_document_annulment` con `proacl={postgres=X/postgres,service_role=X/postgres}`; helper `fin_entry_reversal_residual` en surface (l. 8099) = cuerpo vivo verificado m057 B2 |
| 5 | Excepción temporal eliminada de `main` | **PASS** | `grep source_of_truth_baseline` sobre `supabase/security-contract/contract-surface.sql` en `main`: **0 resultados** |
| 6 | T12 sigue en producción (motor + trigger) | **PASS** | Motor `fin_post_document_annulment(text, uuid)`: existe, cuerpo vivo = cuerpo aprobado (hash m057 C2), contiene `ERR_PARTIAL_REVERSAL_PENDING` (C3). Trigger `fin_t12_receipt_annulment_block`: único, `tgenabled='O'`, `BEFORE UPDATE OF status ON public.receipts`, cuerpo vivo = aprobado (D1-D3) |
| 7 | Ledger registra una sola aplicación de T12 | **PASS** | `production_migration_ledger` `version='20261115100000'`: exactamente 1 fila, `status='applied'`, `sha256=3429613c4bd2…` = hash del archivo aprobado (A1-A3). Total ledger 63 filas; entradas post-T12 de OTRAS misiones documentadas: `20261115120000`+`20261115120100` (valuation 004, 13:02Z) y `20261116120000` (hardening #1632 vía runbook-m056, 20:05Z) |
| 8 | Triggers de `receipts` habilitados | **PASS** | m057 D4: los 6 triggers no internos de `receipts` con `tgenabled≠'D'` (`fin_trg_receipts`, `trg_audit_receipt_changes`, `trg_cp_infra_020_block_trun…`, etc.) |
| 9 | Balances financieros e inventario intactos | **PASS** | m057 E1-E11: FAC-VITALLCONS-001 `active`, total 192.039.436.000000000, 101 líneas con suma recomputada 192.039.436.00, asiento original único `93bb5da9-0afd-4325-baad-a275710062c5`, **0 reversiones**, CXP `unpaid`, SKU111 stock 10 / SKU112 stock 20, WAC 1 CUP ambos, COGS ventas 7 CUP (5 movimientos), `fin_posting_errors = 0` |
| 10 | Vercel y salud de la aplicación | **PASS** | `GET https://costpro4.vercel.app/api/health` → HTTP 200 `{"status":"ok","service":"costpro-enterprise","timestamp":"2026-11-15T20:23:38.852Z"}` |

## Notas de trazabilidad

- **Census sin drift:** funciones SECURITY DEFINER en producción = **367** en premerge y postmerge (idéntico).
- **Hardening `20261116120000`** ya está aplicado en producción (ledger 20:05:21Z por `runbook-m056`, misión #1632): el ACL vivo del helper es `postgres=EXECUTE, service_role=EXECUTE` (m057 B4) — sin EXECUTE para `authenticated`/`anon`/`PUBLIC`, coherente con el texto de la allowlist.
- **RECT-1 / RECT-2:** no ejecutadas — demostrado por E4 (un único asiento `posted` para la recepción, sin segundo asiento) y E5 (cero reversiones enlazadas); ningún movimiento financiero de producción en toda la misión.
- **Ámbito de la fusión:** la fusión de #1630 integra documentación/evidencia/scripts de auditoría y la retirada de la excepción del contract-surface; la protección T12 misma ya estaba en producción desde su aplicación única certificada (12:26Z, misión 006).
- Reproducibilidad: `node scripts/m057-pr1630-close-verify.mjs postmerge [out.json]` (read-only, guard de ref de producción en línea).
