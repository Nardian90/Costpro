# GATE 1.4R.1 — 09 BREADCRUMBS (mandato §23)

## Fuente

Los breadcrumbs de las tabs del módulo se resuelven desde el registro `COST_SHEETS_TABS`
(fix de fuente del GATE 1.4R) colgando del path de definición
`OPERACIÓN > Costo > Fichas de Costo > <tab>`. El rename de `main` a "Experto" y el nuevo
route del menú se propagan automáticamente.

## Verificados en browser real (desktop y móvil)

| Ruta | Breadcrumb observado | Evidencia |
|---|---|---|
| Fichas de Costo (clic menú) | Inicio > OPERACIÓN > COSTO > FICHAS DE COSTO > **EXPERTO** | browser-landing-experto-1440.png |
| → Generar | … FICHAS DE COSTO > **GENERAR FICHA** | mobile-375-generar.png |
| → Generación Masiva | … FICHAS DE COSTO > **GENERACIÓN MASIVA** | browser-generacion-masiva-1440.png |
| → Análisis de Fichas | **ANÁLISIS > ANÁLISIS DE FICHAS** (hoja propia del menú) | browser-analisis-fichas-1440.png |
| → Arena FC | … FICHAS DE COSTO > **ARENA FC** | browser-arena-fc-1440.png, mobile-390-arena.png |
| → Plantillas (sub-tab) | … FICHAS DE COSTO > **PLANTILLAS DE FICHAS** | browser-experto-plantillas-1440.png |
| Ficha → Modo Asistido | sección técnica `view-assisted` (deep-link OK; el modo vive dentro de la ficha) | — |
| Ficha → Informe | ídem `view-reading` | — |

- **"Módulo No Disponible": CERO apariciones** en todas las rutas navegadas (assert también
  contractual en tests).
- Ningún breadcrumb pertenece a otro dominio (los paths del módulo cuelgan de OPERACIÓN/Costo;
  Análisis de Fichas cuelga de ANÁLISIS — correcto por diseño dual de GATE 1.4R).

## Tests contractuales

`GATE 1.4R.1 — Breadcrumbs del segundo nivel`: Experto / Generación Masiva / Análisis de
Fichas / Arena FC — todos resuelven su path exacto, sin "Módulo No Disponible".
