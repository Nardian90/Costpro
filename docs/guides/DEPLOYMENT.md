# Guía de Despliegue — CostPro

**Versión:** 5.7.x | Actualizada: 2026-03-06

---

## Tabla de Contenidos

- [Prerrequisitos](#prerrequisitos)
- [Variables de Entorno de Producción](#variables-de-entorno-de-producción)
- [Preparación de la Base de Datos](#preparación-de-la-base-de-datos)
- [Opción A: Netlify (Recomendado)](#opción-a-netlify-recomendado)
- [Opción B: VPS con Docker + Caddy](#opción-b-vps-con-docker--caddy)
- [Opción C: Servidor Node.js Standalone](#opción-c-servidor-nodejs-standalone)
- [Verificación Post-Despliegue](#verificación-post-despliegue)
- [Actualizaciones y Rolling Deploys](#actualizaciones-y-rolling-deploys)
- [Monitoreo y Alertas](#monitoreo-y-alertas)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)

---

## Prerrequisitos

### Infraestructura mínima

| Componente | Requisito mínimo | Recomendado |
|------------|-----------------|-------------|
| Supabase | Plan Free (o Pro para mayor cuota) | Pro |
| Servidor (si auto-hosted) | 1 vCPU, 512MB RAM | 2 vCPU, 2GB RAM |
| Node.js | 20 LTS | 22 LTS |
| Dominio + TLS | Requerido | Requerido |

### Checklist pre-despliegue

- [ ] Proyecto Supabase creado y configurado
- [ ] Todas las migraciones SQL aplicadas
- [ ] Variables de entorno definidas
- [ ] Build local exitoso: `pnpm build`
- [ ] Tests pasando: `pnpm test`
- [ ] Bucket `reports` creado en Supabase Storage

---

## Variables de Entorno de Producción

Crear un archivo `.env.production` o configurar en el panel del proveedor de hosting:

```bash
# === SUPABASE (REQUERIDAS) ===
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# === NEXTAUTH (OPCIONAL — solo si se usa OAuth) ===
NEXTAUTH_URL=https://tu-dominio.com
NEXTAUTH_SECRET=<string-aleatorio-32-chars>

# === NODE ===
NODE_ENV=production
```

> **Nota de seguridad:** Las claves de API de los proveedores LLM (Gemini, OpenAI, etc.) **NO se configuran aquí**. Cada usuario las ingresa desde Ajustes > IA en la interfaz. Se almacenan cifradas en la tabla `ai_api_keys` de Supabase.

---

## Preparación de la Base de Datos

### Primer despliegue

```bash
# 1. Instalar Supabase CLI
npm install -g supabase

# 2. Autenticar
supabase login

# 3. Vincular con proyecto
supabase link --project-ref <project-ref>

# 4. Aplicar todas las migraciones
supabase db push

# 5. Verificar que todas las migraciones están aplicadas
supabase migration list
```

### Crear usuario administrador inicial

Desde el dashboard de Supabase → SQL Editor:

```sql
-- 1. Crear usuario en auth.users (via Supabase Dashboard > Authentication > Users)
-- 2. Actualizar su rol a admin en profiles
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@tuempresa.com';
```

### Crear bucket de reportes

```sql
-- Desde SQL Editor en Supabase
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false);

-- Política de acceso
CREATE POLICY "Authenticated users can upload reports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reports' AND auth.role() = 'authenticated');

CREATE POLICY "Users can read own reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## Opción A: Netlify (Recomendado)

La opción más simple para equipos pequeños. Zero-configuration con `netlify.toml`.

### Despliegue inicial

1. Conectar repositorio en [Netlify Dashboard](https://app.netlify.com)
2. Configurar variables de entorno en **Site Settings > Environment variables**
3. El archivo `netlify.toml` ya contiene la configuración:

```toml
[build]
  command = "pnpm build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

4. Trigger deploy desde la UI o push a `main`.

### Verificar en Netlify

```bash
# Instalar CLI de Netlify
npm install -g netlify-cli

# Desplegar manualmente
netlify deploy --prod --dir=.next
```

---

## Opción B: VPS con Docker + Caddy

Para entornos autogestionados con control total sobre la infraestructura.

### Dockerfile (crear en raíz del proyecto)

```dockerfile
FROM node:22-alpine AS base

# Dependencias
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g pnpm && pnpm build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/system-health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Caddyfile (Reverse Proxy)

El proyecto incluye un `Caddyfile` base. Configurar con tu dominio:

```caddy
tu-dominio.com {
    reverse_proxy app:3000 {
        health_uri /api/system-health
        health_interval 30s
    }

    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
    }
}
```

### Iniciar servicios

```bash
# Construir y levantar
docker-compose up -d --build

# Verificar logs
docker-compose logs -f app

# Reiniciar
docker-compose restart app
```

---

## Opción C: Servidor Node.js Standalone

Para despliegue directo en un servidor con Node.js.

### Preparar el servidor

```bash
# Instalar Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 para gestión de procesos
npm install -g pm2

# Instalar pnpm
npm install -g pnpm
```

### Desplegar aplicación

```bash
# En el servidor
git clone <repo-url> /opt/costpro
cd /opt/costpro

# Instalar dependencias
pnpm install --frozen-lockfile

# Configurar variables de entorno
cp .env.example .env.local
nano .env.local  # Editar con valores de producción

# Build de producción
pnpm build

# Iniciar con PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### ecosystem.config.js (crear en raíz)

```javascript
module.exports = {
  apps: [{
    name: 'costpro',
    script: '.next/standalone/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 'max',  // Cluster mode
    exec_mode: 'cluster',
    max_memory_restart: '512M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

---

## Verificación Post-Despliegue

### Checklist de verificación

```bash
# 1. Health check del sistema
curl -s https://tu-dominio.com/api/system-health | jq '.overall'
# Esperado: >= 90

# 2. Verificar autenticación
# → Intentar login con usuario admin

# 3. Verificar Service Worker PWA
# → Abrir Chrome DevTools > Application > Service Workers
# → Debe aparecer registrado

# 4. Test básico de API
curl -s https://tu-dominio.com/api/rss | jq '.items | length'
# Esperado: número > 0

# 5. Verificar CSP headers
curl -I https://tu-dominio.com | grep -i "content-security-policy"
```

### Verificación de RLS

Desde Supabase Dashboard > SQL Editor:

```sql
-- Verificar que RLS está habilitado en todas las tablas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Todas las tablas de negocio deben tener rowsecurity = true
```

### Tests E2E contra producción

```bash
# Configurar URL de producción
PLAYWRIGHT_BASE_URL=https://tu-dominio.com pnpm test:e2e
```

---

## Actualizaciones y Rolling Deploys

### Proceso estándar de actualización

```bash
# 1. Preparar nueva versión
git pull origin main
pnpm install --frozen-lockfile

# 2. Aplicar migraciones PRIMERO
supabase db push

# 3. Build
pnpm build

# 4. Reiniciar sin downtime (PM2)
pm2 reload costpro

# Alternativa Docker
docker-compose pull && docker-compose up -d --no-deps app
```

### Migraciones con breaking changes

Si una migración requiere downtime (ej: renombrar columnas críticas):

```bash
# 1. Poner en modo mantenimiento
pm2 stop costpro

# 2. Aplicar migración
supabase db push

# 3. Desplegar nueva versión
pm2 start costpro

# 4. Verificar
pm2 logs costpro --lines 50
```

---

## Monitoreo y Alertas

### Sistema de Salud Integrado

El endpoint `/api/system-health` retorna métricas en tiempo real. Configurar un monitor externo (UptimeRobot, BetterUptime):

```
URL: https://tu-dominio.com/api/system-health
Intervalo: 5 minutos
Alerta si: HTTP status != 200 o score < 80
```

### Logs de la aplicación

```bash
# PM2
pm2 logs costpro --lines 100

# Docker
docker-compose logs -f --tail=100 app
```

### Auditoría diaria automática

El GitHub Action `.github/workflows/daily-audit.yml` ejecuta `pnpm audit` cada día a medianoche y:
- Actualiza `docs/mapa_vistas.md`
- Genera `public/system_health.json`
- Hace commit de los archivos actualizados

Para el entorno de producción, revisar periódicamente `public/system_health.json` desde el panel de Health (`/terminal?view=health`).

---

## Rollback

### Con PM2

```bash
# Ver historial de deploys
pm2 list

# Rollback inmediato (si usas Git)
git revert HEAD
pnpm build
pm2 reload costpro
```

### Con Docker

```bash
# Hacer rollback a imagen anterior
docker-compose down
docker tag costpro:previous costpro:latest
docker-compose up -d
```

### Rollback de migraciones

> Las migraciones de Supabase **no tienen rollback automático**. Si una migración falla en producción:

1. Evaluar si se puede continuar con la aplicación en la versión anterior
2. Crear una migración de corrección (nunca eliminar la migración fallida)
3. Si hay datos corruptos, restaurar desde backup de Supabase

```bash
# Crear migración de corrección
supabase migration new fix_migration_nombre

# Aplicar
supabase db push
```

---

## Troubleshooting

### Build falla: "Cannot find module @prisma/client"

```bash
# El prebuild genera el cliente Prisma
pnpm prisma generate
pnpm build
```

### Error 500 en producción: "Bucket not found"

```sql
-- Crear bucket de reportes en Supabase
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT DO NOTHING;
```

### Service Worker no se registra

Verificar que el CSP en `next.config.ts` incluye:
```
script-src ... storage.googleapis.com
```

### Error de RLS: "new row violates row-level security"

1. Verificar que el usuario tiene `active_store_id` configurado
2. Verificar que tiene membresía activa en la tienda
3. Revisar la política específica en Supabase Dashboard > Authentication > Policies

### Chat bot retorna 502

1. Verificar que el usuario tiene una clave de API válida en Ajustes > IA
2. Revisar logs del servidor para el proveedor específico
3. Probar otro proveedor LLM desde la interfaz de Ajustes

### Sincronización offline no procesa

1. Verificar que Service Worker está registrado (DevTools > Application)
2. Revisar tabla `sync_log` en Supabase para ver errores
3. Limpiar caché del Service Worker: DevTools > Application > Storage > Clear site data
