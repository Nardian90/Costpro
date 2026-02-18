# Changelog

All notable changes to this project will be documented in this file.
## [5.6.5] - 2026-02-18

### Added
- **Soporte para Compañeros JSON en Academy**: El motor de generación de flashcards ahora busca automáticamente archivos `.json` que acompañen a los manuales PDF. Si se encuentra un JSON (ej. `1482023.json` para `Res1482023.pdf`), se utiliza como contexto estructurado prioritario para mejorar la precisión de la IA.

### Changed
- **Migración a Gemini 1.5 Flash**: Actualización del modelo predeterminado a `gemini-1.5-flash` tras la depreciación de versiones preview anteriores.
- **Hardening de Errores de AI**: Mejora integral en la gestión de excepciones del `GeminiAdapter`. Ahora se distinguen claramente errores de API Key (401/403), errores de Modelo (404) y límites de cuota, proporcionando mensajes de error accionables al usuario en la interfaz.
- **Propagación de Errores en API**: La ruta de generación de Academy (`/api/academy/generate`) ahora propaga errores específicos de AI directamente al usuario, evitando mensajes genéricos y facilitando el diagnóstico.

**Nota de Handoff para UX:** No se requieren cambios visuales. Se ha mejorado la claridad de los mensajes de error mostrados mediante Toasts cuando hay problemas con la configuración de la IA o el contenido de los manuales.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.7.25] - 2026-03-14

### Added
- **Integración de Modo Rápido con Generación Masiva**: Nueva funcionalidad que permite la creación express de múltiples fichas de costo desde una tabla simplificada.
- **Transición Automatizada**: Los productos ingresados en Modo Rápido se pre-pueblan automáticamente en el motor de Generación Masiva, eliminando la entrada duplicada de datos.
- **Documentación Visual**: Incorporación de diagramas SVG explicativos en la sección de Ayuda para guiar al usuario en el nuevo flujo de trabajo.

## [5.7.24] - 2026-03-06

### Added
- **Next-Gen Welcome Landing**: Rediseño total de la página de inicio con enfoque en Showcase de Producto y diseño Bento.
- **Desacoplamiento de Autenticación**: El flujo de login ahora es independiente de la interfaz de marketing, mejorando la primera impresión y la velocidad de carga.

## [5.7.23] - 2026-03-02

### Changed
- **Hardening de Contratos y Observabilidad**: Refuerzo de la integridad de datos mediante validación Zod en hooks de API para Dashboard, Ventas y Tiendas.
- **Trazabilidad Total**: Implementación de logging estructurado (`withLogging`) en todos los flujos de datos críticos para facilitar la auditoría técnica.

## [5.7.22] - 2026-03-01

### Changed
- **Hardening de Contratos RPC (v10.4)**: Refuerzo integral de la capa de comunicación con la base de datos.
- **Validación Estricta de Parámetros**: Implementación de esquemas Zod explícitos para múltiples RPCs críticos (`managed_delete_product`, `managed_toggle_product_active`, `create_transfer`, `confirm_transfer`, `get_sales_since_last_closure`, `get_transferable_stores`, `get_audit_logs`, `perform_inventory_adjustment`).
- **Cierre de Agujeros de Lógica**: Eliminación del mapeo manual de parámetros en hooks de API (`useAdjustStock`, `useBulkUpdateProducts`, `useAuditLogs`), sustituyéndolo por validación y parsing tipado en la entrada de la mutación.
- **Contratos de Servicio Fortalecidos**: Los servicios de Caja (`cash-service.ts`) y Transferencias (`transfer-service.ts`) ahora validan sus argumentos contra el esquema contractual antes de realizar llamadas a Supabase.
- **Integridad de Datos en Transferencias**: El flujo de transferencias ahora cuenta con una validación de esquema profunda para los ítems JSONB, asegurando consistencia en precios y cantidades.

**Nota de Handoff para UX:** No hay cambios visuales. Esta actualización mejora la estabilidad del sistema y proporciona retroalimentación de error inmediata y precisa en entornos de desarrollo cuando hay desajustes de datos.

## [5.7.21] - 2026-02-27

### Changed
- **IPV Builder Mobile & Demo (v10.2)**: Optimización ergonómica y funcional del módulo de conciliación.
- **Experiencia Mobile-First**: Implementación de pestañas scrollables y layouts responsivos en todas las sub-vistas del IPV Builder. Se estandarizaron las tablas al sistema global de scroll y se incrementaron los touch targets a un mínimo de 44px para acciones críticas.
- **Generador de Extractos Demo**: Incorporación de una herramienta de generación de datos sintéticos realistas para pruebas inmediatas del motor de matching (Hard Ref, Exact Sum, Tolerance, Debits).
- **Refactorización Ergonómica**: Los botones de acción principal (Ejecutar Matching, Ingesta) ahora ocupan el ancho total y tienen mayor altura en móviles, facilitando la operación con una sola mano.

