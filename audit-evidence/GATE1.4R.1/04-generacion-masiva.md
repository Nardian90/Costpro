# GATE 1.4R.1 — 04 GENERACIÓN MASIVA (mandato §10/§11/§12)

## Evidencia del rename

- `GenEasyView.tsx`: tab interno `expert` renombrado **"Generación Experta" → "Generación Masiva"**
  (id interno `expert` sin tocar — sin cambio de contrato). Comentarios actualizados.
- El registro `COST_SHEETS_TABS` ya etiquetaba `massive-gen` como "Generación Masiva" (GATE 1.4R);
  su descripción ahora dice "(también dentro de Generar)".
- Test contractual nuevo: NO existe ningún label "Generación Experta" en menú/palette/registro
  (`gate1-navigation.test.ts` — GATE 1.4R.1 describe block).

## Dónde vive la Generación Masiva (decisión §12 — basada en la implementación existente)

`CostSheetMassiveGenerator` (ÚNICO componente/motor de lote) es alcanzable por DOS entradas
que reutilizan el mismo componente (0 duplicación):

1. **Tab de 2º nivel "MASIVA"** (`?tab=massive-gen`) — camino directo del mandato §20/§34.
2. **Dentro de Generar** (`?tab=gen-easy` → tab interno "Generación Masiva") — continuidad del
   flujo del usuario que está creando fichas (junto a "Generación Rápida").

La decisión de mantener ambas entradas se apoya en el flujo real: la generación rápida termina
en el generador masivo (`onGenerate → setIsQuickModeGenerating → CostSheetMassiveGenerator autoStart`),
y el tab de 2º nivel garantiza el descubrimiento sin pasar por Generar.

## Evidencia browser

- `browser-generar-1440.png` — Generar con tabs "GENERACIÓN RÁPIDA" / **"GENERACIÓN MASIVA"** (renombrada).
- `browser-generacion-masiva-1440.png` — tab MASIVA: breadcrumb "GENERACIÓN MASIVA",
  componente "GENERACIÓN MASIVA DE FICHAS" + "¿PREFIERES IMPORTAR UN EXCEL?".
- `mobile-375-generar.png` — móvil 375: tabs Rápida/Masiva visibles + tab MASIVA del bottom bar.

## Flujo C (mandato §26)

Fichas de Costo → MASIVA → componente cargado con Excel/inventario. **PASS** (desktop 1440 y móvil 390).
