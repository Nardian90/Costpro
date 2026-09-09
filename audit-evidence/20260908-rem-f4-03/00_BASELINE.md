# 00 — BASELINE (REM-F4-03)

**Gate:** REM-F4-03 — Production Withdrawal Canonical Server-Side Remediation
**Fecha:** 2026-09-09
**Cadena:** `310fad7d → 04d4f062 (RECON) → b94ca369 (REM-F4-04 PASS) → REM-F4-03`

## Estado al inicio de la corrida

| Verificación | Valor | Resultado |
|---|---|---|
| `git rev-parse HEAD` | `b94ca3692a11f11eebfa014d0b150c4921a1ad8e` | ✅ == origin/main |
| `git rev-parse origin/main` | `b94ca3692a11f11eebfa014d0b150c4921a1ad8e` | ✅ (push REM-F4-04 confirmado en remoto) |
| `git status --short` | vacío | ✅ worktree clean |
| PM2 | 3/3 online, 0 restarts | ✅ |
| health | HTTP 200 `{"status":"ok"}` | ✅ |

## Alcance autorizado (NO-SCOPE-CREEP)

- ✅ Remediar F4-03 únicamente: retiro/consumo de producción con contrato
  server-side válido, sin confiar en `p_unit_cost` del cliente.
- ❌ NO ejecutar REM-F4-06 (auditoría de comisiones), FASE 4-E2E-2,
  reparaciones WAC adicionales, limpieza general o refactors.
- ❌ Zero-touch producción: ENERVIDA-VITALLCONS + Puerto Padre READ-ONLY.
- ❌ NO tocar F4-04 (migration y funciones intactas — verificado en P0).

## Infraestructura

- Entorno: 3.9Gi RAM / 0 swap. PM2 detenido de forma controlada para la
  regresión pesada (estado PRE registrado) y restaurado al final (§17).
- Pruebas mutativas SOLO sobre fixtures `AUDIT F4E1 STORE A / STORE B`.
