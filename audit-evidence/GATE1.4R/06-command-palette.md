# GATE 1.4R — 06 COMMAND PALETTE — mandato §12

Fecha: 2026-09-22 · Corrección estructural: palette = VISTAS + ACCIONES + ACCIONES CONTEXTUALES, sin resultados falsos. Evidencia: queries reales ejecutadas en navegador (admin, desktop 1440) contra la palette real, como en GATE 1.4 (07-command-palette.md).

## Resultados ANTES → DESPUÉS (queries del mandato)

| Query | ANTES (GATE 1.4, medido) | DESPUÉS (medido en este gate) | Veredicto |
|---|---|---|---|
| ficha | Fichas de Costo · ABC · Cambiaria | **Fichas de Costo · Análisis de Fichas · Arena FC · Guardar ficha (JSON)** | ✅ correcto y más rico (todos hits semánticos) |
| generar ficha | (no medida) | **Fichas de Costo · Generación Masiva** (tras añadir keyword exacta) | ✅ entrada principal 1ª |
| arena | Fichas de Costo (falsa pista) | **Arena FC (1ª)** · Fichas de Costo | ✅ corregido |
| asistido | ∅ | **Abrir Modo Asistido** | ✅ corregido |
| informe | Reportes (falsa pista) | **Informe de la Ficha (1ª)** · Reportes | ✅ corregido |
| plantillas | ∅ | **Plantillas de Fichas (1ª)** · Fichas de Costo · Exportar Excel | ✅ |
| masiva | ∅ | **Generación Masiva (1ª)** | ✅ |
| calculadora | Calculadora | **Calculadora · Calculadora Estructural** | ✅ (Pro sigue 1ª — es la global; Estructural descubrible) |
| guardar ficha | ∅ | **Guardar ficha (JSON) · Importar ficha (JSON)** | ✅ |
| importar json | ∅ (usuarios fuzzy) | **Importar ficha (JSON)** | ✅ |
| exportar pdf | Reportes (falsa pista) | **Exportar ficha a PDF · Exportar ficha a Excel** | ✅ |
| exportar excel | Reportes (falsa pista) | **Exportar ficha a Excel · Exportar ficha a PDF** | ✅ |

## Regresiones medidas (no contaminar hits existentes)

| Query | Resultado | Veredicto |
|---|---|---|
| json | Importar (1ª) · Guardar (2ª) · Usuarios · Vitrina Pública | ✅ los correctos van primero (antes: SOLO los falsos) |
| tablero | Inicio · **Análisis de Fichas** | ✅ colisión de nombres resuelta por el rename |
| caja (test GATE 1.3) | exactamente ['cash'] | ✅ test sigue verde |

## Cambios estructurales que lo hacen posible

1. Registro `COST_SHEETS_TABS` en navigation-definition.ts → 10 entradas palette (1 vista beta + 2 modos + 3 herramientas + 4 acciones) con keywords curadas y roles de dominio.
2. Fix `actions.ts`: `route: ext.id` preserva module-routes (el tab ya no se pierde — sin esto, "arena" habría aterrizado en gen-easy de nuevo).
3. `massive-gen` / `steel-calculator` añadidos a COSTOS_ROUTES (resolución de ruta para palette; deep-links ya existían).
4. `gen-easy` deliberadamente NO en palette (la hoja "Fichas de Costo" ya lo cubre con keyword 'generar') — evita el ruido multi-entrada prohibido por §8 (test lo aserta).

## Sin resultados falsos (§12)

Cada hit nuevo matchea por label/description/keywords PROPIOS de la capacidad. Los antiguos falsos positivos por fuzzy (json→Usuarios/Vitrina) siguen apareciendo SOLO como hits fuzzy de cola — nunca antes que el hit correcto.
