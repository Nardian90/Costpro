# FASE E-SEC — 03 BUSINESS RULES (GATE E1 — modelo comercial REAL)

## Fecha / HEAD
2026-09-26 · 6ac52feb. Método: lectura de código + evidencia de fases previas.
**Ninguna política fue inventada.** Lo que sigue es lo que CostPro YA tenía.

## Reglas comerciales existentes (verificadas)

| Concepto | ¿Existe? | Dónde | Valor/Regla |
|---|---|---|---|
| Precio de catálogo | SÍ | `products.price`, `product_variants.price` | fuente de precio del POS |
| Precio por modalidad (variante) | SÍ | `PriceSelectorModal`, `product_variants.conversion_factor` | precio ≠ precio unitario es LEGÍTIMO |
| Descuento global de venta | SÍ | `p_discount_type/value`, `POSCartCheckoutPanel` | fixed/percentage, server-side |
| Descuento por ítem | SÍ | `updateItemDiscount` (cart.ts:809), `SalesCatalogCard/Table` | fixed/percentage por línea |
| Umbral de autorización | SÍ | `DISCOUNT_SUPERVISOR_THRESHOLD = 15` (useDiscountAuthorization.ts) y `>= 15` en create_sale_v2 | **política existente: ≥15% exige supervisor** |
| Roles de supervisor | SÍ | `has_store_role_as(supervisor, store, ['admin','manager'])` (RPC) | admin/manager de ESA tienda |
| Prueba de autorización | SÍ | `/api/auth/supervisor-check` → `supervisor_token` firmado bound supervisor+operador+tienda, TTL corto (REM-INV-4A-R RC-1) | sin token ⇒ 403 |
| Precio manual arbitrario | **NO** | no existe input de "precio libre" en la UI | la negociación se expresa como DESCUENTO |
| Motivo de descuento | NO | — | — |
| Límite de desvío por ítem (server) | **NO** (hallazgo R-SEC-1) | — | — |
| Snapshot de precio catálogo en la línea | NO | — | — |
| `precio_empresa` (mayorista) | existe en productos | NO participa en el checkout POS | fuera de alcance |

## Conclusión E1 (lo que la corrección debe respetar)
1. **La capacidad 500→490 es una regla del sistema real** (descuento por ítem <15% sin
   autorización; ≥15% con supervisor admin/manager). Prohibida la solución
   `price_at_sale !== product.price → reject` (rompería 500→490 Y las variantes).
2. El **umbral 15% ya es política vigente** — extenderlo al desvío por ítem NO inventa
   una política nueva; es la MISMA política aplicada al mismo fenómeno económico
   (una rebaja) por otro canal.
3. La sobrecarga (precio > catálogo) no está regulada hoy → se mantiene permitida y
   pasa a quedar registrada en la auditoría (no es vector de pérdida).
4. **DECISIÓN DE NEGOCIO PENDIENTE (no decidida por el agente):**
   - ¿El umbral por ítem se evalúa AGREGADO (actual, igual que el descuento global) o
     POR LÍNEA (más estricto)? Hoy: agregado, consistente con la semántica existente.
   - ¿Se requiere `discount_reason` obligatorio en desvíos ≥15%?
   - ¿El token de supervisor debe ser de un solo uso (hoy: reutilizable dentro de su
     TTL para el mismo binding supervisor+operador+tienda — diseño RC-1 preexistente)?
