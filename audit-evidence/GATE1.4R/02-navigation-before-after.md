# GATE 1.4R — 02 NAVIGATION BEFORE/AFTER

Fecha: 2026-09-22 · Comparación de la arquitectura de navegación del dominio Fichas de Costo entre baseline `472027e4` (pre-remediación) y el árbol post-remediación.

## ANTES (baseline 472027e4 — estado auditado por GATE 1.4)

```text
OPERACIÓN
└── Costo
    └── Fichas de Costo (única entrada) → gen-easy
        ├── [visible] Generar Fácil (Rápida/Experta)
        ├── [visible] Editor main + modos (panel flotante) + acciones (nav/panel)
        ├── [invisible] Arena FC ........... deep-link ONLY (orphan P0)
        ├── [invisible] Modo Asistido ...... palette 0 resultados
        ├── [invisible] Informe ............ palette "informe" → Reportes (falsa pista)
        ├── [invisible] Plantillas ......... solo con ficha abierta
        ├── [semi-visible] Generación Masiva (tab Experta de gen-easy + panel)
        ├── [invisible] Calculadora Estructural
        └── breadcrumb de TODAS las tabs técnicas (main, arena, view-*, tool-*):
            "… > Módulo No Disponible" (UX-002)
ANÁLISIS
└── "Tablero Dinámico" (nombre ambiguo, UX-004)
```

Palette ANTES: "arena"→Fichas de Costo (gen-easy) · "asistido"→∅ · "informe"→Reportes · "json"→Usuarios/Vitrina (fuzzy) · sin acciones de ficha.

## DESPUÉS (post-remediación)

```text
OPERACIÓN
└── Costo
    └── Fichas de Costo (única entrada — sin duplicar) → gen-easy
        ├── Generar Ficha (vista de aterrizaje)
        │   └── 🆕 tarjeta "Arena FC (beta)" — ÚNICO camino visible (mandato §6)
        ├── Editor de Ficha (breadcrumb corregido)
        │   ├── MODOS (en el editor, sin cambios): Completo · Asistido · Informe · Vistazo · Audit
        │   └── ACCIONES (en el editor, sin cambios): Guardar · Importar · Export Excel · Export PDF
        ├── Análisis de Fichas (menú ANÁLISIS — renombrado; tab dual intacta)
        └── descubrimiento por palette (⌘K):
            Arena FC · Abrir Modo Asistido · Informe de la Ficha · Plantillas de Fichas ·
            Generación Masiva · Calculadora Estructural · Guardar ficha (JSON) ·
            Importar ficha (JSON) · Exportar ficha a Excel · Exportar ficha a PDF
```

Breadcrumb DESPUÉS (todas las tabs técnicas): `Inicio > OPERACIÓN > Costo > Fichas de Costo > <leaf del registro>` — cero "Módulo No Disponible".

## Matriz before/after por canal

| Capacidad | Menú | Palette | Breadcrumb | Móvil |
|---|---|---|---|---|
| Generar Ficha | = (sin cambio) | = | 🆕 leaf "Generar Ficha" | = |
| Arena FC | (vía módulo, como propone 14) | 🆕 ACCIÓN con ruta correcta | 🆕 "Arena FC" (antes: falso Módulo No Disponible) | 🆕 tarjeta visible |
| Modo Asistido | NO (correcto — es modo) | 🆕 "Abrir Modo Asistido" | 🆕 "Abrir Modo Asistido" | = (en editor) |
| Informe | NO (correcto — es modo) | 🆕 "Informe de la Ficha" | 🆕 "Informe de la Ficha" | = (en editor) |
| Plantillas | NO (contextual, decisión §11) | 🆕 | 🆕 "Plantillas de Fichas" | = |
| Masiva | NO (sub-capacidad de Generar) | 🆕 | 🆕 "Generación Masiva" | = (tab Experta) |
| Estructural | NO (contextual, decisión §11) | 🆕 | 🆕 "Calculadora Estructural" | = |
| Guardar/Import/Excel/PDF | NO (acciones, §10) | 🆕 como acciones contextuales | 🆕 leaf "Editor de Ficha" al ejecutar | = |
| Análisis (cost-analytics) | 🆕 label "Análisis de Fichas" | 🆕 label+keywords | 🆕 "ANÁLISIS > Análisis de Fichas" | = (misma fuente) |

## Qué NO cambió (control anti-duplicación)

- Sidebar: mismas hojas, mismos roles, misma jerarquía (0 entradas nuevas de menú).
- ViewTypes: 0 nuevos; `cost-analytics` y tabs técnicas conservan su id.
- Rutas/URLs: los deep-links existentes siguen operando idénticos (tests + browser).
- Editor: 0 cambios internos en CostSheetView/useCostSheetActions/ArenaFC/motor normativo.
- `/fc/FC.html`: intacto.
