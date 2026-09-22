# GATE 1.4R.1 — 00 BASELINE (mandato §2)

Fecha: 2026-09-22 · Ejecutado ANTES de tocar código.

```text
$ git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

BASELINE HEAD:    3cf6446c6d72144ee2ca4b57f9ba6a9b67a25573
ORIGIN/MAIN:      3cf6446c6d72144ee2ca4b57f9ba6a9b67a25573
WORKTREE:         CLEAN
BRANCH:           main
```

```text
$ git log -3 --oneline
3cf6446c docs(plan): strategic UX/IA roadmap from GATE 1.4/1.4R results
a603d7cc docs(gate1.4r): closure evidence — git verification, FINAL-REPORT (CERTIFIED)
63918468 fix(gate1.4r): remediate Cost Sheets UX/IA — Arena FC recovered, semantic rename, palette contextual actions, breadcrumb source fix
```

## Servidor / runtime

- PM2: costpro (online, 0 restarts) + telegram-cron-poller + whatsapp-cron-poller.
- `GET /api/health` → 200 · `GET /` → 200.
- Login de prueba: admin@demo.com / demo123 vía `/?login=1`.

## Vigencia de la evidencia base (mandato §BASE DOCUMENTAL)

| Documento | Estado |
|---|---|
| GATE 1.4 — FINAL REPORT (audit-evidence/GATE1.4/FINAL-REPORT.md) | Presente, vigente |
| GATE 1.4 — 02 fichas de costo audit (02-ficha-costo-audit.md) | Presente, vigente |
| GATE 1.4 — 12-information-architecture.md | Presente, vigente |
| GATE 1.4 — 14-proposed-navigation.md | Presente, vigente |
| GATE 1.4R — remediación previa (audit-evidence/GATE1.4R/, commits 63918468 + a603d7cc) | Presente; HEAD == origin/main la incluye |

## Decisión GATE 0

Worktree limpia y sincronizada → **CONTINUAR** (sin reset, sin clean, sin sobrescribir).

## Alcance GATE 1.4R.1 vs GATE 1.4R

GATE 1.4R (cerrado CERTIFIED) resolvió: orphan Arena FC, rename "Tablero Dinámico"→"Análisis de Fichas",
palette de contexto, breadcrumbs por registro, móvil de flujos puntuales.
GATE 1.4R.1 (este gate) reconstruye la **arquitectura de segundo nivel** del módulo:
tab EXPERTO (recuperación del "Tablero Principal"), renombrado Generación Masiva,
control de MODO visible, zona de ACCIONES visible, paleta VIEW/ACTION/CONTEXTUAL,
landing del módulo y mobile IA unificada.
