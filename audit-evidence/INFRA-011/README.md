# EVIDENCIA CP-INFRA-011 — Preparación de la base E2E aislada `CostproE2E`

**Misión:** preparación integral de la base aislada `CostproE2E` (ref
`lguovmvrozxgssupkwpf`) y del pipeline E2E — Ciclo de agente 2026-10-22.
Producción (`wthkddeleylijmonclxg`) NO fue consultada ni modificada: la
identidad se verificó por Management API (solo lectura) y las credenciales
del proyecto aislado vivieron SOLO en el entorno seguro del agente
(`~/.credentials/`, permisos 600, fuera del repo).

## Índice

| Archivo | Qué demuestra |
|---|---|
| `fase0-inventario-migraciones.{json,txt}` | Inventario real del HEAD: 485 archivos (479 SQL + 6 no SQL), 86 timestamps históricos cortos, 25 grupos duplicados, dependencias (btree_gist ×2, pg_cron ×2, cron.schedule ×1, CREATE ROLE ×2, storage ×2), 17 archivos con referencias auth.* (todas en cuerpos de función — 0 DDL sobre auth verificado), 0 DROP SCHEMA. **El stream NO crea el esquema core** (stores/profiles/products/transactions/stock_movements/audit_logs…): justifica la estrategia baseline+tramo. |
| `estado-inicial-remoto.json` | Inspección PRE-bootstrap vía Management API: `public` VACÍO (0 tablas, 0 funciones), extensiones por defecto (pgcrypto, uuid-ossp…), `postgres` con CREATEROLE+BYPASSRLS, pg_cron/btree_gist disponibles, sin buckets, sin roles custom. |
| `e2e-migrations-manifest.json` | Manifiesto determinista (sha256 `6d5fd958…`): baseline certificado (snapshot 2026-08-28 con 7 transformaciones documentadas), pre-tamo (bucket reports + 9 paquetes W7-RELEASE, 13 líneas \\echo eliminadas), tramo 70/70 verbatim (1 transformación documentada), 415 excluidos con razón (409 cubiertos por baseline + 6 no SQL). Regenerable con `--check` (MATCH). |
| `analisis-dependencias-retroactivas.json` | Análisis de dependencias duras del stream completo: solo 3 violaciones de orden (todas pre-baseline, resueltas por cobertura del baseline) + la ficha retrospectiva `202401230002` (inejecutable en orden de stream: 42P01 — causa documentada). |
| `remote/inspect.json` | Inspección read-only con identidad verificada (nombre `CostproE2E` vía Management API). |
| `remote/bootstrap.json` | Bootstrap mínimo: sección A (btree_gist + pg_cron + roles shim + membresías). |
| `remote/surgical-cleanup-v1.json` | Limpieza quirúrgica de las 7 funciones creadas por el intento v1 (superseded por la estrategia v3): exactamente el set documentado, nada más — verificado contra la tabla de estado antes de tocar. |
| `remote/reconcile-table-acl.json` | Reconciliación de ACLs derivada de artefactos: los defaults de plataforma Supabase concedían anon a tablas que el snapshot declara sin anon; se revocó SOLO el exceso derivado (9+1 tablas) y se re-aplicaron los GRANT del snapshot. Verificación final: 148/148 tablas con anon = exactamente las esperadas (143 snapshot + 5 W7). |
| `remote/apply-replay.json` | Replay completo: baseline 8049 sentencias en 322 lotes transaccionales (reanudación por lote con checkpoints), pre-tamo 10/10, tramo 70/70, centinela instalado al final (HTTP 200) y guard normal aceptando el destino final. Incluye la traza de TODOS los fallos intermedios con parada honesta (42P01, 42P13, 42501, 42601, P0001) y su resolución documentada. |
| `remote/verify.json` | Verificación integral: centinela=true · baseline aplicada · tramo 70/70 · 8/8 tablas esenciales · **RLS 149/149** · veredicto `PREPARADA`. |
| `remote/contract.json` + `contract-compare.json` | Comparación con el contrato versionado (supabase/security-contract/contract-surface.sql): **0 funciones certificadas faltantes (137/137)**; 127 funciones SD adicionales (todas presentes también en producción: trigger/audit functions fuera del contrato de escritura — 242 en el snapshot + tramo); RLS 149/149; bucket reports privado. |

## Pruebas ejecutadas localmente

- `src/__tests__/e2e/assert-isolated-db.test.ts`: **71/71 PASS** (22 casos × paridad TS/CJS/decide + 2 meta; red 100% mockeada).
- `node --check` en los 7 scripts .mjs nuevos + sintaxis OK.
- Determinismo del generador: `--check` MATCH contra el manifiesto commiteado.
- Playwright spec del centinela: NO ejecutado localmente (requiere servidor+build — OOM documentado CP-INFRA-002; la autoridad es CI).
- Escaneo de secretos sobre el diff completo: 0 hallazgos (parte del PR).

## Desviaciones documentadas (resumen operativo)

1. Centinela diferido al final del replay (guards de inventario del stream exigen fidelidad exacta con producción — evidencia 482≠481 en apply-replay.json).
2. Tabla de estado del replay en schema privado `e2e_infra`.
3. Transformaciones documentadas: 7 del baseline + \\echo del pre-tamo + 1 REVOKE inaplicable del tramo (perfil del transformación en el manifiesto).
4. `profiles_block_privileged_update` (trigger protector out-of-band sin DDL versionado): no existe en E2E; su REVOKE omitido documentadamente.
5. Modo `local` del workflow: PENDING_OWNER (el repo carece de stack local).