## [5.7.20] - 2026-02-27

### Changed
- **Hardenización de IPV Builder (v10.1)**: Mejora sustancial en la gestión administrativa del módulo.
- **Edición Total de Catálogo**: Implementación de edición inline y creación manual de productos, permitiendo un control granular de todos los campos (UM, Paquetes, Precios, Prioridades).
- **Mantenimiento Simplificado**: Adición de funciones de reinicio maestro en la sección de Ingesta para limpiar selectivamente transacciones, catálogo o estados de conciliación.
- **Auditoría y Certificación**: Emisión de certificación de funcionalidad al 100% tras auditoría técnica de persistencia e integridad.

## [5.7.19] - 2026-02-27

### Added
- **Módulo IPV Builder (v10.0)**: Lanzamiento de la nueva herramienta definitiva para conciliación bancaria y generación de IPV automatizada.
- **Persistencia Local Robusta**: Implementación de IndexedDB vía Dexie.js para almacenamiento seguro de transacciones, catálogo y reportes directamente en el navegador.
- **Motor de Matching Multi-Pass**: Nuevo motor de conciliación declarativo ejecutado en un Web Worker con 4 niveles de análisis: `HARD_REF`, `EXACT_SUM` (Backtracking), `TOLERANCE` y `CASH_FILL`.
- **Precisión Monetaria**: Procesamiento de todos los valores monetarios en centavos (enteros) para garantizar integridad contable absoluta sin errores de redondeo.
- **Generación de Reportes PDF**: Capacidad de generar reportes IPV profesionales en formato PDF de forma local (en memoria del navegador) con un solo clic.
- **Gestión de Ingesta Inteligente**: Soporte para carga masiva de extractos bancarios (CSV/XLSX) con detección de duplicados mediante hashes SHA-256 e importación/exportación de catálogo de productos.
- **Dashboard de Control**: Vista unificada con KPIs de conciliación (Completadas, Pendientes, Parciales) y gestión de ajustes de efectivo auditables.

## [5.7.18] - 2026-02-27

### Changed
- **Refactor de Flujo en Ficha de Costo**: Optimización de la navegación en la vista de Ficha de Costo. Se eliminó la carga automática de la "Sección 1" y el botón redundante de "Secciones".
- **Navegación Intuitiva**: Implementación de un menú desplegable (`DropdownMenu`) en "Tabla Principal" para selección directa de sub-secciones y una vista de cuadrícula de selección inicial.
- **Hardenización de Estado Inicial**: El sistema ahora inicia con todos los valores en cero (excepto fórmulas de cálculo) y anexos vacíos, garantizando un lienzo limpio para nuevos presupuestos.
- **Función de Ejemplo Realista**: Incorporación de un botón "Cargar Ejemplo" que genera automáticamente una estructura de costos lógica para la producción de pan artesanal, permitiendo una rápida demostración de las capacidades de la herramienta.
- **Resiliencia de Reset**: Mejora en la función de reinicio para limpiar datos históricos e ingresos manuales preservando la integridad de las fórmulas de la columna total.

**Nota de Handoff para UX:** Se ha unificado la navegación de secciones dentro del botón "Tabla Principal". La interfaz ahora presenta una cuadrícula de opciones cuando no hay una sección activa, mejorando la ergonomía y claridad del flujo de trabajo.

## [5.7.17] - 2026-02-26

### Changed
- **Optimización Mobile POS (Thumb Zone)**: Rediseño del carrito de ventas en TPV para dispositivos móviles. Se ha implementado un layout de columna donde la lista de productos es desplazable pero el resumen de totales y el botón "Finalizar Venta" permanecen fijos en la base (zona natural del pulgar), eliminando la necesidad de scroll para completar la transacción.
- **Navegación Persistente (Sticky POS)**: La barra de búsqueda y los filtros de categoría en el TPV ahora son fijos (`sticky`) en la parte superior, garantizando acceso inmediato a las herramientas de filtrado sin importar la longitud del catálogo.
- **Hardenización de Touch Targets**: Incremento masivo de áreas táctiles a un mínimo de 44px en elementos críticos (Chips de Categoría, Botones de acción, Menú de Terminal) para reducir errores de pulsación accidental.
- **Feedback Táctil Inmediato**: Incorporación de micro-animaciones de presión (`active:scale-95`) en tarjetas de producto y botones de acción, proporcionando confirmación visual instantánea de la interacción táctil.
- **Actualización de Documentación Visual**: Sincronización de los diagramas de ayuda en `MobilePosDiagram.tsx` para reflejar la nueva interfaz de TPV persistente y las mejoras ergonómicas.
### Hardening
- **Centralización de Perfil de Usuario**: Migración de la lógica de recuperación y normalización de perfiles a `userService.getUserProfile`. Se eliminó lógica dispersa y repetitiva en `useSessionManager` y `LoginPage`.
- **Contratos de Datos Resilientes**: Implementación de `z.preprocess` en esquemas Zod (`userStoreMembershipSchema`, `receiptItemSchema`, `transferWithDetailsSchema`) para normalizar automáticamente las relaciones de Supabase (conversión de arreglos a objetos).
- **Resiliencia ante Cambios de Esquema**: Incorporación de fallbacks defensivos para el error 42703 (columna inexistente) en el servicio de perfil, permitiendo que la sesión se inicie correctamente incluso durante procesos de migración de base de datos.
- **Limpieza de Tipado Estricto**: Eliminación de múltiples instancias de `as any` en `useUsers` y `base.ts`, sustituyéndolos por interfaces específicas y tipos desconocidos seguros.
- **Eficiencia en Consultas RSS**: Actualización de `rss-service.ts` para utilizar selección explícita de columnas, siguiendo los estándares de performance del proyecto.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha reforzado la estabilidad del inicio de sesión y la gestión de usuarios.

