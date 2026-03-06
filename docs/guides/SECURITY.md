# Seguridad y Control de Acceso — CostPro

**Versión:** 5.7.x | Actualizada: 2026-03-06

---

## Tabla de Contenidos

- [Modelo de Seguridad](#modelo-de-seguridad)
- [Autenticación](#autenticación)
- [Sistema RBAC](#sistema-rbac)
- [Row-Level Security (RLS)](#row-level-security-rls)
- [Seguridad en la Capa de API](#seguridad-en-la-capa-de-api)
- [Seguridad del Asistente IA](#seguridad-del-asistente-ia)
- [Cabeceras de Seguridad HTTP](#cabeceras-de-seguridad-http)
- [Gestión de Secretos y Credenciales](#gestión-de-secretos-y-credenciales)
- [Auditoría y Trazabilidad](#auditoría-y-trazabilidad)
- [Checklist de Seguridad por Ambiente](#checklist-de-seguridad-por-ambiente)

---

## Modelo de Seguridad

CostPro implementa un modelo de **defensa en profundidad** con cuatro capas:

```
┌─────────────────────────────────────────────────────┐
│  Capa 1: HTTPS + Cabeceras de Seguridad HTTP        │
│          HSTS, CSP, X-Frame-Options, ...            │
├─────────────────────────────────────────────────────┤
│  Capa 2: Autenticación (Supabase Auth)              │
│          Sesiones JWT, OAuth Google                 │
├─────────────────────────────────────────────────────┤
│  Capa 3: Autorización (RBAC Frontend)               │
│          hasRole(), canManageStore()                │
├─────────────────────────────────────────────────────┤
│  Capa 4: Row-Level Security (RLS en PostgreSQL)     │
│          Filtrado automático por store_id + rol     │
└─────────────────────────────────────────────────────┘
```

**Principio clave:** La capa de RLS es la fuente de verdad de autorización. Las verificaciones del frontend son para UX; las de RLS garantizan la seguridad real de los datos.

---

## Autenticación

### Mecanismo

CostPro usa **Supabase Auth** con email/password y soporte opcional para OAuth (Google).

**Flujo de sesión:**

```
1. Usuario ingresa credenciales en LoginForm.tsx
2. supabase.auth.signInWithPassword() → JWT access token
3. Supabase SDK almacena el token en cookies HttpOnly
4. Cada request al API incluye el token automáticamente
5. RLS en PostgreSQL evalúa auth.uid() en cada query
```

**Expiración de sesiones:**
- Access token: 1 hora (configurable en Supabase)
- Refresh token: 7 días
- El SDK renueva automáticamente antes de expirar

### Gestión de Contraseñas

- Las contraseñas **nunca** se almacenan en texto plano
- Gestionadas exclusivamente por Supabase Auth (bcrypt)
- El reset de contraseña se hace via email (Supabase)
- La creación de usuarios por encargados usa `managed_create_user` (RPC) sin exponer credenciales

### Sesión Compartida Multi-Dispositivo

Cada sesión en un dispositivo tiene su propio par de tokens. El usuario puede tener sesiones simultáneas en varios dispositivos. Para revocar una sesión específica, usar Supabase Dashboard > Authentication > Users > Revoke sessions.

---

## Sistema RBAC

### Jerarquía de Roles

```
admin                       ← Superusuario del sistema
  ↓ hereda
encargado / manager         ← Gestor de tiendas y usuarios
  ↓ hereda
clerk                       ← Cajero / TPV
warehouse                   ← Almacenero
usuario                     ← Acceso básico de lectura
costo                       ← Acceso a módulo de fichas de costo
```

> `encargado` y `manager` son equivalentes funcionales (alias legacy).

### Matriz de Permisos por Módulo

| Módulo | admin | encargado | clerk | warehouse | costo | usuario |
|--------|-------|-----------|-------|-----------|-------|---------|
| Dashboard | R | R | R | R | R | R |
| POS | R/W | R/W | R/W | — | — | — |
| Catálogo | R/W | R/W | R | R | R | R |
| Inventario | R/W | R/W | R | R/W | R | R |
| Recepciones | R/W | R/W | — | R/W | — | — |
| Transferencias | R/W | R/W | — | R/W | — | — |
| Cierre de Caja | R/W | R/W | R/W | — | — | — |
| Fichas de Costo | R/W | R/W | — | — | R/W | — |
| IPV/Conciliación | R/W | R/W | — | — | R | — |
| Usuarios | R/W | R/W | — | — | — | — |
| Tiendas | R/W | R/W | — | — | — | — |
| Auditoría | R/W | R | — | — | — | — |
| Salud del Sistema | R/W | R | — | — | — | — |
| Ajustes | R/W | R/W | R | R | R | R |
| Academia | R/W | R/W | R | R | R | R |

*R = Lectura, W = Escritura, — = Sin acceso*

### Implementación RBAC en Código

**Frontend (`src/lib/roles.ts`):**

```typescript
// Verificar rol global
hasRole(user, 'encargado')  // → boolean

// Verificar gestión de tienda específica
canManageStore(user, storeId)  // → boolean

// Obtener todos los roles que el usuario puede gestionar
getAllowedRoles(user.role)  // → UserRole[]
```

**Backend (RLS functions):**

```sql
-- Verificar rol en SQL
has_role(auth.uid(), 'encargado'::user_role) → boolean

-- Obtener tienda activa del usuario
get_active_store_id() → UUID

-- Verificar propiedad de tienda
is_store_owner(store_id) → boolean
```

### Límites de Negocio para Encargados

Los encargados tienen límites definidos por el admin:

| Límite | Columna | Default |
|--------|---------|---------|
| Máximo de tiendas | `profiles.max_stores_limit` | 3 |
| Máximo de usuarios | `profiles.max_users_limit` | 10 |

Estos límites se validan:
1. En el frontend (Zod schema en `UserForm.tsx`)
2. En el backend via trigger `trg_count_user_stores`

---

## Row-Level Security (RLS)

### Principio de Funcionamiento

Cada query a PostgreSQL ejecutada con el token del usuario automáticamente aplica las políticas RLS. No hay forma de saltarlas desde el cliente.

```sql
-- Ejemplo: el usuario solo puede leer productos de su tienda activa
CREATE POLICY "Users can read own store products"
ON public.products FOR SELECT
USING (store_id = get_active_store_id());
```

### Función `get_active_store_id()`

```sql
CREATE OR REPLACE FUNCTION get_active_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT active_store_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;
```

**SECURITY DEFINER:** Ejecuta con privilegios del propietario de la función, evitando recursión infinita entre `profiles` y las políticas RLS.

### Función `has_role()`

```sql
CREATE OR REPLACE FUNCTION has_role(p_user_id UUID, p_role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = p_role
    UNION
    SELECT 1 FROM public.user_store_memberships
    WHERE user_id = p_user_id AND role = p_role AND status = 'active'
    UNION
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'admin'
  )
$$;
```

### Política de Administrador

El rol `admin` siempre puede acceder a todos los datos:

```sql
CREATE POLICY "Admin has full access"
ON public.products
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### Verificación de RLS en Producción

```sql
-- Verificar que todas las tablas de negocio tienen RLS habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
ORDER BY rowsecurity ASC, tablename;
-- ⚠️ Alerta si rowsecurity = false en tablas de negocio

-- Ver todas las políticas activas
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

### Documentación completa de RLS

Ver: [INDEX_COMPLETE_RLS_DOCUMENTATION.md](INDEX_COMPLETE_RLS_DOCUMENTATION.md)

---

## Seguridad en la Capa de API

### Validación de Entrada

Todos los endpoints de la API validan parámetros con **Zod** antes de procesarlos:

```typescript
// Ejemplo en /api/cost-sheets/calculate
const inputSchema = z.object({
  ficha: fichaJSONSchema.strict()
});

const parsed = inputSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ error: parsed.error.flatten() });
}
```

**Regla:** Nunca usar `req.body.field` directamente sin validación previa.

### Autenticación en API Routes

Todas las rutas de API verifican la sesión antes de procesar:

```typescript
import { createServerClient } from '@supabase/ssr';

const supabase = createServerClient(/* ... */);
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Zero-Trust en RPCs

Las llamadas a Supabase RPCs usan el cliente autenticado del usuario — nunca el cliente de servicio (`service_role_key`) desde el frontend:

```typescript
// BIEN: cliente con permisos del usuario
const supabase = createAuthenticatedClient(userToken);
await supabase.rpc('create_sale', params);

// MAL: nunca exponer la service role key en el cliente
const supabase = createClient(url, SERVICE_ROLE_KEY);  // ← NO hacer esto
```

---

## Seguridad del Asistente IA

### Aislamiento de Claves de API

Las claves de API de los proveedores LLM (Gemini, OpenAI, etc.):
- Se almacenan en `ai_api_keys` en Supabase (cifradas en tránsito con HTTPS)
- Solo el propio usuario puede leer sus claves (RLS: `user_id = auth.uid()`)
- **Nunca** se exponen en responses de la API al frontend
- **Nunca** se registran en logs

### Control de Permisos por Herramienta

Antes de ejecutar cualquier herramienta, el sistema verifica:

```typescript
const tool = TOOLS.find(t => t.name === request.toolName);
const userHasPermission = tool.allowedRoles.some(r => hasRole(user, r));

if (!userHasPermission) {
  return { error: 'PERMISSION_DENIED', allowed: false };
}
```

### Restricciones del Asistente

El system prompt incluye reglas explícitas de seguridad:
- No puede revelar información de usuarios de otras tiendas
- No puede ejecutar operaciones destructivas (DELETE masivo) sin confirmación
- No puede acceder a datos fuera del `store_id` activo del usuario

### Rate Limiting del Bot

El servicio de bot implementa throttling por usuario para prevenir abuso de cuotas de API:

```typescript
const RPM_LIMIT = 20;  // requests por minuto por usuario
if (requestCount > RPM_LIMIT) {
  throw new Error('RATE_LIMITED');
}
```

---

## Cabeceras de Seguridad HTTP

Configuradas en `next.config.ts`:

```typescript
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' storage.googleapis.com",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com",
      "img-src 'self' data: blob: *.supabase.co",
      "connect-src 'self' *.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; ')
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  }
];
```

**Importante:** El CSP incluye `storage.googleapis.com` para permitir la carga de Workbox (Service Worker PWA). Cualquier modificación del CSP debe verificar que el Service Worker sigue registrándose correctamente.

---

## Gestión de Secretos y Credenciales

### Qué NUNCA debe ir en el repositorio

| Secreto | Alternativa |
|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` producción | Variables de entorno del hosting |
| `DATABASE_URL` | Variables de entorno del hosting |
| Claves de API LLM | Tabla `ai_api_keys` en Supabase (por usuario) |
| `NEXTAUTH_SECRET` | Variables de entorno del hosting |
| Credenciales de admin | Gestión manual en Supabase Dashboard |

### Verificar que no hay secretos en el repo

```bash
# Buscar patrones de secretos comunes
git log --all --full-history --diff-filter=A -- "**/.env*"
grep -r "supabase.co" src/ --include="*.ts" | grep -v "localhost\|example\|NEXT_PUBLIC"
```

### Rotación de Credenciales

**Supabase Anon Key:** Se puede rotar desde el Dashboard. El cambio es inmediato; actualizar en el hosting.

**Claves de API de usuarios:** El usuario las actualiza desde Ajustes > IA. Si una clave es comprometida, el usuario puede desactivarla desde la misma interfaz.

---

## Auditoría y Trazabilidad

### Qué se audita

Todos los eventos críticos se registran en `audit_logs`:

| Categoría | Eventos |
|-----------|---------|
| **Ventas** | Creación, anulación |
| **Inventario** | Ajustes manuales, recepciones, transferencias |
| **Productos** | Creación, cambio de precio, eliminación |
| **Usuarios** | Creación, cambio de rol, asignación de tiendas |
| **Caja** | Apertura, cierre, validación por encargado |
| **IA** | Todas las llamadas a herramientas con parámetros y resultados |
| **Accesos** | Cambio de tienda activa |

### Estructura del Log

```json
{
  "id": "uuid",
  "action": "create_sale",
  "entity_type": "transaction",
  "entity_id": "uuid",
  "user_id": "uuid",
  "store_id": "uuid",
  "details": {
    "before": null,
    "after": { "total": 150.00, "items": 3 }
  },
  "ip_address": "192.168.1.100",
  "created_at": "2026-03-06T10:30:00Z"
}
```

### Acceso a Logs

- **Encargados y admins** pueden ver logs de sus tiendas desde la vista de Auditoría
- **Admins** pueden ver logs de todas las tiendas
- Los logs **no se pueden eliminar** (sin permisos de DELETE en RLS)
- Retención mínima recomendada: 1 año

### Exportación para Auditorías

```bash
# Exportar logs de un período desde el API
curl "https://tu-dominio.com/api/logs?storeId=<uuid>&from=2026-01-01&to=2026-03-06&pageSize=200" \
  -H "Authorization: Bearer <token>" | jq '.logs' > audit_export.json
```

---

## Checklist de Seguridad por Ambiente

### Desarrollo

- [ ] Usar datos de demostración, no datos reales de clientes
- [ ] No hardcodear credenciales en código
- [ ] Verificar que `.env.local` está en `.gitignore`
- [ ] RLS habilitado incluso en entorno local

### Staging

- [ ] Usar proyecto Supabase separado del de producción
- [ ] Variables de entorno independientes
- [ ] Datos anonimizados (no copiar dump de producción)
- [ ] Access restringido (autenticación básica o VPN)

### Producción

- [ ] HTTPS forzado (HSTS habilitado)
- [ ] RLS habilitado en todas las tablas
- [ ] Cabeceras de seguridad HTTP activas
- [ ] Rotación de claves programada
- [ ] Backup automático de Supabase habilitado
- [ ] Alertas de salud configuradas
- [ ] Logs de acceso monitoreados
- [ ] Service Worker con scope correcto (`/`)
- [ ] CSP verificada (sin bloquear funcionalidades)
- [ ] Test E2E contra ambiente de producción ejecutado

### Respuesta a Incidentes

En caso de sospecha de compromiso:

1. **Revocar sesiones:** Supabase Dashboard > Authentication > Users > Revoke all sessions
2. **Rotar Anon Key:** Supabase Dashboard > Settings > API > Regenerate
3. **Revisar audit_logs:** Buscar acciones inusuales en el período sospechoso
4. **Notificar usuarios afectados** si datos fueron expuestos
5. **Documentar el incidente** en `docs/logs/MAINTENANCE_LOG.md`
