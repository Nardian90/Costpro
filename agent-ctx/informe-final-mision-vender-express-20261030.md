# INFORME FINAL — MISIÓN VENDER-EXPRESS (COSTPRO 4 MULTITIENDA)

**Fecha:** 2026-10-30 · **Rama:** `fix/pos-express-parity-buscador-20261030` · **Commit:** `b5affb664`
**PR:** https://github.com/Nardian90/Costpro/pull/1527
**Alcance probado:** tienda **Puerto Padre VITALLCONS** (`43a4dabc-b8b4-4b66-82b3-0c75335ca5d1`). La tienda **ENERVIDA-VITALLCONS** (producción) no fue tocada: cero escrituras en base de datos durante toda la misión.

---

## 1. Causa raíz del problema del buscador

La vista **Vender (Express)** (`POSExpressMode.tsx`) **no mostraba resultados en ningún momento**: no tenía lista de resultados ni autocompletado. Solo reaccionaba a **Enter**, con tres caminos:

1. Match **exacto** de SKU o código de barras → agregaba.
2. Fragmento de nombre con **exactamente 1** coincidencia → agregaba.
3. Cualquier otro caso (fragmento de nombre ambiguo, SKU parcial, barcode parcial) → `toast.error("\"...\" no coincide exactamente")` **aunque el producto existiera** en el catálogo y fuera visible y vendible en el carrito habitual.

Es decir: el carrito muestra resultados mientras se escribe (componente `POSAutocomplete` + filtrado del grid), pero Express no tenía nada de eso, y su lógica de Enter rechazaba búsquedas parciales legítimas. Esa combinación produce exactamente el reporte del propietario: «introduzco el nombre o SKU y el producto no aparece, aunque el carrito lo encuentra».

**Causas descartadas con evidencia (no era lo sospechado habitual):**
- **No era caché**: ambas vistas consumen el mismo `useProducts(storeId)` → RPC `get_products_for_pos` (React Query key idéntica).
- **No era RLS/permisos**: mismo cliente Supabase, misma tienda activa, misma respuesta.
- **No era el límite de 500 del RPC** en Puerto Padre: el catálogo real tiene 36 productos (verificado read-only).
- **No era la tienda activa**: `user.activeStoreId` fluye igual a ambas modalidades.

**Reproducción con el catálogo real de Puerto Padre (36 SKU):**

| Query | Express ANTES | Carrito |
|---|---|---|
| `Cemento` (fragmento ambiguo) | ❌ error «no coincide exactamente» | ✅ 2 productos visibles |
| `PROD-0` (prefijo de SKU) | ❌ error | ✅ 26 productos |
| `7509251382` (fragmento de barcode) | ❌ error | ✅ 1 producto |
| `Tudela` (fragmento único) | ✅ agrega | ✅ 1 |

## 2. Archivos y componentes modificados

| Archivo | Cambio |
|---|---|
| `src/components/views/terminal/views/pos/POSExpressMode.tsx` | Reescritura de búsqueda y paridad funcional (ver §4) |
| `src/components/views/terminal/views/pos/POSView.tsx` | Pasa a Express las rutas completas del carrito: `onAddToCart`, `handleAddItem`, `lastSale`, `handleClearLastSale`, `hideOutOfStock`/`setHideOutOfStock` |
| `src/__tests__/components/pos-express-parity.test.tsx` | **Nuevo** — 24 tests (Casos A/B/C/E/G/H de la misión) |
| `tsconfig.mision-express-parity.json` | **Nuevo** — verificación TypeScript acotada (convención `tsconfig.mision-*` del repo) |

**Sin cambios** (verificado con `git diff --name-only`): RPC/migraciones, rutas API, `store/cart.ts`, RLS, ni cualquier superficie del backend.

## 3. Diferencias encontradas entre Express y el carrito (matriz Fase 3)

