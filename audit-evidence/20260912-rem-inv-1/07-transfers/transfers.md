# REM-INV-1 — 07 TRANSFERENCIAS (Fase 6)

Evidencia: 03-reconciliation/r05, e1 (create/confirm/reverse_transfer), e8.

- Ciclo: create_transfer (draft, FOR UPDATE en productos, valida tiendas distintas + acceso) → confirm_transfer (lock, recalc WAC 'transfer_in', movimientos out/in con unit_cost de origen) → reverse_transfer (recalc 'transfer_reverse', FOR UPDATE, guarda de estado).
- `Salida A = Entrada B`: **8/8 transferencias balanceadas** (r05, imbalance=0); CANCELADAS 4 sin movimientos; REVERSADAS 2 con compensación 1:1 (n_out=2/n_in=2); CONFIRMADA 1 (6=6); PENDIENTE 1 (0/0 correcto).
- `Costo A = Costo B`: regla efectiva = valoración al costo de origen (transfer_items.unit_cost + blend WAC en destino vía transfer_in). No hay regla de re-valorización en destino: documentado como política (no defect).
- Double send/receive: protegido por guardas de status + FOR UPDATE; sin idempotency_key explícita (F-08).
- Transferencia cruzada/sin acceso: has_store_access_as en los tres RPCs + REM-SEC-1 certificó aislamiento.
- Datos: solo tiendas fixture (E2E2, AUDIT F4E1) — producción sin transferencias.
