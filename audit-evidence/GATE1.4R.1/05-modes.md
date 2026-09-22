# GATE 1.4R.1 — 05 MODOS (mandato §13/§14/§15)

## Reconstrucción (GATE 1)

`CostSheetModeDropdown` (modos de la ficha) existía pero **no se renderizaba en ninguna parte**
(grep `<CostSheetModeDropdown` = 0 resultados en baseline). El control "Modo" no existía en la UI.

## Correcciones aplicadas

1. **Control visible**: el dropdown de MODO se renderiza ahora dentro de
   `CostSheetModuleNav` (fila de contexto de ficha), disponible en todo el scope Experto
   (Estructura, Datos Generales, Plantillas, Anexos, Asistido, Informe…).
2. **Labels corregidos** (IDs `viewMode` SIN cambios — deep-links intactos):

| viewMode (id) | Antes | Ahora | Por qué |
|---|---|---|---|
| `expert` | Experto | **Completo** | Evita colisión con el TAB "Experto"; §14 lo llama modo "Completo" |
| `assisted` | Asistido | **Asistido** + hint "Modo gráfico guiado paso a paso" | §14: es un modo gráfico |
| `reading` | Resumido | **Informe** | §13: representación formal/reportable de la ficha; coincide con palette "Informe de la Ficha" |
| `preview` | Vistazo | Vistazo | (sin cambio) |
| `kpis` | Tablero | **Resumen** | §8: evita colisión con dashboards de CostPro |
| `audit` | Audit | **Auditoría** | Consistencia de idioma |

3. **Jerarquía semántica resultante** (§14/§15): el usuario distingue
   TABS del módulo (Generar/Experto/Masiva/Análisis/Arena) de los **MODOS de la ficha abierta**
   (Completo/Asistido/Informe/Vistazo + Resumen/Auditoría) — nunca parecen módulos independientes,
   no crean rutas ni entradas de sidebar.
4. **Informe permanece como MODO** (regla §13): `view-reading` renderiza `CostSheetNarrative`
   ("INFORME DE COSTO") sobre la ficha abierta — es visualización, no artefacto independiente.
   Documentado; no se convirtió en página ni acción.

## Evidencia browser

- `browser-modo-asistido-1440.png` — wizard "MODO ASISTIDO" con Pasos 1-5 (modo gráfico).
- `browser-modo-informe-1440.png` — "INFORME DE COSTO" + "CONCLUSIÓN DEL INFORME".
- Dropdown capturado en snapshot: `RESUMEN/COMPLETO(checked)/ASISTIDO/INFORME/VISTAZO/AUDITORÍA`
  con hints; control "MODO: <actual>" siempre legible.

## Flujo F parcial (mandato §26)

Modo → Asistido **PASS** · Modo → Informe **PASS** · retorno a Completo **PASS**.
