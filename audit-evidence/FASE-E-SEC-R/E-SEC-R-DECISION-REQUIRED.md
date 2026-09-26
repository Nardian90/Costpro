# FASE E-SEC-R — E-SEC-R-DECISION-REQUIRED.md
## Decisiones que debe tomar el responsable funcional de CostPro

**Fecha**: 2026-09-26 · **Baseline**: dd1e6fb9 · **Emitida por**: fase E-SEC-R
(esta fase está PROHIBIDA de inventar política comercial — mandato §IMPORTANTE/§FASE 8).

Esta fase verificó que la implementación E-SEC es estable, coherente y fail-closed.
Lo que sigue NO puede decidirse con código: es política comercial. Mientras no haya
decisión, el sistema mantiene el comportamiento vigente documentado en 02/03/04/06.

---

### DECISIÓN 1 — Alcance del umbral de autorización (≥15%)
**Pregunta**: ¿el umbral se evalúa por LÍNEA (modelo A) o por AGREGADO de la venta
(modelo B, actual)?
**Contexto**: la UI ya aconseja por línea (bloquea ≥15% al teclearlo); el servidor
(evalúa como autoridad) aplica agregado. Un carrito {20% en una línea + 0% en otra}
pasa sin supervisor si entra por API directa (caso J de 03). No hay manera de que la
UI produzca ese carrito.
**Opciones**:
- (A) Por línea — alinea servidor con UI; cierra la dilución por API; más estricto.
- (B) Agregado (mantener) — coherente con el descuento global; más flexible.
**Recomendación técnica (separada del hecho)**: A — la UI ya lo practica y elimina
la asimetría actual; costo: ~10 líneas SQL en `create_sale_v2` + migración + regresión.
**Sin decisión**: permanece B (vigente, auditable, fail-closed).

### DECISIÓN 2 — Motivo obligatorio del descuento (`discount_reason`)
**Pregunta**: ¿exigir un motivo en desvíos ≥15% (o en todos)?
**Contexto**: no existe campo ni regla; nadie lo definió jamás.
**Sin decisión**: no se registra motivo (hoy).

### DECISIÓN 3 — Reutilización del token de supervisor
**Pregunta**: ¿el token sirve para 1 sola venta (single-use) o N ventas dentro del
TTL (modelo de caché de aprobación, actual server-side)?
**Contexto**: el token vive 300 s, está bound a (supervisor, operador, tienda) y el
servidor NO registra usos: una emisión puede respaldar N ventas de ese operador en
esa tienda (cualquier producto, cualquier % ≥15%) — R1/R2/R3 = 200. La UI lo consume
tras 1 venta. El diseño RC-1 documenta esto como residual P3 aceptado. La auditoría
registra `supervisor_id` por venta, pero no puede distinguir emisiones (jti no se
guarda).
**Opciones**: single-use (registrar/consumir jti) · N-usos con límite explícito ·
mantener caché 300 s (documentarlo como política).
**Recomendación técnica**: single-use vía registro de jti — cierre la brecha UI vs
server y hace la auditoría inequívoca; costo: 1 tabla o caché + check en el route.

### DECISIÓN 4 — Snapshot del precio de catálogo por línea
**Pregunta**: ¿conservar `catalog_price_at_sale` (y opcionalmente
`discount_value`/`discount_pct`/`authorized_by`) por línea, además de `price_at_sale`?
**Contexto**: hoy la venta histórica es 100% independiente del catálogo actual en lo
monetario (garantizado); el desvío agregado queda en audit_logs; pero el precio de
catálogo VIGENTE al momento de una línea concreta no es reconstruible si el producto
cambió de precio después (no hay historial de precios).
**Cambio mínimo si SÍ**: 1 columna + 2 anclas en `create_sale_v2` (05-SNAPSHOT-ANALYSIS).
**Sin decisión**: se mantiene el snapshot agregado por audit_logs (hoy).

### DECISIÓN 5 — Política de redondeo / precisión del precio
**Pregunta**: ¿se permite `price_at_sale` con precisión arbitraria (490.999999 — hoy
SÍ, A16/caso F) o se exige precisión de 2 decimales (¿y con qué redondeo: half-up,
banker's)?
**Contexto**: la matemática actual (exacto server + tolerancia 0.01 + presentación
2dp) es coherente y no puede divergir más allá de la tolerancia (prueba 06); la
cuestión es puramente comercial (¿precio final con sub-centavos es aceptable?).
**Sin decisión**: se mantiene el comportamiento actual (exacto, sin redondeo forzado).

---

## Cómo proceder
1. El responsable funcional responde las 5 decisiones (una línea por decisión basta).
2. Con decisiones explícitas, una fase de implementación mínima ejecuta SOLO lo
   decidido, con su regresión correspondiente.
3. Sin decisiones, el sistema permanece en el estado certificado por E-SEC:
   técnico completo, comercial condicionado.
