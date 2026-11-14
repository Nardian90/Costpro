# M017 — Aplicación de migraciones de la MISIÓN MAESTRA CP-FIN a producción

**ID misión:** CP-FIN-FINAL-EXECUTION-001 · **Fecha (UTC):** 2026-11-14 (aprox. 00:50) · **Operador:** agente, bajo autorización general del propietario (§1/§4.B de la misión del 13/11).
**Canal:** Management API `/v1/projects/wthkddeleylijmonclxg/database/query` + `NOTIFY pgrst 'reload schema'` (patrón canónico m002–m016). **Guard:** CP-INFRA-019 con doble flag (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`) — autorización explícita registrada en stderr.
**Producción:** CostproBD (`wthkddeleylijmonclxg`). **Script versionado:** `scripts/m017-aplicar-migraciones-mision-final.mjs` (declarado en `scripts/lib/writers.manifest.json`, guardProtected).

## 1. Migraciones aplicadas (lote único por archivo, sin reintentos)

| # | Archivo | SHA-256 (bytes aplicados) | HTTP |
|---|---|---|---|
| 1 | `supabase/migrations/20261113120800_fix_servicios_recibidos_moneda_documento.sql` (PR #1612) | `50d09c665918aef68748295af8c5c92cc8df4f87e482f5b6b902589d4d73fc76` | 201 |
| 2 | `supabase/migrations/20261114120000_cp_fin_semantica_total_amount_cup.sql` (PR #1615) | `44a775480bdbdc9d98f61867e72c88e2689cfb37766883e81347cb246def28e4` | 201 |
| 3 | `supabase/migrations/20261114140000_cp_fin_ciclo_devolucion_divisa.sql` (PR #1616) | `2cfc45807e8aa47ae56ead052807376b6138021cd80637f49c93e267489a92c7` | 201 |

**Identidad de bytes con lo validado:** los SHA coinciden con los registrados en `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (replay determinista); el check «E2E Aislado (project)» de los PR #1612/#1615/#1616 aplicó y validó exactamente estos archivos en la BD aislada `lguovmvrozxgssupkwpf` (14/14, 23/23 y 37/37 PASS + NET DELTA 0).

## 2. Verificación POST (fail-closed — evidencia completa en `verificacion-produccion.txt`)

- **Marcadores presentes:** `FIX §17.1` (update_payment_status/register_supplier_payment/prevent_received_service_edit) · `20261114120000` (fin_compute_metrics VENTA: total_cup := total_amount) · `20261114140000` (fin_compute_metrics DEVOLUCION_VENTA + create_devolution_v2: total canónico + tasa efectiva del reembolso).
- **DELTA 0** en las 12 tablas de negocio auditadas y en fin_entries/fin_movements (4/10 sin cambios — las funciones reemplazadas no disparan contabilización).
- **RLS FORCED ×8** en tablas fin_* intacto.
- **Contract-surface regenerado** tras la aplicación: 207 funciones SECURITY DEFINER de escritura, sha256 `c8b362b8cbae9c6bebfb0ee591c5030c05786fd7abb51cd140902d21d945f59a` (+238/−226 líneas — `create_devolution_v2` y las funciones §17.1 re-certificadas).

## 3. Regularización del libro `production_migration_ledger`

Divergencia detectada en FASE I: las aplicaciones del 11/11–13/11 estaban documentadas (docs/audits/APLICACION_*, expediente CP-FIN, SKU 197) pero SIN fila en el libro. m017 insertó 15 filas de regularización (idempotentes, con NOT EXISTS), cada una con SHA-256, mecanismo, evidencia y nota explícita («REGULARIZACIÓN… hora exacta no registrada» cuando el expediente solo documenta la fecha), más 3 filas nuevas de hoy. **El libro quedó con 32 filas**, cubriendo: BASELINE-2026-11-06 + 13 aplicaciones previas + las 3 de esta misión.

## 4. Efecto en el motor

- VENTA en divisa: `total_cup := total_amount` (sin doble conversión) — desbloquea las 131 ventas USD de ENERVIDA para el Lote F.
- DEVOLUCIÓN en divisa: total canónico + tasa efectiva exacta del reembolso (C7 cerrado going-forward).
- Servicios Recibidos en divisa: pagos consistentes con la moneda del documento (§17.1) — para ENERVIDA hoy 0 servicios en divisa, sin cambio de comportamiento numérico en CUP.
- Las 3 correcciones son idempotentes (`CREATE OR REPLACE`) y no reescriben datos históricos.

## 5. Restricciones cumplidas

Sin tocar documentos fuente, sin backfill, sin recalculo histórico, sin modificar checks, sin ampliar privilegios. Producción desplegada en Vercel desde main (`fe2c5cb7`) con los mismos archivos (despliegue de código; las migraciones de BD se aplican por este canal canónico, no por Vercel).
