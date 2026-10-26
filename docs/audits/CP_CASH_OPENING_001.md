# CP-CASH-OPENING-001 — Auditoría y corrección contable del fondo inicial, arqueo y saldo de Caja en Inicio

**Producto:** COSTPRO 4 — Multi-Tienda · **Área:** Inicio → OPERACIÓN → Caja
**Fecha:** 2026-10-27 · **Modalidad:** auditoría técnica/funcional + corrección controlada + pruebas automatizadas
**Rama:** `fix/cp-cash-opening-001-caja-inicio-20261027` · **Base:** `main @ 51cde8251109c98be516540080192c3828d26435` (post-fusión de PR #1507)

---

## 1. Estado inicial y SHA de `main`

- Punto de partida verificado contra GitHub: `main = 51cde8251` (fusión del PR #1507, misión RECONCILE-004). Rama exclusiva creada desde ese SHA; sin mezcla de cambios de otras misiones.
- Estado del arte relevante ya presente en `main`:
  - **Misión P0 «EFECTIVO FÍSICO» (2026-10-26, migración `20261026200000`)**: `get_cash_shift_expected` / `get_cash_flow_summary` añaden `physical_cash {CUP,USD}` (libro físico acumulado por moneda, misma lectura que las autorizaciones) y `valuation_residual_cup` (esperado canónico − libro CUP). `CajaStatusStrip`, `IngresosEgresosView` y `CashLedgerPanel` ya presentan el físico como cifra principal y el residuo clasificado como valoración contable.
  - **RPC `open_cash_shift`** (v2.24.1, migración `20261024120000`, reemisión certificado-vivo en `20261027000000`; ACL `service_role`-only): apertura server-side con base del LIBRO FÍSICO por moneda, nota de diferencia obligatoria (≥ 10 caracteres, `ERR_OPENING_DIFFERENCE_NOTE_REQUIRED`), apertura canónica CUP valorando los billetes USD a la tasa del servidor, idempotencia (`idempotency_registry`), un solo turno pendiente por tienda e interceptor `CASH_SHIFT_OPENED` atómico.

## 2. Reproducción del problema de los 2.820 CUP

Incidente real documentado en la propia migración `20261026200000` (tienda ENERVIDA-VITALLCONS, verificado READ-ONLY en producción por la misión P0):

- **Ventana canónica 1970→now:** cobros de **367 USD** valorados a las tasas históricas de sus ventas = **296.420 CUP**; la entrega (documento de caja) de los mismos **367 USD** valorada a **800 CUP/USD** = **293.600 CUP**.
- **Residuo:** 296.420 − 293.600 = **2.820,00 CUP** = `get_cash_shift_expected.expected_cash` con «sin turno abierto · acumulado histórico (sin cierres previos)».
- **Libro físico:** `get_cash_currency_summary → net` marca **CUP = 0,00 y USD = 0,00** — los billetes entraron y salieron completos.

El 2.820 **está correctamente calculado** (valoración canónica a tasas históricas de cada operación) y **ya no aparece como disponibilidad** en Inicio/Ingresos-Egresos/reportes (misión P0). El defecto que persistía en `main` era su **clasificación en la APERTURA**: el formulario de «Caja → Apertura de Turno» prellenaba el campo «**Fondo Inicial de Efectivo (CUP)**» con ese esperado canónico (2.820), presentando el residuo de valoración **como si fuera el fondo inicial real de caja** — exactamente el síntoma reportado.

## 3. Causa raíz (referencias concretas)

| # | Defecto | Evidencia (pre-corrección) |
|---|---|---|
| RC-1 | **Prefill del fondo inicial con el esperado CANÓNICO** en lugar del libro físico. Además, sin turno pendiente la ventana canónica arranca sin base de apertura (`v_opening = 0`), por lo que tras un cierre el prefill omitía el efectivo heredado del cajón. | `CashClosureView.tsx` (efecto de prefill, ex-líneas 184-194): `setDeclaredCash(expCup)` con `expCup = shiftExpected.expected_cash`. |
| RC-2 | **Diferencia de apertura documentada contra el canónico** (clasificación errónea): un conteo correcto de 0 con residuo 2.820 quedaba marcado «diferencia de apertura −2.820», y la discrepancia no exigía justificación alguna. | ex-líneas 278-282: `diffCup = declaredCash − expected_cash`; `opening_difference_*` persistidos sin validación ni causa obligatoria. |
| RC-3 | **La UI ignoraba la vía autoritativa**: `cashService.createClosure` hacía un `INSERT` directo en `cash_closures` con todos los valores calculados en el cliente — sin validación server-side, sin auditoría, sin idempotencia, sin nota obligatoria. El RPC `open_cash_shift` existía y estaba certificado vivo, pero ningún consumidor lo llamaba (su comentario documenta «paridad con el INSERT directo que hoy hace la UI»). | `src/services/cash-service.ts:22-36`; ACL service_role-only del RPC (requiere ruta API, como `/api/cash-closures/close`). |
| RC-4 | **«Otros Fondos Iniciales (opcional)»** (input de apertura → `declared_vouchers`): ambiguo (sin moneda; se sumaba a `declared_total` como si fuera CUP; mezclaba «vouchers» con un fondo físico) y sin función contable en la apertura. | `CashClosureView.tsx` ex-l.363 (`vouchersInputLabel`); `open_cash_shift` no acepta vouchers; el mismo campo en el cierre es legítimo («Transferencias Contadas (Final)»). |
| RC-5 | **Invalidaciones de caché incompletas** tras apertura/cierre: el estado del turno y los KPIs quedaban rancios hasta 30–60 s («Sin turno abierto» con el turno ya creado). | `useCashClosures.ts`: `onSuccess` solo invalidaba `cash-closures` + `sales-since-last-closure`. |
| RC-6 | El chip «Fondo de cambio vigente» no explicaba su composición (con turno abierto = fondo inicial + constituciones − devoluciones). | `CajaStatusStrip.tsx` hint de una línea. |

**Verificado (no defectos):** la apertura NO crea movimientos de caja (un único `INSERT` en `cash_closures`; en `build-ledger.ts` `apertura_turno`/`cierre_turno` son `INFO_TYPES` que no alteran el saldo corrido); el cierre (`close_cash_shift`) tampoco; las autorizaciones de salida validan contra el libro físico por moneda (`ERR_INSUFFICIENT_CURRENCY`) y NO contra el canónico; el índice único `one_pending_cash_closure_per_store` impide dos turnos pendientes.

## 4. Definición inequívoca de cada saldo (regla funcional vigente tras la corrección)

| Concepto | Definición y tratamiento |
|---|---|
| **Fondo inicial del turno** | Efectivo **físico contado** al abrir, **por moneda** (CUP y USD). Se declara (prefill = libro físico como referencia), se confirma contra el conteo real, y es la base del arqueo al cierre. JAMÁS se deriva de una valoración. |
| **Efectivo físico** | Billetes reales en cajón, por moneda. Fuente autoritativa: `get_cash_currency_summary → net` (libro por moneda). Único saldo que respalda salidas. |
| **Saldo contable valorado** | Esperado canónico CUP (cada movimiento a SU tasa histórica). Vista de valor, identificada como «valoración contable — no es efectivo disponible». |
| **Diferencia de arqueo (cierre)** | Contado − esperado, por lado: canónico CUP (contable) y USD físico (unidades); se registra sin autoajuste (`difference` / `difference_usd`). |
| **Diferencia de APERTURA** | **Contado − libro físico por moneda** (no contra el canónico). Si ≠ 0 (±0,01): **causa obligatoria** ≥ 10 caracteres, persistida en `opening_difference_*` + nota de auditoría; sin movimientos automáticos. |
| **Ingreso/Egreso de caja** | Solo por documento Ingresos/Egresos (`create_cash_flow_document`) con causa, responsable, moneda y trazabilidad. La apertura/cierre no generan documentos. |
| **Cierre del turno** | Conciliación apertura + movimientos del turno vs contado (`close_cash_shift` v2.24.x, server-side); preserva historial; la reapertura hereda del LIBRO físico. |

**Comparación por moneda antes de valorar:** sí — el control físico es por moneda (libro, arqueo USD, autorizaciones); la valoración CUP canónica es una vista contable separada. La regla de diseño materializada: **una diferencia de valoración jamás se convierte en efectivo disponible, ingreso, egreso o fondo inicial.**

## 5. Matriz de los seis escenarios (esperado vs observado)

Escenarios simulados en pruebas (`cash-closure-view-apertura.test.tsx`); ningún dato real fue tocado.

| # | Escenario | Esperado | Observado (prueba) |
|---|---|---|---|
| E1 | Declarar 0 CUP con libro 3.000 CUP | Contradicción explícita: diferencia −3.000 documentada contra el LIBRO; apertura bloqueada hasta causa ≥ 10 chars; sin ingreso automático de 3.000 | ✓ Bloqueada (`apertura-motivo-aviso`); motivo «corta» no habilita; con causa, payload `counted_cup=0` + `difference_note`; `legacy_insert.opening_difference_cup=-3000` |
| E2 | Declarado 5.000 vs contado/libro 3.000 | Exceso +2.000 con causa obligatoria; sin ajuste del conteo; sin ingreso de 2.000 | ✓ Payload `counted_cup=5000`, `opening_difference_cup=+2000`, `opening_balance_cup=5000` (sin autoajuste) |
| E3 | Declarado = contado = 3.000 | Base inequívoca, sin nota exigida, sin documento de ingreso, fondo contabilizado UNA vez | ✓ Sin motivo; 1 sola llamada; `difference_note=null`; preview «por moneda» |
| E4 | Residuo 2.820 CUP + físico 0/0 | Prefill 0,00 CUP / 0,00 USD (libro); residuo solo en bloque «valoración contable — no es efectivo disponible»; el 2.820 no puede devenir fondo | ✓ Prefill 0; `apertura-residual` con la cifra y la clasificación; payload 0/0 |
| E5 | Apertura → venta CUP → venta USD → entrega → arqueo → cierre → consulta → reapertura | Reapertura prellena con el LIBRO acumulado (incluye efectivo heredado), sin duplicar el fondo | ✓ Prefill 4.000 (libro) y no 1.000 (ventana canónica desde el último cierre) — el defecto de herencia queda demostrado y corregido |
| E6 | Sin movimientos y sin cierres previos | Prefill 0; sin fondo ficticio | ✓ Prefill 0; apertura habilitada sin nota; `apertura-residual` ausente |

Adicionalmente verificado por diseño y suites existentes: el cierre actualiza Caja/Inicio sin duplicaciones (apertura no crea movimientos; `close_cash_shift` no sobreescribe `opening_balance` — FIX F3-01 intacto), y las invalidaciones ahora refrescan turno/KPIs/libro inmediatamente (RC-5 corregido).

## 6. Dictamen sobre «Otros Fondos Iniciales (opcional)»

**ELIMINADO de la apertura.** Fundamentos:

1. **Sin función contable legítima:** `open_cash_shift` (la vía autoritativa, ya viva) no acepta vouchers de apertura; ningún consumidor lee `declared_vouchers` de una apertura (el cierre lo sobreescribe; el arqueo de vouchers del cierre usa el conteo final, no el inicial).
2. **Ambigüedad monetaria:** campo sin moneda, sumado a `declared_total` como si fuera CUP canónico, y semánticamente mezclado («otros fondos» + vouchers no físicos).
3. **Redundante:** toda constitución/reposición/devolución real del fondo ya tiene su flujo documental (Ingresos/Egresos, conceptos `constitucion_fondo`/`reposicion_fondo`/`devolucion_*_fondo`) con moneda, causa, responsable y trazabilidad.
4. **Compatibilidad histórica preservada:** la columna `cash_closures.declared_vouchers` (NOT NULL DEFAULT 0) y los registros históricos NO se tocan; el campo sigue existiendo y siendo válido **exclusivamente en el cierre** como «Transferencias Contadas (Final)» (conciliación por vouchers, legítima e inequívoca). En aperturas nuevas (ambas vías, RPC y fallback legado) queda en 0.

## 7. Tratamiento de diferencias y relación con Ingresos/Egresos

- **Diferencia de apertura (contado vs libro):** se documenta (`opening_difference_cup/usd/note` + auditoría server-side `CASH_SHIFT_OPENED`), jamás se compensa. La regla espejo UI↔RPC: sin causa ≥ 10 caracteres no hay apertura (`ERR_OPENING_DIFFERENCE_NOTE_REQUIRED` → 422 en la ruta).
- **Diferencia de arqueo (cierre):** se registra tal cual (`difference`, `difference_usd`) sin autoajuste — un turno con diferencia real no se marca cuadrado (v2.24.0 D8 intacto).
- **Diferencia de valoración:** permanece visible y trazable (bloques informativos en Inicio, Ingresos/Egresos y ahora también en la apertura), sin interacción con el fondo, los arqueos ni las autorizaciones.
- **Ingresos/Egresos:** sigue siendo el ÚNICO canal de entradas/salidas físicas documentadas. Reglas reforzadas en la UI de apertura: «La apertura NO crea movimientos de caja» (texto explícito en el modal); sin turno solo la ENTREGA es registrable (regla v2.24.0 D4 intacta); la constitución con apertura ya declarada sigue mostrando el aviso anti doble-registro. El modal de confirmación de apertura enuncia que cada entrada/salida se documenta aparte con causa y responsable.

## 8. Archivos modificados y justificación

| Archivo | Cambio | Justificación |
|---|---|---|
| `src/app/api/cash-closures/open/route.ts` **(nuevo)** | Ruta POST con `withAuth` + CSRF + rate-limit + Zod → `supabaseAdmin.rpc('open_cash_shift', …, p_user_id: session.user.id)`; mapeo explícito de errores (501 fallback / 409 ya-abierto / 422 nota-requerida / 409 tasa / 403 rol / 400 importes) | Vía autoritativa de la apertura, espejo del patrón de `/close` (el RPC es service_role-only). El actor SIEMPRE es el de la sesión; nunca se acepta `user_id` del cuerpo (RC-3). |
| `src/hooks/api/useCashClosures.ts` | `useOpenCashShift` (nuevo): POST a la ruta; en 501 `{fallback:true}` degrada al INSERT legado bajo RLS con el payload corregido; invalidación consolidada `invalidateCajaState` (turno, esperado, resumen, libro, monedas) aplicada a apertura/cierre/actualización | Unifica el refresco del grafo de caja (RC-5) y materializa la degradación explícita: abrir caja nunca queda bloqueado por una migración pendiente (RC-3). |
| `src/components/views/terminal/views/cash_closure/CashClosureView.tsx` | Prefill y base de comparación = **libro físico por moneda** (degradación declarada si `physical_cash` no existe); panel de «Conciliación con el libro físico» con diferencia por moneda y causa obligatoria (≥ 10 chars) que bloquea la apertura; bloque informativo del residuo de valoración; «Otros Fondos Iniciales» eliminado de la apertura; preview del fondo por moneda (sin sumar monedas); modal de confirmación reescrito (fondo contado vs libro, aviso «no crea movimientos»); idempotencia estable por apertura lógica; ejecución vía `useOpenCashShift` con `legacy_insert` coherente | Corrección de RC-1, RC-2 y RC-4; escenarios E1-E6; requisito §8/Fase F de no presentar residuos como fondo ni sumar monedas. |
| `src/components/views/terminal/views/dashboard/CajaStatusStrip.tsx` | Hint del chip «Fondo de cambio vigente» explicita su composición (fondo inicial físico del turno + constituciones − devoluciones) | RC-6 — explicar qué representa cada cifra (Fase F), sin cambiar la fórmula del RPC. |
| `src/__tests__/components/cash-closure-view-apertura.test.tsx` **(nuevo)** | 10 pruebas: E1-E6, idempotencia, degradación | Fase H §10.1-3, 6, 8-9, 12-13 (parcial), 15 (parcial). |
| `src/__tests__/api/cash-closures-open-route.test.ts` **(nuevo)** | 8 pruebas: validación Zod, actor de sesión, mapeo completo de códigos de negocio, fallback 501 | Fase H — contrato de la ruta autoritativa. |
| `src/__tests__/hooks/use-open-cash-shift.test.tsx` **(nuevo)** | 5 pruebas: vía RPC sin INSERT legado, fallback 501→legado con payload corregido, 501 sin fallback = error, 409 de negocio, INSERT mínimo | Fase H §10.9-10, 15 (reintentos/errores). |

**Sin cambios de:** migraciones, contratos RPC, RLS/permisos, `close_cash_shift`, `create_cash_flow_document`, fórmulas de arqueo, datos históricos, `get_cash_flow_summary`/`get_cash_shift_expected`.

## 9. Pruebas ejecutadas, resultados reales y limitaciones

| Suite | Resultado |
|---|---|
| `bunx tsc --noEmit` (proyecto completo) | **exit 0** — sin errores de tipos |
| `bunx eslint` (7 archivos tocados/nuevos) | **0 errores** (solo warnings preexistentes de estilo `<button>` crudo) |
| `cash-closure-view-apertura.test.tsx` (nuevo) | **10/10 ✓** |
| `cash-closures-open-route.test.ts` (nuevo) | **8/8 ✓** |
| `use-open-cash-shift.test.tsx` (nuevo) | **5/5 ✓** |
| Vecinas: `caja-status-strip` (5), `ingresos-egresos-view` (20), `ingresos-egresos-tabs-fechas` (10), `cash-flow-create-modal` (16), `cash-flow-reverse-modal` (5) | **56/56 ✓** |
| `cash-arqueo.test.ts` (25), `caja-v224-1-corrective.test.ts` (21, contrato estático de `open_cash_shift`) | **46/46 ✓** |
| Navegación/regresión: `gate1-navigation` (109), `cash-report-dedicated-view` (8), `group-hub-superadmin` (5), `iteration-11-4` (62) | **184/184 ✓** |
| `cash-flow-sql-scenarios.test.ts` (integración SQL) | **8 skipped POR DISEÑO** — exige `CASH_FLOW_INTEGRATION_DB=1` + BD desechable dedicada; no existe en este entorno y la misión prohíbe usar remotos |

**Limitaciones declaradas:**
- **E2E NO ejecutada** (Playwright/CostproE2E): no autorizada por esta misión; la suite omitida NO debe leerse como aprobada.
- **Integración SQL viva de `open_cash_shift` no ejecutada aquí**: el RPC ya está certificado vivo en producción (reemisión v2.24.1 «definición VIVA certificada») y su contrato estático pasa (21/21); una corrida viva queda para el propietario en entorno desechable autorizado.
- Las pruebas de componente mockean los hooks de datos (patrón de la casa); la lógica de red vive en las suites de ruta y hook con el handler real.

## 10. Riesgos residuales y decisiones para el propietario

1. **Fusionar el PR** (abierto, sin fusionar): la corrección solo toma efecto al fusionar + desplegar. El RPC `open_cash_shift` ya está vivo en producción, por lo que la ruta funcionará de inmediato tras el deploy.
2. **Entornos sin el RPC** (p. ej. una base reconstruida a medias): la ruta responde 501 `fallback:true` y la UI degrada al INSERT legado CORREGIDO (mismo payload confirmado). Riesgo residual: en degradación no hay conversión USD→CUP de la apertura canónica ni auditoría server-side — documentado en el toast «vía legada».
3. **Diferencia de ventanas libro vs RPC**: la misión P0 lee el libro con tope `'infinity'`; `open_cash_shift` compara contra `get_cash_currency_summary(store, NULL, NULL)` (tope `now()`). Un movimiento con `payment_date` futura podría exigir causa de diferencia que la UI no anticipa; el servidor es autoritativo y el error 422 se muestra accionable. Corrección del RPC (si se desea): misión aparte — no se tocó el contrato.
4. **`fondo_vigente`** sigue incluyendo el fondo inicial del turno (fórmula v2.24.0 §9 intacta; ahora con la apertura física corregida, su composición es coherente y el hint la explicita). Si el propietario quiere un «fondo de cambio» estricto (solo documentos de fondo), requiere cambio de contrato RPC — decisión suya.
5. **Clerk + RLS en el fallback legado**: idéntico al comportamiento previo (policy UPDATE exige admin/manager/encargado); el camino RPC valida roles fail-closed server-side. Sin cambios de permisos en esta misión.

**Restricciones respetadas:** 0 conexiones a producción/CostproE2E, 0 SQL de escritura en cualquier base, 0 migraciones nuevas o aplicadas, 0 cambios de RLS/permisos/guards, 0 datos históricos modificados, PR abierto sin fusionar, 0 secretos impresos.

---

**DICTAMEN FINAL: `APTO PARA REVISIÓN`** — el origen del 2.820 CUP está demostrado (valoración a tasas históricas de los mismos 367 USD, sin respaldo en billetes), su clasificación como fondo inicial estaba defectuosa en la apertura y queda corregida por la vía autoritativa (`open_cash_shift`) con libro físico por moneda, causa obligatoria para discrepancias, «Otros Fondos Iniciales» eliminado de la apertura e invalidaciones completas. No se ejecutaron migraciones, E2E ni escrituras remotas.
