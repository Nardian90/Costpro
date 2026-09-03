# W9.4.6 — H-5 · FASE 3 · Historia Git completa

Comandos ejecutados (raw: `raw/f3_git_forensics.txt`):

```text
git log --all --oneline -- '*reverse_transaction*'   → 5e2fa2a (único commit de path dedicado)
git log -S'reverse_transaction' --all --oneline      → 7 commits (e7959b4, 033e05d, 7b1bafc, 1c204d1, b125152, f628e5e, 5e2fa2a)
git log -G'reverse_transaction' --all --oneline      → mismos 7
```

## Cadena evolutiva (migraciones, en orden)

| Migración | Qué hizo | Body V1 | Body V2 | ACL |
|---|---|---|---|---|
| `20260726000005_v2_2_accounting_flow_reversal.sql` | CREATE V1 (bug store_id) | ① | — | +authenticated +service_role |
| `20260726000006_v2_3_production_reversal_and_validation.sql` | Fix V1: store_id desde fila; compuestos | ② | — | — |
| `20260727000006_v2_12_9_spoofing_p_user_id.sql` | V1 anti-spoofing (auth.role()/auth.uid()) | ③ | — | — |
| `20260727000008_v2_12_12_fix_is_not_null_pattern.sql` | V1 patrón IS NULL OR NOT | **④=PRODUCCIÓN** | — | — |
| `20260727000009_v2_12_13_revoke_anon_grants_comments.sql` | REVOKE anon; GRANT authenticated+service_role | — | — | ACL⑤ |
| `20260808000001_v2_17_1_reverse_transaction_v2.sql` | CREATE V2 (register_stock_movement, variantes) | — | ⑥ | REVOKE anon; +authenticated +service_role |
| `20260810000040_pr4_kardex_fix.sql` | V2: elimina kardex directo; FOR UPDATE; idempotencia; status completed-only | — | **⑦=PRODUCCIÓN** | — |
| `20260902200923_w9_f06_c2_hardening.sql` | REVOKE authenticated/anon/PUBLIC ambas; GRANT service_role | — | — | **ACL=PRODUCCIÓN** |

- `1c204d1` (W7 consolidate) consolidó el release auditable; `033e05d`/`7b1bafc` endurecieron otras funciones/C2; `e7959b4` (H-4) tocó solo `reverse_receipt_v2`.
- **Ningún commit posterior a PR-4 redefine los cuerpos.** Comparación exacta (normalizada) en `raw/f4_body_comparison.json`: V1_live==④, V2_live==⑦.
- `5e2fa2a` es el commit que consolidó el inventario con fuente de verdad `inventory.quantity` (contexto de por qué el bypass de V1 importa).

## Conclusión de forensia

No existen versiones intermedias fuera de migraciones (no hay SQL suelto en scripts/, releases, docs con CREATE FUNCTION de este par — verificado por `git log -S/-G` y grep de árbol completo). No hay evidencia de OUT-OF-BAND DEPLOYMENT.
