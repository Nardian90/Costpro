# FASE E-SEC-R — 03 THRESHOLD ANALYSIS (FASE 2 — umbral por línea vs agregado)

## Fecha / HEAD
2026-09-26 · dd1e6fb9 · READ-ONLY (sin cambios de código).

## 1. ¿Qué comportamiento existe HOY?

**Servidor (autoridad): MODELO B — AGREGADO.**
```sql
-- create_sale_v2 (20260926000001_esec_price_integrity.sql:237-241)
v_item_discount_pct := (v_item_discount_total / v_catalog_subtotal) * 100;  -- Σ desvío / Σ catálogo
IF v_effective_discount_pct >= 15 OR v_item_discount_pct >= 15 THEN ...      -- umbral sobre el TOTAL
```
El desvío de todas las líneas se suma y se divide entre el subtotal de catálogo de
todas las líneas: un porcentaje único por venta.

**Cliente (advisory): MODELO A — POR LÍNEA.**
```ts
// SalesCatalogCard.tsx:100-105 (y SalesCatalogTable.tsx:124)
const itemSubtotal = calcSubtotal(row) || subtotal;
const requiresAuth = checkDiscount({ type: row.discountType, value, referenceTotal: itemSubtotal });
```
Cada línea se evalúa individualmente ANTES de aplicarse; ≥15% abre SupervisorAuthModal
en el momento de la entrada. POSCartDiscountModal evalúa el descuento global contra
el total del carrito (`POSCartDiscountModal.tsx:42-47`).

**Consecuencia práctica (demostrada numéricamente, `esecr-rounding-proof.json` caso J):**
carrito {Producto 500→400 (20%), Producto 1000→1000 (0%)} → agregado 6.67% → el
servidor NO exige supervisor. Ese carrito es **inalcanzable por la UI** (la línea del
20% dispara el modal en el momento de teclearlo), pero **alcanzable por cualquier
cliente HTTP directo** — precisamente el vector que el gate E-SEC cubre.

## 2. ¿Qué asume la UI?
La UI asume POR LÍNEA (advisory). El servidor (autoridad final) aplica AGREGADO.
Asimetría vigente: la capa que decide es MÁS LENIENTE que la capa que aconseja.

## 3. ¿Qué documentan los requisitos existentes?
- Origen del umbral: commit `bd5fdc72` (V2.12.30, 2026-07-31) — fix de seguridad
  ("cerrar hueco de descuentos sin autorización de supervisor"). No es un documento
  comercial: define el 15% y el hook, no define el ALCANCE (línea vs agregado).
- `docs/` (auditorías, E2E plan, handoffs): ninguna mención de alcance de umbral.
- FASE E-SEC `03-business-rules.md:33-38` y `13-final-verdict.md:41-44` declaran
  explícitamente: **"¿El umbral por ítem se evalúa AGREGADO (actual) o POR LÍNEA?
  → DECISIÓN DE NEGOCIO PENDIENTE"**.

## 4. ¿Existe decisión empresarial previa en el repo/documentación?
**NO.** Búsqueda exhaustiva (`umbral.*(línea|ítem)`, `por línea`, `single-use`,
`decisión de negocio/comercial/funcional`) sobre `docs/`, `audit-evidence/`, commits:
ninguna decisión del responsable funcional sobre el alcance. El único documento que
discute el fenómeno es la evidencia de auditoría (que lo declara pendiente).

## 5. Consecuencias técnicas de cada modelo
| | MODELO A (por línea) | MODELO B (agregado, actual) |
|---|---|---|
| Consistencia UI/server | UI y server quedarían ALINEADOS | asimetría actual (server más laxo que UI) |
| Dilución por carrito mixto | imposible (cada línea se evalúa sola) | posible vía API directa (caso J) |
| Venta legítima con varias líneas pequeñas | idéntico al B (líneas <15%) | idéntico al A |
| Venta con 1 línea ≥15% autorizada + otras | ambas políticas exigen supervisor para esa línea (vía UI ya lo hace) | la autorización ya capturada cubre la venta |
| Cambio técnico | en `create_sale_v2`: evaluar `max(0, ref−price)/ref` POR LÍNEA (una línea ≥15% dispara el gate) — ~10 líneas SQL, migración nueva | sin cambio |
| Riesgo comercial | más estricto: un desvío puntual grande siempre exige autorización, aunque el total lo disimule | más flexible: preserva la semántica del descuento global existente |

## DECISIÓN DEL MANDATO E-SEC-R
> "Si NO existe decisión empresarial explícita: **NO IMPLEMENTAR CAMBIO**."

**No existe. → NO se implementa ningún cambio.** Se genera
`E-SEC-R-DECISION-REQUIRED.md` (en este directorio) con la decisión que debe tomar
el responsable funcional, incluyendo recomendación técnica razonada SEPARADA de los
hechos (recomendación: alinear servidor con el modelo A que la UI ya practica;
hechos: el B actual es coherente con la semántica del descuento global preexistente
y no constituye vulnerabilidad — es una elección de política).

## Interpretación
El umbral 15% ES política vigente (nadie discute el valor); lo NO decidido es su
ALCANCE. El comportamiento actual (B) es seguro en el eje integridad (nada se acepta
"por fe": todo desvío ≥15% agregado exige identidad verificable) y la UI ya filtra
el caso por línea en la práctica humana. La brecha restante solo afecta a clientes
no-UI y es una decisión de dureza comercial, no un hueco técnico introducido.
