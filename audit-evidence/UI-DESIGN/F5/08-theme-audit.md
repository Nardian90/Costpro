# F5 — 08 THEME AUDIT (A12 — Dark/Light)

Fecha: 2026-09-29 · Método: navegación real en ambos temas (localStorage theme=dark/light
+ reload), capturas `before-light-*.png` y `before-desktop-*.png` (dark).

## Gramática única adaptada a ambos modos — CONFIRMADA

- `tokens.css` define la MISMA estructura semántica en light y dark
  (background/card/muted/border/primary/secondary/success/warning/danger/info/brand/chart/sidebar).
- Light: primarios oscurecidos con fixes A11y documentados en línea (#047857 success
  5.24:1, #b45309 warning 4.80:1, brand #128209 4.75:1) — herencia F2 saludable.
- Dark: #121212 base + #22c55e acción + #39ff14 marca (AAA) — Zed-style coherente.

## Hallazgos por modos

| Check | Dark | Light |
|---|---|---|
| Fondo/card/bordes diferenciables | ✓ (#121212/#1a1a1a/#2a2a2a) | ✓ (#f8fafc/#fff/#e2e8f0) |
| Muted text legible | ✓ #b4b4bc sobre #1e1e1e | ✓ #475569 sobre #f1f5f9 |
| Badges legibles | ✓ gramática /10 | ✓ (los bg-*-100 de la gramática legacy solo existen en light-ish renders — ver 05) |
| Colores que solo funcionan en un modo | `dark:bg-white/[0.03]` glass CyberShell (intencional) | landing.css gradientes light (BRAND) |
| Contraste P1 detectado | KnowledgeTab:276-281 `text-muted-foreground/50` a 7px = doble mutado ilegible en AMBOS modos → **B fix** | ídem |
| Overlays | backdrop-blur + border-border correctos | correctos |

## Notas

- El watermark decorativo COSTPRO (enhanced) aparece en AMBOS temas — no es un problema
  de modo sino de decoración (04-D).
- No se detectan tokens faltantes en light ni dark; no se diseñan dos sistemas: el fix
  F5-D se limita a clases locales, sin tocar tokens.css.
- Verificación post-implementación: re-captura light de superficies modificadas
  (dashboard/StoreDashboard, IPV, Ficha de Costo calculator).
