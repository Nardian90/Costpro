# DECISIÓN B.1 — Alcance del rol admin: GLOBAL documentado + acotado por tenant (REGISTRO)

> **Estado del registro:** `RATIFICADA` (2026-10-20). Este archivo REGISTRA una
> decisión ya tomada por el propietario; no crea ninguna decisión nueva. Preparado en
> la Misión C (2026-10-21).

| Campo | Valor |
|---|---|
| Decisión | Alternativa **(a) como estado OPERATIVO**: mientras exista un solo tenant real y un solo propietario operativo, el rol admin es **GLOBAL y documentado** (`is_admin()` = bypass de acceso entre tiendas/tenants; comportamiento conocido y aceptado, no defecto oculto). Alternativa **(b) como hoja de ruta**: en operación SaaS multi-cliente real, el admin queda **acotado a su tenant** (`is_admin_with_access` / modo estricto `USE_TENANT_RLS`). |
| Ratificada por | Propietario (prompt v2, cierre CP-SEC-027 fase 9) |
| Fuente primaria | `docs/audits/DECISION_B1_ADMIN_GLOBAL_2026-10-20.md` |
| Documento base | `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §B.1 (sub-decisión propuesta el 18/10, ratificada el 20/10) |
| Contexto | Decisión B (DT-03) CONFIRMADA 2026-10-19 — la arquitectura multi-tenant se conserva |
| IDs relacionados | CP-SEC-010 (documenta el estado operativo del bypass admin), CP-SEC-025 (convergencia RLS = vía de migración a la alternativa (b)) |

## Compromisos derivados (ratificados con la decisión)

1. **Ningún cambio de código** para el alcance del admin en esta fase: es una decisión
   de documentación y ratificación.
2. `is_admin()` global queda declarado en la documentación de seguridad como
   **privilegio de propietario-operador**, revisable en la transición SaaS.
3. **Disparador de revisión:** la primera incorporación de un tenant cliente real
   (externo al propietario) activa la migración a la alternativa (b), junto con
   CP-SEC-025.
4. Los 10 perfiles NULL restantes no se tocan sin evidencia individual de pertenencia
   (criterio DT-03, Decisión B).

## Evidencia de delimitación (2026-10-20)

- `is_admin()`: bypass total (T5.2 matriz DT-03) — DOCUMENTADO desde esta decisión.
- `is_admin_with_access(p_store_id)`: acota por tienda con guard real; usada por la
  UI de administración vía PostgREST.
- Fase 7 (migración `20261020000002_sec_definer_hardening.sql`, aplicada 2026-10-20,
  PR #1430 fusionado): `is_admin_with_access` ya NO ejecutable por `anon`/`PUBLIC`
  (REVOKE en producción; `authenticated` intacto) — cerró la única exposición anónima
  del mecanismo sin alterar la semántica del admin.
