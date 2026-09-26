# FASE E-SEC-R — 08 DECISIONS (FASE 7 — matriz de decisión)

## Fecha / HEAD
2026-09-26 · dd1e6fb9. Clasificación por punto (FASE 7 del mandato):
`DECIDIDO / NO DECIDIDO / REQUIERE CAMBIO / NO REQUIERE CAMBIO`.

| # | Punto | ¿Existe decisión empresarial explícita? | ¿La implementación la ejecuta? | Clasificación | Base |
|---|---|---|---|---|---|
| 1 | **Umbral: por línea vs agregado** | NO (origen del 15% = fix de seguridad bd5fdc72; alcance jamás decidido; E-SEC lo declaró pendiente) | Server ejecuta AGREGADO (modelo B) coherente con la semántica del descuento global preexistente; UI aconseja POR LÍNEA | **NO DECIDIDO** · **NO REQUIERE CAMBIO** hoy (no hay decisión que implementar) · decisión requerida del responsable (ver `E-SEC-R-DECISION-REQUIRED.md`) | 03 |
| 2 | **Motivo de descuento** (`discount_reason`) | NO (el campo no existe; nadie lo pidió) | No existe nada que ejecutar | **NO DECIDIDO** · **NO REQUIERE CAMBIO** | 02, rg 0 hits |
| 3 | **Token de supervisor single-use** | PARCIAL: el diseño RC-1 (REM-INV-4A-R 03-rc1-design.md:119) documenta la reutilización en TTL como residual P3 ACEPTADO TÉCNICAMENTE; la política de negocio (¿1 uso? ¿N usos? ¿qué ventana?) no está decidida por el propietario | Server ejecuta el diseño RC-1 vigente (R1/R2/R3 = 200); UI es más estricta (1 venta/autorización) | **NO DECIDIDO** (negocio) · **NO REQUIERE CAMBIO** (implementación = diseño documentado, no desviación) | 04 |
| 4a | **Invariante: venta histórica independiente del catálogo actual** | SÍ por construcción (montos calculados y persistidos en la TX) | SÍ — garantizado (subtotal/total/price_at_sale/price_at_sale_cup/cost_at_sale) | **DECIDIDO (por construcción)** · **NO REQUIERE CAMBIO** — no refactorizar | 05 |
| 4b | **Snapshot `catalog_price_at_sale` por línea** | NO (E-SEC 07-E3 y 13 #4 lo dejaron pendiente) | No existe columna; el desvío agregado SÍ queda en audit_logs.metadata | **NO DECIDIDO** · **REQUIERE CAMBIO solo si el propietario decide querer reconstrucción por línea** (cambio mínimo descrito, no implementado) | 05 |
| 5 | **Fuente canónica del precio** | SÍ por construcción (DB scoped por tienda, variante-aware, bajo lock) | SÍ — UI/API/RPC/DB alineados; sin segunda fuente de verdad; stale = fail-closed | **DECIDIDO (por construcción)** · **NO REQUIERE CAMBIO** | 07 |
| 6 | **Redondeo / precisión** | NO como política comercial explícita; de facto: exacto server + tolerancia 0.01 + presentación 2dp | Sí, la de facto, consistentemente (prueba numérica 0 divergencia > tolerancia) | **NO DECIDIDO** (¿se permite 490.999999?) · **NO REQUIERE CAMBIO** | 06 |

## Resumen cuantitativo
- **DECIDIDO + NO REQUIERE CAMBIO**: 4a, 5 (invariantes estructurales ya garantizados)
- **NO DECIDIDO + NO REQUIERE CAMBIO**: 1, 2, 3, 6 (espacios de política sin decidir;
  el comportamiento vigente es coherente, documentado y fail-closed)
- **REQUIERE CAMBIO (condicionado a decisión)**: 4b únicamente si el propietario
  quiere snapshot por línea
- **Cambios implementados en esta fase: CERO** (regla FASE 8: sin decisión explícita,
  detenerse)

## Coherencia con el mandato
El mandato exige no inventar umbrales, motivos, permisos, duración de token, reglas
de redondeo ni modelo de descuento. Ninguna de las 5 decisiones pendientes de E-SEC
contaba con decisión empresarial explícita en el repo → **detención correcta**.
