# T12_AND_PRIVILEGE_CERTIFICATION.md — CP-FIN-ULTIMATE-CLOSE-008

Fecha: 2026-11-16 · Modo: **solo lectura** · Scripts oficiales: m057 (`m057-pr1630-close-verify.mjs` postmerge re-check) y m059 (`m059-ultimate-security-cert.mjs`)

## Veredicto

**T12 y el hardening de privilegios están aplicados, vivos y certificados en producción. PASS 26/26 (m057) + 6/6 (m059).**

## A. Motor contable (`fin_post_document_annulment`)

| Control | Resultado | Evidencia |
|---|---|---|
| Existe con firma `(text, uuid)` | PASS | m057 C1 |
| Cuerpo vivo = cuerpo aprobado en migración T12 (hash SHA-256) | PASS | m057 C2 |
| Protección `ERR_PARTIAL_REVERSAL_PENDING` presente en el cuerpo | PASS | m057 C3 |
| ACL exacto `{postgres, service_role}` — sin authenticated/anon | PASS | m059 A1/A2 |
| Canal `_safe` (`fin_posting_errors`) íntegro y a 0 filas | PASS | m057 E11 |
| Idempotencia de anulaciones completas | PASS | cuerpo vivo = aprobado (m057 C2); sin reversiones registradas (E5) |

## B. Protección de recepciones (`fin_t12_receipt_annulment_block`)

| Control | Resultado | Evidencia |
|---|---|---|
| Trigger existe y habilitado (`tgenabled='O'`) | PASS | m057 D1 |
| Cuerpo vivo de la función = código aprobado (hash) | PASS | m057 D2 |
| Montado en `receipts BEFORE UPDATE OF status` | PASS | m057 D3 |
| Ningún otro trigger de `receipts` deshabilitado | PASS | m057 D4 (6 triggers, ninguno `D`) |
| Sin escape hatch | PASS | cuerpo aprobado sin rama de bypass (m056 C7 de la misión 006 + verificación de cuerpo hoy) |
| Ningún flujo puede saltarse la protección | PASS | ACL del motor `{postgres, service_role}` (única vía: service_role) + trigger habilitado + RLS (m059 R1). El bloqueo se probó en BD aislada (batería E2E de la misión #1632) y su operativa viva no genera errores (E11: 0 filas en `fin_posting_errors`) |

## C. Privilegios y RLS

| Control | Resultado | Evidencia |
|---|---|---|
| Helper `fin_entry_reversal_residual`: ACL `{postgres, service_role}` (hardening aplicado) | PASS | m057 B4 + m059 A1 |
| Cuerpo del helper = aprobado (hash) | PASS | m057 B2 |
| `fin_t12_block_receipt_annulment`: sin anon ni PUBLIC | PASS | m059 A1-trigger |
| Nota informativa (no bloqueante) | — | La función del trigger conserva `authenticated=EXECUTE`: **inócuo** — PostgreSQL solo permite invocar funciones `RETURNS trigger` como triggers (no por SELECT/CALL) — y consentido por el SQL Security Gate verde. REVOKE opcional recomendado para higiene en una misión futura (no se ejecuta: fuera del alcance) |
| RLS activa en las 9 tablas clave (receipts, receipt_items, products, fin_entries, fin_movements, fin_posting_errors, production_migration_ledger, payment_transactions, stock_movements) | PASS | m059 R1 |
| Census SECURITY DEFINER estable (367) | PASS | m059 C1 + m057 F (367 en premerge 007 y postmerge 008) |
| Grants de anon: solo en las 8 excepciones documentadas del gate | PASS | m059 C1 (`con_execute_anon=8`), SQL Security Gate verde |

## D. Ledger

`production_migration_ledger`: T12 (`20261115100000`) **una sola aplicación**, `status='applied'`, SHA-256 `3429613c…` = archivo aprobado; hardening `20261116120000` aplicado una vez (20:05:21Z, `runbook-m056`). Total 63 filas; post-T12: solo misiones autorizadas documentadas. (m057 A1-A4.)

Evidencias: `m057-postmerge-recheck.json` (26/26), `m059-security-cert.json` (6/6).
