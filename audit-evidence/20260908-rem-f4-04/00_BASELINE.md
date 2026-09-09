# 00 — BASELINE

**Gate:** REM-F4-04 (WAC Canonical Path Remediation)
**Fecha de cierre:** 2026-09-09
**Baseline obligatorio de record:** `310fad7d`

## Estado del repositorio al inicio de esta corrida

| Verificación | Valor | Resultado |
|---|---|---|
| `git rev-parse HEAD` | `310fad7db3a80b36bbecbc471879e68fa78990ef` | ✅ == origin/main |
| `git rev-parse origin/main` | `310fad7db3a80b36bbecbc471879e68fa78990ef` | ✅ |
| `git status --short` (tracked) | vacío | ✅ worktree clean |
| Commit RECON previo | `04d4f062` (local-only, no pusheado) | documentado; ver §Git |

## Cadena de certificación

```
310fad7d (baseline)
   └─→ RECON 04d4f062 (evidencia, RECON COMPLETE — P1s RECONFIRMED)
         └─→ REM-F4-04 (esta corrida): remediación + regresión + evidence
               └─→ PASS → autoriza REM-F4-03
```

## Alcance autorizado (NO-SCOPE-CREEP)

- ✅ Remediar F4-04 únicamente: WAC roto en el camino real de recepción.
- ❌ NO tocar F4-03 (`withdraw_production_item` / `withdraw` route).
- ❌ NO tocar F4-06 (trigger de auditoría de comisiones).
- ❌ NO tocar UI, sync, commissions, RLS no relacionado, dependencias.
- ❌ Zero-touch producción: ENERVIDA-VITALLCONS + Puerto Padre VITALLCONS READ-ONLY absoluto.

## Estado de infraestructura al inicio

- PM2 restaurado tras caída durante §23 de la corrida anterior: `pm2 start ecosystem.config.js`
- PM2 PRE (registrado): 3/3 online, 0 restarts, health 200 @ 2026-09-09T03:05:39Z
- Memoria del entorno: 3.9Gi total / 0 swap (relevante para §27 Build, ver 14_REGRESSION.md)

## Artefactos de la corrida de remediación (sesión anterior, preservados)

| Artefacto | Contenido |
|---|---|
| `supabase/migrations/20260909000000_rem_f4_04_register_reception_canonical_wac.sql` | Migration única (SHA256 `1cbd9cdf…5326`, ver evidence/remf404-apply-response.json) |
| `evidence/remf404-db-inspection.txt` | Inspección SELECT-only de BD viva ANTES (§A1–A12) |
| `evidence/remf404-apply-log.txt` + `remf404-apply-response.json` | Apply de la migration: HTTP 201, 2026-09-09T01:47:57Z |
| `evidence/remf404-db-after.txt` | Verificación BD viva DESPUÉS (§B1–B5) |
| `evidence/remf404-test-suite-results.json` | Suite funcional F4-04: 54 PASS / 0 FAIL |
| `evidence/remf404-zero-touch-PRE.txt` / `remf404-zero-touch-POST.txt` | Zero-touch producción PRE == POST |