## [5.7.16] - 2026-02-26

### Fixed
- **Responsividad en Recepción**: Refactorización de la lista de ítems y el resumen de costos en `ProductReceptionView.tsx`. Se implementó el uso de `table-scroll-wrapper` y `data-table` con anchos mínimos garantizados, asegurando que toda la información (incluyendo subtotales y costos totales) sea accesible mediante scroll horizontal en dispositivos móviles.

## [5.7.15] - 2026-02-26

### Changed
- **Hardenización de Contratos de API**: Implementación de validación estricta de parámetros y respuestas para todas las mutaciones críticas (`products`, `users`, `transactions`).
- **Zero-Tolerance Policy en RPC**: Actualización del validador de RPC para lanzar errores explícitos en entornos de desarrollo ante desajustes de contrato, eliminando fallos silenciosos.
- **Corrección de Flujo de Venta**: Resolución de un error de tipado en el TPV que impedía la extracción correcta del ID de venta tras una transacción exitosa.
- **Sincronización de Esquemas Zod**: Creación de nuevos esquemas de entrada (`createProductInputSchema`, `updateProductInputSchema`, `managedCreateUserParamsSchema`) para asegurar que solo datos válidos lleguen a la base de datos.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha reforzado la estabilidad interna del sistema y la captura de errores en tiempo de desarrollo.
### Fixed
- **Estandarización de Tablas en TPV**: Se ha refactorizado la vista de tabla del TPV (`POSTableView.tsx`) para utilizar el contenedor responsivo estándar (`table-scroll-wrapper`) y las clases de datos (`data-table`). Esta corrección elimina el solapamiento del encabezado sobre la primera fila y alinea el diseño con el historial de ventas.

## [5.7.14] - 2026-02-26

### Fixed
- **Actualización Manual en Caja**: Implementación de un botón de "Actualizar" en la vista de Cierre de Caja. Esto permite a los operadores forzar la sincronización de las ventas más recientes del sistema, garantizando que el balance esperado sea siempre preciso antes de realizar el arqueo.
- **Pre-filtrado de Noticias**: Configuración del filtro de "Prioritarias" como activo de forma predeterminada en el Agregador de Noticias. Esta mejora permite a los usuarios visualizar inmediatamente la información más crítica (tasas de cambio, alertas) al entrar en la sección.

**Nota de Handoff para UX:** Se ha añadido un botón de refresco con animación de rotación en la vista de Caja. En la vista de Noticias, el botón de filtro ahora aparece resaltado en ámbar al cargar, indicando que el modo de prioridad está activo.

## [5.7.13] - 2026-02-25

### Fixed
- **Validación Permisiva de UUID**: Sustitución de la validación estricta de UUID v4 por un patrón regex permisivo en todos los esquemas Zod y hooks de API. Esto permite operar con datos de demo que poseen UUIDs no estandarizados sin bloquear la interfaz.
- **Consistencia de Store ID en TPV**: Unificación del uso de `active_store_id` en el flujo de facturación y auditoría del TPV.
- **Normalización Global de Cache**: Centralización de `getCleanStoreId` en la base de hooks de API y aplicación uniforme en todos los módulos (`products`, `inventory`, `dashboard`, `transactions`, `receptions`, `transfers`, `movements`, `cash`).
- **Resiliencia de Terminal**: Corrección de la instanciación de `queryClient` en `TerminalShell.tsx` para garantizar la invalidación de caché durante el cambio de sucursal.
- **Enriquecimiento de Demo Data**: Actualización de los scripts de reset SQL para incluir un catálogo de productos demo (Abarrotes, Lácteos, Limpieza) vinculados a la tienda por defecto.

## [5.7.12] - 2026-02-25

