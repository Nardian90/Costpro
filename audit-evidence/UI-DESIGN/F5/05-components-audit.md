# F5 — 05 COMPONENTS AUDIT (A6 + A7 + A8)

Fecha: 2026-09-29

## A6 — BUTTONS

### Recuentos (views operacionales)

| Métrica | Valor |
|---|---|
| `<button` crudos | **1.066 / 205 archivos** |
| `<Button` (shadcn) | 439 / 116 archivos |
| Ratio crudo:shadcn | **2.4 : 1** |
| Crudos con `bg-` propio (bypass del sistema) | ≥210 / 95 archivos |
| Botones con voz cyber (`uppercase`|`font-black`|`tracking-widest`) sobre `<Button>` | **128 / 59 archivos** |
| ídem sobre `<button` crudo | 134 / 64 archivos |
| `buttonVariants` usado en views | 0 |

### Matriz de gramática (estado observado)

| Tipo | Sistema actual | Problema | Acción F5 |
|---|---|---|---|
| PRIMARY | `bg-primary` (mayoría) + `bg-green-600` ×4 + `bg-emerald-500/600` ×2 + híbridos `bg-success hover:bg-emerald-700` ×2 | 4 sistemas de relleno compiten | **B: consolidar los 8 botones a token** (verde paleta → default/primary) |
| SECONDARY | outline/ghost/secondary ✓ | — | — |
| DESTRUCTIVE | `bg-destructive`/`bg-red-500/600` — consistente en modals F3 ✓; Wallet CR/DR = semántica vista | — | DOC (exception) |
| ICON | `size-11`/`size="icon"`; **88/95 sin aria-label** | a11y P1 | C (lista completa en 09; corrección masiva = fuera de alcance quirúrgico) |
| MOBILE | MobileTabBar/StickyCart (F1) | NO TOCAR | EXCLUIDO |

`button.tsx` canónico ya es sobrio (F2). El ruido vive en className overrides locales.

## A7 — BADGES / STATUS

### Sistemas existentes

- `ui/badge.tsx`: variantes `default|secondary|destructive|outline` — **sin success/warning** (raíz del drift ad-hoc).
- `DocumentStatusBadge.tsx`: gramática canónica token `/10` + sizes + aria. ✓
- `FCStatusBadge.tsx` (pill/dot), `SyncStatusBadge.tsx` (sync/offline/conflict). ✓

### Tres gramáticas vivas compitiendo

1. **Canónica token** (`bg-success/10 text-success border-success/20`): **186 usos / 80 archivos** — dominante.
2. **Paleta tailwind-100** (`bg-emerald-100 text-emerald-700…`): 33 usos / 14 archivos.
3. **Emojis como status** (`💰 Pagado`, `⚖️ Parcial`, `🔴🟡🟢`): 181 emojis / 51 archivos en views.

### Duplicación demostrada (mismo status, renders distintos)

| Status | Ubicaciones | Diff |
|---|---|---|
| Publish success/failed/pending | TelegramConfigView:1028 ≡ WhatsAppAutoPublishSection:612 | ternario copy-paste idéntico con paleta -100 |
| Precio/Stock visible/oculto | TelegramConfigView:978 ≡ WhatsAppAutoPublishSection:557 | idem |
| REVERTIDO | ipv/MovementsView:138 (red-100) vs DocumentStatusBadge:48 (purple-500/10) | dos convenciones |
| Low stock | CatalogProductGrid:280 (amber-100) vs InventoryCardView:106 (warning/10) | dos convenciones |
| Pago | ReceptionsHistoryView:358 (emojis) vs PaymentHistoryRow (badges) | tres convenciones |

**Decisión F5**: la consolidación total exige un Badge semántico migrado (masivo) → NO-GO.
Entra en F5-D: alinear los 2 bloques copy-paste idénticos Telegram/WhatsApp a la gramática
canónica token (cambio local, demostrable). El resto → C. Añadir variantes success/warning
a badge.tsx → C (preparación para migración futura; hoy añadiría API sin consumidores).

## A8 — ICONOGRAPHY

- **Emojis como UI en views: 181 / 51 archivos** (WorkersView 21, ProductionOrdersView 21,
  WalletView mapa de categorías 13, HelpSectionRenderer 15). Casos: status (🔴🟢🟡), pagos
  (💵📱💳), notas (💡📌📖), media (📎). → C: retiro masivo = migración; documentar patrón
  y priorizar en fases futuras. (WalletView emoji-map de categorías = semántica visible del usuario.)
- Tamaños lucide: `w-4 h-4` ×1.040 (dominante ✓), `w-3 h-3` ×567, `w-5 h-5` ×363; mezclas
  en una misma pantalla (ipv/TransactionTable usa 3 tamaños de icon-button). → C.
- Icon-only sin aria-label: **88/95**. → C con inventario (no masivo en F5).
- Lucide dominante; sin librería paralela. ✓
