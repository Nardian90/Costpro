# Expediente de validación PostgreSQL — misiones COSTPRO-MULTICASHIER-DESIGN-008/009/010

Validación REAL (no simulación) de la especificación SQL del multicajero:
esquema mínimo fiel a D.16-D.22, restricciones, capas de triggers inmediatos y
diferidos, V3 de conciliación, funciones de especificación (equivalentes RPC),
control de saldo de tesorería (D.20.3/D.22.3), idempotencia con huella
canónica (D.22.4/D.23.4), inmutabilidad TOTAL del ledger (D.22.1/D.23.1),
máquina de estados de custodia con apertura/cierre (D.23.2), autorización
efectiva del transportista (D.23.3) y **concurrencia DETERMINISTA con DOS
conexiones psql reales cuya espera se verifica en pg_stat_activity** (D.23.5).

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
cualquier archivo SQL o aserción falla, si el conteo de aserciones negativas no
es 73, si la contención concurrente no se demuestra o si falta el veredicto
final). `KEEP_WORK=1` conserva los artefactos temporales para depuración.

## Archivos

| Archivo | Contenido |
|---|---|
| `00_schema_minimal.sql` | 8 tablas fieles al diseño (+ `multicashier_enabled_at`, `exchange_rate`, `request_fingerprint` para D.22) |
| `01_constraints.sql` | FKs compuestas `(id, store_id)`, matriz por estado, extremo receptor/retorno exacto, cadena de custodia |
| `02_triggers.sql` | Capa INMEDIATA (`pt_immediate` con inmutabilidad TOTAL D.22.1/D.23.1 — también at/exchange_rate/transaction_id/created_by, `pt_no_delete` append-only) + DIFERIDA (`ctr_legs_final`/`ctr_transfer_final` DEFERRABLE INITIALLY DEFERRED reconciliando OLD y NEW) + `f_check_treasury_saldo` (D.20.3/D.22.3) + `f_assign_carrier` (D.23.3) + funciones de especificación request/deliver/receive/request-return/return/cancel con saldo, huella jsonb canónica (D.23.4) y custodia con máquina de estados (`f_create_custody_event` + trigger `ctr_custody_continuity` con apertura/cierre/fin + append-only) |
| `03_v3_reconciliation.sql` | V3 definitiva (`legs_total`/`invalid_legs`, titular con gaveta EXACTA y vigencia temporal) + vista de clasificación fiel a D.18.2/D.19.2 (mapeos: `at`↔`payment_date`, `model_scope`, `exchange_rate`) |
| `04_valid_fixtures.sql` | 15 bloques positivos: ciclo completo gaveta/tesorería/cuenta/devolución/cancelación, reintentos idempotentes, custodia sucesiva con reasignación, vigencia histórica, orden inverso sin bloqueo, saldo exacto (P11), separación CUP/USD (P12), entrega por transportista ASIGNADO Y AUTORIZADO (P13/A-P1, D.23.3) + A-P3 |
| `05_invalid_fixtures.sql` | **73 aserciones negativas verificables / 25 casos nuevos de D.23** (aserciones HARD-FAIL con rollback comprobado por caso): N1-N15b, N20-N34 (misiones 008/009), N35-N40 (inmutabilidad temporal/atribución + model_scope invariante + saldo íntegro + ciclo ordinario legítimo), N41-N50 (máquina de estados de custodia, fixtures en namespace `idem-L*`), A-N3..A-N7 (autoasignación/rol/tienda/asignación/identidad), I-N7..I-N10 (huella completa: autorizador, NULL≡explícito, canonicidad) |
| `06_assertions.sql` | COMMIT diferido demostrado (error EN el COMMIT + rollback íntegro, HARD-FAIL) + aserciones finales B1-B8 todas HARD-FAIL |
| `run_output_2026-11-08.log` | Salida completa verificable de la ejecución certificada (fecha real; el log `2026-11-09` de la misión 008 llevaba fecha futura y fue retirado) |
| `README.md` | Este documento |

## Concurrencia DETERMINISTA (misión 010, fase del runner — DOS conexiones psql reales)

Patrón por escenario: una sesión PORTADORA retiene una clave advisory; una sesión
COORDINADORA toma el bloqueo objetivo (fila de cuenta / fila de transferencia /
clave única idem) y queda esperando esa clave; el runner **verifica en
pg_stat_activity** que (a) el coordinador espera con el bloqueo ya tomado y (b)
los DOS clientes esperan el bloqueo (`wait_event_type='Lock'`) — solo entonces
libera con `pg_terminate_backend` sobre el portador y observa el desenlace:

1. **Saldo**: dos entregas de 700 sobre saldo 1000 desde la misma cuenta —
   exactamente una confirma (`ERR_SALDO_INSUFICIENTE` la otra); saldo final 300 y
   una sola pierna.
2. **N29 custodia**: dos reasignaciones simultáneas — se serializan por
   `FOR UPDATE`; el ganador crea seq=2 y el perdedor (estado previo obsoleto) es
   rechazado con `ERR_CUSTODY_PREV_MISMATCH`; cadena lineal, sin bifurcación.
3. **Idempotencia**: misma clave+parámetros ⇒ ambos clientes obtienen el MISMO id
   (sin error espurio); misma clave con importe distinto ⇒ un OK y un
   `ERR_IDEMPOTENCY_KEY_REUSE`; una sola transferencia persiste.

El log certifica las tres esperas (`espera real demostrada: 2 backends en
wait_event_type='Lock'`). Si la contención no puede demostrarse, el runner falla
(y la prueba quedaría clasificada NOT RUN/BLOCKED, nunca PASS concurrente).

## Resultado registrado (2026-11-08)

- `PostgreSQL 17.11 (Debian 17.11-0+deb13u1), x86_64` — REAL.
- PASS: esquema + CHECKs + triggers (inmediatos y diferidos, disparados también
  EN el COMMIT) + transacciones completas + 73 aserciones negativas (25 casos
  nuevos de D.23) + 3 escenarios concurrentes con contención demostrada
  (10 conexiones reales). Ver `run_output_2026-11-08.log` y `§D.23.6` (matriz de
  verificación) de `COSTPRO_MULTICASHIER_DESIGN_002.md`.

## Workflow de CI (opcional, no necesario)

La validación local es reproducible desde checkout limpio, por lo que no se
creó workflow de GitHub Actions. Si se desease certificar en CI, un workflow
aislado (`services: postgres: 17`) ejecutando `scripts/run_postgres_validation.sh`
sería suficiente; se deja indicado, sin tocar los workflows funcionales.