### Fixed
- **Arquitectura POS Zero-Latency**: Implementación de una nueva estrategia de carga de datos para el Punto de Venta (TPV). El sistema ahora descarga el catálogo completo una sola vez y realiza todo el filtrado (búsqueda y categorías) de forma local, eliminando latencias de red en cada pulsación de tecla.
- **Sincronización de Cache y Prefetch**: Unificación de las claves de consulta (`queryKey`) y la lógica de normalización de `storeId` entre los hooks de API y el pre-cargado global, garantizando que el TPV utilice datos ya descargados instantáneamente.
- **Visibilidad en Auditoría**: Los procesos de pre-carga de productos ahora están integrados con el `QueryInspector`, permitiendo a los administradores auditar la carga inicial del catálogo desde el panel de control.
- **Hardenización de Hooks**: Refuerzo de `useProducts` y `usePOSProducts` con validaciones defensivas y manejo de tipos estrictos para prevenir estados "Sin Resultados" erróneos ante contextos de tienda inconsistentes.

## [5.7.11] - 2026-02-25

### Fixed
- **Restauración del Módulo RSS**: Sincronización completa con la versión de referencia "fuente de la verdad". Se ha migrado la infraestructura de noticias a una arquitectura más robusta basada en el agregador inteligente de la versión v5.7.
- **Normalización de Tipos de Datos**: Actualización de interfaces a `RSSNewsItem`, incorporando soporte para detección automática de tasas de cambio (BCC) y metadatos de moneda.
- **Optimización de Servicios y Hooks**: Implementación de `useRSSNews` y `useRSSFeeds` con políticas de staleTime de 5 minutos, reduciendo la carga sobre la API y mejorando la respuesta de la interfaz.
- **Refactorización de la API de Agregación**: La ruta `/api/rss` ahora devuelve un objeto estructurado `{ items: [...] }` para compatibilidad total con el frontend táctico, resolviendo fallos de carga previos.
- **Limpieza de Arquitectura**: Eliminación de utilidades redundantes (`rss-utils.ts`) en favor de una lógica de clasificación integrada y altamente eficiente en el lado del servidor.

**Nota de Handoff para UX:** Se ha actualizado la vista de Noticias con un nuevo diseño de tarjetas que resalta automáticamente las tasas de cambio y las noticias prioritarias mediante indicadores visuales ámbar y esmeralda. El buscador y los filtros de prioridad ahora operan en tiempo real sobre el set de datos cacheado.

## [5.7.10] - 2026-02-24

### Fixed
- **Resolución de Recursión Infinita en RLS**: Implementación de funciones `SECURITY DEFINER` para romper ciclos de dependencia circular entre las tablas `profiles` y `user_store_memberships`.
- **Hardenización de Gestión de Usuarios Multi-Tienda**: Refuerzo del RPC `manage_user_memberships` para permitir actualizaciones parciales seguras, evitando que los encargados afecten accesos fuera de su visibilidad.
- **Validación de Límites de Negocio**: Incorporación de validación Zod cruzada en `UserForm.tsx` para asegurar que el número de tiendas asignadas respete el `maxStoresLimit` del encargado.
- **Mejora de Visibilidad en Edición**: Ajuste de políticas de seguridad y hooks de API para garantizar que los encargados puedan visualizar y editar todos los accesos de los usuarios bajo su gestión de forma transparente.
- **Robustez del Script de Reset**: Corrección del error PostgreSQL 42P13 en el script de reinicio de demo mediante el uso de `DROP FUNCTION` preventivo, asegurando la compatibilidad de firmas de funciones en entornos con esquemas preexistentes.

**Nota de Handoff para UX:** Se han añadido mensajes de error descriptivos en el formulario de usuarios para guiar al administrador cuando se exceden los límites de tiendas o hay errores de validación. La interfaz ahora responde correctamente al guardar cambios tras resolver los bloqueos de base de datos.

## [5.7.8] - 2026-02-22

### Changed
- **Optimización de Performance y SEO**: Implementación de `preconnect` para Supabase y actualización del manifiesto PWA con iconos PNG de alta resolución (512px) para mejorar la carga inicial y compatibilidad con splash screens.
- **Mejora de Accesibilidad y Legibilidad**: Actualización masiva de tamaños de fuente (incremento a 12px/text-xs) y relaciones de contraste en componentes críticos (Sidebar, Dashboard, ChatBot) para cumplir con estándares WCAG y mejorar la puntuación en Lighthouse.
- **UX de ChatBot**: Incorporación de etiquetas ARIA y refinamiento visual de la interfaz de Jules para una mejor experiencia en dispositivos móviles.

**Nota de Handoff para UX:** Se han realizado ajustes menores en tamaños de fuente y opacidad de etiquetas para mejorar la legibilidad. No se han alterado los layouts ni la estructura visual existente.

## [5.7.7] - 2026-02-21

### Fixed
- **Hardenización de Validaciones de UUID**: Eliminación de pipes redundantes en esquemas Zod (`resilientUuid`) que provocaban fallos al recibir valores nulos o vacíos.
- **Resiliencia de Hooks de Productos e Inventario**: Incorporación de validaciones `isUuid` y retornos tempranos en los hooks `useProducts` y `useInventory`, evitando el crash de la interfaz "Invalid UUID" cuando el contexto de la tienda es inconsistente.
- **Robustez de Dashboard**: Actualización de la lógica de prefetch y carga de datos en el Dashboard para manejar de forma segura parámetros de tienda malformados.

