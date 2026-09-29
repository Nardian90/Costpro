# F6 — 10 DEFECTS (F6-M / F6-T) · CLASIFICACIÓN COMPLETA

Reglas: R0 REGRESSION · R1 ACCESSIBILITY · R2 UX CONSISTENCY · R3 VISUAL DEBT ·
D PRODUCT DECISION · E OUT OF SCOPE. Cada hallazgo con ID/evidencia/severidad/
reproducibilidad/impacto/decisión/estado. Sin "maybe" sin clasificar.

## R0 — REGRESSION

```text
NINGUNA. 0 regresiones atribuibles a F6 o detectadas contra F1–F5.
(tsc 0 · eslint 0 errors · vitest 2387/0 · 16 superficies live OK · F1–F5 invariants OK)
```

## R1 — ACCESSIBILITY

| ID | Hallazgo | Evidencia | Sev | Repro | Impacto | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| — | ninguno nuevo | — | — | — | — | — | — |

Deuda heredada NO regresión (permanece documentada, NO se amplía):
F5-019 icon-buttons sin aria-label (masa); doble-H1 (impacto semántico menor, ver R3/D-2).

## R2 — UX CONSISTENCY

| ID | Hallazgo | Evidencia | Sev | Repro | Impacto | Decisión | Estado |
|---|---|---|---|---|---|---|---|
| R2-1 | Búsqueda del sidebar: con simulación de input estándar el filtro no es observable en DOM; el mecanismo existe (`Sidebar.tsx:94-101`) y reaccionó al despachar evento React manual; palette Ctrl+K (búsqueda primaria) funciona | 02-navigation §Búsqueda | P3 | no-reproducible de forma fiable con tooling (limitación conocida de eventos sintéticos) | menor (existe palette) | NO corregir en F6 (no cumple "objetivo+reproducible"); re-verificar manualmente en futura sesión interactiva | ABIERTO-documentado |
| R2-2 | Inconsistencia de capitalización en H1 del header vs título de página: "Historial **De** Ventas" / "Gestión **De** Tiendas" / "Venta **Por** Conteo" (title-case de preposiciones) vs PageHeader sentence-case | journeys J3/J4/J6 | P3 | determinística | cosmético | NO corregir en F6: tocaría headers de ~20 vistas (scope creep NO-GO F6-N.1); documentar para futura pasada de nomenclatura | ABIERTO-documentado |

## R3 — VISUAL DEBT (estable, heredada de F5/F4 — sin crecimiento)

| ID | Hallazgo | Clasificación | Estado |
|---|---|---|---|
| D-1 | Masa tipográfica `font-black` 4.242 usos; `text-[7px]` en 12 archivos; uppercase/tracking de facto | = deuda F5-015 documentada (baseline 4.245 → 4.242, estable) | ABIERTO (clase C) |
| D-2 | Doble-H1 estructural (header + PageHeader) en vistas con PageHeader | = deuda F4 clase C "triple apilado", estable | ABIERTO (clase C) |
| D-3 | `rounded-3xl` ×~128 fuera de escala; `shadow-2xl/xl` mixtos | = deuda F5-016/017 documentada | ABIERTO (clase C) |
| D-4 | badge.tsx sin variants success/warning; bg-*-100 residuales | = deuda F5-018 documentada (0 crecimiento) | ABIERTO (clase C) |
| D-5 | Tintes contenedor `from-primary/5` y badges gradient pequeños en StoreDashboardView (708/716/747/1051) | NO son los CTAs corregidos por F5-006; decoración sutil clase C | ABIERTO (clase C) |
| D-6 | Landing/auth con paleta Tailwind/hex (719 green + 396 hex en F5-A) | = deuda F5-014 (codemod futuro NO-GO) | ABIERTO (clase C) |

## D — PRODUCT DECISION (no decidir unilateralmente)

| ID | Decisión pendiente | Origen | Estado |
|---|---|---|---|
| P-1 | CyberShell como chrome por defecto en operación | F5-011 | ABIERTO (D) |
| P-2 | ParticleBackground/watermark en enhanced | F5-012 | ABIERTO (D) |
| P-3 | Modo enhanced por defecto / toggle global | F5-013 | ABIERTO (D) |
| P-4 | Consolidar "Inicio"/"Dashboard de Tiendas" (doble resaltado) y "Mi Perfil"⊂Ajustes | F4 clase D | ABIERTO (D) |

## E — OUT OF SCOPE

| ID | Hallazgo | Estado |
|---|---|---|
| E-1 | ci.yml `branches: [ain, master, develop]` corrupto | = F5-022; pertenece a CI, no UI |
| E-2 | Fallback landing en primera carga de vistas pesadas bajo dev-mode (compile de chunks) | artefacto de entorno dev documentado desde F3–F5; en producción (build) no aplica |
| E-3 | 401 de cron pollers telegram/whatsapp en logs | idempotente, sin impacto UI; dominio backend |

## Resumen

```text
R0: 0   R1: 0 (nuevas)   R2: 2 (documentadas, no-F6-fix)   R3: 6 (deuda estable)
D: 4 (pendientes de producto)   E: 3 (fuera de alcance)
Ningún hallazgo sin clasificar. Deuda conocida = clasificada + acotada + no-bloqueante.
```
