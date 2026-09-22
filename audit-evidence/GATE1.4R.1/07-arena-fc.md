# GATE 1.4R.1 — 07 ARENA FC (mandato §18)

## Estado

Arena FC dejó de ser orphan en GATE 1.4R (tarjeta en Generar). En GATE 1.4R.1 sube de
categoría: es **TAB de 2º nivel del módulo** ("ARENA FC", badge Beta), al mismo nivel que
Generar/Experto/Masiva/Análisis — camino visible y semántico para COMPARAR fichas (§34:
"¿QUIERO COMPARAR? → Arena FC").

## Sin duplicación

- ÚNICO componente: `ArenaFC.tsx`. ÚNICO motor de cálculo del duelo.
- Única ruta: tab técnica `arena-fc` (`?tab=arena-fc`) — intacta.
- Las tarjetas/entradas previas se conservan y ahora conviven con el tab:
  tarjeta beta dentro de Generar (GATE 1.4R) + palette "Arena FC".

## Evidencia browser

- `browser-arena-fc-1440.png` — desktop: breadcrumb `…FICHAS DE COSTO > ARENA FC`, comparador.
- `mobile-390-arena.png` — móvil 390: tab ARENA activa en bottom bar, fichas cargadas
  (FC RES148, ejemplo pintura), "COMPETIDOR A VS COMPETIDOR B", "INICIAR COMPARACIÓN".

## Flujo E (mandato §26)

Fichas de Costo → Arena FC (clic en tab de 2º nivel) **PASS** desktop 1440 y móvil 390.
