# 10 — ADVERSARIAL TESTS (costo forjado del cliente)

**Directiva §9/§10/§18 — la prueba de éxito no es "la RPC responde 200".**

Escenario común (P3, P4 sobre el mismo fixture del retiro válido):

- Costo real server-side (WAC): **100**
- El cliente manda su costo en el body (el campo sigue aceptándose por
  compatibilidad de contrato con la UI existente, pero el server lo descarta
  antes de llamar a la RPC — y la RPC ni siquiera tiene ese parámetro).

| Prueba | Body del cliente | HTTP | `unit_cost_used` | Movimiento kardex | Veredicto |
|---|---|---|---|---|---|
| P3 — forjado BAJO | `unit_cost: 0.01` | 200 | **100** | unit_cost **100** | cliente ignorado |
| P4 — forjado ALTO | `unit_cost: 999999999` | 200 | **100** | unit_cost **100** | cliente ignorado |
| Census P3 | cualquier movimiento con unit_cost=0.01 | — | — | **0 filas** | imposible |
| Census P4 | cualquier movimiento con unit_cost≥999999999 | — | — | **0 filas** | imposible |
| P1 | `unit_cost: 0.01` (el primer retiro ya era adversarial) | 200 | 100 | 100 | cliente ignorado |

## Invariante demostrada (directiva §17)

```
movement_unit_cost == server_side_unit_cost (WAC)   en 4/4 movimientos
movement_unit_cost == client_supplied_unit_cost     en 0/4 movimientos
```

## Eliminación del parámetro (directiva §18: "mejor")

El contrato de la ruta **eliminó completamente `p_unit_cost`**:
- La route ya no lee `unit_cost` del body (comentario explícito en el código).
- La RPC `_v3` no tiene ese parámetro (firma 7 args).
- Un cliente que lo envíe no causa ningún efecto, ni error, ni warning
  contaminante: descarte silencioso por diseño.
