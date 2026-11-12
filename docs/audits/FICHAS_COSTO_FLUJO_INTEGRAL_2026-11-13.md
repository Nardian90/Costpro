# Expediente: Auditoría y corrección integral del flujo de Fichas de Costo (FC)

**Misión:** Auditoría y corrección integral del flujo de Fichas de Costo — conexión con Inventario, plantillas disponibles, «Vistazo» y exportación PDF.
**Fecha:** 2026-11-13 · **Rama:** `fix/fichas-costo-20261113` · **Base:** `main` @ `acc6c6f4b`
**Alcance de código:** motor PDF, selector de plantillas, modal FC del inventario, Vistazo, modalidad, seguridad multitienda, datos de plantillas de sistema.

---

## 1. Problemas encontrados y causas técnicas

### P1 — Interfaz: «Vistazo» no funcionaba (sección Fichas de Costo)
- **Causa raíz (lógica):** `CostSheetView` NO tenía rama de render para `viewMode === 'preview'` — seleccionar «Vistazo» dejaba el área de contenido en blanco. El componente HTML `CostSheetPreview` era código muerto inalcanzable: la única renderización exigía `isEditing === false`, pero `isEditing` se inicializaba en `true` y su único setter (`setIsEditing(true)`) vivía DENTRO de la propia rama muerta.
- **Corrección:** rama de render dedicada para `viewMode === 'preview'` + nuevo componente `CostSheetPdfPreview` (ver P4). La rama muerta se eliminó y se reemplazó por el mismo panel (defensa en profundidad).

### P2 — Lógica: dos motores de PDF distintos → documentos diferentes
- **Causa raíz:** la sección Fichas de Costo exportaba con `generateCostSheetPDF` (cliente, 10 formatos) mientras el modal FC del Inventario usaba `generate-fc-pdf.ts` (servidor, layout genérico ÚNICO que ignoraba `pdf_format` en modo single). El usuario percibía «diferencias entre la vista y el PDF exportado».
- **Corrección (FC-PDF-UNIFY):** un solo motor. `quick-pdf` (el endpoint del inventario) ahora llama a `generateCostSheetPDF` — el MISMO generador de 10 formatos con los mismos diseños («Estándar» = `renderStandard` intacto). Los tipos (`PDFFormat`/`ExportOptions`/`AnnexLayout`) se movieron a un módulo puro compartido (`src/lib/export/pdf-export-types.ts`) para que el motor sea isomorfo (cliente + servidor).

### P3 — Lógica/persistencia: bug de datos en quick-pdf (ceros en VH/Total)
- **Causa raíz:** la ruta pasaba `calculated_data.calculatedRows` (ARRAY) como `calculatedValues` (se espera `Record<rowId, valor>`) → `calculatedValues[row.id]` era siempre `undefined` → las columnas caían a los valores persistidos sin cálculo (con frecuencia 0).
- **Corrección:** builder puro `buildQuickPdfBody` (`src/lib/export/fc-quick-pdf-body.ts`) que convierte array→Record y construye el contrato completo del motor (header + secciones + anexos + summary).

### P4 — Interfaz: sin selector de formato desde el Inventario
- **Causa raíz:** `FCPreviewModal` usaba `pdfFormat` fijo ('res148' — ni siquiera lo pasaban los callers) tanto para la vista previa como para la descarga.
- **Corrección:** selector de formato visible en el modal (las 10 alternativas con etiqueta y descripción), default **Estándar** (el diseño que el propietario espera), tanto para la vista previa (iframe) como para «Exportar PDF». Cambiar el formato invalida el blob y refresca la petición con el `pdf_format` elegido.

### P5 — Persistencia/lógica: plantillas de sistema y públicas no visibles en el picker
- **Causa raíz:** `useFCTemplateOptions` solo consultaba `cost_sheet_templates` (private + public). En producción hay **0 filas** en esa tabla (publicar es solo-admin y nadie ha publicado — estado de datos, no bug), y las **13 plantillas de sistema viven en código** (`TEMPLATE_REGISTRY`) sin ofrecerse nunca en el picker → el usuario «solo veía las privadas».
- **Corrección (FC-SYS-TEMPLATES):** fusión de las TRES procedencias en una sola consulta coherente: privadas + públicas de BD (RLS del navegador como fuente de verdad) + catálogo de sistema (`src/lib/integration/fc-system-templates.ts`, metadata de las 13 — cliente/servidor seguro). Cada opción muestra su procedencia con chip de color + tooltip. La lista nunca queda vacía: el catálogo de sistema siempre ofrece 13 opciones.
- **Verificación de persistencia exigida por la misión:** las plantillas públicas se almacenan y recuperan de `cost_sheet_templates` (publish flow de CP-PLANTILLAS-FASE2, RLS `type='public'`) — confirmado por código y por el E2E (el picker aislado mostró plantillas públicas sembradas). Las plantillas de sistema persisten en código por arquitectura sancionada (expediente de FASE2: «no hay datos que migrar»); NO se hace seed en BD para evitar una doble fuente de verdad y datos de demostración en producción.