**Nota de Handoff para UX:** No hay cambios visuales. Se han resuelto los errores de validación que bloqueaban la visualización de los paneles de Dashboard e Inventario ante inconsistencias en el ID de la tienda activa.

## [5.7.6] - 2026-02-21

### Fixed
- **Hardenización de Formulario de Usuarios**: Actualización de `userFormSchema` para que `maxStoresLimit` y `maxUsersLimit` sean opcionales con valores predeterminados seguros (0), eliminando errores de compilación con `zodResolver`.
- **Validación de UUID en RPCs**: Implementación de validación estricta de UUID para `p_store_id` mediante el paquete `uuid` en los hooks `useDashboard` y `useInventory`, evitando errores de base de datos ante IDs malformados.
- **Resiliencia de Dashboard e Inventario**: Refuerzo de la lógica de cálculo de márgenes en el Dashboard para evitar divisiones por cero y adición de filtrado defensivo de UUIDs en la vista de Inventario para garantizar la estabilidad de la interfaz ante datos parciales.
- **Resolución de Errores de Sintaxis**: Corrección de errores críticos de parsing en `UserFormModal.tsx` (lógica de renderizado en modo creación) y `TransferDetailsModal.tsx` (etiquetas JSX mal cerradas) que bloqueaban el despliegue.

**Nota de Handoff para UX:** No hay cambios visuales significativos. Se ha mejorado la estabilidad general y se ha resuelto un problema que impedía cargar el formulario de creación de nuevos usuarios.

## [5.7.5] - 2026-02-21

### Fixed
- **Resolución de Conflictos de CSP y Service Worker**: Actualización de las políticas de seguridad de contenido (CSP) en `next.config.ts` para permitir la carga de Workbox desde el CDN de Google (`storage.googleapis.com`), resolviendo fallos en el registro del Service Worker.
- **Limpieza de Cabeceras de Permisos**: Eliminación de la directiva `interest-cohort` (FLoC) de `Permissions-Policy` para eliminar advertencias de características no habilitadas en navegadores modernos.
- **Hardenización de Generación de Reportes**: Refuerzo de la API `/api/reports/generate` con validaciones defensivas de parámetros y manejo de errores específico para el sistema de almacenamiento.
- **Infraestructura de Reportes**: Nueva migración para garantizar la existencia y permisos del bucket de almacenamiento `reports`, solucionando el error crítico "Bucket not found" que impedía la descarga de documentos.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha restaurado la funcionalidad de generación de reportes PDF y se ha habilitado correctamente el soporte PWA (Service Worker) que estaba bloqueado por políticas de seguridad.

## [5.7.4] - 2026-02-20

### Fixed
- **Hardenización de Validaciones de ID (Zod Resilience)**: Implementación de esquemas `resilientUuid` y `optionalResilientUuid` para manejar de forma segura valores "JS-ism" comunes como `'null'`, `'undefined'` o cadenas vacías provenientes de estados serializados o parámetros de URL.
- **Resiliencia de Hooks de API**: Refuerzo de los hooks `useInventory`, `useDashboard` y `useTransactions` con limpieza defensiva de `storeId` y cláusulas de salvaguarda que previenen llamadas a RPCs con parámetros inválidos, evitando fallos en cascada en la interfaz.
- **Robustez de Entidades**: Actualización de los esquemas de validación de respuesta para `Transaction`, `Receipt`, `AuditLog` y `Product` para ser tolerantes a datos inconsistentes en campos de ID no críticos, asegurando que la interfaz se mantenga operativa incluso ante anomalías en los datos.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha resuelto un problema que provocaba errores críticos (pantallas de error) en el Dashboard e Inventario cuando el contexto de la tienda no estaba perfectamente definido en el estado global.

## [5.7.3] - 2026-02-19

### Changed
- **Hardening de Contratos RPC**: Implementación de validación estricta de parámetros mediante Zod para los RPCs críticos (`create_sale`, `register_reception`, `perform_inventory_adjustment`, `bulk_update_products`, `get_paginated_products`, `get_products_for_pos`).
- **Eliminación de Tipado Ambiguo**: Sustitución sistemática de tipos `any` en los hooks de mutación de la API por contratos definidos y validados.
- **Refuerzo de Integridad de Respuesta**: Incorporación de `validateRPCResponse` y `validateRPCArrayResponse` en flujos de escritura para garantizar que las respuestas del servidor cumplan con el esquema esperado antes de propagar cambios al estado local.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha fortalecido la infraestructura de datos para prevenir errores silenciosos y estados inconsistentes en la interfaz.

## [5.7.2] - 2026-02-18

