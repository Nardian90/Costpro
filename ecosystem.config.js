/**
 * Configuración de PM2 para Costpro (Next.js 16)
 *
 * Mantiene el servidor vivo:
 *  - Se reinicia automáticamente si el proceso cae (crash)
 *  - `treekill: true` mata a TODOS los procesos hijos (next-server, postcss.js)
 *    al reiniciar, evitando el error EADDRINUSE en el puerto 3000
 *  - `restart_delay` da un margen para que el puerto se libere completamente
 *  - Carga el archivo .env con las credenciales de Supabase, AI, etc.
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 status
 *   pm2 logs costpro
 *   pm2 restart costpro
 *   pm2 stop costpro
 *   pm2 delete costpro
 *   pm2 save           # guarda la lista de procesos (para auto-arranque)
 */

// Cargar .env con dotenv para que las variables estén disponibles en el proceso
require('dotenv').config({ path: './.env' });

module.exports = {
  apps: [
    {
      name: 'costpro',
      // Script wrapper que arranca Next.js y limpia hijos al morir
      script: 'scripts/start.sh',
      // Interpreter none => ejecuta el script como binario (bash)
      interpreter: 'none',
      cwd: __dirname,
      // Matar todo el árbol de procesos (hijos incluidos) al reiniciar/detener
      treekill: true,
      // Reinicio automático si el proceso termina
      autorestart: true,
      // Pausa fija antes de reintentar (da tiempo al puerto 3000 a liberarse tras un crash)
      restart_delay: 3000,
      // Estrategia de reinicio exponencial si hay fallos consecutivos
      exp_backoff_restart_delay: 200,
      // Límite de reinicios antes de marcar el proceso como "errored"
      max_restarts: 20,
      // Ventana de tiempo para contar los reinicios (ms)
      restart_time: 60_000,
      // Umbral de uptime mínimo: Next.js tarda varios segundos en arrancar,
      // así que damos margen generoso para no contar arranques lentos como "caída anómala"
      min_uptime: '90s',
      // En desarrollo, vigilar cambios de código no es necesario (Next.js ya lo hace con HMR)
      watch: false,
      // Tiempo de gracia antes de forzar el kill al reiniciar (deja que cleanup() actúe)
      kill_timeout: 5000,
      // Variables de entorno — pasar TODAS las del .env explícitamente
      // para que bun las herede al arrancar server.ts
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
        DATABASE_URL: process.env.DATABASE_URL,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        ENABLE_DEV_BYPASS: process.env.ENABLE_DEV_BYPASS,
        CSRF_ALLOWED_DOMAINS: process.env.CSRF_ALLOWED_DOMAINS,
        ZAI_API_KEY: process.env.ZAI_API_KEY,
        ZAI_BASE_URL: process.env.ZAI_BASE_URL,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        EMERGENCY_GOOGLE_API_KEY: process.env.EMERGENCY_GOOGLE_API_KEY,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
        OTEL_ENABLED: process.env.OTEL_ENABLED,
        SENTRY_DSN: process.env.SENTRY_DSN,
        TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
      },
      // Logs centralizados por PM2
      out_file: './logs/costpro-out.log',
      error_file: './logs/costpro-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
