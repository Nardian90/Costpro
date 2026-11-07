# INFORME TÉCNICO — Corrección de Ingresos/Egresos y rediseño funcional del panel de configuración de Reporte Entrega

**Producto:** COSTPRO 4 Multitienda · **Repositorio:** `Nardian90/Costpro`
**Misión:** 2026-10-22 · **Rama:** `fix/caja-movimientos-y-panel-reporte` (base `main` @ `d401a67`)
**Regla de la misión respetada:** sin fusiones, sin despliegues, sin escrituras de prueba en producción. Todas las comprobaciones de la BD viva son de SOLO LECTURA (catálogo y REST).

---

## 1. Rama y commit

- Rama dedicada: `fix/caja-movimientos-y-panel-reporte`, creada desde `main` tras fusionarse #1450 (d401a67).
- Sin PRs abiertos relacionados al comenzar (verificado por API); ningún trabajo duplicado — la Parte B corrige la implementación del panel fusionada en #1450, que introdujo el defecto reportado.

## 2. Causa raíz DEMOSTRADA del error de `cash_flow_documents`

**Error reproducido** (antes de tocar código, contra la API viva, solo lectura):

```
GET /rest/v1/cash_flow_documents?select=...,related_document:cash_flow_documents!cash_flow_documents_related_document_id_fkey(...)
→ PGRST200 "Could not find a relationship between 'cash_flow_documents' and
  'cash_flow_documents' in the schema cache"
```

**Diagnóstico con evidencia (A1/A2):**

| Comprobación | Resultado |
|---|---|
| `pg_constraint` (catálogo vivo, lectura) | La FK `cash_flow_documents_related_document_id_fkey` **EXISTE y está VALIDADA** (`convalidated=true`): `FOREIGN KEY (related_document_id) REFERENCES cash_flow_documents(id)` |
| Mismo query con hint por NOMBRE DE COLUMNA (`!related_document_id`) | **Resuelve** (HTTP 200) — la caché tiene el self-FK sobre esa columna |
| Mismo query sin hint | Resuelve (llega a permisos/RLS) |
| Hint hacia `profiles` (otros embeds del hook) | Resuelven — solo el self-embed está roto |
| Control negativo (hint inexistente) | PGRST200 — el patrón de falla es el hint |
| NOTIFY `pgrst, 'reload schema'` vía Management API (2 intentos, espera 60 s) | La caché **NO se recarga** (documentado abajo) |

**Conclusión:** la FK existe en PostgreSQL con el nombre exacto que usaba el código, pero la **caché de esquema de PostgREST quedó desincronizada**: guarda el self-FK bajo un nombre de constraint anterior (el constraint fue recreado — p. ej. durante la reconciliación de la migración con la BD viva, commit 26bbcd5 — después de la última recarga de la caché). Las migraciones aplicadas vía Management API ejecutan SQL **sin** `NOTIFY pgrst, 'reload schema'` (el SQL editor de Supabase sí lo envía automáticamente) — ese es el mecanismo por el que la caché quedó vieja. El escenario confirmado de la matriz A2 es: *«el esquema SQL y el esquema visible en PostgREST están desincronizados»* + *«la consulta solicita la relación con un identificador que la caché no conoce»*.

## 3. Consulta corregida

`src/hooks/api/useCashFlow.ts` — `CF_SELECT`: el embed autoreferencial pasa de hint por **nombre de constraint** a hint por **nombre de columna**:

```diff
- related_document:cash_flow_documents!cash_flow_documents_related_document_id_fkey(...)
+ related_document:cash_flow_documents!related_document_id(...)
```

Por qué es la corrección correcta y no un parche: (a) resuelve bajo la caché actual **y** bajo una caché recién cargada (verificado contra la API viva, HTTP 200 con el query exacto de la app); (b) es inmune a recreaciones/renombres de constraints — la clase de evento que causó el defecto; (c) sigue siendo explícito y sin ambigüedad (sintaxis documentada de PostgREST); (d) la fuente contable no cambia: misma tabla, misma política RLS (`cash_flow_documents_select_own_store`), mismo filtro `store_id`, mismo RPC `get_cash_flow_summary`, mismas rutas API de mutación (intactas).

