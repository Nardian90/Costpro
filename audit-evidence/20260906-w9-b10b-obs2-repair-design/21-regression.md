# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 21-regression.md
# Regresión (GATE 22) — vitest · lint · tsc · build · PM2 · HTTP

## Resumen ejecutivo

```text
lint:    PASS — 0 errors (1.291 warnings pre-existentes, 0 introduced por esta fase)
tsc:     PASS — 0 errors (npx tsc --noEmit)
vitest:  PASS — Run C (canónica): 2.029 tests / 0 fail / 24 skipped (96 archivos;
         incluye el nuevo iteration-18-b10b-obs2-repair-design: 24 tests)
build:   PASS — tras mitigación documentada de OOM (ver sección OOM)
PM2:     PASS — 3/3 online (costpro, telegram-cron-poller, whatsapp-cron-poller)
HTTP:    PASS — 200 en / y /api/health
```

## Historia de ejecución (transparencia total)

| Run | Resultado | Nota |
|---|---|---|
| Run A (suite completa) | 2.024 pass / **5 fail** / 24 skipped | los 5 fallos eran DEL propio test nuevo por dependencias aún no creadas: pack incompleto (faltaban 20/21/22), bug de mayúsculas en una expectativa (`'Esta fase NO ejecuta'.toUpperCase()` contra texto en otro caso), y patrón de batch con sufijo `:` no presente aún en el CSV — NINGÚN test pre-existente falló |
| Fix | — | se corrigieron: mapeo de columnas `opening_qty`/`opening_unit_cost` en el generador del 07-proposed-opening.csv (salían vacías), barrera de idempotencia del simulador in-test (chequeo PRE una-vez, no por-fila), patrón de familia del batch (regex), y comparación de texto |
| Run B (suite completa) | 2.028 pass / **1 fail** / 24 skipped | el único fallo restante: `falta 21-regression.md` — dependencia circular (este documento se escribe DESPUÉS de la regresión); 2.028 = 2.024 previos + 24 del nuevo test − 19 compartidos… (conteo estable: +4 tests netos por refinamiento) |
| **Run C (canónica)** | **2.029 pass / 0 fail / 24 skipped** | todos los documentos del pack presentes; SHA de evidencia congelada verificado por el test; registro final |

Detalle Run C (vitest run): Test Files 95 passed / 1 skipped (96) ·
Tests 2.029 passed / 24 skipped (2.053) · duración ≈ 210 s.

## OOM en build — DOCUMENTADO (mandato: no ocultar)

```text
Proceso:    next build (paso «Running TypeScript» post-compilación)
RAM host:   total 4.041 MB · used 1.214 MB · available 2.827 MB (al inicio del comando)
Comando:    NODE_OPTIONS="--max-old-space-size=4096" npx next build
Resultado:  ✗ Killed (OOM-kill del SO durante «Running TypeScript»; compilación y
            runAfterProductionCompile SÍ habían terminado OK)
Causa:      heap objetivo (4.096 MB) ≥ memoria disponible del sandbox (4 GB) → el
            proceso TypeScript creció hasta agotarla
Mitigación: NODE_OPTIONS="--max-old-space-size=2048" npx next build
Resultado:  ✓ PASS — Compiled successfully (49 s) · runAfterProductionCompile OK (864 ms)
            · TypeScript OK · páginas generadas · exit 0 (leyenda ○/ƒ normal)
Nota:       PM2 no fue detenido durante el build; mitigación solo por heap cap.
```

## PM2 y HTTP (GATE 22)

```text
pm2 list:  costpro online (429,6 MB) · telegram-cron-poller online · whatsapp-cron-poller online
HTTP /:            200
HTTP /api/health:  200
logs/costpro-error.log: solo aviso pre-existente de dev (allowedDevOrigins, 17:54Z,
                   anterior al inicio de esta fase); 0 errores nuevos
```

## Nota sobre el test permanente añadido

`iteration-18-b10b-obs2-repair-design.test.ts` (24 tests) corre en la suite regular y
NO se conecta a la DB. Si alguien edita un artefacto congelado del pack (CSVs, JSON de
universo/simulación) o altera la matemática del diseño, la suite queda en ROJO — ese es
su propósito (blindar el paquete que la firma humana aprobará).
