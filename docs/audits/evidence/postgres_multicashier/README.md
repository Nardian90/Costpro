# Expediente de validación PostgreSQL — misiones COSTPRO-MULTICASHIER-DESIGN-008/009

Validación REAL (no simulación) de la especificación SQL del multicajero:
esquema mínimo fiel a D.16-D.22, restricciones, capas de triggers inmediatos y
diferidos, V3 de conciliación, funciones de especificación (equivalentes RPC),
control de saldo de tesorería (D.20.3/D.22.3), idempotencia con huella
(D.22.4), continuidad de custodia (D.22.2) y **concurrencia con DOS conexiones
psql reales**.

**Carácter desechable:** clúster PostgreSQL efímero en `mktemp -d`, puerto
libre y destruido por `trap` al terminar (incluso si una prueba falla). Sin
producción, sin CostproE2E, sin Supabase, sin credenciales, sin datos personales.

## Requisitos

- **PostgreSQL ≥ 16** (validado sobre PostgreSQL 17.11, Debian 17.11-0+deb13u1,
  x86_64) con `initdb`, `pg_ctl` y `psql` accesibles en `PATH`, **o** la variable
  `PG_BIN_DIR` apuntando al directorio de binarios.
- Método sin root (usado por estas misiones, documentado como referencia):
  ```bash
  apt-get download postgresql-17 postgresql-client-17 libpq5
  for d in *.deb; do dpkg-deb -x "$d" root/; done
  PG_BIN_DIR="$PWD/root/usr/lib/postgresql/17/bin" bash scripts/run_postgres_validation.sh
  ```

## Ejecución portable (desde la raíz del repositorio)

```bash
bash scripts/run_postgres_validation.sh
```

El runner (`scripts/run_postgres_validation.sh`, versionado en el PR) no depende
de rutas locales del agente: rutas relativas a la raíz del repo, detección de
dependencias con error explícito, base creada desde cero en cada ejecución,
limpieza garantizada por `trap` y veredicto PASS/FAIL identificable (falla si
cualquier archivo SQL o aserción falla, si el conteo de casos negativos no es 46
o si falta el veredicto final). `KEEP_WORK=1` conserva los artefactos temporales
para depuración.

## Archivos

| Archivo | Contenido |
|---|---|
| `00_schema_minimal.sql` | 8 tablas fieles al diseño (+ `multicashier_enabled_at`, `exchange_rate`, `request_fingerprint` para D.22) |
| `01_constraints.sql` | FKs compuestas `(id, store_id)`, matriz por estado, extremo receptor/retorno exacto, cadena de custodia |
| `02_triggers.sql` | Capa INMEDIATA (`pt_immediate` con inmutabilidad de piernas D.22.1, `pt_no_delete` append-only) + DIFERIDA (`ctr_legs_final`/`ctr_transfer_final` DEFERRABLE INITIALLY DEFERRED reconciliando OLD y NEW) + `f_check_treasury_saldo` (D.20.3/D.22.3) + funciones de especificación request/deliver/receive/request-return/return/cancel con saldo, autorización de actor (D.22.5 decisión B) e idempotencia con huella (D.22.4) + custodia con continuidad forzada (`f_create_custody_event` + trigger `ctr_custody_continuity` + append-only) |
| `03_v3_reconciliation.sql` | V3 definitiva (`legs_total`/`invalid_legs`, titular con gaveta EXACTA y vigencia temporal) + vista de clasificación fiel a D.18.2/D.19.2 (mapeos: `at`↔`payment_date`, `model_scope`, `exchange_rate`) |
| `04_valid_fixtures.sql` | 15 bloques positivos: ciclo completo gaveta/tesorería/cuenta/devolución/cancelación, reintentos idempotentes, custodia sucesiva con reasignación, vigencia histórica, orden inverso sin bloqueo, saldo exacto (P11), separación CUP/USD (P12), entrega por transportista (P13, decisión B) |
| `05_invalid_fixtures.sql` | **46 casos negativos verificables** (aserciones HARD-FAIL con rollback comprobado por caso): N1-N15b de la misión 008, N20-N25 (inmutabilidad/desvinculación del ledger), S-N1..S-N4 (saldo fail-closed), I-N1..I-N6 (idempotencia), A-N1/A-N2 (actor vs titular), N26-N28 y N30-N34 (custodia; N29 es concurrente, en el runner) |
| `06_assertions.sql` | COMMIT diferido demostrado (error EN el COMMIT + rollback íntegro, HARD-FAIL) + aserciones finales B1-B8 todas HARD-FAIL |
| `run_output_2026-11-08.log` | Salida completa verificable de la ejecución certificada (fecha real; el log `2026-11-09` de la misión 008 llevaba fecha futura y fue retirado) |
| `README.md` | Este documento |

## Concurrencia (fase del runner, DOS conexiones psql reales por escenario)

1. **N29 custodia**: dos reasignaciones simultáneas — se serializan por `FOR UPDATE`;
   el ganador crea seq=2 y el perdedor (estado previo obsoleto) es rechazado con
   `ERR_CUSTODY_PREV_MISMATCH`; verificación: cadena lineal, sin bifurcación.
2. **Saldo**: dos entregas de 700 sobre saldo 1000 desde la misma cuenta —
   exactamente una confirma (`ERR_SALDO_INSUFICIENTE` la otra); saldo final 300 y
   una sola pierna.
3. **Idempotencia**: misma clave+parámetros ⇒ ambos clientes obtienen el MISMO id
   (sin error espurio); misma clave con importe distinto ⇒ un OK y un
   `ERR_IDEMPOTENCY_KEY_REUSE`; una sola transferencia persiste.

## Resultado registrado (2026-11-08)

- `PostgreSQL 17.11 (Debian 17.11-0+deb13u1), x86_64` — REAL.
- PASS: esquema + CHECKs + triggers (inmediatos y diferidos, disparados también
  EN el COMMIT) + transacciones completas + 46 negativos + 3 escenarios
  concurrentes con 8 conexiones reales. Ver `run_output_2026-11-08.log` y
  `§D.22.7` (matriz de verificación) de `COSTPRO_MULTICASHIER_DESIGN_002.md`.

## Workflow de CI (opcional, no necesario)

La validación local es reproducible desde checkout limpio, por lo que no se
creó workflow de GitHub Actions. Si se desease certificar en CI, un workflow
aislado (`services: postgres: 17`) ejecutando `scripts/run_postgres_validation.sh`
sería suficiente; se deja indicado, sin tocar los workflows funcionales.
