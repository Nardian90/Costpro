# CP-FIN — Registro de aplicación de migraciones en PRODUCCIÓN

## Lote 1 — m014: base + motor + endurecimiento

**Fecha de aplicación:** 2026-11-13 14:18–14:22 UTC
**Canal:** Management API `/v1/projects/wthkddeleylijmonclxg/database/query` + `NOTIFY pgrst 'reload schema'` (patrón canónico m002…m013, docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3)
**Script:** `scripts/m014-aplicar-migraciones-cp-fin.mjs` (guard CP-INFRA-019 con doble flag)
**Autorización:** instrucción explícita del propietario en la misión de auditoría final (2026-11-13): «primero aplica la migración». Regla de oro productiva 11g: validado antes en la BD aislada (smoke TODO OK, suite 33/33, higiene net delta 0).

### Migraciones aplicadas (lote único por archivo, sin reintentos)

| # | Archivo | SHA-256 | HTTP |
|---|---|---|---|
| 1 | `supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql` | `638a660ea39671e35f2892d60ff6f2d23b66a96fee66533dc192a25fd948ee73` | 201 |
| 2 | `supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql` | `e7ac17eff98bb32f1c71aa4d0a2c56f412ef3c44e83ffd186d37c7498f38259e` | 201 |
| 3 | `supabase/migrations/20261113120200_cp_fin_endurecimiento_rls.sql` | `de885c5ba856af21d2151f35467dbbfe6de855570b5d16826eca8dd2069a3809` | 201 (vía `scripts/apply-fin-hardening.mjs`, tras validar en aislada) |

### Verificación POST (fail-closed, 14/14 OK)

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

---

## Lote 2 — m015: correcciones de la auditoría integral (4 fixes)

**Fecha de aplicación:** 2026-11-13 15:12 UTC
**Canal:** idéntico al lote 1 (Management API + `NOTIFY pgrst 'reload schema'`, lote único por archivo, sin reintentos).
**Script:** `scripts/m015-aplicar-fixes-cp-fin.mjs` (guard CP-INFRA-019 con doble flag, `--only-verify` disponible).
**Autorización:** misma instrucción del propietario (misión de auditoría final: «primero aplica la migracion claro» + corrección de defectos). Regla 11g: validado antes en la aislada con la **auditoría integral 34/34 PASS** (Casos A-J con documentos reales + RLS + matriz documental) y higiene `net delta = 0`.

### Migraciones aplicadas (lote único por archivo, sin reintentos)

| # | Archivo | SHA-256 | HTTP |
|---|---|---|---|
| 1 | `supabase/migrations/20261113120300_cp_fin_triggers_diferidos.sql` | `3d0b1e494740dd5b6a68735f96f5a5d6978a5adaeec894a5365ef719d92f14e9` | 201 |
| 2 | `supabase/migrations/20261113120400_cp_fin_fix_metricas_nomina_flujo.sql` | `429cf5ebba46c3fe8396e7443bd5a151a05f738d9cf97f8001a83918e29ab48d` | 201 |
| 3 | `supabase/migrations/20261113120500_cp_fin_fix_sentidos_pago.sql` | `19c6779070bc67e6ce69d8fe9fbc2a44c2dc6800e7416364df4339ee9bb2c8d7` | 201 |
| 4 | `supabase/migrations/20261113120600_cp_fin_fix_audit_logs_check.sql` | `7d4fb088e3a039d4d9b64e38171ba5f830f7ccd15c42e03a9ff5ed4e12a6def2` | 201 |

### Defectos que corrigen (detalle y evidencia en INFORME_AUDITORIA_FINAL.md §14)

1. **Triggers diferidos:** los RPC reales insertan cabecera en estado definitivo y filas hijas después; los triggers inmediatos computaban métricas incompletas (VENTA/DEVOLUCIÓN → ERR_UNBALANCED; RECEPCIÓN omitida en silencio).
2. **Métricas:** tipado de NOMINA/FLUJO_CAJA, claves de cobros/reembolsos CUP, colisión de alias y columna inexistente en RECEPCIÓN.
3. **Sentidos de pago invertidos** en RECEPCION y SERVICIO_RECIBIDO (el pago sumaba caja y aumentaba la deuda).
4. **Whitelist audit_logs** sin `fin_rule_versions` → activar/desactivar reglas globales chocaba con `audit_logs_store_id_check` (23514).

### Verificación POST (fail-closed, 10/10 OK)

- 3 CONSTRAINT TRIGGERS diferidos (transactions, devolutions, receipts); trigger de pagos sigue inmediato
- `fin_compute_metrics` con variables tipadas (fix nómina/flujo/caja/cobros/recepción)
- Sentidos de pago: `r-pay-cxp` D y `sp-cxp-c` D; CERO movimientos invertidos
- Whitelist `audit_logs` con `fin_rule_versions` SIN perder `master_products`/`master_parties`
- RLS FORCED intacto ×8; **CERO asientos/movimientos** (sin backfill)
- Delta 0 en las 12 tablas de negocio

Evidencia completa: `audit-evidence/CP-FIN-20261113/m015-verificacion-produccion.txt`

### Estado final de producción

Esquema CP-FIN completo (7 migraciones), corregido y verificado. Los documentos NUEVOS que alcancen estados definitivos se contabilizan automáticamente con las reglas corregidas; 0 asientos históricos (backfill pendiente de autorización expresa).