| Funcionalidad | Carrito (referencia) | Express ANTES | Express AHORA |
|---|---|---|---|
| Buscar por nombre / fragmento | ✅ | ⚠️ solo fragmento único | ✅ mismo criterio `includes` |
| Buscar por SKU | ✅ | ⚠️ exacto / `SKU*` | ✅ + parcial con lista |
| Buscar por código de barras | ✅ | ⚠️ exacto | ✅ + fragmento (mismo criterio) |
| Resultados en vivo | ✅ POSAutocomplete | ❌ ninguno | ✅ el **mismo** POSAutocomplete |
| Ambigüedad → selección | ✅ grid + dropdown | ❌ error duro | ✅ lista con imagen/SKU/precio/stock |
| Añadir al documento | ✅ `onAddToCart` | ⚠️ store directo | ✅ **misma ruta** (stock + auditoría precio<costo) |
| Variantes (caja/docena) | ✅ PriceSelectorModal | ❌ unidad base silenciosa | ✅ **mismo** modal |
| Cantidades decimales (4dp) | ✅ editor de línea | ❌ solo ±1 entero | ✅ **mismo** POSCartItemEditModal |
| Modificar precio (gate ≥15%) | ✅ | ❌ | ✅ **mismo** modal + gate supervisor |
| Descuento por línea | ✅ | ❌ | ✅ mismo `updateItemDiscount` |
| Descuento global | ✅ POSCartDiscountModal | ❌ | ✅ **mismo** modal + gate |
| Subtotal / total / descuento | ✅ | ⚠️ solo total | ✅ subtotal, descuento y total |
| Validar existencias | ✅ | ✅ (store) | ✅ misma ruta + badge «Sin stock» |
| Filtro «Solo con stock» | ✅ | ❌ | ✅ **mismo estado compartido** |
| Medios de pago / monedas | ✅ | ✅ selector compacto | ✅ mismo store `selectedPayment` |
| Confirmar venta | ✅ `usePOSCheckout` | ✅ | ✅ idéntico (`create_sale_v2`) |
| Comprobante / vista de éxito | ✅ POSCartSuccessView | ❌ solo toasts | ✅ **misma** vista + térmico/PDF/WhatsApp |
| Fecha operativa | ✅ | ✅ | ✅ (ya compartida) |
| Catálogos grandes (>500) | ⚠️ límite cliente | ⚠️ igual | ✅ fallback RPC server-side |

## 4. Funcionalidades incorporadas o actualizadas en Express

1. **Autocompletado en vivo** reutilizando el **mismo** `POSAutocomplete` del carrito (nombre/SKU/barcode, navegación por teclado, badges de stock).
2. **Enter con el mismo criterio del carrito**: exacto SKU/barcode → `includes` compartido (`name || sku || barcode`) → si hay 1 coincidencia agrega; si hay varias muestra la lista de resultados (imagen, SKU, precio, stock) para elegir; si no hay nada local, consulta el servidor.
3. **Alta delegada** en `onAddToCart`/`handleAddItem` de POSView: pre-check de existencias (servicios exentos), auditoría precio<costo, toasts honestos de aceptación.
4. **Selector de variantes** (mismo `PriceSelectorModal`) — antes Express agregaba la unidad base silenciosamente.
5. **Editor de línea** (mismo `POSCartItemEditModal`): cantidad decimal 4dp, precio de operación con gate de supervisor ≥15%, descuento por línea, cambio de unidad — cero reglas duplicadas.
6. **Descuento global** (mismo `POSCartDiscountModal`) con su gate de supervisor.
7. **Vista de éxito compartida**: `POSCartSuccessView` + `usePOSCartExports` (PDF, WhatsApp, imagen, comprobante térmico) alimentada por `lastSale` del mismo `usePOSCheckout`.
8. **Fallback server-side** con el **mismo RPC autorizado** `get_products_for_pos(p_store_id, p_search_term)` cuando no hay coincidencias locales: cubre catálogos mayores al límite cliente y el código de barras canónico del catálogo maestro. Descarta respuestas obsoletas (contador de secuencia), limita a 24 resultados y nunca duplica (IDs únicos).
9. **Toggle «Solo con stock»** compartido con el carrito (un solo criterio de visibilidad vía `isPosProductVisible`).
10. **Info de línea en el carrito Express**: SKU, variante, descuento aplicado, badge «Sin stock».
11. **Fix de z-index** (z-9999 → z-45): los modales Radix reutilizados del carrito (z-50) ahora se ven sobre Express; `POSPortalModal` (z-10000) se mantiene encima.