### Changed
- **Refinamiento de Personalidad de Jules**: Optimización del prompt de sistema para un tono más práctico, directo y menos técnico.
- **Mejora de UX en Respuestas**: Implementación de reglas de concisión extrema (lectura en <5s) y simplificación de terminología contable (e.g., "Ganancia" en lugar de "Utilidad Bruta").
- **Optimización Visual**: Inclusión de emojis y listas simplificadas para mejorar la legibilidad rápida en dispositivos móviles.

**Nota de Handoff para UX:** Jules ahora responde de forma mucho más directa, evitando introducciones innecesarias. Se ha simplificado el lenguaje para que sea comprensible por cualquier operador de tienda sin formación contable avanzada.

## [5.7.1] - 2026-02-18

### Fixed
- **Actualización a Gemini 2.5 Flash Preview**: Migración del modelo predeterminado a `gemini-2.5-flash-preview-09-2025` tras detectar que `gemini-1.5-flash` ya no está disponible en la versión `v1beta` del entorno de producción.

## [5.7.0] - 2026-02-18

### Added
- **Integración con SDK Oficial de Google AI**: Migración de llamadas REST manuales al SDK `@google/generative-ai` para mayor estabilidad y compatibilidad con funciones avanzadas (como system instructions nativas).
- **Soporte Estricto para Gemini 1.5 Flash**: Configuración del bot para usar específicamente el modelo `gemini-1.5-flash` con la versión de API `v1beta`, cumpliendo con los requisitos de compatibilidad de Jules.

## [5.6.9] - 2026-02-18

### Fixed
- **Actualización de Modelos Gemini**: Migración del modelo predeterminado de `gemini-1.5-flash` a `gemini-2.0-flash` para asegurar compatibilidad en entornos de producción actuales (2026) donde las versiones legacy han sido deprecadas.
- **Hardenización de GeminiAdapter**: Refuerzo del algoritmo de alternancia de roles para manejar casos complejos de mensajes consecutivos del mismo rol mediante la fusión de partes de mensaje, evitando errores 400 de la API de Google.
- **Resiliencia de Servicio**: Añadida validación defensiva en `botService` para prevenir errores de puntero nulo en hilos de conversación vacíos.
- **Logs de Diagnóstico**: Incorporación de `stack` y `cause` en los logs de error de la API del bot para acelerar la resolución de incidencias en producción.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha restaurado la conectividad del bot Jules tras una actualización de modelos por parte de Google.

## [5.6.8] - 2026-02-18

### Fixed
- **Robustez de Gemini**: Refactorización del `GeminiAdapter` para garantizar el cumplimiento estricto del protocolo de chat (alternancia de roles, inicio con 'user', no mensajes vacíos).
- **Control de Seguridad**: Implementación de manejo explícito de bloqueos por filtros de seguridad de IA en la interfaz.
- **Transparencia de Errores**: Mejora en la visualización de errores del bot, mostrando mensajes detallados directamente en el chat para facilitar el diagnóstico.
- **Hardenización de API**: Refuerzo de la ruta `/api/bot/chat` con logs detallados en servidor y respuestas HTTP 502 diferenciadas para fallos de proveedores externos.

**Nota de Handoff para UX:** Se han añadido mensajes de error contextuales dentro de la burbuja del bot. El diseño se mantiene intacto, pero la retroalimentación al usuario es ahora mucho más clara cuando hay problemas de conectividad o configuración con la IA.

## [5.6.6] - 2026-02-18

### Fixed
- **Hardening de Persistencia de IA**: Corregido error en `useSessionManager` que provocaba la pérdida de la configuración del bot (API Key y Proveedor) al recargar la página por falta de selección de columnas en el perfil.
- **Resiliencia de Configuración**: Mejora en `ChatBot.tsx` para evitar el borrado accidental de la API Key en el estado local cuando se actualiza solo el proveedor de IA.
- **Sincronización de Contratos**: Actualización de `profileSchema` y `UserContract` para asegurar que las preferencias de IA se mantengan consistentes durante todo el ciclo de vida de la sesión.

**Nota de Handoff para UX:** No hay cambios visuales. Se ha resuelto un bug crítico que impedía que el chat permaneciera habilitado tras guardar la configuración o refrescar el navegador.

## [5.6.5] - 2026-02-18

### Added
- **Multi-AI Bot ("Jules")**: Implementación de un asistente inteligente capaz de alternar dinámicamente entre proveedores de IA (Gemini, GPT).
- **Arquitectura de Adapters**: Nueva capa en `src/lib/ai` que estandariza las llamadas a LLMs mediante la interfaz `LLMProvider`.
- **Bot Orchestrator**: Sistema de orquestación que selecciona el modelo adecuado según la configuración de entorno (`LLM_PROVIDER`).
- **Bot Service**: Integración con la base de datos de Supabase para proporcionar contexto en tiempo real (Stock Crítico, Ventas del día) a la IA.
- **Floating Chat Widget**: Nueva interfaz de chat neumórfica integrada en la terminal para interacción directa con Jules.
- **Auditoría de IA**: Registro automático de todas las consultas y respuestas del bot en la tabla `audit_logs` para trazabilidad operativa.

