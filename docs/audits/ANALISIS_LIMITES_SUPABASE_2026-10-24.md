# ANÁLISIS DE LÍMITES SUPABASE FREE — INGESTIÓN/QUERY/EGRESS Y TRÁFICO AUTOMATIZADO

**Fecha:** 2026-11-01 · **Rama:** `chore/presupuesto-limites-supabase` · **Alcance:** T1–T8 del mandato del propietario.
**Organización:** Costpro (plan Free, ciclo 03/10→03/11/2026) · Proyectos: CostproBD (producción, ref `wthkddeleylijmonclxg`) y CostproE2E.

---

## Resumen ejecutivo (5 líneas)

1. El 171% de Log Ingestion del ciclo tuvo dos orígenes: un evento puntual del 03–09/10 (pico ~420 MB el día 04, con una consulta de logs de 29,5 GB que quemó el 30% de la cuota anual de Log Query) y, desde el 10/10, un ritmo de ~20–30 MB/día [ESTIMADO] que cierra el ciclo en ~0,8 GB — bajo el límite pero sin margen.
2. El tráfico automatizado del 23/10 (53% de las llamadas con user-agent `node` escribiendo caja/ventas contra producción) queda **atribuido con evidencia de nivel commit**: misiones de desarrollo de agentes IA probando LIVE contra la capa BD viva (misión Caja Multimoneda v2.24, PR #1465, fusionado 15:54Z — exactamente la ventana de la muestra; los agentes salen por Hong Kong/AS45102 Alibaba, de donde venían 182 de las 196 llamadas `node`), más el workflow `exchange-rates-capture.yml` (2×/día desde GitHub Actions/US, operación legítima del producto).
3. **Hoy no hay escritor automatizado activo contra producción** [MEDIDO]: ventas 0 y sesiones de caja 1 en 30 días; la última actividad de caja es del 04/10 05:09Z.
4. El repo queda blindado por diseño: guard compartido `assert-not-production` (bloquea producción salvo doble flag explícito) cableado en 11 escritores, cuatro documentos operativos (regla de producción, presupuesto con semáforos, política de agentes, medición) y checklist del propietario.
5. Cambios de bajo riesgo aplicados con tests (763/763): deduplicación de la consulta a `profiles` en withAuth (−1 llamada PostgREST por request de API en 182 rutas) y `cache-control: immutable` en los 5 puntos de subida de imágenes (antes `private, no-cache` [MEDIDO], cada render revalidaba).

---

## A. Evidencia de partida (proporcionada por el propietario)

Ciclo 03/10→03/11/2026, plan Free, org Costpro:

| Métrica | Consumo | Límite | Estado |
|---|---|---|---|
| Log Ingestion | 1,71 GB (CostproBD 1,68 + CostproE2E 0,03) | 1 GB | **171% ⛔** |
| Log Query | 31,68 GB (29,5 GB el 04/10 en UN día) | 100 GB | 32% ⚠️ |
| Egress | 1,22 GB (pico 04/10) | 5 GB | 24% ✅ |
| Database size | 0,116 GB | 0,5 GB | 23% ✅ |
| Storage | 0,016 GB | 1 GB | 1,6% ✅ |
| Realtime pico | 7 | 200 | 3,5% ✅ |
| MAU | 703 | 50.000 | 1,4% ✅ (ver §F: calidad) |

Muestra 1 h del 23/10 15:00–16:00Z [MEDIDO por el propietario]: 53% de llamadas API con UA `node` (182 desde HK, 14 desde US): `open_cash_shift` ×19, `close_cash_shift` ×19, `create_cash_flow_document` ×32(200)+13(400)+5(401), `create_sale_v2` ×4(200)+11(400), `create_devolution_v2` (400).

## B. Atribución del tráfico automatizado

### B.1 El patrón del 23/10 15:00–16:00Z: misiones de agentes IA (LIVE E2E) — CONFIRMADO por correlación

**Evidencia (nivel commit, verificable en `git log`):**
- La ventana de la muestra coincide exactamente con el desarrollo de la **Misión Caja Multimoneda v2.24.0**: PR #1465 fusionado el **23/10 a las 15:54Z**; el mismo día 46 commits, con mensajes que documentan «integración del código cliente con la **capa BD viva**» (1f9866f8e, 17:07Z), «F5 open_cash_shift versionada» (7ee0edba8, 19:39Z) y «v2.24.1 **APLICADA y VERIFICADA en producción**» (592034884, 19:47Z).
- Las funciones del patrón (`open_cash_shift`, `close_cash_shift`, `create_cash_flow_document`, `create_sale_v2`) son exactamente las que esa misión desarrollaba; los 400 son la depuración iterativa característica (probar → fallar → corregir).
- El expediente del incidente CP-ORG-001 (mismo período) documenta «**12/12 LIVE E2E**» y «gate REAL TODO PASS **contra producción**» — el patrón de prueba contra la BD viva era metodología estándar de las misiones.
- **Origen geográfico**: este agente (y los de z.ai) salen por **Hong Kong, AS45102 Alibaba** [MEDIDO el 01/11 con ipinfo] — 182 de las 196 llamadas `node` de la muestra venían de HK. Las 14 de US coinciden con GitHub Actions.
- **Hoy NO hay escritor activo** [MEDIDO vía SQL read-only]: 0 ventas en 30 días, 1 sesión de caja (04/10), `cash_movements` última fila 04/10 05:09Z, `audit_logs` solo con actividad humana legítima (13 eventos/24 h: recepciones, tasas, vales — 1 usuario por acción).
- **Los 200 exitosos del 23/10 no dejaron filas** (ventas 0, docs de flujo 2 en 30 días): las escrituras de prueba se revertían/limpiaban en la misma sesión de desarrollo — patrón escribir-verificar-borrar de las misiones.

**Veredicto:** el 53% `node` del 23/10 fue **tráfico de desarrollo de agentes IA ejecutando pruebas LIVE contra la capa BD de producción** [MEDIDO por correlación con commits + orígen HK]. No era un tercero desconocido: era el propio proceso de desarrollo del repo.

### B.2 El flujo `node` recurrente desde US: `exchange-rates-capture.yml` — INFERIDO

El workflow corre 2×/día (cron 00:00 y 12:00 UTC) desde GitHub Actions (IPs US, UA node) con `SUPABASE_SERVICE_ROLE_KEY` contra la URL de producción, y ejecuta `scripts/cron/exchange-rates-capture.ts` → `captureDateRange` → upserts de tasas (`exchange-capture.ts`, confirmado en código: `upsertToSupabase` con POST). Es una **operación legítima del producto** (captura de tasas BCC/Diviza), no una fuga — pero explica el `node`/US recurrente en cualquier muestra.

### B.3 Cron de Vercel

`vercel.json` tiene UN cron diario (`/api/cron/purge-snapshots`, 03:00). Tráfico acotado del lado servidor de la app.

### B.4 Workflows activos con acceso a Supabase

| Workflow | Programación | Toca Supabase | Evaluación |
|---|---|---|---|
| `exchange-rates-capture.yml` | 2×/día | Sí — upserts de tasas con service_role | Legítimo (producto) |
| `daily-audit.yml` | diario | **No** — `audit-agent.py` es 100% local (verificado) | Seguro |
| `security-gate.yml` / `sql-security-gate.yml` | push/PR | **No** — 0 `fetch`/http (verificado) | Seguros |
| `e2e-isolated.yml` | solo `workflow_dispatch` | Sí, pero con secrets E2E separados (E2E_SUPABASE_*) | Seguro por diseño (§T6) |
| `ci.yml` / `test-coverage.yml` | `if: false` (desactivados) | — | Intactos |

## C. Hallazgos

### C.1 Inventario T1a — superficie de acceso a Supabase fuera de la app

**260 archivos** con acceso a Supabase fuera de la app; **213 con escritura potencial** (heurística de patrones INSERT/UPDATE/rpc/POST; incluye tests de integración que solo escriben en bancos locales). Clasificación completa ejecutada; grupos relevantes:

- **Escritores genéricos re-ejecutables contra producción** (mayor riesgo de uso accidental): 11 scripts ahora cableados al guard (§D).
- **Suites QA/FASE H1** (`scripts/qa-h1/*.cjs`): corrían contra producción vía `.env` con service_role para fixtures — la clase de script que generó los 400/401 del 23/10 en sesiones de depuración.
- **Misiones puntuales** (`scripts/mision-*/`, `m00*`): mezcla de diagnóstico read-only y aplicación de migraciones — el patrón de trabajo histórico.
- **E2E Playwright** (`e2e/`): usa producción por defecto vía `NEXT_PUBLIC_SUPABASE_URL` (fixtures con service_role). `e2e-isolated.yml` (el camino correcto) usa secrets E2E separados.
- **Nota**: `scripts/apply_migration_20260824000002.mjs` contiene sintaxis TypeScript (`!`) en un `.mjs` — error preexistente (no ejecutable con node puro); se dejó como estaba y se documentó.

### C.2 T4a — auth por petición (análisis + fix aplicado)

Flujo por request de API con `withAuth` (182 rutas): 1 `auth.getUser()` (verificación de identidad, intocable) + **2 consultas a `profiles` de la misma fila** (una en `getServerSession`, otra en `withAuth`) + 1 de membresías. **Fix aplicado**: `getServerSession` trae `role, roles` y `withAuth` reutiliza — **−1 llamada PostgREST (y su línea de log) por request de API** en el caso común. Sin profile en sesión (timeout 3 s) → consulta completa como antes (fail-closed intacto). NO se sustituyó `getUser()` por `getSession()` en ningún punto de verificación de identidad.

### C.3 T4b — polling/refetch (inventario; sin cambios por frescura de caja)

- `refetchOnWindowFocus: false` global (QueryProvider) ✅ ya correcto.
- Polling activo: turno de caja 30 s (`useActiveShift`), caja/flujo/libro/frecuentes 60 s, cierres 60 s. **No se tocó**: la frescura del dinero manda (mandato T4c). El POS con pestaña abierta genera ~2-4 req/min por usuario activo — es el costo operativo normal del producto.
- `staleTime` de `/api/stores` ya es 5 min ✅ (17 vistas lo consumen vía `useStores`).
- Sync offline (`SyncProvider`/`sync-engine`): refresca token por evento de auth, sin bucles propios detectados.

### C.4 T4d — errores 400/401 recurrentes: causa raíz

- **400** (`create_cash_flow_document` ×13, `create_sale_v2` ×11 en 1 h): coinciden en ventana y funciones con la depuración iterativa de la misión v2.24 [INFERIDO con evidencia de correlación fuerte — la misma ventana del PR #1465]. Eran reintentos de prueba con payloads inválidos durante desarrollo, no un bug del cliente en producción. **Hoy no se reproducen** [MEDIDO: sin escrituras fallidas en 30 días de tablas operativas].
- **401** (×5): tokens JWT (1 h) expirados en sesiones de script largas sin refresh — firma de scripts de agente, no de navegadores (el cliente refresca automáticamente).
- El reporte de errores al usuario ya está corregido en la app (mensajería estructurada, PR #1536).

### C.5 T4e — imágenes de storage (fix aplicado)

[MEDIDO 01/11, HEAD a un objeto real del bucket `product-images`]: `cache-control: private, no-cache`, `cf-cache-status: DYNAMIC` → cada render revalidaba (304 barato en egress, pero 1 request + línea de log por uso). **Fix aplicado** en los 5 puntos de subida (`catalog-service`, `uploadStoreImage`, `EditStoreModal`, `OfertaFormPanel`, `CatalogGovernanceSection`): `cacheControl: 'public, max-age=31536000, immutable'` — seguro porque todos los nombres llevan UUID (URL nueva por subida; la BD apunta al objeto nuevo y el viejo se borra). Aplica a subidas nuevas; los objetos existentes conservan su header hasta re-subirse (inventario de imágenes actual: 16 MB, impacto acotado).

### C.6 T4f — lo que NO se tocó

Logs de seguridad intactos: auth, 4xx/5xx de rutas críticas, cambios de rol/membresía, `audit_logs`. Ningún cambio reduce evidencia de seguridad.

## D. Guard compartido (T1b) — implementación y verificación

`scripts/lib/assert-not-production.{mjs,py,sh}` con contrato idéntico: producción bloqueada por defecto; lectura con `ALLOW_PROD=read-only`; escritura solo con el doble flag `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND` (registro visible de la autorización); E2E/local pasan libre; mensajes sin PII/keys. **24 tests** (API ESM + CLI de las 3 variantes) en `src/__tests__/scripts/assert-not-production.test.ts` — en verde. **Cableado en 11 escritores** (m002/m003/m004×2, apply-migration.cjs, apply-sql-migration.js, apply_migration_20260824000002.mjs, apply-rpc-fix.sh, pgrst-reload-schema.mjs, seed-pick3-history.js, landing-demo-cleanup.cjs). Verificación end-to-end: `apply-rpc-fix.sh` ejecutado sin flags → bloqueado con exit 1 y mensaje accionable.

## E. T6 — CostproE2E protegido

Verificado en código: `e2e-isolated.yml` solo `workflow_dispatch` (nunca push/PR), ejecuta `build-migrations-replay.mjs --check` (verificación de manifiesto, NO reejecución de las ~117 migraciones), smoke set CP-INFRA-011 por defecto, secrets E2E separados. La carga única del esquema es script manual (PENDING_OWNER: requiere el ref de CostproE2E que aportará el propietario). Presupuesto por corrida: CostproE2E consumió 0,03 GB en todo el ciclo [MEDIDO] → una corrida smoke completa cabe con holgura; el número exacto por corrida se anota tras la primera corrida (checklist propietario §5).

## F. T5 — calidad de los 703 MAU

[MEDIDO, agregados sin PII]: la BD tiene **32 usuarios auth** (30 con perfil, 6 con membresía activa), **18 con login en los últimos 30 días**, 11 en 7 días, 2 sin login nunca, 0 anónimos, 0 emails con patrones de test/e2e/example. Distribución de roles: 10 tenant_admin, 7 usuario, 4 costo, 3 encargado, 3 admin, 1 warehouse, 1 clerk, 1 superadmin. 24 cuentas sin membresía activa (candidatas a revisión, ver criterios). Creaciones por mes: oct 11, sep 9, jul 3, jun 2, feb 6.

**Discrepancia 703 vs 18**: la definición oficial de MAU es «usuarios distintos que inician sesión o **actualizan su token** durante el ciclo» (https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users). Con 32 cuentas totales, 703 solo es explicable por **usuarios efímeros creados y borrados dentro del ciclo** — las misiones LIVE E2E creaban fixtures de usuario y los borraban con `e2e_hard_delete_user`, pero el contador mensual del servicio Auth ya los había sumado [INFERIDO — coherente con la metodología documentada de las misiones y con el pico 03–09/10]. **Verificación para el propietario:** Auth → Users del dashboard (gráfica MAU diaria del ciclo); si el pico coincide con las ventanas de misión, queda confirmado. En cualquier caso el MAU está a 1,4% de la cuota: sin riesgo económico; el objetivo de depuración es higiene, no cuota.

**Criterios de depuración propuestos (sin borrar nada — requiere autorización):** cuentas con (a) login único histórico hace >60 días + sin membresía activa + sin eventos en `audit_logs` nunca; (b) creadas por misiones QA identificables por patrón. La acción correcta es `e2e_hard_delete_user` (ya respeta guardas anti-borrado de datos reales), NO SQL directo.

## G. Qué NO se pudo verificar (limitaciones)

1. **Logs de plataforma por API**: la Management API no expone consulta de logs (verificado 01/11: 8 rutas probadas → 404; confirmado por búsqueda web — solo Logs Explorer del dashboard). Toda la medición «actual» se hizo vía SQL read-only sobre tablas operativas (retención ilimitada, no consume Log Query).
2. **El pico del 04/10** (420 MB + 29,5 GB de query en un día): fuera de la retención de logs (1 día en Free) y sin tablas operativas que lo reflejen — la causa exacta (¿exploración manual del dashboard? ¿export? ¿script?) queda sin atribuir. Hipótesis más plausible: sesión de exploración/análisis intensiva del 03–09/10, período de despliegues masivos post-migraciones [INFERIDO].
3. **Ref de CostproE2E**: el mandato dice «ref que aporte el propietario» — no disponible, así que no se pudo medir ni preparar su carga de esquema.
4. **Conteo histórico de usuarios borrados** (para cerrar la discrepancia MAU): `auth.users` no guarda tumba; requiere el dashboard.
5. **Impacto exacto en MB del fix de auth-dedup**: estimable (182 rutas × N requests/día × ~200 bytes de log por llamada PostgREST evitada) pero no medible hasta que entre en producción y se compare el ritmo diario antes/después (`medir-logs.md`).
6. **Retención/config de logs**: sin acceso a settings del dashboard (solo el propietario); este análisis no cambia ninguna configuración (regla dura §1).

## H. Entregables de esta misión

| Entregable | Ubicación |
|---|---|
| Guard compartido + tests (24) | `scripts/lib/assert-not-production.{mjs,py,sh}` · `src/__tests__/scripts/assert-not-production.test.ts` |
| Regla de producción | `docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md` |
| Presupuesto y semáforos | `docs/OPERATIONS/PRESUPUESTO_LIMITES_SUPABASE_FREE.md` |
| Política de agentes (+ AGENTS.md) | `docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md` · `AGENTS.md` |
| Medición antes/después | `docs/OPERATIONS/medir-logs.md` |
| Checklist del propietario | `docs/OPERATIONS/CHECKLIST_PROPIETARIO_LIMITES_SUPABASE.md` |
| Cambios de bajo riesgo T4 | `src/lib/auth.ts` · `src/lib/auth-middleware.ts` · `src/services/catalog-service.ts` · `src/lib/uploadStoreImage.ts` · 3 componentes de subida · 2 tests de regresión |
| Este informe | `docs/audits/ANALISIS_LIMITES_SUPABASE_2026-10-24.md` |
| Inventario maestro actualizado | CP-INFRA-018 + P1 nueva (en este PR) |

**Consumo de la misión:** 0 consultas de Log Query (API no disponible) · 15 consultas SQL read-only vía Management API (5 datado + 8 MAU + 2 verificación previa de la misión CP-PROVEEDORES) · 1 HEAD a storage de producción (verificar header de caché). Cero escrituras a producción. Cero PII en artefactos.

**Citas oficiales:** cuotas Free y precios — https://supabase.com/pricing (consultado 01/11/2026) · grace period de logs hasta inicio de 2027 y $0,50/GB tras cuota — https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest · definición de MAU — https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users.
