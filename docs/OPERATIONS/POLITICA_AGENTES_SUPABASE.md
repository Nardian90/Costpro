# POLÍTICA PARA AGENTES Y HERRAMIENTAS — USO DE SUPABASE

**Estado:** Obligatoria desde 2026-11-01 · **Ámbito:** cualquier agente de IA, script automatizado, workflow de CI o herramienta que acceda a Supabase de la organización Costpro.
**Complemento de:** `REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md` (destinos) y `PRESUPUESTO_LIMITES_SUPABASE_FREE.md` (cuotas).

---

## 1. Consultas a logs (Logs Explorer / Log Query)

La cuota de Log Query es **100 GB/ciclo** y ya se quemaron 29,5 GB en un solo día una vez. Reglas:

1. **Ventana ≤ 1 hora** por consulta. Nunca barridos de 7/30 días «para estar seguro».
2. **Agregadas siempre**: `count()`, `group by` — nunca filas crudas volcadas a un archivo.
3. **Con `LIMIT`** en toda consulta (recomendado ≤ 1000).
4. **Sin bucles**: nada de repetir la misma consulta N veces para «confirmar»; una vez con ventana correcta basta.
5. **Máximo 10 consultas de logs por tarea** (N=10). Si el análisis no cabe en 10 consultas agregadas de 1 h, el enfoque está mal: usar SQL read-only sobre tablas operativas (no consume Log Query) o pedir la información al propietario.
6. Registrar en el entregable cuántas consultas de logs se hicieron (número y ventanas).

## 2. Verificaciones contra producción (CostproBD)

1. **Solo lectura por defecto.** Herramientas: SQL read-only vía Management API, `SELECT`, funciones `STABLE`.
2. **Sin PII en artefactos**: ni emails, ni IPs, ni user_ids, ni tokens en archivos, PRs, logs o informes — solo agregados (conteos, distribuciones).
3. **Escritura = aprobación explícita del propietario POR TAREA** + doble flag del guard (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`) + expediente en `docs/audits/` (SQL, SHA-256, antes/después, verificación, rollback).
4. Los scripts que escriben DEBEN estar cableados al guard `scripts/lib/assert-not-production.{mjs,py,sh}` (ver regla de producción §4).

## 3. Migraciones

1. **Lote único y verificado**: la migración se aplica UNA vez (idempotente por diseño), seguida de la verificación post-migración con asserts fail-closed. Nunca en bucle de reintento.
2. **Cada DDL genera logs de Postgres**: aplicar 3 veces la misma migración triplica su costo de ingestión sin beneficio (son idempotentes).
3. **Jamás reaplicar el replay completo de migraciones contra un remoto.** El replay (485+ migraciones) es para: banco local aislado, verificación determinista de manifiesto (hashes, sin ejecución) y CostproE2E SOLO en su carga inicial única (ver §5).
4. Post-migración: recargar esquema de PostgREST solo si el DDL tocó tablas/relaciones (`pgrst-reload-schema.mjs`, ya con guard).

## 4. Prohibiciones expresas

- **Polling** a logs/analytics/usage (nada de `while true { query logs }`, ni cron que consulte el dashboard).
- Ejecutar la suite E2E completa contra producción (ni «solo esta vez»).
- Usar `SERVICE_ROLE_KEY` para «probar» flujos de usuario — el service role salta el RLS y no valida nada real.
- Dejar datos de prueba en producción sin registrar (si se detectan, NO borrarlos: reportar conteos + criterio de identificación y esperar autorización del propietario).
- Guardar credenciales en el repo, en artifacts de CI o en salidas de log.

## 5. E2E y CostproE2E

1. Todo run de E2E va a **CostproE2E** o a **Supabase local**. Nunca a CostproBD.
2. El esquema de CostproE2E se carga **UNA vez** (script manual del propietario, ver checklist §ítem E2E). El workflow `e2e-isolated.yml` NO reaplica migraciones.
3. El grupo smoke de E2E se mantiene pequeño (decenas de casos, no cientos) y cada corrida se presupuesta por su ingestión de logs (ver `PRESUPUESTO_LIMITES_SUPABASE_FREE.md` §E2E y el registro de la primera corrida cuando exista).
4. Si un test necesita estado nuevo (usuario fixture, tienda fixture), que lo cree con nombres identificables como test (`e2e_*`, `QA-*`) y lo limpie en el mismo run.

## 6. Presupuesto de consumo de agentes (auto-límite)

Cada tarea de agente que toque Supabase debe poder responder: *«¿cuántas consultas de logs hice y cuántas escrituras ejecuté?»* Límites por tarea:

| Operación | Límite por tarea |
|---|---|
| Consultas Log Query (dashboard) | 10 (ventana 1 h, agregadas) |
| Consultas SQL read-only (Management API) | 25 (agregadas; no consumen Log Query) |
| Escrituras contra producción | 0 sin aprobación explícita del propietario |
| Escrituras contra CostproE2E/local | Las necesarias, con limpieza posterior |
| Migraciones aplicadas a producción | Lote único por expediente aprobado |

## 7. Detección de regresión (para el propietario)

Si en el Usage del dashboard vuelve a aparecer un patrón `node` con escrituras de caja/ventas en horas de actividad de desarrollo:
1. No es la app (los navegadores mandan UA de navegador).
2. Revisar: sesiones de agentes activas, workflows de GHA ejecutándose (`gh run list`), y scripts locales ejecutados recientemente.
3. La consulta exacta para identificarlo está en `docs/OPERATIONS/medir-logs.md` §atribución.