**Nota de Handoff para UX:** Se ha añadido el componente `ChatBot` como un widget flotante en la esquina inferior derecha. El diseño utiliza animaciones de Framer Motion y sigue la estética de "Cyber Shell" del proyecto. Se recomienda revisar la accesibilidad del widget en dispositivos móviles muy pequeños.

## [5.6.4] - 2026-02-17

### Added
- **Sistema de Sincronización Offline -> Online**: Implementación de una arquitectura de sincronización robusta para permitir operaciones CRUD (Ventas, Recepciones, Ajustes, Transferencias) sin conexión a internet.
- Infraestructura de persistencia local mediante **IndexedDB** (`localforage`) para encolar operaciones y mantener snapshots de datos.
- **Background Sync**: Integración con Service Worker y Workbox `BackgroundSyncPlugin` para reintentos automáticos en segundo plano cuando se recupera la conectividad.
- **Idempotencia en Backend**: Nuevo endpoint `/api/sync/batch` y tabla `sync_log` en Supabase para garantizar que las operaciones se procesen exactamente una vez, incluso tras múltiples reintentos.
- **Resolución de Conflictos**: Modal interactivo que permite visualizar diferencias entre el estado local y el del servidor, con capacidad de edición manual (merge) para resolver colisiones de datos.
- **Indicadores de Estado**: Badge global en el encabezado que muestra el estado en tiempo real (Sincronizado, Pendiente, Offline, Conflicto).

### Changed
- **Hardening de Resiliencia**: Implementación de reintentos con **backoff exponencial y jitter** en el trabajador de sincronización para optimizar el consumo de recursos y la tasa de éxito bajo redes inestables.
- Actualización de los hooks de mutación (`useCreateSale`, `useRegisterReception`, `useAdjustStock`, `useCreateTransfer`) para soportar transparencia offline.

**Nota de Handoff para UX:** Se han añadido dos nuevos componentes visuales: `SyncStatusBadge` (indicador circular en el header) y `SyncConflictModal` (modal de resolución). El diseño sigue los principios de Neumorfismo del sistema. Se recomienda revisar el flujo de "Edición Manual" en el modal de conflictos para futuras mejoras de usabilidad.

## [5.6.3] - 2026-02-16

### Added
- **Sistema de Scroll de Seguridad (Plan B)**: Implementación de un mecanismo de seguridad para garantizar que la información crítica nunca sea inaccesible en dispositivos móviles estrechos (e.g., Galaxy S8+ de 360px).
- Nuevo componente `SecurityScrollContainer` que aplica `overflow-x: auto` y scroll táctil suave a contenedores de resumen y datos financieros.
- Refuerzo global de `MobileSafeContainer` con `overflow-x: auto` como medida preventiva para todas las vistas de la terminal.

### Changed
- **Hardening de Interfaz Táctica**: Aplicación de `whitespace-nowrap` en etiquetas de totales, precios y KPIs en las vistas de Dashboard, Ficha de Costo, Recepción de Productos y Auditoría de Stock para mantener la integridad visual de los números.
- Optimización de contenedores Flexbox en secciones de "Resumen" añadiendo `gap` y `min-width` para prevenir colisiones de elementos en viewports pequeños.

**Nota de Handoff para UX:** No se requieren cambios de diseño. Se han reforzado los pilares de accesibilidad existentes. El sistema ahora permite desplazamiento lateral suave en áreas que antes se desbordaban o cortaban.

## [5.6.2] - 2026-02-15

### Added
- **Expansión del Sistema de Auditoría**: Implementación integral de logs para todas las mutaciones críticas del sistema.
- Nuevos disparadores (triggers) para auditar cambios en Productos (precios, costos, creación), Tiendas (configuración) y Perfiles de Usuario.
- Registro explícito en auditoría para Ventas, Ajustes Manuales de Stock y Ciclo de Vida de Transferencias.
- **Detalles Dinámicos**: Nuevo visualizador de diferencias (Diff Viewer) en la línea de tiempo de auditoría que muestra cambios "Antes -> Después" de forma legible.
- **Filtros Avanzados**: Incorporación de pre-ajustes de fecha (Hoy, Ayer, 7 días) en la vista de auditoría.

## [5.6.1] - 2026-02-13

### Changed
- **Technical Hardening (Transfers)**: Fortalecimiento de contratos de datos en el flujo de transferencias entre almacenes.
- Migración de `transfer-service.ts` a tipado estricto eliminando el uso de `any`.
- Implementación de validación Zod en la capa de servicio mediante `validateRPCResponse` y `validateRPCArrayResponse` para garantizar la integridad de los datos provenientes de Supabase.
- Centralización de `storeSchema` y definición de `transferWithDetailsSchema` en `src/validation/schemas.ts` para unificación de contratos.
- Refuerzo de interfaces en `src/types/index.ts` para reflejar con precisión la nulabilidad de los campos de la base de datos.

