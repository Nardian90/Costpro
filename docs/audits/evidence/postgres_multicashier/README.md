# Expediente de validación PostgreSQL — misión COSTPRO-MULTICASHIER-DESIGN-008

Validación REAL (no simulación) de la especificación SQL del multicajero:
esquema mínimo fiel a D.16-D.21, restricciones, triggers inmediatos y diferidos,
CTE/V3 de conciliación y las funciones de especificación (equivalentes RPC).

**Carácter desechable:** PostgreSQL 17.11 servido desde binarios extraídos de
paquetes Debian en `~/.pg-tmp/` (sin root), clúster propio en el puerto 5433 por
socket UNIX local, base `audit_mc` recreada en cada ejecución. Sin producción,
sin CostproE2E, sin Supabase, sin credenciales, sin datos personales.

## Archivos

| Archivo | Contenido |
|---|---|
| `00_schema_minimal.sql` | Subconjunto fiel: stores, profiles, cash_registers, cash_accounts, cash_closures, cash_transfers, payment_transactions, cash_transfer_custody_events |
| `01_constraints.sql` | FKs compuestas `(id, store_id)`, matriz de campos por estado, extremo receptor/retorno exacto, cadena de custodia (FK compuesta, sucesor único, primer evento único) |
| `02_triggers.sql` | Capa INMEDIATA (trigger ordinario AFTER) + capa DIFERIDA (`CREATE CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`) + funciones de especificación request/deliver/receive/request-return/return/cancel/custodia + append-only |
| `03_v3_reconciliation.sql` | V3 definitiva: `legs_total`, `out_all`, `in_all`, `invalid_legs`, `out_exactas`, `in_exactas`, titular con GAVETA física exacta y vigencia temporal histórica (se carga ANTES que 02) |
| `04_valid_fixtures.sql` | 10 pruebas positivas + vigencia histórica (cierre de sesión después de recibir) + orden inverso sin bloqueo permanente |
| `05_invalid_fixtures.sql` | 19 pruebas negativas (15 del pliego + 4 de cadena de custodia), cada una con verificación de rollback íntegro |
| `06_assertions.sql` | Demostración del COMMIT diferido (error EN el COMMIT + rollback íntegro) + aserciones finales PASS/FAIL |

## Ejecución

```bash
bash /home/z/my-project/scripts/run_postgres_validation.sh
```

Orden de carga: 00 → 01 → 03 → 02 → 04 → 05 → 06 (la vista V3 debe existir
antes de que los triggers la consulten; los cuerpos PL/pgSQL se resuelven en
tiempo de ejecución).

## Resultado registrado (2026-11-09)

- PostgreSQL: `PostgreSQL 17.11 (Debian 17.11-0+deb13u1), x86_64` — REAL, no embebido ni simulado.
- Esquema: ejecutado; CHECKs: ejecutados; triggers inmediatos y diferidos: ejecutados;
  transacciones completas: ejecutadas; casos negativos: rechazados; reversiones: verificadas.
- Ver detalle en `§D.21.7` de `COSTPRO_MULTICASHIER_DESIGN_002.md`.

## Workflow de CI (opcional, no necesario)

Como la validación local es posible y reproducible, no se creó workflow de GitHub
Actions. Si se desease certificar en CI, un workflow aislado (`services: postgres: 17`)
ejecutando estos mismos archivos sería suficiente; se deja indicado, sin tocar los
workflows funcionales del repositorio.
