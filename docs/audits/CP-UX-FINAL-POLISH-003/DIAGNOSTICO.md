# CP-UX-FINAL-POLISH-003 — DIAGNÓSTICO
## Auditoría final de calidad documental, diálogos globales y consistencia visual
Fecha: 2026-11-25 · Rama: `fix/cp-ux-final-polish-20261125` · Base: main `d2c97db`

---

## 1. Comparar Productos — indicadores ejecutivos del PDF (presentación)

**Archivos implicados**
- `src/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf.ts` (solo layout)
- `src/lib/product-comparison/informe.ts` (contenido; L597-614 construye los 8 indicadores)

**Diagnóstico**: los indicadores se dibujan como líneas consecutivas de 5,2 mm con
separador fino entre cada una (portada, L595-619): etiqueta a la izquierda (8,8 pt) y
valor a la derecha (bold). Ocho líneas seguidas sin jerarquía interna ni agrupación
semántica → percepción de "texto pegado". Ingresos y variación (los datos más
importantes) reciben exactamente el mismo tratamiento que los contadores de inventario.

**Plan editorial (sin tocar cálculos, períodos ni valores)**
1. Bloque destacado para **Ingresos** y **Variación vs. tramo comparable**: dos tarjetas
   lado a lado con etiqueta pequeña en versalitas, valor grande (13 pt bold) y color
   condicional de la variación (rojo negativo / verde positivo).
2. Grupo **Desempeño comercial**: crecimiento relevante, contracción y sin ventas en el
   tramo → cuadrícula de tres cifras grandes con etiqueta inferior.
3. Grupo **Disponibilidad e inventario**: agotados con antecedente y cobertura
   insuficiente → cuadrícula de dos.
4. **Líder del período**: banda única en acento institucional con nombre y participación,
   tratamiento diferenciado sin desproporción.
5. Aire: 5 mm entre grupos, 3 mm entre tarjetas, sin reglas entre indicadores.
6. Inspección posterior del documento completo (portada, resumen, tablas, gráfico,
   matriz, anexos I-IV, encabezados/pies) verificando espaciado consistente y la regla
   "cada anexo comienza en página nueva" (ya implementada con `addPage()` real).

Metadato nuevo en `InformeIndicador`: campo **opcional** `grupo?: 'comercial' | 'inventario' | 'lider'`
y `destacado?: boolean` — clasificación presentacional; no altera valores, etiquetas ni cálculos.

---

## 2. Auditoría global de diálogos nativos del navegador

Búsqueda sistemática `(window.)?(alert|confirm|prompt)\(` en todo `src/`
(más revisión de wrappers). Se excluyen: comentarios, tests que **describen** el
problema, `deferredPrompt.prompt()` de `usePWA.ts` (API de instalación PWA gestionada
por el navegador — fuera del alcance según la misión) y `FCPreviewModal.tsx:509`
(comentario de pendiente).

### 2.1 Inventario de llamadas nativas FUNCIONALES (27 archivos, ~37 call-sites)

