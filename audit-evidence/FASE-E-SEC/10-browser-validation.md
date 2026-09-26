# FASE E-SEC — 10 BROWSER VALIDATION (GATE E13)

## Fecha
2026-09-26 · servidor dev PM2 :3000 con el código post-fix (route + UI).
Navegador real (agent-browser/Playwright), login REAL por formulario con el usuario
fixture admin, tienda sandbox ESEC TEST ESEC0926014201, turno de caja abierto por UI.

## Flujo validado (no solo capturas)
```text
Login real (modal de la landing) → hub INICIO → centro de comando → Vender (POS)
→ apertura de TURNO real (fondo 1000 → modal "SÍ, ABRIR TURNO")
→ venta normal: agregar Producto A ($500) → CONFIRMAR VENTA → "¡VENTA COMPLETADA!" $500.00
→ TABLA DE VENTA (SalesCatalog): qty 1 + tipo de descuento "$" fijo + valor 10
   → VALOR VENTA $490.00 (precio negociado visible)
   → botón Vender → modal "Confirmar Venta" — Total de la venta $490.00
   → SÍ, CONFIRMAR VENTA → toast "Venta completada — 1f849f7d…" (HTTP 200 en red)
   → conciliación DB: subtotal 490 / total 490 / price_at_sale 490 /
     audit item_discount_pct=2.0 / movimiento −1 (balance_after 14)
```

## Resoluciones (interacción + captura)
| Resolución | Interacción | Resultado | Captura (screenshots/) |
|---|---|---|---|
| 1440×900 | venta completa $500 + flujo completo 490 con confirmación | PASS | 10-esec-1440-pos-catalog.png, 10-esec-1440-checkout-500.png, 10-esec-1440-venta-completada-500.png, 10-esec-1440-tabla-precio-490.png, 10-esec-1440-modal-confirmar-490-listo.png |
| 1280×800 | editar precio → $490.00 | PASS | 10-esec-1280x800-tabla-precio-$490.00.png |
| 1024×768 | editar precio → $490.00 | PASS | 10-esec-1024x768-tabla-precio-$490.00.png |
| 390×844 (móvil) | editar precio → $490.00 (tabs móviles del módulo) | PASS | 10-esec-390x844-tabla-precio-490.png |
| 375×667 (móvil) | editar precio → $490.00 | PASS | 10-esec-375x667-tabla-precio-490.png |

## Observaciones registradas (no bloqueantes, fuera del alcance §14)
- **R-UX-DATE (preexistente, NO introducido por esta fase)**: en la ventana donde el
  huso del servidor (UTC) ya avanzó de día respecto a America/Havana, el date-picker
  del modal del catálogo puede quedar sin opción válida: la fecha de HOY la rechaza el
  cliente (compara medianoche contra el timestamp de la última operación) y HOY+1 la
  rechaza el server (máximo = hoy+1 día truncado). La venta se completa enviando la
  fecha VACÍA (el RPC usa NOW()). Es un tema de política de fechas, NO de precio;
  se deja documentado para una fase propia.
- Consola: sin errores funcionales (solo HMR/telemetría de dev). 2 entradas de error
  sin mensaje en el canal de página durante toda la sesión (no reproducibles a un
  fallo funcional; las capturas y flujos muestran éxito).
- En móvil el control del tipo de descuento es un icono sin texto accesible al
  snapshot ( Percent/DollarSign lucide); la operación es alcanzable y usable
  (demostrado), el etiquetado del icono es una mejora menor registrada.