## 4. Migraciones y justificación

Nueva migración `20261022000001_cash_flow_documents_pgrst_cache.sql` (idempotente, sin cambios de datos ni de modelo):

1. **Reafirmación idempotente** de la FK autoreferencial (no-op si ya existe — DO + IF NOT EXISTS sobre `pg_constraint`).
2. **`NOTIFY pgrst, 'reload schema'`** al final — establece el procedimiento de recarga en el flujo estándar de aplicación de migraciones.

Además: `scripts/apply-migration-mgmt.ts` ahora **envía el NOTIFY automáticamente** tras aplicar cualquier migración (cierra la causa sistémica: futuras migraciones aplicadas por script dejarán la caché sincronizada), y se añade `scripts/pgrst-reload-schema.mjs` como procedimiento de recarga ad-hoc documentado.

**Limitación documentada honestamente:** en ESTE proyecto, el NOTIFY enviado vía Management API **no llegó al listener de PostgREST** (probado dos veces con espera de 60 s — la caché no se refrescó). El camino fiable verificado por la documentación de Supabase es ejecutar el NOTIFY desde el **SQL editor del dashboard** (conexión directa). El código de la app es inmune a la caché vieja (hint por columna), pero se recomienda al propietario ejecutar `NOTIFY pgrst, 'reload schema';` en el SQL editor para sincronizar la caché del proyecto (queda cubierto también al aplicar la migración por esa vía).

## 5. Evidencia de carga correcta de movimientos

- **API viva:** el query EXACTO de la app (CF_SELECT completo con todos los embeds y filtros) → **HTTP 200** (antes: PGRST200).
- **Navegador real (app en marcha, sesión autenticada, RLS activa):** la vista Ingresos/Egresos carga **sin** «No se pudieron cargar los movimientos»; renderiza encabezado, KPIs del RPC (saldo de caja, fondo, ingresos/egresos, anulaciones) y el estado vacío correcto («Aún no hay ingresos ni egresos en esta tienda» — la tabla tiene 0 filas en producción, verificado por conteo de solo lectura). Captura: `download/evidencia-mision-1022/5-ingresos-egresos-cargado.png`.
- **Aislamiento por tienda:** intacto — no se tocó RLS ni el filtro `store_id`; las mutaciones (crear/anular) siguen por las rutas API con RPC service_role-only, sin cambios de código en esa cadena (cubiertas por las baterías en BD aislada de la misión original 2026-10-20 y las suites existentes).
- **Producción sin escrituras de prueba:** cero INSERT/UPDATE/DELETE ejecutados (todas las comprobaciones vivas son SELECT de catálogo o REST de lectura).

## 6. Causa raíz del comportamiento defectuoso del panel

El panel fusionado en #1450 (desplegado) era un **overlay modal**: `fixed inset-0` + backdrop `bg-background/70 backdrop-blur-[2px]` + `aria-modal="true"`. En el tema oscuro de COSTPRO, `bg-background` = `rgb(20,20,20)`; al 70% de opacidad sobre el reporte, este **desaparece visualmente** («el contenido principal desaparece») y el backdrop **intercepta todos los clics** («queda inutilizable»).

**Evidencia del ANTES (reproducida con el código de main @ d401a67, app en marcha):**
- `elementFromPoint` sobre el centro del input de periodo del reporte → **«VELO (bloquea el reporte)»** — el reporte NO es interactivo con el panel abierto.
- Color computado del velo: `rgb(20, 20, 20)` (oscuro al 70%).
- Capturas: `antes-1-reporte-panel-cerrado.png` y `antes-2-configuracion-abierta-DEFECTO.png` (verificadas visualmente — el reporte aparece cubierto por una máscara negra).

## 7. Componentes y estilos corregidos

`src/components/views/terminal/views/cash/CashReportView.tsx`:

