# W9.5 — B-10b-OBS-2-R1 · 02-baseline.md
# GATE 0 (§1) + GATE 2 revalidación del diseño (§2)

## Git baseline (§1)

```text
HEAD == origin/main == b923dfaf  ("audit(w9): design orphan inventory reconciliation")
worktree: clean
historia: b923dfaf → 7dfcaeea (forensic OBS-2) → 48f24c73 (OBS-1 fix) → 031b0ced (B-10b) → c892b055 (B-10)
PM2: 3/3 online (costpro, telegram-cron-poller, whatsapp-cron-poller)
```

## Revalidación del diseño congelado (§2 — «no reconstruir el universo; el CSV es la autoridad»)

- Pack de diseño `audit-evidence/20260906-w9-b10b-obs2-repair-design/` cargado íntegro
  (03–07 CSV, 08–19 MD, raw/, scripts/).
- **SHA256SUMS del pack: 45/45 OK** (requisito Fase 0 del checklist 18).
- Universo NO reconstruido: se revalidó contra `raw/frozen_universe.json` y los CSV
  congelados (ver 04-universe-validation.md → 14/14 PASS).

## Integridad congelada viva (A2/A10/A11) — 10/10 PASS

| Check | Resultado |
|---|---|
| `register_stock_movement` == congelado del diseño | PASS (byte a byte) |
| `fn_recalc_wac` == congelado | PASS |
| `fn_sync_inventory_on_movement` == congelado | PASS |
| `reverse_devolution` versión B-10b | PASS (marcadores pipeline canónico presentes; patrón pre-B-10b `GREATEST(0, stock_current…)` ausente; migración `20260905120000` sin cambios desde 031b0ced; def congelada en `raw/r1_reverse_devolution_frozen.txt`) |
| `is_admin()` == congelado (g10_actor) | PASS |
| `has_store_access()` | capturada (863 chars) — ref `raw/r1_has_store_access_def.txt` |
| Triggers de la órbita del diseño (inventory/products/stock_movements) | 11/11 idénticos y habilitados |
| Triggers fuera de la órbita (audit_logs ×2) | pre-existentes desde W7 (evidencia 20260828-af, 20260830-w7); el diseño solo capturó 3 tablas |
| PRE 34 métricas == congelado del diseño | 34/34 idénticas (checksums `6c900fcf…`/`007fec6b…`/`39ba7edf…` incluidos) |

Detalle: `raw/r1_frozen_integrity_verdict.json` · script: `scripts/r1_check_frozen.js`.

## Hashes de referencia (§29)

```text
design pack SHA256SUMS verificado:        45/45 OK
repair_batch_id:                          B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW
approved CSV 07-proposed-opening.csv:     ver SHA256SUMS de este pack
98-product universe (frozen_universe.json): ver SHA256SUMS
```
