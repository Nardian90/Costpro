# W9.5 — B-10b-OBS-2-R1 · 10-concurrency.md
# §23 TEST DE CONCURRENCIA — PASS

## Diseño de la prueba

Dos ejecuciones **paralelas** del script completo de reparación
(`scripts/r1_concurrency_test.sh`, procesos node concurrentes sobre la misma
transacción canónica). Como la reparación real ya estaba aplicada (orden del mandato
§20 antes de §22/§23), el resultado esperado y seguro es: **ambos intentos RECHAZADOS
por la barrera B1** — la serialización B2 (advisory lock) garantiza que nunca puedan
coexistir dos aperturas.

## Resultado

```text
attempt1: exit 1 — ERR_RECON_ALREADY_APPLIED: opening already present (98)
attempt2: exit 1 — ERR_RECON_ALREADY_APPLIED: opening already present (98)
(raw/r1_concurrent_attempt_1.json · raw/r1_concurrent_attempt_2.json)
```

## Estado final tras la concurrencia (raw/r1_after_concurrency.json)

```text
batch_movements:  98      (NUNCA 196)
batch_units:      6427    (NUNCA 12854)
inventory_store:  98
audit_batch_rows: 1
```

## Nota de seguridad (por qué no se probabilizó 1-success/1-reject)

Ejecutar dos COMMITs concurrentes en frío habría convertido la reparación real en una
carrera cuyo ganador es indeterminado. El mandato condiciona la prueba a «si es seguro
realizarlo sin alterar datos». La forma ejecutada (2 × rechazo bajo concurrencia real,
con estado final inmutable) demuestra exactamente la propiedad exigida: la segunda
ejecución concurrente NO crea movimientos adicionales. La semántica de carrera en frío
está garantizada estructuralmente por B2 (advisory xact lock): el perdedor espera al
ganador, encuentra B1 activo y aborta con ROLLBACK total.
