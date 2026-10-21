# DECISIÓN B — DT-03: Modelo operativo de tenant (REGISTRO)

> **Estado del registro:** `RATIFICADA` (2026-10-19) — efectos residuales pendientes.
> Este archivo REGISTRA una decisión ya tomada por el propietario; no crea ninguna
> decisión nueva. Preparado en la Misión C (2026-10-21).

| Campo | Valor |
|---|---|
| Decisión | Conservar la **arquitectura multi-tenant** y sus controles; adoptar **single-tenant únicamente como descripción de la situación operativa actual**, no como restricción estructural del producto. Un mismo usuario puede tener acceso autorizado a dos o más tiendas; pertenencia a tenant ≠ permisos de acceso a tiendas. **No se relaja el aislamiento entre organizaciones.** |
| Ratificada por | Propietario (confirmación expresa, 2026-10-19) |
| Fuente primaria | `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §B («✅ CONFIRMADA POR EL PROPIETARIO (2026-10-19)») |
| Evidencia del protocolo de 6 pasos | `docs/audits/evidence/20261019-dt03-matriz-acceso/INFORME.md` — matriz 30 perfiles × 43 memberships × 24 tiendas × 8 tenants; pruebas vivas T1.1–T7.1 |
| Desbloquea | **CP-SEC-010** (la decisión de producto que la tarea exigía) |
| Tareas derivadas registradas | CP-SEC-025 (convergencia de capas RLS), CP-SEC-026 (memberships sin auditoría), CP-SEC-027 (anon lee costos/precios — P1, corregido en PR #1424) |

## Compromisos operativos de la decisión

1. Los perfiles con `tenant_id = NULL` **no se asignan automáticamente**: su identidad,
   acceso y pertenencia se validan individualmente con evidencia. (Al cierre del
   21/10: 1 perfil con backfill ejecutado — david9999 — y **10 clasificados SIN
   EVIDENCIA**, ninguno con permisos implícitos: T4.1–T4.6/T7.1 = 0.)
2. El acceso operativo entre tiendas sigue gobernado por `user_store_memberships`
   (no-admin) o bypass admin global documentado (ver decisión B.1).
3. El documento `docs/TENANT_ARCHITECTURE_DECISION.md` (2026-08-02, «Decisión
   pendiente», recomendación «status quo») ha quedado **sustituido** por esta
   decisión; requiere anotación de cierre para no inducir a futuras misiones a
   reabrir DT-03 (anotación pendiente de decisión del propietario sobre este
   archivo histórico).

## Efectos residuales PENDIENTES (no parte de la decisión, sino de su ejecución)

| Residual | Estado | Fuente |
|---|---|---|
| Ratificación a posteriori del backfill `david9999` (operación EJECUTADA 2026-10-19 18:29:50Z, transaccional + audit_log `dt03_backfill_tenant`; autorización original D-3 fue conversacional y no verificable de forma independiente) | **PENDIENTE DEL PROPIETARIO** — ficha con 2 opciones: ratificar (recomendada por el expediente) o revertir conforme al dossier §6 | `docs/audits/evidence/20261021-decisiones-operativas/FICHA_DECISION_BACKFILL_DAVID9999.md` (autorización A7 del expediente CP-SEC-027 v5) |
| 10 perfiles NULL restantes | SIN EVIDENCIA — no se tocan sin validación individual | `docs/audits/evidence/20261019-dt03-matriz-acceso/` + `DECISION_B1_ADMIN_GLOBAL_2026-10-20.md` §Compromisos.4 |
| Convergencia de capas RLS (flag `USE_TENANT_RLS` no restringe plenamente) | Tarea abierta CP-SEC-025 | Informe DT-03 paso 1 |

## Relación con el expediente CP-SEC-027

La autorización A7 (ratificar/revertir backfill david9999) pertenece al expediente
CP-SEC-027 v5; su cierre formaliza un efecto residual de ESTA decisión DT-03. Queda
documentada la relación sin extrapolar el alcance del expediente a otros IDs.
