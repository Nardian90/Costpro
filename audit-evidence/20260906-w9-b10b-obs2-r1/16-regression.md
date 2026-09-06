# W9.5 — B-10b-OBS-2-R1 · 16-regression.md
# §31 REGRESIÓN — PASS (documentación de OOM si existiera: no hubo)

Ejecutada DESPUÉS de la reparación (orden del mandato §31).

| Check | Comando | Resultado |
|---|---|---|
| lint | `npm run lint` | PASS — 0 errors (1.291 warnings pre-existentes, idénticos al baseline del diseño) |
| tsc | `npx tsc --noEmit` | PASS — 0 errors |
| vitest | `npm test` | PASS — **2.029 passed / 0 failed / 24 skipped** (96 archivos; 95 passed + 1 skipped; 208 s). Idéntico al Run C del diseño. Incluye iteration-17 (detector) e iteration-18 (congelación del pack de diseño) en verde: los artefactos aprobados no fueron alterados |
| build | `NODE_OPTIONS="--max-old-space-size=2048" npx next build` | PASS — exit 0 (Compiled successfully; ○/ƒ normal) |
| PM2 | `pm2 list` | PASS — 3/3 online (costpro 440 MB, telegram-cron-poller, whatsapp-cron-poller) |
| HTTP | curl / y /api/health | PASS — 200 / 200 |
| logs | logs/costpro-error.log | 0 errores nuevos (último aviso pre-existente 17:54Z, anterior a la fase) |

## OOM (documentación exigida — mandato: no ocultar)

```text
OOM: NO OCURRIÓ en esta fase. El build se lanzó directamente con la mitigación ya
conocida del diseño (NODE_OPTIONS=--max-old-space-size=2048; sandbox 4 GB — el heap
4096 del diseño SÍ fue OOM-killed y está documentado en su 21-regression.md).
RAM host durante la fase: total 4.041 MB · available ~2.9 MB×1000.
PM2 NO fue detenido en ningún momento; no fue necesario restaurarlo.
```

## Nota

La suite vitest corre contra artefactos congelados y NO conecta a la DB; el estado
verde confirma integridad del código y de los packs, complementando (no sustituyendo)
las verificaciones SQL de este pack.
