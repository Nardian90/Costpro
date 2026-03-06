# Guía de Contribución — CostPro

Gracias por tu interés en contribuir a CostPro. Esta guía establece los estándares y procesos que todo colaborador debe seguir para mantener la calidad y coherencia del código.

---

## Tabla de Contenidos

- [Requisitos Previos](#requisitos-previos)
- [Configuración del Entorno](#configuración-del-entorno)
- [Flujo de Trabajo con Git](#flujo-de-trabajo-con-git)
- [Convenciones de Código](#convenciones-de-código)
- [Estructura de Componentes](#estructura-de-componentes)
- [Trabajar con la Base de Datos](#trabajar-con-la-base-de-datos)
- [Trabajar con el Sistema de IA](#trabajar-con-el-sistema-de-ia)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Decisiones de Arquitectura](#decisiones-de-arquitectura)

---

## Requisitos Previos

Antes de empezar, asegúrate de tener:

1. **Node.js** — versión especificada en `.nvmrc` (`nvm use`)
2. **pnpm** ≥ 9 (`npm i -g pnpm`)
3. **Supabase CLI** (`npm i -g supabase`)
4. **Python 3.10+** — para el script de auditoría (`pnpm audit`)
5. Un editor con soporte TypeScript (VS Code recomendado)

### Extensiones VS Code recomendadas

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "Prisma.prisma",
    "supabase.vscode-supabase"
  ]
}
```

---

## Configuración del Entorno

### Primera vez

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd costpro

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con credenciales de Supabase de desarrollo

# 4. Vincular con Supabase
supabase link --project-ref <tu-project-ref-dev>
supabase db push

# 5. Levantar el servidor
pnpm dev
```

### Cada sesión de trabajo

```bash
# Sincronizar con main
git checkout main
git pull origin main

# Crear rama de trabajo
git checkout -b feat/nombre-descriptivo

# Verificar que los tests pasan
pnpm test
```

---

## Flujo de Trabajo con Git

### Estrategia de Ramas

```
main                    # Producción estable
├── feat/nombre         # Nueva funcionalidad
├── fix/nombre          # Corrección de bug
├── refactor/nombre     # Refactorización sin cambio de comportamiento
├── docs/nombre         # Solo documentación
└── chore/nombre        # Tareas de mantenimiento (deps, config)
```

### Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<alcance>): <descripción corta en imperativo>

[cuerpo opcional: qué y por qué, no cómo]

[footer opcional: BREAKING CHANGE, referencias]
```

**Tipos válidos:**

| Tipo | Cuándo usarlo |
|------|---------------|
| `feat` | Nueva funcionalidad visible para el usuario |
| `fix` | Corrección de bug |
| `refactor` | Cambio de código sin modificar comportamiento |
| `perf` | Mejora de rendimiento |
| `test` | Añadir o corregir tests |
| `docs` | Solo documentación |
| `style` | Formato, espacios, punto y coma (sin cambio lógico) |
| `chore` | Herramientas, dependencias, CI |
| `ci` | Configuración de CI/CD |

**Ejemplos:**

```bash
feat(pos): añadir soporte para descuentos por porcentaje
fix(cost-engine): resolver dependencia circular en modo PRORRATEO
refactor(hooks): centralizar normalización de storeId en base.ts
docs(api): documentar endpoint /api/cost-sheets/calculate
test(ipv): cubrir casos edge del algoritmo EXACT_SUM
```

---

## Convenciones de Código

### TypeScript

- **Strict mode obligatorio.** Nunca usar `as any` sin justificación documentada.
- Prefiere `interface` sobre `type` para objetos de dominio.
- Todos los tipos de dominio van en `src/types/index.ts`.
- Schemas de validación Zod en `src/validation/schemas.ts`.

```typescript
// BIEN
interface ProductInput {
  name: string;
  price: number;
  storeId: string;
}

// MAL — evitar
const data = response as any;
```

### Manejo de Errores

Usa el patrón de error estructurado del proyecto:

```typescript
import { logger } from '@/lib/logger';

try {
  const result = await someOperation();
  return result;
} catch (error) {
  logger.error('context.operation', { error, context });
  throw new Error('Mensaje descriptivo para el usuario');
}
```

### Reglas de CSS / Tailwind

Siguiendo el protocolo de Mobile Hardening (`AGENTS.md`):

- **Prohibido:** `overflow: hidden` si puede cortar texto o botones
- **Prohibido:** anchos en `px` para contenedores
- **Requerido:** `clamp()` para tamaños de texto responsivos
- **Requerido:** `rem` para espaciados
- **Contenedores que desbordan:** aplicar `width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;`

```css
/* BIEN */
.container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.title {
  font-size: clamp(1rem, 4vw, 1.5rem);
}

/* MAL */
.container {
  width: 350px;   /* px prohibido para contenedores */
  overflow: hidden; /* puede cortar contenido */
}
```

### Imports

Siempre usa el alias `@/` en lugar de rutas relativas:

```typescript
// BIEN
import { useAuthStore } from '@/store';
import type { Product } from '@/types';

// MAL
import { useAuthStore } from '../../../store';
```

---

## Estructura de Componentes

### Nueva Vista (módulo completo)

1. Crear directorio en `src/components/views/terminal/views/<nombre>/`
2. Crear el componente principal: `<NombreView>.tsx`
3. Registrar en `src/config/viewRegistry.ts`
4. Añadir al switch de vistas en `TerminalShell.tsx`
5. Añadir entrada en el sidebar `Sidebar.tsx`

### Nuevo Hook de API

Los hooks van en `src/hooks/api/use<Entidad>.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { withLogging } from '@/lib/logger';

export function useMyEntity(storeId: string) {
  return useQuery({
    queryKey: ['myEntity', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_table')
        .select('id, name, created_at')  // Nunca select('*')
        .eq('store_id', storeId);

      if (error) throw error;
      return data;
    },
    staleTime: 30_000,  // 30 segundos para datos operacionales
    enabled: !!storeId,
  });
}
```

### Presupuesto de Rendimiento

Ver [PERFORMANCE_GUIDELINES.md](technical/PERFORMANCE_GUIDELINES.md). Resumen:

| Métrica | Objetivo | Máximo |
|---------|----------|--------|
| LCP | < 1.5s | 2.5s |
| Transición de vista | < 200ms | 500ms |
| Payload de lista | < 50KB | 200KB |
| Queries por vista | < 3 | 5 |

---

## Trabajar con la Base de Datos

### Crear una Migración

```bash
# Generar nueva migración
supabase migration new nombre_descriptivo_de_la_migracion

# Editar el archivo generado en supabase/migrations/
# Aplicar en desarrollo
supabase db push
```

### Reglas para Migraciones

1. **Cada migración debe ser idempotente.** Usa `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
2. **Siempre incluir políticas RLS** para tablas nuevas.
3. **Documenta funciones PL/pgSQL** con comentarios.
4. **Nunca modificar** migraciones ya aplicadas en producción; crea una nueva.

### RLS — Row-Level Security

Toda tabla de negocio debe tener RLS habilitado:

```sql
-- Habilitar RLS
ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;

-- Política de lectura: solo tienda del usuario
CREATE POLICY "Users can read own store data"
  ON public.mi_tabla FOR SELECT
  USING (store_id = get_active_store_id());

-- Política de escritura: solo encargados y admin
CREATE POLICY "Managers can insert data"
  ON public.mi_tabla FOR INSERT
  WITH CHECK (
    store_id = get_active_store_id() AND
    has_role(auth.uid(), 'encargado')
  );
```

**Ver documentación completa:** [INDEX_COMPLETE_RLS_DOCUMENTATION.md](technical/INDEX_COMPLETE_RLS_DOCUMENTATION.md)

---

## Trabajar con el Sistema de IA

### Añadir una Nueva Herramienta

1. Definir la herramienta en `src/lib/ai/tools/definitions.ts`:

```typescript
{
  name: "mi_nueva_herramienta",
  allowedRoles: ['admin', 'manager'],
  description: "Descripción clara para que el LLM entienda cuándo usarla.",
  parameters: {
    type: "object",
    properties: {
      param1: { type: "string", description: "..." }
    },
    required: ["param1"]
  }
}
```

2. Implementar el ejecutor en `src/lib/ai/tools/registry.ts`.
3. Validar permisos con `hasRole()` antes de ejecutar.
4. Registrar en `audit_logs` tras la ejecución.

### Añadir un Nuevo Proveedor LLM

1. Crear `src/lib/ai/adapters/<proveedor>Adapter.ts` implementando `LLMProvider`.
2. Registrar en `src/lib/ai/orchestrator.ts`.
3. Añadir la clave API al schema de `ai_api_keys` en Supabase.

---

## Testing

### Ejecutar Tests

```bash
# Todos los tests
pnpm test

# Con coverage
pnpm test:coverage

# Solo un módulo
pnpm test src/lib/cost-engine/

# E2E (requiere servidor corriendo)
pnpm test:e2e
```

### Escribir Tests

**Tests unitarios** — para lógica pura (cost-engine, ipv/engine, roles):

```typescript
import { describe, it, expect } from 'vitest';
import { calculateCostSheet } from '@/lib/cost-engine';

describe('calculateCostSheet', () => {
  it('debería resolver dependencias circulares con amortiguación', () => {
    const ficha = { /* ... */ };
    const result = calculateCostSheet(ficha);
    expect(result.converged).toBe(true);
  });
});
```

**Tests de componentes** — para UI crítica:

```typescript
import { render, screen } from '@testing-library/react';
import { POSView } from '@/components/views/terminal/views/pos/POSView';

it('debería mostrar el botón de finalizar venta', () => {
  render(<POSView />);
  expect(screen.getByRole('button', { name: /finalizar venta/i })).toBeInTheDocument();
});
```

### Cobertura Mínima Requerida

| Módulo | Cobertura mínima |
|--------|-----------------|
| `src/lib/cost-engine/` | 85% |
| `src/lib/ipv/engine.ts` | 80% |
| `src/lib/roles.ts` | 90% |
| `src/services/` | 70% |

---

## Pull Requests

### Checklist antes de abrir un PR

- [ ] Los tests pasan: `pnpm test`
- [ ] No hay errores de lint: `pnpm lint`
- [ ] El build compila: `pnpm build`
- [ ] Las nuevas vistas están registradas en `viewRegistry.ts`
- [ ] Las nuevas tablas tienen RLS habilitado y políticas definidas
- [ ] El CHANGELOG está actualizado con los cambios (en `docs/logs/CHANGELOG.md`)
- [ ] La documentación relevante está actualizada
- [ ] Los nuevos componentes responsive respetan el presupuesto CLS ≤ 0.01

### Plantilla de Descripción

```markdown
## Qué cambia
Descripción concisa del cambio.

## Por qué
Motivación o contexto del problema resuelto.

## Cómo se probó
- [ ] Tests unitarios nuevos/actualizados
- [ ] Verificación manual en mobile (360px - 420px viewport)
- [ ] Verificación en dark mode y light mode

## Breaking Changes
Ninguno / [descripción si los hay]

## Screenshots
[Si hay cambios visuales]
```

---

## Decisiones de Arquitectura

### ADR — Architecture Decision Records

Las decisiones de arquitectura importantes deben documentarse brevemente en `docs/technical/`. Formato:

```markdown
# ADR-NNN: Título de la Decisión

## Estado: [Propuesto | Aceptado | Deprecado | Supersedido]

## Contexto
Por qué fue necesario tomar esta decisión.

## Decisión
Qué se decidió.

## Consecuencias
Pros, contras y implicaciones futuras.
```

### Principios Invariantes

Antes de cualquier cambio, verifica que no violas estos principios (extraídos de `AGENTS.md`):

1. **No alterar el orden del DOM.** No mover botones de su posición lógica.
2. **No ocultar contenido que desborda.** Usa `overflow-x: auto` en su contenedor inmediato.
3. **CLS ≤ 0.01.** Los ajustes de tamaño no deben desplazar el layout acumulado.
4. **Unidades relativas.** `clamp()` para textos, `rem` para espaciados, nunca `px` en anchos de contenedores.
