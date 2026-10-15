# Operación del entorno local de Costpro — restauración tras reinicio

> **Para qué existe este documento:** el entorno local (contenedor) puede
> reiniciarse y perder TODO lo que no esté en git. El 2026-10-15 eso provocó
> la pérdida del tooling de auditoría (`scripts/ci-fix/`) que el informe
> `docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md`
> referenciaba en su anexo. Este runbook + los scripts de este PR garantizan
> que la recuperación sea reproducible en minutos y que el tooling crítico
> viva en el repo, no en el disco local.

## 1. Qué se pierde y qué sobrevive a un reinicio

| Elemento | ¿Sobrevive? | Dónde vive |
|---|---|---|
| Código, migraciones, auditorías, tooling `scripts/` | ✅ | GitHub (repo) |
| `.env` con secretos | ❌ | Hay que recrearlo (ver §3) |
| `node_modules` | ❌ | `bun install` lo reconstruye |
| PM2 y sus procesos | ❌ | `pm2 start ecosystem.config.js` |
| `db/custom.db` (SQLite local de Prisma) | ❌ | Se recrea vacío (el dato real vive en Supabase) |
| Baselines de aislamiento (`scripts/ci-fix/baselines/`) | ✅ | GitHub (repo) — commiteados a propósito |

## 2. Restauración rápida (un comando)

```bash
# 1) Clonar (si el directorio no existe)
git clone https://github.com/Nardian90/Costpro.git /home/z/my-project/costpro

# 2) Recrear .env con los secretos (ver §3) — solo la primera vez

# 3) Restaurar todo lo demás de forma idempotente:
bash scripts/local-env/restore_local_env.sh
```

El script valida `.env`, instala PM2 si falta, corre `bun install`, crea
`logs/` y `db/custom.db`, arranca PM2 (`costpro` + pollers) y espera el
health check de `http://localhost:3000` y `/api/health`.

## 3. Recrear `.env`

`.env` está gitignoreado a propósito (contiene secretos). Copiar la plantilla
y rellenar:

```bash
cp .env.example .env
```

Variables obligatorias (el script de restauración las valida sin imprimirlas):

- `DATABASE_URL=file:./db/custom.db`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
  → dashboard de Supabase → Project Settings → API
- `NEXTAUTH_URL=http://localhost:3000`, `NEXTAUTH_SECRET`
- `ENABLE_DEV_BYPASS=false` (nunca `true` fuera de un diagnóstico puntual)
- `CSRF_ALLOWED_DOMAINS=.space-z.ai,localhost`

`SUPABASE_ACCESS_TOKEN` se usa solo por el tooling de solo lectura
(`scripts/ci-fix/`); puede vivir en `.env` o exportarse por sesión.

**Regla de seguridad:** los secretos NO se commitean jamás. Si un reinicio
los perdió, se obtienen del dashboard de Supabase / gestor de contraseñas del
operador, no del historial de git.

## 4. Verificar que el entorno quedó sano

```bash
pm2 status                       # costpro + telegram-cron-poller + whatsapp-cron-poller online
pm2 logs costpro --lines 20      # "Ready on http://0.0.0.0:3000"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health  # 200

# Guarda de contrato de comisiones (el defecto «no se muestra nada» no regresó):
python3 scripts/ci-fix/probe_commission_apis.py
```

## 5. Verificar el aislamiento de Enervida (antes/después de cualquier misión)

La tienda protegida `ENERVIDA-VITALLCONS` no debe recibir escrituras de las
misiones de auditoría. El baseline commiteado refleja el estado al cierre de
la misión 14/10 (7/7 métricas idénticas al informe, §13):

```bash
# Comparar contra el baseline protegido (exit 1 si algo cambió):
python3 scripts/ci-fix/isolation_check.py \
  --baseline scripts/ci-fix/baselines/enervida_post_mision_2026-10-15.json

# Crear un baseline nuevo (tras un estado limpio verificado):
python3 scripts/ci-fix/isolation_check.py \
  --save scripts/ci-fix/baselines/enervida_<motivo>_<fecha>.json
```

Ambos scripts son **solo lectura** (`db.py` rechaza cualquier sentencia que no
sea SELECT/WITH/EXPLAIN/SHOW) y leen `SUPABASE_ACCESS_TOKEN` del `.env`.

## 6. Notas operativas conocidas

- **Build local (`next build`): NO ejecutar en la caja de 4 GB** — OOM del
  kernel (exit 137) verificado 3 veces en la misión 14/10. La autoridad del
  build es CI (workflow `quality` del PR). Para desarrollo local basta
  `pm2 start ecosystem.config.js` (modo dev con `bun server.ts` + Socket.io).
- **Ruta del clon:** `scripts/start.sh` resuelve la ruta del proyecto
  dinámicamente desde su propia ubicación (fix de este PR); antes estaba
  hardcodeada a `/home/z/my-project/Costpro` y fallaba si el clon estaba en
  otro path. No hace falta symlink.
- **PM2 durante `tsc` pesado:** si se necesita correr `tsc --noEmit` con
  `NODE_OPTIONS="--max-old-space-size=4096"`, pausar PM2 antes
  (`pm2 stop costpro`) y reactivarlo después, para no competir por RAM.
- **`/login` devuelve 404 en dev:** la ruta de acceso de la app no es
  `/login`; usar la raíz `/` y el flujo de autenticación de la UI.
