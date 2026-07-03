# Reverse Proxy & Trusting X-Forwarded-For

> **Contexto**: Documentación técnica sobre cómo configurar el reverse proxy delante de CostPro para que el header `X-Forwarded-For` sea confiable y no spoofable. Esto afecta directamente a la seguridad del webhook de Telegram (`src/app/api/telegram/webhook/route.ts`) y a cualquier endpoint que valide IPs.

## ⚠️ Problema

El webhook de Telegram usa `getRealClientIp()` (`src/lib/telegram/security.ts`) para extraer la IP del cliente y validarla contra los rangos oficiales de Telegram (`isTelegramIp()`). Sin embargo, la función prioriza el header `X-Forwarded-For` sobre `req.socket.remoteAddress`:

```typescript
return forwarded?.split(',')[0]?.trim() || realIp || socketIp || 'unknown';
```

Si **no hay un reverse proxy delante** que sobrescriba este header, cualquier atacante puede spoofearlo enviando `X-Forwarded-For: 149.154.160.1` (IP oficial de Telegram) y bypassar el IP allowlist. En ese caso, el check es **cosmético** — no aporta seguridad real.

## ✅ Solución

El proyecto ya incluye un `Caddyfile` que actúa como reverse proxy en el puerto 81. **Caddy sobrescribe automáticamente los headers de proxy por defecto**, por lo que `X-Forwarded-For` que llega a la app es confiable.

### Configuración actual (`Caddyfile`)

```caddyfile
:81 {
    @transform_port_query {
        query XTransformPort=*
    }

    handle @transform_port_query {
        reverse_proxy localhost:{query.XTransformPort} {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }

    handle {
        reverse_proxy localhost:3000 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }
}
```

**Puntos clave**:
- `{remote_host}` es la IP TCP real del cliente (no spoofable).
- `header_up X-Forwarded-For {remote_host}` **sobrescribe** cualquier header enviado por el cliente con la IP real.
- `header_up X-Real-IP {remote_host}` proporciona una alternativa no spoofable.

### Arquitectura de deploy recomendada

```
Internet → [Caddy :443/:80] → [CostPro app :3000 (Docker)]
                ↓
         TLS automático (Let's Encrypt)
         Sobrescribe X-Forwarded-For
         Rate limiting (opcional)
         IP allowlist para webhook (opcional)
```

### Verificación

Para confirmar que el proxy está funcionando correctamente:

```bash
# 1. Desde fuera del servidor, hacer un request con X-Forwarded-For spoofeado
curl -v -H "X-Forwarded-For: 149.154.160.1" https://tu-dominio.com/api/telegram/webhook

# 2. En los logs de la app, verificar que la IP registrada NO es 149.154.160.1
#    sino la IP real del cliente (la de tu conexión)
pm2 logs costpro --lines 20 | grep "TELEGRAM_WEBHOOK"
```

Si la IP registrada es la spoofeada, el proxy NO está sobrescribiendo el header correctamente.

### Endurecimiento adicional (opcional pero recomendado)

#### 1. IP allowlist de Telegram a nivel Caddy (defense in depth)

Añadir al `Caddyfile` para bloquear requests que no vengan de Telegram ANTES de llegar a la app:

```caddyfile
:443 {
    # IP allowlist de Telegram (rangos oficiales)
    @telegram_webhook {
        path /api/telegram/webhook*
        remote_ip 149.154.160.0/20 91.108.4.0/22 95.161.64.0/20 185.76.151.0/24
    }
    
    handle @telegram_webhook {
        reverse_proxy localhost:3000
    }
    
    # Bloquear otros intents de llegar al webhook
    handle /api/telegram/webhook* {
        respond 403
    }
    
    handle {
        reverse_proxy localhost:3000
    }
}
```

#### 2. Rate limiting a nivel Caddy

```caddyfile
:443 {
    # Rate limit el webhook de Telegram a 100 req/min por IP
    @telegram_webhook path /api/telegram/webhook*
    handle @telegram_webhook {
        rate_limit {
            zone telegram {
                key {remote_host}
                events 100
                window 1m
            }
        }
        reverse_proxy localhost:3000
    }
    
    handle {
        reverse_proxy localhost:3000
    }
}
```

#### 3. TLS estricto

Caddy maneja TLS automáticamente con Let's Encrypt. Para reforzar:

```caddyfile
:443 {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    reverse_proxy localhost:3000
}
```

## 🔧 Alternativas a Caddy

### Nginx

Si prefieres Nginx, la configuración equivalente:

```nginx
server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    # TLS config...
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;  # SOBRESCRIBE, no append
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Importante: $remote_addr es la IP TCP real, no spoofable
    }
    
    # IP allowlist de Telegram
    location /api/telegram/webhook {
        # 149.154.160.0/20, 91.108.4.0/22, 95.161.64.0/20, 185.76.151.0/24
        allow 149.154.160.0/20;
        allow 91.108.4.0/22;
        allow 95.161.64.0/20;
        allow 185.76.151.0/24;
        deny all;
        proxy_pass http://localhost:3000;
    }
}
```

⚠️ **Nota sobre Nginx**: Por defecto, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` **appende** la IP real al header existente (si el cliente envió uno). Para **sobrescribir** (más seguro), usar `$remote_addr` solo: `proxy_set_header X-Forwarded-For $remote_addr;`.

### Cloudflare

Si usas Cloudflare como proxy delante de Caddy:
1. Cloudflare sobrescribe `X-Forwarded-For` con la IP real del cliente.
2. Activa "Under Attack Mode" solo si hay abuso — Telegram podría no pasar.
3. Considera usar Cloudflare Workers para IP allowlist de Telegram.

## 🚨 Sin reverse proxy (NO recomendado)

Si la app se sirve directamente sin proxy (ej. `pm2 start` expuesto en :3000):
- `req.socket.remoteAddress` es la IP TCP real (no spoofable).
- `X-Forwarded-For` es **spoofable** y no se debe confiar en él.
- La función `getRealClientIp()` ya maneja esto: si no hay `X-Forwarded-For`, cae a `socket.remoteAddress`.

**Recomendación**: Siempre usar Caddy/Nginx delante. Sin proxy, el IP allowlist de Telegram es cosmético.

## 📋 Checklist de producción

- [ ] Caddy/Nginx configurado y escuchando en :443 (TLS automático)
- [ ] `header_up X-Forwarded-For {remote_host}` presente en el Caddyfile (o equivalente Nginx)
- [ ] App escuchando solo en `localhost:3000` (no expuesta directamente a Internet)
- [ ] docker-compose expone solo el puerto de Caddy, no el de la app directamente
- [ ] Verificación con curl spoofeado confirma que la IP registrada es la real
- [ ] (Opcional) IP allowlist de Telegram a nivel proxy
- [ ] (Opcional) Rate limiting a nivel proxy
- [ ] (Opcional) HSTS y headers de seguridad configurados

## 🔗 Referencias

- [Caddy reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Telegram webhook IP ranges](https://core.telegram.org/bots/webhooks#the-short-version)
- [OWASP: Securing the X-Forwarded-For header](https://owasp.org/www-community/attacks/Abuse_of_X-Forwarded-For_header)
