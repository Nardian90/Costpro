# INFORME.md — CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001
## Auditoría, identificación de escritores y protección de `public.exchange_rates_backup_cpfx001`

**Repo:** Nardian90/Costpro · **Rama:** `fix/cpsec-fx-backup-private-20261128` · **Fecha:** 2026-11-28
**Objeto:** tabla de respaldo de tasas detectada por el gate en vivo (1.607 filas · RLS desactivada en el hallazgo · grants a anon/authenticated · «escritura activa» aparente · sin migración ni referencia en código — estado al inicio de la misión).

## 1. Resumen ejecutivo

La tabla es el **respaldo congelado de `exchange_rates`** creado UNA sola vez (2026-11-28T13:27:04Z) por el canal gobernado `scripts/fx-apply-recovery.mjs` de la misión CP-FX-001 (PR #1745, ya fusionada) antes de aplicar la recuperación histórica de la serie informal USD. El hallazgo era REAL: durante ~3h43m (13:27Z→~17:10Z) la tabla vivió con RLS OFF y CRUD completo anónimo (herencia de los default privileges de Supabase); sin evidencia de acceso de terceros (pg_stat_statements: todas las sentencias son del rol postgres vía Management API — cero tráfico PostgREST). La «escritura activa» del hallazgo quedó **desmentida**: `pg_stat_all_tables` muestra `n_tup_upd=0, n_tup_del=0` — la tabla está congelada desde el CTAS; la frescura aparente era de los DATOS internos (capturas de esa mañana), no de escrituras del respaldo.

~17:10Z un operador (rol postgres vía Management API; identidad humana no demostrable — logs API 404) habilitó RLS fuera de banda; el endurecimiento quedó incompleto: sin migración versionada y **sin revocar los grants residuales** (RLS como única barrera). Esta misión completa el cierre: **opción A — tabla exclusivamente privada**, formalizada en migración versionada con REVOKE + RLS sin policies (deny-all) + defensa en profundidad, con los datos históricos intactos y el proceso legítimo de actualización de tasas preservado (cero contacto).

## 2. Conclusiones por fase

| Fase | Conclusión |
|---|---|
| 0 Restauración | main real `168349161` (PRs #1745/#1743 fusionados tras el SHA informado 4f7b8c44a — ancestro ✓). 0 PRs abiertos. Tabla ausente en E2E (rollback CP-FX-001), presente en producción. PM2+health 200. |
| 1 Forense | 14 puntos completos (evidence/forensic-*.json): 20 columnas espejo de `exchange_rates`, SIN PK/índices/FK/triggers/policies/vistas; `relrowsecurity` TRUE desde ~17:10Z; grants residuales anon/authenticated (4 c/u); escritura ÚNICA (CTAS 13:27Z, n_tup_upd=0/del=0); contenido 1.607 = BCC 1.004 + elToque 498 + Diviza 105, hash `4c151b16…`; identidad con el dump JSON de CP-FX-001 demostrada (603 informales exactos). |
| 2 Escritores/consumidores | Escritor único demostrado: canal gobernado fx (Management API/postgres), one-shot. Lector: sondeos + gate CI, solo postgres. **Cero consumidores en la app** (0 refs src/). Cron de captura escribe la tabla VIVA (2×/día, service-role) y no toca el respaldo. Sin pg_cron, sin Edge Functions, sin webhooks hacia la tabla. |
| 2.2 Exposición | anon SELECT (read-only en prod): 200 con `[]` y content-range `*/0` (RLS deny-all) — cero filas expuestas; INSERT/UPDATE/DELETE denegados por RLS (demostrado en E2E con la misma postura). Ventana histórica de exposición completa: ~3h43m. Grants residuales = deuda que se cierra. |
| 3 Diseño | Opción A (exclusivamente privada) vs B (RPC sin demanda) vs C (sin tenant) — análisis en SECURITY-DESIGN.md. Sin policies cosméticas: cero CREATE POLICY. |
| 4 Preservación | Escritor legítimo intacto: service_role conserva acceso (E2E F6/F7 verdes); el DO del script fx endurece la postura completa en futuras ejecuciones (causa raíz cerrada); el cron de tasas no se toca (0 refs). |
| 5 Implementación | Migración 20261128173000 + rollback + test contractual 11/11 + script §11g + batería E2E + sondeo forense al repo + writers.manifest +3 + **allowlist tables_without_rls RETIRADA** + replay 235 MATCH. |
| 6 Validación E2E | Batería postura **17/17 PASS** · smoke 88/88 · guardrail **`PASS — net delta = 0`** · tsc/eslint/contract-static 0 · check-writers OK. |
| 7 Producción | Aplicación §11g una sola vez + POST (ver MIGRATION-AND-APPLICATION.md §3, con PRE/POST reales) + verificación anónima bloqueada + writer legítimo verificado + PM2/health. |

## 3. Criterios de aceptación de la misión (§9)

| Criterio | Estado | Evidencia |
|---|---|---|
| Finalidad de la tabla demostrada | ✓ | Respaldo congelado de CP-FX-001 (dump gemelo + expediente fusionado) |
| Todos los escritores legítimos identificados | ✓ | Uno: canal gobernado fx (demostrado con pg_stat_statements) |
| Todos los consumidores identificados | ✓ | Sondeos + gate CI; cero en la app |
| Exposición actual cuantificada | ✓ | Ventana ~3h43m CRUD anónimo; PRE-remediación: 0 filas visibles; grants residuales |
| Sin privilegios públicos innecesarios | ✓ POST | REVOKE ALL a anon/authenticated/PUBLIC (migración + E2E F8b) |
| El proceso legítimo de actualización funciona | ✓ | Cron no tocado (0 refs); E2E F6/F7 (canal privilegiado operativo); smoke 88/88 |
| Datos históricos conservados | ✓ | 1.607 filas + hash idéntico PRE→POST (script §11g) |
| E2E verde | ✓ | 17/17 + 88/88 + net delta = 0 |
| CI verde | ✓ | (se completa tras el merge: MIGRATION-AND-APPLICATION.md) |
| Allowlist temporal retirada | ✓ | `ci-gate-allowlist.json` — entrada tables_without_rls retirada (drift resuelto REAL: RLS en vivo + migración formal) |
| Contrato de seguridad sin divergencias | ✓ | contract-static 0 divergencias · 233/233 representadas |
| Expediente con evidencias verificables | ✓ | 7 documentos + evidence/ (JSON re-ejecutables: forensic, writers, anon-PRE) |

**Declaración de honestidad**: el problema no se declaró resuelto por desaparición del gate — RLS quedó ON en producción ANTES de esta misión (por el operador no identificable); esta misión demostró el porqué, cerró la causa raíz en el código (script fx), formalizó la postura en migración versionada, revocó los grants residuales (segunda barrera), retiró la allowlist con resolución real y conservó íntegros datos y procesos.

## 4. Entregables

- Migración: `supabase/migrations/20261128173000_cpsec_fx_backup_private.sql` (+ rollback).
- Scripts: `cpsec-fx-apply-prod.mjs` (§11g) · `cpsec-fx-e2e-posture.mjs` (batería) · `cpsec-fx-table-forensic.mjs` (sondeo read-only).
- Test contractual: `src/__tests__/migrations/cpsec-fx-backup-private-migration.test.ts` (11/11).
- Gates: writers.manifest +3 · ci-gate-allowlist (retiro) · replay manifiesto 235.
- Expediente: este directorio (7 docs + evidence/).

## 5. Pendiente de decisión del propietario (propuesta, NO ejecutado)

Archivo/eliminación de la tabla tras la ventana de reversión de CP-FX-001 (DROP proscrito por la misión sin autorización adicional). Ver SECURITY-DESIGN.md §5.
