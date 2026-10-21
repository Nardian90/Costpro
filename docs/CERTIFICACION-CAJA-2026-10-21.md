# Certificación contable — Caja e Ingresos/Egresos (en curso)

> **Rama de respaldo del agente** — se actualiza progresivamente para proteger el
> trabajo ante reinicios del entorno local. Este documento evolucionará hasta
> convertirse en el informe final de certificación de 10 secciones exigido por la
> misión del 20/10/2026.

## Estado de la misión (checklist vivo)

- [ ] F1 — Estado real post-merge verificado (main contiene c08a4038c = merge PR #1435)
- [ ] F2 — Línea base contable de solo lectura recolectada
- [ ] F3 — Semántica de «Fondo Inicial de Efectivo» resuelta (Modelo A/B/C)
- [ ] F4 — Fórmulas de saldo certificadas (autoritativa vs espejos)
- [ ] F5 — Migración 20261021000001 aplicada en producción y verificada
- [ ] F6 — Experiencia completa de usuario verificada
- [ ] F7 — Pruebas contables obligatorias ejecutadas
- [ ] F8 — Controles adicionales verificados
- [ ] Informe final de certificación emitido

## Entorno

- Repo: `Nardian90/Costpro` · main `c08a4038c` (merge PR #1435)
- Servidor local: pm2 `costpro` en `localhost:3000` (ecosystem.config.js)
- Restauración: `bash scripts/local-env/restore_local_env.sh` (idempotente)

## Notas de progreso

(Se irá llenando conforme avance la misión. El informe final sustituirá esta
sección.)