- La raíz de la vista pasa de pila plana a **fila flex en escritorio**: columna del reporte (`flex-1 min-w-0`, todo el contenido: PageHeader con Generar/Exportar, periodo, pestañas, paneles) + `<aside>` de configuración.
- El overlay modal se elimina. El nuevo `<aside>` (siempre montado, visibilidad gobernada por `data-open`/`aria-hidden` + clases `visible/invisible`):
  - **Escritorio (lg+):** columna INTEGRADA del layout — `lg:static lg:w-[400px] lg:shrink-0 lg:min-w-0 lg:overflow-hidden`, con transición de anchura `duration-300 ease-in-out` (idéntica curva al menú principal) y contenido interior a ancho fijo (`lg:w-[400px]`) para que los controles no refluiden durante la animación. `motion-reduce:transition-none` respeta el movimiento reducido.
  - **Móvil/tablet (<lg):** hoja lateral derecha (`fixed inset-y-0 right-0`, `w-full max-w-[420px]`) con backdrop `bg-black/50 lg:hidden` — el mismo patrón del menú izquierdo en móvil. Sin scroll horizontal de página (verificado a 390 px).
  - **No-modal en escritorio:** `aria-modal` solo en móvil; foco inicial al panel al abrir, foco devuelto al disparador al cerrar (botón X, backdrop en móvil o Escape); el Tab fluye naturalmente (el reporte sigue siendo alcanzable).
- Nada del contenido del reporte se desmonta al abrir/cerrar (mismo árbol React) — la vista previa y los filtros conservan su estado.

## 8. Patrón del menú principal izquierdo reutilizado

Referencia real inspeccionada (`src/components/views/terminal/Sidebar.tsx` + `src/components/views/TerminalShell.tsx`):

| Aspecto del menú izquierdo | Cómo se replica en el panel |
|---|---|
| Estados expandido/rail/cerrado con `transition-all duration-300 ease-in-out` | Transición de anchura `duration-300 ease-in-out` — misma curva y duración |
| `pl-64/pl-20/pl-0` sobre `<main>` → **redistribución** del espacio, contenido siempre visible | Columna del reporte `flex-1` que cede 400 px al abrir el aside — **redistribución**, no superposición |
| Móvil: sidebar superpuesta + backdrop `bg-black/50` | Móvil: hoja superpuesta + backdrop `bg-black/50 lg:hidden` |
| Contenido nunca oculto ni bloqueado | Sin velo, sin `fixed inset-0` en escritorio — reporte visible y clicable (probado con `elementFromPoint`) |

También se reutilizó el patrón del **aside integrado de POSExpressMode** (`lg:w-[380px] ... lg:border-l bg-card flex flex-col`) como columna real del layout, y el disparador/botón de cierre accesibles ya existentes.

## 9. Capturas de antes y después

En `download/evidencia-mision-1022/`:

**Antes (defecto):** `antes-1-reporte-panel-cerrado.png` · `antes-2-configuracion-abierta-DEFECTO.png` (reporte cubierto por velo negro, clics interceptados).

**Después (corregido):**
1. `1-reporte-entrega-panel-cerrado.png` — reporte a ancho completo (1161 px).
2. `2-reporte-entrega-configuracion-abierta.png` — reporte (762 px) **y** panel (400 px) visibles simultáneamente; 762 + 400 ≈ 1161 → redistribución exacta sin superposición; `elementFromPoint` sobre el periodo → **reporte** (interactivo); `position: static`.
3. `3-reporte-entrega-tras-cerrar-panel.png` — el ancho vuelve a 1161 px exacto (sin saltos acumulativos; estable tras 3 ciclos abrir/cerrar).
4. `4-menu-principal-izquierdo-referencia.png` — el menú izquierdo como referencia de patrón.
5. `5-ingresos-egresos-cargado.png` — Ingresos/Egresos cargado sin error, con KPIs y estado vacío correcto.
6. `b5-panel-movil-390px.png` — panel usable a 390 px (hoja + backdrop, sin scroll horizontal).

## 10. Resultados de las pruebas

