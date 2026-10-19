# INFORME — Cierre de decisiones Misión C (Fase 9): A / B.1 / C / D

**Fecha:** 2026-10-20 · **Autor:** agente Security Lead (prompt v2, fases F6–F10)
**Estado de este PR:** preparado para revisión del propietario — migraciones C y D **NO aplicadas a producción** (invariante 9: solo F7 y F8 escribieron en esta sesión). El propietario las aplica tras el merge.

---

## A — Política de stock negativo → `DECISION_A_STOCK_NEGATIVO_2026-10-20.md`

Ratificación de la política actual como canónica (alternativa 1): stock nunca
negativo, regularizaciones solo por `process_inventory_adjustment` auditado. Los
CHECK maestros siguen vigentes (verificados vivos); las 4 divergencias históricas ya
estaban reconciliadas; los artefactos QA restantes quedan como higiene separada.
Sin cambios de esquema ni de datos. Desbloquea CP-INV-005.

## B.1 — Alcance del admin → `DECISION_B1_ADMIN_GLOBAL_2026-10-20.md`

Admin global documentado como estado operativo (un solo tenant real / un
propietario) + admin acotado por tenant como hoja de ruta SaaS, con disparador
explícito (primer tenant cliente real) y deuda CP-SEC-025 como vía de convergencia.
Sin cambios de código en esta decisión; la Fase 7 ya cerró la exposición anónima de
`is_admin_with_access` (REVOKE PUBLIC/anon en producción, `authenticated` intacto).

## C — Backfill de COGS con evidencia → `supabase/migrations/20261020000004_cogs_derived.sql`

Reproducción viva del análisis (read-only, 2026-10-20): 632 movimientos con
`unit_cost = 0` de 1 676; **8 con respaldo documental** (WAC `wac_after > 0` más
reciente a fecha ≤ movimiento en `wac_change_log`; todos `sale_reverse` del
2026-10-14 con evidencia de octubre) → derivados en columna nueva
`unit_cost_derived` + origen + id de evidencia; **624 marcados
`not_derivable`** (no se inventan costos). `unit_cost` original intacto (cero
UPDATE destructivo). Verificación de cierre incluida en la migración (DO block:
0 filas sin marcar). Preview exacto de las 8 derivaciones en
`cogs_8_derivables_preview.json`. La aprobación contable de los valores derivados
es decisión posterior y separada del propietario.

## D — Legal incidents → migración `20261020000005` + endpoint reescrito

- **POST** `/api/legal/incidents`: reemplaza el almacenamiento en
  `data/incidents.json` (archivo local — deprecado y documentado) por UNA fila en
  `audit_logs` con `action='legal_incident'` (cliente admin, patrón audit-service).
  Conserva: autenticación (401 sin sesión), Zod, rate limit 5/min, id legible
  `INC-YYYYMMDD-XXXXXXXX` con randomUUID.
- **GET** `/api/legal/incidents`: **nuevo**, SOLO admin vía el contrato real
  `withRole('admin')` (401/403), paginado (limit ≤100 / offset), lee el legajo de
  `audit_logs` por action. La migración añade el índice parcial que lo sostiene.
- **Tests:** `src/__tests__/api/legal-incidents-audit.test.ts` — 8/8 PASS
  (vitest, `withRole` REAL ejecutado): 401 sin sesión, 403 clerk, 403 perfil
  ausente, 201 + fila audit_logs (action/incidentId/record_id uuid/metadata de
  deprecación), 400, 429, 200 admin paginado.

## Backfill DT-03 (Fase 8, YA EJECUTADO — evidencia en este PR)

`scripts/dt03_backfill_david9999_execute.js` recreado fiel al dossier §5/§6 (el
original se perdió con el sandbox y nunca fue commiteado). Dry-run 7/7 → ejecución
con doble bandera (D-3 ratificado): david9999 → Default Tenant
(`5364ccf8-e6cd-4c38-aea8-b167b3b5576f`), transaccional con audit_log
`dt03_backfill_tenant` atómico, NULLs 11→10, membership activa intacta.
**Errata documentada** (`raw/23_…`): el UUID del prompt traía 13 caracteres en el
último grupo; el valor vivo (12) es el usado. Reversión: dossier §6.

## Qué NO hace este PR

- No aplica las migraciones C/D a producción (invariante 9).
- No toca R1 (`schema_migrations` estancado) ni CP-SEC-025 (convergencia RLS).
- No modifica los 10 perfiles NULL restantes ni la política de admin (solo la documenta).
