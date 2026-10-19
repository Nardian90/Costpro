# DECISIÓN B.1 — Alcance del rol admin: GLOBAL documentado (operativo) + acotado por tenant (hoja de ruta)

**Fecha de ratificación:** 2026-10-20 · **Ratificada por:** propietario (prompt v2, cierre CP-SEC-027 fase 9)
**Documento base:** `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §B.1 (nueva sub-decisión)
**Contexto:** Decisión B (DT-03) CONFIRMADA el 2026-10-19 — arquitectura multi-tenant se conserva.

---

## Decisión ratificada — Alternativa (a) como estado OPERATIVO, (b) como hoja de ruta

**Hoy** (mientras exista un solo tenant real y un solo propietario operativo), el rol
admin se trata como **GLOBAL y documentado**: `is_admin()` otorga bypass de acceso
entre tiendas/tenants. Esto es un estado conocido y aceptado del sistema, no un defecto
oculto. **Cuando el producto pase a operación SaaS multi-cliente real**, el admin
quedará **acotado a su tenant** (alternativa b) — `is_admin_with_access` y el modo
estricto (`USE_TENANT_RLS`) son ya los puntos de acotamiento disponibles y la
convergencia completa está registrada como deuda CP-SEC-025.

## Evidencia viva que delimita el alcance actual (2026-10-20)

- `is_admin()`: bypass total (T5.2 de la matriz DT-03: un admin de Default Tenant ve
  productos de Grupo Demo) — comportamiento DOCUMENTADO desde esta decisión.
- `is_admin_with_access(p_store_id)`: acota por tienda con guard real
  (`is_admin() || has_store_access(p_store_id)`); usada por la UI de administración
  vía PostgREST como `authenticated`.
- Tras la Fase 7 (migración `20261020000002_sec_definer_hardening.sql`, aplicada
  2026-10-20): `is_admin_with_access` ya NO es ejecutable por `anon`/`PUBLIC`
  (REVOKE aplicado en producción; `authenticated` intacto con grant explícito) —
  se cierra la exposición anónima sin alterar la semántica del admin.
- Perfiles NULL (DT-03): tras el backfill autorizado de david9999 quedan 10, todos
  clasificados SIN EVIDENCIA en `evidence/20261019-dt03-matriz-acceso/` — ninguno
  recibe permisos implícitos (T4.1–T4.6/T7.1 verificados: 0 en todo).

## Compromisos derivados

1. **Ningún cambio de código** en esta fase para el alcance del admin: la decisión
   es de documentación y ratificación (la Fase 7 ya cerró el único hueco de
   exposición anónima del mecanismo).
2. `is_admin()` global queda declarado en la documentación de seguridad como
   privilegio de propietario-operador, revisable en la transición SaaS.
3. **Disparador de revisión:** la primera incorporación de un tenant cliente real
   (externo al propietario) activa la migración a la alternativa (b): acotar
   `is_admin()` por tenant o sustituir sus puntos de uso por
   `is_admin_with_access`/modo estricto, junto con CP-SEC-025 (convergencia de
   capas RLS legado/tenant-gated).
4. Los 10 perfiles NULL restantes no se tocan sin evidencia individual de
   pertenencia (criterio DT-03, Decisión B).

## Por qué (a) hoy y (b) después

Con un solo tenant real, acotar al máximo el admin solo añade fricción al
propietario-operador sin reducir riesgo externo (no hay otros tenants a los que
proteger). En modo SaaS multi-cliente, un admin global se convierte en un riesgo de
aislamiento entre organizaciones (exactamente lo que la Decisión B prohíbe relajar):
allí la alternativa (b) es obligatoria. Documentar el estado presente evita el doble
defecto de (i) tratar el bypass como bug y "arreglarlo" rompiendo la operación
actual, o (ii) olvidarlo activo al llegar clientes.
