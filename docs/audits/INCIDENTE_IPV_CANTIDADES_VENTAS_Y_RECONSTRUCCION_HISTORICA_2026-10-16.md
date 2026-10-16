# INCIDENTE IPV — CANTIDADES DE VENTA NO DESCONTADAS Y RECONSTRUCCIÓN HISTÓRICA — 2026-10-16

**Módulo:** Inicio → OPERACIÓN → Ventas → IPV — Ingresos por Ventas (`ipv_ventas`)
**Proyecto:** COSTPRO 4 Multitienda · **Rama:** `feat/ipv-ingresos-por-ventas` · **PR:** [#1411](https://github.com/Nardian90/Costpro/pull/1411)
**Caso de referencia:** SKU 142 — Cemento Blanco 2 Kg — venta del 15/10/2026 por 2 unidades y 4.000 CUP
**Naturaleza:** corrección del reporte y de su lógica de cálculo. **No** se modificó ninguna existencia, precio, pago, venta ni movimiento real.

---

## A. RESUMEN EJECUTIVO

### A.1 Causa raíz confirmada (con evidencia directa)

**Truncado silencioso de PostgREST a 1000 filas.** La API del IPV (`GET /api/ipv-ventas`) descargaba `stock_movements` con una única consulta `.select()…` **sin paginación**. PostgREST (Supabase) aplica `db-max-rows = 1000` por defecto: la consulta devolvía **exactamente 1000 de las 1123 filas** del ledger de ENERVIDA-VITALLCONS, y el corte caía sobre las filas más recientes. La última venta incluida era del **2026-10-12**; las ventas del **14/10 (−3 u)** y **15/10 (−2 u)** — incluida la del SKU 142 — **nunca llegaron a `computeIpv`**.

El importe, en cambio, proviene de otra tabla (`transaction_items`, 671 filas de la tienda, por debajo del tope) y por eso **sí** aparecía: 4.000 CUP en ventas con **cero** unidades vendidas. Es exactamente el síntoma informado: *«el IPV muestra el importe de la venta, pero no la salida de unidades, y conserva existencia final 26»*.

Evidencia directa (replicación REST de la consulta real de la API, solo lectura):

| Medida | Valor |
|---|---|
| `stock_movements` reales de ENERVIDA (count exacto) | **1123** |
| Filas devueltas por la consulta sin paginar | **1000** |
| Filas truncadas (silenciosamente) | **123** |
| Última fecha de venta incluida en el recorte | **2026-10-12** |
| ¿Incluye las ventas del 14/10 y 15/10? | **No / No** |

Consecuencias en cascada, todas derivadas del mismo recorte:

1. **Cantidades vendidas ausentes**: sin las filas `sale` del período, la columna «Cantidades vendidas» quedaba en 0 mientras «Ventas en importe» mostraba 4.000 CUP (fuentes distintas, filtros de fecha distintos y uno de ellos truncado).
2. **Existencia inicial/final falsas (26 en vez de 23/21)**: el ledger reconstruido con 1000 filas sumaba `30 (compra 24/09) − 1 (10/10) − 3 (10/12) = 26`, sin las ventas del 14 y 15/10.
3. **Alerta `[RECONCILIATION] 142 — Cemento Blanco 2 Kg: 26 · esperado: 21 · dif: -5`**: el «calculado 26» era el ledger truncado y el «esperado 21» el stock canónico real (`inventory.quantity`, correcto). La diferencia de −5 = 3 + 2 son **exactamente las dos ventas ausentes**. La alerta era un **artefacto de la propia consulta del reporte**, no una discrepancia de inventario.
4. **Alertas `[PRE_LEDGER]` espurias** (p. ej. SKU 175 — Losa Porcelanato 25x60: «N/D · esperado: 1,2 · dif: 1,2»): productos cuyos movimientos únicos y recientes (15/10) fueron recortados; el reporte veía su stock sin ningún movimiento y lo reportaba como «no reconstruible».

**El núcleo de cálculo (`computeIpv`) era fiel a su entrada**; el defecto estaba en la capa de obtención de datos. La reconstrucción manual con el ledger completo concilia exactamente: `30 − 1 − 3 − 3 − 2 = 21 = inventory.quantity`.

### A.2 Segundo defecto corregido: texto «…2 Kgcalc» en las alertas

El sufijo `calc` **no venía de la base de datos** ni de un alias de consulta: era un defecto de composición del DOM en `IpvVentasView.tsx`. La etiqueta `[TIPO] 142 — Cemento Blanco 2 Kg` y el medidor `calc: 26 · esperado: …` se renderizaban en dos `<span>` adyacentes **sin nodo de texto entre ellos** (JSX elimina el salto de línea entre etiquetas); el espacio visual dependía solo de una clase de margen, y el texto extraíble/seleccionable/copiado —y la lectura de lectores de pantalla— quedaba concatenado: `Cemento Blanco 2 Kgcalc: 26 · …`.

**Corrección:** separador explícito `· calc: …` en el DOM, contenedor con `flex gap` en vez de margen, y las incidencias se agrupan ahora **por categoría** con encabezados (`RECONCILIATION — N producto(s)`, …) manteniendo **todas** las incidencias visibles y accesibles (nada oculto).

### A.3 Archivos y funciones afectados

| Archivo | Función/Zona | Papel en el defecto | Corrección |
|---|---|---|---|
| `src/app/api/ipv-ventas/route.ts` | `getHandler` — consulta de las 5 fuentes | `stock_movements` (y las otras 4) sin paginar → truncado a 1000 filas | Las 5 consultas se descargan con `fetchAllRows` (paginación completa, `.order('id')` determinista) |
| `src/lib/supabase-fetch-all.ts` | **NUEVO** — `fetchAllRows` | — | Helper de paginación: pagina `.range()` hasta página parcial; **falla explícitamente** ante error de página o tope de seguridad (nunca subconjunto silencioso) |
| `src/components/views/terminal/views/ipv_ventas/IpvVentasView.tsx` | bloque «Incidencias» | `calc:` pegado al nombre (falta de nodo de texto) | Separador explícito + `flex gap` + agrupación por tipo |
| `src/lib/ipv-ventas/compute.ts` | `computeIpv` | **Sin defecto** — fiel a su entrada; validado con el ledger completo | Sin cambios funcionales |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf.ts` / `ipv-ventas-excel.ts` | exportaciones | **Sin defecto** — usan celdas/objetos separados (no sufren concatenación) y el mismo dataset de la API | Sin cambios; heredan la corrección al consumir el mismo cálculo |

### A.4 Correcciones aplicadas (una lógica canónica única)

1. **Paginación obligatoria** en las 5 fuentes del IPV (productos, `stock_movements`, `inventory`, `transaction_items`, `devolution_items`) con clave de orden estable `id` para paginación determinista bajo escrituras concurrentes. Una página parcial (< pageSize) termina el bucle; un error de página **falla con 500** en vez de calcular con datos incompletos; el tope de seguridad (500 páginas) lanza `FetchAllIncompleteError` — **jamás se vuelve a calcular un informe sobre un subconjunto silencioso**.
2. **Presentación de incidencias** corregida y agrupada por categoría (§A.2).
3. Sin excepciones por SKU, sin ajustes de stock, sin ocultar alertas legítimas, sin movimientos retroactivos, sin nueva tabla de saldos.

### A.5 Pruebas ejecutadas y resultados

| Batería | Resultado |
|---|---|
| Suite completa `vitest run` | **3026 passed, 0 failed** (169 archivos; 24 skipped preexistentes) |
| Nuevas pruebas de regresión — paginación (`fetch-all.test.ts`) | 7/7 (incluye la reproducción documental: consulta sin paginar = 1000 de 1123) |
| Nuevas pruebas del incidente (`incidente-142.test.ts`) | 15/15 (Pruebas A, B, C, D, E, F, G, H, I, J, K + reproducción del defecto) |
| Verificación en vivo con datos reales (solo lectura) | **12/12 veredictos OK** — `docs/audits/evidence/ipv-incidente-142-verificacion.json` |
| `tsc --noEmit` | limpio (exit 0, incluye `scripts/`) |
| `eslint` (archivos del IPV) | 0 errores (5 avisos preexistentes de estilo, sin relación) |
| `next build` local | No ejecutable en este contenedor (OOM con 4 GB en Turbopack y webpack) — **el build de producción SÍ compila en CI** (check «TypeCheck + Lint + Unit Tests + Build» verde) |
| CI sobre `2e9bb34` (PR #1411) | **6/6 checks exitosos**: TypeCheck+Lint+UnitTests+Build · Unit & Integration Tests · Security Audit · TypeScript Security Checks · Allowlist Review · Vercel Preview Comments (E2E/SQL skipped por condiciones del workflow, igual que en commits previos) |

### A.6 Incidencias históricas que permanecen (reales y documentadas, no ocultas)

Tras la corrección, las alertas que persisten serían solo legítimas. En la verificación en vivo del período 14–15/10/2026 en ENERVIDA, **los 15 SKUs prioritarios quedaron sin ninguna incidencia** — todas las alertas anteriores eran espurias. Se documentan como hallazgos históricos reales (no defectos) en §C y §D, p. ej.:

- **SKU 81 — Bridas de 4x8 400mm**: el saldo pre-período reconstruido es −100 u porque existe una **venta histórica de 100 u (10/10–12/10) revertida el 14/10** (`sale_reverse` +100, «Reverso de venta») más una recepción +100 el 14/10. El ledger concilia con el canónico (Ef=100). Es historial real, no defecto del reporte ni de datos.
- **SKU 87/88 — Cable Solar Negro/Rojo 4mm**: `sale_reverse` +5 el 14/10 → la columna de ventas netas del período muestra −5 (reverso de ventas anteriores). Concilia.
- En TIENDA CENTRAL existen productos con deriva pre-ledger documentada en la auditoría previa (cargas iniciales sin movimiento y devoluciones de agosto cuyo movimiento `return` no existe tras el reinicio del ledger en septiembre): el IPV los seguirá reportando con `PRE_LEDGER`/`RECONCILIATION`/`DEVOLUTION_WITHOUT_LEDGER` — **correcto y deseado** (§5.2 de la misión: la advertencia desaparece solo cuando la conciliación es real).

---

## B. CASO SKU 142 — CEMENTO BLANCO 2 KG

### B.1 Datos reales verificados (solo lectura)

| Fuente | Valor |
|---|---|
| Producto | `504b9b78-bf54-4e66-a659-ce0c30320cdb` · SKU `142` · ENERVIDA-VITALLCONS (tienda protegida, solo lectura) |
| `inventory.quantity` (canónico) | **21.0000** |
| Movimientos del ledger (5) | `purchase` +30 (24/09) · `sale` −1 (10/10 17:00Z) · `sale` −3 (12/10 16:00Z) · `sale` −3 (**14/10 16:00Z**) · `sale` −2 (**15/10 16:00Z**) |
| Transacción 14/10 (completed) | 3 u × 2.000 CUP = **6.000 CUP** (`2026-10-14T16:00:00Z`) |
| Transacción 15/10 (completed) | **2 u × 2.000 CUP = 4.000 CUP** (`2026-10-15T16:00:00Z`, forma unitaria confirmada) |
| Conciliación ledger ↔ canónico | 30 − 1 − 3 − 3 − 2 = **21 = 21** ✔ |

### B.2 Ventanas de fecha utilizadas (convención oficial del cliente, hora local Cuba UTC−4)

- «Solo 15/10»: `from = 2026-10-15T04:00:00.000Z` (00:00 local) · `to = 2026-10-16T03:59:59.999Z` (23:59:59.999 local) — ambos extremos **inclusivos**.
- «14–15/10»: `from = 2026-10-14T04:00:00.000Z` · mismo `to`.

### B.3 Resultado ANTES de la corrección (reproducido con la consulta truncada real)

Período **14–15/10** (el que el usuario usó al reportar):

| Columna | Mostrado | Real |
|---|---|---|
| Existencia inicial | **26** (correcta por casualidad: la venta del 14/10 tampoco llegó) | 26 |
| Cantidades vendidas | **0** ← la venta no se incorporaba | 5 |
| Ventas en importe | 10.000 CUP (4.000 en la ventana del 15) | 10.000 CUP |
| Existencia final | **26** | 21 |
| Incidencia | `[RECONCILIATION] 142 — Cemento Blanco 2 Kg: 26 · esperado: 21 · dif: -5` | — (espuria) |

La diferencia de −5 = las dos ventas truncadas (−3 del 14/10 y −2 del 15/10). Ni la apertura estaba mal calculada ni había otro movimiento: **el cálculo nunca recibió esas filas**.

### B.4 Resultado DESPUÉS de la corrección (mismo núcleo, datos paginados — verificación en vivo)

| Período | Ei (reconstruida del ledger) | Cant. vendidas | Importe | Ef | Incidencias |
|---|---|---|---|---|---|
| **14–15/10** | **26** (saldo al cierre del 13/10) | **5** (3+2) | **10.000 CUP** | **21** | 0 |
| **Solo 15/10** | **23** (saldo al **cierre del 14/10** = 26−3) | **2** | **4.000 CUP** | **21** | 0 |
| Solo 14/10 (control) | 26 | 3 | 6.000 CUP | 23 | 0 |

Los tres escenarios de la misión quedan así demostrados **sin forzar constantes**: la apertura del período del 15/10 es 23 —el saldo del cierre del 14/10 reconstruido del ledger—; si el usuario consulta 14–15, la apertura es 26 y el cierre 21; y en un período hipotético que abra el 14/10 con solo la venta de 2 u, el resultado sería 24 (Prueba A, `incidente-142.test.ts`).

### B.5 Evidencia de unicidad de la venta del 15/10

- El ledger contiene **una** fila `sale` de −2 u el 15/10 (16:00Z) — verificación SQL directa.
- La transacción `f4aacc6a-5505-40a2-8283-a38d7f07a0b3` (`status=completed`) tiene **una** línea del producto con 2 × 2.000 CUP.
- En el cálculo paginado: «Cantidades vendidas» = 2 en la ventana del 15 y 5 en la del 14–15; el importe 4.000/10.000. Cada movimiento entra a **una sola ventana** (`< from`, `≤ to`, `> to` — partición excluyente; Prueba C cubre los límites exactos `from` y `to`).
- La conciliación final: ledger total 21 = canónico 21 → sin `RECONCILIATION` para el SKU 142. **La venta del 15/10 se incorpora una sola vez** a importe, cantidades y saldo.

### B.6 Trazabilidad

Venta ↔ línea ↔ movimiento: la fila del IPV expone `productId` (UUID), `sku` 142 y `name`; el importe sale de `transaction_items` (con `transactions!inner` por tienda/estado/fecha) y las cantidades de `stock_movements` (por tienda), sin uniones que multipliquen filas (agregación separada por dominios: dinero vs cantidades; §diseño del núcleo).

---

## C. MATRIZ DE CONCILIACIÓN (período 14–15/10/2026, ENERVIDA — verificación en vivo)

Fuente: `docs/audits/evidence/ipv-incidente-142-verificacion.json` (generado con el MISMO `computeIpv` del reporte sobre datos reales paginados).

| SKU | Descripción | Ei | Movs. en ledger (incluidos por el IPV) | Dif. detectada | Causa raíz del síntoma | Corrección aplicada / estado |
|---|---|---|---|---|---|---|
| 15 | Cemento Cola | 50 | 33/33 | 0 | Truncado ocultaba movs. recientes (vales del 14-15/10: −3, −6) | Paginación → sin incidencias; concilia 39=39 |
| 17 | Césped Artificial | 6 | 10/10 | 0 | Truncado | → concilia 54=54 (entrada 54, venta 6) |
| 81 | Bridas de 4x8 400mm | −100 | 9/9 | 0 | Truncado + historial real con venta de 100 u revertida | → concilia 100=100; Ei negativo es historial real (venta revertida), documentado |
| 87 | Cable Solar Negro 4mm | 58 | 83/83 | 0 | Truncado | → concilia 63=63; −5 de ventas netas = `sale_reverse` real del 14/10 |
| 88 | Cable Solar Rojo 4mm | 58 | 81/81 | 0 | Truncado | → concilia 63=63; ídem (reverso real) |
| 92 | Juego de pata | 3 | 28/28 | 0 | Truncado | → concilia 3=3 |
| 100 | Autorroscante chiquito | 106 | 11/11 | 0 | Truncado | → concilia 150=150 |
| 111 | Grapas plásticas c/clavo | 23 | 8/8 | 0 | Truncado | → concilia 23=23 |
| 139 | Panel 640 W Suntech | 0 | 22/22 | 0 | Truncado | → concilia 0=0 |
| 141 | Cemento TBV 50 Kg | 34 | 30/30 | 0 | Truncado | → concilia 20=20 (11 vendidas en el período) |
| **142** | **Cemento Blanco 2 Kg** | **26** | **5/5** | **0** (antes: −5 espuria) | **Truncado: ventas 14-15/10 ausentes** | **→ concilia 21=21; importe 10.000/4.000 CUP según ventana** |
| 174 | Grey cerámico beige 50x50 | 0 | 1/1 | 0 | Movimiento único (15/10) recortado → PRE_LEDGER espuria | → concilia 1=1, sin alertas |
| 175 | Losa Porcelanato 25x60 | 0 | 1/1 | 0 | Ídem (la alerta «N/D · esperado: 1,2» era el truncado) | → Ei=0 confirmado por ledger, entradas 1,2, Ef=1,2, sin alertas |
| 176 | Batería 12.8v100Ah | 0 | 1/1 | 0 | Ídem | → concilia 1=1 |
| 177 | MPPT 4000W | 0 | 1/1 | 0 | Ídem | → concilia 1=1 |

**Todos los movimientos encontrados en la fuente canónica fueron incluidos por el IPV tras la corrección** (columna «Movs. incluidos» = «Movs. en ledger») y la diferencia netoledger↔canónico es 0 en los 15 casos. La unidad comercial (bulto, m2, u…) se respeta y las cantidades decimales (1,2) se conservan sin redondeo.

---

## D. ALERTAS HISTÓRICAS PENDIENTES (clasificación §5.1)

**Diferencia fundamental demostrada en este incidente: una alerta del IPV puede reflejar (a) un defecto de la consulta del propio reporte, (b) datos históricos incompletos, o (c) una discrepancia real de inventario. La corrección elimina (a) sin tocar (b) ni (c).**

Categorías sobre las alertas que reportaba el IPV:

1. **(a) Defecto de consulta — RESUELTO**: todas las alertas `RECONCILIATION` y `PRE_LEDGER` observadas en el período 14–15/10 de ENERVIDA eran artefactos del truncado a 1000 filas (evidencia: tras paginar, 0 incidencias en los 15 SKUs prioritarios y conciliación exacta en los 15).
2. **(c) Historial real documentado — PERMANECE VISIBLE (correcto)**: SKU 81 (Ei reconstruida −100 por venta histórica revertida + recepción), SKU 87/88 (reversos de venta del 14/10 → ventas netas negativas en el período). Son operaciones reales que el IPV expone fielmente; el ledger concilia, por lo que no generan alerta — si el usuario desea regularizar su presentación contable, es una decisión de negocio, no un ajuste técnico.
3. **(b) Datos históricos incompletos — PERMANECEN REPORTADOS**: en TIENDA CENTRAL COSTPRO existen productos con carga inicial previa al registro de movimientos y devoluciones de agosto cuyo movimiento `return` no existe (reinicio del ledger en septiembre, documentado en `AUDITORIA_IPV_INGRESOS_POR_VENTAS.md` §5.6). El IPV **seguirá** mostrando `PRE_LEDGER` (apertura N/D, nunca cero inventado), `RECONCILIATION` (diferencia calculado/esperado/dif) y `DEVOLUTION_WITHOUT_LEDGER` para esos casos. No se ocultaron, no se crearon movimientos retroactivos ni saldos de apertura sin fuente (§5.2: requiere autorización explícita).
4. **Sin evidencia de categoría (d)–(h) adicional** en las tiendas auditadas en este período; el tope de seguridad de `fetchAllRows` garantiza que si una tienda creciera más allá del tope, el reporte **fallaría visiblemente** en vez de truncar.

---

## E. CAMBIOS Y PRUEBAS

### E.1 Archivos modificados/añadidos

| Archivo | Cambio |
|---|---|
| `src/lib/supabase-fetch-all.ts` | **NUEVO**: `fetchAllRows` + `FetchAllIncompleteError` (paginación completa, fallo explícito) |
| `src/app/api/ipv-ventas/route.ts` | Las 5 consultas con `fetchAllRows` + `.order('id')`; documentación del incidente en el encabezado |
| `src/components/views/terminal/views/ipv_ventas/IpvVentasView.tsx` | Incidencias: separador DOM explícito («· calc: …»), `flex gap`, agrupación por tipo; comentarios del defecto corregido |
| `src/__tests__/ipv-ventas/fetch-all.test.ts` | **NUEVO**: 7 pruebas de regresión de paginación (Prueba I) |
| `src/__tests__/ipv-ventas/incidente-142.test.ts` | **NUEVO**: 15 pruebas — reproducción del defecto con entrada truncada, Pruebas A–K de la misión |
| `scripts/ipv/verificar_ipv_en_vivo.ts` | **NUEVO**: verificación en vivo (solo lectura) contra datos reales |
| `scripts/ipv/db_query.py` | **NUEVO** (restaurado): helper de consulta SQL de solo lectura vía Management API |
| `docs/audits/evidence/ipv-incidente-142-verificacion.json` | **NUEVO**: evidencia JSON de la verificación en vivo |

### E.2 Pruebas nuevas/actualizadas (mapeo con la misión §8)

- **Prueba A** (venta SKU 142): apertura 26, venta 2 × 2.000 → V=2, importe 4.000 CUP, Ef=24 ✔ (`incidente-142.test.ts`)
- **Prueba B** (dos fechas): 14–15 → V=5, Ef=21, 10.000 CUP; solo 15 → Ei=23 (cierre del 14/10), V=2, Ef=21 ✔
- **Prueba C** (fecha técnica vs económica y límites inclusivos): movimiento en el instante exacto `from`/`to` entra en el período; fuera, no; cantidades usan `movement_date` (fecha operativa) e importes `completed_at` — dominios separados por diseño ✔
- **Prueba D** (venta anulada): `sale` −2 + `sale_void` +2 → V=0, sin doble descuento; `sale_reverse` ya cubierto en el núcleo ✔
- **Prueba E** (entrada y venta): 6 + 54 − 6 = 54 con unidad comercial «bulto» ✔
- **Prueba F** (vales): apertura 10 − vale 3 = 7; un vale en borrador no existe como movimiento y no descuenta ✔
- **Prueba G** (devolución): venta −5 + devolución +2 → Devoluciones=2, V=5, Ef=27; importe neto bruto−devuelto, sin restar dos veces ✔
- **Prueba H** (carga sin ledger): con movimiento real → concilia (Ei=0 confirmada por ledger); con entrada truncada → `PRE_LEDGER` con N/D y diferencia documentada, nunca cero inventado ✔
- **Prueba I** (movimiento faltante): regresión completa del truncado — el emulador PostgREST sirve 1123 filas con tope 1000; `fetchAllRows` las descarga todas; el «antes» documenta la pérdida de 123 filas ✔
- **Prueba J** (decimales): 1,2 / 65,5 / 65,25 / 10,125 fieles ✔
- **Prueba K** (multitienda): la API filtra por `store_id` y RLS; `computeIpv` solo consume los datos de su tienda ✔
- **Prueba L** (coherencia de exportaciones): pantalla, PDF y Excel comparten `filteredRows` + `totalsFromRows` (sin cambios en esta corrección; suite previa la cubre, 28 pruebas del núcleo en verde)

### E.3 Comandos ejecutados y resultados

```text
npx tsc --noEmit -p tsconfig.json          → exit 0 (limpio)
npx vitest run src/__tests__/ipv-ventas/   → 50/50 passed (3 archivos)
npx vitest run                             → 3026 passed, 0 failed, 24 skipped (preexistentes)
npx eslint (archivos IPV)                  → 0 errors, 5 warnings preexistentes (estilo botones)
bun scripts/ipv/verificar_ipv_en_vivo.ts   → 12/12 veredictos OK (evidencia JSON)
python3 scripts/ipv/db_query.py "<SQL>"    → auditoría de datos, solo lectura
```

### E.4 Verificación multitienda

- La API filtra las 5 fuentes por `store_id` validado con `canViewStore` (RLS activa vía sesión) — sin cambios.
- La verificación en vivo se ejecutó contra ENERVIDA (tienda protegida) **en modo exclusivamente lectura**; conteos de las demás tiendas: Puerto Padre 256 movs., Central 105 (bajo el tope, pero la paginación es universal).
- El stock canónico (`inventory.quantity`) fue re-verificado tras las pruebas: **21.0000 para SKU 142, sin alteraciones** (evidencia: sección `matriz_skus_prioritarios` del JSON).

### E.5 Verificación de PDF y Excel

- Ambos exportadores consumen **el mismo** dataset de la API (`filteredRows` + `visibleTotals`) — heredan automáticamente la corrección; no fue necesario modificarlos.
- Las incidencias en PDF/Excel ya usaban celdas separadas (sin el defecto de concatenación); en la vista web se corrigió.
- La vista previa PDF se regenera con firma `(tienda, fechas, generatedAt, búsqueda)` — la selección se conserva entre pantalla/PDF/Excel (pruebas del escenario L en la suite).

### E.6 Git, PR y despliegue real

- **Rama**: `feat/ipv-ingresos-por-ventas` · **PR**: [#1411](https://github.com/Nardian90/Costpro/pull/1411) (abierto, actualizado con esta corrección y comentario de resumen).
- **Commits de la misión correctiva**: `19ce3f6` (fix principal) y `2e9bb34` (tipos de los scripts de verificación — detectado por el TypeCheck de CI, corregido y re-verificado).
- **CI**: verde 6/6 sobre `2e9bb34`, incluido el build de producción. Nota transparente: el primer run falló por (1) dos errores TypeScript en archivos nuevos (corregidos en `2e9bb34`) y (2) un test de UI flaky ajeno al IPV (`ai-command-center` — pasa 16/16 local y en el re-run de CI, sin cambios en ese componente; el commit previo `298de17` tenía CI verde con la misma suite).
- **Estado real del despliegue**: la app productiva (costpro4.vercel.app) sirve `main`; el IPV llega a producción al fusionar el PR (los previews de Vercel del PR ya compilan la corrección). GitHub Push Protection bloqueó el primer push por tokens de auditoría hardcodeados en los scripts de verificación → externalizados a variables de entorno (`.env` untracked); ningún secreto en el repositorio.
- **Seguridad de los scripts de auditoría**: `db_query.py` y `verificar_ipv_en_vivo.ts` leen las claves de `SUPABASE_ACCESS_TOKEN` / `SUPABASE_SERVICE_ROLE_KEY` del entorno; fallan explícitamente si faltan.

### E.7 Compromiso de integridad

Ninguna escritura en datos comerciales: las verificaciones usaron REST/SQL de solo lectura; no se crearon ventas, movimientos, saldos ni ajustes; no se duplicó la venta de los días 14 y 15/10; las tiendas protegidas no recibieron escrituras.

---

## F. CONCLUSIÓN

La venta del SKU 142 del 15/10/2026 ahora contribuye **una sola vez** y simultáneamente al importe (4.000 CUP), a las cantidades vendidas (2) y al saldo (26 → 21 en el período 14–15; 23 → 21 en el del 15), con conciliación exacta contra el stock canónico y sin alertas espurias. Las advertencias históricas auténticas permanecen visibles y documentadas; el IPV ya no presenta como diferencia de inventario un error causado por su propia consulta.
