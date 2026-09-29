# F6 — 12 VISUAL EVIDENCE (F6-R)

Set representativo (18 capturas PNG en `audit-evidence/UI-DESIGN/F6/shots/`).
Sin volumen artificial: 1–2 por superficie clave.

## Desktop 1280×800

| Archivo | Superficie | Tema |
|---|---|---|
| f6-j1-landing-1280.png | Landing pública | dark |
| f6-j1-login-modal.png | Modal login | dark |
| f6-j1-app-dashboard-1280.png | App / Inicio (shell+sidebar) | dark |
| f6-j2-pos-1280.png | POS Vender (toolbar+grilla) | dark |
| f6-j2-cart-open.png | Carrito abierto con ítem | dark |
| f6-j2-checkout-modal.png | Modal Cobro (PAGO $350.00) | dark |
| f6-j3-ventas-hub.png | Hub Ventas | dark |
| f6-j3-historial-ventas.png | Historial de Ventas | dark |
| f6-j3-caja.png | Caja | dark |
| f6-j4-inventario.png | Inventario (tabs) | dark |
| f6-j4-catalog-filtered-empty.png | Catálogo filtered-empty | dark |
| f6-j4-conteo.png | Venta por Conteo | dark |
| f6-j5-ficha-costo.png | Fichas de Costo | dark |
| f6-j6-gestion-tiendas.png | Gestión de Tiendas hub | dark |
| f6-final-dashboard-dark-1280.png | Dashboard final (estado certificado) | dark |

## Mobile 390×844

| Archivo | Superficie | Tema |
|---|---|---|
| f6-mobile-390-dashboard.png | Dashboard móvil (tab bar) | dark |
| f6-light-390-inventario.png | Inventario móvil | light |

## Light 1280×800

| Archivo | Superficie |
|---|---|
| f6-light-1280-dashboard.png | Inicio en light |
| f6-light-1280-ajustes.png | Ajustes en light |

## Notas de método

* Capturas via `agent-browser screenshot` sobre render real (dev server HTTP 200).
* Los AFTER del flujo de carrito/checkout documentan estado interactivo (1 producto, $350.00).
* La captura de Ajustes en light fue retomada tras compile del view (primera intenta
  cayó en fallback de landing dev-mode; descartada y re-capturada con H1 "Ajustes").
