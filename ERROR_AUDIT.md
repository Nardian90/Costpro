# Auditoría de Errores Técnicos - CostPro

## 1. Clasificación Profesional de Hallazgos

| Archivo | Tipo | Severidad | Descripción | Impacto Negocio | Flujo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `src/app/login/page.tsx` | TS | 🔴 Crítico | Propiedad `active_store_id` faltante en objeto User. | Impide el login correcto y asociación de tienda. | Auth / POS |
| `src/components/views/TerminalView.tsx` | TS | 🔴 Crítico | Referencia a `loading` en `AuthStore` (no existe en el store). | Rompe la vista principal del terminal. | Auth / POS |
| `src/components/views/TerminalView.tsx` | TS | 🔴 Crítico | Decenas de `Cannot find name` (Variables/Funciones de estado desaparecidas). | El terminal está funcionalmente roto (POS, Pagos, Filtros). | POS / Terminal |
| `src/components/views/TerminalView.tsx` | TS | 🔴 Crítico | Incompatibilidad de tipos en manejadores de carrito (`CartItem` vs `Product`). | Errores en la lógica de agregado al carrito. | POS |
| `src/components/cost-sheets/CostSheetView.tsx` | TS | 🔴 Crítico | Propiedad `annexes` no existe en el tipo de valores calculados. | Rompe el motor de cálculo de fichas de costo. | Costos |
| `src/components/ProductReceptionView.tsx` | TS | 🔴 Crítico | Objeto `Product` incompleto (faltan 9+ propiedades requeridas). | Falla en la recepción de mercancía y actualización de stock. | Inventario |
| `src/lib/db.ts` | TS | 🔴 Crítico | `PrismaClient` no encontrado en `@prisma/client`. | Riesgo de fallo total en capa de persistencia (si se usa). | Base de Datos |
| `src/components/CatalogView.tsx` | TS | 🟠 Medio | Propiedad `className` no permitida en tipo `Action`. | Posible fallo en renderizado de menús de acción. | POS / Catálogo |
| `src/components/InventoryView.tsx` | TS | 🟠 Medio | Propiedad `className` no permitida en tipo `Action`. | Posible fallo en renderizado de menús de inventario. | Inventario |
| `src/components/ui/ProductImage.tsx` | TS | 🟠 Medio | `null` no asignable a `string \| StaticImport`. | Errores visuales/runtime al cargar imágenes de productos. | UI / Catálogo |
| `src/components/theme-provider.tsx` | TS | 🟠 Medio | Módulo `next-themes/dist/types` no encontrado. | Inestabilidad en el sistema de temas. | UI |
| `src/components/views/terminal/POSView.tsx` | TS | 🟠 Medio | `null` no asignable a tipos de entrada (string/number). | Bugs menores en inputs del POS. | POS |
| `src/components/CostProLogo.tsx` | TS | 🟢 Bajo | Mismatch en tipos de variantes de framer-motion (ease). | Animación del logo podría no comportarse como se espera. | UI |
| `src/components/ui/DataDecryption.tsx` | TS | 🟢 Bajo | Uso de propiedad `yoyo` obsoleta en transiciones. | Advertencia de deprecación en consola. | UI |
| `examples/websocket/*` | TS | 🟢 Bajo | Dependencias faltantes (`socket.io`). | Ejemplos no compilables. | Otros |
| `skills/frontend-design/*` | TS | 🟢 Bajo | Errores de tipos en archivos de entrenamiento/ejemplo. | Ruido en el build. | Otros |

## 2. Mapa de Riesgo Técnico del Frontend

### Zona Roja (Inminente)
- **TerminalView.tsx:** Es un monolito de +1500 líneas con referencias a variables inexistentes. Sugiere una refactorización fallida o incompleta.
- **Flujo de Auth:** El desajuste en la interfaz `User` (`active_store_id`) afectará cualquier operación que dependa del contexto de la tienda activa.
- **Motor de Costos:** La falta de `annexes` en el estado de cálculo impide la integridad de las fichas de costo v5.

### Zona Naranja (Deuda Técnica)
- **Stores Zustand:** Uso inconsistente de propiedades (ej. `loading` en auth vs ui store).
- **Tipado de Supabase/RPCs:** Prácticamente todos los llamados a `supabase.rpc` (ej. `get_products_for_pos`, `create_sale`, `register_reception`) carecen de genéricos de retorno, delegando la seguridad de tipos a `any`. Se observa un uso excesivo de objetos parciales que no cumplen con las interfaces definidas.

### Zona Verde (Mantenimiento)
- **UI/Animaciones:** Errores menores en configuraciones de `framer-motion`.
- **Ejemplos:** Código muerto o de ejemplo que ensucia el proceso de build.

## 3. Resumen Ejecutivo

- **Riesgo Actual:** Crítico. El sistema no compila y tiene fallos de lógica estructural en el terminal y el motor de costos.
- **Zonas Críticas:** `TerminalView`, `Auth/Session`, `CostSheetCalculator`, `ProductReception`.
- **Impacto si se despliega así:** El sistema es inoperable. El POS no cargaría, el login fallaría en la validación de tienda, y los cálculos de costos arrojarían errores de runtime (undefined access). Se ha perdido la integridad entre las interfaces de tipos y la implementación real.
- **Estado de Ingeniería:** Se ha recuperado la visibilidad. El build falla "correctamente", exponiendo la deuda técnica acumulada y los errores de refactorización silenciosos.

## 4. Actualización Día 3 – Validación de Datos y Contratos Fuertes (Netlify-safe)

### Avances Realizados
- **Infraestructura de Build:** Se ajustó `netlify.toml` para ejecutar `pnpm prisma generate` antes del build, eliminando el fallo de `PrismaClient` no encontrado.
- **Contratos de Datos (Zod):**
    - Implementación de esquemas Zod en `src/validation/schemas.ts` para todas las entidades críticas (`User`, `Product`, `Transaction`, `CostSheet`).
    - Validación estricta en el 100% de los llamados RPC críticos (`get_products_for_pos`, `get_dashboard_kpis`, `create_sale`, `register_reception`).
    - Los stores de Zustand (`Auth`, `Cart`, `CostSheet`) ahora validan los datos entrantes antes de actualizar el estado global.
- **Resiliencia:** Implementación de un `rpc-validator` centralizado que registra errores de validación sin romper el flujo del usuario en producción, pero alertando en desarrollo.

### Estado de los Hallazgos Anteriores
- `src/lib/db.ts` (PrismaClient): **SOLUCIONADO** (Build-time generation).
- Tipado de Supabase/RPCs: **SOLUCIONADO** (Capa de validación Zod integrada).
- Stores Zustand (Inconsistencias): **MITIGADO** (Validación en el punto de entrada).

### Riesgo Residual
- **Lógica de Negocio en TerminalView:** Aunque los datos ahora están validados, la complejidad del componente `TerminalView` sigue siendo alta. Se recomienda seguir con la modularización.
- **Sincronización de Tipos:** Es vital mantener sincronizados los esquemas de Zod con las interfaces de TypeScript para evitar discrepancias.
