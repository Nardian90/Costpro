# Reporte de Salud de la Arquitectura - Pipeline v8.0

Este reporte detalla las anomalías detectadas durante la **Fase 6 (Architecture Health)** del Ciclo 1.

---

## 1. Ciclos Detectados (2)

Los ciclos de dependencia rompen la modularidad y dificultan las pruebas unitarias.

| Ciclo | Componentes Involucrados | Complejidad | Estrategia de Resolución |
| :--- | :--- | :--- | :--- |
| **Ciclo A** | `InventoryCountTableView` <-> `InventoryCountView` | **Media** | Extraer lógica de estado compartida a un Hook (e.g., `useInventoryCount`) para que la vista y la tabla dependan del hook y no entre sí. |
| **Ciclo B** | `InventoryCountView` <-> `InventoryCountCardView` | **Media** | Usar el patrón de Inyección de Dependencias o pasar callbacks a través de props para evitar que el hijo importe al padre. |

---

## 2. Componentes Huérfanos (17)

Estos archivos no tienen dependencias entrantes ni salientes detectadas por el AST. Pueden ser archivos muertos o puntos de entrada desacoplados (como rutas de API).

| Categoría | Archivos | Complejidad | Estrategia |
| :--- | :--- | :--- | :--- |
| **API Routes** | `api/route.ts`, `api/cost-sheets/import-anexo/route.ts`, `api/cost-sheets/export-pdf/route.ts`, `api/system-health/knowledge/route.ts`, `api/sync/batch/route.ts`, `api/logs/route.ts` | **Baja** | Son puntos de entrada. Validar si se usan desde el cliente (fetch) o si son obsoletos. Si se usan, marcarlos como `type: Integration`. |
| **Views / UI** | `wiki/page.tsx`, `SystemDependencyGraph.tsx`, `UserFlowDiagram.tsx`, `MobileFlowDiagram.tsx`, `CashFlowDiagram.tsx` | **Baja** | Integrar en el `viewRegistry` o en la navegación principal si son funcionales. |
| **Shadcn UI** | `ui/sonner.tsx`, `ui/aspect-ratio.tsx`, `ui/collapsible.tsx` | **Muy Baja** | Componentes base que aún no se han instanciado en ninguna vista. Mantener como librería. |
| **Otros** | `lib/db.ts`, `mocks/matching-log-service.ts`, `types/react-syntax-highlighter.d.ts` | **Baja** | Verificar referencias dinámicas. El mock y los tipos son necesarios pero no forman parte del grafo de ejecución principal. |

---

## 3. Estrategia de Resolución Global

1.  **Refactor de Inventario:** Priorizar la ruptura de ciclos en el módulo `inventory_count`. Es el punto más crítico de degradación (Score -10).
2.  **Limpieza de API:** Auditar las 6 rutas huérfanas. Si no hay llamadas `fetch` activas en el código, eliminar para reducir superficie de ataque.
3.  **Registro de Vistas:** Asegurar que todos los diagramas huérfanos estén registrados en `src/config/viewRegistry.ts`.

---

## 4. Prompt para JULES (Resolución Eficiente)

Copia y pega este prompt para que JULES resuelva los problemas técnicos:

> **JULES, actúa como Senior Architect:**
>
> Tenemos un problema de integridad (Score 73/100) en el módulo de Inventario y varios componentes huérfanos.
>
> 1. **Rompe los ciclos** en `src/components/views/terminal/views/inventory_count/`. Extrae la lógica de manejo de estado a un hook dedicado `useInventoryCount.ts`. Asegúrate de que `InventoryCountView.tsx`, `InventoryCountTableView.tsx` y `InventoryCountCardView.tsx` usen este hook y eliminen las importaciones circulares entre ellos.
> 2. **Audita los huérfanos:** Revisa si las rutas de API en `src/app/api/` tienen referencias en el proyecto. Si no se usan, bórralas.
> 3. **Verifica Shadcn:** Los componentes en `src/components/ui/` que están huérfanos son aceptables si son parte de la librería base, pero valídalos.
>
> Al finalizar, ejecuta `python3 scripts/scheduler.py` para validar que el `integrityScore` haya subido por encima de 90.