## 5. Compatibilidad con el Catálogo Maestro

- El fallback server-side usa el RPC vigente que resuelve el **barcode canónico del maestro** para filas locales vinculadas de la misma organización (migración `20261028120000_cp_catalogo_busquedas_maestro.sql`), con verificación de tenant incluida en la propia función.
- La venta **siempre** usa la fila local de la tienda: `store.addItem` bloquea productos de otra tienda (FIX 2026-07-23) y `create_sale_v2` revalida server-side. Express no introduce ningún camino nuevo de lectura de precios/costos/stock.
- Puerto Padre no tiene productos vinculados al maestro hoy (verificado read-only: `master_product_id` NULL en 36/36); el Caso H quedó automatizado en tests con el criterio ILIKE exacto de la migración.
- No se permiten ventas «por identidad maestra» de otra tienda: el universo de búsqueda de Express es el mismo catálogo local de la tienda activa + el RPC filtrado por `p_store_id` con `has_store_access`.

## 6. Resultados de las pruebas comparativas (Casos A–J)

| Caso | Verificación | Resultado |
|---|---|---|
| **A. Producto existente** | SKU exacto, SKU case-insensitive, espacios, barcode, nombre completo, fragmento único, fragmento ambiguo, `SKU*` | ✅ 24/24 tests (`pos-express-parity.test.tsx`) |
| **B. Mismos resultados** | Matriz con catálogo real de Puerto Padre (13 queries) | ✅ Express ≡ Carrito: `PROD-0`→26=26 · `Cemento`→2=2 · `7509251382`→1=1 · `Cementó`→0=0 (paridad de acentos) |
| **C. Cantidades** | ± enteros + editor compartido con decimales 4dp | ✅ |
| **D. Precios y cálculos** | Mismos getters del store (`getSubtotal/getDiscountAmount/getTotal`); sin aritmética nueva | ✅ mismos importes por construcción |
| **E. Existencias** | Guard del store real (stock 0 rechazado) + badges | ✅ |
| **F. Pagos** | Mismo `selectedPayment` del store compartido + `startCheckout` | ✅ |
| **G. Confirmación** | Delega en `startCheckout` → `/api/pos/checkout` (`create_sale_v2`, idempotency_key, guard `isProcessingSale`) | ✅ |
| **H. Catálogo maestro** | Test automatizado del fallback RPC (barcode canónico) | ✅ |
| **I. Aislamiento** | `p_store_id` = tienda activa; cross-store bloqueado por el store del carrito | ✅ |
| **J. Rendimiento/actualización** | Descarte de búsquedas obsoletas (test), debounce del autocomplete compartido, lista ≤24, cero llamadas si hay match local | ✅ |

No se ejecutaron ventas reales en producción; las pruebas son unitarias/integración (vitest) sobre el catálogo real leído **read-only**.

## 7. Evidencia: los mismos productos aparecen en ambas vistas

Salida del script comparativo (`scripts/compare_search_puertopadre.js`, catálogo real, read-only):

