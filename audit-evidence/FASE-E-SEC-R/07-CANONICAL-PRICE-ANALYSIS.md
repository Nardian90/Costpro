# FASE E-SEC-R — 07 CANONICAL PRICE ANALYSIS (FASE 5 — fuente canónica del precio)

## Fecha / HEAD
2026-09-26 · dd1e6fb9 · READ-ONLY (trazabilidad completa UI→cart→API→RPC→DB).

## Cadena por tipo de precio

### Producto base (sin variante)
```text
UI      useSalesCatalog.ts:160        price: product.price || 0        (catálogo cargado)
        useSalesCatalog.ts:94-101     resync si el producto cambia (price/cost)
cart    CartItem.price = product.price; base_price_cup como referencia CUP inmutable (cart.ts:539-543)
API     usePOSCheckout.ts:199         price: effectiveUnitPrice(i.price, ...)  → price_at_sale
RPC     20260926000001:122-125        SELECT stock_current, cost_average, price
                                      FROM products WHERE id=v_pid AND store_id=p_store_id FOR UPDATE
DB      products.price (fila scoped por tienda)
```
**Misma fuente**: el servidor lee EL MISMO `products.price` (bajo lock, en la TX) que
la UI cargó del catálogo. Si el catálogo cambió entre la carga de la UI y el checkout,
el servidor usa el precio VIGENTE y evalúa el desvío contra él; un total viejo falla
`ERR_TOTAL_MISMATCH` → fail-closed. La UI además marca `priceDiffersFromCatalog`.

### Variante (modalidad)
```text
UI      useSalesCatalog.ts:236-244    handleSelectVariant: price = variant.price
API     ídem (price viaja como price_at_sale del ítem con variant_id)
RPC     20260926000001:179-182        v_reference_price := product_variants.price (COALESCE a products.price)
DB      product_variants.price
```
**Alineado**: el precio por modalidad es legítimo y NO computa como desvío — el
servidor compara contra el precio de LA VARIANTE seleccionada, el mismo que la UI
mostró/seleccionó (`PriceSelectorModal` → `handleSelectVariant`).

### Precio por tienda
`products` es por-tienda (fila con `store_id`); el RPC filtra `AND store_id = p_store_id`
y verifica pertenencia (`ERR_STORE_MISMATCH` si el producto es de otra tienda —
E-SEC 06: aislamiento intacto). No existe una segunda tabla de precios por tienda.

### Promoción
No participa en el checkout POS (0 hits de "promoci*" en pos/ y api/pos/). No hay
segunda fuente de verdad promocional que diverja.

### Moneda
`price_at_sale` (moneda de la venta) + `price_at_sale_cup = price × sale_exchange_rate`
server-side (RPC :366); zelle exige tasa > 1 y moneda USD/EUR/MLC (RPC :396-404).
El descuento global se recalcula sobre el subtotal en la moneda de la venta.

### precio_empresa (mayorista)
Existe en `products` pero NO participa en el checkout POS (E-SEC 03:22) — sin riesgo
de divergencia en este flujo.

## Pregunta crítica del mandato
> ¿Está el servidor comparando el precio vendido contra exactamente el mismo precio
> comercial que el usuario ve/selecciona en el contexto de esa tienda y producto?

**SÍ**, en todos los casos trazados (base y variante): la referencia server-side se
resuelve de las mismas filas que alimentan la UI, en el instante de la transacción y
bajo `FOR UPDATE`. **No existe una segunda fuente de verdad** y la fase no introduce
ninguna. Único matiz temporal: entre carga de UI y checkout el catálogo puede cambiar;
el servidor resuelve SIEMPRE el vigente (la UI puede quedar stale — el servidor no),
y el desvío/total se valida contra el vigente con rechazo fail-closed.

## Divergencias buscadas y no encontradas
| Punto | Veredicto |
|---|---|
| UI vs cart (precio crudo vs efectivo) | resuelto por E-SEC (`effectiveUnitPrice`) — el payload lleva el precio REALMENTE cobrado |
| cart vs API (total) | coherente por construcción (mismo `getExpectedTotalCup`) + tolerancia 0.01 |
| API vs RPC (mapeo) | `price` → `price_at_sale` 1:1 (route :138-161) |
| RPC vs DB (referencia) | lectura bajo lock de las filas canónicas |
| variante vs base | resuelto server-side (:179-185); la variante es la referencia correcta |
| tienda | scoped por `store_id` + `has_store_access_as` |
| Stale price UI | fail-closed (ERR_TOTAL_MISMATCH) o desvío evaluado contra el precio vigente |

## Conclusión
**NO REQUIERE CAMBIO.** La fuente canónica es única (DB en la TX, scoped por tienda,
variante-aware) y coincide con lo que el usuario ve. No se documenta defecto alguno
de fuente de precio en esta fase; cualquier refactor estaría prohibido por el mandato.
