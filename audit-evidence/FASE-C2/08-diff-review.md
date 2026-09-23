# FASE C — C2 · 08 DIFF REVIEW (§27)

## 1. Alcance del diff

```text
15 archivos modificados + 1 directorio nuevo (src/lib/cost-sheets/) + 3 suites de tests nuevos
+ evidencia documental (audit-evidence/FASE-C2/).
git diff --stat (resumen): 332 inserciones / 52 eliminaciones en los 15 tracked.
```

Lista completa en `01-implementation-map.md` §1 (archivo por archivo, propósito por propósito).

## 2. Búsqueda por palabras clave del mandato

| Palabra clave | Resultado en el diff |
|---|---|
| `store_id` | SOLO eliminaciones (`-`) del código roto y comentarios nuevos que documentan la prohibición (D1/C2-E). Cero usos activos sobre `cost_sheets` |
| `cost_sheets` | solo en las superficies mapeadas (writer, hook, ArenaFC, registry, util de compatibilidad) |
| `FC_RES148_2023_V1` | solo en la util de compatibilidad/tests como CONSTANTES de detección (nunca emitido por el terminal) |
| `Guardar Ficha` | botón/paleta/tips ahora persisten (tool-save-cloud); label antiguo renombrado a «Exportar JSON» |
| `Exportar JSON` | comando/botón explícito e independiente (descarga local) |
| `search_entity` | `.eq('store_id')` eliminado; filtros de contrato añadidos; resto de entidades sin cambios |

## 3. Verificación de ausencias (no debe haber)

| Chequeo | Resultado |
|---|---|
| cambios accidentales fuera de alcance | 0 — todos los archivos tocados pertenecen a C2-A/B/C |
| duplicación de lógica | 0 — un solo guard (`isCostSheetDocument`) importado por las 3 superficies |
| código muerto nuevo | 0 — `handleExportJSON` sigue vivo y cableado (Exportar JSON); nada quedó sin referencia |
| APIs paralelas | 0 — única ruta de escritura: `/api/cost-sheets/save` (extendida, no duplicada) |
| cambios en FC.html | 0 — `git diff --name-only | grep public/fc` vacío |
| migraciones no autorizadas | 0 — `git diff | grep supabase/` vacío; sin DDL/DML |
| cambios RLS no autorizados | 0 — políticas intactas |
| `store_id` creado en cost_sheets | NO (C2-E respetada) |
| secretos expuestos | 0 — ningún token/clave en el diff ni en la evidencia; scripts fuera del repo leen .env local |

## 4. Consistencia arquitectónica (principio final del mandato)

```text
cost_sheets (contenedor global, RLS por fila)
   ├── CostSheet  → escribe/lee SOLO contrato CostSheet (guard D3 + filtros C2-B + Zod)
   └── FC.html    → intacto: escribe/lee SOLO FC_RES148_2023_V1 (guard v(e) propio)
GLOBAL ≠ PÚBLICO (RLS activo, anon 0) · MIS FICHAS ≠ TODAS LAS FICHAS (filtros por contrato)
MISMO STORAGE ≠ MISMO CONTRATO (bibliotecas lógicamente separadas en una tabla)
```

El diff materializa exactamente el diagrama objetivo del mandato §1 sin fusionar productos.