| # | Archivo | Línea(s) | Tipo | Funcionalidad afectada | Riesgo | Solución |
|---|---------|----------|------|------------------------|--------|----------|
| 1 | `hooks/ui/useStoreSwitcher.ts` | 42 | confirm | Cambio de tienda con datos sin guardar | Pérdida de datos si el navegador lo bloquea | `useDialogs().confirm` warning |
| 2 | `components/modals/BulkPriceIncrementModal.tsx` | 230 | confirm | Incremento masivo de precios | Operación masiva sin confirmación estilada | confirm default |
| 3 | `components/modals/CreateProductModal.tsx` | 236 | confirm | Creación de producto | — | confirm default |
| 4 | `components/ui/OfflineConflictResolver.tsx` | 82 | confirm | Descartar operación offline conflictiva | Destructivo | confirm destructive |
| 5 | `views/catalog/CreateMasterProductModal.tsx` | 184 | confirm | Promoción a producto maestro | — | confirm default |
| 6 | `views/ipv/ResetMatchingModal.tsx` | 39, 63 | confirm ×2 | Reset de matching / purga total de conciliación | Destructivo grave | confirm destructive ×2 |
| 7 | `views/ipv/CustomerCatalog.tsx` | 153 | confirm | Eliminar cliente | Destructivo | confirm destructive |
| 8 | `views/ipv/IngestionErrorsTable.tsx` | 29, 88 | confirm ×2 | Eliminar error(es) de ingesta | Destructivo | confirm destructive |
| 9 | `views/ipv/ManualReconciliationView.tsx` | 113 | confirm | Revertir línea de conciliación | Financiero | confirm destructive |
| 10 | `views/ipv/MovementsView.tsx` | 37 | confirm | Revertir movimiento con compensación | Inventario/financiero | confirm destructive |
| 11 | `views/ipv/CatalogTable.tsx` | 357 | prompt | Ajuste porcentual masivo (valor numérico) | Entrada sin validación, sin tema | PromptDialog numérico |
| 12 | `views/ipv/CatalogTable.tsx` | 878 | confirm | Acción sobre catálogo | — | confirm |
| 13 | `views/ipv/mvt/TemplateManager.tsx` | 55 | confirm | Eliminar plantilla | Destructivo | confirm destructive |
| 14 | `views/ipv/TransactionBreakdown.tsx` | 102 | confirm | Revertir registro | Financiero | confirm destructive |
| 15 | `views/classifier/ClientesProveedoresView.tsx` | 376, 458 | confirm ×2 | Promover a maestro / vincular registro | Operación organizacional | confirm warning |
| 16 | `views/whatsapp/WhatsAppInvitationsView.tsx` | 125 | confirm | Cancelar invitación | — | confirm destructive |
| 17 | `views/users/useUsersView.ts` | 376 | confirm | Reiniciar contraseña (envía correo) | Operación sensible | confirm warning |
| 18 | `views/receptions/ReceptionDetailsModal.tsx` | 705 | confirm | Eliminar ítem de recepción | Destructivo | confirm destructive |
| 19 | `views/receptions/ReceptionDetailsModal.tsx` | 1368-1369 | confirm + prompt | Anular pago con motivo opcional | Financiero | confirm destructive + PromptDialog opcional |
| 20 | `views/production_orders/ProductionOrdersView.tsx` | 754 | confirm | Eliminar material de la orden | Destructivo | confirm destructive |
| 21 | `views/production_orders/ProductionOrdersView.tsx` | 768 | prompt | Motivo de anulación | Texto libre | PromptDialog (default "Anulación manual") |
| 22 | `views/received_services/ReceivedServicesView.tsx` | 345 | confirm | Anular servicio (elimina distribuciones) | Destructivo | confirm destructive |
| 23 | `views/received_services/ReceivedServicesView.tsx` | 1107-1108 | confirm + prompt | Anular pago con motivo opcional | Financiero | confirm destructive + PromptDialog |
| 24 | `views/received_services/ReceivedServicesView.tsx` | 1595 | confirm | **Guardar borrador de servicio** | Flujo misión §3.1 | confirm default |
| 25 | `views/received_services/ReceivedServicesView.tsx` | 1627 | confirm | **Finalizar/confirmar servicio** | Flujo misión §3.1 | confirm default |
| 26 | `views/received_services/ServiceTypesManagerModal.tsx` | 155 | confirm | Desactivar tipo de servicio con consecuencias | — | confirm warning |
| 27 | `views/accounts_payable/AccountsPayableView.tsx` | 93 | alert | Error al exportar | Feedback roto en Dark | `useDialogs().alert` error |
| 28 | `views/accounts_payable/AccountsPayableView.tsx` | 155 | alert | Selección inválida para liquidar | Feedback | alert warning |
| 29 | `views/accounts_payable/LiquidationModal.tsx` | 72 | confirm | Liquidar N documentos (financiero) | Operación financiera crítica | confirm default con detalle |
| 30 | `views/accounts_payable/PaymentHistoryRow.tsx` | 93-94 | confirm + prompt | Anular pago con motivo | Financiero | confirm destructive + PromptDialog |
| 31 | `views/accounts_payable/PaymentHistoryRow.tsx` | 103, 107 | alert ×2 | Resultado/error de anulación | Feedback | alert success/error |
| 32 | `views/telegram/TelegramInvitationsView.tsx` | 67 | prompt | Telegram User ID | Entrada | PromptDialog |
| 33 | `views/rss/RSSManagementView.tsx` | 65 | confirm | Eliminar fuente RSS | Destructivo | confirm destructive |
| 34 | `views/organizations/CatalogGovernanceSection.tsx` | 112 | confirm | Gobernanza de catálogo | — | confirm warning |
| 35 | `views/organizations/OrganizationsView.tsx` | 109 | confirm | Operación de organización | — | confirm warning |

**Casos conservados deliberadamente**: `usePWA.ts:48` (`deferredPrompt.prompt()` —
mecanismo del navegador), `e2e/*` y `scripts/*` (código de prueba), comentarios
informativos que ya documentan migraciones previas (p. ej. `useUsersView.ts:248`,
`ReceptionsHistoryView.tsx:610`, `InventoryAdjustmentsView.tsx:447`, `CostSheetTemplateExplorer.tsx:156`).

### 2.2 Infraestructura existente (a reutilizar — decisión de la misión §2.2)

| Pieza | Ruta | Estado |
|-------|------|--------|
| Radix Dialog (shadcn) | `src/components/ui/dialog.tsx` (z-50) | Vivo, base de todo |
| `BaseModal` | `src/components/ui/BaseModal.tsx` — focus trap (`useFocusTrap`), header/footer sticky, mobile-first, 88 consumidores | Vivo — **base del sistema unificado** |
| `DestructiveConfirmModal` | `src/components/ui/DestructiveConfirmModal.tsx` — type-to-confirm para destructivas graves | Vivo (7 archivos) — se conserva |
| `ConfirmDialog` genérico | `views/cost_sheet/ConfirmDialog.tsx` — variantes default/destructive/warning, íconos, min-h-44 | Vivo pero LOCAL a cost_sheet → se **promueve** a `components/ui/dialogs/` |
| Toast (sonner) | `src/components/ui/sonner.tsx` montado en `layout.tsx:326` (`top-center`, richColors, tematizado) | Vivo, 251 archivos — **patrón D de la misión ya cubierto** |
| Stack legacy muerto | `ui/toast.tsx`, `ui/toaster.tsx`, `hooks/ui/useToast.ts`, `hooks/use-toast.ts` | Sin consumidores en layouts — fuera de alcance (no se toca para no inflar el diff) |

