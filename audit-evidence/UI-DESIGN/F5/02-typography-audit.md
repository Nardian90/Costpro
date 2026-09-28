# F5 — 02 TYPOGRAPHY AUDIT (A2)

Fecha: 2026-09-29 · Método: rg cuantitativo + lectura de 12+ contextos representativos.

## 1. Recuentos

| Patrón | Ocurrencias | Archivos |
|---|---|---|
| `text-[10px]` | 1.722 | 271 |
| `text-[9px]` | 555 | 133 |
| `text-[11px]` | 211 | 86 |
| `text-[8px]` | 133 | 37 |
| `text-[7px]` | 45 | 3 (KnowledgeTab) |
| `text-[6px]` / `text-[5px]` | 10 / 3 | GraphViewer/KnowledgeTab |
| **Total tamaños arbitrarios** | **2.708** | 287 |
| `font-black` | **4.265** | 386 |
| `uppercase` | **4.308** (utilidad) | 412 |
| `tracking-widest` | **2.290** | 354 |
| `font-bold` | 2.399 | 375 |

Sub-10px = 1.768 usos (65% del total arbitrario). Tokens de escala existen
(tokens.css:60-69) y el rol compacto `.cp-metadata` (10px) está definido.

## 2. Matriz de roles (A2 requerida)

| Rol | Tamaño actual | Peso | Uso | Problema | Acción |
|---|---|---|---|---|---|
| Page title | cp-page-title (token) | correcto | PageHeader | — | — |
| KPI micro-label | `text-[9px] font-black uppercase` | black | ProductionOrders:958, Wallet:744 | sub-legible + voz cyber | C (masivo) |
| KPI micro-label estándar | `text-[10px] font-black uppercase tracking-widest` | black | MetricMini:21, SettingsView:222 | contradice components.css:656-658 | C (masivo) |
| Receipt/cart density | `text-[10px] font-bold uppercase` | bold | POSCartCheckoutPanel:356 | legítimo por densidad operacional | DOC-ONLY |
| Table headers dense | `text-[10px]` | varía | CashReportModal:1414 | legítimo | DOC-ONLY |
| **Table headers patológicos** | `text-[7px] font-black uppercase` + `/50` | black | KnowledgeTab:276-281 | **ilegible + doble mutado** | **B (fix)** |
| Graph node labels | `text-[5px]/[6px]` | varía | GraphViewer:469-525 | ilegible PERO layout de grafo sensible | C |
| Badge/chip | `text-[10px] rounded-full` | varía | 70 usos/32 archivos | gramática ad-hoc (ver 05) | C |
| Nav tab label | `text-[10px] font-black uppercase` | black | MobileTabBar:312 | F1 — no tocar | EXCLUIDO |
| Decorative kicker | `text-[8px]`/`text-[9px]` + tracking 0.2em | black | Wallet:609, FloatingCalc:115 | ruido | C (local) |
| 404 numeral | `text-[120px→200px]` | black | not-found:117 | página de error = aceptable | INTENTIONAL |

## 3. Hallazgo estructural central

`components.css:656-658` documenta la regla F2: *"font-black/uppercase/tracking-widest
dejan de ser la voz por defecto; uppercase queda reservado a METADATOS"*.
La realidad del código: el stack "loud label" (`text-[9-10px] font-black uppercase
tracking-widest`) es la voz de facto en 350+ archivos.

**Roles tipográficos muertos**: `.cp-page-title` ×2, `.cp-metadata` ×2, `.cp-caption` ×4
en todo src/*.tsx — la API de roles existe y no se usa.

## 4. Decisión de alcance (NO-GO respetado)

- Migración masiva de 2.708 tamaños o 4.265 font-black = **PROHIBIDA** (F5-C.1).
- Fix quirúrgico F5-D: solo el piso de legibilidad objetivo (text-[7px] ×45 en
  KnowledgeTab, incluida la doble mutación /50) → P1.
- GraphViewer text-[5px]/[6px] → C (riesgo de layout en grafo SVG).
- El resto → C/Document con matriz 09 como hoja de ruta para una futura
  "typography migration" explícitamente autorizada.
