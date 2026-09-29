# F5 — 13 FINAL VERDICT

Fecha: 2026-09-29 · Rama `audit/f5-visual-sobriety` · Base: origin/main `2c7f9564`
· Fases: F5-A (auditoría A1–A12) → F5-B (matriz 09) → F5-C (blueprint 10 + gate NO-GO) →
F5-D (9 fixes quirúrgicos) → F5-E/E.1 (validación estática + regresión en vivo) →
F5-F (post-audit cuantitativo) → este veredicto.

## Veredicto

# F5 — CERTIFIED

## Fundamento objetivo

| Gate | Criterio | Resultado |
|---|---|---|
| GATE 0 | rama desde origin/main real (2c7f9564); F3+F4 ancestros; recovery tag local+origin; sin reset/clean/rebase/force | ✓ CUMPLE (00-baseline) |
| GATE 0.3 | contexto leído antes de tocar UI (tokens, button, PageHeader, StateRenderer, BaseModal, shells, modos, evidencias F1–F4/PRE-F5) | ✓ CUMPLE |
| F5-A | auditoría read-only A1–A12 con recuentos exactos y clasificación | ✓ (01–08) |
| F5-B | debt matrix ID/FILE/LINE/SEV/ACCIÓN (22 ítems, P0=0) | ✓ (09) |
| F5-C.1 | blueprint que NO requiera lo prohibido (migraciones masivas, rediseños, backend) | ✓ (10) |
| F5-D | 9 fixes implementados, +58/−58 en 17 archivos + 2 muertos eliminados; alcance exacto del blueprint; F1–F4 preservados | ✓ (12) |
| F5-E | tsc 0 · eslint 0 · vitest 2387/0 · sin regresiones atribuibles | ✓ (11) |
| F5-E.1 | regresión live: 10 superficies desktop 1280, overflow 0px ×15 mobile, dark+light, F1 completa (tab bar 6 botones, touch ≥48px, drawer+Escape, StickyCart, SpeedDial, toolbar POS) | ✓ (11) |
| F5-F | post-audit cuantitativo BEFORE/AFTER/NET con clasificación FIXED/INTENTIONAL/LEGACY/REMAINING/RETRACTED | ✓ (12) |
| Git | trabajo en rama, un único commit, push verificado por SHA, sin merge a main, sin force | ✓ (este commit) |

## Integridad F1–F4 (regresión cruzada)

- **F1**: MobileTabBar (6 botones, touch 48–69px), drawer "Más" + Escape, StickyCart,
  SpeedDial, POS toolbar, safe-area, overflow 0px 320–1440 → **INTACTA**.
- **F2**: tokens.css, button.tsx, PageHeader, jerarquía tipográfica → **INTACTOS** (0 diffs).
- **F3**: StateRenderer/BaseModal/focus/Escape/toaster → **INTACTOS** (0 diffs; Escape verificado en vivo).
- **F4**: deep-link contract, breadcrumbs reales ×5 vistas, nomenclatura única → **INTACTOS**.

## Honestidad de evidencia

1. **F5-001 RETIRADO** (falso positivo doble: patrón `sl(var` ≈ sufijo de `hsl(var` + artefacto
   de salida del tool). Verificación byte-level confirma clases válidas. Solo se implementó
   el retiro del glow decorativo del display (P3).
2. **Lecturas stale**: rg produjo salidas mangled durante la sesión (p.ej. `Mobilen` por
   `MobileTabBar`); toda afirmación crítica fue re-verificada con node fs byte-level.
3. **Capturas**: settings/telegram-hub AFTER quedaron a 320px por emulación de dispositivo
   persistente → re-capturadas a 1280×800 y verificadas byte-level (14/14).
4. **Recuperación de sesión**: `WhatsAppDashboardView:276` (alcance F5-005) se encontró sin
   aplicar tras la interrupción del workspace → restaurado y verificado antes de certificar.
5. **Método**: los recuentos F5-A (rg) y F5-F (node, flag `g`, 1324 archivos) difieren
   ligeramente en cobertura (.ts/.css de configs); las diferencias están anotadas en 12 §2
   y no alteran ningún veredicto.

## Deuda residual (documentada, NO ampliada — requiere decisión/autorización explícita)

| Ref | Deuda | Severidad | Categoría |
|---|---|---|---|
| F5-011 | CyberShell como chrome por defecto en ops | — | **D** (decisión de producto) |
| F5-012 | ParticleBackground watermark en ops (gated) | — | **D** |
| F5-013 | modo enhanced por defecto sin toggle accesible | — | **D** |
| F5-014 | ~665 clases paleta verde + hex en landing/auth/charts | P2 | C (codemod futuro) |
| F5-015 | masa tipográfica "loud label" (2.708 px arbitrarios / 4.245 font-black / 4.316 uppercase); **piso 7px real = 12 archivos (post-audit), no 3** | P1 estructural | C (migración explícita futura) |
| F5-016 | rounded-3xl ×128 fuera de escala de tokens | P2 | C |
| F5-017 | shadow-2xl/xl mixto overlays/ruido; glows enhanced | P2 | C (parcial D) |
| F5-018 | badge.tsx sin variants semánticas; 24 bg-*-100 restantes; 181 emojis status | P1 estructural | C |
| F5-019 | icon-buttons sin aria-label (88/95) | P1 a11y | C (inventario incluido) |
| F5-020 | GraphViewer text-[5px]/[6px] | P2 | C (riesgo layout SVG) |
| F5-021 | excepciones intencionales (Wallet CR/DR, POS HISTORIAL azul, meta theme-color, paletas charts, burbuja WhatsApp WDV:282) | — | DOC |
| NUEVO | AutoPublish:362 segmented-active `bg-green-600` (estado seleccionado, no CTA) | P3 | debt documentada |
| NUEVO | TelegramConfigView:499 badge único emerald-100 (fuera de ternarios) | P3 | debt documentada |
| NUEVO | ExchangeIntelligence:2677 tinte suave `bg-emerald-600/5` (contenedor) | P3 | debt documentada |
| NUEVO | piso text-[7px] en 11 archivos adicionales (post-audit) + 6px/8px labels KnowledgeTab fuera del alcance del fix | P2 | debt documentada (agrupa con F5-015) |
| F5-022 | ci.yml `branches: [ain, master, develop]` corrupto | P2 (CI) | E (fuera de F5; perteneciente a CI) |

## Build

Build local: OOM (`Killed`) — limitación del entorno 3.9GiB con precedente REM-V2 y PRE-F5.
**CI = autoridad del build** para esta rama (debe ejecutarse tras el push; la rama no se
mergea a main — la integración es una operación posterior explícitamente autorizada).

## Conclusión

F5 entrega su mandato con el principio **RETIRAR ANTES QUE AÑADIR**: −273 líneas de código
muerto, −7 logs de diagnóstico, −8 CTAs con verde competidor, −2 gramáticas de estado
duplicadas, −1 texto degradado operacional, +gate de decoración en reduced-motion/performance,
piso de legibilidad 7px→10px, y la voz del botón alineada a F2 en las superficies del alcance —
sin una sola línea añadida de decoración, sin migraciones masivas, sin tocar backend/seguridad/
CI/lógica de negocio, y con F1–F4 verificados intactos en vivo. La deuda estructural restante
está clasificada con severidad, riesgo y categoría de acción para fases explícitamente autorizadas.

**STOP F5** — no se inicia F6.
