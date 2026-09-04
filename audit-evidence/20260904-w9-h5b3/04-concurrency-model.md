# W9.4.9 — H5-B3 — GATE 5: MODELO DE RACE CONDITION

Fecha: 2026-09-04 | Baseline: git 3d03afbc

## Escenario modelado

```text
Transaction X (status='completed', 1 item: producto P, cantidad q=5)
SESSION A ──┐
            ├── reverse_transaction_v2(X) simultáneas (la carrera del hallazgo H5-B3)
SESSION B ──┘
```

## Secuencia teórica PELIGROSA (la que H5-B3 temía en V1)

```text
A: read X (ACTIVE/completed)      B: read X (completed)
A: validate OK                    B: validate OK
A: reverse (stock+q, voided)      B: reverse (stock+q, voided)
A: commit                         B: commit
→ 2 reversiones, 2 movimientos de stock, 2 eventos de auditoría  ← CASO PELIGROSO
```

## Predicción con la arquitectura ACTUAL (V2)

Ambas sesiones ejecutan idéntica primera sentencia:

```sql
SELECT * FROM transactions WHERE id = X FOR UPDATE;
```

- PostgreSQL solo concede el row-lock a UNA sesión; la otra **espera** en esa sentencia.
- Al hacer COMMIT el ganador, el perdedor adquiere el lock y PostgreSQL re-lee la versión
  commitida (EvalPlanQual, READ COMMITTED): ve `status='voided'`.
- El perdedor cae en `IF v_tx.status = 'voided' THEN RETURN {status:'idempotent'}` ANTES de
  tocar stock → **ni un solo movimiento adicional**.

### Secuencia real esperada

```text
A: SELECT…FOR UPDATE → lock obtenido
B: SELECT…FOR UPDATE → BLOQUEA (espera a A)
A: valida (completed→OK) → stock_movement(s) → UPDATE status='voided' → audit → COMMIT
B: lock obtenido → re-lee fila → status='voided' → RETURN idempotent → COMMIT (sin efectos)
→ 1 reversión, N movimientos de stock (N = items de X, UNA vez), 1 audit REVERSE_TRANSACTION_V2
→ CASO SEGURO
```

## Variantes de carrera también modeladas

| # | Sesión A | Sesión B | Resultado esperado |
|---|---|---|---|
| R1 | reverse_transaction_v2(X) | reverse_transaction_v2(X) | 1 success + 1 idempotent |
| R2 | reverse_transaction_v2(X) (lenta, lock retenido) | reverse_transaction_v2(X) (real RPC) | B bloquea el tiempo del lock de A; al commit de A → idempotent; B NO produce efectos |
| R3 | reverse_transaction_v2(X) → void_transaction(X) secuencial | — | ERR_ALREADY_VOIDED |
| R4 | void_transaction(X) → reverse_transaction_v2(X) secuencial | — | idempotent |
| R5 | reverse_transaction_v2(X) con caller sin acceso al store | — | ERR_UNAUTHORIZED (sin efectos) |
| R6 | llamada anónima (anon key) a reverse_transaction_v2 | — | rechazo PostgREST (sin EXECUTE para anon) |

## ¿Puede la carrera producir doble impacto en…?

- **stock**: NO — el movimiento lo emite únicamente el ganador del lock (demostración GATE 8).
- **WAC**: NO APLICA — la ruta de ventas no recalcula WAC (no invoca fn_recalc_wac); el
  "double WAC inversion" era un riesgo de la cadena de receipts.
- **payments**: NO — ninguna de las dos funciones muta payment_transactions (verificado en
  cuerpos live, w9h5b3_q4_mutators.sql). El ledger permanece inmutable (contrato H5-B2).
- **audit**: 1 fila REVERSE_TRANSACTION_V2 (ganador) + 0 del perdedor idempotente.

## Método de prueba (GATES 6–7)

- Datos 100% sintéticos (store/user/product/transaction/items dedicados, UUIDs deterministas
  con prefijo a1b2c3d4-0000-…), creados vía SQL server-side; eliminados al finalizar con
  verificación PRE==POST.
- Sesiones REALES independientes: cada llamada RPC vía PostgREST (`/rest/v1/rpc/...`) con
  service_role = una sesión/transacción PostgreSQL distinta — idéntico al camino de producción
  /api/reverse (supabase-admin usa service_role).
- Overlap forzado (R2): la sesión A retiene el lock manualmente (transacción SQL con
  SELECT…FOR UPDATE + pg_sleep) mientras B ejecuta el RPC real → medimos el tiempo de bloqueo
  de B y su resultado.
- Nada destructivo: no se tocan ventas reales; no hay UPDATE/DELETE sobre datos de negocio.
