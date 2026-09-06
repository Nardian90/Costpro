# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 16-repair-recommendation.md
# Recomendación definitiva de reparación (GATE 16) — NO EJECUTADA

```text
RECOMMENDED_MODEL: D = B (apertura formal auditada vía register_stock_movement,
                        98 productos / 6.427 u / unit_cost = WAC / fecha de ejecución)
                   + C restringido (10 Test EXCLUDED_FROM_REPAIR; archivo/limpieza
                     futuro como decisión separada)
STATUS:            DISEÑO COMPLETO Y DETERMINISTA — PENDIENTE DE FIRMA HUMANA
MANDATO:           esta fase NO ejecuta; produce el diseño verificable
```

## Qué se recomienda consagrar (fila a fila en 07-proposed-opening.csv)

| Bloque | Productos | Unidades | Valor ESTIMATED | Clase de evidencia |
|---|---:|---:|---:|---|
| Set A — frozen | 94 | 4.961 | 9.780.688,78 | backup 08-02 == current congelado; 0 escrituras post 08-16T22:01Z |
| Set B — delta confirmado | 4 | 1.466 | 151.528,16 | backup + Σ business_events == current; último new_qty == current |
| **Total apertura** | **98** | **6.427** | **9.932.216,94** | |
| Excluidos Test | 10 | 126 | (12.000.481,33 descartados — WAC de test) | TEST_RESIDUE |
| Excluidos stock-0 | 16 | 0 | 0 | sin posición |

## Qué debe firmar el humano (SIGNATURE BLOCK)

1. La consagración de 6.427 u / 9.932.216,94 ESTIMATED como inventario de apertura
   (decisión empresarial/contable — mandato §18/§25 de OBS-2).
2. La lista 07-proposed-opening.csv fila a fila (incluye las 4 filas Set B con su
   desglose de eventos).
3. La exclusión de los 10 Test (126 u / 12.000.481,33 inflados fuera de libros).
4. La designación del ACTOR ejecutor (candidato: 051c6157 admin@costpro.com; o
   reactivación de membership de la persona designada).
5. La fecha de ejecución (regularización) y la ventana de mantenimiento.
6. Modelo elegido: [ ] A [ ] B [ ] C [x recomendado] D — con opción explícita de
   «No reparar» (consecuencia: POS bloqueado para 98 productos por
   prevent_negative_inventory; detector permanente seguirá reportando).

## Condiciones de ejecución (precondiciones duras)

- Verificación de universo congelado (checksums de stock_current y cost_average de las
  124 filas == valores del pack; cualquier drift → ABORT por 19-abort-criteria.md).
- Ledger de la tienda sigue vacío (0/0/0/0).
- Firmante con acceso canónico y JWT de sesión.
- Ventana de mantenimiento (POS cerrado para la tienda).
- Pack SHA256SUMS verificado y referenciado en el audit del lote.

## Estado residual post-reparación (honesto y visible)

```text
Reconocido en ledger:        6.427 u (98 productos) — vendible, kardex activo
Residuo Test clasificado:      126 u (10 productos) — visible, EXCLUDED_FROM_REPAIR,
                               pendiente de decisión de archivo (fuera de alcance)
Stock 0 (sin posición):        16 productos — sin efecto
Residuos colaterales (BACKLOG OBS-2): z_reports 6, reservations 8, memberships revoked,
                               warehouses 3 sin warehouse_stock, commission_rules —
                               NO se tocan en esta reparación
```

## Consecuencias si se ejecuta (todas verificables)

- Invariantes I1–I14 (13-invariants.md) en verde; detector permanente actualizado;
  POS operativo para el catálogo central; WAC intacto; caja/comisiones/documentos ±0;
  reversión posible (17-rollback-design.md); auditoría con un solo batch trazable.

## Declaración final

Este documento RECOMIENDA; no ejecuta. La reparación solo ocurrirá en una fase posterior,
con las precondiciones anteriores verificadas y la firma humana registrada en
18-execution-checklist.md. Nada en esta fase modificó la DB (20-zero-mutation.md).
