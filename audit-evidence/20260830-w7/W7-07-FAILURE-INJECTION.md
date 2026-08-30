# W7-07 — FAILURE INJECTION (FASE 15)

Inyecciones ejecutadas sobre clones desechables; cada caso clasificado con EXPECTED / ACTUAL / RECOVERABLE. Evidencia: `tmp/W7-inv12-rollback.out`, `tmp/W7R-adversarial*.out`, `tmp/W7-df*-conc.out`, `tmp/W7-f11-f13-run.out`.

## 15.1 Matriz de fallos

| # | Inyección | EXPECTED | ACTUAL | RECOVERABLE |
|---|---|---|---|---|
| F1 | **Fallo a mitad de transacción** (RAISE forzado INV12_FORCED_FAILURE dentro de venta con movimientos/audit/payments ya escritos) | TX aborta; 0 filas huérfanas; estado idéntico al pre | Hash STATE pre == post (478b7f13…): 0 transacciones, 0 stock_movements, 0 audit_logs, 0 payment_transactions huérfanas (INV12-R1..R5, 5/5 PASS) | SÍ — atomicidad de paquete probada |
| F2 | **Aplicación parcial del set** (fallo entre paquetes) | paquete completo o nada (1 TX por paquete, ON_ERROR_STOP) | protocolo W6.2 reutilizado; el orden 06→08 (H1) hace que un fallo en 08 deje la devolution_v2 de 06 (cap sin finanzas) — **coherente pero incompleta**: reanudar por 08, no re-aplicar 01..07 | SÍ con reanudación ordenada |
| F3 | **Fallo de ACL** (llamada sin privilegio) | 42501 limpio, sin efecto lateral | reproducido: create_devolution v1 como authenticated → 42501; withdraw legacy → 42883; anon en v3/close/receive → denegado (INV-13: 6 asserts PASS) | SÍ — error explícito, sin mutación |
| F4 | **Replay / reuso de idempotency key** | replay re-emite mismo resultado; key con hash distinto rechazada | DF-08: replay OK, `ERR_IDEMPOTENCY_KEY_REUSE` en reuso con payload distinto (10/10 asserts, W7R df08) | SÍ |
| F5 | **Concurrencia — race de devolución** (4+4 sobre venta=5) | exactamente 1 gana; tope ≤5; perdedora re-lee fresco | F7′: aceptadas=1, devuelto total=4 ≤5, perdedora rechaza con tope fresco (INV-09 PASS en matriz) | SÍ — serializa por row-lock de la venta |
| F6 | **Concurrencia — ventas simultáneas** (5×DF-02) | COGS server por venta, WAC correcto, sin deadlocks | 5/5 ventas concurrentes (W7R df02-conc, 5 asserts); locks FOR UPDATE ordenados por product_id | SÍ |
| F7 | **Concurrencia — transferencias 8+8 sobre stock 10** | reserva serializa; 1 confirma; stock nunca negativo | ADV-CONC-1: creadas=1, perdedora ERR_INSUFFICIENT_STOCK, INV-01 preservada | SÍ |
| F8 | **Concurrencia — withdraws 4+4 sobre budget 6** | overconsumption bloqueado | ADV-CONC-2: 1 acepta (actual=4), otra ERR_OVERCONSUMPTION | SÍ |
| F9 | **Concurrencia — venta+recepción simultáneas** (WAC stale) | COGS server sin leer WAC obsoleto | ADV-CONC-3: COGS=100, veneno 7777 ausente, conservación ±0.01 | SÍ |
| F10 | **Rollback a mitad del runbook completo** | esquema byte-idéntico al pre | FASE 16: fingerprint pre == post-rollback (W7-06) | SÍ — probado byte a byte |
| F11 | **Entrada maliciosa** (costos veneno, stock negativo, WAC directo, producto inexistente) | rechazo con error semántico | adversarial 12 secuenciales: 0 ACCEPTED-INCORRECTLY (A1..A12) | SÍ |

## 15.2 Notas de laboratorio

- El probe F13 evidenció que `SAVEPOINT` fuera de bloque TX falla (`SAVEPOINT can only be used in transaction blocks`) — el runner de migración debe envolver cada paquete en `BEGIN…COMMIT` explícito (incorporado a W7-05 §14.3).
- `w62_guard_wac_writer` responde a intentos de UPDATE directo con `ERR_WAC_SINGLE_WRITER_VIOLATION` (ADV-A9) — el fallo más grave imaginable (escritor doble) es estructuralmente imposible post-migración.

## 15.3 Veredicto FASE 15

```text
FAILURE INJECTION GATE = PASS — 11/11 inyecciones EXPECTED==ACTUAL, 100% RECOVERABLE, 0 filas huérfanas, 0 ACCEPTED-INCORRECTLY
```
