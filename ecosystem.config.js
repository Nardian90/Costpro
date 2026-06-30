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
      // Variables de entorno (PM2 cargará también el .env del proyecto)
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      // Logs centralizados por PM2
      out_file: './logs/costpro-out.log',
      error_file: './logs/costpro-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