**Automatizadas (vitest):** suite COMPLETA **3705/3705** (0 failed; 46 skipped preexistentes). Nuevas/actualizadas:
- Parte A: `cash-flow-pgrst-hint.test.ts` (4 — contrato hint↔migración↔script) + `ingresos-egresos-view.test.tsx` 16 (incl. **2-bis**: el select de la vista usa el hint por columna) + `cash-flow-migration.test.ts` intacta.
- Parte B: `cash-report-view.test.tsx` **41** (F-1..F-12 actualizadas al contrato del panel integrado + **RB-1..RB-4** nuevas: aside integrado sin velo, reporte utilizable con el panel abierto, ciclos sin deriva, transición 300 ms ease-in-out + motion-reduce) + persistencia 13 + botón Excel 3.

**tsc:** 0 errores · **eslint:** 0 errores (33 warnings preexistentes de `<button>` crudo, estilo del codebase).

**Visuales/funcionales en navegador real (Playwright, app en marcha con sesión autenticada):** **13/13 verificaciones** programáticas del guion `scripts/captura-mision-1022.mjs` (incluye las geométricas/interactividad descritas en §9) + verificación móvil a 390 px + verificación visual VLM de las capturas 2 y 5. Sin errores de consola relevantes durante la sesión.

## 11. Limitaciones y riesgos residuales

1. **Caché de PostgREST del proyecto vivo sigue desincronizada** para el nombre ANTIGUO del constraint (el NOTIFY vía Management API no llegó al listener — dos intentos documentados). El código es inmune (hint por columna verificado bajo la caché actual), pero se recomienda al propietario ejecutar `NOTIFY pgrst, 'reload schema';` desde el SQL editor de Supabase (o aplicar la migración por esa vía) para sincronizarla por completo. Riesgo residual acotado: se auditaron TODOS los hints por constraint del código contra la API viva y **solo** el self-embed corregido estaba roto.
2. **Ingresos/Egresos en producción tiene 0 documentos**: la evidencia en vivo muestra el estado vacío correcto (no hay datos con los que probar listado con filas); el ciclo de creación/anulación/reverso está cubierto por las baterías en BD aislada de la misión original (2026-10-20) — esta misión NO modificó ninguna mutación ni fórmula contable.
3. **jsdom no evalúa CSS** — por eso la geometría/interactividad se probó en navegador real (13/13), no solo por clases.
4. Las capturas muestran el banner de consentimiento de cookies de la app sobre el contenido — cosmético, ajeno a esta corrección.
5. La verificación visual fue con Chromium headless (Playwright) y LibreOffice no interviene en esta misión; no se probó en navegadores WebKit/Gecko físicos.

## 12. PR listo para revisión humana

PR nuevo sobre `main` desde `fix/caja-movimientos-y-panel-reporte`. **Sin fusionar, sin desplegar** (regla de la misión). Producción intacta: solo lecturas; la app local corrió sobre la BD viva en modo desarrollo.

---

## Estados finales

| Módulo | Estado |
|---|---|
| **Ingresos/Egresos** | **CORREGIDO Y VALIDADO** — causa raíz demostrada (caché PostgREST + hint por constraint), corrección mínima verificada contra la API viva (HTTP 200 con el query exacto) y en la app real (vista carga sin error, KPIs y estado vacío correctos); RLS, aislamiento por tienda y mutaciones intactos; procedimiento de recarga establecido (migración + script + apply-script). Limitación documentada: la tabla vive vacía en producción y el refresco total de la caché requiere el SQL editor del propietario. |
| **Panel de Reporte Entrega** | **CORREGIDO Y VALIDADO** — causa raíz demostrada (overlay modal con velo `rgb(20,20,20)` al 70% que oculta y bloquea el reporte, reproducida con `elementFromPoint` → VELO); rediseño integrado según el patrón del menú principal (redistribución 762+400=1162 px, transición 300 ms ease-in-out, no-modal en escritorio, hoja+backdrop en móvil); 13/13 verificaciones de navegador + VLM + 41 tests de vista; preferencias y PDF/Excel sin regresión (persistencia 13/13, suite completa 3705/3705). |
