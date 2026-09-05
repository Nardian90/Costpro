════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 07-cross-store-tests.md
GATE 6-Test C — Pruebas CROSS-STORE (ambas direcciones)
════════════════════════════════════════════════════════════════════

Fixture: tienda A (b2c0ffee-…a1) y tienda B (b2c0ffee-…b2), ambos sintéticos.
Membresías: 03524340… → SOLO tienda A · 037b50b2… → SOLO tienda B (activas).

## Dirección A→B (miembro de A intenta anular transacción de B)

P7_member_A_voids_store_B_tx:
  caller: 03524340… (authenticated, claims simulados) · target: TX_B (tienda B)
  resultado: EXCEPTION 'ERR_UNAUTHORIZED'
  efectos propios: 0 (sin movement propio, sin audit propio, sin mutación de TX_B;
  los registros capturados en la batería corresponden al effecto previo de P4
  sobre TX_B — 1 movement by=a1111111… y 1 audit row — sin adiciones del probe)

## Dirección B→A (miembro de B intenta anular transacción de A)

P2_cross_store_member_other_store:
  caller: 037b50b2… (authenticated, claims simulados) · target: TX_A (tienda A)
  resultado: EXCEPTION 'ERR_UNAUTHORIZED'
  efectos propios: 0 (mismo criterio de lectura que P7)

## Cobertura completa de la validación

- El store_id evaluado es SIEMPRE v_tx.store_id (fila objetivo), nunca un
  parámetro del cliente → no existe forma de "re-etiquetar" la tienda.
- has_store_access_as exige membresía ACTIVA en ESA tienda (o admin global).
- CONTROL POSITIVO: los mismos callers SÍ pueden anular en SU tienda (P1 —
  03524340… en tienda A: SUCCESS), descartando un rechazo artificial por
  mala construcción del probe.

## Conclusión

CROSS-STORE → DENIED en ambas direcciones, con control positivo del caso
legítimo. No existe bypass cross-store por parámetros, por identidad forjada
(P3a) ni por anon (P5).