### P6 — Lógica: 11 de 13 plantillas de sistema NO generaban FC
- **Causa raíz (datos):** la fila 13.1 («Utilidad») llevaba `baseRef: "12"` — referencia inexistente (no existe fila 12; la fórmula ya usa `ref('12.1')`) → validación CRITICAL `MISSING_REF` → 422. Defecto preexistente: el mismo pipeline lo usa auto-generate de tienda.
- **Corrección:** `baseRef: "12" → "12.1"` en las 11 plantillas (espejo de `costpro-reinicio`, que funciona). NO se alteró ninguna fórmula ni regla contable — el baseRef apunta a la fila que la fórmula ya referenciaba. Verificado: **13/13 plantillas generan** (bun smoke + E2E R3).

### P7 — Interfaz: «Modalidad (opcional)» inexplicable
- **Función real (investigada):** clasifica la ficha según Res. 148/2023 (A: Producción, B: Servicios, C: Comercialización). Se persiste en `product_cost_sheets.modalidad` y en el encabezado de la ficha (`header.destination`) para trazabilidad. **NO altera cálculos ni estructura** — solo el contexto del documento.
- **Corrección:** ayuda visible en el picker (`data-testid="fc-modalidad-help"`) que explica exactamente esto; opciones con etiquetas oficiales A/B/C; tooltip por procedencia.
- **Bug conexo corregido:** `CostSheetHeaderEditor` ofrecía `'producción'` (con tilde) que NO pertenece a la unión `FCModalidad` → `inferModalidadFromTemplate` siempre caía al default. Opciones corregidas (sin tilde + se añade Comercialización) e inferencia con normalización de tildes (tolera datos históricos).

### P8 — Permisos: `/api/product-cost-sheets/recalculate` sin membresía por tienda
- **Causa raíz:** única ruta FC sin chequeo de tienda; `recalculateOnPriceChange` opera con service-role (bypass RLS) → un encargado de tienda A podía regenerar FC de productos de tienda B.
- **Corrección (FC-SEC-RECALC):** validación de membresía activa (admin|manager|encargado|costo) en TODAS las tiendas del payload (single y batch), mismo criterio que el resto de rutas FC.

### P9 — Infra: import top-level de ioredis rompía la carga de TODAS las rutas FC en dev
- **Causa raíz:** `fc-pdf-cache.ts` importaba `{ Redis } from 'ioredis'` a nivel de módulo → Turbopack dev fallaba la evaluación («Failed to load external module ioredis-\<hash\>») → quick-pdf y generate-from-template devolvían 500, incluso sin Redis configurado.
- **Corrección (FIX-FC-IORedis-EVAL):** `import type` + carga diferida con `createRequire` SOLO cuando `REDIS_URL`/`KV_REST_API_URL` existe. Sin Redis configurado (dev/E2E) el paquete no se carga → fallback LRU in-memory. Comportamiento dual-mode sin cambios.

---

## 2. Archivos y componentes modificados

**Nuevos (5):**
| Archivo | Propósito |
|---|---|
| `src/lib/export/pdf-export-types.ts` | Fuente única de `PDFFormat`/`ExportOptions`/`AnnexLayout` + metadata de los 10 formatos |
| `src/lib/integration/fc-system-templates.ts` | Catálogo de las 13 plantillas de sistema + `mergeFCTemplateOptions` (fusión pura) |
| `src/lib/export/fc-quick-pdf-body.ts` | Builder del body de quick-pdf (fix array→Record) |
| `src/components/views/terminal/views/cost_sheet/CostSheetPdfPreview.tsx` | «Vistazo» real: preview del PDF con el mismo motor (blob iframe) |
| `e2e/fc-vistazo-pdf.spec.ts` | Spec E2E R1-R5 (aislado, net-zero) |

