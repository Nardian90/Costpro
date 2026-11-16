# CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — EXPEDIENTE DE CIERRE

**Fecha de cierre:** 2026-11-17 · **Propietario:** Nardian90 · **Autorización:** expresa, sin autorizaciones intermedias («fusiona, despliega, verifica y cierra»)

## 1. Objeto

Selector de visualización **Unitario / Importe** en la vista Inventario
(Inicio → OPERACIÓN → Almacén → Inventario, tab Stock Actual). Modo por
defecto **Unitario** (comportamiento canónico intacto). En modo **Importe**
cada columna monetaria muestra `existencia actual × valor unitario`, usando
EXACTAMENTE los mismos campos que el modo Unitario:

| Columna | Campo fuente | Importe |
|---|---|---|
| Precio | `price` | `stock_current × price` |
| Empresa | `precio_empresa` | `stock_current × precio_empresa` («—» si null/0, misma semántica que Unitario) |
| Costo | `cost_price` (costo **documental**) | `stock_current × cost_price` — **NUNCA** `cost_average` (WAC) |

Cambios de encabezado en modo Importe: «Precio» → «Precio (importe)»,
«Costo» → «Costo (importe)», «Empresa» → «Empresa (importe)» (etiqueta
compacta en móvil/tarjeta: «Importe precio»). La existencia, filtros,
búsqueda, orden, paginación, selección y operaciones de inventario no varían;
el orden de Precio/Costo usa el valor visible del modo activo.

## 2. Integración (merge autorizado)