## [5.6.0] - 2026-02-13

### Added
- Nueva lógica funcional de **Cierre de Caja** conectada a Supabase.
- Flujo de trabajo en dos pasos: Declaración de Fondos por parte del cajero (Estado: Pendiente) y Validación Final por el Encargado (Estado: Cerrado).
- Cálculo automático de la diferencia de arqueo en tiempo real comparando la declaración con las ventas registradas en el sistema.
- Nueva función RPC `get_sales_since_last_closure` que garantiza un balance exacto basado en el último cierre finalizado o el inicio del día.
- Tabla histórica de cierres con indicadores visuales de estado y trazabilidad por operador.

## [5.5.6] - 2026-02-11

### Changed
- **Mobile Speed Optimization (TPV & Inventory)**: Optimización integral para operativa táctil rápida.
- Rediseño de controles de cantidad en TPV con targets de 44px para evitar errores táctiles.
- Implementación de selector de descuentos predefinidos (1-tap) para reducir uso de teclado.
- Migración de filtros de categoría a chips persistentes en Inventario, permitiendo filtrado en un solo toque.
- Mejora de ergonomía visual ocultando títulos redundantes en dispositivos móviles (≤768px).

## [5.5.5] - 2026-02-11

### Added
- Nueva vista de **Historial de Recepciones** con listado profesional y detalle expandible de productos.
- Acceso directo al Historial desde el menú lateral (INVENTARIO).
- Filtrado avanzado por rango de fechas, estado de recepción y proveedor.
- Soporte para imágenes de productos en el detalle de la recepción.
- Funcionalidad de exportación a CSV desde la vista de detalle de cada recepción.
- Acciones de edición y eliminación (con feedback visual de seguridad).

## [5.5.4] - 2026-02-11

### Added
- Nueva vista de **Transferencias entre Almacenes** que permite gestionar movimientos de stock entre tiendas del mismo Encargado.
- Flujo de solicitud (PENDIENTE) y confirmación (CONFIRMADA) con trazabilidad completa.
- Operación atómica de transferencia de stock mediante el RPC `confirm_transfer` que asegura consistencia entre almacenes origen y destino.
- Validación de permisos por rol para Almaceneros, Encargados y Administradores.

### Changed
- Registrada la vista de "Recepciones" en el orquestador principal de la terminal para habilitar el flujo de entrada de mercancía.

### Fixed
- Corregida la firma de la función `has_role` en las políticas RLS de Transferencias.
- Añadida sobrecarga de la función `has_role(uuid, user_role)` para soportar llamadas explícitas con ID de usuario, mejorando la compatibilidad con políticas de seguridad legacy.

## [5.5.3] - 2026-01-26

### Changed
- Hardened the inventory count process in the "Close Session" view. The system now requires an explicit count for every product, removing ambiguous fallbacks to the expected stock. This change strengthens data integrity by preventing unverified data from being submitted.
- **Instrucción de Relevo:** No changes to the user interface. No UX intervention is required.

## [5.5.2] - 2026-01-26

### Added
- Centralized `importService` (`src/services/import-service.ts`) for standardized CSV parsing using PapaParse and strict Zod validation.
- New `catalogImportRowSchema` and `receptionImportRowSchema` in `src/validation/schemas.ts` to enforce business rules at the entry point.

### Changed
- Hardened Catalog and Product Reception import flows by migrating from dispersed manual parsing to the centralized `importService`.
- Improved error feedback with precise row identification (index + 2) and Zod-driven error messages.

## [5.5.0] - 2026-01-26

### Added
- New "CostPro para Niños" section in Help view for visual onboarding using storytelling.
- Componentized Audit view with a visual, human-readable timeline.
- Enhanced Manager role permissions: now has access to Users and Stores management views.

### Changed
- Hardened Product Reception flow: mandatory store context selection is now enforced before searching or importing products.
- Improved audit log resilience: supports both UUID and Text record IDs.
- Optimized Audit Timeline performance with "Show More" pagination.

### Security
- Reinforced Row-Level Security (RLS) policies for audit log access.

## [5.4.0] - 2026-01-25

### Added
- Mobile-first TPV redesign with Drawer-based shopping cart.
- ActionMenu component with "Thumb Zone" (bottom) positioning support.
- Interactive mobile operational guide in Help section.

### Changed
- Unified inventory views using the atomic ProductCard component.
- Improved store selection UX in the multi-store header.

## [5.3.0] - 2026-01-24

### Added
- Multi-Store SKU isolation (Composite Key: store_id + sku).
- Mandatory SKU validation in Catalog and Reception services.
- New SVG diagram for SKU isolation in Help section.

## [5.2.0] - 2024-11-15

### Added
- Enterprise Multi-Store support.
- Dynamic role hierarchies and branch isolation using Supabase RLS.
