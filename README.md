# CostPro — Sistema de Gestión Integral

[![Version](https://img.shields.io/badge/version-5.7.25-blue.svg)](docs/logs/CHANGELOG.md)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg)](https://supabase.com)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#)
[![PWA](https://img.shields.io/badge/PWA-Offline--Capable-purple.svg)](#arquitectura-pwa)

**CostPro** es un sistema de gestión empresarial integral diseñado para el comercio minorista cubano. Combina un punto de venta táctil, control de inventario multi-almacén, motor de fichas de costo, conciliación bancaria (IPV), asistente de IA y observabilidad del sistema en una sola aplicación web progresiva (PWA) con soporte offline.

---

## Tabla de Contenidos

- [Características Principales](#características-principales)
- [Pila Tecnológica](#pila-tecnológica)
- [Inicio Rápido](#inicio-rápido)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Módulos del Sistema](#módulos-del-sistema)
- [Variables de Entorno](#variables-de-entorno)
- [Scripts Disponibles](#scripts-disponibles)
- [Testing](#testing)
- [Despliegue](#despliegue)
- [Arquitectura PWA](#arquitectura-pwa)
- [Documentación Adicional](#documentación-adicional)

---

## Características Principales

| Módulo | Descripción |
|--------|-------------|
| **POS (TPV)** | Punto de venta táctil con carrito, descuentos, escaneo de código de barras y cierre de caja |
| **Inventario** | Control de stock multi-almacén con ajustes, recepciones, transferencias y conteos físicos |
| **Fichas de Costo** | Motor declarativo JSON para cálculo de costos industriales con 10+ plantillas sectoriales |
| **IPV / Conciliación** | Motor de matching bancario con soporte BANDEC, persistencia IndexedDB y exportación PDF |
| **Asistente IA (Darian)** | Chat multi-proveedor (Gemini, GPT, Qwen, DeepSeek, Kimi) con herramientas de acción sobre el sistema |
| **Reportes** | Generación de PDF/Excel/CSV con jsPDF y xlsx |
| **Academia** | Sistema de flashcards con algoritmo de repetición espaciada SM-2 |
| **Auditoría** | Trazabilidad completa de todas las operaciones del sistema |
| **Salud del Sistema** | Observabilidad con MRI (Minimum Release Index) y health scoring |
| **Multi-Tienda** | Arquitectura de sucursales con RBAC por tienda y aislamiento RLS en PostgreSQL |

---

## Pila Tecnológica

### Frontend
- **[Next.js 15](https://nextjs.org)** — App Router, RSC, standalone output
- **[React 19](https://react.dev)** — UI framework
- **[TypeScript 5](https://www.typescriptlang.org)** — strict mode, `noImplicitAny`
- **[Tailwind CSS v4](https://tailwindcss.com)** — sistema de diseño neumórfico con 5 temas
- **[shadcn/ui](https://ui.shadcn.com)** — componentes (New York style, Lucide icons)
- **[Framer Motion](https://www.framer.com/motion/)** — animaciones

### Estado y Datos
- **[Zustand v5](https://zustand-demo.pmnd.rs)** — estado global persistido (auth, UI, cart, session, cost-sheet)
- **[TanStack Query v5](https://tanstack.com/query)** — estado de servidor, cache, prefetch
- **[Dexie v4](https://dexie.org)** — IndexedDB para operaciones IPV offline

### Backend / Infraestructura
- **[Supabase](https://supabase.com)** — PostgreSQL + Auth + Storage + RLS
- **[99 migraciones SQL](supabase/migrations/)** — schema versionado
- **Service Worker + Workbox** — PWA offline con Background Sync

### IA / LLM
- Google Gemini (`gemini-2.0-flash`) — proveedor principal
- OpenAI GPT-4o — proveedor secundario
- Qwen, DeepSeek, Kimi — proveedores alternativos
- FallbackAdapter — cadena de fallo automático entre proveedores

### Testing
- **[Vitest v4](https://vitest.dev)** — unit + integration tests
- **[Playwright](https://playwright.dev)** — 18 specs E2E
- **React Testing Library** — component tests

---

## Inicio Rápido

### Prerrequisitos

| Herramienta | Versión | Instrucción |
|-------------|---------|-------------|
| Node.js | ver `.nvmrc` | `nvm use` |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Supabase CLI | latest | `npm i -g supabase` |
| Python 3 | ≥ 3.10 | Solo para el script de auditoría |

### 1. Clonar y instalar dependencias

```bash
git clone <URL_DEL_REPOSITORIO>
cd costpro
pnpm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales (ver [Variables de Entorno](#variables-de-entorno)).

### 3. Aplicar migraciones de base de datos

```bash
# Vincular con tu proyecto Supabase
supabase link --project-ref <tu-project-ref>

# Aplicar todas las migraciones
supabase db push
```

> Las migraciones se encuentran en `supabase/migrations/`. Se deben aplicar en orden cronológico.

### 4. Iniciar el servidor de desarrollo

```bash
pnpm dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

---

## Estructura del Proyecto

```
costpro/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API Routes (REST endpoints)
│   │   │   ├── academy/        # Generación de flashcards con IA
│   │   │   ├── bot/chat/       # Endpoint del asistente Darian
│   │   │   ├── cost-sheets/    # CRUD + cálculo de fichas de costo
│   │   │   ├── inventory/      # RPC de inventario
│   │   │   ├── reports/        # Generación de reportes
│   │   │   ├── sync/           # Sincronización offline/online
│   │   │   └── system-health/  # Health check endpoints
│   │   ├── login/              # Página de autenticación
│   │   ├── globals.css         # Sistema de diseño global (1082 líneas)
│   │   ├── layout.tsx          # Root layout con providers
│   │   └── page.tsx            # Página principal → TerminalShell
│   ├── components/
│   │   ├── views/terminal/     # Shell principal + 22 vistas de negocio
│   │   ├── modals/             # Modales globales (scanner, crear producto, etc.)
│   │   ├── providers/          # QueryProvider, SyncProvider
│   │   └── ui/                 # 70+ componentes shadcn/ui + custom
│   ├── config/
│   │   └── viewRegistry.ts     # Registro de las 25 vistas con metadata
│   ├── hooks/
│   │   ├── api/                # 18 hooks TanStack Query para todos los dominios
│   │   └── logic/              # Hooks de lógica de negocio (POS, costo, sesión)
│   ├── lib/
│   │   ├── ai/                 # Orquestador multi-LLM + adapters + herramientas
│   │   ├── cost-engine/        # Motor de cálculo de fichas de costo
│   │   ├── ipv/                # Motor de conciliación bancaria + parser BANDEC
│   │   ├── observability/      # Health engine + MRI release gate
│   │   ├── sync/               # Offline storage + resolución de conflictos
│   │   ├── academy/            # Algoritmo SM-2 de repetición espaciada
│   │   └── utils/              # PDF export, número a letras, etc.
│   ├── services/               # 14 módulos de servicio (lógica de dominio)
│   ├── store/                  # Stores Zustand (auth, UI, cart, session, cost-sheet)
│   ├── types/                  # Tipos TypeScript maestros (817 líneas)
│   └── validation/             # Schemas Zod para formularios y RPCs
├── supabase/
│   └── migrations/             # 99 migraciones SQL versionadas
├── docs/
│   ├── ai/                     # Arquitectura del sistema de IA
│   ├── technical/              # Documentación técnica (RLS, schema, API)
│   ├── guides/                 # Guías operativas y de despliegue
│   └── logs/                   # Changelog y logs de mantenimiento
├── e2e/                        # 18 specs Playwright E2E
├── scripts/
│   └── audit-agent.py          # Auditor automático de arquitectura (Python)
└── public/
    ├── sw.js                   # Service Worker PWA
    ├── manifest.json           # PWA manifest
    └── system_health.json      # Estado de salud en tiempo real
```

---

## Módulos del Sistema

### POS — Punto de Venta (`/terminal?view=pos`)

TPV táctil con soporte mobile-first. Implementa arquitectura **zero-latency** descargando el catálogo completo una vez y realizando filtrado local.

**Características clave:**
- Carrito con descuentos predefinidos y personalizados
- Escaneo de código de barras (HTML5-QRCode)
- Cierre de caja con arqueo y validación por encargado
- Historial de ventas con exportación CSV

**Hooks relevantes:** `usePOSProducts`, `useCreateSale`, `useCartStore`

---

### Fichas de Costo (`/terminal?view=cost-sheets`)

Motor declarativo para el cálculo de costos de producción según normativa cubana.

**Modos de cálculo:**
| Modo | Descripción |
|------|-------------|
| `FIJO` | Valor fijo definido manualmente |
| `IMPORTAR_ANEXO` | Suma total de un anexo vinculado |
| `PRORRATEO` | Distribución proporcional por coeficiente |
| `COEFICIENTE` | Multiplicación de base × coeficiente |
| `FORMULA` | Expresión aritmética con referencias a otras filas |

**Ver:** [Motor de Cálculo — Documentación](src/lib/cost-engine/README.md)

---

### IPV — Conciliación Bancaria (`/terminal?view=ipv`)

Herramienta para conciliar extractos bancarios BANDEC con ventas de productos.

**Algoritmo de matching multi-paso:**
1. `HARD_REF` — Referencia exacta de transacción
2. `EXACT_SUM` — Suma exacta con backtracking
3. `TOLERANCE` — Suma con tolerancia configurable
4. `CASH_FILL` — Relleno de efectivo residual

Toda la persistencia es local (IndexedDB vía Dexie) con exportación PDF de reportes.

---

### Asistente IA — Darian (`src/lib/ai/`)

Asistente conversacional con 9 herramientas de acción sobre el sistema.

**Herramientas disponibles:**

| Herramienta | Descripción | Roles |
|-------------|-------------|-------|
| `open_view` | Navega a cualquier vista | admin, manager, costo |
| `explain_view` | Explica una vista | todos |
| `fill_form` | Rellena un formulario | todos |
| `submit_form` | Envía un formulario | admin, manager |
| `search_entity` | Busca productos, fichas, transacciones | todos |
| `execute_action` | Ejecuta acciones del sistema | admin, manager |
| `export_document` | Genera PDF/Excel | admin, manager |
| `set_ui_mode` | Cambia modo de interfaz | admin, manager, costo |
| `run_system_health_check` | Auditoría completa de UI | admin, manager |

**Ver:** [Arquitectura del Controlador IA](docs/ai/ai-controller-architecture.md)

---

### Multi-Tienda y RBAC

El sistema soporta múltiples sucursales con aislamiento completo de datos por tienda vía Row-Level Security.

**Jerarquía de roles:**

```
admin
  └── encargado / manager
        ├── clerk
        ├── warehouse
        ├── usuario
        └── costo
```

**Ver:** [Modelo Multi-Tienda](docs/technical/DOC_MULTI_STORE.md) | [Seguridad y RBAC](docs/guides/SECURITY.md)

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave anónima (pública) de Supabase |
| `DATABASE_URL` | Sí | URL de conexión directa a PostgreSQL |
| `NEXTAUTH_URL` | No | URL base para callbacks OAuth |
| `NEXTAUTH_SECRET` | No | Secret para NextAuth sessions |

> Las claves de API para los proveedores de IA (Gemini, OpenAI, etc.) se configuran **por usuario** desde la interfaz de Ajustes y se almacenan en la tabla `ai_api_keys` de Supabase, no como variables de entorno globales.

---

## Scripts Disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| `dev` | `pnpm dev` | Servidor de desarrollo en `localhost:3000` |
| `build` | `pnpm build` | Build de producción (standalone) |
| `start` | `pnpm start` | Inicia el servidor de producción compilado |
| `lint` | `pnpm lint` | ESLint con configuración Next.js |
| `test` | `pnpm test` | Tests unitarios con Vitest |
| `test:ui` | `pnpm test:ui` | Vitest con panel UI |
| `test:coverage` | `pnpm test:coverage` | Reporte de cobertura (v8) |
| `test:e2e` | `pnpm test:e2e` | Tests E2E con Playwright |
| `audit` | `pnpm audit` | Ejecuta el auditor de arquitectura (Python) |

---

## Testing

### Tests Unitarios e Integración

```bash
# Ejecutar todos los tests
pnpm test

# Con cobertura
pnpm test:coverage

# Modo watch
pnpm test -- --watch

# Test específico
pnpm test src/lib/cost-engine/index.test.ts
```

**Cobertura objetivo:** `>80%` en módulos de lógica de negocio (`cost-engine`, `ipv/engine`, `roles`).

### Tests E2E (Playwright)

```bash
# Requiere servidor en http://localhost:3000
pnpm dev &
pnpm test:e2e

# Con UI de Playwright
npx playwright test --ui
```

Los 18 specs E2E cubren flujos críticos: login, POS, inventario, fichas de costo, cierre de caja.

---

## Despliegue

### Netlify (recomendado)

```bash
# El archivo netlify.toml ya está configurado
# Solo conectar el repositorio en Netlify Dashboard
```

### Docker / VPS

```bash
pnpm build
node .next/standalone/server.js
```

El reverse proxy Caddy está configurado en `Caddyfile`.

**Ver guía completa:** [DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)

---

## Arquitectura PWA

CostPro es una Progressive Web App con soporte offline completo:

- **Service Worker** (`public/sw.js`) — caching de assets y API responses
- **Background Sync** — operaciones de venta/recepción encoladas cuando no hay red
- **IndexedDB (Dexie)** — almacenamiento local del módulo IPV
- **Conflict Resolution** — modal interactivo para resolver conflictos de sincronización

El manifest PWA (`public/manifest.json`) habilita instalación como app nativa en Android/iOS.

---

## Documentación Adicional

| Documento | Descripción |
|-----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagrama completo de arquitectura del sistema |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Guía para contribuir al proyecto |
| [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md) | Guía de despliegue en producción |
| [docs/guides/SECURITY.md](docs/guides/SECURITY.md) | Políticas de seguridad y RBAC |
| [docs/technical/API_REFERENCE.md](docs/technical/API_REFERENCE.md) | Referencia completa de la API REST |
| [docs/technical/DATABASE_SCHEMA.md](docs/technical/DATABASE_SCHEMA.md) | Schema de base de datos documentado |
| [docs/technical/PERFORMANCE_GUIDELINES.md](docs/technical/PERFORMANCE_GUIDELINES.md) | Guías de rendimiento y presupuesto de datos |
| [docs/ai/ai-controller-architecture.md](docs/ai/ai-controller-architecture.md) | Arquitectura del asistente Darian |
| [src/lib/cost-engine/README.md](src/lib/cost-engine/README.md) | Motor de cálculo de fichas de costo |
| [docs/logs/CHANGELOG.md](docs/logs/CHANGELOG.md) | Historial de versiones |
| [docs/mapa_vistas.md](docs/mapa_vistas.md) | Mapa arquitectónico vivo (auto-generado) |

---

## Auditoría Automática

El proyecto incluye un auditor de arquitectura automático:

```bash
# Ejecutar manualmente
pnpm audit

# También se ejecuta diariamente vía GitHub Actions
# .github/workflows/daily-audit.yml
```

Genera y actualiza:
- `docs/mapa_vistas.md` — mapa vivo de 315+ componentes
- `public/system_health.json` — estado de salud del sistema
- `public/health_timeline.json` — línea de tiempo de mantenimientos
- `public/system_architecture.json` — snapshot de arquitectura
- `logs/audit_log.json` — registro de auditoría
