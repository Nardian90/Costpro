# Evidencias históricas reubicadas

Carpeta de `audit-evidence/` que agrupa evidencias visuales y resultados de
ejecuciones de misiones anteriores que estaban dispersas en ubicaciones
incorrectas del repositorio. Se consolidaron aquí el 2026-11-06 durante la
misión de saneamiento estructural. **Las evidencias no se modifican** — solo
se reubicaron con `git mv` para centralizarlas junto al resto de expedientes.

## `tmp-images/`

64 capturas de pantalla (43 MB) generadas por scripts de misión (auditorías de
analytics, recorridos de UI) que vivían en `scripts/tmp-images/` sin ninguna
referencia en código, CI o documentación. Se conservan como evidencia visual;
`git history` conserva su ubicación original.

## `docs-p3/`

Capturas de las pruebas responsive del MVP de la función FC (`fc-320.png` …
`fc-1920.png`, 5.2 MB) que vivían en `docs/p3/` sin referencias. Relacionadas
con los expedientes de `docs/fc-mvp/` y `docs/ux/`.
