# EXPOSURE-ASSESSMENT.md — Exposición real y cuantificación
## Misión CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 · FASE 2.2

Método exigido por la misión: **grants, RLS, configuración y consultas de metadatos** — sin escrituras reales en producción para probar permisos (las pruebas de mutación se reprodujeron en E2E, ver TEST-EVIDENCE.md). Evidencia: `evidence/anon-read-only-prod-PRE.json`.

## 1. Operaciones posibles con la clave pública `anon` (estado PRE endurecimiento, 2026-11-28T17:15Z)

| Operación | Vía | Estado PRE (RLS on sin policies + grants residuales) | Riesgo |
|---|---|---|---|
| SELECT | REST `/rest/v1/exchange_rates_backup_cpfx001` | **HTTP 200, `[]`, content-range `*/0`** (probado read-only en producción) — 0 filas expuestas | Nulo en datos; el permiso persistía |
| INSERT | REST POST | **DENEGADO** por RLS sin policy WITH CHECK (42501 al intentar) — demostrado en E2E (F10b) | Nulo operativamente mientras RLS on |
| UPDATE / DELETE | REST PATCH/DELETE | **DENEGADO** por RLS (0 policies) — demostrado en E2E | Nulo operativamente mientras RLS on |
| RPC relacionados | — | **No existen** RPC/vistas/funciones sobre la tabla (forense §1.6/§1.11) | Nulo |

**Interpretación honesta**: en el momento del sondeo (17:15Z) la exposición de DATOS vía anon era **cero** (RLS deny-all), pero los **grants residuales** (SELECT/INSERT/UPDATE/DELETE a anon y authenticated) convertían a RLS en la ÚNICA barrera: cualquier `DISABLE ROW LEVEL SECURITY` futuro (accidente u operación) restauraba CRUD anónimo completo sobre la tabla.

## 2. La ventana de exposición REAL (cuantificada)

- **Ventana: 2026-11-28T13:27:04Z → ~17:10Z (~3h43m)** — la tabla existió con **RLS OFF + grants completos**: durante esa ventana cualquier poseedor de la clave `anon` pública podía SELECT/INSERT/UPDATE/DELETE las 1.607 filas sin ninguna barrera.
- **¿Fue accedida?** Evidencia forense: `pg_stat_statements` registra **todas** las sentencias que tocaron la tabla y **ninguna** corresponde a roles PostgREST (anon/authenticated/service_role) — solo postgres (Management API: el CTAS, los counts, el sondeo del gate, el DO). **No hay evidencia de acceso de terceros durante la ventana.** (Limitación declarada: pg_stat_statements cubre el histórico del contador desde su último reset; es la única evidencia disponible — coherente con 0 tráfico).
- Naturaleza de los datos: **cotizaciones públicas de mercado** (BCC oficial / informal Diviza / elToque, fuentes públicas con licencia de uso documentada en CP-FX-001). Confidencialidad: baja. **Integridad/disponibilidad: riesgo real** — escrituras no autorizadas podrían corromper el artefacto de rollback de la recuperación histórica (el dump JSON gemelo en el repo mitiga la pérdida total: existe una segunda copia versionada).

## 3. Residual tras la remediación parcial fuera de banda (17:10Z)

- RLS on + 0 policies + grants presentes → anon ve 0 filas y no muta (demostrado en E2E F10 con exactamente esa postura). 
- Deuda pendiente (lo que esta misión cierra): (a) formalizar en **migración versionada** la postura (el estado actual nació fuera de banda); (b) **revocar los grants** (defensa en profundidad — dos barreras independientes); (c) documentar la tabla y su gobernanza; (d) retirar la entrada del allowlist del CI con resolución real.

## 4. Nivel de exposición final (POST endurecimiento — FASE 7)

| Vía | Resultado POST esperado/verificado |
|---|---|
| anon SELECT | HTTP 403/401 42501 `permission denied for table` (grants revocados) — verificado en producción tras aplicar (MIGRATION-AND-APPLICATION.md) |
| anon INSERT/UPDATE/DELETE | Denegado (grants + RLS sin WITH CHECK) |
| authenticated (todas las operaciones) | Denegado (grants revocados) |
| service_role | Conservado (default de plataforma; clave secreta server-side; proceso privilegiado legítimo para rollback/sondeo) |
| Management API (postgres) | Conservado — único canal legítimo de lectura/escritura del artefacto (owner del repositorio + token de cuenta) |

**Nivel de exposición final: tabla exclusivamente privada (opción A). Cero privilegios públicos. Dos barreras (ACL + RLS) + vigilancia continua del gate `tables_no_rls` en CI.**
