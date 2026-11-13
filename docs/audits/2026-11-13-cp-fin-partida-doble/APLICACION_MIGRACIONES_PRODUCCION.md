# CP-FIN — Registro de aplicación de migraciones en PRODUCCIÓN

**Fecha de aplicación:** 2026-11-13 14:18–14:22 UTC
**Canal:** Management API `/v1/projects/wthkddeleylijmonclxg/database/query` + `NOTIFY pgrst 'reload schema'` (patrón canónico m002…m013, docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3)
**Script:** `scripts/m014-aplicar-migraciones-cp-fin.mjs` (guard CP-INFRA-019 con doble flag)
**Autorización:** instrucción explícita del propietario en la misión de auditoría final (2026-11-13): «primero aplica la migración». Regla de oro productiva 11g: validado antes en la BD aislada (smoke TODO OK, suite 33/33, higiene net delta 0).

## Migraciones aplicadas (lote único por archivo, sin reintentos)

| # | Archivo | SHA-256 | HTTP |
|---|---|---|---|
| 1 | `supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql` | `638a660ea39671e35f2892d60ff6f2d23b66a96fee66533dc192a25fd948ee73` | 201 |
| 2 | `supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql` | `e7ac17eff98bb32f1c71aa4d0a2c56f412ef3c44e83ffd186d37c7498f38259e` | 201 |
| 3 | `supabase/migrations/20261113120200_cp_fin_endurecimiento_rls.sql` | `de885c5ba856af21d2151f35467dbbfe6de855570b5d16826eca8dd2069a3809` | 201 (vía `scripts/apply-fin-hardening.mjs`, tras validar en aislada) |

## Verificación POST (fail-closed, 14/14 OK)

- 8 tablas `fin_*` presentes; **RLS FORCED ×8** (endurecimiento alineado al estándar payrolls)
- 16 políticas RLS; semillas: 44 categorías, 15 tipos documentales, 10 reglas activas, 41 métricas
- 19 triggers `fin_trg_%`; 11 RPCs públicas SECURITY DEFINER; 9 RPCs internas sin EXECUTE para authenticated/anon/public
- `fin_entries`/`fin_movements` SELECT-only para authenticated; **CERO privilegios anon** en `fin_*`
- **CERO asientos/movimientos** (sin backfill histórico — pendiente de autorización expresa)
- Pruebas negativas OK: `ERR_DOC_NOT_FOUND`, `ERR_RULE_NOT_FOUND`, `ERR_UNAUTHORIZED` (anti-spoofing del canal postgres)
- Delta 0 en las 12 tablas de negocio auditadas (transactions, devolutions, receipts, received_services, issue_slips, inventory_adjustments, commission_payments, payrolls, cash_flow_documents, payment_transactions, stock_movements, products)

Evidencia completa: `audit-evidence/CP-FIN-20261113/m014-verificacion-produccion.txt`

## Defecto corregido durante la aplicación (auditoría)

- **Hallazgo (ALTO, endurecimiento):** las migraciones base+motor dejaron RLS habilitado pero SIN FORCE en las 8 tablas, y 6 tablas retuvieron privilegios por defecto para `anon` (protegidos solo por políticas). El estándar del módulo financiero precedente (payrolls/m013) es FORCED + sin anon.
- **Causa raíz:** la migración base endureció `fin_entries`/`fin_movements` pero omitió FORCE y la revocación anon en las 6 tablas restantes.
- **Corrección:** migración nueva `20261113120200_cp_fin_endurecimiento_rls.sql` (idempotente, fail-closed), validada primero en la BD aislada (smoke TODO OK + higiene net delta 0 tras el cambio) y aplicada una sola vez en producción.
- **Seguridad del canal:** verificado que `postgres` y `service_role` tienen `bypassrls` (FORCE no afecta el canal de administración); `authenticated`/`anon` no lo tienen.

## Estado tras la aplicación

- Esquema CP-FIN **ACTIVO** en producción (wthkddeleylijmonclxg): triggers de contabilización operativos para documentos NUEVOS que alcancen estados definitivos.
- **Sin contabilización histórica**: 0 asientos/0 movimientos; el backfill (`fin_backfill` con `dry_run` primero) queda pendiente de autorización expresa del propietario (§12 de la misión de auditoría: «no activar contabilizaciones históricas masivas sin autorización»).
- La BD aislada (lguovmvrozxgssupkwpf) quedó con el mismo estado endurecido (misma migración aplicada para mantener paridad).
