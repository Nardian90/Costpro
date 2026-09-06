# W9.5 — B-10b-OBS-2-R1 · 01-authorization.md
# GATE ABSOLUTO §0 — Autorización humana de la reparación

## Fuente de la autorización

La autorización humana explícita fue emitida por el principal humano en la **orden de
ejecución R1** transmitida en la sesión `web-c98ecee2-ae4b-4463-b4c1-135e982ca7ed`
(chat `37fb835b-e740-404f-89d1-69b8404a9693`, trace `1a078451671216c5`), con fecha
2026-09-06 (America/Havana). Es una instrucción directa de ejecución — NO es una
recomendación, un commit, una inferencia, una variable de entorno ni un valor por
defecto generados por el agente.

## Cuadro de conformidad firma ↔ diseño (6/6)

| # | Ítem requerido (16-repair-recommendation.md §SIGNATURE) | Valor firmado | Valor del diseño congelado | Match |
|---|---|---|---|---|
| 1 | Modelo | `MODEL = B + C` | `D = B (apertura formal auditada) + C (exclusión Test)` | ✓ |
| 2 | Tienda | `d1c4ba0e` | `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576 — TIENDA CENTRAL COSTPRO` | ✓ |
| 3 | Universo | `98 products` | 98 filas en `07-proposed-opening.csv` (94 Set A + 4 Set B) | ✓ |
| 4 | Cantidad | `6427 units` | Σ opening_qty = 6.427 u (verificada en ejecución, exacta) | ✓ |
| 5 | Exclusión Test | `10 products / 126 units` | `05-test-exclusions.csv` — 10 productos, Σ 126 u | ✓ |
| 6 | Actor | `051c6157` | `051c6157-600b-425e-b8c0-72388bacf541` — admin@costpro.com, is_admin()=true, tenant 5364ccf8, acceso canónico verificado | ✓ |

Ítems adicionales de la firma: **fecha de ejecución = execution timestamp** (§10 de la
orden: explícitamente NO retro-fechar a 2026-08-02 ni 2026-08-17) y **autoridad de
ejecución = CSV congelado del diseño** («El CSV congelado del diseño es la autoridad de
ejecución» — se cumplieron literalmente: `07-proposed-opening.csv` fila a fila).

## Precondiciones de 16-repair-recommendation.md verificadas

- [x] Universo congelado verificado (checksums y comparación fila a fila vs
      `raw/frozen_universe.json` → 124/124 idénticos, incluido updated_at)
- [x] Ledger de la tienda vacío (0/0/0/0) en PRE
- [x] Firmante con acceso canónico (sonda `auth.uid()`/`is_admin()`/`has_store_access()`
      → true/true/true; `raw/r1_actor_probe.json`)
- [x] Pack de diseño con SHA256SUMS verificado: **45/45 OK**
- [x] Ventana de ejecución: orden humana de ejecución inmediata; la transacción duró
      ~4 s con locks de fila (FOR UPDATE) + advisory lock; imposible que una venta
      concurrente de los 98 productos generara estado parcial (atomicidad de transacción
      única; A17 con lock_timeout=15 s armado)

## Estado del SIGNATURE BLOCK del diseño

`16-repair-recommendation.md` permanece congelado (45/45 SHA) en estado
«PENDIENTE DE FIRMA HUMANA» por diseño: la firma NO se escribió dentro del pack de
diseño; llegó como orden de ejecución en esta sesión y queda documentada en este acta
con la trazabilidad de arriba.
