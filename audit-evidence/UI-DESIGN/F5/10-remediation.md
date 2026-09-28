# F5 — 10 REMEDIATION BLUEPRINT (F5-C) + NO-GO CHECK (GATE F5-C.1)

## GATE F5-C.1 — verificación de no-go ANTES de implementar

| Prohibición | ¿El plan la requiere? |
|---|---|
| Migración masiva de clases | NO — 11 archivos, ~40 ediciones puntuales |
| Reemplazo global de colores/tamaños | NO — solo 8 botones drift, 2 ternarios, 5 líneas 7px, 7 fragmentos corruptos |
| Reconstrucción de botones / nuevo DS paralelo | NO — button.tsx intacto; se elimina override en consumidores |
| Nuevo componente modal/librería iconos/migración Tailwind | NO |
| Refactor arquitectónico / rediseño navegación | NO — navegación F4 intacta |
| Cambios backend/seguridad/CI | NO — solo .tsx/.css de UI |

→ **GO para F5-D quirúrgico.** Los ítems que exigirían lo prohibido quedan en C/D/E (matriz 09).

## Plan de implementación (11 archivos + 1 css)

| Paso | Hallazgo | Archivos | Cambio | Por qué es seguro |
|---|---|---|---|---|
| 1 | F5-001a–e | CostSheetCalculator.tsx, CostSheetSidePanel.tsx | restaurar 7 utilidades dark: rotas; retirar glow neon del display | restaurar intención ya escrita; cero layout shift (color-only) |
| 2 | F5-002 | ui/Building3D.tsx, ui/PWAInstallModal.tsx | ELIMINAR archivos | 0 imports verificados ×2 (rg global) |
| 3 | F5-003 | ui/CostProLoader.tsx | eliminar 7 console.log [DIAG] | logs puros, sin efecto UI |
| 4 | F5-004 | Pick3OnboardingWizard.tsx, TemplateEditor.tsx | `hover:bg-emerald-700` → `hover:bg-success/90` | color-only, misma familia --success |
| 5 | F5-005 | WhatsAppDashboardView, WhatsAppConfigView, WhatsAppAutoPublishSection, UpgradeModal, ExchangeIntelligenceView | quitar overrides `bg-green-600 hover:bg-green-700` / `bg-emerald-600 hover:bg-emerald-700` de CTAs de acción (≤6 elementos) | los `<Button>` caen a su variant default (bg-primary token); tamaño/texto intactos |
| 6 | F5-006 | StoreDashboardView, MultiStoreDashboardView, StoreKPICard | CTAs: gradiente→`bg-primary`; voz: `font-black uppercase tracking-widest`→`font-medium` (sin cambiar texto fuente ni alturas) | color/weight-only; altura y estructura intactas |
| 7 | F5-007 | IPVView:404 | quitar `bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent` | el h1 hereda color sólido; tamaño intacto |
| 8 | F5-008 | KnowledgeTab.tsx | `text-[7px]`→`text-[10px]`; `text-muted-foreground/50`→`text-muted-foreground`; th `font-black`→`font-semibold` | legibilidad; crecimiento de fila ~2px aceptable en tabla health |
| 9 | F5-009 | TelegramConfigView, WhatsAppAutoPublishSection | ternarios de status: `bg-emerald-100 text-emerald-700…` → `bg-success/10 text-success…` (y red→destructive, amber→warning) | mismas clases canónicas que ya usa DocumentStatusBadge en toda la app |
| 10 | F5-010 | CyberShell.tsx + modes.css | añadir `perf-hide-decor` a dots esquina/sweep/borde cónico + regla `.mode-performance .perf-hide-decor { display:none }` | reutiliza convención existente (Header perf-hide-gradient); default enhanced NO cambia |

## Preservación F1–F4 (compromiso explícito)

- **F1**: MobileTabBar, StickyCart, drawer, cookie consent, safe-areas, touch targets — SIN TOCAR.
- **F2**: tokens.css SIN TOCAR; button.tsx SIN TOCAR; PageHeader SIN TOCAR; theme system SIN TOCAR.
- **F3**: StateRenderer, BaseModal, focus trap, Escape, toaster — SIN TOCAR.
- **F4**: navigation-definition/map SIN TOCAR; nomenclatura/breadcrumbs SIN TOCAR; sin reintroducir
  "Terminal de Venta" ni breadcrumbs fantasma.

## Categorías C/D/E (documentadas, no implementadas)

- **C**: migraciones masivas de color/tipografía/radius/shadow/estado (F5-014…020), badge variants,
  aria-labels masivos, ViewLoadingSplash sober.
- **D**: CyberShell en ops (F5-011), watermark ParticleBackground (F5-012), default de modo + toggle (F5-013).
- **E**: ci.yml corrupto (F5-022) — pertenece a CI, no a F5.