**Faltantes**: no existe hook/servicio central imperativo ni AlertDialog informativo ni
PromptDialog. → Se crea `src/components/ui/dialogs/`:

- `types.ts` — `ConfirmOptions`, `AlertOptions`, `PromptOptions`.
- `ConfirmDialog.tsx` — confirmación genérica (variantes default/destructive/warning,
  ícono, `role="alertdialog"`, Enter confirma, foco gestionado, bloqueo de doble
  confirmación vía `isConfirming` y soporte `onConfirm` asíncrono).
- `InfoDialog.tsx` — mensaje importante + un botón (variantes info/success/warning/error).
- `PromptDialog.tsx` — formulario integrado con input validable (numérico/texto/multilínea,
  valor opcional, autoFocus, Enter confirma).
- `DialogProvider.tsx` + `useDialogs()` — API imperativa `confirm/alert/prompt` que
  devuelve promesas, cola FIFO (un diálogo a la vez, sin apilamiento), montado en
  `src/app/layout.tsx` junto al Toaster.
- `cost_sheet/ConfirmDialog.tsx` pasa a reexportar el compartido (compatibilidad con sus 6 importadores).

### 2.3 Reglas visuales aplicadas
Todos los diálogos usan tokens semánticos (`bg-card`, `text-foreground`, `text-muted-foreground`,
`bg-destructive`, `text-warning`, `ring-ring`...), heredan Light/Dark de `next-themes`
(clase en `<html>`), responsive mobile-first de BaseModal (`w-[calc(100vw-1rem)]`,
`max-h-[90vh]`, botones `min-h-[44px]`), z-50 como el resto de la aplicación.

---

## 3. Servicios Recibidos — diagnóstico específico

### 3.1 Confirmación nativa al finalizar
- `ReceivedServicesView.tsx:1627` — `window.confirm` en `handleSubmit` (confirmar
  servicio / confirmar y liquidar) y `:1595` en `handleSaveDraft`. El éxito/fracaso real
  ya se comunica con toasts sonner DESPUÉS de la respuesta del servidor (correcto); el
  problema es solo el gate nativo previo.
- Doble envío ya protegido (`submitting` + `disabled` + spinner); se conserva y se
  verificación adicional en el diálogo (botones deshabilitados mientras resuelve).
- También se migran al sistema unificado las anulaciones del mismo módulo (345, 1107-1108).

### 3.2 Botón «Guardar borrador» roto en Dark — causa raíz
`ReceivedServicesView.tsx:1959-1969`: `variant="secondary"` + overrides ámbar.

Cadena real del defecto (componente compartido, no CSS de pantalla):
1. `variant="secondary"` → `bg-secondary text-secondary-foreground` (`button.tsx:21-22`).
2. Tailwind v4 sin `@config` → `tailwind.config.ts` INERTO; manda el `@theme inline` de
   `globals.css`, que en la línea **87** define `--color-secondary: #4cd7f6` (cian FIJO,
   idéntico en Light y Dark, incompatible con `--secondary` semántico de `tokens.css`
   [#475569 light / #71717a dark]).
3. Resultado: cian de fondo + `text-amber-600`/`dark:text-amber-400` encima (contraste
   roto), `hover:bg-amber-500/10`, y `border-amber-500/40` sin ancho de borde (no pinta).

**Corrección (doble nivel)**
- **Token compartido**: `globals.css:87` → `--color-secondary: var(--secondary)`.
  Consumidores auditados: `button.tsx` (variante secondary), `badge.tsx`, `sheet.tsx:75`,
  `InventoryKPIs.tsx:139-140` (tarjeta neutra "Precio Promedio" — mejora), `HelpContent.tsx`
  (fondos sutiles — mejora), `toast.tsx` (legado sin montar). Ninguno depende del cian
  como identidad. `--color-on-secondary/-container` sin consumidores.
- **Botón**: jerarquía correcta para una acción de borrador — `variant="outline"` con
  acento de advertencia usando tokens: `border-warning/50 text-warning hover:bg-warning/10
  hover:border-warning`. Light: ámbar #B45309 sobre claro (≥4.5:1); Dark: #FBBF24 sobre
  oscuro (≈10:1). Botones de la misma familia (Cancelar outline, Confirmar default) intactos.

---

## 4. Estándar global y pruebas
- Los flujos migrados deben mantener sus mensajes literales (solo cambia el vehículo).
- Tests unitarios que espiaban `window.confirm` se actualizan para interaccionar con el
  diálogo propio (clic en Confirmar / Cancelar) envolviendo el render en `DialogProvider`.
- E2E con `page.on('dialog')`: se ajustan los recorridos que esperaban diálogos nativos.
- Evidencia visual Light/Dark de Servicios Recibidos y del PDF antes/después.
