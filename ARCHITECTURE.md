# Arquitectura del Sistema — CostPro

**Versión:** 5.7.25 | **Última actualización:** 2026-03-06

---

## Tabla de Contenidos

- [Visión General](#visión-general)
- [Diagrama de Capas](#diagrama-de-capas)
- [Frontend — SPA Shell Architecture](#frontend--spa-shell-architecture)
- [Backend — Supabase BaaS](#backend--supabase-baas)
- [Sistema de IA](#sistema-de-ia)
- [Motor de Fichas de Costo](#motor-de-fichas-de-costo)
- [Motor IPV / Conciliación Bancaria](#motor-ipv--conciliación-bancaria)
- [PWA y Sincronización Offline](#pwa-y-sincronización-offline)
- [Gestión de Estado](#gestión-de-estado)
- [Sistema de Autenticación y RBAC](#sistema-de-autenticación-y-rbac)
- [Observabilidad y Auditoría](#observabilidad-y-auditoría)
- [Decisiones de Diseño Clave](#decisiones-de-diseño-clave)

---

## Visión General

CostPro sigue una arquitectura **SPA monolítica con BaaS** (Backend as a Service). El cliente Next.js actúa como una aplicación de página única enriquecida, comunicándose directamente con Supabase (PostgreSQL + Auth + Storage) desde el navegador, complementada por un conjunto de API Routes en el servidor de Next.js para operaciones que requieren contexto de servidor (generación de PDF, orquestación de IA, sync offline).

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTE (Browser)                    │
│                                                          │
│   ┌──────────────────────────────────────────────────┐  │
│   │              Next.js App (React 19)              │  │
│   │                                                   │  │
│   │  TerminalShell ──► 25 Vistas de negocio          │  │
│   │  Zustand (Estado global)                         │  │
│   │  TanStack Query (Estado de servidor)             │  │
│   │  Dexie/IndexedDB (IPV offline)                   │  │
│   └──────────────────────────────────────────────────┘  │
│            │ Supabase SDK (RLS enforced)                 │
└────────────│────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│              SERVIDOR (Next.js API Routes)               │
│                                                          │
│   /api/bot/chat       → Orquestador LLM                 │
│   /api/cost-sheets/   → Motor de fichas (cálculo/PDF)   │
│   /api/reports/       → Generador de reportes           │
│   /api/sync/batch     → Sincronización offline          │
│   /api/system-health/ → Métricas de salud               │
│   /api/academy/       → Generación flashcards con IA    │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                   SUPABASE (BaaS)                        │
│                                                          │
│   PostgreSQL (99 migraciones)   │   Supabase Auth       │
│   Row-Level Security (RLS)      │   Supabase Storage    │
│   RPCs PL/pgSQL                 │   Realtime (futuro)   │
└─────────────────────────────────────────────────────────┘
```

---

## Diagrama de Capas

```
Presentación      Componentes React (shadcn/ui + custom)
                  ↕
Estado            Zustand (global) + TanStack Query (servidor)
                  ↕
Hooks             useXxx() → abstracción de acceso a datos
                  ↕
Servicios         src/services/ → lógica de dominio
                  ↕
Acceso a Datos    supabaseClient → RPCs + Table Queries
                  ↕
Base de Datos     PostgreSQL (Supabase) con RLS
```

---

## Frontend — SPA Shell Architecture

### TerminalShell

El componente raíz de la aplicación es `TerminalShell.tsx`. Implementa un patrón **Single-Page Application Shell** donde `currentView` del store Zustand determina qué módulo renderizar.

```
TerminalShell
├── Header.tsx              → Barra superior: tienda activa, sync, tema, usuario
├── Sidebar.tsx             → Navegación filtrada por rol
└── <ViewComponent/>        → Vista activa (1 de 25)
    ├── ChatBot             → Asistente IA (flotante, global)
    ├── FloatingCalculator  → Calculadora accesible desde cualquier vista
    └── CreateProductModal  → Modal global de creación rápida
```

### Registro de Vistas

Todas las vistas están declaradas en `src/config/viewRegistry.ts`. Cada entrada define:

```typescript
interface ViewRegistryItem {
  id: string;       // Identificador único (ej: "pos", "cost-sheets")
  route: string;    // Ruta URL para el asistente IA
  description: string; // Descripción para el LLM
  actions: string[];   // Acciones disponibles
}
```

**Vistas del sistema (25 total):**

| ID | Módulo | Rol mínimo |
|----|--------|-----------|
| `dashboard` | KPIs y métricas del día | clerk |
| `pos` | Punto de venta | clerk |
| `sales` | Historial de ventas | clerk |
| `catalog` | Catálogo de productos | clerk |
| `inventory` | Control de stock | warehouse |
| `recepcion` | Recepción de mercancía | warehouse |
| `transferencias` | Transferencias entre almacenes | warehouse |
| `history` | Historial de movimientos | warehouse |
| `inventory_count` | Conteo físico | warehouse |
| `inventory_adjustments` | Ajustes manuales | warehouse |
| `cash` | Cierre de caja | clerk |
| `cost-sheets` | Fichas de costo | costo |
| `ipv` | Conciliación bancaria IPV | encargado |
| `reports` | Generación de reportes | encargado |
| `users` | Gestión de usuarios | encargado |
| `stores` | Gestión de tiendas | encargado |
| `audit` | Logs de auditoría | encargado |
| `academy` | Academia de capacitación | todos |
| `health` | Salud del sistema | admin |
| `legal` | Normativas y resoluciones | todos |
| `settings` | Configuración del sistema | todos |
| `help` | Centro de ayuda | todos |
| `news` | Noticias RSS | todos |
| `roles` | Gestión de permisos | admin |
| `rss_management` | Fuentes RSS | admin |

---

## Backend — Supabase BaaS

### Modelo de Datos Principal

Las tablas principales del sistema:

```sql
profiles              -- Usuarios del sistema (extiende auth.users)
stores                -- Tiendas / sucursales
user_store_memberships -- Asignación usuario ↔ tienda con rol
products              -- Catálogo maestro de productos
inventory             -- Stock actual por producto + tienda
stock_movements       -- Historial de movimientos de inventario
transactions          -- Cabecera de ventas
transaction_items     -- Líneas de venta
receptions            -- Cabecera de recepciones de mercancía
reception_items       -- Líneas de recepción
transfers             -- Transferencias entre almacenes
transfer_items        -- Líneas de transferencia
cash_closures         -- Cierres de caja
audit_logs            -- Log de auditoría de todas las operaciones
cost_sheets           -- Fichas de costo guardadas
ai_api_keys           -- Claves de API de IA por usuario
academy_cards         -- Flashcards de la academia
rss_feeds             -- Fuentes RSS configuradas
rss_items             -- Noticias descargadas
sync_log              -- Log de sincronización offline (idempotencia)
```

**Ver:** [DATABASE_SCHEMA.md](docs/technical/DATABASE_SCHEMA.md)

### RPCs (Funciones PostgreSQL)

Las operaciones complejas se implementan como RPCs para garantizar atomicidad:

| RPC | Propósito |
|-----|-----------|
| `create_sale` | Registra venta + actualiza stock + genera receipt |
| `register_reception` | Recibe mercancía + actualiza inventario |
| `confirm_transfer` | Transfiere stock entre almacenes (operación atómica) |
| `perform_inventory_adjustment` | Ajuste manual con registro en audit_logs |
| `bulk_update_products` | Actualización masiva de catálogo |
| `get_paginated_products` | Listado paginado con filtros |
| `get_products_for_pos` | Catálogo optimizado para TPV |
| `get_sales_since_last_closure` | Balance desde último cierre de caja |
| `manage_user_memberships` | Gestión segura de accesos multi-tienda |
| `managed_create_user` | Creación de usuario con validación de límites |

### Row-Level Security

Cada tabla tiene políticas RLS que garantizan:
1. Los usuarios solo acceden a datos de su tienda activa (`get_active_store_id()`)
2. Las operaciones de escritura requieren el rol mínimo correspondiente
3. Los administradores tienen acceso total (SECURITY DEFINER functions)

**Ver:** [INDEX_COMPLETE_RLS_DOCUMENTATION.md](docs/technical/INDEX_COMPLETE_RLS_DOCUMENTATION.md)

---

## Sistema de IA

### Arquitectura del Asistente Darian

```
ChatBot.tsx (UI)
     │
     ▼
/api/bot/chat (API Route)
     │
     ▼
bot-service.ts
     ├── Sistema de prompts con contexto (store_id, rol, view registry)
     ├── Base de conocimiento (resoluciones legales cubanas)
     ├── Loop de herramientas (máx. 5 iteraciones)
     └── Registro en audit_logs
          │
          ▼
orchestrator.ts
     ├── Selecciona proveedor según config del usuario (ai_api_keys)
     └── FallbackAdapter: Gemini → GPT → Qwen → DeepSeek → Kimi
          │
          ▼
LLMAdapter (Gemini | GPT | Qwen | DeepSeek | Kimi)
     │
     ▼
Respuesta: texto | tool_call
     │
     ▼ (si tool_call)
tool-registry.ts
     ├── Valida permisos RBAC
     ├── Valida parámetros (Zod)
     └── Ejecuta acción sobre Supabase / UI
```

**Ver:** [ai-controller-architecture.md](docs/ai/ai-controller-architecture.md)

---

## Motor de Fichas de Costo

### Flujo de Cálculo

```
Entrada: FichaJSON (rows + anexos + rules + meta)
     │
     ▼
1. Validación semántica
   └── Verifica tipos, referencias, formulas
     │
     ▼
2. Detección de ciclos (DFS)
   └── Identifica dependencias circulares
     │
     ▼
3. Ordenamiento topológico
   └── Establece orden de cálculo sin ciclos
     │
     ▼
4. Solver iterativo (para ciclos con damping)
   └── Ejecuta hasta convergencia (maxIter, damping)
     │
     ▼
5. Cálculo por modo:
   ├── FIJO → valor directo
   ├── IMPORTAR_ANEXO → suma del anexo vinculado
   ├── PRORRATEO → base × (subtotal_anexo / total_global)
   ├── COEFICIENTE → base × coeficiente
   └── FORMULA → evaluación con expr-eval + decimal.js
     │
     ▼
Salida: CalculatedRow[] + audit_trail + convergence_status
```

**Ver:** [src/lib/cost-engine/README.md](src/lib/cost-engine/README.md)

---

## Motor IPV / Conciliación Bancaria

### Arquitectura Offline-First

El módulo IPV opera completamente en el navegador usando IndexedDB (Dexie):

```
BANDEC CSV/XLSX
     │
     ▼
bandecParser.ts → transacciones normalizadas
     │
     ▼
IPVDatabase (IndexedDB / Dexie)
     ├── bank_statements
     ├── ipv_products (catálogo de precios)
     ├── matching_rules
     ├── reconciliation_lines
     └── ipv_reports
          │
          ▼
engine.ts — Matching multi-paso
     ├── Pass 1: HARD_REF (referencia exacta)
     ├── Pass 2: EXACT_SUM (backtracking combinatorio)
     ├── Pass 3: TOLERANCE (suma con margen ±)
     ├── Pass 4: CASH_FILL (relleno de residual efectivo)
     └── Pass 5: PRICE_FLEX / WILDCARDS
          │
          ▼
Reporte IPV (PDF local vía jsPDF)
```

**Precisión monetaria:** Todos los valores se procesan en centavos (enteros) para eliminar errores de punto flotante.

---

## PWA y Sincronización Offline

### Service Worker

```
public/sw.js (Workbox)
     ├── Cache First: assets estáticos (.js, .css, imágenes)
     ├── Network First: API calls con cache de respaldo
     └── Background Sync: operaciones pendientes (ventas, recepciones)
```

### Flujo de Sincronización

```
Operación offline (venta, recepción, ajuste)
     │
     ▼
localforage (localStorage fallback)
← Encolamiento de operación →
     │
     ▼ (cuando recupera conectividad)
Service Worker Background Sync
     │
     ▼
/api/sync/batch
     ├── Valida idempotencia (sync_log table)
     ├── Aplica operaciones en orden
     └── Devuelve resultado por operación
          │
          ▼
SyncConflictModal (si hay conflictos)
     └── Merge manual usuario ↔ servidor
```

---

## Gestión de Estado

### Stores Zustand

| Store | Archivo | Persistido | Contenido |
|-------|---------|------------|-----------|
| `useAuthStore` | `store/index.ts` | Sí (localStorage) | Usuario, estado de auth, tienda activa |
| `useUIStore` | `store/index.ts` | Parcial | Vista actual, sidebar, modales, tema |
| `useCartStore` | `store/cart.ts` | No | Carrito POS en curso |
| `useSessionStore` | `store/session-store.ts` | No | Sesión de caja activa |
| `useCostSheetStore` | `store/cost-sheet-store.ts` | Sí | Ficha de costo en edición |
| `useAcademyStore` | `store/` | Sí | Progreso de flashcards |

### TanStack Query

Estrategia de stale time por tipo de dato:

```typescript
// Datos estáticos (tiendas, perfiles)
staleTime: 5 * 60 * 1000  // 5 minutos

// Datos operacionales (productos, transacciones)
staleTime: 30 * 1000  // 30 segundos

// Logs y auditoría
staleTime: 60 * 1000  // 1 minuto
```

---

## Sistema de Autenticación y RBAC

### Flujo de Login

```
LoginForm.tsx
     │
     ▼
supabase.auth.signInWithPassword()
     │
     ▼
useSessionManager.ts
     ├── Obtiene perfil de profiles table
     ├── Obtiene memberships de user_store_memberships
     └── Determina tienda activa
          │
          ├── 1 tienda → setea active_store_id automáticamente
          ├── N tiendas → redirige a selección de tienda
          └── 0 tiendas → muestra mensaje de contactar admin
               │
               ▼
          useAuthStore.setUser() → zustand persisted
```

### Jerarquía de Roles

```
admin
│   Acceso total al sistema. Gestiona todos los recursos.
│
├── encargado
│   │   Gestiona tiendas y usuarios dentro de sus límites.
│   │
│   ├── clerk
│   │       POS, ventas, cierre de caja.
│   │
│   ├── warehouse
│   │       Inventario, recepciones, transferencias.
│   │
│   ├── usuario
│   │       Acceso básico de consulta.
│   │
│   └── costo
│           Fichas de costo, reportes de costos.
│
└── manager
        Alias de encargado (compatibilidad legacy).
```

### Verificación de Permisos

```typescript
// Frontend (src/lib/roles.ts)
hasRole(user, 'encargado')        // verifica rol global
canManageStore(user, storeId)     // verifica membresía en tienda

// Backend (RLS policies)
has_role(auth.uid(), 'encargado') -- función SQL
get_active_store_id()             -- función SQL
```

---

## Observabilidad y Auditoría

### Audit Log

Todas las operaciones críticas se registran en `audit_logs`:

```sql
audit_logs (
  id, store_id, user_id, action,     -- Qué, quién, dónde
  entity_type, entity_id,            -- Sobre qué objeto
  details JSONB,                     -- Diferencias antes/después
  ip_address, user_agent,            -- Contexto de sesión
  created_at
)
```

**Eventos auditados:** Ventas, ajustes, recepciones, transferencias, cambios de precios, gestión de usuarios, cierres de caja, interacciones con IA.

### Health System

```
SystemHealthView
     │
     ├── health-engine.ts → score por componente (0-100)
     ├── mri-engine.ts → MRI (Minimum Release Index)
     └── audit-agent.py → análisis diario de arquitectura
          │
          ▼
     public/system_health.json
     public/health_timeline.json
     public/system_architecture.json
     docs/mapa_vistas.md
```

---

## Decisiones de Diseño Clave

### ¿Por qué Supabase en lugar de un backend propio?

**Decisión:** Usar Supabase como BaaS con RLS para el control de acceso.

**Razón:** Reduce drásticamente la complejidad de infraestructura. Las políticas RLS en PostgreSQL garantizan aislamiento de datos multi-tenant sin lógica de autorización en el servidor de aplicaciones. Los RPCs permiten operaciones complejas atómicas sin exponer lógica sensible al cliente.

**Trade-off:** Dependencia de un proveedor externo. Mitigado con migraciones SQL versionadas que permiten migrar a PostgreSQL autogestionado.

---

### ¿Por qué SPA Shell en lugar de MPA (Next.js tradicional)?

**Decisión:** Arquitectura de terminal SPA con routing basado en Zustand, no en URL.

**Razón:** La aplicación se usa principalmente en dispositivos móviles en entornos de baja conectividad. Un shell SPA pre-cargado reduce la latencia percibida en la transición entre módulos a < 200ms, crítico para un TPV en uso intensivo.

**Trade-off:** SEO limitado (no relevante para una app empresarial privada). Complejidad en el manejo del historial del navegador.

---

### ¿Por qué el módulo IPV es completamente offline (IndexedDB)?

**Decisión:** El motor de conciliación bancaria opera 100% en el navegador.

**Razón:** Los extractos bancarios BANDEC son archivos privados que no deben subirse a servidores. El proceso de conciliación puede implicar iteraciones múltiples y correcciones manuales; hacerlo offline elimina latencias y costos de transferencia de datos.

**Trade-off:** Los datos IPV no se sincronizan entre dispositivos. El usuario debe usar siempre el mismo navegador.

---

### ¿Por qué multi-proveedor LLM con FallbackAdapter?

**Decisión:** El orquestador soporta 5 proveedores LLM con fallback automático.

**Razón:** Los modelos Gemini/GPT tienen cuotas y downtime impredecibles. El contexto cubano requiere proveedores accesibles con restricciones de red variables. Las claves API son por usuario para no incurrir en costos centralizados.

**Trade-off:** Comportamiento no determinístico si el proveedor cambia entre sesiones. Mitigado con prompts robustos y validación de herramientas con Zod.