```
QUERY                          EXPRESS ANTIGUA               EXPRESS NUEVA              CARRITO
PROD-036                       agrega                        agrega                     1
prod-036                       agrega                        agrega                     1
PROD-0                         error «no coincide…»          lista de 26 → agregar      26
7509251382000                  agrega                        agrega                     1
7509251382                     error «no coincide…»          agrega                     1
Cemento Tudela 25kg P-425      agrega                        agrega                     1
Tudela                         agrega                        agrega                     1
Cemento                        error «no coincide…»          lista de 2 → agregar       2
CEMENTO COLA                   agrega                        agrega                     1
  Escobas  (espacios)          agrega                        agrega                     1
Cementó (acento)               error                         error                      0
Artesa Baño                    error                         error                      0
INEXISTENTE-XYZ                error                         error                      0
```

**0 productos visibles en el carrito e invisibles en Express** (Express muestra además un subconjunto superset: agotados con badge cuando el filtro está desactivado).

## 8. TypeScript, ESLint, build y CI

| Control | Resultado |
|---|---|
| `tsc -p tsconfig.mision-express-parity.json` | ✅ 0 errores |
| `vitest run` (suite completa) | ✅ **337 archivos · 4.764 tests passed · 0 fallos** (66 skips preexistentes) |
| Tests de regresión POS (carrito, checkout, térmico, autocomplete) | ✅ 126/126 |
| `eslint` (3 archivos tocados) | ✅ 0 errores (28 avisos de estilo `<button>` crudo — convención vigente V2.12.25, preexistente) |
| `next build` (sandbox) | ⚠️ OOM del cgroup (4 GB). El repo ya documenta el caso (`PERF_AUDIT_BUILD=1` «su worker necesita >2GB y en contenedores pequeños agota la RAM»). **El CI de GitHub (ubuntu-latest, heap 4GB) ejecuta lint+test+build sobre este PR.** |
| Servidor de desarrollo (PM2) | ✅ `Ready on http://0.0.0.0:3000`, `GET /` → 200, sin errores de compilación |

## 9. Rama, commit y PR

- **Rama:** `fix/pos-express-parity-buscador-20261030` (desde `main` @ `89abb063e`)
- **Commit:** `b5affb664`
- **PR:** https://github.com/Nardian90/Costpro/pull/1527 (abierto, **sin fusionar**)
- PM2: proceso `costpro` en línea con el código actualizado (HMR de desarrollo).

## 10. Limitaciones y tareas pendientes

1. **Build de producción local**: requiere máquina ≥8 GB RAM o CI. La verificación local equivalente quedó cubierta por tsc + suite completa + dev server.
2. **Límite de 500 productos del RPC**: afecta al carrito también (preexistente, sistemático). Express lo compensa con el fallback server-side; la tarea de migrar la búsqueda del carrito a server-side queda recomendada (misma RPC ya paginable) para una misión propia, con pruebas de regresión del carrito.
3. **Escáner de cámara**: Express mantiene su vocación teclado/lector físico (el toggle Express está oculto en móvil por diseño). El lector USB funciona vía match exacto + Enter. Añadir cámara sería trivial reutilizando `CameraBarcodeScanner` si el negocio lo pide.
4. **Acentos/caracteres especiales**: paridad con el carrito (ILIKE server-side e `includes` client-side son sensibles a acentos). Una normalización unificada de acentos sería un cambio de criterio compartido que amerita misión aparte con regresión de ambas vistas.
5. **No fusionar** el PR ni desplegar a producción sin autorización expresa del propietario.

---

### Criterios de aceptación (§11 de la misión) — estado

1. Express encuentra lo que encuentra el carrito ✅ (§7) · 2. SKU/nombre/barcode ✅ · 3. Sin diferencias injustificadas ✅ · 4. Express actualizado a capacidades del carrito ✅ (§3/§4) · 5. Cantidades/cálculos/precios coherentes ✅ · 6. Pagos y monedas según reglas ✅ · 7. Confirmación segura sin duplicaciones ✅ · 8. Catálogo maestro correcto ✅ · 9. Aislamiento multitienda conservado ✅ · 10. Express sigue rápido y sencillo ✅ · 11. Pruebas pasan ✅ (4.764) · 12. Sin regresiones en carrito ni Ventas ✅ (suite completa + 126 tests POS).