| Item | Valor |
|---|---|
| PR fusionado | **#1639** — `feat(inventario): selector de visualización Unitario/Importe` |
| Rama | `feat/inventario-selector-visualizacion-20261117` |
| HEAD verificado | `cff65fbd3` (coincide con el SHA comunicado por el propietario) |
| Método | `merge` por API (mecanismo normal del repositorio, **sin** bypass de protecciones) |
| **Merge SHA** | **`683a6c46602d9481e6dc66ce51b0019a45201854`** |
| Verificación | `merge-base --is-ancestor 683a6c466 origin/main` → presente; `origin/main` = `683a6c466` tras el merge |
| Conflictos | `mergeable_state: clean` (main había avanzado con PR #1640 `b4b51e72d`; sin conflictos) |
| Diff del PR | 12 archivos, todos del alcance: 4 componentes `inventory/` (View, TableView, CardView, MobileTable), `src/lib/inventory/display-mode.ts`, 3 ficheros de pruebas (unit + integración + E2E), 4 capturas de evidencia. Sin temporales, sin secretos, sin cambios ajenos. |

## 3. Despliegue en producción (Vercel)

| Item | Valor |
|---|---|
| Check Vercel sobre `683a6c466` | `pending` → **`success`** |
| Sitio | `https://costpro4.vercel.app` → **HTTP 200** (`server: Vercel`) |
| Salud | `GET /api/health` → **HTTP 200** `{"status":"ok","service":"costpro-enterprise"}` |
| Migraciones | **No requeridas** por la misión; ninguna ejecutada, ninguna inventada |
| Errores nuevos | Ninguno (build y deployment sin errores) |

## 4. Verificación funcional — modo Unitario (comportamiento previo intacto)

- Selector «Visualización» junto al botón **Filtros** (misma barra,
  estilo segmentado como ViewSwitcher); **Unitario** activo por defecto
  (`aria-pressed=true`), persistencia vía localStorage
  (`costpro:inventory:displayMode`), fail-safe a Unitario ante valores
  desconocidos.
- Columnas y valores idénticos al comportamiento previo: Precio, Empresa
  («—» si null/0), Costo unitarios sin transformación.
- Evidencia: `audit-evidence/cp-inventory-unit-value-to-stock-amount-001/modo-unitario.png`
  y `modo-unitario-movil.png` (regeneradas en la corrida post-merge del
  2026-11-16 21:21 UTC contra la BD aislada: Existencia 100, Precio $100.00,
  Empresa —, Costo $60.00).

## 5. Verificación funcional — modo Importe (cálculos)

**Evidencia UI (BD aislada, código idéntico al fusionado):** producto piloto
con existencia **100** y precio **$100.00**, costo **$60.00** → al alternar:
«Precio (importe)» **$10,000.00** = 100 × 100.00; «Costo (importe)»
**$6,000.00** = 100 × 60.00; Existencia **100** inalterada; «Empresa
(importe)» «—». Comparación contra el MISMO formateador Intl de la app
(es-CU, CUP, 2 decimales). Vuelta a Unitario restaura los valores originales
al instante. Capturas: `modo-importe.png`, `modo-importe-movil.png`
(móvil 390px: selector visible junto a Filtros sin desbordamiento; tarjeta
«IMPORTE PRECIO $10,000.00» con EXISTENCIA 100 unidad).

**Contraste con datos reales de producción (sesión de SOLO LECTURA — GET
PostgREST, sin escrituras; fórmula idéntica a la desplegada):**

| Producto (producción real) | Existencia | Precio unit. | Costo doc. | WAC (`cost_average`) — NO usado | Importe Precio esperado | Importe Costo esperado |
|---|---|---|---|---|---|---|
| Cemento cola de 25kg | 319 | 8 500 CUP | 7 200 | 9 644.76 | **2 711 500.00 CUP** | **2 296 800.00 CUP** |
| Terminales Cubanas 25mm × M8 | 580 | 1 200 CUP | 400 | 400 | **696 000.00 CUP** | **232 000.00 CUP** |
| Bridas | 2 200 | 100 CUP | 0 | 1.0 | **220 000.00 CUP** | **0.00 CUP** (no 2 200) |

El caso «Cemento cola de 25kg» demuestra el requisito crítico: el importe de
Costo usa el costo **documental** (`cost_price`=7 200), NO el costo promedio
ponderado (9 644.76 → habría dado 3 076 679.84). El caso «Bridas» lo
confirma en el sentido opuesto (costo documental 0 prevalece sobre WAC 1.0).

## 6. Regresión y controles del merge

| Control | Resultado |
|---|---|
| CI `TypeCheck + Lint + Unit Tests + Build` sobre `683a6c466` | **success** |
| CI `Security Audit` sobre `683a6c466` | **success** |
| `Unit & Integration Tests` (Test Coverage) sobre `683a6c466` | Run 1 **cancelado** anómalamente a mitad de corrida (sin commit nuevo que lo justifique; histórico del workflow: todos success) → **re-lanzado (attempt 2): `success`** |
| E2E Aislado (project) sobre PR head `cff65fbd3` | **success** |
| E2E aplicable `inventory-display-mode.spec.ts` RE-EJECUTADO post-merge sobre código fusionado, BD aislada (procedimiento docs/e2e/EJECUCION_LOCAL_AISLADA.md) | **2 passed** (2.2 m) — escenario completo C1-C7: login UI, navegación, selector junto a Filtros, cálculo exacto con el formateador de la app, existencia inalterada, ida y vuelta de modo, móvil §10 |
| Cero escrituras al alternar | Probado doblemente: (a) aserción E2E C7 — ninguna request PATCH/POST a `products` ni llamada a `perform_inventory_adjustment` durante el ciclo; (b) revisión del diff — solo capa de presentación, sin llamadas mutadoras |
| Higiene BD aislada post-E2E | `data-hygiene-guard` → **PASS — net delta = 0** (stores=0, users=0); teardown del run «net zero» |
| KPIs existentes | Sin cambios en el diff (SALUD DEL INVENTARIO, FC y demás intactos) |

## 7. Seguridad y entorno

- Sin secretos en el diff (escaneo del texto completo por los patrones de
  tokens PAT/Supabase/JWT habituales → cero coincidencias en archivos
  versionados).
- `.env*` nunca versionado (`git check-ignore` OK); PAT usado solo en URL
  efímera de push/llamadas API, nunca persistido en `.git/config`.
- Servidor local finalizado con el **.env PRINCIPAL** activo (producción del
  propietario) y health 200; residuos de pruebas eliminados.

## 8. Declaración de cierre

**CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — COMPLETADA Y DESPLEGADA**

- PR #1639 fusionado (`683a6c466`), `origin/main` lo contiene.
- Vercel desplegó el commit correcto (`success` sobre el merge SHA).
- Ambos modos operan correctamente con los datos y formateadores de la app;
  la existencia no varía al alternar; filtros/búsqueda/orden/tienda/paginación
  sin regresión; selector usable en escritorio y móvil.
- Sin alteración de datos: sesión de verificación exclusivamente de lectura;
  cero escrituras de Supabase durante la alternancia.
