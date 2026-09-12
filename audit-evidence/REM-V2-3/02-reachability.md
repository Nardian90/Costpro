# 02 — REACHABILITY MATRIX (PHASE 5)

Definiciones del gate: DEAD / DORMANT / REACHABLE / REQUIRED / UNKNOWN (UNKNOWN ≠ DEAD).

| Camino | Static | API | UI | Offline | Replay | Internal RPC | Tests | Runtime (interceptación) | Estado PRE-retiro | Estado POST-retiro |
|---|---|---|---|---|---|---|---|---|---|---|
| `RPC_MAP_V1.receipt` → `reverse_receipt` | route.ts:37 (map) | /api/reverse flag=false | useReverseDocument/useDocumentActions (via API) | NINGUNO | NINGUNO | 0 (scan cuerpos pg_proc = ∅) | 0 operan V1 | demostrado: flag=false → `reverse_receipt` | REACHABLE (fallback fail-closed) | **DEAD-path** (map resuelve a V2; 0 callers app; DB function sin EXECUTE authenticated) |
| `RPC_MAP_V1.adjustment` → `reverse_adjustment` | route.ts:39 | ídem | ídem | NINGUNO | NINGUNO | 0 | 0 | demostrado: flag=false → `reverse_adjustment` | REACHABLE | **DEAD-path** (ídem) |
| `void_transaction` | useDocumentActions.ts:75 | n/a (cliente directo JWT) | POS undo 30s + Invert | n/a | n/a | 0 | 4 suites fijan comportamiento | n/a (activo) | **REQUIRED** | **REQUIRED (KEEP — §28)** |
| `create_sale` | useTransactions.ts:119 | n/a | POS clásico flag OFF | queue replay → V2 | V2 | 0 | allow-list pin | n/a | REACHABLE (fallback) | REACHABLE (KEEP — fuera de alcance) |
| `reverse_transaction` V1 | — | — | — | — | — | 0 | anti-resurrección | — | RETIRED (H5-B1) | RETIRED (verificado) |

## Clasificación final por candidato

- **`reverse_receipt`**: PRE = REACHABLE únicamente vía fallback fail-closed (flag env ausente/false).
  POST-retiro = **path muerto a nivel app** (map neutralizado H5-B1-style; verificado por
  interceptación dinámica + contract pins). DB function permanece (retiro DB diferido, ver 06).
- **`reverse_adjustment`**: ídem.
- **`void_transaction`**: **REQUIRED** — mecanismo activo del requisito funcional «deshacer venta 30s»
  (POS-2 MM-9) e «Invertir venta» (FIX F2-06). NO existe `void_transaction_v2`; es parte del
  pipeline canónico V2 (create_sale_v2 → void_transaction, congelado por iteration-19).
  Según §28: **LEGACY-BUT-REQUIRED — KEEP. NO es un fallo del gate.**
- **`create_sale`**: REACHABLE (fallback fail-closed del POS clásico; allow-list contractual).
  El offline/replay NUNCA lo alcanza (sync/batch → create_sale_v2, pin de contract).
  FUERA del alcance de retiro de este gate (superficie conductual mayor; no candidato nombrado).
- **UNKNOWN**: ninguno (la evidencia alcanzó para clasificar todos los candidatos).
