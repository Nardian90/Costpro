# Informe de Cambios: Limpieza de UI y Localización (v5.6.1)

| Archivo modificado | Texto original (Inglés) | Texto nuevo (Español) | Mejora visual aplicada |
| :--- | :--- | :--- | :--- |
| `src/lib/utils.ts` | N/A | Centralización de `formatCurrency` (ARS), `formatDate`, `formatTime` | Estandarización de formatos regionales. |
| `src/components/ui/button.tsx` | N/A | N/A | Ajuste de padding, `rounded-xl` y `uppercase` para manejar expansión de texto. |
| `src/app/globals.css` | N/A | N/A | Mejora de contraste en variables `--danger` y `--muted-foreground` (WCAG 4.5:1). |
| `useTerminalNavigation.ts` | Dashboard, Settings, etc. | Panel, Configuración, etc. | Traducción de navegación principal. |
| `DashboardView.tsx` | Gross Sales, Profit, etc. | Ventas Brutas, Utilidad, etc. | Localización de KPIs financieros. |
| `POSView.tsx` | Cart, Payment, etc. | Carrito, Pago, etc. | Traducción completa de la interfaz de venta. |
| `InventoryView.tsx` | Stock, Price, etc. | Existencias, Precio, etc. | Refactorización de tablas de inventario. |
| `HelpView.tsx` | Multi-Store, Enterprise, Clerk | Multi-Tienda, Empresarial, Cajero | Localización de diagramas y centro de ayuda. |
| `usePOSView.ts` | cash, transfer, card | Efectivo, Transferencia, Tarjeta | Mapeo de estados de transacción para el usuario. |
| `StoreModals.tsx` | Save changes, Create Store | Guardar Cambios, Crear Tienda | Traducción de acciones críticas. |

**Nota Final:** Se han auditado más de 20 archivos TSX para eliminar cadenas en inglés y estandarizar el uso de los nuevos utilitarios de formato regional (es-AR).
