# 06_SIBLING_ANALYSIS — censo de consumidores y hallazgos nuevos (§29)

## Consumidores runtime de los RPCs remediados (rg src/)
- close_fiscal_period: SOLO src/app/api/fiscal-close/route.ts (líneas 68, 75-80).
- lock_fiscal_period: SOLO src/app/api/fiscal-close/route.ts (líneas 72, 75-80).
- UI: src/components/views/terminal/views/fiscal_close/FiscalCloseView.tsx → apiFetch
  POST action:'close' (handleClose) y action:'lock' (handleLock, isAdmin); GET para status.
  La UI NO consume closure_id/revenue del body: refresca estado por GET → el retorno
  canónico v2_12_9 es compatible al 100%.
- src/store/index.ts y TerminalShell.tsx: referencias de navegación/registro, sin llamadas RPC.
- PostgREST directo (otros consumidores): NINGUNO detectado (EXECUTE solo service_role).

## Otros RPCs del dominio fiscal (censo out_q01 s01)
- ensure_fiscal_period(uuid,integer,integer) — crea fila 'open' (idempotente por ON CONFLICT).
- prevent_fiscal_closing_edit() — trigger de inmutabilidad. Ambos FUERA DE ALCANCE, intactos.

## HALLAZGOS NUEVOS — DOCUMENTADOS, NO CORREGIDOS (§29)
- **NF-1 (P1)**: POST /api/fiscal-close con action='status' usa el default del route
  (rpcName='close_fiscal_period', línea 68) → una "consulta" por POST CERRARÍA el periodo
  (efecto destructivo en acción de lectura). Mitigaciones existentes: la UI solo usa GET
  para status; zod default='status'; autorización canManageStore + has_store_access_as.
  Evidencia: route.ts:68-73. Recomendación: gate futuro (mapear 'status' a lectura pura o
  rechazarlo en POST). NO corregido (fuera del alcance quirúrgico OF-1/OF-3).
- **NF-2 (P3)**: filas históricas con status locked/closed y locked_by/closed_by NULL
  (artefactos de pruebas F4-06b a nivel SQL sin claims). Con este fix, todo lock/close vía
  HTTP estampa el actor real (cerrado_by/locked_by + audit user_id). Sin acción requerida.

## Sin otros patrones hermanos
- rg fiscal_period_closures: único archivo en repo (fuera de evidencia) = migración v2_12_18
  (cuerpo histórico, NO editado). Ningún otro objeto referencía la tabla fantasma.
- Otros RPCs close_* (cash/production/service): contratos propios, sin relación con el
  modelo fiscal mensual; intactos.