**Modificados (16):** `quick-pdf/route.ts`, `generate-from-template/route.ts`, `recalculate/route.ts`, `api-schemas.ts`, `useProductCostSheet.ts`, `useCostSheetActions.ts`, `FCTemplatePicker.tsx`, `FCPreviewModal.tsx`, `CostSheetView.tsx`, `CostSheetExportModal.tsx`, `CostSheetHeaderEditor.tsx`, `pdf-generator.ts`, `pdf-format-standard.ts`, `pdf-format-res148.ts`, `fc-template-resolution.ts`, `fc-pdf-cache.ts` + 11 plantillas de datos (`baseRef` 12→12.1) + 2 specs E2E existentes ajustados (aserciones de texto/encabezado).

## 3. Cambios en Supabase

**NINGUNO — sin migraciones ni cambios de RLS.** La auditoría confirmó que el modelo de datos ya soporta el flujo correcto:
- `cost_sheet_templates` (type system/public/private + RLS 20261110120000) es correcta.
- `product_cost_sheets` + `products.cost_sheet_id` (índice único parcial) garantizan 1 FC activa por producto — sin duplicados (E2E verifica).
- Las 13 plantillas de sistema viven en código por decisión de arquitectura previa (CP-PLANTILLAS-FASE2); no se hace seed (evita doble fuente de verdad y datos demo en producción).

## 4. Funcionamiento final del flujo

**Asignación de FC (Inventario → Catálogo → columna FC):**
1. Producto sin FC → modal «Ficha de Costo — {producto}» con guía clara de las tres procedencias.
2. Picker: privadas (RLS owner) + públicas (RLS) + 13 de sistema, con chips de origen y búsqueda.
3. «Modalidad (opcional)» con ayuda en línea (Res. 148/2023, contexto del documento, sin alterar cálculos).
4. Confirmar → POST `/generate-from-template` (UUID de BD o clave de sistema; fail-closed para claves desconocidas) → pipeline cost-engine → upsert `product_cost_sheets` + link `products.cost_sheet_id` + invalidación de caché + auditoría.
5. Feedback «Ficha conectada con «…»» + verificación de persistencia (recarga → vigente).

**Vistazo (sección FC):** menú de modos → «Vistazo» → panel con selector de formato (10) + iframe con el PDF generado por el MISMO motor que «Exportar PDF» → WYSIWYG garantizado; botón «Exportar PDF» abre el mismo `CostSheetExportModal`.

**PDF desde ambos accesos — mismo mecanismo:** sección FC (cliente, `generateCostSheetPDF` → `doc.save`) e inventario (servidor, `quick-pdf` → `generateCostSheetPDF` → binario con caché Redis/LRU por formato). «Estándar» conserva el diseño (`renderStandard` intacto — verificado por bytes: «FICHA DE COSTOS Y GASTOS» + datos reales del producto).

## 5. Pruebas ejecutadas y resultados

| Prueba | Resultado |
|---|---|
| Unit suite completa (`vitest run src/__tests__`) | **5883 passed / 0 failed** (427 archivos; +4 specs FC nuevos/ampliados) |
| Generación de las 13 plantillas de sistema (smoke bun) | **13/13 OK** (antes 2/13) |
| Motor unificado server-side (smoke: standard/res148/ejecutivo/simplificado) | PDFs válidos con datos reales |
| E2E aislado `fc-vistazo-pdf.spec.ts` (nuevo, R1-R5) | **4/4 passed** (2.6m) |
| E2E aislado `fc-template-picker.spec.ts` (regresión completa) | **7/7 passed** (2.5m) |
| E2E smoke CI (mismo filtro que e2e-isolated.yml) | **45/45 passed** (3.2m) |
| Guardrail net-zero (`data-hygiene-guard.cjs`) | **PASS — net delta = 0** |
| tsc --noEmit | Corre en CI (sandbox local: OOM 4GB, limitación conocida) |
| Lint de archivos tocados | 0 errores (4 warnings preexistentes de `<button>` crudo) |

Evidencia visual: `audit-evidence/20261113-fichas-costo/` (R1 selector de formato con Estándar; R3 picker con sistema/privadas/públicas + ayuda modalidad; R4 Vistazo renderizando el documento).

## 6. Seguridad

- E2E exclusivamente contra la BD aislada CostproE2E (guard fail-closed); producción intocada.
- RLS de plantillas verificada (E2E hermano: privadas ajenas → 404; públicas de tienda sin acceso → 404).
- Gap cerrado en `/recalculate` (membresía por tienda; single y batch).
- Sin secretos en el diff (escaneo pre-push: 0 coincidencias).
- `.env` principal restaurado al final; health 200.
